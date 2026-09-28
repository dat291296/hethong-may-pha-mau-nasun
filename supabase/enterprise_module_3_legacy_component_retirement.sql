-- ENT-3: controlled retirement of obsolete Agent-era database objects.
-- Existing rows are retained. Browser access and change-feed triggers are disabled.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('nasun-enterprise-migrations', 0));

DO $$
BEGIN
  IF to_regclass('public.app_schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'ENT_3_REQUIRES_ENT_0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_schema_migrations WHERE migration_code = 'ENT-2') THEN
    RAISE EXCEPTION 'ENT_3_REQUIRES_ENT_2';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.legacy_component_retirements (
  object_name TEXT PRIMARY KEY,
  object_type TEXT NOT NULL DEFAULT 'table' CHECK (object_type = 'table'),
  retirement_status TEXT NOT NULL CHECK (retirement_status IN ('retired', 'absent')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 500),
  estimated_rows BIGINT,
  policy_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB,
  privilege_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB,
  retired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.legacy_component_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legacy_component_retirements FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.legacy_component_retirements FROM authenticated;
GRANT SELECT ON TABLE public.legacy_component_retirements TO authenticated;

DROP POLICY IF EXISTS legacy_component_retirements_admin_read ON public.legacy_component_retirements;
CREATE POLICY legacy_component_retirements_admin_read
  ON public.legacy_component_retirements
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

DO $$
DECLARE
  target_name TEXT;
  target_relation REGCLASS;
  policy_record RECORD;
  policy_snapshot JSONB;
  privilege_snapshot JSONB;
  estimated_rows BIGINT;
  sequence_name TEXT;
BEGIN
  FOREACH target_name IN ARRAY ARRAY[
    'formula_versions',
    'agent_telemetry',
    'diagnostic_commands'
  ] LOOP
    target_relation := to_regclass('public.' || target_name);

    IF target_relation IS NULL THEN
      INSERT INTO public.legacy_component_retirements (
        object_name, retirement_status, reason, retired_by
      ) VALUES (
        target_name,
        'absent',
        'Obsolete Agent-era component was not installed in this environment.',
        auth.uid()
      )
      ON CONFLICT (object_name) DO NOTHING;
      CONTINUE;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'policyName', policyname,
      'permissive', permissive,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'withCheck', with_check
    ) ORDER BY policyname), '[]'::JSONB)
    INTO policy_snapshot
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = target_name;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'grantee', grantee,
      'privilege', privilege_type,
      'grantable', is_grantable
    ) ORDER BY grantee, privilege_type), '[]'::JSONB)
    INTO privilege_snapshot
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = target_name;

    SELECT GREATEST(c.reltuples::BIGINT, 0)
    INTO estimated_rows
    FROM pg_class c
    WHERE c.oid = target_relation;

    INSERT INTO public.legacy_component_retirements (
      object_name, retirement_status, reason, estimated_rows,
      policy_snapshot, privilege_snapshot, retired_by
    ) VALUES (
      target_name,
      'retired',
      'Obsolete Agent-era component retained for recovery but disabled for browser access.',
      estimated_rows,
      policy_snapshot,
      privilege_snapshot,
      auth.uid()
    )
    ON CONFLICT (object_name) DO NOTHING;

    FOR policy_record IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, target_name);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', target_name);

    sequence_name := NULL;
    IF target_name = 'agent_telemetry' THEN
      sequence_name := pg_get_serial_sequence('public.agent_telemetry', 'id');
    END IF;
    IF sequence_name IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated', sequence_name);
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.formula_versions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_sync_change_formula_versions ON public.formula_versions;
  END IF;
END;
$$;

INSERT INTO public.app_schema_migrations (
  migration_code, checksum, description, applied_by, execution_context
) VALUES (
  'ENT-3',
  encode(digest('ENT-3:v1:legacy-component-retirement', 'sha256'), 'hex'),
  'Controlled retirement of obsolete Agent-era database objects without deleting records',
  auth.uid(),
  'supabase-sql-editor'
)
ON CONFLICT (migration_code) DO NOTHING;

COMMIT;
