-- Security module 1: prevent client-controlled admin privilege escalation.
-- Apply this migration to existing Supabase projects.

BEGIN;

DROP FUNCTION IF EXISTS public.bootstrap_admin_role(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.bootstrap_admin_role()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  current_user_email TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT email
  INTO current_user_email
  FROM auth.users
  WHERE id = current_user_id;

  IF LOWER(COALESCE(current_user_email, '')) <> 'dat291219962.hust@gmail.com' THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN_BOOTSTRAP';
  END IF;

  INSERT INTO public.profiles (id, full_name, role, managed_region)
  VALUES (current_user_id, 'Admin Nasun', 'admin', 'Toàn Quốc')
  ON CONFLICT (id) DO UPDATE
  SET role = 'admin', managed_region = 'Toàn Quốc', updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_admin_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin_role() TO authenticated;

COMMIT;
