import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_8_profile_property_access.sql', import.meta.url);
const usersUrl = new URL('../src/components/UserManagement.jsx', import.meta.url);

test('profile property migration preserves all existing data', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /^\s*(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\b/im);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.update_user_access/);
});

test('profile access RPC allowlists values and derives caller identity', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /caller_id UUID := auth\.uid\(\)/);
  assert.match(sql, /normalized_role NOT IN \('admin', 'qc', 'viewer'\)/);
  assert.match(sql, /normalized_region NOT IN \('Miền Bắc', 'Miền Trung', 'Miền Nam'\)/);
  assert.match(sql, /CANNOT_CHANGE_OWN_ACCESS/);
  assert.match(sql, /DROP POLICY IF EXISTS "profile_update_admin"/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.update_user_access\(UUID, TEXT, TEXT\) FROM anon/);
});

test('account UI avoids wildcard profile reads and direct profile updates', async () => {
  const users = await readFile(usersUrl, 'utf8');
  assert.doesNotMatch(users, /from\('profiles'\)[\s\S]{0,80}select\('\*'\)/);
  assert.doesNotMatch(users, /from\('profiles'\)[\s\S]{0,120}\.update\(/);
  assert.match(users, /rpc\('update_user_access'/);
});
