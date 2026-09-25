-- Security module 2: remove anonymous and unrestricted agent policies.
-- This migration changes access policies only. It does not modify or delete data.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tinting_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tinting_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.tinting_logs FROM anon';
    EXECUTE 'DROP POLICY IF EXISTS "tinting_logs_anon_insert" ON public.tinting_logs';
    EXECUTE 'DROP POLICY IF EXISTS "tinting_logs_anon_select" ON public.tinting_logs';
    EXECUTE 'DROP POLICY IF EXISTS "tinting_logs_auth_all" ON public.tinting_logs';
    EXECUTE 'DROP POLICY IF EXISTS "tinting_logs_select_staff" ON public.tinting_logs';
    EXECUTE 'DROP POLICY IF EXISTS "tinting_logs_insert_staff" ON public.tinting_logs';
    EXECUTE 'CREATE POLICY "tinting_logs_select_staff" ON public.tinting_logs FOR SELECT TO authenticated USING (public.get_my_role() IN (''admin'', ''qc''))';
    EXECUTE 'CREATE POLICY "tinting_logs_insert_staff" ON public.tinting_logs FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN (''admin'', ''qc''))';
  END IF;

  IF to_regclass('public.formula_versions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.formula_versions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.formula_versions FROM anon';
    EXECUTE 'DROP POLICY IF EXISTS "formula_versions_anon_read" ON public.formula_versions';
    EXECUTE 'DROP POLICY IF EXISTS "formula_versions_select_auth" ON public.formula_versions';
    EXECUTE 'CREATE POLICY "formula_versions_select_auth" ON public.formula_versions FOR SELECT TO authenticated USING (true)';
  END IF;

  IF to_regclass('public.agent_telemetry') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.agent_telemetry ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.agent_telemetry FROM anon';
    EXECUTE 'DROP POLICY IF EXISTS "agent_telemetry_anon_insert" ON public.agent_telemetry';
  END IF;

  IF to_regclass('public.diagnostic_commands') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.diagnostic_commands ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.diagnostic_commands FROM anon';
    EXECUTE 'DROP POLICY IF EXISTS "diagnostic_commands_anon_all" ON public.diagnostic_commands';
    EXECUTE 'DROP POLICY IF EXISTS "diagnostic_commands_auth_all" ON public.diagnostic_commands';
    EXECUTE 'DROP POLICY IF EXISTS "diagnostic_commands_select_staff" ON public.diagnostic_commands';
    EXECUTE 'DROP POLICY IF EXISTS "diagnostic_commands_insert_admin" ON public.diagnostic_commands';
    EXECUTE 'DROP POLICY IF EXISTS "diagnostic_commands_update_admin" ON public.diagnostic_commands';
    EXECUTE 'CREATE POLICY "diagnostic_commands_select_staff" ON public.diagnostic_commands FOR SELECT TO authenticated USING (public.get_my_role() IN (''admin'', ''qc''))';
    EXECUTE 'CREATE POLICY "diagnostic_commands_insert_admin" ON public.diagnostic_commands FOR INSERT TO authenticated WITH CHECK (public.get_my_role() = ''admin'')';
    EXECUTE 'CREATE POLICY "diagnostic_commands_update_admin" ON public.diagnostic_commands FOR UPDATE TO authenticated USING (public.get_my_role() = ''admin'') WITH CHECK (public.get_my_role() = ''admin'')';
  END IF;

  IF to_regclass('public.system_sets') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.system_sets ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.system_sets FROM anon';
    EXECUTE 'DROP POLICY IF EXISTS "sets_update_agent" ON public.system_sets';
  END IF;
END;
$$;

COMMIT;
