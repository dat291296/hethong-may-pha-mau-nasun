-- Metadata-only receipt for the recovered staging migration; reads no business rows.
BEGIN READ ONLY;
DO $$
DECLARE signature text; function_oid oid; definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_sync_change_feed(bigint,integer)',
    'public.get_sync_server_health()',
    'public.provision_admin_role(uuid,text)'
  ] LOOP
    function_oid := to_regprocedure(signature);
    IF function_oid IS NULL THEN RAISE EXCEPTION 'MISSING_SECURITY_FUNCTION:%', signature; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=function_oid AND prosecdef
      AND 'search_path=pg_catalog, public, pg_temp'=ANY(proconfig)) THEN
      RAISE EXCEPTION 'SECURITY_DEFINER_PATH_DRIFT:%', signature;
    END IF;
    IF has_function_privilege('anon',function_oid,'EXECUTE')
      OR NOT has_function_privilege('authenticated',function_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_DEFINER_EXECUTE_DRIFT:%', signature;
    END IF;
  END LOOP;
  SELECT pg_get_functiondef('public.provision_admin_role(uuid,text)'::regprocedure) INTO definition;
  IF definition !~* 'PERFORM public.require_account_admin_session\(\)' THEN
    RAISE EXCEPTION 'SECURITY_ADMIN_GRANT_SESSION_DRIFT';
  END IF;
END $$;
COMMIT;
