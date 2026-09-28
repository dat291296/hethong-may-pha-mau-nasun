-- ENT-1: server-side administrator provisioning without email allowlists.
-- Existing profiles and all business records are preserved.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('nasun-enterprise-migrations', 0));

DO $$
BEGIN
  IF to_regclass('public.app_schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'ENT_1_REQUIRES_ENT_0';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'ENT_1_REQUIRES_PROFILES';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE role = 'admin' AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'ENT_1_REQUIRES_EXISTING_ACTIVE_ADMIN';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.admin_role_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_role TEXT NOT NULL,
  granted_role TEXT NOT NULL DEFAULT 'admin' CHECK (granted_role = 'admin'),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 500),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_role_grants_target
  ON public.admin_role_grants (target_user_id, granted_at DESC);

ALTER TABLE public.admin_role_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_role_grants FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.admin_role_grants FROM authenticated;
GRANT SELECT ON TABLE public.admin_role_grants TO authenticated;

DROP POLICY IF EXISTS admin_role_grants_admin_read ON public.admin_role_grants;
CREATE POLICY admin_role_grants_admin_read
  ON public.admin_role_grants
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, managed_region)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email, ''),
    'viewer',
    'Miền Bắc'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_role TEXT;
  active_admin_count BIGINT;
BEGIN
  IF OLD.role IS NOT DISTINCT FROM NEW.role THEN RETURN NEW; END IF;
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = caller_id AND is_active = TRUE;

  IF caller_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF OLD.id = caller_id AND OLD.role = 'admin' AND NEW.role <> 'admin' THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_SELF';
  END IF;

  IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
    SELECT COUNT(*) INTO active_admin_count
    FROM public.profiles
    WHERE role = 'admin' AND is_active = TRUE;
    IF active_admin_count <= 1 THEN RAISE EXCEPTION 'CANNOT_REMOVE_LAST_ADMIN'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_role_update ON public.profiles;
CREATE TRIGGER trg_check_role_update
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_role_update();

CREATE OR REPLACE FUNCTION public.provision_admin_role(
  p_target_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_role TEXT;
  normalized_reason TEXT := BTRIM(COALESCE(p_reason, ''));
  target_profile public.profiles%ROWTYPE;
  previous_role TEXT;
  grant_id UUID;
BEGIN
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

-- Retain the old signature temporarily so stale clients fail closed with a clear error.
CREATE OR REPLACE FUNCTION public.bootstrap_admin_role()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'ADMIN_BOOTSTRAP_DISABLED';
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_admin_role() FROM PUBLIC, anon, authenticated;

INSERT INTO public.app_schema_migrations (
  migration_code, checksum, description, applied_by, execution_context
) VALUES (
  'ENT-1',
  encode(digest('ENT-1:v1:server-admin-provisioning', 'sha256'), 'hex'),
  'Server-side administrator provisioning without email allowlists',
  auth.uid(),
  'supabase-sql-editor'
)
ON CONFLICT (migration_code) DO NOTHING;

COMMIT;
