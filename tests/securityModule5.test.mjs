import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_5_account_lifecycle.sql', import.meta.url);
const authUrl = new URL('../src/context/AuthContext.jsx', import.meta.url);
const usersUrl = new URL('../src/components/UserManagement.jsx', import.meta.url);

test('account lifecycle migration preserves profiles and business data', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /^\s*(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\b/im);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE/);
});

test('inactive accounts lose backend roles and only admins can toggle status', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /WHERE id = auth\.uid\(\) AND is_active = TRUE/);
  assert.match(sql, /caller_role IS DISTINCT FROM 'admin'/);
  assert.match(sql, /CANNOT_DEACTIVATE_SELF/);
  assert.match(sql, /DROP POLICY IF EXISTS "profile_update_own"/);
});

test('frontend signs out disabled users and uses reversible account RPC', async () => {
  const auth = await readFile(authUrl, 'utf8');
  const users = await readFile(usersUrl, 'utf8');
  assert.match(auth, /profile\?\.is_active === false/);
  assert.match(auth, /ACCOUNT_DISABLED/);
  assert.match(users, /rpc\('set_user_account_active'/);
  assert.doesNotMatch(users, /from\('profiles'\)[\s\S]{0,120}\.delete\(\)/);
});
