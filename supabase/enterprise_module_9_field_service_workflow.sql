-- ENT-9: additive field-service workflow for repair tickets.
-- Existing repair, distributor and equipment records are preserved.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('nasun-enterprise-migrations', 0));

DO $$
BEGIN
  IF to_regclass('public.app_schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'ENT_9_REQUIRES_ENT_0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_schema_migrations WHERE migration_code = 'ENT-3') THEN
    RAISE EXCEPTION 'ENT_9_REQUIRES_ENT_3';
  END IF;
  IF to_regclass('public.repair_tickets') IS NULL THEN
    RAISE EXCEPTION 'ENT_9_REQUIRES_REPAIR_TICKETS';
  END IF;
END;
$$;

ALTER TABLE public.repair_tickets
  ADD COLUMN IF NOT EXISTS asset_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS field_visit_status TEXT NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS service_checklist JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS materials_used JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS before_photos JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS after_photos JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS npp_confirmation JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE public.repair_tickets DROP CONSTRAINT IF EXISTS repair_tickets_processing_status_check;
ALTER TABLE public.repair_tickets ADD CONSTRAINT repair_tickets_processing_status_check
  CHECK (processing_status IN ('Chưa xử lý', 'Đang xử lý', 'Đã xử lý')) NOT VALID;
ALTER TABLE public.repair_tickets VALIDATE CONSTRAINT repair_tickets_processing_status_check;

ALTER TABLE public.repair_tickets DROP CONSTRAINT IF EXISTS repair_tickets_field_visit_status_check;
ALTER TABLE public.repair_tickets ADD CONSTRAINT repair_tickets_field_visit_status_check
  CHECK (field_visit_status IN ('scheduled', 'on_site', 'completed', 'customer_confirmed')) NOT VALID;
ALTER TABLE public.repair_tickets VALIDATE CONSTRAINT repair_tickets_field_visit_status_check;

ALTER TABLE public.repair_tickets DROP CONSTRAINT IF EXISTS repair_tickets_service_json_check;
ALTER TABLE public.repair_tickets ADD CONSTRAINT repair_tickets_service_json_check CHECK (
  jsonb_typeof(service_checklist) = 'object'
  AND jsonb_typeof(materials_used) = 'array'
  AND jsonb_typeof(before_photos) = 'array'
  AND jsonb_typeof(after_photos) = 'array'
  AND jsonb_typeof(npp_confirmation) = 'object'
) NOT VALID;
ALTER TABLE public.repair_tickets VALIDATE CONSTRAINT repair_tickets_service_json_check;

CREATE INDEX IF NOT EXISTS idx_repairs_field_sla
  ON public.repair_tickets (field_visit_status, sla_due_at);
CREATE INDEX IF NOT EXISTS idx_repairs_asset_code
  ON public.repair_tickets (asset_code)
  WHERE NULLIF(BTRIM(asset_code), '') IS NOT NULL;

INSERT INTO public.app_schema_migrations (
  migration_code, checksum, description, applied_by, execution_context
) VALUES (
  'ENT-9',
  encode(digest('ENT-9:v1:field-service-workflow', 'sha256'), 'hex'),
  'Additive QR-linked repair workflow with checklist, evidence, materials, customer confirmation and SLA',
  auth.uid(),
  'supabase-sql-editor'
)
ON CONFLICT (migration_code) DO NOTHING;

COMMIT;
