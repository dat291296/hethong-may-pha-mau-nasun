-- Additive evidence storage. Existing business rows and inline images are untouched.
BEGIN;
CREATE SCHEMA IF NOT EXISTS nasun_internal;
REVOKE ALL ON SCHEMA nasun_internal FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS public.machine_evidence (
 id uuid PRIMARY KEY,
 operation_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 machine_set_code text REFERENCES public.system_sets(set_code) ON UPDATE CASCADE ON DELETE SET NULL,
 original_set_code text NOT NULL CHECK(length(original_set_code) BETWEEN 1 AND 120),
 region_at_capture text NOT NULL,
 bucket_id text NOT NULL DEFAULT 'machine-evidence' CHECK(bucket_id='machine-evidence'),
 object_path text NOT NULL UNIQUE,
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 2097152),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 UNIQUE(created_by,operation_id)
);
CREATE INDEX IF NOT EXISTS machine_evidence_actor_time_idx ON public.machine_evidence(created_by,created_at DESC);
CREATE INDEX IF NOT EXISTS machine_evidence_machine_time_idx ON public.machine_evidence(machine_set_code,verified_at DESC);
ALTER TABLE public.machine_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.machine_evidence FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.machine_evidence TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.machine_evidence TO service_role;

CREATE TABLE IF NOT EXISTS public.machine_evidence_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 evidence_id uuid NOT NULL REFERENCES public.machine_evidence(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 event_type text NOT NULL CHECK(event_type IN ('reserved','verified')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(evidence_id,event_type)
);
CREATE INDEX IF NOT EXISTS machine_evidence_events_actor_idx ON public.machine_evidence_events(actor_id,occurred_at DESC);
ALTER TABLE public.machine_evidence_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.machine_evidence_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.machine_evidence_events TO authenticated,service_role;

CREATE OR REPLACE FUNCTION nasun_internal.evidence_actor_allowed(p_actor uuid,p_set text,p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (
 SELECT 1 FROM public.system_sets s JOIN public.profiles p ON p.id=p_actor
 LEFT JOIN public.distributors n ON n.id=s.npp_id
 WHERE s.set_code=p_set AND p.is_active AND p.role IN ('admin','manager','technician','qc')
 AND (p.role='admin' OR (p.managed_region=s.region AND p.managed_region IN ('Miền Bắc','Miền Trung','Miền Nam')
 AND (s.npp_id IS NULL OR n.region=p.managed_region)))
 AND EXISTS(SELECT 1 FROM auth.sessions a WHERE a.id=p_session AND a.user_id=p_actor AND (a.not_after IS NULL OR a.not_after>now()))
 AND EXISTS(SELECT 1 FROM public.account_sessions a JOIN public.trusted_devices d ON d.id=a.trusted_device_id
 WHERE a.user_id=p_actor AND a.session_id=p_session::text AND a.revoked_at IS NULL AND a.expires_at>now()
 AND a.idle_expires_at>now() AND d.user_id=p_actor AND d.revoked_at IS NULL AND d.trusted_until>now())
 );
$$;
REVOKE ALL ON FUNCTION nasun_internal.evidence_actor_allowed(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.reserve_machine_evidence(p_id uuid,p_operation_id uuid,p_set_code text,p_sha256 text,p_byte_size integer,p_mime_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); session_id uuid; previous public.machine_evidence%ROWTYPE; extension text; region text;
BEGIN
 IF actor IS NULL OR NOT public.has_active_app_session() THEN RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501'; END IF;
 session_id:=(auth.jwt()->>'session_id')::uuid;
 IF NOT nasun_internal.evidence_actor_allowed(actor,p_set_code,session_id) THEN RAISE EXCEPTION 'EVIDENCE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_operation_id IS NULL OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$'
 OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 2097152 OR p_mime_type IS NULL OR p_mime_type NOT IN ('image/jpeg','image/png','image/webp') THEN
 RAISE EXCEPTION 'INVALID_EVIDENCE' USING ERRCODE='23514'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('machine-evidence:'||actor::text,0));
 SELECT * INTO previous FROM public.machine_evidence WHERE created_by=actor AND operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
   IF previous.id<>p_id OR previous.machine_set_code IS DISTINCT FROM p_set_code OR previous.sha256<>p_sha256
   OR previous.byte_size<>p_byte_size OR previous.mime_type<>p_mime_type THEN RAISE EXCEPTION 'EVIDENCE_INTENT_CONFLICT' USING ERRCODE='23514'; END IF;
   RETURN to_jsonb(previous);
 END IF;
 IF (SELECT count(*) FROM public.machine_evidence WHERE created_by=actor AND created_at>now()-interval '10 minutes')>=60 THEN
 RAISE EXCEPTION 'EVIDENCE_RATE_LIMITED' USING ERRCODE='54000'; END IF;
 extension:=CASE p_mime_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
 SELECT s.region INTO region FROM public.system_sets s WHERE s.set_code=p_set_code;
 INSERT INTO public.machine_evidence(id,operation_id,created_by,machine_set_code,original_set_code,region_at_capture,object_path,sha256,byte_size,mime_type)
 VALUES(p_id,p_operation_id,actor,p_set_code,p_set_code,region,actor::text||'/'||p_id::text||'/'||p_sha256||'.'||extension,p_sha256,p_byte_size,p_mime_type)
 RETURNING * INTO previous;
 RETURN to_jsonb(previous);
END $$;
REVOKE ALL ON FUNCTION public.reserve_machine_evidence(uuid,uuid,text,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_machine_evidence(uuid,uuid,text,text,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_machine_evidence(p_id uuid,p_actor uuid,p_session uuid,p_sha256 text,p_byte_size integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.machine_evidence%ROWTYPE;
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'EVIDENCE_GATEWAY_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.machine_evidence WHERE id=p_id AND created_by=p_actor FOR UPDATE;
 IF NOT FOUND OR item.sha256 IS DISTINCT FROM p_sha256 OR item.byte_size IS DISTINCT FROM p_byte_size
 OR NOT nasun_internal.evidence_actor_allowed(p_actor,item.machine_set_code,p_session) THEN RAISE EXCEPTION 'EVIDENCE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.machine_evidence SET verified_at=COALESCE(verified_at,now()) WHERE id=item.id RETURNING * INTO item;
 RETURN jsonb_build_object('ok',true,'id',item.id,'operationId',item.operation_id,'sha256',item.sha256,'verified',true);
END $$;
REVOKE ALL ON FUNCTION public.finalize_machine_evidence(uuid,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_machine_evidence(uuid,uuid,uuid,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION nasun_internal.record_evidence_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
 INSERT INTO public.machine_evidence_events(evidence_id,actor_id,event_type) VALUES(NEW.id,NEW.created_by,'reserved') ON CONFLICT DO NOTHING;
 ELSIF OLD.verified_at IS NULL AND NEW.verified_at IS NOT NULL THEN
 INSERT INTO public.machine_evidence_events(evidence_id,actor_id,event_type) VALUES(NEW.id,NEW.created_by,'verified') ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION nasun_internal.record_evidence_event() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS evidence_audit ON public.machine_evidence;
CREATE TRIGGER evidence_audit AFTER INSERT OR UPDATE ON public.machine_evidence FOR EACH ROW EXECUTE FUNCTION nasun_internal.record_evidence_event();
CREATE OR REPLACE FUNCTION nasun_internal.reject_evidence_history_change()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'AUDIT_IMMUTABLE' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION nasun_internal.reject_evidence_history_change() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS evidence_history_immutable ON public.machine_evidence_events;
CREATE TRIGGER evidence_history_immutable BEFORE UPDATE OR DELETE ON public.machine_evidence_events FOR EACH ROW EXECUTE FUNCTION nasun_internal.reject_evidence_history_change();
DROP TRIGGER IF EXISTS evidence_history_no_truncate ON public.machine_evidence_events;
CREATE TRIGGER evidence_history_no_truncate BEFORE TRUNCATE ON public.machine_evidence_events FOR EACH STATEMENT EXECUTE FUNCTION nasun_internal.reject_evidence_history_change();

DROP POLICY IF EXISTS evidence_metadata_read ON public.machine_evidence;
CREATE POLICY evidence_metadata_read ON public.machine_evidence FOR SELECT TO authenticated
 USING(public.has_active_app_session() AND (created_by=auth.uid() OR verified_at IS NOT NULL)
 AND (public.get_my_role()='admin' OR EXISTS(SELECT 1 FROM public.system_sets s WHERE s.set_code=machine_evidence.machine_set_code)));
DROP POLICY IF EXISTS evidence_events_read ON public.machine_evidence_events;
CREATE POLICY evidence_events_read ON public.machine_evidence_events FOR SELECT TO authenticated
 USING(public.has_active_app_session() AND EXISTS(SELECT 1 FROM public.machine_evidence e WHERE e.id=machine_evidence_events.evidence_id));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('machine-evidence','machine-evidence',false,2097152,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='machine-evidence' AND (public OR file_size_limit IS DISTINCT FROM 2097152
 OR allowed_mime_types IS DISTINCT FROM ARRAY['image/jpeg','image/png','image/webp'])) THEN RAISE EXCEPTION 'EXISTING_EVIDENCE_BUCKET_POLICY_MISMATCH'; END IF;
END $$;
-- Restrictive boundaries protect this bucket even if older permissive policies are broad.
DROP POLICY IF EXISTS machine_evidence_boundary ON storage.objects;
CREATE POLICY machine_evidence_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO public
 USING(bucket_id<>'machine-evidence' OR CASE WHEN auth.uid() IS NULL THEN false ELSE
 public.has_active_app_session() AND EXISTS(SELECT 1 FROM public.machine_evidence e WHERE e.object_path=storage.objects.name AND e.verified_at IS NOT NULL) END)
 WITH CHECK(bucket_id<>'machine-evidence');
DROP POLICY IF EXISTS machine_evidence_no_delete ON storage.objects;
CREATE POLICY machine_evidence_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO public USING(bucket_id<>'machine-evidence');
DROP POLICY IF EXISTS machine_evidence_read ON storage.objects;
CREATE POLICY machine_evidence_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='machine-evidence' AND public.has_active_app_session() AND EXISTS(SELECT 1 FROM public.machine_evidence e WHERE e.object_path=storage.objects.name AND e.verified_at IS NOT NULL));
NOTIFY pgrst,'reload schema';
COMMIT;
