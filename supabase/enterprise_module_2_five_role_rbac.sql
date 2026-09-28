-- ENT-2: five-role RBAC with regional data boundaries.
-- This migration changes constraints, functions and policies only.
-- It never updates or deletes NPP, equipment, repair or audit records.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('nasun-enterprise-migrations', 0));

DO $$
BEGIN
  IF to_regclass('public.app_schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'ENT_2_REQUIRES_ENT_0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_schema_migrations WHERE migration_code = 'ENT-1') THEN
    RAISE EXCEPTION 'ENT_2_REQUIRES_ENT_1';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'ENT_2_REQUIRES_PROFILES';
  END IF;
  IF to_regprocedure('public.consume_security_rate_limit(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'ENT_2_REQUIRES_SECURITY_RATE_LIMITS';
  END IF;
END;
$$;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'technician', 'qc', 'viewer')) NOT VALID;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_role_check;

CREATE OR REPLACE FUNCTION public.is_operational_staff()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.get_my_role() IN ('admin', 'manager', 'technician', 'qc');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_master_data()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.get_my_role() IN ('admin', 'manager', 'qc');
$$;

REVOKE ALL ON FUNCTION public.is_operational_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_master_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_operational_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_master_data() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_user_access(
  target_user_id UUID,
  target_role TEXT,
  target_region TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_role TEXT := public.get_my_role();
  normalized_role TEXT := LOWER(BTRIM(COALESCE(target_role, '')));
  normalized_region TEXT := BTRIM(COALESCE(target_region, ''));
  current_role TEXT;
  limit_state JSONB;
  updated_profile public.profiles%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF caller_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF target_user_id IS NULL THEN RAISE EXCEPTION 'TARGET_USER_REQUIRED'; END IF;
  IF target_user_id = caller_id THEN RAISE EXCEPTION 'CANNOT_CHANGE_OWN_ACCESS'; END IF;
  IF normalized_role NOT IN ('admin', 'manager', 'technician', 'qc', 'viewer') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;

  SELECT role INTO current_role FROM public.profiles WHERE id = target_user_id;
  IF current_role IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF normalized_role = 'admin' AND current_role <> 'admin' THEN
    RAISE EXCEPTION 'USE_PROVISION_ADMIN_ROLE';
  END IF;

  IF normalized_role = 'admin' THEN
    normalized_region := 'Toàn Quốc';
  ELSIF normalized_region NOT IN ('Miền Bắc', 'Miền Trung', 'Miền Nam', 'Toàn Quốc') THEN
    RAISE EXCEPTION 'INVALID_REGION';
  END IF;

  limit_state := public.consume_security_rate_limit('update_user_access', 10, 600);
  IF NOT COALESCE((limit_state->>'allowed')::BOOLEAN, FALSE) THEN
    RETURN jsonb_build_object(
      'error', 'RATE_LIMIT_EXCEEDED',
      'retry_after_seconds', (limit_state->>'retry_after_seconds')::INTEGER
    );
  END IF;

  UPDATE public.profiles
  SET role = normalized_role,
      managed_region = normalized_region,
      updated_at = NOW()
  WHERE id = target_user_id
  RETURNING * INTO updated_profile;

  RETURN jsonb_build_object(
    'id', updated_profile.id,
    'role', updated_profile.role,
    'managed_region', updated_profile.managed_region
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_access(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_access(UUID, TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.distributors') IS NOT NULL THEN
    DROP POLICY IF EXISTS npp_insert_regional_staff ON public.distributors;
    DROP POLICY IF EXISTS npp_update_regional_staff ON public.distributors;
    CREATE POLICY npp_insert_regional_staff ON public.distributors FOR INSERT TO authenticated
      WITH CHECK (public.can_manage_master_data() AND public.can_access_region(region));
    CREATE POLICY npp_update_regional_staff ON public.distributors FOR UPDATE TO authenticated
      USING (public.can_manage_master_data() AND public.can_access_region(region))
      WITH CHECK (public.can_manage_master_data() AND public.can_access_region(region));
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.system_sets') IS NOT NULL THEN
    DROP POLICY IF EXISTS sets_select_regional ON public.system_sets;
    DROP POLICY IF EXISTS sets_insert_regional_staff ON public.system_sets;
    DROP POLICY IF EXISTS sets_update_regional_staff ON public.system_sets;
    CREATE POLICY sets_select_regional ON public.system_sets FOR SELECT TO authenticated
      USING (public.can_access_region(region) OR (public.is_operational_staff() AND NULLIF(BTRIM(region), '') IS NULL));
    CREATE POLICY sets_insert_regional_staff ON public.system_sets FOR INSERT TO authenticated
      WITH CHECK (public.is_operational_staff() AND NOT public.is_month_locked(install_date)
        AND (public.can_access_region(region) OR NULLIF(BTRIM(region), '') IS NULL));
    CREATE POLICY sets_update_regional_staff ON public.system_sets FOR UPDATE TO authenticated
      USING (public.is_operational_staff() AND NOT public.is_month_locked(install_date)
        AND (public.can_access_region(region) OR NULLIF(BTRIM(region), '') IS NULL))
      WITH CHECK (public.is_operational_staff() AND NOT public.is_month_locked(install_date)
        AND (public.can_access_region(region) OR NULLIF(BTRIM(region), '') IS NULL));
  END IF;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['dispensers', 'mixers', 'computers', 'printers'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'asset_select_regional_' || table_name, table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'asset_insert_regional_' || table_name, table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'asset_update_regional_' || table_name, table_name);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        public.get_my_role() IN (''admin'', ''manager'') OR (public.is_operational_staff() AND set_code IS NULL)
        OR EXISTS (SELECT 1 FROM public.system_sets s WHERE s.set_code = %I.set_code AND public.can_access_region(s.region)))',
        'asset_select_regional_' || table_name, table_name, table_name);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
        public.is_operational_staff() AND (set_code IS NULL OR EXISTS (
          SELECT 1 FROM public.system_sets s WHERE s.set_code = %I.set_code AND public.can_access_region(s.region))))',
        'asset_insert_regional_' || table_name, table_name, table_name);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
        public.is_operational_staff() AND (set_code IS NULL OR EXISTS (
          SELECT 1 FROM public.system_sets s WHERE s.set_code = %I.set_code AND public.can_access_region(s.region)))) WITH CHECK (
        public.is_operational_staff() AND (set_code IS NULL OR EXISTS (
          SELECT 1 FROM public.system_sets s WHERE s.set_code = %I.set_code AND public.can_access_region(s.region))))',
        'asset_update_regional_' || table_name, table_name, table_name, table_name);
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.repair_tickets') IS NOT NULL THEN
    DROP POLICY IF EXISTS repair_insert_regional_staff ON public.repair_tickets;
    DROP POLICY IF EXISTS repair_update_regional_staff ON public.repair_tickets;
    CREATE POLICY repair_insert_regional_staff ON public.repair_tickets FOR INSERT TO authenticated
      WITH CHECK (public.is_operational_staff() AND NOT public.is_month_locked(date)
        AND (npp_id IS NULL OR EXISTS (
          SELECT 1 FROM public.distributors d WHERE d.id = repair_tickets.npp_id AND public.can_access_region(d.region))));
    CREATE POLICY repair_update_regional_staff ON public.repair_tickets FOR UPDATE TO authenticated
      USING (public.is_operational_staff() AND NOT public.is_month_locked(date)
        AND (npp_id IS NULL OR EXISTS (
          SELECT 1 FROM public.distributors d WHERE d.id = repair_tickets.npp_id AND public.can_access_region(d.region))))
      WITH CHECK (public.is_operational_staff() AND NOT public.is_month_locked(date)
        AND (npp_id IS NULL OR EXISTS (
          SELECT 1 FROM public.distributors d WHERE d.id = repair_tickets.npp_id AND public.can_access_region(d.region))));
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS audit_select_staff ON public.audit_logs;
    CREATE POLICY audit_select_staff ON public.audit_logs FOR SELECT TO authenticated
      USING (public.is_operational_staff());
  END IF;
  IF to_regclass('public.sync_operations') IS NOT NULL THEN
    DROP POLICY IF EXISTS sync_operations_insert_own ON public.sync_operations;
    CREATE POLICY sync_operations_insert_own ON public.sync_operations FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid() AND public.is_operational_staff());
  END IF;
END;
$$;

-- Preserve the deployed workflow implementation and widen only its explicit role gate.
DO $$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;
BEGIN
  IF to_regprocedure('public.execute_equipment_workflow(text,text,jsonb)') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.execute_equipment_workflow(text,text,jsonb)'::regprocedure)
      INTO function_definition;
    updated_definition := replace(
      function_definition,
      'public.get_my_role() NOT IN (''admin'', ''qc'')',
      'public.get_my_role() NOT IN (''admin'', ''manager'', ''technician'', ''qc'')'
    );
    IF updated_definition = function_definition THEN
      RAISE EXCEPTION 'ENT_2_WORKFLOW_ROLE_GATE_NOT_FOUND';
    END IF;
    EXECUTE updated_definition;
  END IF;
END;
$$;

INSERT INTO public.app_schema_migrations (
  migration_code, checksum, description, applied_by, execution_context
) VALUES (
  'ENT-2',
  encode(digest('ENT-2:v1:five-role-regional-rbac', 'sha256'), 'hex'),
  'Five-role regional RBAC without business data mutation',
  auth.uid(),
  'supabase-sql-editor'
)
ON CONFLICT (migration_code) DO NOTHING;

COMMIT;
