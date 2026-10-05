-- Run after technical_resources_migration.sql. Existing document links remain usable.
BEGIN;
-- Disable the removed account/support endpoints without deleting profile data.
REVOKE ALL ON FUNCTION public.get_technical_support_contacts() FROM authenticated;
REVOKE ALL ON FUNCTION public.get_my_contact_phone() FROM authenticated;
REVOKE ALL ON FUNCTION public.update_my_contact_phone(text) FROM authenticated;
ALTER TABLE public.technical_documents ALTER COLUMN url DROP NOT NULL;
ALTER TABLE public.technical_documents ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.technical_documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.technical_documents ADD COLUMN IF NOT EXISTS file_size bigint;
ALTER TABLE public.technical_documents ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE public.technical_documents DROP CONSTRAINT IF EXISTS technical_document_source;
ALTER TABLE public.technical_documents ADD CONSTRAINT technical_document_source CHECK (
  (url IS NOT NULL AND storage_path IS NULL)
  OR (url IS NULL AND storage_path IS NOT NULL
    AND storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|webp|gif|bmp|tif|tiff)$'
    AND split_part(storage_path, '/', 1) = created_by::text
    AND file_name IS NOT NULL AND length(file_name) BETWEEN 1 AND 255
    AND file_size IS NOT NULL AND file_size BETWEEN 1 AND 20971520
    AND mime_type IS NOT NULL AND mime_type IN ('application/pdf','image/png','image/jpeg','image/webp','image/gif','image/bmp','image/tiff'))
);
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('technical-documents','technical-documents',false,20971520,ARRAY['application/pdf','image/png','image/jpeg','image/webp','image/gif','image/bmp','image/tiff'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS technical_files_read ON storage.objects;
CREATE POLICY technical_files_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'technical-documents'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active)
  AND (EXISTS (SELECT 1 FROM public.technical_documents d WHERE d.storage_path = name)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role = 'admin'))
);
DROP POLICY IF EXISTS technical_files_insert ON storage.objects;
CREATE POLICY technical_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'technical-documents'
  AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|webp|gif|bmp|tif|tiff)$'
  AND split_part(name,'/',1) = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role = 'admin')
  AND public.has_privileged_aal()
);
DROP POLICY IF EXISTS technical_files_delete ON storage.objects;
CREATE POLICY technical_files_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'technical-documents'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role = 'admin')
  AND public.has_privileged_aal()
);
NOTIFY pgrst, 'reload schema';
COMMIT;
