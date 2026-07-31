-- ── INDEXES FOR PERFORMANCE OPTIMIZATION ─────────────────────────────────────
-- Run these queries in your Supabase SQL Editor to speed up searches & filters

-- 1. Indexing dispensers serial and set references
CREATE INDEX IF NOT EXISTS idx_dispensers_serial ON dispensers(serial);
CREATE INDEX IF NOT EXISTS idx_dispensers_set_code ON dispensers(set_code);

-- 2. Indexing mixers serial and set references
CREATE INDEX IF NOT EXISTS idx_mixers_serial ON mixers(serial);
CREATE INDEX IF NOT EXISTS idx_mixers_set_code ON mixers(set_code);

-- 3. Indexing computers serial and set references
CREATE INDEX IF NOT EXISTS idx_computers_serial ON computers(serial);
CREATE INDEX IF NOT EXISTS idx_computers_set_code ON computers(set_code);

-- 4. Indexing printers serial and set references
CREATE INDEX IF NOT EXISTS idx_printers_serial ON printers(serial);
CREATE INDEX IF NOT EXISTS idx_printers_set_code ON printers(set_code);

-- 5. Indexing system sets
CREATE INDEX IF NOT EXISTS idx_system_sets_npp_id ON system_sets(npp_id);
CREATE INDEX IF NOT EXISTS idx_system_sets_set_code ON system_sets(set_code);

-- 6. Indexing repair tickets
CREATE INDEX IF NOT EXISTS idx_repair_tickets_serial ON repair_tickets(serial_number);
CREATE INDEX IF NOT EXISTS idx_repair_tickets_npp_id ON repair_tickets(npp_id);
CREATE INDEX IF NOT EXISTS idx_repair_tickets_processing_status ON repair_tickets(processing_status);

-- 7. Indexing audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_set_code ON audit_logs(set_code);
CREATE INDEX IF NOT EXISTS idx_audit_logs_npp_id ON audit_logs(npp_id);
