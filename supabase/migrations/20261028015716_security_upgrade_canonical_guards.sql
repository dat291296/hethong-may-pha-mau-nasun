-- Canonical security upgrade. Preserve business rows and existing audit history.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('nasun-security-upgrade', 0));

CREATE OR REPLACE FUNCTION public.can_access_region(target_region text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(public.has_active_app_session() AND
   (public.get_my_role()='admin' OR
     (public.get_my_region() IN ('Miền Bắc','Miền Trung','Miền Nam')
      AND target_region=public.get_my_region())),false);
$$;
REVOKE ALL ON FUNCTION public.can_access_region(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_region(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.require_account_admin_session()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.has_active_app_session() THEN
   RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501';
 END IF;
 IF public.get_my_role() IS DISTINCT FROM 'admin' THEN
   RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND mfa_required)
    AND coalesce(auth.jwt()->>'aal','')<>'aal2' THEN
   RAISE EXCEPTION 'MFA_REQUIRED' USING ERRCODE='42501';
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.require_account_admin_session() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.require_account_admin_session() TO authenticated;

-- Explicitly opted in later by the owner after MFA enrollment; no profile is changed here.
DROP TRIGGER IF EXISTS trg_keep_mfa_disabled ON public.profiles;
CREATE OR REPLACE FUNCTION public.guard_sensitive_profile_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role OR NEW.managed_region IS DISTINCT FROM OLD.managed_region
    OR NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.mfa_required IS DISTINCT FROM OLD.mfa_required THEN
   IF NEW.id=auth.uid() THEN RAISE EXCEPTION 'CANNOT_CHANGE_OWN_ACCESS' USING ERRCODE='42501'; END IF;
   PERFORM public.require_account_admin_session();
   PERFORM pg_advisory_xact_lock(hashtextextended('nasun-active-admins',0));
   IF OLD.role='admin' AND OLD.is_active AND (NEW.role<>'admin' OR NOT NEW.is_active)
      AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE role='admin' AND is_active AND id<>OLD.id) THEN
     RAISE EXCEPTION 'CANNOT_REMOVE_LAST_ADMIN' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_sensitive_profile_change() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_sensitive_profile_change ON public.profiles;
CREATE TRIGGER guard_sensitive_profile_change BEFORE UPDATE OF role,managed_region,is_active,mfa_required
 ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_sensitive_profile_change();

CREATE OR REPLACE FUNCTION public.invalidate_changed_account_sessions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role OR NEW.managed_region IS DISTINCT FROM OLD.managed_region
    OR NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.mfa_required IS DISTINCT FROM OLD.mfa_required THEN
   UPDATE public.account_sessions SET revoked_at=clock_timestamp(),revoked_reason='ACCOUNT_ACCESS_CHANGED'
    WHERE user_id=NEW.id AND revoked_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_changed_account_sessions() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS invalidate_changed_account_sessions ON public.profiles;
CREATE TRIGGER invalidate_changed_account_sessions AFTER UPDATE OF role,managed_region,is_active,mfa_required
 ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_account_sessions();

-- Restrictive SELECT policies close older nationwide permissive policies as well.
DO $$ DECLARE item text; BEGIN
 FOREACH item IN ARRAY ARRAY['distributors','system_sets'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS canonical_region_read ON public.%I',item);
   EXECUTE format('CREATE POLICY canonical_region_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.can_access_region(region))',item);
 END LOOP;
 FOREACH item IN ARRAY ARRAY['dispensers','mixers','computers','printers'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS canonical_region_read ON public.%I',item);
   EXECUTE format('CREATE POLICY canonical_region_read ON public.%1$I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.get_my_role()=''admin'' OR EXISTS (SELECT 1 FROM public.system_sets s WHERE s.set_code=%1$I.set_code AND public.can_access_region(s.region)))',item);
 END LOOP;
END $$;
DROP POLICY IF EXISTS canonical_region_read ON public.repair_tickets;
CREATE POLICY canonical_region_read ON public.repair_tickets AS RESTRICTIVE FOR SELECT TO authenticated
 USING (public.get_my_role()='admin' OR EXISTS
 (SELECT 1 FROM public.distributors d WHERE d.id=repair_tickets.npp_id AND public.can_access_region(d.region)));

-- No direct profile access changes; use the existing rate-limited RPCs.
DROP POLICY IF EXISTS profile_update_own ON public.profiles;
DROP POLICY IF EXISTS profile_update_admin ON public.profiles;
DO $$ DECLARE item record; definition text; BEGIN
 FOR item IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('update_user_access','set_user_account_active') LOOP
   definition:=pg_get_functiondef(item.oid);
   IF position('PERFORM public.require_account_admin_session();' in definition)=0 THEN
     IF position('BEGIN' in definition)=0 THEN RAISE EXCEPTION 'ADMIN_RPC_SHAPE_CHANGED'; END IF;
     definition:=regexp_replace(definition,'\mBEGIN\M','BEGIN'||chr(10)||'  PERFORM public.require_account_admin_session();');
   END IF;
   IF item.proname='update_user_access' THEN
     definition:=replace(definition,'''Miền Bắc'', ''Miền Trung'', ''Miền Nam'', ''Toàn Quốc''','''Miền Bắc'', ''Miền Trung'', ''Miền Nam''');
   END IF;
   EXECUTE definition;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_technical_support_contacts() FROM PUBLIC,anon,authenticated;
REVOKE UPDATE,DELETE,TRUNCATE,TRIGGER ON public.audit_logs FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.redact_security_details(value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb; entry record;
BEGIN
 IF jsonb_typeof(value)='object' THEN
   result:='{}'::jsonb;
   FOR entry IN SELECT * FROM jsonb_each(value) LOOP
     IF regexp_replace(lower(entry.key),'[^a-z0-9]','','g') ~ '(password|passwd|token|secret|authorization|cookie|apikey|credential|privatekey)' THEN
       result:=result||jsonb_build_object(entry.key,'[REDACTED]');
     ELSE result:=result||jsonb_build_object(entry.key,public.redact_security_details(entry.value)); END IF;
   END LOOP;
   RETURN result;
 ELSIF jsonb_typeof(value)='array' THEN
   SELECT coalesce(jsonb_agg(public.redact_security_details(v)),'[]'::jsonb) INTO result FROM jsonb_array_elements(value) v;
   RETURN result;
 END IF;
 RETURN value;
END $$;
REVOKE ALL ON FUNCTION public.redact_security_details(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_security_event(p_event_type text,p_details jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE normalized_type text:=upper(btrim(coalesce(p_event_type,''))); severity text; inserted_id uuid;
BEGIN
 IF NOT public.has_active_app_session() THEN RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501'; END IF;
 severity:=CASE normalized_type
  WHEN 'PERMISSION_DENIED' THEN 'WARNING' WHEN 'ACCESS_DENIED' THEN 'WARNING'
  WHEN 'SECURITY_VIOLATION' THEN 'CRITICAL' WHEN 'SESSION_INVALID' THEN 'WARNING'
  WHEN 'OFFLINE_REPLAY_DENIED' THEN 'WARNING' WHEN 'MFA_FAILED' THEN 'WARNING'
  WHEN 'MFA_VERIFIED' THEN 'INFO' ELSE NULL END;
 IF severity IS NULL THEN RAISE EXCEPTION 'INVALID_EVENT_TYPE' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_details) IS DISTINCT FROM 'object' OR octet_length(p_details::text)>4000 THEN
   RAISE EXCEPTION 'INVALID_EVENT_DETAILS' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('security-events:'||auth.uid()::text,0));
 IF (SELECT count(*) FROM public.security_events WHERE actor_id=auth.uid() AND source='application'
     AND occurred_at>now()-interval '5 minutes')>=30 THEN
   RETURN jsonb_build_object('recorded',false,'reason','RATE_LIMITED');
 END IF;
 INSERT INTO public.security_events(actor_id,event_type,severity,source,details)
 VALUES(auth.uid(),normalized_type,severity,'application',public.redact_security_details(p_details)) RETURNING id INTO inserted_id;
 RETURN jsonb_build_object('recorded',true,'id',inserted_id);
END $$;
REVOKE ALL ON FUNCTION public.record_security_event(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_security_event(text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.reject_security_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'SECURITY_EVENTS_IMMUTABLE' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.reject_security_event_mutation() FROM PUBLIC,anon,authenticated;
REVOKE UPDATE,DELETE,TRUNCATE,TRIGGER ON public.security_events FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS security_events_append_only ON public.security_events;
CREATE TRIGGER security_events_append_only BEFORE UPDATE OR DELETE ON public.security_events
 FOR EACH ROW EXECUTE FUNCTION public.reject_security_event_mutation();
DROP TRIGGER IF EXISTS security_events_no_truncate ON public.security_events;
CREATE TRIGGER security_events_no_truncate BEFORE TRUNCATE ON public.security_events
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_security_event_mutation();

-- Shared PostgreSQL quota counts every request, including retries, before image hashing or storage.
CREATE OR REPLACE FUNCTION public.consume_machine_evidence_quota()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE bucket timestamptz:=to_timestamp(floor(extract(epoch FROM clock_timestamp())/60)*60); attempts integer;
BEGIN
 IF NOT public.has_active_app_session() OR coalesce(public.get_my_role(),'') NOT IN ('admin','manager','technician','qc') THEN
   RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.security_rate_limits(actor_id,action_name,window_started_at,request_count,updated_at)
 VALUES(auth.uid(),'machine_evidence_request',bucket,1,clock_timestamp())
 ON CONFLICT(actor_id,action_name,window_started_at) DO UPDATE
 SET request_count=least(public.security_rate_limits.request_count+1,1000000),updated_at=clock_timestamp()
 RETURNING request_count INTO attempts;
 RETURN jsonb_build_object('allowed',attempts<=30,'retry_after_seconds',greatest(1,ceil(extract(epoch FROM bucket+interval '60 seconds'-clock_timestamp()))::integer));
END $$;
REVOKE ALL ON FUNCTION public.consume_machine_evidence_quota() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consume_machine_evidence_quota() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_repair_team_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_region text; assignee record; caller_role text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_active_app_session() THEN RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501'; END IF;
 caller_role:=public.get_my_role();
 IF coalesce(caller_role,'') NOT IN ('admin','manager','technician','qc') THEN RAISE EXCEPTION 'FORBIDDEN_REPAIR' USING ERRCODE='42501'; END IF;
 SELECT region INTO target_region FROM public.distributors WHERE id=NEW.npp_id;
 IF caller_role<>'admin' AND NOT public.can_access_region(target_region) THEN RAISE EXCEPTION 'ASSIGNED_REGION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF (TG_OP='INSERT' AND NEW.assigned_user_id IS NOT NULL AND NEW.assigned_user_id<>auth.uid())
   OR (TG_OP='UPDATE' AND NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id) THEN
   IF caller_role NOT IN ('admin','manager') THEN RAISE EXCEPTION 'FORBIDDEN_ASSIGNMENT' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.assigned_user_id IS NOT NULL THEN
   SELECT role,managed_region,is_active INTO assignee FROM public.profiles WHERE id=NEW.assigned_user_id;
   IF NOT FOUND OR NOT coalesce(assignee.is_active,false) OR assignee.role NOT IN ('admin','manager','technician','qc')
     OR (assignee.role<>'admin' AND (assignee.managed_region NOT IN ('Miền Bắc','Miền Trung','Miền Nam')
       OR assignee.managed_region IS DISTINCT FROM target_region)) THEN
     RAISE EXCEPTION 'INVALID_ASSIGNEE_REGION' USING ERRCODE='42501';
   END IF;
 END IF;
 NEW.record_version:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.record_version+1 END;
 NEW.last_updated_at:=clock_timestamp(); NEW.last_updated_by:=auth.uid();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_repair_team_update() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
