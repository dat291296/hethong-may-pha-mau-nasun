import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_1_admin_bootstrap.sql', import.meta.url);
const authContextUrl = new URL('../src/context/AuthContext.jsx', import.meta.url);

test('legacy admin bootstrap fails closed', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /ADMIN_BOOTSTRAP_DISABLED/);
  assert.doesNotMatch(sql, /auth\.users|@gmail\.com/i);
});

test('admin bootstrap is unavailable to every browser role', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.bootstrap_admin_role\(\) FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.bootstrap_admin_role\(\) FROM anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.bootstrap_admin_role\(\) FROM authenticated/);
});

test('client no longer calls the legacy bootstrap', async () => {
  const source = await readFile(authContextUrl, 'utf8');

  assert.doesNotMatch(source, /bootstrap_admin_role/);
  assert.doesNotMatch(source, /dat291219962\.hust@gmail\.com/i);
});
