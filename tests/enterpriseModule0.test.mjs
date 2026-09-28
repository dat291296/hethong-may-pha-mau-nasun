import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/enterprise_module_0_migration_registry.sql', import.meta.url);

test('ENT-0 is additive and serializes enterprise migrations', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.app_schema_migrations/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\.(?:distributors|system_sets|dispensers|mixers|computers|printers)/i);
});

test('ENT-0 exposes an admin-only read-only preflight snapshot', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /get_enterprise_preflight_snapshot/);
  assert.match(sql, /caller_role IS DISTINCT FROM 'admin'/);
  assert.match(sql, /tableCounts/);
  assert.match(sql, /activeAdmins/);
  assert.match(sql, /MIGRATION_CHECKSUM_MISMATCH/);
});
