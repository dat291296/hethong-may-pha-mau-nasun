-- Integration verification. Every fixture and temporary profile change rolls back.
BEGIN;
DO $$
DECLARE admin_id UUID; test_id UUID; prefix TEXT := 'VERIFY-REGION-' || gen_random_uuid()::TEXT;
BEGIN
  SELECT id INTO admin_id FROM public.profiles WHERE role='admin' AND is_active=TRUE LIMIT 1;
  SELECT id INTO test_id FROM public.profiles WHERE role='viewer' AND is_active=TRUE LIMIT 1;
  IF admin_id IS NULL OR test_id IS NULL THEN RAISE EXCEPTION 'TEST_REQUIRES_ADMIN_AND_VIEWER'; END IF;
  PERFORM set_config('verify.admin',admin_id::TEXT,TRUE);
  PERFORM set_config('verify.actor',test_id::TEXT,TRUE);
  PERFORM set_config('verify.prefix',prefix,TRUE);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::TEXT,TRUE);
  INSERT INTO public.distributors(id,name,region) VALUES
    (prefix||'-1','Rollback verification North','Miền Bắc'),
    (prefix||'-2','Rollback verification Central','Miền Trung'),
    (prefix||'-3','Rollback verification South','Miền Nam');
  INSERT INTO public.system_sets(set_code,npp_id,npp_name,region,status)
    SELECT id,id,name,region,'DA_LAP_DAT' FROM public.distributors WHERE id LIKE prefix||'%';
  INSERT INTO public.system_sets(set_code,region,status) VALUES(prefix||'-empty','','TRONG_KHO');
  INSERT INTO public.dispensers(id,model,serial,set_code,is_assigned)
    SELECT set_code,'Verification',set_code,set_code,TRUE FROM public.system_sets WHERE set_code LIKE prefix||'%' AND npp_id IS NOT NULL;
  INSERT INTO public.repair_tickets(id,ticket_code,npp_id,npp_name,technician,product_category,machine_model,serial_number,error_description)
    SELECT id,id,id,name,'Rollback verification','Máy chiết','Verification',id,'Rollback verification' FROM public.distributors WHERE id LIKE prefix||'%';
  UPDATE public.profiles SET role='technician',managed_region='Miền Bắc' WHERE id=test_id;
END;
$$;

DO $$
DECLARE regions TEXT[] := ARRAY['Miền Bắc','Miền Trung','Miền Nam'];
  idx INTEGER; other_idx INTEGER; affected INTEGER; prefix TEXT := current_setting('verify.prefix');
  own_code TEXT; other_code TEXT;
BEGIN
  FOR idx IN 1..3 LOOP
    EXECUTE 'SET LOCAL ROLE postgres';
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('verify.admin'),'role','authenticated','aal','aal2')::TEXT,TRUE);
    UPDATE public.profiles SET managed_region=regions[idx] WHERE id=current_setting('verify.actor')::UUID;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('verify.actor'),'role','authenticated','aal','aal2')::TEXT,TRUE);
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF public.get_my_role() <> 'technician' OR public.get_my_region() <> regions[idx] THEN RAISE EXCEPTION 'ACTOR_SETUP_FAILED'; END IF;
    own_code := prefix||'-'||idx; other_idx := (idx % 3)+1; other_code := prefix||'-'||other_idx;

    UPDATE public.system_sets SET notes='Own region confirmed' WHERE set_code=own_code;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'OWN_SET_WRITE_FAILED'; END IF;
    UPDATE public.repair_tickets SET notes='Own region confirmed' WHERE id=own_code;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'OWN_REPAIR_WRITE_FAILED'; END IF;
    UPDATE public.dispensers SET model='Own region confirmed' WHERE id=own_code;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'OWN_DEVICE_WRITE_FAILED'; END IF;

    UPDATE public.system_sets SET notes='Forbidden' WHERE set_code=other_code;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'CROSS_SET_WRITE_ALLOWED'; END IF;
    UPDATE public.repair_tickets SET notes='Forbidden' WHERE id=other_code;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'CROSS_REPAIR_WRITE_ALLOWED'; END IF;
    UPDATE public.dispensers SET model='Forbidden' WHERE id=other_code;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'CROSS_DEVICE_WRITE_ALLOWED'; END IF;
    UPDATE public.system_sets SET notes='Forbidden' WHERE set_code=prefix||'-empty';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'EMPTY_REGION_WRITE_ALLOWED'; END IF;
    BEGIN
      UPDATE public.system_sets SET region=regions[other_idx] WHERE set_code=own_code;
      RAISE EXCEPTION 'REGION_MOVE_ALLOWED';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.repair_tickets SET npp_id=NULL WHERE id=own_code;
      RAISE EXCEPTION 'ORPHAN_REPAIR_WRITE_ALLOWED';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.system_sets SET npp_id=other_code WHERE set_code=own_code;
      RAISE EXCEPTION 'CROSS_NPP_MOVE_ALLOWED';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    -- Emulate SECURITY DEFINER execution: RLS is bypassed but trigger must reject.
    EXECUTE 'SET LOCAL ROLE postgres';
    BEGIN
      UPDATE public.system_sets SET notes='Forbidden RPC write' WHERE set_code=other_code;
      RAISE EXCEPTION 'DEFINER_CROSS_REGION_ALLOWED';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('verify.admin'),'role','authenticated','aal','aal2')::TEXT,TRUE);
  UPDATE public.profiles SET managed_region='Toàn Quốc' WHERE id=current_setting('verify.actor')::UUID;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('verify.actor'),'role','authenticated','aal','aal2')::TEXT,TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.system_sets SET notes='Forbidden nationwide technician' WHERE set_code LIKE prefix||'%';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'NATIONWIDE_TECHNICIAN_WRITE_ALLOWED'; END IF;
  EXECUTE 'SET LOCAL ROLE postgres';
END;
$$;
ROLLBACK;
SELECT 'PASS: all three regional technician writes confirmed; cross-region, orphan and RPC writes blocked; all fixtures and profile changes rolled back' AS verification;
