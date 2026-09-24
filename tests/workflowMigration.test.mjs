import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/workflow_transactions_migration.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');

test('workflow migration is transactional and idempotent', () => {
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /sync_operations/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /operation_id = p_operation_id/);
});

test('workflow function validates authorization and supported operations', () => {
  assert.match(sql, /auth\.uid\(\) IS NULL/);
  assert.match(sql, /get_my_role\(\) NOT IN \('admin', 'qc'\)/);
  assert.match(sql, /'INSTALL', 'WITHDRAW', 'TRANSFER'/);
});

test('withdrawal keeps equipment records and moves sets to stock', () => {
  assert.match(sql, /status = 'TRONG_KHO'/);
  assert.match(sql, /npp_id = NULL/);
  assert.doesNotMatch(sql, /DELETE FROM public\.(dispensers|mixers|computers|printers)/);
});
