-- Isolated staging only. Synthetic rows and JWT claim simulations are rolled back.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $$
DECLARE actor record; kind text; tab text; code text; old_id text; new_id text; revision timestamptz; op uuid; response jsonb; checked integer:=0;
 prefix text:='SYN-REPLACE-'||replace(gen_random_uuid()::text,'-','');
BEGIN
 FOR actor IN SELECT DISTINCT ON(p.role) p.id,p.role FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE u.raw_app_meta_data->>'nasun_rls_fixture'='true' AND p.is_active AND p.role IN('admin','manager','qc','technician','viewer') ORDER BY p.role,p.created_at DESC LOOP
  FOREACH kind IN ARRAY ARRAY['computer','dispenser','mixer','printer'] LOOP
   tab:=CASE kind WHEN 'computer' THEN 'computers' WHEN 'dispenser' THEN 'dispensers' WHEN 'mixer' THEN 'mixers' ELSE 'printers' END;
   code:=prefix||'-'||actor.role||'-'||kind;old_id:=code||'-OLD';new_id:=code||'-NEW';op:=gen_random_uuid();
   INSERT INTO public.system_sets(set_code,npp_name,region,status) VALUES(code,'Synthetic replacement','Miền Bắc','TRONG_KHO');
   IF kind='computer' THEN
    EXECUTE format('INSERT INTO public.%I(id,type,serial,status,is_assigned,set_code) VALUES($1,''Case'',$1,''Đang chạy tốt'',true,$3),($2,''Case'',$2,''Đang chạy tốt'',false,NULL)',tab) USING old_id,new_id,code;
   ELSE
    EXECUTE format('INSERT INTO public.%I(id,model,serial,status,is_assigned,set_code) VALUES($1,''Synthetic'',$1,''Đang chạy tốt'',true,$3),($2,''Synthetic'',$2,''Đang chạy tốt'',false,NULL)',tab) USING old_id,new_id,code;
   END IF;
   EXECUTE format('UPDATE public.system_sets SET %I=$1 WHERE set_code=$2',kind||'_id') USING old_id,code;
   INSERT INTO public.system_sets(set_code,npp_name,region,status) VALUES(code||'-SOUTH','Synthetic south','Miền Nam','TRONG_KHO');
   SELECT updated_at INTO revision FROM public.system_sets WHERE set_code=code;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated','session_id',gen_random_uuid(),'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
   SET LOCAL ROLE authenticated;
   IF actor.role='viewer' THEN
    BEGIN PERFORM public.replace_machine_equipment(op,code,kind,new_id,old_id,revision,'Synthetic test','Cần bảo trì');RAISE EXCEPTION 'VIEWER_ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   ELSE
    IF actor.role<>'admin' THEN
     BEGIN PERFORM public.replace_machine_equipment(gen_random_uuid(),code||'-SOUTH',kind,new_id,NULL,revision,'Synthetic cross region','Cần bảo trì');RAISE EXCEPTION 'CROSS_REGION_ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
     BEGIN PERFORM public.replace_machine_equipment(gen_random_uuid(),code,kind,new_id,old_id,revision,'Synthetic relink','Cần bảo trì','relink');RAISE EXCEPTION 'REGIONAL_RELINK_ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
    END IF;
    BEGIN PERFORM public.replace_machine_equipment(gen_random_uuid(),code,kind,old_id,old_id,revision,'Synthetic assigned device','Cần bảo trì');RAISE EXCEPTION 'ASSIGNED_DEVICE_ALLOWED';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
    BEGIN PERFORM public.replace_machine_equipment(op,code,kind,new_id,old_id,revision-interval '1 day','Synthetic test','Cần bảo trì');RAISE EXCEPTION 'STALE_ALLOWED';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
    response:=public.replace_machine_equipment(op,code,kind,new_id,old_id,revision,'Synthetic test','Cần bảo trì');
    IF response->>'newDeviceId'<>new_id OR NOT(response->>'ok')::boolean THEN RAISE EXCEPTION 'WRONG_ACK';END IF;
    IF public.replace_machine_equipment(op,code,kind,new_id,old_id,revision,'Synthetic test','Cần bảo trì') IS DISTINCT FROM response THEN RAISE EXCEPTION 'REPLAY_CHANGED';END IF;
    BEGIN PERFORM public.replace_machine_equipment(op,code,kind,new_id,old_id,revision,'Different request','Cần bảo trì');RAISE EXCEPTION 'MISMATCH_ALLOWED';EXCEPTION WHEN check_violation THEN NULL;END;
    BEGIN UPDATE public.equipment_replacement_events SET reason='Changed' WHERE operation_id=op;RAISE EXCEPTION 'EVENT_EDIT_ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
    BEGIN DELETE FROM public.equipment_replacement_events WHERE operation_id=op;RAISE EXCEPTION 'EVENT_DELETE_ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
    IF (SELECT count(*) FROM public.equipment_replacement_events WHERE operation_id=op)<>1 THEN RAISE EXCEPTION 'EVENT_MISSING';END IF;
   END IF;
   RESET ROLE;
   PERFORM set_config('request.jwt.claims','{}',true);
   IF actor.role<>'viewer' THEN
    EXECUTE format('SELECT count(*) FROM public.%I WHERE (id=$1 AND set_code IS NULL AND NOT is_assigned AND status=''Cần bảo trì'') OR (id=$2 AND set_code=$3 AND is_assigned)',tab) INTO checked USING old_id,new_id,code;
    IF checked<>2 THEN RAISE EXCEPTION 'EQUIPMENT_NOT_PRESERVED';END IF;
    IF NOT EXISTS(SELECT 1 FROM public.system_sets s WHERE set_code=code AND to_jsonb(s)->>(kind||'_id')=new_id AND to_jsonb(s)->>(kind||'_serial')=new_id) THEN RAISE EXCEPTION 'SLOT_NOT_UPDATED';END IF;
    IF (SELECT count(*) FROM public.audit_logs WHERE set_code=code)<>1 THEN RAISE EXCEPTION 'AUDIT_NOT_EXACTLY_ONCE';END IF;
   END IF;
  END LOOP;
 END LOOP;
 IF (SELECT count(distinct p.role) FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE u.raw_app_meta_data->>'nasun_rls_fixture'='true' AND p.is_active AND p.role IN('admin','manager','qc','technician','viewer'))<>5 THEN RAISE EXCEPTION 'FIVE_FIXTURE_ROLES_REQUIRED';END IF;
END $$;

DO $$
DECLARE actor uuid; code text:='SYN-LINK-'||gen_random_uuid()::text; device_id text; revision timestamptz;
BEGIN
 SELECT p.id INTO actor FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.role='admin' AND p.is_active AND u.raw_app_meta_data->>'nasun_rls_fixture'='true' LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'ADMIN_FIXTURE_REQUIRED';END IF;
 device_id:=code||'-P';
 INSERT INTO public.system_sets(set_code,npp_name,region,status) VALUES(code,'Synthetic empty slot','Miền Bắc','TRONG_KHO');
 INSERT INTO public.printers(id,model,serial,status,is_assigned) VALUES(device_id,'Synthetic',device_id,'Đang chạy tốt',false);
 SELECT updated_at INTO revision FROM public.system_sets WHERE set_code=code;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',gen_random_uuid(),'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.replace_machine_equipment(gen_random_uuid(),code,'printer',device_id,NULL,revision,'Synthetic attach','Cần bảo trì','attach');
 RESET ROLE;PERFORM set_config('request.jwt.claims','{}',true);
 UPDATE public.system_sets SET printer_id=code||'-MISSING' WHERE set_code=code;
 SELECT updated_at INTO revision FROM public.system_sets WHERE set_code=code;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',gen_random_uuid(),'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.replace_machine_equipment(gen_random_uuid(),code,'printer',device_id,code||'-MISSING',revision,'Synthetic reconcile','Cần bảo trì','relink');
 RESET ROLE;PERFORM set_config('request.jwt.claims','{}',true);
 IF NOT EXISTS(SELECT 1 FROM public.system_sets WHERE set_code=code AND printer_id=device_id) OR (SELECT count(*) FROM public.equipment_replacement_events WHERE set_code=code)<>2 THEN RAISE EXCEPTION 'ATTACH_RELINK_FAILED';END IF;
 INSERT INTO public.printers(id,model,serial,status,is_assigned,set_code) VALUES(code||'-AMBIGUOUS','Synthetic',code||'-AMBIGUOUS','Đang chạy tốt',true,code);
 SELECT updated_at INTO revision FROM public.system_sets WHERE set_code=code;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.replace_machine_equipment(gen_random_uuid(),code,'printer',device_id,device_id,revision,'Synthetic ambiguous','Cần bảo trì','relink');RAISE EXCEPTION 'AMBIGUOUS_LINK_ALLOWED';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 RESET ROLE;PERFORM set_config('request.jwt.claims','{}',true);
END $$;

ROLLBACK;
SELECT 'Four categories x five roles: replacement, stale revision, replay, mismatch, immutable events, exact audit and preserved old equipment passed. SQL claim simulation only; all fixtures rolled back.' AS result;
