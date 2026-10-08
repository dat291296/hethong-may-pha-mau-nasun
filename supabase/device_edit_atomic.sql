-- Additive only: no existing business rows are updated or deleted by installation.
BEGIN;
ALTER TABLE public.computers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Đang chạy tốt';

CREATE OR REPLACE FUNCTION public.edit_device_atomic(
  p_table TEXT, p_id TEXT, p_updates JSONB, p_expected_updated_at TIMESTAMPTZ
) RETURNS SETOF JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  allowed TEXT[];
  fields TEXT;
  original JSONB;
  revised JSONB;
  linked public.system_sets%ROWTYPE;
  old_code TEXT;
  new_code TEXT;
  prefix TEXT;
  set_payload JSONB;
  affected INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  allowed := CASE p_table
    WHEN 'dispensers' THEN ARRAY['serial','model','status','is_assigned','set_code']
    WHEN 'mixers' THEN ARRAY['serial','model','type','status','is_assigned','set_code']
    WHEN 'computers' THEN ARRAY['serial','type','os','specs','network','stabilizer','status','is_assigned','set_code']
    WHEN 'printers' THEN ARRAY['serial','model','connection','status','is_assigned','set_code'] END;
  IF allowed IS NULL OR jsonb_typeof(p_updates) IS DISTINCT FROM 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_updates) key WHERE NOT key = ANY(allowed))
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'INVALID_DEVICE_EDIT' USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id = $1 FOR UPDATE', p_table)
    INTO original USING p_id;
  IF original IS NULL OR (original->>'updated_at')::TIMESTAMPTZ <> p_expected_updated_at THEN
    RAISE EXCEPTION 'WRITE_CONFLICT: tải lại thiết bị trước khi lưu' USING ERRCODE = '40001';
  END IF;
  revised := original || p_updates;
  old_code := original->>'set_code';
  new_code := NULLIF(revised->>'set_code', '');
  IF COALESCE((revised->>'is_assigned')::BOOLEAN, FALSE) <> (new_code IS NOT NULL) THEN
    RAISE EXCEPTION 'INVALID_DEVICE_ASSIGNMENT' USING ERRCODE = '22023';
  END IF;
  prefix := CASE p_table WHEN 'dispensers' THEN 'dispenser' WHEN 'mixers' THEN 'mixer'
    WHEN 'computers' THEN 'computer' ELSE 'printer' END;
  -- Lock sets in a stable order; RLS remains authoritative for every write.
  FOR linked IN SELECT * FROM public.system_sets WHERE set_code IN (old_code, new_code)
    ORDER BY set_code FOR UPDATE LOOP
    IF linked.set_code = new_code AND NULLIF(to_jsonb(linked)->>(prefix || '_id'), '') IS NOT NULL
      AND to_jsonb(linked)->>(prefix || '_id') <> p_id THEN
      RAISE EXCEPTION 'DEVICE_SLOT_OCCUPIED: bộ máy đã có thiết bị loại này' USING ERRCODE = '23505';
    END IF;
  END LOOP;
  SELECT string_agg(format('%I = (jsonb_populate_record(NULL::public.%I, $1)).%I', key, p_table, key), ', ')
    INTO fields FROM jsonb_object_keys(p_updates) key;
  IF fields IS NULL THEN RAISE EXCEPTION 'EMPTY_DEVICE_EDIT' USING ERRCODE = '22023'; END IF;
  EXECUTE format('UPDATE public.%I SET %s, updated_at = clock_timestamp() WHERE id = $2 RETURNING to_jsonb(%I.*)', p_table, fields, p_table)
    INTO revised USING p_updates, p_id;
  IF revised IS NULL THEN RAISE EXCEPTION 'DEVICE_WRITE_DENIED' USING ERRCODE = '42501'; END IF;
  IF old_code IS NOT NULL AND old_code IS DISTINCT FROM new_code THEN
    set_payload := jsonb_build_object(prefix || '_id', NULL, prefix || '_serial', '');
    IF prefix IN ('dispenser','mixer') THEN set_payload := set_payload || jsonb_build_object(prefix || '_model', ''); END IF;
    IF prefix = 'computer' THEN set_payload := set_payload || jsonb_build_object('computer_type', ''); END IF;
    SELECT string_agg(format('%I = (jsonb_populate_record(NULL::public.system_sets, $1)).%I', key, key), ', ')
      INTO fields FROM jsonb_object_keys(set_payload) key;
    EXECUTE format('UPDATE public.system_sets SET %s, updated_at = clock_timestamp() WHERE set_code = $2 AND %I = $3', fields, prefix || '_id')
      USING set_payload, old_code, p_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'OLD_SET_WRITE_DENIED' USING ERRCODE = '42501'; END IF;
  END IF;
  IF new_code IS NOT NULL THEN
    set_payload := jsonb_build_object(prefix || '_id', p_id, prefix || '_serial', revised->>'serial');
    IF prefix IN ('dispenser','mixer') THEN set_payload := set_payload || jsonb_build_object(prefix || '_model', revised->>'model'); END IF;
    IF prefix = 'computer' THEN set_payload := set_payload || jsonb_build_object('computer_type', revised->>'type'); END IF;
    SELECT string_agg(format('%I = (jsonb_populate_record(NULL::public.system_sets, $1)).%I', key, key), ', ')
      INTO fields FROM jsonb_object_keys(set_payload) key;
    EXECUTE format('UPDATE public.system_sets SET %s, updated_at = clock_timestamp() WHERE set_code = $2', fields)
      USING set_payload, new_code;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'NEW_SET_WRITE_DENIED' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN NEXT jsonb_build_object('id', p_id, 'updated_at', revised->>'updated_at');
END;
$$;
REVOKE ALL ON FUNCTION public.edit_device_atomic(TEXT,TEXT,JSONB,TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_device_atomic(TEXT,TEXT,JSONB,TIMESTAMPTZ) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
