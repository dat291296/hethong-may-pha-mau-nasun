CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS qr_token text;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS npp_code text;


DO $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  token text;
  row_id text;
BEGIN
  FOR row_id IN SELECT id FROM public.distributors WHERE qr_token IS NULL LOOP
    LOOP
      SELECT string_agg(substr(alphabet, (get_byte(extensions.gen_random_bytes(10), position - 1) & 31) + 1, 1), '')
        INTO token
        FROM generate_series(1, 10) AS sequence(position);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.distributors WHERE qr_token = token);
    END LOOP;
    UPDATE public.distributors SET qr_token = token WHERE id = row_id;
  END LOOP;
END $$;

ALTER TABLE public.distributors ALTER COLUMN qr_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS distributors_qr_token_uidx ON public.distributors (qr_token);
CREATE INDEX IF NOT EXISTS idx_distributors_created_at ON public.distributors (created_at DESC);

CREATE OR REPLACE FUNCTION public.reissue_distributor_qr_token(p_distributor_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor_role text;
  actor_region text;
  target public.distributors%ROWTYPE;
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  new_token text;
BEGIN
  SELECT role, managed_region INTO actor_role, actor_region
  FROM public.profiles
  WHERE id = auth.uid() AND is_active IS TRUE AND public.has_active_app_session();
  IF COALESCE(actor_role, '') NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'QR_REISSUE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.distributors WHERE id = p_distributor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISTRIBUTOR_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF actor_role <> 'admin' AND actor_region IS DISTINCT FROM target.region THEN
    RAISE EXCEPTION 'QR_REISSUE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  LOOP
    SELECT string_agg(substr(alphabet, (get_byte(extensions.gen_random_bytes(10), position - 1) & 31) + 1, 1), '')
      INTO new_token
      FROM generate_series(1, 10) AS sequence(position);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.distributors WHERE qr_token = new_token);
  END LOOP;
  UPDATE public.distributors SET qr_token = new_token WHERE id = p_distributor_id;
  INSERT INTO public.audit_logs(id, type, npp_id, npp_name, notes, user_id, target_id, severity)
  VALUES ('AUDIT-QR-' || REPLACE(gen_random_uuid()::text, '-', ''), 'CẤP LẠI MÃ QR',
    COALESCE(target.npp_code, target.id), target.name,
    'Mã QR đã được cấp lại; mã trước đó hết hiệu lực.', auth.uid(), target.id, 'INFO');
  RETURN new_token;
END;
$$;

REVOKE ALL ON FUNCTION public.reissue_distributor_qr_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reissue_distributor_qr_token(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_qr_audit(
  p_action text,
  p_npp_code text DEFAULT NULL,
  p_npp_codes text[] DEFAULT NULL,
  p_code_kind text DEFAULT NULL,
  p_result text DEFAULT NULL,
  p_count integer DEFAULT NULL,
  p_paper text DEFAULT NULL,
  p_event_id text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor_role text;
  actor_region text;
  npp_region text;
  npp_row public.distributors%ROWTYPE;
  requested_code text;
  audit_id text;
  safe_result text := p_result;
  safe_code text := NULL;
BEGIN
  audit_id := CASE WHEN COALESCE(p_event_id, '') ~ '^AUDIT-QR-[A-Fa-f0-9-]{36}$'
    THEN p_event_id ELSE 'AUDIT-QR-' || replace(gen_random_uuid()::text, '-', '') END;
  SELECT role, managed_region INTO actor_role, actor_region
  FROM public.profiles WHERE id = auth.uid() AND is_active IS TRUE AND public.has_active_app_session();
  IF COALESCE(actor_role, '') NOT IN ('admin', 'manager', 'technician') THEN
    RAISE EXCEPTION 'QR_AUDIT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'print' THEN
    IF actor_role NOT IN ('admin', 'manager') OR COALESCE(p_paper, '') NOT IN ('a8', 'a4')
      OR p_count IS NULL OR p_count < 1 OR p_count > 500
      OR COALESCE(cardinality(p_npp_codes), 0) < 1 OR cardinality(p_npp_codes) > 500 THEN
      RAISE EXCEPTION 'QR_PRINT_AUDIT_INVALID' USING ERRCODE = '42501';
    END IF;
    FOREACH requested_code IN ARRAY p_npp_codes LOOP
      SELECT region INTO npp_region FROM public.distributors
      WHERE id = requested_code OR npp_code = requested_code LIMIT 1;
      IF NOT FOUND OR (actor_role <> 'admin' AND actor_region IS DISTINCT FROM npp_region) THEN
        RAISE EXCEPTION 'QR_PRINT_SCOPE_DENIED' USING ERRCODE = '42501';
      END IF;
    END LOOP;
    INSERT INTO public.audit_logs(id, type, npp_id, npp_name, notes, user_id, severity)
    VALUES (audit_id, 'IN TEM QR', '—', 'Đã in ' || p_count || ' tem QR',
      'Khổ ' || upper(p_paper) || '; số tem ' || p_count || '; NPP: ' || array_to_string(p_npp_codes, ', '),
      auth.uid(), 'INFO') ON CONFLICT (id) DO NOTHING;
    RETURN audit_id;
  END IF;
  IF COALESCE(p_action, '') <> 'scan' OR COALESCE(p_code_kind, '') NOT IN ('token', 'npp', 'set', 'device')
    OR COALESCE(p_result, '') NOT IN ('found', 'not_found', 'denied') THEN
    RAISE EXCEPTION 'QR_SCAN_AUDIT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_npp_code IS NOT NULL THEN
    SELECT * INTO npp_row FROM public.distributors
    WHERE id = p_npp_code OR npp_code = p_npp_code LIMIT 1;
    IF FOUND THEN
      IF actor_role <> 'admin' AND actor_region IS DISTINCT FROM npp_row.region THEN
        safe_result := 'denied';
      ELSE
        safe_code := COALESCE(npp_row.npp_code, npp_row.id);
      END IF;
    ELSE
      safe_result := 'not_found';
    END IF;
  END IF;
  INSERT INTO public.audit_logs(id, type, npp_id, notes, user_id, target_id, severity)
  VALUES (audit_id, CASE WHEN safe_result = 'denied' THEN 'TRA CỨU QR BỊ TỪ CHỐI' ELSE 'TRA CỨU QR' END,
    COALESCE(safe_code, '—'), 'Loại mã: ' || p_code_kind || '; kết quả: ' || safe_result,
    auth.uid(), safe_code, CASE WHEN safe_result = 'denied' THEN 'WARNING' ELSE 'INFO' END) ON CONFLICT (id) DO NOTHING;
  RETURN audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_qr_audit(text, text, text[], text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_qr_audit(text, text, text[], text, text, integer, text, text) TO authenticated;
