-- Integration verification. Every fixture and temporary profile change rolls back.
BEGIN;
DO $$
DECLARE admin_id UUID; test_id UUID; session_id UUID := gen_random_uuid(); prefix TEXT := 'VERIFY-REGION-' || gen_random_uuid()::TEXT;
BEGIN
  SELECT id INTO admin_id FROM public.profiles WHERE role='admin' AND is_active=TRUE LIMIT 1;
  SELECT id INTO test_id FROM public.profiles WHERE role='viewer' AND is_active=TRUE LIMIT 1;
  IF admin_id IS NULL OR test_id IS NULL THEN RAISE EXCEPTION 'TEST_REQUIRES_ADMIN_AND_VIEWER'; END IF;
  PERFORM set_config('verify.admin',admin_id::TEXT,TRUE);
  INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES(session_id,admin_id,NOW(),NOW());
  PERFORM set_config('verify.admin_session',session_id::TEXT,TRUE);
  PERFORM set_config('verify.actor',test_id::TEXT,TRUE);
  PERFORM set_config('verify.prefix',prefix,TRUE);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',current_setting('verify.admin_session'),'exp',EXTRACT(EPOCH FROM NOW()+INTERVAL '1 hour')::BIGINT)::TEXT,TRUE);
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
  IF public.require_account_admin_session() IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'ADMIN_SESSION_REJECTED'; END IF;
  BEGIN PERFORM public.require_recent_authentication(); RAISE EXCEPTION 'RECENT_PASSWORD_CHECK_UNEXPECTEDLY_PASSED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.update_user_access(test_id,'technician','Miền Bắc');
  IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=session_id AND user_id=admin_id) THEN RAISE EXCEPTION 'ADMIN_SESSION_CHANGED'; END IF;
END;
$$;

DO $$
DECLARE regions TEXT[] := ARRAY['Miền Bắc','Miền Trung','Miền Nam'];
  idx INTEGER; other_idx INTEGER; affected INTEGER; prefix TEXT := current_setting('verify.prefix');
  own_code TEXT; other_code TEXT;
BEGIN
  FOR idx IN 1..3 LOOP
    EXECUTE 'SET LOCAL ROLE postgres';
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('verify.admin'),'role','authenticated','aal','aal2','session_id',current_setting('verify.admin_session'),'exp',EXTRACT(EPOCH FROM NOW()+INTERVAL '1 hour')::BIGINT)::TEXT,TRUE);
    PERFORM public.update_user_access(current_setting('verify.actor')::UUID,'technician',regions[idx]);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('verify.actor'),'role','authenticated','aal','aal2','session_id',current_setting('verify.admin_session'),'exp',EXTRACT(EPOCH FROM NOW()+INTERVAL '1 hour')::BIGINT)::TEXT,TRUE);
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF public.get_my_role() <> 'technician' OR public.get_my_region() <> regions[idx] THEN RAISE EXCEPTION 'ACTOR_SETUP_FAILED'; END IF;
    own_code := prefix||'-'||idx; other_idx := (idx % 3)+1; other_code := prefix||'-'||other_idx;

    IF (SELECT count(*) FROM public.distributors WHERE id LIKE prefix||'-%') <> 3 THEN RAISE EXCEPTION 'NATIONAL_NPP_READ_FAILED'; END IF;
    IF (SELECT count(*) FROM public.system_sets WHERE set_code IN (prefix||'-1',prefix||'-2',prefix||'-3')) <> 3 THEN RAISE EXCEPTION 'NATIONAL_SET_READ_FAILED'; END IF;
    IF (SELECT count(*) FROM public.repair_tickets WHERE id LIKE prefix||'-%') <> 3 THEN RAISE EXCEPTION 'NATIONAL_REPAIR_READ_FAILED'; END IF;
    IF (SELECT count(*) FROM public.dispensers WHERE id LIKE prefix||'-%') <> 3 THEN RAISE EXCEPTION 'NATIONAL_DEVICE_READ_FAILED'; END IF;
    BEGIN PERFORM public.require_account_admin_session(); RAISE EXCEPTION 'TECHNICIAN_ADMIN_ACCESS_ALLOWED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    UPDATE public.distributors SET phone='0990000000' WHERE id=own_code;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'OWN_NPP_WRITE_FAILED'; END IF;
    UPDATE public.distributors SET phone='Forbidden' WHERE id=other_code;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'CROSS_NPP_WRITE_ALLOWED'; END IF;
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

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('verify.admin'),'role','authenticated','aal','aal1','session_id',current_setting('verify.admin_session'),'exp',EXTRACT(EPOCH FROM NOW()+INTERVAL '1 hour')::BIGINT)::TEXT,TRUE);
  IF public.require_account_admin_session() IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'ADMIN_SESSION_REJECTED'; END IF;
  BEGIN
    UPDATE auth.sessions SET not_after=NOW()-INTERVAL '1 minute' WHERE id=current_setting('verify.admin_session')::UUID;
    PERFORM public.require_account_admin_session();
    RAISE EXCEPTION 'EXPIRED_SESSION_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
ROLLBACK;
SELECT 'PASS: national technician reads, three regional writes, cross-region and RPC rejection, admin access update without recent password, original session retained and expired session rejected; fixtures rolled back' AS verification;
