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
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = auth.uid());
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
-- Users can read/update their own profile
CREATE POLICY "profile_select_own" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profile_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
-- Admin can view all profiles
CREATE POLICY "profile_select_admin" ON profiles FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "profile_update_admin" ON profiles FOR UPDATE USING (get_my_role() = 'admin');

-- ══════════════════════════════════════════════════════════════
-- DISTRIBUTORS (Nhà Phân Phối / NPP)
-- ══════════════════════════════════════════════════════════════
-- Read: ALL authenticated users
CREATE POLICY "npp_select_auth" ON distributors FOR SELECT USING (auth.role() = 'authenticated');
-- Insert/Update: admin + qc only
CREATE POLICY "npp_insert_staff" ON distributors FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'qc'));
CREATE POLICY "npp_update_staff" ON distributors FOR UPDATE USING (get_my_role() IN ('admin', 'qc'));
-- Delete: ADMIN ONLY
CREATE POLICY "npp_delete_admin" ON distributors FOR DELETE USING (get_my_role() = 'admin');

-- ══════════════════════════════════════════════════════════════
-- DISPENSERS / MIXERS / COMPUTERS / PRINTERS (Thiết Bị)
-- ══════════════════════════════════════════════════════════════
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['dispensers', 'mixers', 'computers', 'printers'] LOOP
    EXECUTE FORMAT('CREATE POLICY "asset_select_%1$s" ON %1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE FORMAT('CREATE POLICY "asset_insert_%1$s" ON %1$s FOR INSERT WITH CHECK (get_my_role() IN (''admin'', ''qc''))', t);
    EXECUTE FORMAT('CREATE POLICY "asset_update_%1$s" ON %1$s FOR UPDATE USING (get_my_role() IN (''admin'', ''qc''))', t);
    EXECUTE FORMAT('CREATE POLICY "asset_delete_%1$s" ON %1$s FOR DELETE USING (get_my_role() = ''admin'')', t);
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════
-- SYSTEM SETS (Bộ Máy Lắp Đặt)
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "sets_select_auth"  ON system_sets FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "sets_insert_staff" ON system_sets FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'qc') AND NOT is_month_locked(install_date));
CREATE POLICY "sets_update_staff" ON system_sets FOR UPDATE USING (get_my_role() IN ('admin', 'qc') AND NOT is_month_locked(install_date)) WITH CHECK (NOT is_month_locked(install_date));
CREATE POLICY "sets_delete_admin" ON system_sets FOR DELETE USING (get_my_role() = 'admin' AND NOT is_month_locked(install_date));

-- ══════════════════════════════════════════════════════════════
-- REPAIR TICKETS (Phiếu Xử Lý Máy)
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "repair_select_auth"   ON repair_tickets FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "repair_insert_staff"  ON repair_tickets FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'qc') AND NOT is_month_locked(date));
CREATE POLICY "repair_update_staff"  ON repair_tickets FOR UPDATE USING (get_my_role() IN ('admin', 'qc') AND NOT is_month_locked(date)) WITH CHECK (NOT is_month_locked(date));
CREATE POLICY "repair_delete_admin"  ON repair_tickets FOR DELETE USING (get_my_role() = 'admin' AND NOT is_month_locked(date));

-- ══════════════════════════════════════════════════════════════
-- AUDIT LOGS (Nhật Ký – APPEND ONLY!)
-- ══════════════════════════════════════════════════════════════
-- QC + Admin can read, authenticated users can insert, NOBODY can update/delete
CREATE POLICY "audit_select_staff"  ON audit_logs FOR SELECT USING (get_my_role() IN ('admin', 'qc'));
CREATE POLICY "audit_insert_auth"   ON audit_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- NO UPDATE policy (append-only enforced)
-- NO DELETE policy

-- ══════════════════════════════════════════════════════════════
-- LOCKED MONTHS
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "lock_select_admin" ON locked_months FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "lock_insert_admin" ON locked_months FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "lock_delete_admin" ON locked_months FOR DELETE USING (get_my_role() = 'admin');

-- ══════════════════════════════════════════════════════════════
-- AGENT TABLES POLICIES (Allowing public/anon access for agent client)
-- ══════════════════════════════════════════════════════════════

-- Enable RLS on new tables
ALTER TABLE tinting_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE formula_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_telemetry     ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_commands ENABLE ROW LEVEL SECURITY;

-- 1. Tinting Logs
CREATE POLICY "tinting_logs_anon_insert" ON tinting_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "tinting_logs_anon_select" ON tinting_logs FOR SELECT TO anon USING (true);
CREATE POLICY "tinting_logs_auth_all"    ON tinting_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Formula Versions
CREATE POLICY "formula_versions_anon_read" ON formula_versions FOR SELECT TO anon USING (true);
CREATE POLICY "formula_versions_auth_read" ON formula_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "formula_versions_staff_all" ON formula_versions FOR ALL TO authenticated USING (get_my_role() IN ('admin', 'qc')) WITH CHECK (get_my_role() IN ('admin', 'qc'));

-- 3. Agent Telemetry
CREATE POLICY "agent_telemetry_anon_insert" ON agent_telemetry FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "agent_telemetry_staff_all"    ON agent_telemetry FOR ALL TO authenticated USING (get_my_role() IN ('admin', 'qc')) WITH CHECK (get_my_role() IN ('admin', 'qc'));

-- 4. Diagnostic Commands
CREATE POLICY "diagnostic_commands_anon_all" ON diagnostic_commands FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "diagnostic_commands_auth_all" ON diagnostic_commands FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. System Sets updates from Agent (allow updating agent_status & updated_at)
CREATE POLICY "sets_update_agent" ON system_sets FOR UPDATE TO anon USING (true) WITH CHECK (true);

