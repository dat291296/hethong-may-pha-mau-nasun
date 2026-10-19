-- Run only on approved isolated staging. Every synthetic write is rolled back.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $$
DECLARE actor record; prefix text:='SYN-CHECK-'||replace(gen_random_uuid()::text,'-','');
 code text; op text; payload jsonb; first_result jsonb; replay jsonb; npp_a text; npp_b text; maintenance_id uuid; assembly_code text;
BEGIN
 FOR actor IN SELECT DISTINCT ON(p.role) p.id,p.role FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE u.raw_app_meta_data->>'nasun_rls_fixture'='true' AND p.is_active AND p.role IN('admin','manager','qc','technician','viewer') ORDER BY p.role,p.created_at DESC LOOP
  code:=prefix||'-'||actor.role; npp_a:=code||'-A';npp_b:=code||'-B';
  INSERT INTO public.distributors(id,name,region,status) VALUES(npp_a,'Synthetic acceptance A','Miền Bắc','Đang hợp tác'),(npp_b,'Synthetic acceptance B','Miền Bắc','Đang hợp tác');
  INSERT INTO public.system_sets(set_code,npp_name,region,status) VALUES(code,'Synthetic warehouse','Miền Bắc','TRONG_KHO');
  IF actor.role='admin' THEN
   INSERT INTO public.dispensers(id,model,serial,is_assigned) VALUES(code||'-D','Synthetic',code||'-D',false);
   INSERT INTO public.mixers(id,model,serial,is_assigned) VALUES(code||'-M','Synthetic',code||'-M',false);
   INSERT INTO public.computers(id,type,serial,is_assigned) VALUES(code||'-C','Case',code||'-C',false);
   INSERT INTO public.printers(id,model,serial,is_assigned) VALUES(code||'-P','Synthetic',code||'-P',false);
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated','session_id',gen_random_uuid(),'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
  SET LOCAL ROLE authenticated;
  op:=gen_random_uuid()::text;
  payload:=jsonb_build_object('setCode',code,'nppId',npp_a,'installedDate',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'photos','[]'::jsonb);
  IF actor.role='viewer' THEN
   BEGIN PERFORM public.execute_equipment_workflow(op,'INSTALL',payload);RAISE EXCEPTION 'VIEWER_WRITE_ALLOWED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ELSE
   first_result:=public.execute_equipment_workflow(op,'INSTALL',payload);
   replay:=public.execute_equipment_workflow(op,'INSTALL',payload);
   IF replay IS DISTINCT FROM first_result THEN RAISE EXCEPTION 'REPLAY_CHANGED'; END IF;
   BEGIN PERFORM public.execute_equipment_workflow(op,'INSTALL',payload||'{"notes":"different"}'::jsonb);RAISE EXCEPTION 'MISMATCH_ALLOWED';EXCEPTION WHEN check_violation THEN NULL;END;
   maintenance_id:=gen_random_uuid();
   PERFORM public.complete_machine_maintenance(maintenance_id,code,current_date,(current_date+365),'Synthetic maintenance','[]'::jsonb,false);
   PERFORM public.complete_machine_maintenance(maintenance_id,code,current_date,(current_date+365),'Synthetic maintenance','[]'::jsonb,false);
   PERFORM public.execute_equipment_workflow(gen_random_uuid()::text,'TRANSFER',jsonb_build_object('setCode',code,'newNppId',npp_b));
   PERFORM public.execute_equipment_workflow(gen_random_uuid()::text,'WITHDRAW',jsonb_build_object('setCode',code,'reason','Synthetic test','warehouseRegion','Miền Bắc'));
   IF NOT EXISTS(SELECT 1 FROM public.system_sets WHERE set_code=code AND npp_id IS NULL AND status='TRONG_KHO') THEN RAISE EXCEPTION 'WITHDRAW_FAILED';END IF;
   IF (SELECT count(*) FROM public.audit_logs WHERE set_code=code)<>4 THEN RAISE EXCEPTION 'AUDIT_DUPLICATED_OR_MISSING';END IF;
  END IF;
  IF actor.role='admin' THEN
   assembly_code:=code||'-ASSEMBLED';op:=gen_random_uuid()::text;
   payload:=jsonb_build_object('set_code',assembly_code,'region','Miền Bắc','dispenser_id',code||'-D','mixer_id',code||'-M','computer_id',code||'-C','printer_id',code||'-P');
   first_result:=public.assemble_system_set_atomic(op,payload);
   IF public.assemble_system_set_atomic(op,payload) IS DISTINCT FROM first_result THEN RAISE EXCEPTION 'ASSEMBLY_REPLAY_CHANGED';END IF;
   BEGIN PERFORM public.assemble_system_set_atomic(gen_random_uuid()::text,payload||jsonb_build_object('set_code',assembly_code||'-OTHER'));RAISE EXCEPTION 'DEVICE_REUSED';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
   IF NOT EXISTS(SELECT 1 FROM public.system_sets WHERE set_code=assembly_code AND computer_serial=code||'-C') THEN RAISE EXCEPTION 'ASSEMBLY_SERIAL_LOST';END IF;
   BEGIN UPDATE public.system_sets SET set_code=code||'-RENAMED' WHERE set_code=code;RAISE EXCEPTION 'MACHINE_CODE_CHANGED';EXCEPTION WHEN check_violation THEN NULL;END;
   BEGIN INSERT INTO public.repair_tickets(id,ticket_code,technician,product_category,machine_model,serial_number,processing_status,customer_return_status) VALUES(code,code,'Synthetic','Máy chiết','Synthetic',code,'Chưa xử lý','Đã gửi trả');RAISE EXCEPTION 'UNFINISHED_REPAIR_RETURNED';EXCEPTION WHEN check_violation THEN NULL;END;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{}',true);
 END LOOP;
 IF (SELECT count(distinct p.role) FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE u.raw_app_meta_data->>'nasun_rls_fixture'='true' AND p.is_active AND p.role IN('admin','manager','qc','technician','viewer'))<>5 THEN RAISE EXCEPTION 'FIVE_FIXTURE_ROLES_REQUIRED';END IF;
END $$;
ROLLBACK;
SELECT 'Five-role SQL authorization, workflow and maintenance replay, assembly, repair lifecycle and audit rollback probes passed; no real JWT login was tested.' AS result;
