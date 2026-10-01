import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/enterprise_module_9_field_service_workflow.sql', import.meta.url);
const repairHookUrl = new URL('../src/hooks/useRepairs.js', import.meta.url);
const offlineSyncUrl = new URL('../src/lib/offlineSync.js', import.meta.url);
const repairUiUrl = new URL('../src/components/DeviceRepairProcessing.jsx', import.meta.url);

test('ENT-9 migration is additive and records the field workflow schema', async () => {
  const source = await readFile(migrationUrl, 'utf8');
  assert.match(source, /ADD COLUMN IF NOT EXISTS service_checklist JSONB/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS materials_used JSONB/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS npp_confirmation JSONB/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ/);
  assert.match(source, /'ENT-9'/);
  assert.doesNotMatch(source, /\b(?:DELETE|TRUNCATE)\s+FROM\s+public\.(?:distributors|system_sets|dispensers|mixers|computers|printers)/i);
  assert.doesNotMatch(source, /DROP\s+TABLE/i);
});

test('ENT-9 repair mapping and offline queue retain every workflow field', async () => {
  const [hook, sync] = await Promise.all([
    readFile(repairHookUrl, 'utf8'),
    readFile(offlineSyncUrl, 'utf8')
  ]);
  for (const field of ['asset_code', 'field_visit_status', 'service_checklist', 'materials_used', 'before_photos', 'after_photos', 'npp_confirmation', 'sla_due_at', 'completed_at']) {
    assert.match(hook, new RegExp(field));
    assert.match(sync, new RegExp(field));
  }
  assert.match(sync, /'Đang xử lý'/);
});

test('ENT-9 UI supports QR, SLA, checklist, evidence, materials and NPP confirmation', async () => {
  const source = await readFile(repairUiUrl, 'utf8');
  assert.match(source, /Mã QR \/ Mã QL thiết bị/);
  assert.match(source, /Hạn SLA xử lý/);
  assert.match(source, /Checklist bắt buộc/);
  assert.match(source, /Vật tư sử dụng/);
  assert.match(source, /Ảnh Sau Khi Hoàn Thành/);
  assert.match(source, /Đại diện NPP xác nhận đã hoàn thành/);
});
