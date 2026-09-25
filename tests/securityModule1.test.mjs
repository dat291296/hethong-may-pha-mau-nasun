import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_1_admin_bootstrap.sql', import.meta.url);
const authContextUrl = new URL('../src/context/AuthContext.jsx', import.meta.url);

test('admin bootstrap derives identity from the authenticated database session', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /current_user_id UUID := auth\.uid\(\)/);
  assert.match(sql, /FROM auth\.users\s+WHERE id = current_user_id/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.bootstrap_admin_role\([^)]*(user_id|user_email)/);
});

test('admin bootstrap is unavailable to public and anonymous roles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.bootstrap_admin_role\(\) FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.bootstrap_admin_role\(\) FROM anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.bootstrap_admin_role\(\) TO authenticated/);
});

test('client cannot provide bootstrap identity parameters', async () => {
  const source = await readFile(authContextUrl, 'utf8');

  assert.match(source, /supabase\.rpc\('bootstrap_admin_role'\)/);
  assert.doesNotMatch(source, /bootstrap_admin_role'[\s\S]{0,120}(user_id|user_email)/);
});
