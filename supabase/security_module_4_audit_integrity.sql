-- Security module 4: protect audit-log identity and timestamp integrity.
-- Existing audit rows are preserved. This migration changes policies/functions only.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_audit_log(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_role TEXT := public.get_my_role();
  audit_id TEXT;
  audit_type TEXT := NULLIF(BTRIM(p_payload->>'type'), '');
  audit_timestamp TIMESTAMPTZ := NOW();
  audit_severity TEXT := 'INFO';
  inserted_row public.audit_logs%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF caller_role NOT IN ('admin', 'qc') THEN RAISE EXCEPTION 'FORBIDDEN_AUDIT_WRITE'; END IF;
  IF audit_type IS NULL OR LENGTH(audit_type) > 160 THEN RAISE EXCEPTION 'INVALID_AUDIT_TYPE'; END IF;

  audit_id := CASE
    WHEN COALESCE(p_payload->>'id', '') ~ '^AUDIT-[A-Za-z0-9._:-]{1,100}$' THEN p_payload->>'id'
    ELSE 'AUDIT-' || REPLACE(gen_random_uuid()::TEXT, '-', '')
  END;

  IF caller_role = 'admin' AND COALESCE(p_payload->>'timestamp', '') <> '' THEN
    BEGIN
      audit_timestamp := (p_payload->>'timestamp')::TIMESTAMPTZ;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'INVALID_AUDIT_TIMESTAMP';
    END;
  END IF;

  IF caller_role = 'admin' AND UPPER(COALESCE(p_payload->>'severity', '')) IN ('INFO', 'WARNING', 'CRITICAL') THEN
    audit_severity := UPPER(p_payload->>'severity');
  ELSIF audit_type LIKE 'SECURITY:%' OR UPPER(audit_type) LIKE '%THU HỒI%' THEN
    audit_severity := 'WARNING';
  END IF;

  INSERT INTO public.audit_logs (
    id, type, timestamp, set_code, npp_id, npp_name, serial_list,
    technician, reason, notes, user_id, target_id, severity
  ) VALUES (
    audit_id, audit_type, audit_timestamp,
    LEFT(COALESCE(p_payload->>'set_code', '—'), 120),
    LEFT(COALESCE(p_payload->>'npp_id', '—'), 120),
    LEFT(COALESCE(p_payload->>'npp_name', ''), 240),
    LEFT(COALESCE(p_payload->>'serial_list', ''), 1000),
    LEFT(COALESCE(p_payload->>'technician', ''), 240),
    LEFT(COALESCE(p_payload->>'reason', ''), 1000),
    LEFT(COALESCE(p_payload->>'notes', ''), 4000),
    caller_id,
    LEFT(NULLIF(p_payload->>'target_id', ''), 160),
    audit_severity
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO inserted_row;

  IF inserted_row.id IS NULL THEN
    SELECT * INTO inserted_row FROM public.audit_logs WHERE id = audit_id AND user_id = caller_id;
  END IF;
  IF inserted_row.id IS NULL THEN RAISE EXCEPTION 'AUDIT_ID_CONFLICT'; END IF;
  RETURN to_jsonb(inserted_row);
END;
$$;

REVOKE ALL ON FUNCTION public.create_audit_log(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_audit_log(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_audit_log(JSONB) TO authenticated;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_insert_auth" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_insert_staff_identity" ON public.audit_logs;

COMMIT;
