import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_4_audit_integrity.sql', import.meta.url);
const hookUrl = new URL('../src/hooks/useAuditLogs.js', import.meta.url);
const syncUrl = new URL('../src/lib/offlineSync.js', import.meta.url);

test('audit integrity migration preserves existing data', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /^\s*(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|UPDATE\s+\w)\b/im);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
});

test('audit RPC derives identity from auth and allowlists fields', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /caller_id UUID := auth\.uid\(\)/);
  assert.match(sql, /notes, user_id, target_id, severity[\s\S]+?caller_id,/);
  assert.match(sql, /WHERE id = audit_id AND user_id = caller_id/);
  assert.doesNotMatch(sql, /p_payload->>'user_id'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.create_audit_log\(JSONB\) FROM PUBLIC/);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]+FOR INSERT/);
});

test('online and offline audit writes use the protected RPC', async () => {
  const hook = await readFile(hookUrl, 'utf8');
  const sync = await readFile(syncUrl, 'utf8');
  assert.match(hook, /supabase\.rpc\('create_audit_log'/);
  assert.match(sync, /supabase\.rpc\('create_audit_log'/);
  assert.doesNotMatch(hook, /from\('audit_logs'\)\.insert/);
  assert.doesNotMatch(sync, /case 'ADD_AUDIT_LOG':[\s\S]{0,250}from\('audit_logs'\)\.upsert/);
});
