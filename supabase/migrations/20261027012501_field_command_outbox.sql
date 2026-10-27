-- Additive command receipts. No existing row or inline image is migrated/deleted.
BEGIN;
CREATE SCHEMA IF NOT EXISTS nasun_internal;
REVOKE ALL ON SCHEMA nasun_internal FROM PUBLIC,anon,authenticated;
CREATE TABLE nasun_internal.field_commands (
 actor uuid NOT NULL REFERENCES auth.users(id), operation_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('REPAIR_CREATE','REPAIR_EDIT','MAINTENANCE','INSTALL','TRANSFER','WITHDRAW')),
 entity_id text NOT NULL, request_hash text NOT NULL, receipt jsonb NOT NULL,
 checklist jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor,operation_id)
);
ALTER TABLE nasun_internal.field_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON nasun_internal.field_commands FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER field_commands_immutable BEFORE UPDATE OR DELETE ON nasun_internal.field_commands
 FOR EACH ROW EXECUTE FUNCTION nasun_internal.reject_evidence_history_change();
CREATE TRIGGER field_commands_no_truncate BEFORE TRUNCATE ON nasun_internal.field_commands
 FOR EACH STATEMENT EXECUTE FUNCTION nasun_internal.reject_evidence_history_change();

CREATE FUNCTION public.execute_field_command(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor uuid:=auth.uid(); op uuid; kind text:=p_command->>'kind'; entity text:=p_command->>'entityId';
 body jsonb:=p_command->'payload'; digest text; previous nasun_internal.field_commands%ROWTYPE;
 machine public.system_sets%ROWTYPE; ticket public.repair_tickets%ROWTYPE;
 target_region text; source_region text; allowed text[]; key text; affected bigint; version bigint;
 checklist jsonb; result jsonb; checked_result jsonb; audit_id text;
BEGIN
 IF actor IS NULL OR NOT public.has_active_app_session() OR public.get_my_role() NOT IN ('admin','manager','technician','qc') THEN
  RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501'; END IF;
 IF p_command IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'version' IS DISTINCT FROM '1'
 OR p_command->>'owner' IS DISTINCT FROM actor::text OR COALESCE(kind,'') NOT IN ('REPAIR_CREATE','REPAIR_EDIT','MAINTENANCE','INSTALL','TRANSFER','WITHDRAW')
 OR entity IS NULL OR length(entity) NOT BETWEEN 1 AND 160 OR jsonb_typeof(body) IS DISTINCT FROM 'object'
 OR COALESCE(p_command->>'checksum','')!~'^[0-9a-f]{64}$' OR octet_length(p_command::text)>12582912 THEN RAISE EXCEPTION 'INVALID_FIELD_COMMAND' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('version','kind','entityId','expected','payload','operationId','owner','checksum')) THEN
  RAISE EXCEPTION 'INVALID_FIELD_COMMAND' USING ERRCODE='23514'; END IF;
 op:=(p_command->>'operationId')::uuid;
 IF op IS NULL THEN RAISE EXCEPTION 'INVALID_FIELD_COMMAND' USING ERRCODE='23514'; END IF;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||op::text,0));

 IF kind IN ('REPAIR_CREATE','REPAIR_EDIT') THEN
  IF body->>'id' IS DISTINCT FROM entity THEN RAISE EXCEPTION 'INVALID_FIELD_COMMAND' USING ERRCODE='23514'; END IF;
  allowed:=ARRAY['id','ticket_code','date','technician','npp_id','npp_name','product_category','machine_model','serial_number','error_description',
   'error_category','action_direction','replacement_condition','processing_status','customer_return_status','notes','photos','asset_code',
   'field_visit_status','service_checklist','materials_used','before_photos','after_photos','npp_confirmation','sla_due_at','completed_at'];
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(body) k WHERE NOT(k=ANY(allowed))) THEN RAISE EXCEPTION 'INVALID_FIELD_COMMAND' USING ERRCODE='23514'; END IF;
  SELECT * INTO ticket FROM public.repair_tickets WHERE id=entity FOR UPDATE;
  IF FOUND THEN
   SELECT region INTO source_region FROM public.distributors WHERE id=ticket.npp_id;
   IF NOT COALESCE(public.can_access_region(source_region),false) THEN RAISE EXCEPTION 'FORBIDDEN_REGION' USING ERRCODE='42501'; END IF;
  ELSIF kind='REPAIR_EDIT' THEN RAISE EXCEPTION 'FIELD_TARGET_MISSING' USING ERRCODE='23514'; END IF;
  SELECT region INTO target_region FROM public.distributors WHERE id=COALESCE(body->>'npp_id',ticket.npp_id);
  IF NOT COALESCE(public.can_access_region(target_region),false) THEN RAISE EXCEPTION 'FORBIDDEN_REGION' USING ERRCODE='42501'; END IF;
 ELSE
  SELECT * INTO machine FROM public.system_sets WHERE set_code=entity FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(public.can_access_region(machine.region),false) THEN RAISE EXCEPTION 'FORBIDDEN_REGION' USING ERRCODE='42501'; END IF;
  IF machine.npp_id IS NOT NULL THEN
   SELECT region INTO source_region FROM public.distributors WHERE id=machine.npp_id;
   IF NOT COALESCE(public.can_access_region(source_region),false) THEN RAISE EXCEPTION 'FORBIDDEN_REGION' USING ERRCODE='42501'; END IF;
  END IF;
  IF kind IN ('INSTALL','TRANSFER') THEN
   SELECT region INTO target_region FROM public.distributors WHERE id=COALESCE(body->>'nppId',body->>'newNppId');
   IF NOT COALESCE(public.can_access_region(target_region),false) THEN RAISE EXCEPTION 'FORBIDDEN_REGION' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;

 SELECT * INTO previous FROM nasun_internal.field_commands fc WHERE fc.actor=execute_field_command.actor AND fc.operation_id=op;
 IF FOUND THEN
  IF previous.request_hash<>digest THEN RAISE EXCEPTION 'FIELD_INTENT_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN previous.receipt;
 END IF;
 IF kind='REPAIR_CREATE' AND ticket.id IS NOT NULL THEN RAISE EXCEPTION 'FIELD_INTENT_CONFLICT' USING ERRCODE='23514'; END IF;
 IF kind='REPAIR_EDIT' AND (p_command->>'expected')::bigint IS DISTINCT FROM ticket.record_version THEN
  RAISE EXCEPTION 'WRITE_CONFLICT' USING ERRCODE='PT409'; END IF;
 IF kind NOT IN ('REPAIR_CREATE','REPAIR_EDIT') AND (p_command->>'expected')::timestamptz IS DISTINCT FROM machine.updated_at THEN
  RAISE EXCEPTION 'WRITE_CONFLICT' USING ERRCODE='PT409'; END IF;

 IF kind IN ('REPAIR_CREATE','REPAIR_EDIT') THEN
  IF kind='REPAIR_CREATE' THEN
   SELECT string_agg(format('%I',k),',') INTO key FROM jsonb_object_keys(body) k;
   EXECUTE format('INSERT INTO public.repair_tickets(%s) SELECT %s FROM jsonb_populate_record(NULL::public.repair_tickets,$1)',key,key) USING body;
  ELSE
   affected:=public.apply_sync_row_mutation('public.repair_tickets'::regclass,'id','UPDATE',body,entity);
   IF affected<>1 THEN RAISE EXCEPTION 'WRITE_CONFLICT' USING ERRCODE='PT409'; END IF;
  END IF;
  SELECT record_version INTO version FROM public.repair_tickets WHERE id=entity;
  audit_id:='AUDIT-FIELD-'||op::text;
  INSERT INTO public.audit_logs(id,type,set_code,npp_id,npp_name,serial_list,technician,reason,notes,user_id,severity)
   VALUES(audit_id,CASE WHEN kind='REPAIR_CREATE' THEN 'TẠO PHIẾU SỬA CHỮA' ELSE 'CẬP NHẬT PHIẾU SỬA CHỮA' END,
   COALESCE(body->>'asset_code',''),COALESCE(body->>'npp_id',ticket.npp_id),COALESCE(body->>'npp_name',ticket.npp_name),
   COALESCE(body->>'serial_number',ticket.serial_number),COALESCE(body->>'technician','Kỹ thuật viên'),
   'Field command '||op::text,COALESCE(body->>'error_description',''),actor,'INFO');
 ELSIF kind='MAINTENANCE' THEN
  checklist:=body->'checklist';
  IF body->>'setCode' IS DISTINCT FROM entity OR checklist->>'version' IS DISTINCT FROM '1'
   OR checklist->>'model' IS DISTINCT FROM COALESCE(machine.dispenser_model,'')
   OR checklist->>'serial' IS DISTINCT FROM COALESCE(machine.dispenser_serial,'')
   OR jsonb_typeof(checklist->'steps') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_CHECKLIST' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(checklist->'steps') NOT BETWEEN 1 AND 30 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(checklist->'steps') WITH ORDINALITY s(value,position)
   WHERE s.value->>'id' IS DISTINCT FROM position::text OR COALESCE(s.value->>'result','') NOT IN ('PASS','ISSUE','NA')
   OR length(COALESCE(s.value->>'label','')) NOT BETWEEN 1 AND 300) THEN RAISE EXCEPTION 'INVALID_CHECKLIST' USING ERRCODE='23514'; END IF;
  checked_result:=public.complete_machine_maintenance(op,entity,(body->>'lastMaintenanceDate')::date,(body->>'nextMaintenanceDue')::date,
   body->>'notes',COALESCE(body->'photos','[]'),EXISTS(SELECT 1 FROM jsonb_array_elements(checklist->'steps') s WHERE s->>'result'='ISSUE'));
 ELSE
  IF body->>'setCode' IS DISTINCT FROM entity THEN RAISE EXCEPTION 'INVALID_FIELD_COMMAND' USING ERRCODE='23514'; END IF;
  checked_result:=public.execute_equipment_workflow(op::text,kind,body-'expectedRevision'-'confirmedOnline'-'operationId');
 END IF;
 IF kind NOT IN ('REPAIR_CREATE','REPAIR_EDIT') THEN
  SELECT (extract(epoch FROM updated_at)*1000000)::bigint INTO version FROM public.system_sets WHERE set_code=entity;
 END IF;
 result:=jsonb_build_object('ok',true,'operationId',op,'kind',kind,'entityId',entity,'version',version,'checksum',p_command->>'checksum','completedAt',now());
 INSERT INTO nasun_internal.field_commands(actor,operation_id,kind,entity_id,request_hash,receipt,checklist)
 VALUES(actor,op,kind,entity,digest,result,checklist);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.execute_field_command(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.execute_field_command(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
