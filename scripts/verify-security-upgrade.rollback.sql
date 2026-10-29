-- Execute only on approved nasun-staging. All synthetic rows and sessions roll back.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $$
DECLARE role_name text; actor uuid; sid uuid; prefix text:='SYN-UPGRADE-'||gen_random_uuid();
 claims jsonb; n integer; denied boolean; result jsonb; event_id uuid; target uuid;
 admin_actor uuid; admin_sid uuid; admin_claims jsonb; viewer_sid uuid; ticket_id text;
 assigned_region text; own_npp text; foreign_npp text; foreign_region text;
BEGIN
 FOREACH assigned_region IN ARRAY ARRAY['Miền Bắc','Miền Trung','Miền Nam'] LOOP
 prefix:='SYN-UPGRADE-'||gen_random_uuid();
 own_npp:=prefix||CASE assigned_region WHEN 'Miền Bắc' THEN '-N' WHEN 'Miền Trung' THEN '-C' ELSE '-S' END;
 foreign_region:=CASE WHEN assigned_region='Miền Nam' THEN 'Miền Bắc' ELSE 'Miền Nam' END;
 foreign_npp:=prefix||CASE WHEN assigned_region='Miền Nam' THEN '-N' ELSE '-S' END;
 INSERT INTO public.distributors(id,name,region,status) VALUES
 (prefix||'-N','Synthetic upgrade north','Miền Bắc','Đang hợp tác'),
 (prefix||'-C','Synthetic upgrade central','Miền Trung','Đang hợp tác'),
 (prefix||'-S','Synthetic upgrade south','Miền Nam','Đang hợp tác');
 FOREACH role_name IN ARRAY ARRAY['admin','manager','technician','qc','viewer'] LOOP
  actor:=gen_random_uuid(); sid:=gen_random_uuid();
  INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
   VALUES(actor,'nasun-rls-upgrade-'||actor||'@example.invalid',jsonb_build_object(
    'nasun_rls_fixture',true,'fixture_role',role_name,'fixture_region',CASE WHEN role_name='admin' THEN 'Toàn Quốc' ELSE assigned_region END),'{}');
  INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after)
   VALUES(sid,actor,now(),now(),now()+interval '1 hour');
  claims:=jsonb_build_object('sub',actor,'role','authenticated','session_id',sid,
   'exp',extract(epoch FROM now()+interval '1 hour')::bigint,'aal','aal1');
  PERFORM set_config('request.jwt.claims',claims::text,true);
  SET LOCAL ROLE authenticated;
  IF public.has_active_app_session() THEN RAISE EXCEPTION 'UNREGISTERED_SESSION_ACCEPTED'; END IF;
  denied:=false;
  BEGIN PERFORM public.require_account_admin_session(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'UNREGISTERED_ADMIN_ACCEPTED'; END IF;
  denied:=false;
  BEGIN PERFORM public.provision_admin_role(NULL,'Synthetic unregistered session denial');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'UNREGISTERED_ADMIN_PROVISION_ACCEPTED'; END IF;
  PERFORM public.register_trusted_device_session(prefix||actor,'Synthetic upgrade fixture','UTC');
  IF role_name='admin' THEN admin_actor:=actor; admin_sid:=sid; admin_claims:=claims; END IF;
  IF role_name='viewer' THEN target:=actor; viewer_sid:=sid; END IF;
  IF NOT public.has_active_app_session() THEN RAISE EXCEPTION 'REGISTERED_SESSION_REJECTED'; END IF;
  IF public.can_access_region(assigned_region) IS DISTINCT FROM true THEN RAISE EXCEPTION 'OWN_REGION_DENIED'; END IF;
  IF public.can_access_region(foreign_region) IS DISTINCT FROM (role_name='admin') THEN RAISE EXCEPTION 'FOREIGN_REGION_ALLOWED'; END IF;
  IF NOT public.can_receive_sync_topic('nasun:sync:global') THEN RAISE EXCEPTION 'VALID_GLOBAL_TOPIC_DENIED'; END IF;
  IF public.can_receive_sync_topic('nasun:sync:admin') IS DISTINCT FROM (role_name='admin') THEN RAISE EXCEPTION 'ADMIN_TOPIC_LEAK'; END IF;
  IF role_name<>'admin' AND public.can_receive_sync_topic('nasun:sync:'||replace(lower(foreign_region),' ','_')) THEN RAISE EXCEPTION 'FOREIGN_TOPIC_LEAK'; END IF;
  SELECT count(*) INTO n FROM public.distributors WHERE id IN (prefix||'-N',prefix||'-C',prefix||'-S');
  IF n<>(CASE WHEN role_name='admin' THEN 3 ELSE 1 END) THEN RAISE EXCEPTION 'REGION_READ_LEAK:%:%',role_name,n; END IF;
  IF role_name<>'admin' THEN
   denied:=false;
   BEGIN PERFORM public.require_account_admin_session(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
   IF NOT denied THEN RAISE EXCEPTION 'NONADMIN_ACCEPTED'; END IF;
  END IF;
  IF role_name<>'viewer' THEN
   ticket_id:=prefix||'-REPAIR-'||role_name;
   INSERT INTO public.repair_tickets(id,ticket_code,date,technician,npp_id,npp_name,product_category,machine_model,serial_number,assigned_user_id)
    VALUES(ticket_id,ticket_id,current_date,'Synthetic technician',own_npp,'Synthetic fixture','Máy chiết','Synthetic model',ticket_id,actor);
   SELECT count(*) INTO n FROM public.repair_tickets WHERE id=ticket_id AND last_updated_by=actor AND record_version=1;
   IF n<>1 THEN RAISE EXCEPTION 'TEAM_ACTOR_METADATA_MISSING'; END IF;
   IF role_name<>'admin' THEN
    denied:=false;
    BEGIN UPDATE public.repair_tickets SET npp_id=foreign_npp WHERE id=ticket_id;
    EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'CROSS_REGION_TEAM_TRANSFER_ALLOWED'; END IF;
    denied:=false;
    BEGIN UPDATE public.repair_tickets SET npp_id=NULL WHERE id=ticket_id;
    EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'NULL_NPP_TEAM_BYPASS'; END IF;
   END IF;
   FOR n IN 1..30 LOOP
    result:=public.consume_machine_evidence_quota();
    IF result->>'allowed'<>'true' THEN RAISE EXCEPTION 'QUOTA_PREMATURE_DENIAL'; END IF;
   END LOOP;
   IF public.consume_machine_evidence_quota()->>'allowed'<>'false' THEN RAISE EXCEPTION 'REPLAY_QUOTA_BYPASS'; END IF;
  END IF;
  result:=public.record_security_event('PERMISSION_DENIED','{"Password":"synthetic","nested":[{"Access_Token":"synthetic","safe":"retained"}]}'::jsonb);
  event_id:=(result->>'id')::uuid;
  denied:=false;
  BEGIN PERFORM public.record_security_event('ACCOUNT_ROLE_CHANGED','{}'); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'SERVER_EVENT_SPOOF_ALLOWED'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{}',true);
  SELECT details INTO result FROM public.security_events WHERE id=event_id;
  IF result->>'Password'<>'[REDACTED]' OR result#>>'{nested,0,Access_Token}'<>'[REDACTED]'
    OR result#>>'{nested,0,safe}'<>'retained' THEN RAISE EXCEPTION 'NESTED_SECRET_LEAK'; END IF;
  denied:=false;
  BEGIN UPDATE public.security_events SET details='{}' WHERE id=event_id; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'PRIVILEGED_EVENT_UPDATE_ALLOWED'; END IF;
  denied:=false;
  BEGIN DELETE FROM public.security_events WHERE id=event_id; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'PRIVILEGED_EVENT_DELETE_ALLOWED'; END IF;
  UPDATE public.account_sessions SET revoked_at=now() WHERE session_id=sid::text;
  PERFORM set_config('request.jwt.claims',claims::text,true);
  SET LOCAL ROLE authenticated;
  IF public.has_active_app_session() THEN RAISE EXCEPTION 'REVOKED_SESSION_ALLOWED'; END IF;
  IF public.can_receive_sync_topic('nasun:sync:global') THEN RAISE EXCEPTION 'REVOKED_GLOBAL_TOPIC_ALLOWED'; END IF;
  SELECT count(*) INTO n FROM public.distributors WHERE id LIKE prefix||'%';
  IF n<>0 THEN RAISE EXCEPTION 'REVOKED_READ_ALLOWED'; END IF;
  denied:=false;
  BEGIN PERFORM public.get_sync_change_feed(0,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'REVOKED_FEED_ALLOWED'; END IF;
  denied:=false;
  BEGIN PERFORM public.get_sync_server_health(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'REVOKED_HEALTH_ALLOWED'; END IF;
  denied:=false;
  BEGIN PERFORM public.provision_admin_role(NULL,'Synthetic revoked session denial');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'REVOKED_ADMIN_PROVISION_ACCEPTED'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{}',true);
 END LOOP;
 END LOOP;
 -- Restore only this transaction's synthetic admin session for access-change checks.
 UPDATE public.account_sessions SET revoked_at=NULL,revoked_reason=NULL WHERE session_id=admin_sid::text;
 UPDATE public.account_sessions SET revoked_at=NULL,revoked_reason=NULL WHERE session_id=viewer_sid::text;
 PERFORM set_config('request.jwt.claims',admin_claims::text,true);
 SET LOCAL ROLE authenticated;
 denied:=false;
 BEGIN PERFORM public.update_user_access(target,'technician','Toàn Quốc'); EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'NATIONWIDE_ROLE_ASSIGNMENT_ALLOWED'; END IF;
 result:=public.update_user_access(target,'technician','Miền Trung');
 IF result->>'managed_region'<>'Miền Trung' THEN RAISE EXCEPTION 'ADMIN_ACCESS_CHANGE_FAILED'; END IF;
 RESET ROLE;
 IF NOT EXISTS (SELECT 1 FROM public.account_sessions WHERE session_id=viewer_sid::text
  AND revoked_at IS NOT NULL AND revoked_reason='ACCOUNT_ACCESS_CHANGED') THEN RAISE EXCEPTION 'ACCESS_CHANGE_DID_NOT_REVOKE_SESSION'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',target,'role','authenticated','session_id',viewer_sid,
   'exp',extract(epoch FROM now()+interval '1 hour')::bigint)::text,true);
 SET LOCAL ROLE authenticated;
 IF public.has_active_app_session() THEN RAISE EXCEPTION 'OLD_TOKEN_AFTER_REGION_CHANGE_ALLOWED'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 denied:=false;
 BEGIN UPDATE public.repair_tickets SET notes='Synthetic unattributed service write' WHERE id=prefix||'-REPAIR-admin';
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'UNATTRIBUTED_SERVICE_TEAM_WRITE_ALLOWED'; END IF;
 IF has_table_privilege('authenticated','public.audit_logs','UPDATE') OR
    has_table_privilege('authenticated','public.audit_logs','DELETE') OR
    has_table_privilege('service_role','public.audit_logs','TRUNCATE') THEN RAISE EXCEPTION 'AUDIT_MUTATION_GRANT'; END IF;
 IF has_function_privilege('authenticated','public.get_technical_support_contacts()','EXECUTE') THEN RAISE EXCEPTION 'SUPPORT_RPC_EXPOSED'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: 5 roles x 3 regions, unregistered/revoked sessions, feed/health, retry quotas, event allowlist/redaction/immutability, account-change revocation, team attribution/region/null-NPP/service paths, audit grants; all fixtures rolled back' AS result;
