BEGIN;
ALTER TABLE public.technical_documents DROP CONSTRAINT IF EXISTS technical_document_source;
ALTER TABLE public.technical_documents ADD CONSTRAINT technical_document_source CHECK (
  (url IS NOT NULL AND storage_path IS NULL)
  OR (url IS NULL AND storage_path IS NOT NULL
    AND storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(docx|xlsx|pptx|csv|txt|pdf|png|jpg|jpeg|webp|gif|bmp|tif|tiff)$'
    AND split_part(storage_path, '/', 1) = created_by::text
    AND file_name IS NOT NULL AND length(file_name) BETWEEN 1 AND 255
    AND file_size IS NOT NULL AND file_size BETWEEN 1 AND 20971520
    AND mime_type IS NOT NULL AND mime_type IN ('application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/csv','text/plain','application/pdf','image/png','image/jpeg','image/webp','image/gif','image/bmp','image/tiff'))
);
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('technical-documents','technical-documents',false,20971520,ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/csv','text/plain','application/pdf','image/png','image/jpeg','image/webp','image/gif','image/bmp','image/tiff'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS technical_files_read ON storage.objects;
CREATE POLICY technical_files_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'technical-documents'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active)
  AND (EXISTS (SELECT 1 FROM public.technical_documents d WHERE d.storage_path = name)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','technician')))
);
DROP POLICY IF EXISTS technical_files_insert ON storage.objects;
CREATE POLICY technical_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'technical-documents'
  AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(docx|xlsx|pptx|csv|txt|pdf|png|jpg|jpeg|webp|gif|bmp|tif|tiff)$'
  AND split_part(name,'/',1) = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','technician'))
  
);
DROP POLICY IF EXISTS technical_files_delete ON storage.objects;
CREATE POLICY technical_files_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'technical-documents'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','technician'))
  
);
ALTER POLICY technical_documents_insert ON public.technical_documents WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','technician')));
ALTER POLICY technical_documents_delete ON public.technical_documents USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','technician')));
GRANT UPDATE (title, category, machine_model) ON public.technical_documents TO authenticated;
DROP POLICY IF EXISTS handbook_document_update ON public.technical_documents;
CREATE POLICY handbook_document_update ON public.technical_documents FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','technician'))) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','technician')));
NOTIFY pgrst, 'reload schema';
COMMIT;
