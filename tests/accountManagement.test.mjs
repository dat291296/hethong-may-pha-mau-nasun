import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authorizeAccountManagement, confirmAccountUpdate } from '../src/security/accountManagement.js';
import { hasPermission } from '../src/security/rbac.js';
import { canEditRegion } from '../src/lib/workspaceFilters.js';

test('account management validates the current session without signing in again', async () => {
  const calls = [];
  await authorizeAccountManagement({ rpc: async name => { calls.push(name); return { data: true }; }, auth: { signInWithPassword: () => assert.fail('Session must not change') } });
  assert.deepEqual(calls, ['require_account_admin_session']);
  for (const result of [{ data: false }, { error: new Error('denied') }, {}]) await assert.rejects(authorizeAccountManagement({ rpc: async () => result }));
  assert.doesNotThrow(() => confirmAccountUpdate({ id: 'target', role: 'technician', managed_region: 'Miền Trung' }, 'target', { role: 'technician', managed_region: 'Miền Trung' }));
  assert.throws(() => confirmAccountUpdate({ id: 'other', role: 'technician' }, 'target', { role: 'technician' }));
});

test('technicians may create and edit NPP data only in their concrete region', () => {
  assert.equal(hasPermission('technician', 'npp:create'), true);
  assert.equal(hasPermission('technician', 'npp:edit'), true);
  for (const assigned of ['Miền Bắc','Miền Trung','Miền Nam']) for (const target of ['Miền Bắc','Miền Trung','Miền Nam']) {
    assert.equal(canEditRegion({ role: 'technician', managedRegion: assigned }, target), assigned === target);
  }
  assert.equal(hasPermission('technician', 'npp:delete'), false);
});

test('account UI uses a session check and preserves separate recent-authentication protection', async () => {
  const ui = await readFile(new URL('../src/components/UserManagement.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /requireAuthentication|signInWithPassword|useSensitiveActionGate/);
  const sql = await readFile(new URL('../supabase/technician_national_read_admin_session.sql', import.meta.url), 'utf8');
  assert.match(sql, /auth\.sessions/);
  assert.match(sql, /s\.revoked_at IS NOT NULL/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.require_recent_authentication/);
});
