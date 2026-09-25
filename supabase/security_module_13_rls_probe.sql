-- Security module 13: non-persistent RLS integration probe.
-- Every write probe is rolled back inside a PostgreSQL subtransaction.

BEGIN;

CREATE OR REPLACE FUNCTION public.run_rls_security_probe(target_region TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  normalized_region TEXT := BTRIM(COALESCE(target_region, ''));
  probe_id TEXT := 'RLS-PROBE-' || REPLACE(gen_random_uuid()::TEXT, '-', '');
  insert_allowed BOOLEAN := FALSE;
  insert_error_code TEXT;
  insert_error_message TEXT;
  visible_distributor_count BIGINT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF normalized_region NOT IN ('Miền Bắc', 'Miền Trung', 'Miền Nam') THEN
    RAISE EXCEPTION 'INVALID_REGION' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO visible_distributor_count
  FROM public.distributors;

  BEGIN
    INSERT INTO public.distributors (id, name, phone, brand, region, status)
    VALUES (probe_id, 'RLS Security Probe', '', 'Nasun', normalized_region, 'Đang hợp tác');

    RAISE EXCEPTION 'RLS_PROBE_ROLLBACK' USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      insert_allowed := TRUE;
    WHEN OTHERS THEN
      insert_allowed := FALSE;
      GET STACKED DIAGNOSTICS
        insert_error_code = RETURNED_SQLSTATE,
        insert_error_message = MESSAGE_TEXT;
  END;

  RETURN jsonb_build_object(
    'user_id', auth.uid(),
    'effective_role', public.get_my_role(),
    'managed_region', public.get_my_region(),
    'target_region', normalized_region,
    'visible_distributor_count', visible_distributor_count,
    'can_insert_target_region', insert_allowed,
    'insert_error_code', insert_error_code,
    'insert_error_message', insert_error_message
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_rls_security_probe(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_rls_security_probe(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.run_rls_security_probe(TEXT) TO authenticated;

COMMIT;
