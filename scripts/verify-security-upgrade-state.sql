-- Metadata only: fail on authorization drift, without reading business rows.
BEGIN READ ONLY;
DO $$
DECLARE definition text; item text; table_name text;
BEGIN
 SELECT pg_get_functiondef('public.provision_admin_role(uuid,text)'::regprocedure) INTO definition;
 IF definition !~* 'PERFORM public.require_account_admin_session\(\)' THEN
  RAISE EXCEPTION 'SECURITY_ADMIN_GRANT_SESSION_DRIFT';
 END IF;
 FOREACH item IN ARRAY ARRAY['has_active_app_session','require_account_admin_session','get_my_role','get_sync_server_health'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=item LIMIT 1;
  IF definition IS NULL OR (item='has_active_app_session' AND definition !~* 'has_valid_auth_session')
    OR (item<>'has_active_app_session' AND definition !~* 'has_active_app_session') THEN
   RAISE EXCEPTION 'SECURITY_SESSION_GUARD_DRIFT:%',item;
  END IF;
 END LOOP;
 SELECT pg_get_functiondef('public.can_access_region(text)'::regprocedure) INTO definition;
 IF definition ~ 'Toàn Quốc' OR definition !~* 'has_active_app_session' THEN RAISE EXCEPTION 'SECURITY_REGION_HELPER_DRIFT'; END IF;
 FOREACH table_name IN ARRAY ARRAY['distributors','system_sets','dispensers','mixers','computers','printers','repair_tickets'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=table_name
    AND p.policyname='canonical_region_read' AND p.permissive='RESTRICTIVE') THEN
   RAISE EXCEPTION 'SECURITY_REGION_POLICY_DRIFT:%',table_name;
  END IF;
 END LOOP;
 IF has_function_privilege('authenticated','public.get_technical_support_contacts()','execute') OR
    has_function_privilege('authenticated','public.consume_security_rate_limit(text,integer,integer)','execute') OR
    has_function_privilege('anon','public.record_security_event(text,jsonb)','execute') THEN
  RAISE EXCEPTION 'SECURITY_RPC_GRANT_DRIFT';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages'
  AND policyname='nasun_active_sync_session' AND permissive='RESTRICTIVE' AND qual LIKE '%has_active_app_session%') THEN
  RAISE EXCEPTION 'SECURITY_REALTIME_SESSION_POLICY_DRIFT';
 END IF;
 FOREACH table_name IN ARRAY ARRAY['audit_logs','security_events'] LOOP
  FOREACH item IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(item,'public.'||table_name,'UPDATE') OR has_table_privilege(item,'public.'||table_name,'DELETE')
     OR has_table_privilege(item,'public.'||table_name,'TRUNCATE') THEN RAISE EXCEPTION 'SECURITY_HISTORY_GRANT_DRIFT:%:%',table_name,item; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid=('public.'||table_name)::regclass
      AND NOT tgisinternal AND tgenabled='O' AND (tgtype & 2)=2 AND ((tgtype & 16)=16 OR (tgtype & 32)=32))<2 THEN
   RAISE EXCEPTION 'SECURITY_HISTORY_TRIGGER_DRIFT:%',table_name;
  END IF;
 END LOOP;
END $$;
COMMIT;
SELECT 'PASS: effective security metadata matches canonical guards' AS result;
