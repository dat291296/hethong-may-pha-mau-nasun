-- Security module 8: profile property-level authorization.
-- Existing profiles and business data are preserved.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_user_access(
  target_user_id UUID,
  target_role TEXT,
  target_region TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_role TEXT;
  normalized_role TEXT := LOWER(BTRIM(COALESCE(target_role, '')));
  normalized_region TEXT := BTRIM(COALESCE(target_region, ''));
  updated_profile public.profiles%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = caller_id AND is_active = TRUE;

  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'TARGET_USER_REQUIRED';
  END IF;
  IF target_user_id = caller_id THEN
    RAISE EXCEPTION 'CANNOT_CHANGE_OWN_ACCESS';
  END IF;
  IF normalized_role NOT IN ('admin', 'qc', 'viewer') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;

  IF normalized_role = 'admin' THEN
    normalized_region := 'Toàn Quốc';
  ELSIF normalized_region NOT IN ('Miền Bắc', 'Miền Trung', 'Miền Nam') THEN
    RAISE EXCEPTION 'INVALID_REGION';
  END IF;

  UPDATE public.profiles
  SET role = normalized_role,
      managed_region = normalized_region,
      updated_at = NOW()
  WHERE id = target_user_id
  RETURNING * INTO updated_profile;

  IF updated_profile.id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object(
    'id', updated_profile.id,
    'role', updated_profile.role,
    'managed_region', updated_profile.managed_region
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_access(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_user_access(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_user_access(UUID, TEXT, TEXT) TO authenticated;

-- Block direct profile mass assignment, including by admins. Access fields must
-- be changed through update_user_access; account state uses set_user_account_active.
DROP POLICY IF EXISTS "profile_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profile_update_admin" ON public.profiles;

COMMIT;
