import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_17_immutable_security_events.sql', import.meta.url);
const authUrl = new URL('../src/context/AuthContext.jsx', import.meta.url);
const usersUrl = new URL('../src/components/UserManagement.jsx', import.meta.url);

test('security events are append-only and admin-readable', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.security_events FROM authenticated/);
  assert.match(sql, /USING \(public\.get_my_role\(\) = 'admin'\)/);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]+FOR (?:INSERT|UPDATE|DELETE)/s);
});

test('database trigger captures security-sensitive account changes', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /AFTER UPDATE OF role, managed_region, is_active, mfa_required ON public\.profiles/);
  assert.match(sql, /ACCOUNT_ROLE_CHANGED/);
  assert.match(sql, /ACCOUNT_DEACTIVATED/);
  assert.match(sql, /ACCOUNT_MFA_REQUIREMENT_CHANGED/);
});

test('application event RPC derives identity and removes common secret fields', async () => {
  const [sql, auth] = await Promise.all([readFile(migrationUrl, 'utf8'), readFile(authUrl, 'utf8')]);
  assert.match(sql, /caller_id UUID := auth\.uid\(\)/);
  assert.match(sql, /normalized_details - 'password' - 'token' - 'secret' - 'authorization'/);
  assert.match(sql, /octet_length\(normalized_details::TEXT\) > 4000/);
  assert.match(sql, /occurred_at > NOW\(\) - INTERVAL '5 minutes'\) >= 30/);
  assert.match(auth, /rpc\('record_security_event'/);
});

test('admin account screen displays immutable security events without mutation controls', async () => {
  const users = await readFile(usersUrl, 'utf8');
  assert.match(users, /from\('security_events'\)/);
  assert.match(users, /Nhật Ký Sự Kiện Bảo Mật/);
  assert.doesNotMatch(users, /from\('security_events'\)[\s\S]{0,160}\.(?:update|delete|insert)\(/);
});
