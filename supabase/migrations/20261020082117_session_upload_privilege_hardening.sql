-- Preserve existing rows. Enforce active sessions and least privilege.
BEGIN;
-- Origin checking complements JWT/RLS; it is not an authentication boundary.
-- Requests without Origin remain supported for CI and future native clients.
CREATE OR REPLACE FUNCTION public.is_allowed_request_origin()
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'origin','')
 IN ('','https://kythuat.nasun.workers.dev','https://kythuat-staging.nasun.workers.dev');
$$;
REVOKE ALL ON FUNCTION public.is_allowed_request_origin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_allowed_request_origin() TO authenticated;

CREATE OR REPLACE FUNCTION public.has_valid_auth_session()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.is_allowed_request_origin()
 AND coalesce(auth.jwt()->>'is_anonymous','false') = 'false'
 AND CASE WHEN coalesce(auth.jwt()->>'exp','') ~ '^[0-9]{1,12}$'
   THEN (auth.jwt()->>'exp')::bigint > extract(epoch FROM now()) ELSE false END
 AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=CASE WHEN coalesce(auth.jwt()->>'session_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN (auth.jwt()->>'session_id')::uuid ELSE NULL END
   AND s.user_id=auth.uid() AND (s.not_after IS NULL OR s.not_after>now()))
 AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active);
$$;
CREATE OR REPLACE FUNCTION public.has_active_app_session()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.has_valid_auth_session() AND EXISTS (
 SELECT 1 FROM public.account_sessions s JOIN public.trusted_devices d ON d.id=s.trusted_device_id
 WHERE s.user_id=auth.uid() AND s.session_id=auth.jwt()->>'session_id'
 AND d.user_id=auth.uid() AND s.revoked_at IS NULL AND s.expires_at>now()
 AND s.idle_expires_at>now() AND d.revoked_at IS NULL AND d.trusted_until>now());
$$;
REVOKE ALL ON FUNCTION public.has_valid_auth_session(),public.has_active_app_session() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_valid_auth_session(),public.has_active_app_session() TO authenticated;
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT role FROM public.profiles WHERE id=auth.uid() AND is_active AND public.has_active_app_session();
$$;
CREATE OR REPLACE FUNCTION public.guard_revoked_session_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_active_app_session() THEN
   RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_revoked_session_write() FROM PUBLIC,anon,authenticated;
-- Restrictive policies combine with the existing regional/role policies using AND.
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public'
 AND tablename NOT IN ('profiles','account_sessions','trusted_devices','security_events') LOOP
   EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM PUBLIC, anon, authenticated',item.tablename);
   EXECUTE format('DROP POLICY IF EXISTS active_app_session_required ON public.%I',item.tablename);
   EXECUTE format('CREATE POLICY active_app_session_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.has_active_app_session())) WITH CHECK ((SELECT public.has_active_app_session()))',item.tablename);
 END LOOP;
END $$;
-- Own profile bootstrap must work before app session registration, but never for expired Auth JWTs.
DROP POLICY IF EXISTS valid_profile_auth_required ON public.profiles;
CREATE POLICY valid_profile_auth_required ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT public.has_valid_auth_session()));
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles,public.account_sessions,public.trusted_devices,public.security_events FROM PUBLIC,anon,authenticated;
-- Enforce session state on private Storage access as well.
DROP POLICY IF EXISTS active_app_session_required ON storage.objects;
CREATE POLICY active_app_session_required ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.has_active_app_session())) WITH CHECK ((SELECT public.has_active_app_session()));
-- Validate only changed photo fields; malformed historical values are retained untouched.
CREATE OR REPLACE FUNCTION public.validate_inline_image_list(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item jsonb; image text; payload text; bytes bytea;
BEGIN
 IF value IS NULL OR value='null'::jsonb THEN RETURN true; END IF;
 IF jsonb_typeof(value)<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(value)>6 OR octet_length(value::text)>12582912 THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
   IF jsonb_typeof(item)<>'string' THEN RETURN false; END IF;
   image:=item#>>'{}';
   IF length(image)>2796250 OR image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' THEN RETURN false; END IF;
   payload:=split_part(image,',',2);
   IF length(payload)%4<>0 THEN RETURN false; END IF;
   BEGIN bytes:=decode(payload,'base64'); EXCEPTION WHEN OTHERS THEN RETURN false; END;
   IF octet_length(bytes)>2097152 THEN RETURN false; END IF;
   IF NOT ((image LIKE 'data:image/jpeg;%' AND substring(bytes FROM 1 FOR 3)=decode('ffd8ff','hex'))
     OR (image LIKE 'data:image/png;%' AND substring(bytes FROM 1 FOR 8)=decode('89504e470d0a1a0a','hex'))
     OR (image LIKE 'data:image/webp;%' AND substring(bytes FROM 1 FOR 4)=decode('52494646','hex') AND substring(bytes FROM 9 FOR 4)=decode('57454250','hex'))) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.guard_inline_image_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE field text; current_value jsonb; previous_value jsonb; added_images jsonb;
BEGIN
 FOREACH field IN ARRAY TG_ARGV LOOP
   current_value:=to_jsonb(NEW)->field;
   IF TG_OP='UPDATE' THEN previous_value:=to_jsonb(OLD)->field;
     IF current_value IS NOT DISTINCT FROM previous_value THEN CONTINUE; END IF;
   END IF;
   IF field='installation_photos' AND jsonb_typeof(current_value)='array' THEN
     -- Album history is cumulative; validate the multiset of newly added images only.
     -- EXCEPT ALL counts duplicates so copying an old image cannot bypass the batch limit.
     SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO added_images FROM (
       SELECT value FROM jsonb_array_elements(current_value)
       EXCEPT ALL
       SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(previous_value)='array' THEN previous_value ELSE '[]'::jsonb END)
     ) added;
   ELSE added_images:=current_value;
   END IF;
   IF NOT public.validate_inline_image_list(added_images) THEN
     RAISE EXCEPTION 'INVALID_IMAGE_UPLOAD' USING ERRCODE='23514';
   END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_inline_image_fields() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.validate_inline_image_list(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validate_inline_image_list(jsonb) TO authenticated;
DROP TRIGGER IF EXISTS validate_repair_images ON public.repair_tickets;
CREATE TRIGGER validate_repair_images BEFORE INSERT OR UPDATE ON public.repair_tickets FOR EACH ROW
 EXECUTE FUNCTION public.guard_inline_image_fields('photos','before_photos','after_photos');
DROP TRIGGER IF EXISTS validate_installation_images ON public.system_sets;
CREATE TRIGGER validate_installation_images BEFORE INSERT OR UPDATE ON public.system_sets FOR EACH ROW
 EXECUTE FUNCTION public.guard_inline_image_fields('installation_photos');
CREATE OR REPLACE FUNCTION public.register_trusted_device_session(
  p_device_id TEXT,
  p_device_label TEXT DEFAULT 'Unknown device',
  p_timezone TEXT DEFAULT 'UTC'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  jwt JSONB := auth.jwt();
  session_key TEXT;
  device_hash TEXT;
  context_data JSONB;
  device_row public.trusted_devices%ROWTYPE;
  is_new_device BOOLEAN := FALSE;
  anomaly BOOLEAN := FALSE;
  anomaly_reason TEXT := NULL;
BEGIN
  IF NOT public.has_valid_auth_session() THEN RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501'; END IF;
  IF BTRIM(COALESCE(p_device_id, '')) !~ '^[A-Za-z0-9._:-]{8,200}$' THEN RAISE EXCEPTION 'INVALID_DEVICE_ID'; END IF;
  device_hash := encode(digest(BTRIM(p_device_id), 'sha256'), 'hex');
  session_key := COALESCE(NULLIF(jwt->>'session_id', ''), encode(digest(caller_id::TEXT || ':' || COALESCE(jwt->>'iat', ''), 'sha256'), 'hex'));
  IF EXISTS (SELECT 1 FROM public.account_sessions WHERE session_id = session_key AND user_id = caller_id AND (revoked_at IS NOT NULL OR expires_at<=now() OR idle_expires_at<=now() OR EXISTS (SELECT 1 FROM public.trusted_devices d WHERE d.id=trusted_device_id AND (d.revoked_at IS NOT NULL OR d.trusted_until<=now())))) THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'SESSION_REJECTED');
  END IF;
  context_data := public.request_security_context();

  SELECT * INTO device_row FROM public.trusted_devices
  WHERE user_id = caller_id AND device_id_hash = device_hash FOR UPDATE;

  IF NOT FOUND THEN
    is_new_device := TRUE;
    anomaly := EXISTS (SELECT 1 FROM public.trusted_devices WHERE user_id = caller_id);
    anomaly_reason := CASE WHEN anomaly THEN 'NEW_DEVICE' ELSE NULL END;
    INSERT INTO public.trusted_devices (
      user_id, device_id_hash, device_label, timezone, last_ip_hash, last_user_agent_hash
    ) VALUES (
      caller_id, device_hash, LEFT(COALESCE(NULLIF(BTRIM(p_device_label), ''), 'Unknown device'), 120),
      LEFT(COALESCE(NULLIF(BTRIM(p_timezone), ''), 'UTC'), 80), context_data->>'ip_hash', context_data->>'user_agent_hash'
    ) RETURNING * INTO device_row;
  ELSE
    -- Mobile IP addresses change frequently; IP-only changes are recorded but
    -- do not interrupt technicians. Expiry, revocation or timezone drift alert.
    anomaly := device_row.revoked_at IS NOT NULL OR device_row.trusted_until <= NOW()
      OR (device_row.timezone IS NOT NULL AND NULLIF(BTRIM(p_timezone), '') IS NOT NULL AND device_row.timezone <> BTRIM(p_timezone));
    anomaly_reason := CASE WHEN anomaly THEN 'DEVICE_CONTEXT_CHANGED' ELSE NULL END;
    UPDATE public.trusted_devices SET
      last_seen_at = NOW(), trusted_until = NOW() + INTERVAL '90 days', revoked_at = NULL,
      device_label = LEFT(COALESCE(NULLIF(BTRIM(p_device_label), ''), device_label), 120),
      timezone = LEFT(COALESCE(NULLIF(BTRIM(p_timezone), ''), timezone), 80),
      last_ip_hash = COALESCE(context_data->>'ip_hash', last_ip_hash),
      last_user_agent_hash = COALESCE(context_data->>'user_agent_hash', last_user_agent_hash)
    WHERE id = device_row.id RETURNING * INTO device_row;
  END IF;

  INSERT INTO public.account_sessions (session_id, user_id, trusted_device_id, anomaly_score)
  VALUES (session_key, caller_id, device_row.id, CASE WHEN anomaly THEN 40 ELSE 0 END)
  ON CONFLICT (session_id) DO UPDATE SET
    last_seen_at = NOW(), idle_expires_at = NOW() + INTERVAL '8 hours',
    trusted_device_id = EXCLUDED.trusted_device_id,
    anomaly_score = GREATEST(public.account_sessions.anomaly_score, EXCLUDED.anomaly_score),
    revoked_reason = public.account_sessions.revoked_reason
    WHERE public.account_sessions.revoked_at IS NULL AND public.account_sessions.expires_at>now() AND public.account_sessions.idle_expires_at>now();

  UPDATE public.account_sessions SET revoked_at = NOW(), revoked_reason = 'MAX_ACTIVE_SESSIONS'
  WHERE session_id IN (
    SELECT session_id FROM public.account_sessions
    WHERE user_id = caller_id AND revoked_at IS NULL AND session_id <> session_key
    ORDER BY last_seen_at DESC OFFSET 2
  );

  IF anomaly AND to_regclass('public.security_events') IS NOT NULL THEN
    EXECUTE 'INSERT INTO public.security_events (actor_id, event_type, severity, target_user_id, source, details)
             VALUES ($1, $2, $3, $1, $4, $5)'
      USING caller_id, 'ANOMALOUS_LOGIN_DETECTED', 'WARNING', 'database',
        jsonb_build_object('reason', anomaly_reason, 'device_label', device_row.device_label, 'timezone', device_row.timezone);
  END IF;

  RETURN jsonb_build_object(
    'valid', TRUE, 'trusted', TRUE, 'new_device', is_new_device,
    'anomaly_detected', anomaly, 'anomaly_reason', anomaly_reason,
    'trusted_until', device_row.trusted_until, 'session_expires_at', NOW() + INTERVAL '24 hours'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.register_trusted_device_session(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_trusted_device_session(text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.require_account_admin_session()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id UUID := auth.uid(); claims JSONB := auth.jwt();
BEGIN
  IF caller_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=caller_id AND role='admin' AND is_active=TRUE) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF COALESCE(claims->>'exp','') !~ '^[0-9]{1,12}$' THEN RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501'; END IF;
  IF (claims->>'exp')::BIGINT <= EXTRACT(EPOCH FROM NOW()) OR NOT EXISTS (
    SELECT 1 FROM auth.sessions s WHERE s.id::TEXT=claims->>'session_id' AND s.user_id=caller_id AND (s.not_after IS NULL OR s.not_after>NOW())
  ) THEN RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.account_sessions s WHERE s.session_id=claims->>'session_id' AND s.user_id=caller_id
    AND (s.revoked_at IS NOT NULL OR s.expires_at<=NOW() OR s.idle_expires_at<=NOW()
      OR EXISTS (SELECT 1 FROM public.trusted_devices d WHERE d.id=s.trusted_device_id AND (d.revoked_at IS NOT NULL OR d.trusted_until<=NOW())))) THEN
    RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501';
  END IF;
  IF NOT public.has_active_app_session() THEN RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501'; END IF;
  RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION public.require_account_admin_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_account_admin_session() TO authenticated;


-- Remove anonymous function exposure without expanding existing authenticated/service grants.
DO $$ DECLARE item record; allow_authenticated boolean; allow_service boolean; BEGIN
 FOR item IN SELECT p.oid,p.oid::regprocedure AS signature FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef LOOP
   allow_authenticated:=has_function_privilege('authenticated',item.oid,'EXECUTE');
   allow_service:=has_function_privilege('service_role',item.oid,'EXECUTE');
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',item.signature);
   IF allow_authenticated THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',item.signature); END IF;
   IF allow_service THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',item.signature); END IF;
 END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- SECURITY DEFINER RPCs bypass RLS: enforce the same session at their entry point.
-- Preserve deployed bodies, ownership, signatures and search_path rather than restoring older definitions.
DO $$ DECLARE item record; definition text; guarded text; BEGIN
 FOR item IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND l.lanname='plpgsql'
 AND p.proname IN ('get_sync_change_feed','get_sync_server_health','get_enterprise_preflight_snapshot',
 'register_sync_operation','complete_sync_operation','read_sync_entity_version','get_npp_region','get_session_security_state') LOOP
   definition:=pg_get_functiondef(item.oid);
   IF position('NOT public.has_active_app_session()' in definition)>0 THEN CONTINUE; END IF;
   guarded:=regexp_replace(definition,E'(^|\\n)BEGIN\\r?\\n',E'\\1BEGIN\n  IF NOT public.has_active_app_session() THEN RAISE EXCEPTION ''SESSION_REJECTED'' USING ERRCODE=''42501''; END IF;\n');
   IF guarded=definition THEN RAISE EXCEPTION 'SESSION_GUARD_FUNCTION_SHAPE_CHANGED'; END IF;
   EXECUTE guarded;
 END LOOP;
END $$;
ALTER FUNCTION public.read_sync_entity_version(text,text) SECURITY INVOKER;
-- Trigger functions are invoked by PostgreSQL, never by browser RPC callers.
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prorettype IN ('trigger'::regtype,'event_trigger'::regtype) LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',item.signature);
 END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
