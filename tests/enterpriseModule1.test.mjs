import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/enterprise_module_1_server_admin_provisioning.sql', import.meta.url);
const authContextUrl = new URL('../src/context/AuthContext.jsx', import.meta.url);
const schemaUrl = new URL('../supabase/schema.sql', import.meta.url);
const userManagementUrl = new URL('../src/components/UserManagement.jsx', import.meta.url);

test('ENT-1 provisions administrators from an authenticated active administrator', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.provision_admin_role/);
  assert.match(sql, /WHERE id = caller_id AND is_active = TRUE/);
  assert.match(sql, /caller_role IS DISTINCT FROM 'admin'/);
  assert.match(sql, /admin_role_grants/);
  assert.match(sql, /CANNOT_REMOVE_LAST_ADMIN/);
  assert.match(sql, /ENT_1_REQUIRES_ENT_0/);
});

test('ENT-1 fails closed and contains no administrator email allowlist', async () => {
  const [migration, auth, schema] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(authContextUrl, 'utf8'),
    readFile(schemaUrl, 'utf8'),
  ]);
  const combined = `${migration}\n${auth}\n${schema}`;
  assert.doesNotMatch(combined, /dat291219962\.hust@gmail\.com/i);
  assert.doesNotMatch(auth, /bootstrap_admin_role/);
  assert.match(migration, /ADMIN_BOOTSTRAP_DISABLED/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.bootstrap_admin_role\(\) FROM PUBLIC, anon, authenticated/);
});

test('administrator grants use the dedicated audited server RPC', async () => {
  const source = await readFile(userManagementUrl, 'utf8');
  assert.match(source, /supabase\.rpc\('provision_admin_role'/);
  assert.match(source, /p_target_user_id: profileId/);
  assert.match(source, /p_reason: reason\.trim\(\)/);
});

test('ENT-1 does not modify business data', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /DELETE FROM|TRUNCATE|DROP TABLE/i);
  assert.doesNotMatch(sql, /UPDATE public\.(?:distributors|system_sets|dispensers|mixers|computers|printers|repair_tickets|audit_logs)/i);
});
