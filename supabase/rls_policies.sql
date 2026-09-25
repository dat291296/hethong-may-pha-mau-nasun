-- ============================================================
-- Row Level Security (RLS) Policies
-- Paint Tinting & Stock Manager v2.0
-- Run AFTER schema.sql in Supabase SQL Editor
-- ============================================================

-- ── Enable RLS on all tables ───────────────────────────────────────────────────
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributors   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispensers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mixers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE computers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE printers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_sets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE locked_months  ENABLE ROW LEVEL SECURITY;

-- ── Helper: get current user's role ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles
  WHERE id = auth.uid()
    AND is_active = TRUE
    AND (
      role NOT IN ('admin', 'qc')
      OR mfa_required = FALSE
      OR COALESCE(auth.jwt()->>'aal', '') = 'aal2'
    );
$$;

CREATE OR REPLACE FUNCTION public.get_my_region()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT managed_region FROM public.profiles WHERE id = auth.uid()), '');
$$;

CREATE OR REPLACE FUNCTION public.can_access_region(target_region TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.get_my_role() = 'admin' THEN TRUE
    WHEN public.get_my_region() = 'Toàn Quốc' THEN TRUE
    WHEN NULLIF(BTRIM(target_region), '') IS NULL THEN FALSE
    ELSE public.get_my_region() = target_region
  END;
$$;

-- ── Helper: check if a target date belongs to a locked month ────────────────
CREATE OR REPLACE FUNCTION public.is_month_locked(target_date DATE)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m_key TEXT;
BEGIN
  IF target_date IS NULL THEN
    RETURN FALSE;
  END IF;
  m_key := to_char(target_date, 'YYYY-MM');
  RETURN EXISTS (SELECT 1 FROM public.locked_months WHERE month_key = m_key);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- PROFILES
-- ══════════════════════════════════════════════════════════════
-- Users can read their own profile. Security fields are admin-managed only.
CREATE POLICY "profile_select_own" ON profiles FOR SELECT USING (id = auth.uid());
-- Admin can view all profiles
CREATE POLICY "profile_select_admin" ON profiles FOR SELECT USING (get_my_role() = 'admin');
-- Profile access fields are updated only through allowlisted SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "profile_update_own" ON profiles;
DROP POLICY IF EXISTS "profile_update_admin" ON profiles;

-- ══════════════════════════════════════════════════════════════
-- DISTRIBUTORS (Nhà Phân Phối / NPP)
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "npp_select_regional" ON distributors FOR SELECT USING (can_access_region(region));
CREATE POLICY "npp_insert_regional_staff" ON distributors FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'qc') AND can_access_region(region));
CREATE POLICY "npp_update_regional_staff" ON distributors FOR UPDATE USING (get_my_role() IN ('admin', 'qc') AND can_access_region(region)) WITH CHECK (get_my_role() IN ('admin', 'qc') AND can_access_region(region));
-- Delete: ADMIN ONLY
CREATE POLICY "npp_delete_admin" ON distributors FOR DELETE USING (get_my_role() = 'admin');

-- ══════════════════════════════════════════════════════════════
-- DISPENSERS / MIXERS / COMPUTERS / PRINTERS (Thiết Bị)
-- ══════════════════════════════════════════════════════════════
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['dispensers', 'mixers', 'computers', 'printers'] LOOP
    EXECUTE FORMAT('CREATE POLICY "asset_select_regional_%1$s" ON %1$s FOR SELECT USING (get_my_role() = ''admin'' OR (get_my_role() = ''qc'' AND set_code IS NULL) OR EXISTS (SELECT 1 FROM system_sets s WHERE s.set_code = %1$s.set_code AND can_access_region(s.region)))', t);
    EXECUTE FORMAT('CREATE POLICY "asset_insert_regional_%1$s" ON %1$s FOR INSERT WITH CHECK (get_my_role() IN (''admin'', ''qc'') AND (set_code IS NULL OR EXISTS (SELECT 1 FROM system_sets s WHERE s.set_code = %1$s.set_code AND can_access_region(s.region))))', t);
    EXECUTE FORMAT('CREATE POLICY "asset_update_regional_%1$s" ON %1$s FOR UPDATE USING (get_my_role() IN (''admin'', ''qc'') AND (set_code IS NULL OR EXISTS (SELECT 1 FROM system_sets s WHERE s.set_code = %1$s.set_code AND can_access_region(s.region)))) WITH CHECK (get_my_role() IN (''admin'', ''qc'') AND (set_code IS NULL OR EXISTS (SELECT 1 FROM system_sets s WHERE s.set_code = %1$s.set_code AND can_access_region(s.region))))', t);
    EXECUTE FORMAT('CREATE POLICY "asset_delete_%1$s" ON %1$s FOR DELETE USING (get_my_role() = ''admin'')', t);
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════
-- SYSTEM SETS (Bộ Máy Lắp Đặt)
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "sets_select_regional" ON system_sets FOR SELECT USING (can_access_region(region) OR (get_my_role() = 'qc' AND NULLIF(BTRIM(region), '') IS NULL));
CREATE POLICY "sets_insert_regional_staff" ON system_sets FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'qc') AND NOT is_month_locked(install_date) AND (can_access_region(region) OR (get_my_role() = 'qc' AND NULLIF(BTRIM(region), '') IS NULL));
CREATE POLICY "sets_update_regional_staff" ON system_sets FOR UPDATE USING (get_my_role() IN ('admin', 'qc') AND NOT is_month_locked(install_date) AND (can_access_region(region) OR (get_my_role() = 'qc' AND NULLIF(BTRIM(region), '') IS NULL)) WITH CHECK (get_my_role() IN ('admin', 'qc') AND NOT is_month_locked(install_date) AND (can_access_region(region) OR (get_my_role() = 'qc' AND NULLIF(BTRIM(region), '') IS NULL));
CREATE POLICY "sets_delete_admin" ON system_sets FOR DELETE USING (get_my_role() = 'admin' AND NOT is_month_locked(install_date));

-- ══════════════════════════════════════════════════════════════
-- REPAIR TICKETS (Phiếu Xử Lý Máy)
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "repair_select_regional" ON repair_tickets FOR SELECT USING (get_my_role() = 'admin' OR created_by = auth.uid() OR EXISTS (SELECT 1 FROM distributors d WHERE d.id = repair_tickets.npp_id AND can_access_region(d.region)));
CREATE POLICY "repair_insert_regional_staff" ON repair_tickets FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'qc') AND NOT is_month_locked(date) AND (npp_id IS NULL OR EXISTS (SELECT 1 FROM distributors d WHERE d.id = repair_tickets.npp_id AND can_access_region(d.region))));
CREATE POLICY "repair_update_regional_staff" ON repair_tickets FOR UPDATE USING (get_my_role() IN ('admin', 'qc') AND NOT is_month_locked(date) AND (npp_id IS NULL OR EXISTS (SELECT 1 FROM distributors d WHERE d.id = repair_tickets.npp_id AND can_access_region(d.region)))) WITH CHECK (get_my_role() IN ('admin', 'qc') AND NOT is_month_locked(date) AND (npp_id IS NULL OR EXISTS (SELECT 1 FROM distributors d WHERE d.id = repair_tickets.npp_id AND can_access_region(d.region))));
CREATE POLICY "repair_delete_admin"  ON repair_tickets FOR DELETE USING (get_my_role() = 'admin' AND NOT is_month_locked(date));

-- ══════════════════════════════════════════════════════════════
-- AUDIT LOGS (Nhật Ký – staff read, admin manages corrections)
-- ══════════════════════════════════════════════════════════════
-- QC + Admin can read, authenticated users can insert, only Admin can update/delete.
CREATE POLICY "audit_select_staff"  ON audit_logs FOR SELECT USING (get_my_role() IN ('admin', 'qc'));
-- Audit inserts are allowed only through public.create_audit_log(JSONB).
CREATE POLICY "audit_update_admin"  ON audit_logs FOR UPDATE USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "audit_delete_admin"  ON audit_logs FOR DELETE USING (get_my_role() = 'admin');

-- ══════════════════════════════════════════════════════════════
-- LOCKED MONTHS
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "lock_select_admin" ON locked_months FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "lock_insert_admin" ON locked_months FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "lock_delete_admin" ON locked_months FOR DELETE USING (get_my_role() = 'admin');

-- ══════════════════════════════════════════════════════════════
-- AGENT TABLES POLICIES (authenticated access only)
-- ══════════════════════════════════════════════════════════════

-- Enable RLS on new tables
ALTER TABLE tinting_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE formula_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_telemetry     ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_commands ENABLE ROW LEVEL SECURITY;

-- 1. Tinting Logs
CREATE POLICY "tinting_logs_select_staff" ON tinting_logs FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'qc'));
CREATE POLICY "tinting_logs_insert_staff" ON tinting_logs FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin', 'qc'));

-- 2. Formula Versions
CREATE POLICY "formula_versions_auth_read" ON formula_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "formula_versions_staff_all" ON formula_versions FOR ALL TO authenticated USING (get_my_role() IN ('admin', 'qc')) WITH CHECK (get_my_role() IN ('admin', 'qc'));

-- 3. Agent Telemetry
CREATE POLICY "agent_telemetry_staff_all" ON agent_telemetry FOR ALL TO authenticated USING (get_my_role() IN ('admin', 'qc')) WITH CHECK (get_my_role() IN ('admin', 'qc'));

-- 4. Diagnostic Commands
CREATE POLICY "diagnostic_commands_select_staff" ON diagnostic_commands FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'qc'));
CREATE POLICY "diagnostic_commands_insert_admin" ON diagnostic_commands FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "diagnostic_commands_update_admin" ON diagnostic_commands FOR UPDATE TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

