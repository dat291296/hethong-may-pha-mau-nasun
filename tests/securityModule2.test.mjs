import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_2_rls_lockdown.sql', import.meta.url);
const policiesUrl = new URL('../supabase/rls_policies.sql', import.meta.url);

test('RLS lockdown contains no data mutation or destructive table statement', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.doesNotMatch(sql, /^\s*(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|UPDATE\s+\w|INSERT\s+INTO)\b/im);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
});

test('RLS lockdown removes anonymous table access and legacy policies', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  for (const table of ['tinting_logs', 'formula_versions', 'agent_telemetry', 'diagnostic_commands', 'system_sets']) {
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon`));
  }
  assert.match(sql, /DROP POLICY IF EXISTS "sets_update_agent"/);
  assert.match(sql, /DROP POLICY IF EXISTS "diagnostic_commands_anon_all"/);
});

test('base RLS policy file no longer creates anonymous agent policies', async () => {
  const sql = await readFile(policiesUrl, 'utf8');

  assert.doesNotMatch(sql, /CREATE POLICY[^;]+\bTO anon\b/i);
  assert.doesNotMatch(sql, /CREATE POLICY "sets_update_agent"/);
  assert.doesNotMatch(sql, /CREATE POLICY "diagnostic_commands_auth_all"/);
});
