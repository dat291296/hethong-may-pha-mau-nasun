-- Install only on the approved nasun-staging project after a schema-only clone.
BEGIN;

CREATE OR REPLACE FUNCTION public.initialize_staging_test_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  fixture_metadata JSONB;
  fixture_email TEXT;
BEGIN
  SELECT raw_app_meta_data, email INTO fixture_metadata, fixture_email FROM auth.users WHERE id = NEW.id;
  IF fixture_metadata->>'nasun_rls_fixture' = 'true'
     AND fixture_email LIKE 'nasun-rls-%@example.invalid'
     AND fixture_metadata->>'fixture_role' IN ('admin', 'manager', 'technician', 'qc', 'viewer') THEN
    NEW.role := fixture_metadata->>'fixture_role';
    NEW.managed_region := fixture_metadata->>'fixture_region';
    NEW.is_active := TRUE;
    NEW.mfa_required := FALSE;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.initialize_staging_test_profile() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER staging_test_profile BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.initialize_staging_test_profile();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.distributors (id, name, phone, brand, region, status) VALUES
('STAGING-NORTH', 'Synthetic staging north', '', 'Nasun', 'Miền Bắc', 'Đang hợp tác'),
('STAGING-CENTRAL', 'Synthetic staging central', '', 'Nasun', 'Miền Trung', 'Đang hợp tác'),
('STAGING-SOUTH', 'Synthetic staging south', '', 'Nasun', 'Miền Nam', 'Đang hợp tác');
COMMIT;
