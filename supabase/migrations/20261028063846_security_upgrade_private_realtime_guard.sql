-- Keep broadcasts private and deny stale sessions even on global signal topics.
BEGIN;
CREATE OR REPLACE FUNCTION public.can_receive_sync_topic(target_topic text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(public.has_active_app_session()
  AND (public.get_my_role()='admin' OR public.get_my_region() IN ('Miền Bắc','Miền Trung','Miền Nam'))
  AND (target_topic='nasun:sync:global'
   OR (public.get_my_role()='admin' AND target_topic='nasun:sync:admin')
   OR target_topic='nasun:sync:'||replace(lower(public.get_my_region()),' ','_')),false);
$$;
REVOKE ALL ON FUNCTION public.can_receive_sync_topic(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_receive_sync_topic(text) TO authenticated;
DROP POLICY IF EXISTS nasun_sync_broadcast_receive ON realtime.messages;
CREATE POLICY nasun_sync_broadcast_receive ON realtime.messages FOR SELECT TO authenticated
 USING (extension='broadcast' AND public.can_receive_sync_topic(realtime.topic()));
DROP POLICY IF EXISTS nasun_active_sync_session ON realtime.messages;
CREATE POLICY nasun_active_sync_session ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated
 USING (public.has_active_app_session());
CREATE OR REPLACE FUNCTION public.broadcast_sync_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_topic text; safe_payload jsonb;
BEGIN
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN RETURN NEW; END IF;
 target_topic:=CASE WHEN NEW.region IS NULL THEN 'nasun:sync:global'
  ELSE 'nasun:sync:'||replace(lower(NEW.region),' ','_') END;
 safe_payload:=jsonb_build_object('cursor',NEW.cursor_id,'table',NEW.table_name,'operation',NEW.operation,'changedAt',NEW.changed_at);
 PERFORM realtime.send(safe_payload,'sync_changed',target_topic,true);
 IF target_topic<>'nasun:sync:admin' THEN PERFORM realtime.send(safe_payload,'sync_changed','nasun:sync:admin',true); END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 -- The durable feed remains authoritative when the optional transport is unavailable.
 RAISE WARNING 'SYNC_REALTIME_BROADCAST_DEFERRED';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.broadcast_sync_change() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_broadcast_sync_change ON public.sync_change_feed;
CREATE TRIGGER trg_broadcast_sync_change AFTER INSERT ON public.sync_change_feed
 FOR EACH ROW EXECUTE FUNCTION public.broadcast_sync_change();
COMMIT;
