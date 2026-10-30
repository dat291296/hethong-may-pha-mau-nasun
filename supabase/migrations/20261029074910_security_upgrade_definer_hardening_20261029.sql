-- Tighten privileged RPC search paths and require an active admin session before role grants.
-- Additive security changes only; no business records are modified or deleted.
BEGIN;
ALTER FUNCTION public.get_sync_change_feed(bigint, integer)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.get_sync_server_health()
  SET search_path = pg_catalog, public, pg_temp;
CREATE OR REPLACE FUNCTION public.provision_admin_role(
  p_target_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_role TEXT;
  normalized_reason TEXT := BTRIM(COALESCE(p_reason, ''));
  target_profile public.profiles%ROWTYPE;
  previous_role TEXT;
  grant_id UUID;
BEGIN
  PERFORM public.require_account_admin_session();
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = caller_id AND is_active = TRUE;
  IF caller_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_target_user_id IS NULL THEN RAISE EXCEPTION 'TARGET_USER_REQUIRED'; END IF;
  IF p_target_user_id = caller_id THEN RAISE EXCEPTION 'TARGET_ALREADY_CALLER'; END IF;
  IF char_length(normalized_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'ADMIN_GRANT_REASON_REQUIRED';
  END IF;
  SELECT * INTO target_profile
  FROM public.profiles
  WHERE id = p_target_user_id
  FOR UPDATE;
  IF target_profile.id IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF target_profile.is_active IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'TARGET_ACCOUNT_INACTIVE'; END IF;
  IF target_profile.role = 'admin' THEN
    RETURN jsonb_build_object('id', target_profile.id, 'role', 'admin', 'alreadyAdmin', TRUE);
  END IF;
  previous_role := target_profile.role;
  UPDATE public.profiles
  SET role = 'admin', managed_region = 'Toàn Quốc', updated_at = NOW()
  WHERE id = p_target_user_id;
  INSERT INTO public.admin_role_grants (
    target_user_id, granted_by, previous_role, reason
  ) VALUES (
    p_target_user_id, caller_id, previous_role, normalized_reason
  ) RETURNING id INTO grant_id;
  RETURN jsonb_build_object(
    'id', p_target_user_id,
    'role', 'admin',
    'managed_region', 'Toàn Quốc',
    'grantId', grant_id,
    'alreadyAdmin', FALSE
  );
END;
$$;
REVOKE ALL ON FUNCTION public.provision_admin_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_admin_role(UUID, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
