-- Security hardening migration
-- Run once in Supabase SQL Editor after schema.sql and rls_policies.sql.
-- The legacy desktop agent uses the public anon key. Keep it disabled until it
-- is migrated to a server-side authenticated endpoint with per-device tokens.

DROP POLICY IF EXISTS "tinting_logs_anon_insert" ON public.tinting_logs;
DROP POLICY IF EXISTS "tinting_logs_anon_select" ON public.tinting_logs;
DROP POLICY IF EXISTS "tinting_logs_auth_all" ON public.tinting_logs;
DROP POLICY IF EXISTS "formula_versions_anon_read" ON public.formula_versions;
DROP POLICY IF EXISTS "agent_telemetry_anon_insert" ON public.agent_telemetry;
DROP POLICY IF EXISTS "diagnostic_commands_anon_all" ON public.diagnostic_commands;
DROP POLICY IF EXISTS "diagnostic_commands_auth_all" ON public.diagnostic_commands;
DROP POLICY IF EXISTS "sets_update_agent" ON public.system_sets;

CREATE POLICY "tinting_logs_select_staff" ON public.tinting_logs
  FOR SELECT TO authenticated USING (public.get_my_role() IN ('admin', 'qc'));
CREATE POLICY "tinting_logs_insert_staff" ON public.tinting_logs
  FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('admin', 'qc'));

CREATE POLICY "formula_versions_select_auth" ON public.formula_versions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "agent_telemetry_insert_staff" ON public.agent_telemetry
  FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('admin', 'qc'));

CREATE POLICY "diagnostic_commands_select_staff" ON public.diagnostic_commands
  FOR SELECT TO authenticated USING (public.get_my_role() IN ('admin', 'qc'));
CREATE POLICY "diagnostic_commands_insert_admin" ON public.diagnostic_commands
  FOR INSERT TO authenticated WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "diagnostic_commands_update_admin" ON public.diagnostic_commands
  FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');
