-- Apply after account authorization and atomic set deletion migrations.
-- This migration changes policies for future actions only; existing records are preserved.
BEGIN;

CREATE OR REPLACE FUNCTION public.require_recent_authentication()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  method JSONB;
  authenticated_at NUMERIC;
  current_epoch NUMERIC := EXTRACT(EPOCH FROM NOW());
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(auth.jwt()->'amr') = 'array' THEN
    FOR method IN SELECT value FROM jsonb_array_elements(auth.jwt()->'amr') LOOP
      IF method->>'method' IN ('password', 'totp') AND (method->>'timestamp') ~ '^[0-9]{1,12}$' THEN
        authenticated_at := (method->>'timestamp')::NUMERIC;
        IF authenticated_at BETWEEN current_epoch - 300 AND current_epoch + 30 THEN RETURN TRUE; END IF;
      END IF;
    END LOOP;
  END IF;
  RAISE EXCEPTION 'REAUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.require_recent_authentication() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_recent_authentication() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_sensitive_profile_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.managed_region IS DISTINCT FROM OLD.managed_region
    OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    PERFORM public.require_recent_authentication();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_sensitive_profile_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_sensitive_profile_change ON public.profiles;
CREATE TRIGGER guard_sensitive_profile_change BEFORE UPDATE OF role, managed_region, is_active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_sensitive_profile_change();

CREATE OR REPLACE FUNCTION public.guard_sensitive_set_deletion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_recent_authentication();
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_sensitive_set_deletion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_sensitive_set_deletion ON public.system_sets;
CREATE TRIGGER guard_sensitive_set_deletion BEFORE DELETE ON public.system_sets
FOR EACH ROW EXECUTE FUNCTION public.guard_sensitive_set_deletion();
NOTIFY pgrst, 'reload schema';
COMMIT;
