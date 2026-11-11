-- Viewers can read records across regions while write authorization remains region-scoped.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_view_region(target_region text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
 SELECT coalesce(public.has_active_app_session() AND
   (public.get_my_role() IN ('admin','viewer') OR
     (public.get_my_region() IN ('Miền Bắc','Miền Trung','Miền Nam')
      AND target_region=public.get_my_region())),false);
$$;
REVOKE ALL ON FUNCTION public.can_view_region(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_view_region(text) TO authenticated;

DO $$ DECLARE item text; BEGIN
 FOREACH item IN ARRAY ARRAY['distributors','system_sets'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS canonical_region_read ON public.%I',item);
   EXECUTE format('CREATE POLICY canonical_region_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.can_view_region(region))',item);
 END LOOP;
 FOREACH item IN ARRAY ARRAY['dispensers','mixers','computers','printers'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS canonical_region_read ON public.%I',item);
   EXECUTE format('CREATE POLICY canonical_region_read ON public.%1$I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.get_my_role() IN (''admin'',''viewer'') OR EXISTS (SELECT 1 FROM public.system_sets s WHERE s.set_code=%1$I.set_code AND public.can_view_region(s.region)))',item);
 END LOOP;
END $$;

DROP POLICY IF EXISTS canonical_region_read ON public.repair_tickets;
CREATE POLICY canonical_region_read ON public.repair_tickets AS RESTRICTIVE FOR SELECT TO authenticated
 USING (public.get_my_role() IN ('admin','viewer') OR EXISTS
 (SELECT 1 FROM public.distributors d WHERE d.id=repair_tickets.npp_id AND public.can_view_region(d.region)));
DROP POLICY IF EXISTS viewer_national_read_repair ON public.repair_tickets;
CREATE POLICY viewer_national_read_repair ON public.repair_tickets FOR SELECT TO authenticated
 USING (public.get_my_role()='viewer');

DROP POLICY IF EXISTS equipment_events_read ON public.equipment_replacement_events;
CREATE POLICY equipment_events_read ON public.equipment_replacement_events FOR SELECT TO authenticated
 USING (public.can_view_region(region));

DROP POLICY IF EXISTS sync_change_feed_scoped_read ON public.sync_change_feed;
CREATE POLICY sync_change_feed_scoped_read ON public.sync_change_feed FOR SELECT TO authenticated
 USING (public.get_my_role()='admin' OR region IS NULL OR public.can_view_region(region));

CREATE OR REPLACE FUNCTION public.can_receive_sync_topic(target_topic text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(public.has_active_app_session()
  AND (public.get_my_role() IN ('admin','viewer') OR public.get_my_region() IN ('Miền Bắc','Miền Trung','Miền Nam'))
  AND (target_topic='nasun:sync:global'
   OR (public.get_my_role()='admin' AND target_topic='nasun:sync:admin')
   OR (public.get_my_role()='viewer' AND target_topic=ANY(ARRAY[
      'nasun:sync:miền_bắc','nasun:sync:miền_trung','nasun:sync:miền_nam']))
   OR target_topic='nasun:sync:'||replace(lower(public.get_my_region()),' ','_')),false);
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
