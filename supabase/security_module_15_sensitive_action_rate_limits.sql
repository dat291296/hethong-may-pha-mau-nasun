-- Security module 15: server-side limits for sensitive administrative actions.
-- Business records are not modified by this migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_name TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_id, action_name, window_started_at)
);

ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.security_rate_limits FROM anon;
REVOKE ALL ON TABLE public.security_rate_limits FROM authenticated;

CREATE OR REPLACE FUNCTION public.consume_security_rate_limit(
  p_action_name TEXT,
  p_max_attempts INTEGER,
  p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  normalized_action TEXT := LOWER(BTRIM(COALESCE(p_action_name, '')));
  bucket_started_at TIMESTAMPTZ;
  current_count INTEGER;
  retry_after_seconds INTEGER;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF normalized_action NOT IN ('update_user_access', 'set_user_account_active') THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_ACTION';
  END IF;
  IF p_max_attempts < 1 OR p_max_attempts > 100 OR p_window_seconds < 60 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_CONFIGURATION';
  END IF;

  bucket_started_at := TO_TIMESTAMP(
    FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.security_rate_limits (
    actor_id, action_name, window_started_at, request_count, updated_at
  ) VALUES (
    caller_id, normalized_action, bucket_started_at, 1, NOW()
  )
  ON CONFLICT (actor_id, action_name, window_started_at)
  DO UPDATE SET
    request_count = public.security_rate_limits.request_count + 1,
    updated_at = NOW()
  RETURNING request_count INTO current_count;

  retry_after_seconds := GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (bucket_started_at + make_interval(secs => p_window_seconds) - clock_timestamp())))::INTEGER
  );

  RETURN jsonb_build_object(
    'allowed', current_count <= p_max_attempts,
    'remaining', GREATEST(0, p_max_attempts - current_count),
    'retry_after_seconds', retry_after_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_security_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_security_rate_limit(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.consume_security_rate_limit(TEXT, INTEGER, INTEGER) FROM authenticated;

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
  caller_role TEXT := public.get_my_role();
  normalized_role TEXT := LOWER(BTRIM(COALESCE(target_role, '')));
  normalized_region TEXT := BTRIM(COALESCE(target_region, ''));
  limit_state JSONB;
  updated_profile public.profiles%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF caller_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF target_user_id IS NULL THEN RAISE EXCEPTION 'TARGET_USER_REQUIRED'; END IF;
  IF target_user_id = caller_id THEN RAISE EXCEPTION 'CANNOT_CHANGE_OWN_ACCESS'; END IF;
  IF normalized_role NOT IN ('admin', 'qc', 'viewer') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;

  IF normalized_role = 'admin' THEN
    normalized_region := 'Toàn Quốc';
  ELSIF normalized_region NOT IN ('Miền Bắc', 'Miền Trung', 'Miền Nam') THEN
    RAISE EXCEPTION 'INVALID_REGION';
  END IF;

  limit_state := public.consume_security_rate_limit('update_user_access', 10, 600);
  IF NOT COALESCE((limit_state->>'allowed')::BOOLEAN, FALSE) THEN
    RETURN jsonb_build_object(
      'error', 'RATE_LIMIT_EXCEEDED',
      'retry_after_seconds', (limit_state->>'retry_after_seconds')::INTEGER
    );
  END IF;

  UPDATE public.profiles
  SET role = normalized_role,
      managed_region = normalized_region,
      mfa_required = normalized_role IN ('admin', 'qc'),
      updated_at = NOW()
  WHERE id = target_user_id
  RETURNING * INTO updated_profile;

  IF updated_profile.id IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  RETURN jsonb_build_object(
    'id', updated_profile.id,
    'role', updated_profile.role,
    'managed_region', updated_profile.managed_region,
    'mfa_required', updated_profile.mfa_required
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_account_active(target_user_id UUID, target_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_role TEXT := public.get_my_role();
  limit_state JSONB;
  updated_profile public.profiles%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF caller_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF target_user_id IS NULL THEN RAISE EXCEPTION 'TARGET_USER_REQUIRED'; END IF;
  IF target_user_id = caller_id AND target_active = FALSE THEN RAISE EXCEPTION 'CANNOT_DEACTIVATE_SELF'; END IF;

  limit_state := public.consume_security_rate_limit('set_user_account_active', 10, 600);
  IF NOT COALESCE((limit_state->>'allowed')::BOOLEAN, FALSE) THEN
    RETURN jsonb_build_object(
      'error', 'RATE_LIMIT_EXCEEDED',
      'retry_after_seconds', (limit_state->>'retry_after_seconds')::INTEGER
    );
  END IF;

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

REVOKE ALL ON FUNCTION public.update_user_access(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_user_access(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_user_access(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.set_user_account_active(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_account_active(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_user_account_active(UUID, BOOLEAN) TO authenticated;

COMMIT;
