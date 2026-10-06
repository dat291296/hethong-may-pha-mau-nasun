-- Additive team assignment and optimistic concurrency. Existing records stay intact.
BEGIN;
ALTER TABLE public.repair_tickets
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_due_date DATE,
  ADD COLUMN IF NOT EXISTS record_version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_updated_by UUID;
CREATE INDEX IF NOT EXISTS repair_assigned_due_idx ON public.repair_tickets(assigned_user_id, assignment_due_date);

-- The existing trigger writes protected metadata only after an RLS-authorized mutation.
-- Browser roles must not receive direct write access to version metadata.
ALTER FUNCTION public.bump_sync_entity_version() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.bump_sync_entity_version() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_repair_team_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target_region TEXT; assignee RECORD;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF COALESCE(public.get_my_role(), '') NOT IN ('admin','manager','technician','qc') THEN RAISE EXCEPTION 'FORBIDDEN_REPAIR'; END IF;
    IF (TG_OP = 'INSERT' AND NEW.assigned_user_id IS NOT NULL AND NEW.assigned_user_id <> auth.uid())
      OR (TG_OP = 'UPDATE' AND NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id) THEN
      IF COALESCE(public.get_my_role(), '') NOT IN ('admin','manager') THEN RAISE EXCEPTION 'FORBIDDEN_ASSIGNMENT'; END IF;
    END IF;
    IF NEW.assigned_user_id IS NOT NULL THEN
      SELECT role, managed_region, is_active INTO assignee FROM public.profiles WHERE id = NEW.assigned_user_id;
      SELECT region INTO target_region FROM public.distributors WHERE id = NEW.npp_id;
      IF NOT FOUND OR NOT COALESCE(assignee.is_active,FALSE) OR assignee.role NOT IN ('admin','manager','technician','qc')
        OR (assignee.role <> 'admin' AND COALESCE(assignee.managed_region,'') <> 'Toàn Quốc' AND assignee.managed_region IS DISTINCT FROM target_region)
      THEN RAISE EXCEPTION 'INVALID_ASSIGNEE_REGION'; END IF;
    END IF;
  END IF;
  NEW.record_version := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE OLD.record_version + 1 END;
  NEW.last_updated_at := clock_timestamp();
  NEW.last_updated_by := auth.uid();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_repair_team_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_repair_team_update ON public.repair_tickets;
CREATE TRIGGER trg_repair_team_update BEFORE INSERT OR UPDATE ON public.repair_tickets FOR EACH ROW EXECUTE FUNCTION public.guard_repair_team_update();
NOTIFY pgrst, 'reload schema';
COMMIT;
