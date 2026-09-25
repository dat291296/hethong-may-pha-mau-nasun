-- Security module 18: disable mandatory MFA by product decision.
-- Business data is not modified. Password auth, RLS, RBAC and session validation remain enabled.

BEGIN;

ALTER TABLE public.profiles
  ALTER COLUMN mfa_required SET DEFAULT FALSE;

UPDATE public.profiles
SET mfa_required = FALSE,
    updated_at = NOW()
WHERE mfa_required IS DISTINCT FROM FALSE;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
    AND is_active = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.keep_mfa_disabled()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.mfa_required := FALSE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_mfa_disabled ON public.profiles;
CREATE TRIGGER trg_keep_mfa_disabled
BEFORE INSERT OR UPDATE OF mfa_required, role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.keep_mfa_disabled();

COMMIT;
