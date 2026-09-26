import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const module1Url = new URL('../supabase/sync_sec_module_1_foundation.sql', import.meta.url);
const module2Url = new URL('../supabase/sync_sec_module_2_atomic_mutations.sql', import.meta.url);
const offlineSyncUrl = new URL('../src/lib/offlineSync.js', import.meta.url);

test('legacy workflow ledger is upgraded without deleting operations', async () => {
  const sql = await readFile(module1Url, 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS workflow TEXT/);
  assert.match(sql, /normalize_legacy_sync_operation/);
  assert.match(sql, /ALTER COLUMN workflow DROP NOT NULL/);
  assert.doesNotMatch(sql, /DELETE FROM public\.sync_operations|TRUNCATE/i);
});

test('atomic sync runs as invoker and keeps RLS authorization active', async () => {
  const sql = await readFile(module2Url, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.execute_sync_operation/);
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /register_sync_operation/);
  assert.match(sql, /complete_sync_operation/);
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY|SET row_security\s*=\s*off/i);
});

test('dynamic mutation is constrained to known tables, keys and modes', async () => {
  const sql = await readFile(module2Url, 'utf8');
  assert.match(sql, /SYNC_TABLE_NOT_ALLOWED/);
  assert.match(sql, /SYNC_PRIMARY_KEY_NOT_ALLOWED/);
  assert.match(sql, /SYNC_MODE_NOT_ALLOWED/);
  assert.match(sql, /pg_attribute/);
  assert.match(sql, /jsonb_populate_record/);
});

test('client uses atomic RPC with safe fallback during staged deployment', async () => {
  const source = await readFile(offlineSyncUrl, 'utf8');
  assert.match(source, /executeAtomicSyncMutation/);
  assert.match(source, /execute_sync_operation/);
  assert.match(source, /PGRST202/);
  assert.match(source, /operationId: `\$\{link\.queueItem\.operationId\}:link`/);
  assert.match(source, /item\.pendingLink = deferredLink/);
  assert.match(source, /'UPDATE_SYSTEM_SET'/);
});

test('module 2 never bulk-mutates or deletes existing business data', async () => {
  const sql = await readFile(module2Url, 'utf8');
  assert.doesNotMatch(sql, /TRUNCATE|DROP TABLE/i);
  assert.doesNotMatch(sql, /DELETE FROM public\.(?:distributors|dispensers|mixers|computers|printers|system_sets|repair_tickets)\s*;/i);
});
