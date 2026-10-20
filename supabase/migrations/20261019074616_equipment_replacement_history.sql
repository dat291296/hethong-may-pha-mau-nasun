-- Additive schema only. Existing equipment, customers and audit rows are preserved.
BEGIN;
CREATE TABLE IF NOT EXISTS public.equipment_replacement_events (
 operation_id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 set_code text NOT NULL,
 npp_id text,
 region text NOT NULL,
 category text NOT NULL CHECK(category IN('computer','dispenser','mixer','printer')),
 action text NOT NULL CHECK(action IN('replace','attach','relink')),
 previous_slot_id text,
 old_device_id text,
 new_device_id text NOT NULL,
 old_snapshot jsonb,
 new_snapshot jsonb NOT NULL,
 old_condition text NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 request_hash text NOT NULL,
 result jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS equipment_events_machine_time ON public.equipment_replacement_events(set_code,changed_at DESC);
CREATE INDEX IF NOT EXISTS equipment_events_region_time ON public.equipment_replacement_events(region,changed_at DESC);
CREATE INDEX IF NOT EXISTS equipment_events_old_device ON public.equipment_replacement_events(category,old_device_id,changed_at DESC);
CREATE INDEX IF NOT EXISTS equipment_events_new_device ON public.equipment_replacement_events(category,new_device_id,changed_at DESC);
ALTER TABLE public.equipment_replacement_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.equipment_replacement_events FROM anon,authenticated;
GRANT SELECT ON public.equipment_replacement_events TO authenticated;
DROP POLICY IF EXISTS equipment_events_read ON public.equipment_replacement_events;
CREATE POLICY equipment_events_read ON public.equipment_replacement_events FOR SELECT TO authenticated USING(public.can_access_region(region));
DROP TRIGGER IF EXISTS equipment_events_immutable ON public.equipment_replacement_events;
CREATE TRIGGER equipment_events_immutable BEFORE UPDATE OR DELETE ON public.equipment_replacement_events FOR EACH ROW EXECUTE FUNCTION public.reject_audit_log_mutation();
DROP TRIGGER IF EXISTS equipment_events_no_truncate ON public.equipment_replacement_events;
CREATE TRIGGER equipment_events_no_truncate BEFORE TRUNCATE ON public.equipment_replacement_events FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_log_mutation();

CREATE OR REPLACE FUNCTION public.replace_machine_equipment(
 p_operation_id uuid,p_set_code text,p_category text,p_device_id text,p_expected_device_id text,
 p_expected_updated_at timestamptz,p_reason text,p_old_condition text,p_action text DEFAULT 'replace'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp
SET lock_timeout='5s' SET statement_timeout='15s' AS $$
DECLARE
 caller uuid:=auth.uid();role_name text:=public.get_my_role();
 table_name text; machine jsonb; old_device jsonb; incoming jsonb; old_id text; previous_id text; matched text[];
 event public.equipment_replacement_events%ROWTYPE; fields text; updates jsonb; result jsonb; affected integer;
 previous_context text:=current_setting('nasun.replacement_context',true);
 fingerprint text:=encode(sha256(convert_to(jsonb_build_array(p_set_code,p_category,p_device_id,p_expected_device_id,p_expected_updated_at,p_reason,p_old_condition,p_action)::text,'UTF8')),'hex');
BEGIN
 IF caller IS NULL OR COALESCE(role_name,'') NOT IN('admin','manager','qc','technician') THEN RAISE EXCEPTION 'FORBIDDEN_REPLACEMENT' USING ERRCODE='42501';END IF;
 table_name:=CASE p_category WHEN 'computer' THEN 'computers' WHEN 'dispenser' THEN 'dispensers' WHEN 'mixer' THEN 'mixers' WHEN 'printer' THEN 'printers' END;
 IF table_name IS NULL OR p_operation_id IS NULL OR NULLIF(btrim(p_device_id),'') IS NULL OR p_expected_updated_at IS NULL OR NULLIF(btrim(p_reason),'') IS NULL OR length(p_reason)>1000
  OR COALESCE(p_action,'') NOT IN('replace','attach','relink') OR COALESCE(p_old_condition,'') NOT IN('Cần bảo trì','Hỏng nặng','Đang chạy tốt') THEN RAISE EXCEPTION 'INVALID_REPLACEMENT_INPUT' USING ERRCODE='23514';END IF;
 IF p_action='relink' AND role_name<>'admin' THEN RAISE EXCEPTION 'ADMIN_REQUIRED_FOR_RELINK' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 SELECT * INTO event FROM public.equipment_replacement_events WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF event.actor_id<>caller OR event.request_hash<>fingerprint THEN RAISE EXCEPTION 'OPERATION_ID_REUSE_MISMATCH' USING ERRCODE='23514';END IF;
  IF NOT public.technician_can_write_region(event.region) THEN RAISE EXCEPTION 'ASSIGNED_REGION_REQUIRED' USING ERRCODE='42501';END IF;
  RETURN event.result;
 END IF;
 SELECT to_jsonb(s) INTO machine FROM public.system_sets s WHERE set_code=p_set_code;
 IF machine IS NULL OR NOT public.technician_can_write_region(machine->>'region') THEN RAISE EXCEPTION 'ASSIGNED_REGION_REQUIRED' USING ERRCODE='42501';END IF;
 previous_id:=NULLIF(machine->>(p_category||'_id'),'');old_id:=previous_id;
 EXECUTE format('SELECT array_agg(id ORDER BY id) FROM public.%I WHERE set_code=$1',table_name) INTO matched USING p_set_code;
 IF cardinality(matched)>1 THEN RAISE EXCEPTION 'AMBIGUOUS_EQUIPMENT_LINK_REQUIRES_REVIEW' USING ERRCODE='PT409';END IF;
 IF old_id IS NULL AND cardinality(matched)=1 THEN old_id:=matched[1];END IF;
 IF p_action='relink' AND cardinality(matched)=1 AND p_device_id<>matched[1] THEN RAISE EXCEPTION 'RELINK_EXISTING_DEVICE_FIRST' USING ERRCODE='PT409';END IF;
 -- Lock device rows before the machine, matching the existing atomic editor order.
 EXECUTE format('SELECT array_agg(id) FROM (SELECT id FROM public.%I WHERE id=ANY($1) ORDER BY id FOR UPDATE) q',table_name) INTO matched USING ARRAY[old_id,p_device_id];
 SELECT to_jsonb(s) INTO machine FROM public.system_sets s WHERE set_code=p_set_code FOR UPDATE;
 IF machine IS NULL OR (machine->>'updated_at')::timestamptz IS DISTINCT FROM p_expected_updated_at OR machine->>(p_category||'_id') IS DISTINCT FROM previous_id THEN RAISE EXCEPTION 'MACHINE_CHANGED_RELOAD' USING ERRCODE='PT409';END IF;
 IF NOT public.technician_can_write_region(machine->>'region') THEN RAISE EXCEPTION 'ASSIGNED_REGION_REQUIRED' USING ERRCODE='42501';END IF;
 IF p_action<>'relink' AND old_id IS DISTINCT FROM p_expected_device_id THEN RAISE EXCEPTION 'EQUIPMENT_CHANGED_RELOAD' USING ERRCODE='PT409';END IF;
 EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1',table_name) INTO incoming USING p_device_id;
 IF incoming IS NULL THEN RAISE EXCEPTION 'DEVICE_NOT_FOUND' USING ERRCODE='23514';END IF;
 IF p_action='relink' THEN
  IF NULLIF(incoming->>'set_code','') IS NOT NULL AND incoming->>'set_code'<>p_set_code THEN RAISE EXCEPTION 'DEVICE_ALREADY_ASSIGNED' USING ERRCODE='PT409';END IF;
  IF COALESCE((incoming->>'is_assigned')::boolean,false) AND NULLIF(incoming->>'set_code','') IS NULL THEN RAISE EXCEPTION 'DEVICE_LINK_REQUIRES_REVIEW' USING ERRCODE='PT409';END IF;
  IF NULLIF(incoming->>'set_code','') IS NULL AND COALESCE(incoming->>'status','') NOT IN('Mới 100%','Đang chạy tốt','Đã đổi trả máy mới','Đổi trả máy cũ','Đã đổi trả máy cũ') THEN RAISE EXCEPTION 'DEVICE_NOT_READY' USING ERRCODE='23514';END IF;
 ELSE
  IF COALESCE((incoming->>'is_assigned')::boolean,false) OR NULLIF(incoming->>'set_code','') IS NOT NULL THEN RAISE EXCEPTION 'DEVICE_ALREADY_ASSIGNED' USING ERRCODE='PT409';END IF;
  IF COALESCE(incoming->>'status','') NOT IN('Mới 100%','Đang chạy tốt','Đã đổi trả máy mới','Đổi trả máy cũ','Đã đổi trả máy cũ') THEN RAISE EXCEPTION 'DEVICE_NOT_READY' USING ERRCODE='23514';END IF;
 END IF;
 IF old_id=p_device_id AND p_action<>'relink' THEN RAISE EXCEPTION 'SAME_DEVICE' USING ERRCODE='23514';END IF;
 IF p_action='attach' AND old_id IS NOT NULL THEN RAISE EXCEPTION 'SLOT_ALREADY_OCCUPIED' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT 1 FROM public.system_sets s WHERE s.set_code<>p_set_code AND to_jsonb(s)->>(p_category||'_id')=p_device_id) THEN RAISE EXCEPTION 'DEVICE_REFERENCED_ELSEWHERE' USING ERRCODE='PT409';END IF;
 IF old_id IS NOT NULL THEN
  EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1',table_name) INTO old_device USING old_id;
  IF old_device IS NULL OR old_device->>'set_code' IS DISTINCT FROM p_set_code THEN
   IF p_action<>'relink' THEN RAISE EXCEPTION 'OLD_LINK_REQUIRES_REVIEW' USING ERRCODE='PT409';END IF;
   old_device:=NULL;old_id:=NULL;
  END IF;
 END IF;
 PERFORM set_config('nasun.replacement_context',p_set_code,true);
 IF old_id IS NOT NULL AND old_id<>p_device_id THEN
  EXECUTE format('UPDATE public.%I SET set_code=NULL,is_assigned=false,status=$1,updated_at=clock_timestamp() WHERE id=$2',table_name) USING p_old_condition,old_id;
  GET DIAGNOSTICS affected=ROW_COUNT;IF affected<>1 THEN RAISE EXCEPTION 'OLD_DEVICE_UPDATE_FAILED';END IF;
 END IF;
 updates:=jsonb_build_object(p_category||'_id',p_device_id,p_category||'_serial',COALESCE(incoming->>'serial',''));
 IF p_category IN('dispenser','mixer') THEN updates:=updates||jsonb_build_object(p_category||'_model',incoming->>'model');END IF;
 IF p_category='computer' THEN updates:=updates||jsonb_build_object('computer_type',incoming->>'type','tinting_software',COALESCE(incoming->>'tinting_software',''),'software_version',COALESCE(incoming->>'software_version',''));END IF;
 SELECT string_agg(format('%I=(jsonb_populate_record(NULL::public.system_sets,$1)).%I',key,key),',') INTO fields FROM jsonb_object_keys(updates) key;
 EXECUTE format('UPDATE public.system_sets SET %s,updated_at=clock_timestamp() WHERE set_code=$2',fields) USING updates,p_set_code;
 EXECUTE format('UPDATE public.%I SET set_code=$1,is_assigned=true,updated_at=clock_timestamp() WHERE id=$2',table_name) USING p_set_code,p_device_id;
 GET DIAGNOSTICS affected=ROW_COUNT;IF affected<>1 THEN RAISE EXCEPTION 'NEW_DEVICE_UPDATE_FAILED';END IF;
 result:=jsonb_build_object('ok',true,'operationId',p_operation_id,'setCode',p_set_code,'category',p_category,'oldDeviceId',old_id,'newDeviceId',p_device_id);
 INSERT INTO public.equipment_replacement_events(operation_id,actor_id,set_code,npp_id,region,category,action,previous_slot_id,old_device_id,new_device_id,old_snapshot,new_snapshot,old_condition,reason,request_hash,result)
 VALUES(p_operation_id,caller,p_set_code,machine->>'npp_id',machine->>'region',p_category,p_action,previous_id,old_id,p_device_id,old_device,incoming,p_old_condition,btrim(p_reason),fingerprint,result);
 PERFORM public.create_audit_log(jsonb_build_object('id','AUDIT-'||p_operation_id,'type',CASE p_action WHEN 'relink' THEN 'ĐỐI CHIẾU LIÊN KẾT' ELSE 'THAY THIẾT BỊ' END,'set_code',p_set_code,'npp_id',machine->>'npp_id','npp_name',machine->>'npp_name','reason',p_reason,'notes',p_category||': '||COALESCE(old_id,'Chưa gán')||' → '||p_device_id));
 PERFORM set_config('nasun.replacement_context',COALESCE(previous_context,''),true);
 RETURN result;
END;$$;
REVOKE ALL ON FUNCTION public.replace_machine_equipment(uuid,text,text,text,text,timestamptz,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_machine_equipment(uuid,text,text,text,text,timestamptz,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_technician_region_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE old_region TEXT; new_region TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.get_my_role() = 'admin' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME IN ('system_sets','distributors') THEN
    new_region := NEW.region;
    IF TG_OP = 'UPDATE' THEN old_region := OLD.region; END IF;
  ELSIF TG_TABLE_NAME = 'repair_tickets' THEN
    SELECT region INTO new_region FROM public.distributors WHERE id = NEW.npp_id;
    IF TG_OP = 'UPDATE' THEN SELECT region INTO old_region FROM public.distributors WHERE id = OLD.npp_id; END IF;
  ELSE
    SELECT region INTO new_region FROM public.system_sets WHERE set_code = NEW.set_code;
    IF TG_OP = 'UPDATE' THEN SELECT region INTO old_region FROM public.system_sets WHERE set_code = OLD.set_code; END IF;
    IF TG_OP='UPDATE' AND NULLIF(OLD.set_code,'') IS NULL AND NOT COALESCE(OLD.is_assigned,false)
      AND NEW.set_code IS NOT NULL AND current_setting('nasun.replacement_context',true)=NEW.set_code
      AND public.technician_can_write_region(new_region) THEN old_region:=new_region; END IF;
    -- A regional withdrawal may detach an existing regional device into stock.
    IF TG_OP = 'UPDATE' AND NEW.set_code IS NULL AND public.technician_can_write_region(old_region) THEN new_region := old_region; END IF;
  END IF;
  IF NOT public.technician_can_write_region(new_region) OR
     (TG_OP = 'UPDATE' AND NOT public.technician_can_write_region(old_region)) THEN
    RAISE EXCEPTION 'ASSIGNED_REGION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'system_sets' THEN
    IF NEW.npp_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM public.distributors d WHERE d.id = NEW.npp_id AND public.technician_can_write_region(d.region)) THEN
      RAISE EXCEPTION 'ASSIGNED_REGION_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_technician_region_write() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
