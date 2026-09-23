-- Enable persistent audit-log corrections from the Cấp phát / Thu hồi screen.
-- Existing audit data is preserved. Only users with the admin role may edit/delete.

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_update_admin" ON public.audit_logs;
CREATE POLICY "audit_update_admin"
  ON public.audit_logs
  FOR UPDATE
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "audit_delete_admin" ON public.audit_logs;
CREATE POLICY "audit_delete_admin"
  ON public.audit_logs
  FOR DELETE
  USING (public.get_my_role() = 'admin');
