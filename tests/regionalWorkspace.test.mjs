import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkspaceRegion, resolveWorkspaceRegion, scopeWorkspace } from '../src/lib/regionalWorkspace.js';
import { inManagedRegion, isAssignedTo } from '../src/lib/teamWorkspace.js';
import { canEditRegion } from '../src/lib/workspaceFilters.js';

const npps = [{ id: 'north', region: 'Miền Bắc' }, { id: 'central', region: 'Miền Trung' }, { id: 'south', region: 'Miền Nam' }];
const systemSets = [{ setCode: 'A', nppId: 'central', region: 'Miền Bắc', mixerId: 'm1' }, { setCode: 'B', nppId: 'south' }];
test('technicians default to their assigned region while admin and viewer keep national scope', () => {
  for (const region of npps.map(item => item.region)) {
    assert.equal(defaultWorkspaceRegion({ role: 'technician', managedRegion: region }), region);
    for (const role of ['admin', 'viewer']) assert.equal(defaultWorkspaceRegion({ role, managedRegion: region }), 'ALL');
  }
});
test('related devices, repairs and logs follow the current distributor region; loose stock stays separate', () => {
  assert.equal(resolveWorkspaceRegion({ id: 'm1' }, npps, systemSets), 'Miền Trung');
  const data = { npps, systemSets, mixers: [{ id: 'm1' }, { id: 'loose' }], repairTickets: [{ nppId: 'central' }, { setCode: 'B' }], auditLogs: [{ setCode: 'A' }] };
  const scoped = scopeWorkspace(data, 'Miền Trung');
  assert.equal(scoped.npps.length, 1);
  assert.equal(scoped.systemSets.length, 1);
  assert.deepEqual(scoped.mixers, [{ id: 'm1' }]);
  assert.equal(scoped.repairTickets.length, 1);
  assert.equal(scoped.auditLogs.length, 1);
  assert.deepEqual(scopeWorkspace(data, 'UNASSIGNED').mixers, [{ id: 'loose' }]);
  assert.equal(scopeWorkspace(data, 'ALL'), data);
  assert.equal(data.mixers.length, 2);
});
test('my work requires both regional ownership and explicit account assignment', () => {
  const user = { id: 'tech', name: 'An', role: 'technician', managedRegion: 'Miền Trung' };
  const own = { nppId: 'central', assignedUserId: 'tech' };
  assert.equal(inManagedRegion(own, user, npps, systemSets) && isAssignedTo(own, user), true);
  assert.equal(inManagedRegion({ nppId: 'south', assignedUserId: 'tech' }, user, npps, systemSets), false);
  assert.equal(isAssignedTo({ ...own, assignedUserId: 'other', technician: 'An' }, user), false);
  assert.equal(inManagedRegion(systemSets[0], user, npps, systemSets), true);
  assert.equal(canEditRegion(user, 'Miền Trung'), true);
  assert.equal(canEditRegion(user, 'Miền Bắc'), false);
  assert.equal(canEditRegion(user, 'Miền Nam'), false);
  assert.equal(canEditRegion({ role: 'viewer' }, 'Miền Trung'), false);
});
