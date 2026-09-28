-- SYNC-SEC-3: durable change feed with monotonic cursors.
-- Additive only. Existing application data is not updated or deleted.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sync_change_feed (
  cursor_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name TEXT NOT NULL CHECK (table_name IN (
    'distributors', 'system_sets', 'dispensers', 'mixers', 'computers', 'printers',
    'repair_tickets', 'audit_logs', 'locked_months', 'tinting_logs', 'formula_versions'
  )),
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  region TEXT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_change_feed_cursor
  ON public.sync_change_feed (cursor_id);
CREATE INDEX IF NOT EXISTS idx_sync_change_feed_region_cursor
  ON public.sync_change_feed (region, cursor_id);
CREATE INDEX IF NOT EXISTS idx_sync_change_feed_table_cursor
  ON public.sync_change_feed (table_name, cursor_id);

ALTER TABLE public.sync_change_feed ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sync_change_feed FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sync_change_feed FROM authenticated;

DROP POLICY IF EXISTS sync_change_feed_scoped_read ON public.sync_change_feed;
CREATE POLICY sync_change_feed_scoped_read
  ON public.sync_change_feed FOR SELECT TO authenticated
  USING (
    public.get_my_role() = 'admin'
    OR region IS NULL
    OR public.can_access_region(region)
  );

CREATE OR REPLACE FUNCTION public.capture_sync_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_data JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  row_id TEXT;
  row_region TEXT;
  related_set_code TEXT;
  related_npp_id TEXT;
BEGIN
  row_id := NULLIF(BTRIM(COALESCE(row_data->>TG_ARGV[0], '')), '');
  IF row_id IS NULL THEN RAISE EXCEPTION 'SYNC_CHANGE_RECORD_ID_REQUIRED'; END IF;

  row_region := NULLIF(BTRIM(COALESCE(row_data->>'region', '')), '');
  IF row_region IS NULL AND TG_TABLE_NAME IN ('dispensers', 'mixers', 'computers', 'printers') THEN
    related_set_code := NULLIF(BTRIM(COALESCE(row_data->>'set_code', '')), '');
    IF related_set_code IS NOT NULL THEN
      SELECT region INTO row_region FROM public.system_sets WHERE set_code = related_set_code;
    END IF;
  END IF;
  IF row_region IS NULL AND TG_TABLE_NAME IN ('repair_tickets', 'audit_logs', 'tinting_logs') THEN
    related_npp_id := NULLIF(BTRIM(COALESCE(row_data->>'npp_id', '')), '');
    IF related_npp_id IS NOT NULL THEN
      SELECT region INTO row_region FROM public.distributors WHERE id = related_npp_id;
    END IF;
  END IF;

  INSERT INTO public.sync_change_feed (table_name, record_id, operation, region, actor_id)
  VALUES (TG_TABLE_NAME, row_id, TG_OP, row_region, auth.uid());
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_sync_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  target RECORD;
  trigger_name TEXT;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('distributors', 'id'), ('system_sets', 'set_code'),
      ('dispensers', 'id'), ('mixers', 'id'), ('computers', 'id'), ('printers', 'id'),
      ('repair_tickets', 'id'), ('audit_logs', 'id'), ('locked_months', 'month_key'),
      ('tinting_logs', 'id'), ('formula_versions', 'version_id')
    ) AS configured(table_name, primary_key)
  LOOP
    IF to_regclass('public.' || target.table_name) IS NULL THEN CONTINUE; END IF;
    trigger_name := 'trg_sync_change_' || target.table_name;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, target.table_name);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_sync_change(%L)',
      trigger_name, target.table_name, target.primary_key
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sync_change_feed(
  p_after_cursor BIGINT DEFAULT 0,
  p_limit INTEGER DEFAULT 250
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  safe_cursor BIGINT := GREATEST(COALESCE(p_after_cursor, 0), 0);
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 250), 1), 500);
  events JSONB;
  next_cursor BIGINT;
  has_more BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(feed) ORDER BY feed.cursor_id), '[]'::JSONB),
         COALESCE(MAX(feed.cursor_id), safe_cursor)
  INTO events, next_cursor
  FROM (
    SELECT cursor_id, table_name, operation, transaction_id, changed_at
    FROM public.sync_change_feed
    WHERE cursor_id > safe_cursor
      AND (
        public.get_my_role() = 'admin'
        OR region IS NULL
        OR public.can_access_region(region)
      )
    ORDER BY cursor_id
    LIMIT safe_limit
  ) feed;

  SELECT EXISTS (
    SELECT 1 FROM public.sync_change_feed
    WHERE cursor_id > next_cursor
      AND (
        public.get_my_role() = 'admin'
        OR region IS NULL
        OR public.can_access_region(region)
      )
  ) INTO has_more;

  RETURN jsonb_build_object(
    'events', events,
    'nextCursor', next_cursor,
    'hasMore', has_more,
    'serverTime', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sync_change_feed(BIGINT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sync_change_feed(BIGINT, INTEGER) TO authenticated;

COMMIT;
