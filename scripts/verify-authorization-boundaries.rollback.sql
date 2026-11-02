-- Approved staging only. All fixture users, sessions and business writes roll back.
-- Expected decisions are generated from the frontend RBAC and region helpers.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $authorization$
DECLARE
  expectations jsonb := '[]'::jsonb /* AUTHORIZATION_CASES */;
  assigned_region text; role_name text; target_region text; session_state text;
  actor uuid; sid uuid; admin_actor uuid; admin_claims jsonb; claims jsonb;
  prefix text := 'SYN-AUTH-' || gen_random_uuid();
  target_id text; source_id text; case_item jsonb;
  permitted boolean; denied boolean; affected integer; checks integer := 0;
BEGIN
  IF to_regprocedure('public.initialize_staging_test_profile()') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zzzz_staging_test_profile' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'APPROVED_STAGING_FIXTURES_REQUIRED';
  END IF;
  IF jsonb_array_length(expectations) <> 225 THEN RAISE EXCEPTION 'AUTHORIZATION_CASES_REQUIRED'; END IF;

  -- A separate admin fixture stays active while test subjects are disabled.
  admin_actor := gen_random_uuid(); sid := gen_random_uuid();
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
  VALUES(admin_actor, 'nasun-rls-module2-' || admin_actor || '@example.invalid',
    '{"nasun_rls_fixture":true,"fixture_role":"admin","fixture_region":"Toàn Quốc"}', '{}');
  INSERT INTO auth.sessions(id, user_id, created_at, updated_at, not_after)
  VALUES(sid, admin_actor, now(), now(), now() + interval '1 hour');
  admin_claims := jsonb_build_object('sub', admin_actor, 'role', 'authenticated', 'session_id', sid,
    'exp', extract(epoch FROM now() + interval '1 hour')::bigint, 'aal', 'aal1');
  PERFORM set_config('request.jwt.claims', admin_claims::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.register_trusted_device_session(prefix || admin_actor, 'Synthetic fixture admin', 'UTC');

  FOREACH assigned_region IN ARRAY ARRAY['Miền Bắc', 'Miền Trung', 'Miền Nam'] LOOP
    PERFORM set_config('request.jwt.claims', admin_claims::text, true);
    SET LOCAL ROLE authenticated;
    FOREACH target_region IN ARRAY ARRAY['Miền Bắc', 'Miền Trung', 'Miền Nam'] LOOP
      INSERT INTO public.distributors(id, name, region, status)
      VALUES(prefix || assigned_region || target_region, 'Synthetic authorization NPP', target_region, 'Đang hợp tác');
    END LOOP;
    FOREACH role_name IN ARRAY ARRAY['admin', 'manager', 'technician', 'qc', 'viewer'] LOOP
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', '{}', true);
      actor := gen_random_uuid(); sid := gen_random_uuid();
      INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
      VALUES(actor, 'nasun-rls-module2-' || actor || '@example.invalid', jsonb_build_object(
        'nasun_rls_fixture', true, 'fixture_role', role_name,
        'fixture_region', CASE WHEN role_name = 'admin' THEN 'Toàn Quốc' ELSE assigned_region END), '{}');
      INSERT INTO auth.sessions(id, user_id, created_at, updated_at, not_after)
      VALUES(sid, actor, now(), now(), now() + interval '1 hour');
      claims := jsonb_build_object('sub', actor, 'role', 'authenticated', 'session_id', sid,
        'exp', extract(epoch FROM now() + interval '1 hour')::bigint, 'aal', 'aal1');
      PERFORM set_config('request.jwt.claims', claims::text, true);
      SET LOCAL ROLE authenticated;
      PERFORM public.register_trusted_device_session(prefix || actor, 'Synthetic authorization test', 'UTC');
      IF public.get_my_role() IS DISTINCT FROM role_name THEN RAISE EXCEPTION 'FIXTURE_ROLE_MISMATCH'; END IF;

      FOR case_item IN SELECT value FROM jsonb_array_elements(expectations)
        WHERE value->>'role' = role_name AND value->>'assignedRegion' = assigned_region LOOP
        target_region := case_item->>'targetRegion';
        target_id := prefix || assigned_region || target_region;
        source_id := CASE WHEN case_item->>'action' = 'move'
          THEN prefix || assigned_region || assigned_region ELSE target_id END;
        permitted := false;
        -- Each probe is a subtransaction. Even successful operations are undone
        -- before the next probe, so DELETE and region moves cannot hide failures.
        BEGIN
          CASE case_item->>'action'
            WHEN 'read' THEN
              SELECT count(*) INTO affected FROM public.distributors WHERE id = target_id;
            WHEN 'create' THEN
              INSERT INTO public.distributors(id, name, region, status)
              VALUES(target_id || '-new', 'Synthetic authorization insert', target_region, 'Đang hợp tác');
              GET DIAGNOSTICS affected = ROW_COUNT;
            WHEN 'edit' THEN
              UPDATE public.distributors SET name = 'Synthetic authorization edit' WHERE id = source_id;
              GET DIAGNOSTICS affected = ROW_COUNT;
            WHEN 'delete' THEN
              DELETE FROM public.distributors WHERE id = source_id;
              GET DIAGNOSTICS affected = ROW_COUNT;
            WHEN 'move' THEN
              UPDATE public.distributors SET region = target_region, npp_code = NULL WHERE id = source_id;
              GET DIAGNOSTICS affected = ROW_COUNT;
            ELSE RAISE EXCEPTION 'UNSUPPORTED_AUTHORIZATION_ACTION';
          END CASE;
          permitted := affected = 1;
          RAISE SQLSTATE 'Z0001';
        EXCEPTION
          WHEN SQLSTATE 'Z0001' THEN NULL;
          WHEN insufficient_privilege THEN permitted := false;
        END;
        IF permitted IS DISTINCT FROM (case_item->>'allowed')::boolean THEN
          RAISE EXCEPTION 'AUTHORIZATION_MISMATCH:%:%:%:%', role_name, assigned_region, target_region, case_item->>'action';
        END IF;
        checks := checks + 1;
      END LOOP;
      denied := false;
      BEGIN PERFORM public.require_account_admin_session();
      EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
      IF denied IS DISTINCT FROM (role_name <> 'admin') THEN RAISE EXCEPTION 'ADMIN_RPC_ROLE_MISMATCH'; END IF;

      FOREACH session_state IN ARRAY ARRAY['revoked', 'expired', 'disabled'] LOOP
        RESET ROLE;
        PERFORM set_config('request.jwt.claims', '{}', true);
        sid := gen_random_uuid();
        INSERT INTO auth.sessions(id, user_id, created_at, updated_at, not_after)
        VALUES(sid, actor, now(), now(), now() + interval '1 hour');
        claims := claims || jsonb_build_object('session_id', sid);
        PERFORM set_config('request.jwt.claims', claims::text, true);
        SET LOCAL ROLE authenticated;
        PERFORM public.register_trusted_device_session(prefix || sid, 'Synthetic session rejection', 'UTC');
        RESET ROLE;
        -- Use the fixture admin session for protected profile changes.
        PERFORM set_config('request.jwt.claims', admin_claims::text, true);
        IF session_state = 'revoked' THEN
          UPDATE public.account_sessions SET revoked_at = now() WHERE user_id = actor AND session_id = sid::text;
        ELSIF session_state = 'expired' THEN
          UPDATE auth.sessions SET not_after = now() - interval '1 minute' WHERE id = sid;
        ELSE
          UPDATE public.profiles SET is_active = false WHERE id = actor;
        END IF;
        PERFORM set_config('request.jwt.claims', claims::text, true);
        SET LOCAL ROLE authenticated;
        IF public.get_my_role() IS NOT NULL OR public.has_active_app_session() THEN RAISE EXCEPTION 'INVALID_SESSION_ACCEPTED:%', session_state; END IF;
        SELECT count(*) INTO affected FROM public.distributors WHERE id LIKE prefix || '%';
        IF affected <> 0 THEN RAISE EXCEPTION 'INVALID_SESSION_READ_ALLOWED:%', session_state; END IF;
        denied := false;
        BEGIN
          INSERT INTO public.distributors(id, name, region, status)
          VALUES(prefix || sid, 'Synthetic rejected session', assigned_region, 'Đang hợp tác');
        EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
        IF NOT denied THEN RAISE EXCEPTION 'INVALID_SESSION_WRITE_ALLOWED:%', session_state; END IF;
        denied := false;
        BEGIN PERFORM public.get_sync_server_health();
        EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
        IF NOT denied THEN RAISE EXCEPTION 'INVALID_SESSION_RPC_ALLOWED:%', session_state; END IF;
        RESET ROLE;
        PERFORM set_config('request.jwt.claims', admin_claims::text, true);
        -- Disabled is last: do not reactivate fixtures or revive their sessions.
      END LOOP;
      PERFORM set_config('request.jwt.claims', '{}', true);
    END LOOP;
  END LOOP;
  IF checks <> jsonb_array_length(expectations) THEN RAISE EXCEPTION 'AUTHORIZATION_MATRIX_INCOMPLETE'; END IF;
END $authorization$;
ROLLBACK;
