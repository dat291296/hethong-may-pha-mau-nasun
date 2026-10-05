-- Additive migration: existing distributors, equipment and business records are preserved.
BEGIN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT ''
  CHECK (contact_phone = '' OR contact_phone ~ '^\+?[0-9 ()-]{7,25}$');

CREATE TABLE IF NOT EXISTS public.technical_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  category text NOT NULL CHECK (category IN ('Tài liệu', 'Bản vẽ')),
  machine_model text NOT NULL DEFAULT '' CHECK (length(machine_model) <= 120),
  url text NOT NULL CHECK (length(url) <= 2048 AND url ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}(:[0-9]+)?([/?#]|$)' AND url !~ '^https://(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)'),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.technical_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.technical_documents FROM anon;
GRANT SELECT, INSERT, DELETE ON public.technical_documents TO authenticated;
DROP POLICY IF EXISTS technical_documents_read ON public.technical_documents;
CREATE POLICY technical_documents_read ON public.technical_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active));
DROP POLICY IF EXISTS technical_documents_insert ON public.technical_documents;
CREATE POLICY technical_documents_insert ON public.technical_documents FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role = 'admin') AND public.has_privileged_aal());
DROP POLICY IF EXISTS technical_documents_delete ON public.technical_documents;
CREATE POLICY technical_documents_delete ON public.technical_documents FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role = 'admin') AND public.has_privileged_aal());

CREATE OR REPLACE FUNCTION public.get_technical_support_contacts()
RETURNS TABLE(id uuid, full_name text, role text, managed_region text, email text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.full_name, p.role, p.managed_region, u.email::text, p.contact_phone
  FROM public.profiles p JOIN auth.users u ON u.id = p.id
  JOIN public.profiles caller ON caller.id = auth.uid() AND caller.is_active
  WHERE p.is_active AND u.email_confirmed_at IS NOT NULL
    AND (p.role IN ('admin','manager') OR (p.role = 'technician' AND (p.managed_region = caller.managed_region OR p.managed_region = 'Toàn Quốc' OR caller.managed_region = 'Toàn Quốc')))
  ORDER BY CASE WHEN p.role = 'technician' THEN 0 ELSE 1 END, p.full_name, p.id LIMIT 100;
$$;
CREATE OR REPLACE FUNCTION public.get_my_contact_phone()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contact_phone FROM public.profiles WHERE id = auth.uid() AND is_active;
$$;
CREATE OR REPLACE FUNCTION public.update_my_contact_phone(contact_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE' USING ERRCODE = '42501';
  END IF;
  IF contact_phone IS NULL OR (btrim(contact_phone) <> '' AND btrim(contact_phone) !~ '^\+?[0-9 ()-]{7,25}$') THEN
    RAISE EXCEPTION 'INVALID_CONTACT_PHONE' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles SET contact_phone = btrim(update_my_contact_phone.contact_phone), updated_at = now() WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.get_technical_support_contacts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_contact_phone() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_contact_phone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_technical_support_contacts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_contact_phone() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_contact_phone(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_technical_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item public.technical_documents;
BEGIN
  IF TG_OP = 'DELETE' THEN item := OLD; ELSE item := NEW; END IF;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    INSERT INTO public.audit_logs (id, type, user_id, target_id, notes)
    VALUES (gen_random_uuid()::text, 'TECHNICAL_DOCUMENT_' || TG_OP, auth.uid(), item.id::text, item.title);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_technical_document() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS technical_document_audit ON public.technical_documents;
CREATE TRIGGER technical_document_audit AFTER INSERT OR DELETE ON public.technical_documents FOR EACH ROW EXECUTE FUNCTION public.audit_technical_document();
NOTIFY pgrst, 'reload schema';
COMMIT;
