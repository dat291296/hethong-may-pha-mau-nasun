-- Security module 11: MFA enforcement for privileged accounts.
-- Business data is not deleted or modified.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT FALSE;

-- Privileged roles must use an aal2 session. This only changes account security state.
UPDATE public.profiles
SET mfa_required = TRUE,
    updated_at = NOW()
WHERE role IN ('admin', 'qc')
  AND mfa_required IS DISTINCT FROM TRUE;

CREATE OR REPLACE FUNCTION public.has_privileged_aal()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt()->>'aal', '') = 'aal2';
$$;

REVOKE ALL ON FUNCTION public.has_privileged_aal() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_privileged_aal() FROM anon;
GRANT EXECUTE ON FUNCTION public.has_privileged_aal() TO authenticated;

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
    AND is_active = TRUE
    AND (
      role NOT IN ('admin', 'qc')
      OR mfa_required = FALSE
      OR public.has_privileged_aal()
    );
$$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

COMMIT;
