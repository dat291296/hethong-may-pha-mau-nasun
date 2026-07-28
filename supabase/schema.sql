-- ============================================================
-- Paint Tinting & Stock Manager v2.0
-- Supabase PostgreSQL Schema (Fixed Order)
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Sequences (create first) ─────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS npp_seq    START 100;
CREATE SEQUENCE IF NOT EXISTS disp_seq   START 100;
CREATE SEQUENCE IF NOT EXISTS mix_seq    START 100;
CREATE SEQUENCE IF NOT EXISTS pc_seq     START 100;
CREATE SEQUENCE IF NOT EXISTS prn_seq    START 100;
CREATE SEQUENCE IF NOT EXISTS repair_seq START 100;
CREATE SEQUENCE IF NOT EXISTS audit_seq  START 100;

-- ── 1. Profiles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'viewer'
               CHECK (role IN ('admin', 'qc', 'viewer')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. Distributors (NPP) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distributors (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  phone                TEXT NOT NULL DEFAULT '',
  contact_person       TEXT DEFAULT '',
  region               TEXT NOT NULL DEFAULT 'Miền Bắc',
  province             TEXT DEFAULT '',
  address              TEXT DEFAULT '',
  location_coordinates TEXT DEFAULT '',
  google_maps_url      TEXT DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'Đang hợp tác'
                         CHECK (status IN ('Đang hợp tác', 'Đã ngưng hợp tác')),
  photos               JSONB DEFAULT '[]',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dist_region ON distributors (region);
CREATE INDEX IF NOT EXISTS idx_dist_status ON distributors (status);

-- ── 3. System Sets (must be before device tables) ────────────────────────────
CREATE TABLE IF NOT EXISTS system_sets (
  set_code              TEXT PRIMARY KEY,
  npp_id                TEXT REFERENCES distributors(id) ON DELETE SET NULL,
  npp_name              TEXT NOT NULL DEFAULT '',
  region                TEXT DEFAULT '',
  province              TEXT DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'TRONG_KHO'
                          CHECK (status IN ('DA_LAP_DAT','TRONG_KHO','DA_THU_HOI','BAO_THUONG_BAO_TRI')),
  dispenser_id          TEXT,
  dispenser_model       TEXT DEFAULT '',
  dispenser_serial      TEXT DEFAULT '',
  mixer_id              TEXT,
  mixer_model           TEXT DEFAULT '',
  mixer_serial          TEXT DEFAULT '',
  computer_id           TEXT,
  computer_type         TEXT DEFAULT '',
  computer_serial       TEXT DEFAULT '',
  printer_id            TEXT,
  printer_serial        TEXT DEFAULT '',
  tinting_software      TEXT DEFAULT '',
  software_version      TEXT DEFAULT '',
  agent_status          TEXT DEFAULT 'Offline'
                          CHECK (agent_status IN ('Online','Offline','Error')),
  install_date          DATE,
  last_maintenance_date DATE,
  next_maintenance_due  DATE,
  technician            TEXT DEFAULT '',
  stabilizer            TEXT DEFAULT '',
  notes                 TEXT DEFAULT '',
  installation_photos   JSONB DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sets_npp_id ON system_sets (npp_id);
CREATE INDEX IF NOT EXISTS idx_sets_status ON system_sets (status);

-- ── 4. Dispensers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispensers (
  id          TEXT PRIMARY KEY,
  model       TEXT NOT NULL,
  serial      TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'Đang chạy tốt'
                CHECK (status IN ('Mới 100%','Đang chạy tốt','Cần bảo trì','Hỏng đầu phun','Hỏng nặng')),
  is_assigned BOOLEAN NOT NULL DEFAULT FALSE,
  set_code    TEXT REFERENCES system_sets(set_code) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Mixers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mixers (
  id          TEXT PRIMARY KEY,
  model       TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'Lắc xoay khép kín'
                CHECK (type IN ('Lắc xoay khép kín','Lắc rung đứng')),
  serial      TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'Đang chạy tốt'
                CHECK (status IN ('Mới 100%','Đang chạy tốt','Cần bảo trì','Hỏng motor','Hỏng nặng')),
  is_assigned BOOLEAN NOT NULL DEFAULT FALSE,
  set_code    TEXT REFERENCES system_sets(set_code) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Computers ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS computers (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL DEFAULT 'Case'
                CHECK (type IN ('AIO','Case')),
  os          TEXT NOT NULL DEFAULT 'Windows 10 LTSC',
  specs       TEXT DEFAULT '',
  serial      TEXT NOT NULL UNIQUE,
  network     TEXT DEFAULT 'Có mạng LAN'
                CHECK (network IN ('Có mạng LAN','Có mạng Wifi','Không có mạng')),
  stabilizer  JSONB DEFAULT '{"hasStabilizer":false,"brand":null,"isSelfBought":false}',
  is_assigned BOOLEAN NOT NULL DEFAULT FALSE,
  set_code    TEXT REFERENCES system_sets(set_code) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. Printers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS printers (
  id          TEXT PRIMARY KEY,
  model       TEXT NOT NULL DEFAULT 'QL700',
  serial      TEXT NOT NULL UNIQUE,
  connection  TEXT DEFAULT 'USB'
                CHECK (connection IN ('USB','LAN','Bluetooth')),
  status      TEXT NOT NULL DEFAULT 'Đang chạy tốt'
                CHECK (status IN ('Mới 100%','Đang chạy tốt','Cần bảo trì','Hỏng đầu in','Hỏng nặng')),
  is_assigned BOOLEAN NOT NULL DEFAULT FALSE,
  set_code    TEXT REFERENCES system_sets(set_code) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. Repair Tickets ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repair_tickets (
  id                     TEXT PRIMARY KEY,
  ticket_code            TEXT UNIQUE NOT NULL,
  date                   DATE NOT NULL DEFAULT CURRENT_DATE,
  technician             TEXT NOT NULL,
  npp_id                 TEXT REFERENCES distributors(id) ON DELETE SET NULL,
  npp_name               TEXT NOT NULL DEFAULT '',
  product_category       TEXT NOT NULL
                           CHECK (product_category IN ('Máy chiết','Máy lắc','Máy tính','Máy in','Phụ kiện','Linh kiện')),
  machine_model          TEXT NOT NULL,
  serial_number          TEXT NOT NULL,
  error_description      TEXT DEFAULT '',
  error_category         TEXT DEFAULT '',
  action_direction       TEXT DEFAULT 'Sửa chữa'
                           CHECK (action_direction IN ('Sửa chữa','Xuất đổi')),
  replacement_condition  TEXT DEFAULT 'N/A'
                           CHECK (replacement_condition IN ('Mới','Cũ','N/A')),
  processing_status      TEXT DEFAULT 'Chưa xử lý'
                           CHECK (processing_status IN ('Chưa xử lý','Đã xử lý')),
  customer_return_status TEXT DEFAULT 'Chưa gửi trả'
                           CHECK (customer_return_status IN ('Chưa gửi trả','Đã gửi trả')),
  notes                  TEXT DEFAULT '',
  photos                 JSONB DEFAULT '[]',
  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repair_tickets (processing_status);
CREATE INDEX IF NOT EXISTS idx_repairs_date   ON repair_tickets (date DESC);

-- ── 9. Audit Logs (Append Only) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  set_code    TEXT DEFAULT '—',
  npp_id      TEXT DEFAULT '—',
  npp_name    TEXT DEFAULT '',
  serial_list TEXT DEFAULT '',
  technician  TEXT DEFAULT '',
  reason      TEXT DEFAULT '',
  notes       TEXT DEFAULT '',
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_id   TEXT DEFAULT NULL,
  severity    TEXT DEFAULT 'INFO'
                CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 10. Locked Months ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locked_months (
  month_key TEXT PRIMARY KEY,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason    TEXT DEFAULT ''
);

-- ── updated_at auto-trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','distributors','dispensers','mixers',
    'computers','printers','system_sets','repair_tickets'] LOOP
    EXECUTE FORMAT(
      'DROP TRIGGER IF EXISTS trg_updated_%1$s ON %1$s;
       CREATE TRIGGER trg_updated_%1$s
         BEFORE UPDATE ON %1$s
         FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
  END LOOP;
END $$;

-- Done! Run rls_policies.sql next.
