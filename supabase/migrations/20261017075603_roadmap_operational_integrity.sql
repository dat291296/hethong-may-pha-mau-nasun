-- Module 2: atomic and idempotent equipment workflows.
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
  IF caller_role IS NULL OR caller_role NOT IN ('admin', 'qc', 'manager', 'technician') THEN RAISE EXCEPTION 'FORBIDDEN_AUDIT_WRITE'; END IF;
  IF audit_type IS NULL OR LENGTH(audit_type) > 160 THEN RAISE EXCEPTION 'INVALID_AUDIT_TYPE'; END IF;

  IF caller_role IN ('manager','technician') AND NOT EXISTS (
    SELECT 1 FROM public.system_sets s WHERE s.set_code=p_payload->>'set_code'
      AND public.can_access_region(s.region)
      AND (caller_role<>'technician' OR public.technician_can_write_region(s.region))
  ) THEN RAISE EXCEPTION 'FORBIDDEN_AUDIT_REGION' USING ERRCODE='42501'; END IF;
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



CREATE TABLE IF NOT EXISTS public.sync_operations (
  operation_id TEXT PRIMARY KEY,
  workflow TEXT NOT NULL CHECK (workflow IN ('INSTALL', 'WITHDRAW', 'TRANSFER')),
  entity_id TEXT NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT ON public.sync_operations TO authenticated;
ALTER TABLE public.sync_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sync_operations_select_own" ON public.sync_operations;
CREATE POLICY "sync_operations_select_own"
  ON public.sync_operations FOR SELECT
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin');
DROP POLICY IF EXISTS "sync_operations_insert_own" ON public.sync_operations;
CREATE POLICY "sync_operations_insert_own"
  ON public.sync_operations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.get_my_role() IN ('admin', 'manager', 'technician', 'qc'));

CREATE OR REPLACE FUNCTION public.normalize_legacy_sync_operation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.workflow IS NOT NULL THEN
  NEW.action:=COALESCE(NULLIF(NEW.action,'LEGACY_OPERATION'),NEW.workflow);
  NEW.entity_type:=COALESCE(NULLIF(NEW.entity_type,'unknown'),'system_sets');
  NEW.payload_hash:=CASE WHEN NEW.payload_hash='legacy' THEN encode(sha256(convert_to(COALESCE(NEW.result,'{}'::jsonb)::text,'UTF8')),'hex') ELSE NEW.payload_hash END;
  NEW.status:=CASE WHEN NEW.result IS NOT NULL THEN 'applied' ELSE NEW.status END;
  NEW.applied_at:=CASE WHEN NEW.result IS NOT NULL THEN COALESCE(NEW.applied_at,now()) ELSE NEW.applied_at END;
 END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION public.normalize_legacy_sync_operation() FROM PUBLIC,anon,authenticated;

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
  v_request_hash TEXT := encode(sha256(convert_to(p_workflow || p_payload::text, 'UTF8')), 'hex');
  v_event_date DATE := COALESCE(NULLIF(COALESCE(p_payload->>'installedDate',p_payload->>'withdrawDate',p_payload->>'transferDate'),'')::DATE,(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
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
  IF COALESCE(public.get_my_role(),'') NOT IN ('admin', 'manager', 'technician', 'qc') THEN
    RAISE EXCEPTION 'FORBIDDEN_WORKFLOW' USING ERRCODE='42501';
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
    IF v_existing->>'actorId' IS DISTINCT FROM auth.uid()::text OR v_existing->>'requestHash' IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'OPERATION_ID_REUSE_MISMATCH' USING ERRCODE = '23514';
    END IF;
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
  IF NOT public.can_access_region(v_set.region) OR
     (public.get_my_role()='technician' AND NOT public.technician_can_write_region(v_set.region)) THEN
    RAISE EXCEPTION 'FORBIDDEN_WORKFLOW_REGION' USING ERRCODE='42501';
  END IF;
  IF (p_workflow='INSTALL' AND v_set.status NOT IN ('TRONG_KHO','DA_THU_HOI')) OR
     (p_workflow IN ('WITHDRAW','TRANSFER') AND v_set.status NOT IN ('DA_LAP_DAT','BAO_THUONG_BAO_TRI')) THEN
    RAISE EXCEPTION 'INVALID_WORKFLOW_STATE' USING ERRCODE='23514';
  END IF;
  IF v_event_date>(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date OR public.is_month_locked(v_event_date) THEN
    RAISE EXCEPTION 'WORKFLOW_DATE_LOCKED_OR_FUTURE' USING ERRCODE='23514';
  END IF;
  IF LENGTH(COALESCE(p_payload->>'notes',''))>4000 OR LENGTH(COALESCE(p_payload->>'reason',''))>1000 THEN
    RAISE EXCEPTION 'WORKFLOW_TEXT_TOO_LONG' USING ERRCODE='23514';
  END IF;
  IF p_workflow='WITHDRAW' AND NULLIF(BTRIM(p_payload->>'reason'),'') IS NULL THEN
    RAISE EXCEPTION 'WITHDRAW_REASON_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF p_payload ? 'photos' AND (jsonb_typeof(p_payload->'photos')<>'array' OR jsonb_array_length(p_payload->'photos')>6) THEN
    RAISE EXCEPTION 'INVALID_WORKFLOW_PHOTOS' USING ERRCODE='23514';
  END IF;


  IF p_workflow IN ('INSTALL', 'TRANSFER') THEN
    IF v_target_npp_id IS NULL THEN RAISE EXCEPTION 'TARGET_NPP_REQUIRED'; END IF;
    SELECT * INTO v_target_npp
    FROM public.distributors
    WHERE id = v_target_npp_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NPP_NOT_FOUND: %', v_target_npp_id; END IF;
    IF v_target_npp.status <> 'Đang hợp tác' THEN RAISE EXCEPTION 'TARGET_NPP_INACTIVE: %', v_target_npp_id; END IF;
    IF NOT public.can_access_region(v_target_npp.region) OR
       (public.get_my_role()='technician' AND NOT public.technician_can_write_region(v_target_npp.region)) THEN
      RAISE EXCEPTION 'FORBIDDEN_TARGET_REGION' USING ERRCODE='42501';
    END IF;
    IF p_workflow='TRANSFER' AND v_source_npp_id=v_target_npp_id THEN
      RAISE EXCEPTION 'SAME_SOURCE_AND_TARGET' USING ERRCODE='23514';
    END IF;


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
    'actorId', auth.uid(),
    'requestHash', v_request_hash,
    'operationId', p_operation_id,
    'workflow', p_workflow,
    'setCode', v_set_code,
    'completedAt', NOW()
  );
  INSERT INTO public.sync_operations (operation_id, workflow, entity_id, result, user_id, payload_hash)
  VALUES (p_operation_id, p_workflow, v_set_code, v_result, auth.uid(), v_request_hash);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_equipment_workflow(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_equipment_workflow(TEXT, TEXT, JSONB) TO authenticated;

ALTER FUNCTION public.update_updated_at() SET search_path=pg_catalog,public;
REVOKE EXECUTE ON FUNCTION public.get_npp_region(text), public.get_my_managed_region(), public.is_month_locked(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_npp_region(text), public.get_my_managed_region(), public.is_month_locked(date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user(), public.check_role_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assemble_system_set_atomic(p_operation_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  code text:=NULLIF(BTRIM(p_payload->>'set_code'),'');
  body jsonb:=p_payload;
  request_hash text:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  previous jsonb; result jsonb; device jsonb; item record; affected integer;
  target public.distributors%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.get_my_role(),'') NOT IN ('admin','manager','technician','qc') THEN
    RAISE EXCEPTION 'FORBIDDEN_ASSEMBLY' USING ERRCODE='42501'; END IF;
  IF code IS NULL OR LENGTH(code)>120 OR NULLIF(p_operation_id,'') IS NULL OR LENGTH(p_operation_id)>80 THEN
    RAISE EXCEPTION 'INVALID_ASSEMBLY_PAYLOAD' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('assemble:'||p_operation_id,0));
  SELECT o.result INTO previous FROM public.sync_operations o WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF previous->>'actorId' IS DISTINCT FROM auth.uid()::text OR previous->>'requestHash' IS DISTINCT FROM request_hash THEN
      RAISE EXCEPTION 'OPERATION_ID_REUSE_MISMATCH' USING ERRCODE='23514'; END IF;
    RETURN previous;
  END IF;
  IF NULLIF(body->>'npp_id','') IS NOT NULL THEN
    SELECT * INTO target FROM public.distributors WHERE id=body->>'npp_id' FOR UPDATE;
    IF NOT FOUND OR target.status<>'Đang hợp tác' THEN RAISE EXCEPTION 'TARGET_NPP_INACTIVE' USING ERRCODE='23514'; END IF;
    body:=body||jsonb_build_object('npp_name',target.name,'region',target.region,'province',target.province,'status','DA_LAP_DAT');
  ELSE
    body:=body||jsonb_build_object('npp_id',null,'npp_name','Kho tổng trung tâm','status','TRONG_KHO');
  END IF;
  IF NOT COALESCE(public.can_access_region(body->>'region'),false) OR
    (public.get_my_role()='technician' AND NOT public.technician_can_write_region(body->>'region')) THEN
    RAISE EXCEPTION 'FORBIDDEN_ASSEMBLY_REGION' USING ERRCODE='42501'; END IF;
  FOR item IN SELECT * FROM (VALUES ('computer','computers'),('dispenser','dispensers'),('mixer','mixers'),('printer','printers')) x(category,table_name) LOOP
    IF NULLIF(body->>(item.category||'_id'),'') IS NULL THEN RAISE EXCEPTION 'ALL_FOUR_DEVICES_REQUIRED' USING ERRCODE='23514'; END IF;
    EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1 FOR UPDATE',item.table_name)
      INTO device USING body->>(item.category||'_id');
    IF device IS NULL OR COALESCE((device->>'is_assigned')::boolean,false) OR NULLIF(device->>'set_code','') IS NOT NULL THEN
      RAISE EXCEPTION 'DEVICE_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
    IF item.category='computer' THEN
      body:=body||jsonb_build_object('computer_type',COALESCE(device->>'type',body->>'computer_type'),'computer_serial',device->>'serial');
    ELSE
      body:=body||jsonb_build_object(item.category||'_model',device->>'model',item.category||'_serial',device->>'serial');
    END IF;
  END LOOP;
  INSERT INTO public.system_sets (set_code,npp_id,npp_name,region,province,dispenser_id,dispenser_serial,dispenser_model,mixer_id,mixer_serial,mixer_model,computer_id,computer_type,computer_serial,printer_id,printer_serial,stabilizer,status,install_date,last_maintenance_date,next_maintenance_due,technician,salesperson,notes,tinting_software,software_version,installation_photos)
  SELECT x.set_code,x.npp_id,x.npp_name,x.region,x.province,x.dispenser_id,x.dispenser_serial,x.dispenser_model,x.mixer_id,x.mixer_serial,x.mixer_model,x.computer_id,x.computer_type,x.computer_serial,x.printer_id,x.printer_serial,x.stabilizer,x.status,x.install_date,x.last_maintenance_date,x.next_maintenance_due,x.technician,x.salesperson,x.notes,x.tinting_software,x.software_version,x.installation_photos FROM jsonb_populate_record(NULL::public.system_sets,body) x;
  FOR item IN SELECT * FROM (VALUES ('computer','computers'),('dispenser','dispensers'),('mixer','mixers'),('printer','printers')) x(category,table_name) LOOP
    EXECUTE format('UPDATE public.%I SET set_code=$1,is_assigned=true WHERE id=$2',item.table_name) USING code,body->>(item.category||'_id');
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected<>1 THEN RAISE EXCEPTION 'DEVICE_ASSIGNMENT_DENIED' USING ERRCODE='42501'; END IF;

  END LOOP;
  PERFORM public.create_audit_log(jsonb_build_object('id','AUDIT-'||p_operation_id,'type','RÁP BỘ MÁY','set_code',code,'npp_id',body->>'npp_id','npp_name',body->>'npp_name','notes','Ráp bốn thiết bị trong cùng giao dịch.'));
  result:=jsonb_build_object('ok',true,'setCode',code,'actorId',auth.uid(),'requestHash',request_hash,'operationId',p_operation_id);
  INSERT INTO public.sync_operations(operation_id,user_id,action,entity_type,entity_id,payload_hash,status,result)
    VALUES(p_operation_id,auth.uid(),'ASSEMBLE_SET','system_sets',code,request_hash,'applied',result);
  RETURN result;
END;$$;
REVOKE ALL ON FUNCTION public.assemble_system_set_atomic(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assemble_system_set_atomic(text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_operational_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_TABLE_NAME='system_sets' THEN
    IF NEW.set_code IS DISTINCT FROM OLD.set_code THEN RAISE EXCEPTION 'MACHINE_CODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  ELSE
    IF TG_OP='UPDATE' AND NEW.processing_status IS NOT DISTINCT FROM OLD.processing_status AND NEW.customer_return_status IS NOT DISTINCT FROM OLD.customer_return_status THEN RETURN NEW; END IF;
    IF NEW.customer_return_status='Đã gửi trả' AND NEW.processing_status IS DISTINCT FROM 'Đã xử lý' THEN
      RAISE EXCEPTION 'REPAIR_RETURN_REQUIRES_COMPLETION' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS guard_machine_code ON public.system_sets;
CREATE TRIGGER guard_machine_code BEFORE UPDATE OF set_code ON public.system_sets FOR EACH ROW EXECUTE FUNCTION public.guard_operational_lifecycle();
DROP TRIGGER IF EXISTS guard_repair_return ON public.repair_tickets;
CREATE TRIGGER guard_repair_return BEFORE INSERT OR UPDATE OF processing_status,customer_return_status ON public.repair_tickets FOR EACH ROW EXECUTE FUNCTION public.guard_operational_lifecycle();

COMMIT;
