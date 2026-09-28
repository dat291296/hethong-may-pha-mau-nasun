-- SYNC-SEC-4: per-entity versions and optimistic conflict detection.
-- Existing business rows are not changed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sync_entity_versions (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (entity_type, entity_id)
);

ALTER TABLE public.sync_entity_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sync_entity_versions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sync_entity_versions FROM authenticated;
GRANT SELECT ON TABLE public.sync_entity_versions TO authenticated;

DROP POLICY IF EXISTS sync_entity_versions_visible_entities ON public.sync_entity_versions;
CREATE POLICY sync_entity_versions_visible_entities
  ON public.sync_entity_versions FOR SELECT TO authenticated
  USING (
    updated_by = auth.uid()
    OR (entity_type = 'distributors' AND EXISTS (SELECT 1 FROM public.distributors row_item WHERE row_item.id = entity_id))
    OR (entity_type = 'system_sets' AND EXISTS (SELECT 1 FROM public.system_sets row_item WHERE row_item.set_code = entity_id))
    OR (entity_type = 'dispensers' AND EXISTS (SELECT 1 FROM public.dispensers row_item WHERE row_item.id = entity_id))
    OR (entity_type = 'mixers' AND EXISTS (SELECT 1 FROM public.mixers row_item WHERE row_item.id = entity_id))
    OR (entity_type = 'computers' AND EXISTS (SELECT 1 FROM public.computers row_item WHERE row_item.id = entity_id))
    OR (entity_type = 'printers' AND EXISTS (SELECT 1 FROM public.printers row_item WHERE row_item.id = entity_id))
    OR (entity_type = 'repair_tickets' AND EXISTS (SELECT 1 FROM public.repair_tickets row_item WHERE row_item.id = entity_id))
    OR (entity_type = 'audit_logs' AND EXISTS (SELECT 1 FROM public.audit_logs row_item WHERE row_item.id = entity_id))
  );

CREATE OR REPLACE FUNCTION public.bump_sync_entity_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_data JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  entity_id_value TEXT := NULLIF(BTRIM(COALESCE(row_data->>TG_ARGV[0], '')), '');
BEGIN
  IF entity_id_value IS NULL THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  INSERT INTO public.sync_entity_versions (entity_type, entity_id, version, updated_by)
  VALUES (TG_TABLE_NAME, entity_id_value, 1, auth.uid())
  ON CONFLICT (entity_type, entity_id) DO UPDATE
  SET version = public.sync_entity_versions.version + 1,
      updated_at = NOW(), updated_by = auth.uid();
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_sync_entity_version() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  target RECORD;
  trigger_name TEXT;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('distributors', 'id'), ('system_sets', 'set_code'),
      ('dispensers', 'id'), ('mixers', 'id'), ('computers', 'id'), ('printers', 'id'),
      ('repair_tickets', 'id'), ('audit_logs', 'id')
    ) AS configured(table_name, primary_key)
  LOOP
    IF to_regclass('public.' || target.table_name) IS NULL THEN CONTINUE; END IF;
    trigger_name := 'trg_sync_version_' || target.table_name;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, target.table_name);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_sync_entity_version(%L)',
      trigger_name, target.table_name, target.primary_key
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_sync_base_version(p_envelope JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  entity_type_value TEXT := NULLIF(BTRIM(COALESCE(p_envelope->>'entityType', '')), '');
  entity_id_value TEXT := NULLIF(BTRIM(COALESCE(p_envelope->>'entityId', '')), '');
  expected_version BIGINT := NULLIF(p_envelope->>'baseVersion', '')::BIGINT;
  current_version BIGINT := 0;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF entity_type_value IS NULL OR entity_id_value IS NULL THEN RETURN 0; END IF;
  IF entity_type_value NOT IN ('distributors','system_sets','dispensers','mixers','computers','printers','repair_tickets','audit_logs') THEN
    RAISE EXCEPTION 'INVALID_VERSION_ENTITY';
  END IF;
  SELECT version INTO current_version FROM public.sync_entity_versions
  WHERE entity_type = entity_type_value AND entity_id = entity_id_value;
  current_version := COALESCE(current_version, 0);
  IF expected_version IS NOT NULL AND expected_version <> current_version THEN
    RAISE EXCEPTION 'SYNC_CONFLICT expected %, current %', expected_version, current_version USING ERRCODE = 'P0001';
  END IF;
  RETURN current_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_sync_entity_version(p_entity_type TEXT, p_entity_id TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result_version BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  SELECT version INTO result_version FROM public.sync_entity_versions
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id;
  RETURN COALESCE(result_version, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_sync_operation_v2(p_envelope JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  operation_key TEXT := BTRIM(COALESCE(p_envelope->>'operationId', ''));
  entity_type_value TEXT := NULLIF(BTRIM(COALESCE(p_envelope->>'entityType', '')), '');
  entity_id_value TEXT := NULLIF(BTRIM(COALESCE(p_envelope->>'entityId', '')), '');
  existing_result JSONB;
  result_value JSONB;
  current_version BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  SELECT result INTO existing_result FROM public.sync_operations
  WHERE operation_id = operation_key AND user_id = auth.uid() AND status = 'applied';
  IF FOUND THEN
    current_version := public.read_sync_entity_version(entity_type_value, entity_id_value);
    RETURN COALESCE(existing_result, '{}'::JSONB) || jsonb_build_object('currentVersion', current_version, 'idempotent', TRUE);
  END IF;

  PERFORM public.assert_sync_base_version(p_envelope);
  result_value := public.execute_sync_operation(p_envelope);
  current_version := public.read_sync_entity_version(entity_type_value, entity_id_value);
  RETURN COALESCE(result_value, '{}'::JSONB) || jsonb_build_object('currentVersion', current_version);
END;
$$;

REVOKE ALL ON FUNCTION public.assert_sync_base_version(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.read_sync_entity_version(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.execute_sync_operation_v2(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_sync_base_version(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_sync_entity_version(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_sync_operation_v2(JSONB) TO authenticated;

COMMIT;
