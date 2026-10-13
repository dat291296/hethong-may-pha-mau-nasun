-- Preserve all existing rows and allow new audit entries only.
BEGIN;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated;
DROP POLICY IF EXISTS audit_update_admin ON public.audit_logs;
DROP POLICY IF EXISTS audit_delete_admin ON public.audit_logs;
CREATE OR REPLACE FUNCTION public.reject_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_IMMUTABLE' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.reject_audit_log_mutation();
DROP TRIGGER IF EXISTS audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_log_mutation();
COMMIT;
