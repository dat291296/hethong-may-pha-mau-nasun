-- Security module 3: enforce RBAC and managed-region boundaries in PostgreSQL.
-- This migration changes functions and policies only. It does not modify application data.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_region()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT managed_region FROM public.profiles WHERE id = auth.uid()), '');
$$;

CREATE OR REPLACE FUNCTION public.can_access_region(target_region TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.get_my_role() = 'admin' THEN TRUE
    WHEN public.get_my_region() = 'Toàn Quốc' THEN TRUE
    WHEN NULLIF(BTRIM(target_region), '') IS NULL THEN FALSE
    ELSE public.get_my_region() = target_region
  END;
$$;

REVOKE ALL ON FUNCTION public.get_my_region() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_region() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_region() TO authenticated;
REVOKE ALL ON FUNCTION public.can_access_region(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_region(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_region(TEXT) TO authenticated;

ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "npp_select_auth" ON public.distributors;
DROP POLICY IF EXISTS "npp_insert_staff" ON public.distributors;
DROP POLICY IF EXISTS "npp_update_staff" ON public.distributors;
DROP POLICY IF EXISTS "npp_select_regional" ON public.distributors;
DROP POLICY IF EXISTS "npp_insert_regional_staff" ON public.distributors;
DROP POLICY IF EXISTS "npp_update_regional_staff" ON public.distributors;
CREATE POLICY "npp_select_regional" ON public.distributors FOR SELECT TO authenticated USING (public.can_access_region(region));
CREATE POLICY "npp_insert_regional_staff" ON public.distributors FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'qc') AND public.can_access_region(region));
CREATE POLICY "npp_update_regional_staff" ON public.distributors FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('admin', 'qc') AND public.can_access_region(region))
  WITH CHECK (public.get_my_role() IN ('admin', 'qc') AND public.can_access_region(region));

ALTER TABLE public.system_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sets_select_auth" ON public.system_sets;
DROP POLICY IF EXISTS "sets_insert_staff" ON public.system_sets;
DROP POLICY IF EXISTS "sets_update_staff" ON public.system_sets;
DROP POLICY IF EXISTS "sets_select_regional" ON public.system_sets;
DROP POLICY IF EXISTS "sets_insert_regional_staff" ON public.system_sets;
DROP POLICY IF EXISTS "sets_update_regional_staff" ON public.system_sets;
CREATE POLICY "sets_select_regional" ON public.system_sets FOR SELECT TO authenticated
  USING (public.can_access_region(region) OR (public.get_my_role() = 'qc' AND NULLIF(BTRIM(region), '') IS NULL));
CREATE POLICY "sets_insert_regional_staff" ON public.system_sets FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'qc') AND NOT public.is_month_locked(install_date)
    AND (public.can_access_region(region) OR (public.get_my_role() = 'qc' AND NULLIF(BTRIM(region), '') IS NULL)));
CREATE POLICY "sets_update_regional_staff" ON public.system_sets FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('admin', 'qc') AND NOT public.is_month_locked(install_date)
    AND (public.can_access_region(region) OR (public.get_my_role() = 'qc' AND NULLIF(BTRIM(region), '') IS NULL)))
  WITH CHECK (public.get_my_role() IN ('admin', 'qc') AND NOT public.is_month_locked(install_date)
    AND (public.can_access_region(region) OR (public.get_my_role() = 'qc' AND NULLIF(BTRIM(region), '') IS NULL)));

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['dispensers', 'mixers', 'computers', 'printers'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'asset_select_' || table_name, table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'asset_insert_' || table_name, table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'asset_update_' || table_name, table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'asset_select_regional_' || table_name, table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'asset_insert_regional_' || table_name, table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'asset_update_regional_' || table_name, table_name);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        public.get_my_role() = ''admin'' OR (public.get_my_role() = ''qc'' AND set_code IS NULL)
        OR EXISTS (SELECT 1 FROM public.system_sets s WHERE s.set_code = %I.set_code AND public.can_access_region(s.region)))',
        'asset_select_regional_' || table_name, table_name, table_name);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
        public.get_my_role() IN (''admin'', ''qc'') AND (set_code IS NULL
        OR EXISTS (SELECT 1 FROM public.system_sets s WHERE s.set_code = %I.set_code AND public.can_access_region(s.region))))',
        'asset_insert_regional_' || table_name, table_name, table_name);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
        public.get_my_role() IN (''admin'', ''qc'') AND (set_code IS NULL
        OR EXISTS (SELECT 1 FROM public.system_sets s WHERE s.set_code = %I.set_code AND public.can_access_region(s.region)))) WITH CHECK (
        public.get_my_role() IN (''admin'', ''qc'') AND (set_code IS NULL
        OR EXISTS (SELECT 1 FROM public.system_sets s WHERE s.set_code = %I.set_code AND public.can_access_region(s.region))))',
        'asset_update_regional_' || table_name, table_name, table_name, table_name);
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.repair_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "repair_select_auth" ON public.repair_tickets;
DROP POLICY IF EXISTS "repair_insert_staff" ON public.repair_tickets;
DROP POLICY IF EXISTS "repair_update_staff" ON public.repair_tickets;
DROP POLICY IF EXISTS "repair_select_regional" ON public.repair_tickets;
DROP POLICY IF EXISTS "repair_insert_regional_staff" ON public.repair_tickets;
DROP POLICY IF EXISTS "repair_update_regional_staff" ON public.repair_tickets;
CREATE POLICY "repair_select_regional" ON public.repair_tickets FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin' OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.distributors d WHERE d.id = repair_tickets.npp_id AND public.can_access_region(d.region)));
CREATE POLICY "repair_insert_regional_staff" ON public.repair_tickets FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'qc') AND NOT public.is_month_locked(date)
    AND (npp_id IS NULL OR EXISTS (SELECT 1 FROM public.distributors d WHERE d.id = repair_tickets.npp_id AND public.can_access_region(d.region))));
CREATE POLICY "repair_update_regional_staff" ON public.repair_tickets FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('admin', 'qc') AND NOT public.is_month_locked(date)
    AND (npp_id IS NULL OR EXISTS (SELECT 1 FROM public.distributors d WHERE d.id = repair_tickets.npp_id AND public.can_access_region(d.region))))
  WITH CHECK (public.get_my_role() IN ('admin', 'qc') AND NOT public.is_month_locked(date)
    AND (npp_id IS NULL OR EXISTS (SELECT 1 FROM public.distributors d WHERE d.id = repair_tickets.npp_id AND public.can_access_region(d.region))));

COMMIT;
