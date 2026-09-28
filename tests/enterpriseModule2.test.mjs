import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/enterprise_module_2_five_role_rbac.sql', import.meta.url);
const rbacUrl = new URL('../src/security/rbac.js', import.meta.url);
const userManagementUrl = new URL('../src/components/UserManagement.jsx', import.meta.url);

test('ENT-2 defines five roles consistently in database and frontend', async () => {
  const [sql, rbac, users] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(rbacUrl, 'utf8'),
    readFile(userManagementUrl, 'utf8'),
  ]);
  for (const role of ['admin', 'manager', 'technician', 'qc', 'viewer']) {
    assert.match(sql, new RegExp(`'${role}'`));
    assert.match(rbac, new RegExp(`'${role}'`));
    assert.match(users, new RegExp(`value="${role}"`));
  }
});

test('ENT-2 keeps administrator provisioning on the dedicated audited RPC', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /USE_PROVISION_ADMIN_ROLE/);
  assert.match(sql, /caller_role IS DISTINCT FROM 'admin'/);
  assert.match(sql, /ENT_2_REQUIRES_ENT_1/);
  assert.match(sql, /consume_security_rate_limit\('update_user_access'/);
});

test('ENT-2 enforces regional operational policies and preserves workflow implementation', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_operational_staff/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.can_manage_master_data/);
  assert.match(sql, /public\.can_access_region\(region\)/);
  assert.match(sql, /pg_get_functiondef\('public\.execute_equipment_workflow/);
  assert.match(sql, /ENT_2_WORKFLOW_ROLE_GATE_NOT_FOUND/);
});

test('ENT-2 does not mutate or delete business records', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /DELETE FROM|TRUNCATE|DROP TABLE/i);
  assert.doesNotMatch(sql, /UPDATE public\.(?:distributors|system_sets|dispensers|mixers|computers|printers|repair_tickets|audit_logs)/i);
});
