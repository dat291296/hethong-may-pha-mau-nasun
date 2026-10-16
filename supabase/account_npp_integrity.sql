BEGIN;
ALTER TABLE public.computers ALTER COLUMN serial DROP NOT NULL;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS npp_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS distributors_npp_code_unique ON public.distributors(npp_code) WHERE npp_code IS NOT NULL;
CREATE OR REPLACE FUNCTION public.assign_distributor_code() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prefix TEXT; current_code TEXT; sequence_number BIGINT;
BEGIN
  prefix := CASE NEW.region WHEN 'Miền Bắc' THEN 'MB' WHEN 'Miền Trung' THEN 'MT' WHEN 'Miền Nam' THEN 'MN' END;
  IF prefix IS NULL THEN RAISE EXCEPTION 'INVALID_NPP_REGION' USING ERRCODE='22023'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.npp_code IS NOT DISTINCT FROM OLD.npp_code AND NEW.region IS NOT DISTINCT FROM OLD.region AND (OLD.npp_code IS NOT NULL OR OLD.id ~ '^NPP-(MB|MT|MN)-[0-9]{3,}$') THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nasun-npp-code-' || prefix, 0));
  IF TG_OP = 'UPDATE' AND NEW.region IS DISTINCT FROM OLD.region AND NEW.npp_code IS NOT DISTINCT FROM OLD.npp_code THEN NEW.npp_code := NULL; END IF;
  IF NULLIF(btrim(NEW.npp_code), '') IS NULL THEN
    SELECT COALESCE(MAX(substring(COALESCE(d.npp_code,d.id) FROM '[0-9]+$')::BIGINT),0)+1 INTO sequence_number
      FROM public.distributors d WHERE COALESCE(d.npp_code,d.id) ~ ('^NPP-' || prefix || '-[0-9]+$');
    NEW.npp_code := 'NPP-' || prefix || '-' || lpad(sequence_number::TEXT, greatest(3,length(sequence_number::TEXT)), '0');
  END IF;
  IF NEW.npp_code !~ ('^NPP-' || prefix || '-[0-9]{3,}$') OR substring(NEW.npp_code FROM '[0-9]+$')::NUMERIC <= 0 THEN
    RAISE EXCEPTION 'INVALID_NPP_CODE: mã NPP phải khớp miền và có số thứ tự ít nhất 3 chữ số' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.distributors d WHERE d.id <> NEW.id AND COALESCE(d.npp_code,d.id)=NEW.npp_code) THEN
    RAISE EXCEPTION 'NPP_CODE_EXISTS: mã NPP đã được sử dụng' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS distributor_code_assignment ON public.distributors;
CREATE TRIGGER distributor_code_assignment BEFORE INSERT OR UPDATE OF region,npp_code ON public.distributors FOR EACH ROW EXECUTE FUNCTION public.assign_distributor_code();
CREATE OR REPLACE FUNCTION public.sync_distributor_region() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.region IS DISTINCT FROM OLD.region THEN
    UPDATE public.system_sets SET region=NEW.region, province=NEW.province, updated_at=clock_timestamp() WHERE npp_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS distributor_region_sync ON public.distributors;
CREATE TRIGGER distributor_region_sync AFTER UPDATE OF region ON public.distributors FOR EACH ROW EXECUTE FUNCTION public.sync_distributor_region();
CREATE OR REPLACE FUNCTION public.admin_list_registered_accounts()
RETURNS TABLE(id UUID,full_name TEXT,role TEXT,managed_region TEXT,is_active BOOLEAN,created_at TIMESTAMPTZ,email TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT p.id,p.full_name,p.role,p.managed_region,p.is_active,p.created_at,u.email::TEXT FROM public.profiles p JOIN auth.users u ON u.id=p.id ORDER BY p.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_registered_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_registered_accounts() TO authenticated;
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['distributors','system_sets','dispensers','mixers','computers','printers'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS viewer_national_read ON public.%I', table_name);
    EXECUTE format('CREATE POLICY viewer_national_read ON public.%I FOR SELECT TO authenticated USING (public.get_my_role() = ''viewer'')',table_name);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
