-- Module 2: atomic and idempotent equipment workflows.
BEGIN;

CREATE TABLE IF NOT EXISTS public.sync_operations (
  operation_id TEXT PRIMARY KEY,
  workflow TEXT NOT NULL CHECK (workflow IN ('INSTALL', 'WITHDRAW', 'TRANSFER')),
  entity_id TEXT NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sync_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sync_operations_select_own" ON public.sync_operations;
CREATE POLICY "sync_operations_select_own"
  ON public.sync_operations FOR SELECT
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin');
DROP POLICY IF EXISTS "sync_operations_insert_own" ON public.sync_operations;
CREATE POLICY "sync_operations_insert_own"
  ON public.sync_operations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.get_my_role() IN ('admin', 'qc'));

CREATE OR REPLACE FUNCTION public.execute_equipment_workflow(
  p_operation_id TEXT,
  p_workflow TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existing JSONB;
  v_result JSONB;
  v_set public.system_sets%ROWTYPE;
  v_target_npp public.distributors%ROWTYPE;
  v_source_npp_id TEXT;
  v_set_code TEXT := NULLIF(BTRIM(p_payload->>'setCode'), '');
  v_target_npp_id TEXT := NULLIF(BTRIM(COALESCE(p_payload->>'nppId', p_payload->>'newNppId')), '');
  v_warehouse_region TEXT := COALESCE(NULLIF(BTRIM(p_payload->>'warehouseRegion'), ''), 'Miền Bắc');
  v_is_closure BOOLEAN := COALESCE((p_payload->>'isDistributorClosure')::BOOLEAN, FALSE);
  v_audit_id TEXT := 'AUDIT-' || p_operation_id;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF public.get_my_role() NOT IN ('admin', 'qc') THEN
    RAISE EXCEPTION 'FORBIDDEN_WORKFLOW';
  END IF;
  IF p_operation_id IS NULL OR BTRIM(p_operation_id) = '' OR v_set_code IS NULL THEN
    RAISE EXCEPTION 'INVALID_WORKFLOW_PAYLOAD';
  END IF;
  IF p_workflow NOT IN ('INSTALL', 'WITHDRAW', 'TRANSFER') THEN
    RAISE EXCEPTION 'INVALID_WORKFLOW_TYPE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id, 0));
  SELECT result INTO v_existing
  FROM public.sync_operations
  WHERE operation_id = p_operation_id;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_set
  FROM public.system_sets
  WHERE set_code = v_set_code
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SYSTEM_SET_NOT_FOUND: %', v_set_code;
  END IF;
  v_source_npp_id := v_set.npp_id;

  IF p_workflow IN ('INSTALL', 'TRANSFER') THEN
    IF v_target_npp_id IS NULL THEN RAISE EXCEPTION 'TARGET_NPP_REQUIRED'; END IF;
    SELECT * INTO v_target_npp
    FROM public.distributors
    WHERE id = v_target_npp_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NPP_NOT_FOUND: %', v_target_npp_id; END IF;
    IF v_target_npp.status <> 'Đang hợp tác' THEN RAISE EXCEPTION 'TARGET_NPP_INACTIVE: %', v_target_npp_id; END IF;

    UPDATE public.system_sets
    SET npp_id = v_target_npp.id,
        npp_name = v_target_npp.name,
        region = v_target_npp.region,
        province = v_target_npp.province,
        status = 'DA_LAP_DAT',
        agent_status = CASE WHEN p_workflow = 'INSTALL' THEN 'Online' ELSE agent_status END,
        install_date = CASE WHEN p_workflow = 'INSTALL' THEN NULLIF(p_payload->>'installedDate', '')::DATE ELSE install_date END,
        last_maintenance_date = CASE WHEN p_workflow = 'INSTALL' THEN NULLIF(p_payload->>'installedDate', '')::DATE ELSE last_maintenance_date END,
        next_maintenance_due = CASE WHEN p_workflow = 'INSTALL' THEN NULLIF(p_payload->>'nextMaintenanceDue', '')::DATE ELSE next_maintenance_due END,
        stabilizer = CASE WHEN p_workflow = 'INSTALL' THEN COALESCE(p_payload->>'stabilizer', stabilizer) ELSE stabilizer END,
        technician = COALESCE(NULLIF(p_payload->>'technician', ''), technician),
        installation_photos = CASE WHEN p_workflow = 'INSTALL' THEN COALESCE(p_payload->'photos', '[]'::JSONB) ELSE installation_photos END
    WHERE set_code = v_set_code;

    IF p_workflow = 'INSTALL' AND jsonb_array_length(COALESCE(p_payload->'photos', '[]'::JSONB)) > 0 THEN
      UPDATE public.distributors
      SET photos = COALESCE(photos, '[]'::JSONB) || COALESCE(p_payload->'photos', '[]'::JSONB)
      WHERE id = v_target_npp.id;
    END IF;
  ELSE
    IF v_is_closure AND v_source_npp_id IS NOT NULL THEN
      UPDATE public.distributors SET status = 'Đã ngưng hợp tác' WHERE id = v_source_npp_id;
      UPDATE public.system_sets
      SET npp_id = NULL,
          npp_name = 'Tự do trong kho',
          region = v_warehouse_region,
          status = 'TRONG_KHO',
          agent_status = 'Offline',
          notes = CONCAT_WS(E'\n', NULLIF(notes, ''), 'Tự động thu hồi do NPP ngưng hợp tác.')
      WHERE npp_id = v_source_npp_id;
    ELSE
      UPDATE public.system_sets
      SET npp_id = NULL,
          npp_name = 'Tự do trong kho',
          region = v_warehouse_region,
          status = 'TRONG_KHO',
          agent_status = 'Offline'
      WHERE set_code = v_set_code;
    END IF;
  END IF;

  PERFORM public.create_audit_log(jsonb_build_object(
    'id', v_audit_id,
    'type', CASE p_workflow WHEN 'INSTALL' THEN 'LẮP ĐẶT MỚI' WHEN 'WITHDRAW' THEN 'THU HỒI' ELSE 'ĐIỀU CHUYỂN NPP' END,
    'set_code', v_set_code,
    'npp_id', COALESCE(v_target_npp_id, v_source_npp_id, '—'),
    'npp_name', COALESCE(v_target_npp.name, v_set.npp_name, ''),
    'serial_list', 'Bộ máy ' || v_set_code,
    'technician', COALESCE(p_payload->>'technician', ''),
    'reason', COALESCE(p_payload->>'reason', CASE p_workflow WHEN 'INSTALL' THEN 'Lắp mới bộ máy pha màu cho NPP' ELSE '' END),
    'notes', COALESCE(p_payload->>'notes', ''),
    'severity', CASE WHEN p_workflow = 'WITHDRAW' THEN 'WARNING' ELSE 'INFO' END
  ));

  v_result := jsonb_build_object(
    'ok', TRUE,
    'operationId', p_operation_id,
    'workflow', p_workflow,
    'setCode', v_set_code,
    'completedAt', NOW()
  );
  INSERT INTO public.sync_operations (operation_id, workflow, entity_id, result, user_id)
  VALUES (p_operation_id, p_workflow, v_set_code, v_result, auth.uid());
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_equipment_workflow(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_equipment_workflow(TEXT, TEXT, JSONB) TO authenticated;

COMMIT;
