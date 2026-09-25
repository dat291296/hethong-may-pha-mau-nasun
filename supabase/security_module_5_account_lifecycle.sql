-- Security module 5: reversible account deactivation without deleting user data.
-- Existing profiles and business data are preserved.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid() AND is_active = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_account_active(target_user_id UUID, target_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_role TEXT;
  updated_profile public.profiles%ROWTYPE;
BEGIN
  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = caller_id AND is_active = TRUE;

  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF caller_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF target_user_id = caller_id AND target_active = FALSE THEN RAISE EXCEPTION 'CANNOT_DEACTIVATE_SELF'; END IF;

  UPDATE public.profiles
  SET is_active = target_active,
      deactivated_at = CASE WHEN target_active THEN NULL ELSE NOW() END,
      deactivated_by = CASE WHEN target_active THEN NULL ELSE caller_id END,
      updated_at = NOW()
  WHERE id = target_user_id
  RETURNING * INTO updated_profile;

  IF updated_profile.id IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('id', updated_profile.id, 'is_active', updated_profile.is_active);
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_account_active(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_account_active(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_user_account_active(UUID, BOOLEAN) TO authenticated;

-- Users may read their profile, but only admins may mutate security-sensitive profile fields.
DROP POLICY IF EXISTS "profile_update_own" ON public.profiles;

COMMIT;
