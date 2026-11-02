BEGIN;
SET LOCAL statement_timeout='60s';
DO $$
DECLARE prefix text:='SYN-WITHDRAW-'||gen_random_uuid(); actor uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); item record; total integer;
BEGIN
  IF to_regprocedure('public.initialize_staging_test_profile()') IS NULL THEN RAISE EXCEPTION 'STAGING_REQUIRED'; END IF;
  INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES(actor,'nasun-rls-module2-'||actor||'@example.invalid','{"nasun_rls_fixture":true,"fixture_role":"admin","fixture_region":"Toàn Quốc"}','{}');
  INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after) VALUES(sid,actor,now(),now(),now()+interval '1 hour');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',sid,'aal','aal1','exp',extract(epoch from now()+interval '1 hour')::bigint)::text,true);
  SET LOCAL ROLE authenticated;
  PERFORM public.register_trusted_device_session(prefix,'Synthetic withdrawal','UTC');
  INSERT INTO public.system_sets(set_code,npp_name,region,status) VALUES(prefix||'-WAREHOUSE','Synthetic warehouse maintenance','Miền Trung','BAO_THUONG_BAO_TRI');
  UPDATE public.system_sets SET status='TRONG_KHO' WHERE set_code=prefix||'-WAREHOUSE';
  IF NOT EXISTS(SELECT 1 FROM public.system_sets WHERE set_code=prefix||'-WAREHOUSE' AND status='TRONG_KHO') THEN RAISE EXCEPTION 'WAREHOUSE_MAINTENANCE_MISCLASSIFIED'; END IF;
  INSERT INTO public.distributors(id,name,region,status) VALUES(prefix,'Synthetic withdrawal NPP','Miền Trung','Đang hợp tác');
  INSERT INTO public.system_sets(set_code,npp_id,npp_name,region,status,dispenser_serial) VALUES(prefix,prefix,'Synthetic withdrawal NPP','Miền Trung','DA_LAP_DAT','SYN-SERIAL');
  INSERT INTO public.dispensers(id,model,set_code,is_assigned) VALUES(prefix,'Synthetic',prefix,true);
  INSERT INTO public.mixers(id,model,set_code,is_assigned) VALUES(prefix,'Synthetic',prefix,true);
  INSERT INTO public.computers(id,set_code,is_assigned) VALUES(prefix,prefix,true);
  INSERT INTO public.printers(id,set_code,is_assigned) VALUES(prefix,prefix,true);
  UPDATE public.system_sets SET dispenser_id=prefix,mixer_id=prefix,computer_id=prefix,printer_id=prefix WHERE set_code=prefix;
  PERFORM public.execute_equipment_workflow(prefix,'WITHDRAW',jsonb_build_object('setCode',prefix,'warehouseRegion','Miền Trung','reason','Synthetic withdrawal','isDistributorClosure',true));
  IF NOT EXISTS(SELECT 1 FROM public.system_sets WHERE set_code=prefix AND npp_id IS NULL AND status='DA_THU_HOI' AND dispenser_id IS NULL AND mixer_id IS NULL AND computer_id IS NULL AND printer_id IS NULL AND dispenser_serial='SYN-SERIAL') THEN RAISE EXCEPTION 'PARENT_RELEASE_FAILED'; END IF;
  FOR item IN SELECT unnest(ARRAY['dispensers','mixers','computers','printers']) tbl LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id=$1 AND set_code IS NULL AND is_assigned=false',item.tbl) INTO total USING prefix;
    IF total<>1 THEN RAISE EXCEPTION 'DEVICE_RELEASE_FAILED'; END IF;
  END LOOP;
  -- A repeated acknowledged operation returns the receipt rather than releasing twice.
  PERFORM public.execute_equipment_workflow(prefix,'WITHDRAW',jsonb_build_object('setCode',prefix,'warehouseRegion','Miền Trung','reason','Synthetic withdrawal','isDistributorClosure',true));
  BEGIN
    UPDATE public.system_sets SET status='DA_LAP_DAT',npp_id=prefix WHERE set_code=prefix;
    RAISE EXCEPTION 'EMPTY_ARCHIVE_INSTALL_ALLOWED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'WITHDRAWN_SET_REQUIRES_NEW_ASSEMBLY' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

