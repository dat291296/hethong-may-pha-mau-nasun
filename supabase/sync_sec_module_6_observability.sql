-- SYNC-SEC-6: read-only synchronization health metrics for the signed-in user.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_sync_server_health()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  applied_24h BIGINT;
  failed_24h BIGINT;
  last_applied TIMESTAMPTZ;
  latest_cursor BIGINT;
  active_sessions BIGINT;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  SELECT COUNT(*) FILTER (WHERE status = 'applied'),
         COUNT(*) FILTER (WHERE status IN ('failed', 'needs_review')),
         MAX(applied_at)
  INTO applied_24h, failed_24h, last_applied
  FROM public.sync_operations
  WHERE user_id = caller_id AND created_at >= NOW() - INTERVAL '24 hours';

  SELECT COALESCE(MAX(cursor_id), 0) INTO latest_cursor FROM public.sync_change_feed;
  SELECT COUNT(*) INTO active_sessions FROM public.account_sessions
  WHERE user_id = caller_id AND revoked_at IS NULL
    AND expires_at > NOW() AND idle_expires_at > NOW();

  RETURN jsonb_build_object(
    'applied24h', COALESCE(applied_24h, 0),
    'failed24h', COALESCE(failed_24h, 0),
    'lastAppliedAt', last_applied,
    'latestCursor', latest_cursor,
    'activeSessions', COALESCE(active_sessions, 0),
    'measuredAt', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sync_server_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sync_server_health() TO authenticated;

COMMIT;
