-- ENT-0: enterprise migration registry and preflight snapshot.
-- Additive only. No business records are updated or deleted.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('nasun-enterprise-migrations', 0));
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.app_schema_migrations (
  migration_code TEXT PRIMARY KEY CHECK (migration_code ~ '^ENT-[0-9]+(?:\.[0-9]+)?$'),
  checksum TEXT NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 3 AND 500),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  execution_context TEXT NOT NULL DEFAULT 'supabase-sql-editor'
    CHECK (execution_context IN ('supabase-sql-editor', 'ci-migration', 'supabase-cli'))
);

ALTER TABLE public.app_schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_schema_migrations FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.app_schema_migrations FROM authenticated;
GRANT SELECT ON TABLE public.app_schema_migrations TO authenticated;

DROP POLICY IF EXISTS app_schema_migrations_admin_read ON public.app_schema_migrations;
CREATE POLICY app_schema_migrations_admin_read
  ON public.app_schema_migrations
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.get_enterprise_preflight_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_role TEXT;
  target RECORD;
  row_count BIGINT;
  table_counts JSONB := '{}'::JSONB;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = caller_id AND is_active = TRUE;

  IF caller_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;

  FOR target IN
    SELECT * FROM (VALUES
      ('profiles'), ('distributors'), ('system_sets'),
      ('dispensers'), ('mixers'), ('computers'), ('printers'),
      ('repair_tickets'), ('audit_logs'), ('security_events'),
      ('sync_operations'), ('sync_change_feed')
    ) AS configured(table_name)
  LOOP
    IF to_regclass('public.' || target.table_name) IS NULL THEN
      table_counts := table_counts || jsonb_build_object(target.table_name, NULL);
    ELSE
      EXECUTE format('SELECT COUNT(*) FROM public.%I', target.table_name) INTO row_count;
      table_counts := table_counts || jsonb_build_object(target.table_name, row_count);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'capturedAt', NOW(),
    'database', current_database(),
    'schemaVersion', 1,
    'tableCounts', table_counts,
    'activeAdmins', (
      SELECT COUNT(*) FROM public.profiles WHERE role = 'admin' AND is_active = TRUE
    ),
    'appliedMigrations', (
      SELECT COALESCE(jsonb_agg(migration_code ORDER BY applied_at), '[]'::JSONB)
      FROM public.app_schema_migrations
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_enterprise_preflight_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_enterprise_preflight_snapshot() TO authenticated;

DO $$
DECLARE
  expected_checksum TEXT := encode(digest('ENT-0:v1:migration-registry-and-preflight', 'sha256'), 'hex');
  existing_checksum TEXT;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM public.app_schema_migrations
  WHERE migration_code = 'ENT-0';

  IF existing_checksum IS NOT NULL AND existing_checksum <> expected_checksum THEN
    RAISE EXCEPTION 'MIGRATION_CHECKSUM_MISMATCH: ENT-0';
  END IF;

  INSERT INTO public.app_schema_migrations (
    migration_code, checksum, description, execution_context
  ) VALUES (
    'ENT-0', expected_checksum,
    'Enterprise migration registry and read-only preflight snapshot',
    'supabase-sql-editor'
  ) ON CONFLICT (migration_code) DO NOTHING;
END;
$$;

COMMIT;
