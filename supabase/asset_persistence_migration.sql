-- Restore persistent edit/delete permissions for warehouse assets.
-- This migration does not modify or delete application data.

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['dispensers', 'mixers', 'computers', 'printers'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''Đang chạy tốt''', table_name);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'asset_update_' || table_name, table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.get_my_role() IN (''admin'', ''qc'')) WITH CHECK (public.get_my_role() IN (''admin'', ''qc''))',
        'asset_update_' || table_name,
        table_name
      );
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'asset_delete_' || table_name, table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.get_my_role() = ''admin'')',
        'asset_delete_' || table_name,
        table_name
      );
    END IF;
  END LOOP;

  IF to_regclass('public.system_sets') IS NOT NULL THEN
    ALTER TABLE public.system_sets ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "sets_update_staff" ON public.system_sets;
    CREATE POLICY "sets_update_staff"
      ON public.system_sets
      FOR UPDATE TO authenticated
      USING (public.get_my_role() IN ('admin', 'qc') AND NOT public.is_month_locked(install_date))
      WITH CHECK (public.get_my_role() IN ('admin', 'qc') AND NOT public.is_month_locked(install_date));
  END IF;
END;
$$;
