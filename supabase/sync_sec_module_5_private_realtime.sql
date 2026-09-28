-- SYNC-SEC-5: private Realtime Broadcast as a low-latency signal.
-- The durable Module 3 change feed remains the source of truth and recovery path.

BEGIN;

DROP POLICY IF EXISTS nasun_sync_broadcast_receive ON realtime.messages;
CREATE POLICY nasun_sync_broadcast_receive
  ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (
      realtime.topic() = 'nasun:sync:global'
      OR (public.get_my_role() = 'admin' AND realtime.topic() = 'nasun:sync:admin')
      OR realtime.topic() = 'nasun:sync:' || replace(lower(COALESCE(
        (SELECT managed_region FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE),
        'none'
      )), ' ', '_')
    )
  );

CREATE OR REPLACE FUNCTION public.broadcast_sync_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_topic TEXT;
  safe_payload JSONB;
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN RETURN NEW; END IF;
  target_topic := CASE
    WHEN NEW.region IS NULL THEN 'nasun:sync:global'
    ELSE 'nasun:sync:' || replace(lower(NEW.region), ' ', '_')
  END;
  safe_payload := jsonb_build_object(
    'cursor', NEW.cursor_id,
    'table', NEW.table_name,
    'operation', NEW.operation,
    'changedAt', NEW.changed_at
  );
  EXECUTE 'SELECT realtime.send($1, $2, $3, $4)'
    USING safe_payload, 'sync_changed', target_topic, TRUE;
  IF target_topic <> 'nasun:sync:admin' THEN
    EXECUTE 'SELECT realtime.send($1, $2, $3, $4)'
      USING safe_payload, 'sync_changed', 'nasun:sync:admin', TRUE;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Broadcast is an accelerator only; never roll back business data if it is unavailable.
  RAISE WARNING 'SYNC_REALTIME_BROADCAST_DEFERRED: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_sync_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_broadcast_sync_change ON public.sync_change_feed;
CREATE TRIGGER trg_broadcast_sync_change
AFTER INSERT ON public.sync_change_feed
FOR EACH ROW EXECUTE FUNCTION public.broadcast_sync_change();

COMMIT;
