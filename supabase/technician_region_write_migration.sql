-- Narrow technician writes to the assigned North, Central or South region.
-- Existing role permissions, administrator access and business rows stay intact.
BEGIN;

CREATE OR REPLACE FUNCTION public.technician_can_write_region(target_region TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(public.get_my_role() <> 'technician' OR
    (public.get_my_region() IN ('Miền Bắc', 'Miền Trung', 'Miền Nam')
      AND target_region = public.get_my_region()), FALSE);
$$;
REVOKE ALL ON FUNCTION public.technician_can_write_region(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.technician_can_write_region(TEXT) TO authenticated;

DROP POLICY IF EXISTS technician_region_update ON public.distributors;
CREATE POLICY technician_region_update ON public.distributors AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.technician_can_write_region(region)) WITH CHECK (public.technician_can_write_region(region));
DROP POLICY IF EXISTS technician_region_insert ON public.distributors;
CREATE POLICY technician_region_insert ON public.distributors AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.technician_can_write_region(region));

DROP POLICY IF EXISTS technician_region_update ON public.system_sets;
CREATE POLICY technician_region_update ON public.system_sets AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.technician_can_write_region(region))
  WITH CHECK (public.technician_can_write_region(region) AND
    (public.get_my_role() <> 'technician' OR npp_id IS NULL OR EXISTS
      (SELECT 1 FROM public.distributors d WHERE d.id = system_sets.npp_id AND public.technician_can_write_region(d.region))));
DROP POLICY IF EXISTS technician_region_insert ON public.system_sets;
CREATE POLICY technician_region_insert ON public.system_sets AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.technician_can_write_region(region) AND
    (public.get_my_role() <> 'technician' OR npp_id IS NULL OR EXISTS
      (SELECT 1 FROM public.distributors d WHERE d.id = system_sets.npp_id AND public.technician_can_write_region(d.region))));

DROP POLICY IF EXISTS technician_region_update ON public.repair_tickets;
CREATE POLICY technician_region_update ON public.repair_tickets AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.get_my_role() <> 'technician' OR EXISTS
    (SELECT 1 FROM public.distributors d WHERE d.id = repair_tickets.npp_id AND public.technician_can_write_region(d.region)))
  WITH CHECK (public.get_my_role() <> 'technician' OR EXISTS
    (SELECT 1 FROM public.distributors d WHERE d.id = repair_tickets.npp_id AND public.technician_can_write_region(d.region)));
DROP POLICY IF EXISTS technician_region_insert ON public.repair_tickets;
CREATE POLICY technician_region_insert ON public.repair_tickets AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() <> 'technician' OR EXISTS
    (SELECT 1 FROM public.distributors d WHERE d.id = repair_tickets.npp_id AND public.technician_can_write_region(d.region)));

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['dispensers','mixers','computers','printers'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS technician_region_update ON public.%I',table_name);
    EXECUTE format('CREATE POLICY technician_region_update ON public.%1$I AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (public.get_my_role() <> ''technician'' OR EXISTS (SELECT 1 FROM public.system_sets s WHERE s.set_code = %1$I.set_code AND public.technician_can_write_region(s.region)))
      WITH CHECK (public.get_my_role() <> ''technician'' OR set_code IS NULL OR EXISTS (SELECT 1 FROM public.system_sets s WHERE s.set_code = %1$I.set_code AND public.technician_can_write_region(s.region)))',table_name);
    EXECUTE format('DROP POLICY IF EXISTS technician_region_insert ON public.%I',table_name);
    EXECUTE format('CREATE POLICY technician_region_insert ON public.%1$I AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (public.get_my_role() <> ''technician'' OR EXISTS (SELECT 1 FROM public.system_sets s WHERE s.set_code = %1$I.set_code AND public.technician_can_write_region(s.region)))',table_name);
  END LOOP;
END;
$$;

-- SECURITY DEFINER RPCs also update these tables. Enforce the same boundary there.
CREATE OR REPLACE FUNCTION public.guard_technician_region_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE old_region TEXT; new_region TEXT;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'technician' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME IN ('system_sets','distributors') THEN
    new_region := NEW.region;
    IF TG_OP = 'UPDATE' THEN old_region := OLD.region; END IF;
  ELSIF TG_TABLE_NAME = 'repair_tickets' THEN
    SELECT region INTO new_region FROM public.distributors WHERE id = NEW.npp_id;
    IF TG_OP = 'UPDATE' THEN SELECT region INTO old_region FROM public.distributors WHERE id = OLD.npp_id; END IF;
  ELSE
    SELECT region INTO new_region FROM public.system_sets WHERE set_code = NEW.set_code;
    IF TG_OP = 'UPDATE' THEN SELECT region INTO old_region FROM public.system_sets WHERE set_code = OLD.set_code; END IF;
    -- A regional withdrawal may detach an existing regional device into stock.
    IF TG_OP = 'UPDATE' AND NEW.set_code IS NULL AND public.technician_can_write_region(old_region) THEN new_region := old_region; END IF;
  END IF;
  IF NOT public.technician_can_write_region(new_region) OR
     (TG_OP = 'UPDATE' AND NOT public.technician_can_write_region(old_region)) THEN
    RAISE EXCEPTION 'TECHNICIAN_REGION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'system_sets' THEN
    IF NEW.npp_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM public.distributors d WHERE d.id = NEW.npp_id AND public.technician_can_write_region(d.region)) THEN
      RAISE EXCEPTION 'TECHNICIAN_REGION_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_technician_region_write() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['distributors','system_sets','repair_tickets','dispensers','mixers','computers','printers'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_technician_region_write ON public.%I',table_name);
    EXECUTE format('CREATE TRIGGER guard_technician_region_write BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_technician_region_write()',table_name);
  END LOOP;
END;
$$;
COMMIT;
