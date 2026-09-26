-- SYNC-SEC-2: atomic, idempotent offline mutations.
-- Run after sync_sec_module_1_foundation.sql. Existing business rows are preserved.

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_sync_row_mutation(
  p_table REGCLASS,
  p_primary_key TEXT,
  p_mode TEXT,
  p_payload JSONB,
  p_target_id TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  column_list TEXT;
  value_list TEXT;
  update_list TEXT;
  statement TEXT;
  affected BIGINT := 0;
BEGIN
  IF p_table::TEXT NOT IN (
    'distributors', 'dispensers', 'mixers', 'computers', 'printers',
    'system_sets', 'repair_tickets'
  ) THEN RAISE EXCEPTION 'SYNC_TABLE_NOT_ALLOWED'; END IF;
  IF p_primary_key NOT IN ('id', 'set_code') THEN RAISE EXCEPTION 'SYNC_PRIMARY_KEY_NOT_ALLOWED'; END IF;
  IF p_mode NOT IN ('UPSERT', 'UPDATE', 'DELETE') THEN RAISE EXCEPTION 'SYNC_MODE_NOT_ALLOWED'; END IF;
  IF p_mode <> 'DELETE' AND jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_SYNC_PAYLOAD';
  END IF;

  IF p_mode = 'DELETE' THEN
    statement := format('DELETE FROM %s WHERE %I = $1', p_table, p_primary_key);
    EXECUTE statement USING p_target_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
  END IF;

  SELECT
    string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum),
    string_agg(format('(jsonb_populate_record(NULL::%s, $1)).%I', p_table, attribute.attname), ', ' ORDER BY attribute.attnum),
    string_agg(
      CASE WHEN attribute.attname <> p_primary_key
        THEN format('%I = EXCLUDED.%I', attribute.attname, attribute.attname)
      END,
      ', ' ORDER BY attribute.attnum
    ) FILTER (WHERE attribute.attname <> p_primary_key)
  INTO column_list, value_list, update_list
  FROM pg_attribute attribute
  WHERE attribute.attrelid = p_table
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND p_payload ? attribute.attname
    AND attribute.attname NOT IN ('created_at', 'updated_at');

  IF column_list IS NULL THEN RAISE EXCEPTION 'SYNC_PAYLOAD_HAS_NO_VALID_COLUMNS'; END IF;

  IF p_mode = 'UPSERT' THEN
    IF NOT (p_payload ? p_primary_key) THEN RAISE EXCEPTION 'SYNC_PRIMARY_KEY_REQUIRED'; END IF;
    statement := format(
      'INSERT INTO %s (%s) SELECT %s ON CONFLICT (%I) DO %s',
      p_table, column_list, value_list, p_primary_key,
      CASE WHEN update_list IS NULL THEN 'NOTHING' ELSE 'UPDATE SET ' || update_list END
    );
    EXECUTE statement USING p_payload;
  ELSE
    IF NULLIF(BTRIM(COALESCE(p_target_id, '')), '') IS NULL THEN RAISE EXCEPTION 'SYNC_TARGET_REQUIRED'; END IF;
    SELECT string_agg(
      format('%I = (jsonb_populate_record(NULL::%s, $1)).%I', attribute.attname, p_table, attribute.attname),
      ', ' ORDER BY attribute.attnum
    ) INTO update_list
    FROM pg_attribute attribute
    WHERE attribute.attrelid = p_table
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND p_payload ? attribute.attname
      AND attribute.attname NOT IN (p_primary_key, 'created_at', 'updated_at');
    IF update_list IS NULL THEN RETURN 0; END IF;
    statement := format('UPDATE %s SET %s WHERE %I = $2', p_table, update_list, p_primary_key);
    EXECUTE statement USING p_payload, p_target_id;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_sync_operation(
  p_operation_id TEXT,
  p_result JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  clean_result JSONB := COALESCE(p_result, '{}'::JSONB) - 'password' - 'token' - 'secret' - 'authorization';
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF octet_length(clean_result::TEXT) > 16000 THEN RAISE EXCEPTION 'SYNC_RESULT_TOO_LARGE'; END IF;
  UPDATE public.sync_operations
  SET status = 'applied', result = clean_result, error_code = NULL,
      updated_at = NOW(), applied_at = NOW()
  WHERE operation_id = p_operation_id AND user_id = caller_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYNC_OPERATION_NOT_OWNED'; END IF;
  RETURN clean_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_sync_operation(p_envelope JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  operation_key TEXT := BTRIM(COALESCE(p_envelope->>'operationId', ''));
  action_name TEXT := UPPER(BTRIM(COALESCE(p_envelope->>'action', '')));
  entity_name TEXT := BTRIM(COALESCE(p_envelope->>'entityType', ''));
  entity_key TEXT := NULLIF(BTRIM(COALESCE(p_envelope->>'entityId', '')), '');
  payload JSONB := COALESCE(p_envelope->'payload', '{}'::JSONB);
  target_table REGCLASS;
  primary_key TEXT := 'id';
  mutation_mode TEXT;
  existing_status TEXT;
  existing_result JSONB;
  affected BIGINT := 0;
  final_result JSONB;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF action_name = 'EXECUTE_WORKFLOW' THEN RAISE EXCEPTION 'WORKFLOW_USES_DEDICATED_RPC'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(operation_key, 0));
  PERFORM public.register_sync_operation(p_envelope);
  SELECT status, result INTO existing_status, existing_result
  FROM public.sync_operations
  WHERE operation_id = operation_key AND user_id = caller_id;
  IF existing_status = 'applied' THEN
    RETURN COALESCE(existing_result, jsonb_build_object('ok', TRUE, 'idempotent', TRUE));
  END IF;

  IF action_name IN ('ADD_AUDIT_LOG', 'UPDATE_AUDIT_LOG', 'DELETE_AUDIT_LOG') THEN
    IF action_name = 'ADD_AUDIT_LOG' THEN
      PERFORM public.create_audit_log(payload);
      affected := 1;
    END IF;
    final_result := jsonb_build_object(
      'ok', TRUE, 'operationId', operation_key, 'affected', affected,
      'immutableAuditNoop', action_name <> 'ADD_AUDIT_LOG'
    );
    RETURN public.complete_sync_operation(operation_key, final_result);
  END IF;

  IF action_name LIKE '%_DEVICE' OR action_name = 'LINK_DEVICE' THEN
    IF entity_name NOT IN ('dispensers', 'mixers', 'computers', 'printers') THEN
      RAISE EXCEPTION 'INVALID_DEVICE_ENTITY';
    END IF;
    target_table := to_regclass('public.' || entity_name);
  ELSIF action_name IN ('ADD_NPP', 'EDIT_NPP', 'DELETE_NPP') THEN
    target_table := 'public.distributors'::REGCLASS;
  ELSIF action_name IN ('ASSEMBLE_SET', 'UPDATE_SYSTEM_SET', 'DELETE_SYSTEM_SET') THEN
    target_table := 'public.system_sets'::REGCLASS;
    primary_key := 'set_code';
  ELSIF action_name IN ('ADD_REPAIR', 'EDIT_REPAIR', 'DELETE_REPAIR') THEN
    target_table := 'public.repair_tickets'::REGCLASS;
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_ATOMIC_SYNC_ACTION';
  END IF;

  mutation_mode := CASE
    WHEN action_name IN ('ADD_NPP', 'ADD_DEVICE', 'ASSEMBLE_SET', 'ADD_REPAIR') THEN 'UPSERT'
    WHEN action_name LIKE 'DELETE_%' THEN 'DELETE'
    ELSE 'UPDATE'
  END;
  affected := public.apply_sync_row_mutation(target_table, primary_key, mutation_mode, payload, entity_key);
  IF mutation_mode = 'UPDATE' AND affected = 0 THEN RAISE EXCEPTION 'SYNC_TARGET_NOT_FOUND'; END IF;

  final_result := jsonb_build_object(
    'ok', TRUE, 'operationId', operation_key, 'action', action_name,
    'entityType', entity_name, 'entityId', entity_key, 'affected', affected,
    'completedAt', NOW()
  );
  RETURN public.complete_sync_operation(operation_key, final_result);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_sync_row_mutation(REGCLASS, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_sync_operation(TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.execute_sync_operation(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_sync_row_mutation(REGCLASS, TEXT, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sync_operation(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_sync_operation(JSONB) TO authenticated;

COMMIT;
