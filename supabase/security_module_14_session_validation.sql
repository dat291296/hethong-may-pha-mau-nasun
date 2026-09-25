-- Security module 14: authoritative session and account-state validation.
-- This migration creates a read-only function and does not modify business data.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_session_security_state()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  profile_row public.profiles%ROWTYPE;
  token_expires_at BIGINT := COALESCE(NULLIF(auth.jwt()->>'exp', '')::BIGINT, 0);
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO profile_row
  FROM public.profiles
  WHERE id = caller_id;

  RETURN jsonb_build_object(
    'user_id', caller_id,
    'profile_found', profile_row.id IS NOT NULL,
    'is_active', COALESCE(profile_row.is_active, FALSE),
    'role', CASE WHEN profile_row.is_active THEN profile_row.role ELSE NULL END,
    'managed_region', CASE WHEN profile_row.is_active THEN profile_row.managed_region ELSE NULL END,
    'mfa_required', COALESCE(profile_row.mfa_required, FALSE),
    'aal', COALESCE(auth.jwt()->>'aal', ''),
    'token_expires_at', token_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_security_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_security_state() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_session_security_state() TO authenticated;

COMMIT;
