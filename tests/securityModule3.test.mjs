import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_3_regional_rbac.sql', import.meta.url);

test('regional RBAC migration does not mutate or delete application data', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /^\s*(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|UPDATE\s+\w|INSERT\s+INTO)\b/im);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
});

test('regional RBAC protects core business tables', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.can_access_region/);
  assert.match(sql, /CREATE POLICY "npp_select_regional"/);
  assert.match(sql, /CREATE POLICY "sets_select_regional"/);
  assert.match(sql, /asset_select_regional_/);
  assert.match(sql, /CREATE POLICY "repair_select_regional"/);
  assert.match(sql, /sets_insert_regional_staff[\s\S]+?NULL\)\)\);/);
  assert.match(sql, /sets_update_regional_staff[\s\S]+?NULL\)\)\)\s+WITH CHECK/);
  assert.match(sql, /sets_update_regional_staff[\s\S]+?WITH CHECK[\s\S]+?NULL\)\)\);/);
});

test('regional RBAC migration does not depend on optional workflow objects', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(migration, /execute_equipment_workflow/);
  assert.doesNotMatch(migration, /sync_operations/);
});
