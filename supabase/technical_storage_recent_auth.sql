-- Align technical Storage writes with recent authentication when mandatory MFA is disabled.
-- Apply after sensitive_action_reauthentication.sql and technical_document_uploads_migration.sql.
-- Existing files and business rows are preserved.
BEGIN;
DROP POLICY IF EXISTS technical_files_insert ON storage.objects;
CREATE POLICY technical_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'technical-documents'
  AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|webp|gif|bmp|tif|tiff)$'
  AND split_part(name,'/',1) = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role = 'admin')
  AND public.require_recent_authentication()
);
DROP POLICY IF EXISTS technical_files_delete ON storage.objects;
CREATE POLICY technical_files_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'technical-documents'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role = 'admin')
  AND public.require_recent_authentication()
);
NOTIFY pgrst, 'reload schema';
COMMIT;
