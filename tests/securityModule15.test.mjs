import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_15_sensitive_action_rate_limits.sql', import.meta.url);
const usersUrl = new URL('../src/components/UserManagement.jsx', import.meta.url);

test('rate-limit storage is isolated from browser roles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.security_rate_limits/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.security_rate_limits FROM authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.consume_security_rate_limit\(TEXT, INTEGER, INTEGER\) FROM authenticated/);
});

test('sensitive account functions enforce role checks and fixed server limits', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /caller_role TEXT := public\.get_my_role\(\)/g);
  assert.match(sql, /consume_security_rate_limit\('update_user_access', 10, 600\)/);
  assert.match(sql, /consume_security_rate_limit\('set_user_account_active', 10, 600\)/);
  assert.match(sql, /'error', 'RATE_LIMIT_EXCEEDED'/);
});

test('account UI handles committed rate-limit responses', async () => {
  const users = await readFile(usersUrl, 'utf8');
  assert.match(users, /updateResult\?\.error === 'RATE_LIMIT_EXCEEDED'/);
  assert.match(users, /statusResult\?\.error === 'RATE_LIMIT_EXCEEDED'/);
  assert.match(users, /retry_after_seconds/);
});
