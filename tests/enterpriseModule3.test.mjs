import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/enterprise_module_3_legacy_component_retirement.sql', import.meta.url);
const schemaUrl = new URL('../supabase/schema.sql', import.meta.url);
const policiesUrl = new URL('../supabase/rls_policies.sql', import.meta.url);

test('ENT-3 retires each obsolete object defensively', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of ['formula_versions', 'agent_telemetry', 'diagnostic_commands']) {
    assert.match(sql, new RegExp(`'${table}'`));
  }
  assert.match(sql, /to_regclass\('public\.' \|\| target_name\)/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE/);
  assert.match(sql, /ENT_3_REQUIRES_ENT_2/);
});

test('ENT-3 stores recovery metadata before removing browser policies', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.legacy_component_retirements/);
  assert.match(sql, /policy_snapshot JSONB/);
  assert.match(sql, /privilege_snapshot JSONB/);
  assert.match(sql, /FROM pg_policies/);
  assert.match(sql, /FROM information_schema\.role_table_grants/);
});

test('ENT-3 preserves all legacy and business records', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /DELETE FROM|TRUNCATE|DROP TABLE/i);
  assert.doesNotMatch(sql, /UPDATE public\.(?:distributors|system_sets|dispensers|mixers|computers|printers|repair_tickets|audit_logs|formula_versions|agent_telemetry|diagnostic_commands)/i);
});

test('fresh baseline no longer creates or grants access to retired tables', async () => {
  const [schema, policies] = await Promise.all([
    readFile(schemaUrl, 'utf8'),
    readFile(policiesUrl, 'utf8'),
  ]);
  for (const table of ['formula_versions', 'agent_telemetry', 'diagnostic_commands']) {
    assert.doesNotMatch(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
    assert.doesNotMatch(policies, new RegExp(`ON ${table}\\b`));
  }
});
