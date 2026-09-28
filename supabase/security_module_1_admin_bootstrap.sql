-- Compatibility migration: permanently disable the legacy email bootstrap.
-- Use enterprise_module_1_server_admin_provisioning.sql for administrator grants.

BEGIN;

DROP FUNCTION IF EXISTS public.bootstrap_admin_role(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.bootstrap_admin_role()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'ADMIN_BOOTSTRAP_DISABLED';
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_admin_role() FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_admin_role() FROM authenticated;

COMMIT;
