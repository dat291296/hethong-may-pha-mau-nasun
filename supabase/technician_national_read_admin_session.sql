BEGIN;

-- Reading nationwide does not broaden any write policy or regional helper.
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['distributors','system_sets','dispensers','mixers','computers','printers','repair_tickets'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS technician_national_read ON public.%I', table_name);
    EXECUTE format('CREATE POLICY technician_national_read ON public.%I FOR SELECT TO authenticated USING (public.get_my_role() = ''technician'')', table_name);
  END LOOP;
END $$;
DROP POLICY IF EXISTS npp_insert_assigned_staff ON public.distributors;
CREATE POLICY npp_insert_assigned_staff ON public.distributors FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'technician' AND public.technician_can_write_region(region));

-- Validate the existing server session without a password sign-in or token replacement.
CREATE OR REPLACE FUNCTION public.require_account_admin_session()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id UUID := auth.uid(); claims JSONB := auth.jwt();
BEGIN
  IF caller_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=caller_id AND role='admin' AND is_active=TRUE) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF COALESCE(claims->>'exp','') !~ '^[0-9]{1,12}$' THEN RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501'; END IF;
  IF (claims->>'exp')::BIGINT <= EXTRACT(EPOCH FROM NOW()) OR NOT EXISTS (
    SELECT 1 FROM auth.sessions s WHERE s.id::TEXT=claims->>'session_id' AND s.user_id=caller_id AND (s.not_after IS NULL OR s.not_after>NOW())
  ) THEN RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.account_sessions s WHERE s.session_id=claims->>'session_id' AND s.user_id=caller_id
    AND (s.revoked_at IS NOT NULL OR s.expires_at<=NOW() OR s.idle_expires_at<=NOW()
      OR EXISTS (SELECT 1 FROM public.trusted_devices d WHERE d.id=s.trusted_device_id AND (d.revoked_at IS NOT NULL OR d.trusted_until<=NOW())))) THEN
    RAISE EXCEPTION 'SESSION_REJECTED' USING ERRCODE='42501';
  END IF;
  RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION public.require_account_admin_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_account_admin_session() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_sensitive_profile_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.managed_region IS DISTINCT FROM OLD.managed_region OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NEW.id=auth.uid() THEN RAISE EXCEPTION 'CANNOT_CHANGE_OWN_ACCESS' USING ERRCODE='42501'; END IF;
    PERFORM public.require_account_admin_session();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_sensitive_profile_change() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
