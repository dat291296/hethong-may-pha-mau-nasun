-- ============================================================
-- Migration: Fix CHECK constraints to match UI form values
-- Run this on Supabase SQL Editor
-- ============================================================

-- 1. Fix mixers.type: add 'Lắc rung ngang' and 'Lắc mâm xoay'
ALTER TABLE mixers DROP CONSTRAINT IF EXISTS mixers_type_check;
ALTER TABLE mixers ADD CONSTRAINT mixers_type_check
  CHECK (type IN ('Lắc xoay khép kín','Lắc rung đứng','Lắc rung ngang','Lắc mâm xoay'));

-- 2. Fix mixers.status: add 'Hỏng đầu phun' (shared option in form)
ALTER TABLE mixers DROP CONSTRAINT IF EXISTS mixers_status_check;
ALTER TABLE mixers ADD CONSTRAINT mixers_status_check
  CHECK (status IN ('Mới 100%','Đang chạy tốt','Cần bảo trì','Hỏng motor','Hỏng nặng','Hỏng đầu phun'));

-- 3. Fix printers.connection: add 'Wifi'
ALTER TABLE printers DROP CONSTRAINT IF EXISTS printers_connection_check;
ALTER TABLE printers ADD CONSTRAINT printers_connection_check
  CHECK (connection IN ('USB','LAN','Bluetooth','Wifi'));

-- 4. Fix printers.status: add 'Hỏng đầu phun' for consistency (already has 'Hỏng đầu in')
ALTER TABLE printers DROP CONSTRAINT IF EXISTS printers_status_check;
ALTER TABLE printers ADD CONSTRAINT printers_status_check
  CHECK (status IN ('Mới 100%','Đang chạy tốt','Cần bảo trì','Hỏng đầu in','Hỏng đầu phun','Hỏng nặng'));

-- 5. Add salesperson column to distributors (NPP) table
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS salesperson TEXT DEFAULT '';

-- Done! All constraints updated.
SELECT 'Migration completed successfully.' AS result;
