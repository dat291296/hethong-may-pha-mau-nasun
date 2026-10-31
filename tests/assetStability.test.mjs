import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetReadBarrier } from '../src/modules/equipment/lib/assetQuery.js';
import { optimisticRemoval } from '../src/shared/lib/optimisticRemoval.js';
import { summarizeDashboard } from '../src/modules/dashboard/lib/dashboardSummary.js';
import { regionalMachineCounts } from '../src/modules/fieldwork/lib/teamWorkspace.js';

test('Dashboard aggregation preserves regional fallback, warehouse and model semantics', () => {
  const npps = [{ id: 'N1', region: 'Miền Bắc' }];
  const sets = [
    { nppId: 'N1', status: 'DA_LAP_DAT', dispenserModel: '__proto__', nextMaintenanceDue: '2026-10-01' },
    { region: 'Kho Tổng', status: 'TRONG_KHO', dispenserModel: '__proto__' },
    { region: 'Miền Nam', status: 'DA_THU_HOI' },
    { region: 'Miền Trung', status: 'BAO_THUONG_BAO_TRI' },
  ];
  const result = summarizeDashboard(sets, npps, '2026-10-30');
  assert.deepEqual(result.regionalCounts, regionalMachineCounts(sets, npps));
  assert.equal(result.installed, 1);
  assert.equal(result.stock, 1);
  assert.equal(result.revoked, 1);
  assert.equal(result.maintenance, 1);
  assert.equal(result.warehouse, 1);
  assert.equal(result.overdue, 1);
  assert.deepEqual(result.modelChartData, [{ name: '__proto__', value: 2 }, { name: 'Khác', value: 2 }]);
});

test('reads started before or during writes cannot overwrite the acknowledged state', () => {
  const barrier = createAssetReadBarrier();
  const before = barrier.capture();
  const finishA = barrier.begin();
  const during = barrier.capture();
  const finishB = barrier.begin();
  assert.equal(barrier.canCommit(before), false);
  finishA();
  assert.equal(barrier.canCommit(barrier.capture()), false);
  finishA(); // Cleanup is idempotent and cannot release another write.
  assert.equal(barrier.canCommit(barrier.capture()), false);
  finishB();
  assert.equal(barrier.canCommit(during), false);
  assert.equal(barrier.canCommit(before), false);
  assert.equal(barrier.canCommit(barrier.capture()), true);
});

test('optimistic deletion removes immediately but waits for durable acknowledgement', async () => {
  let rows = [{ id: 'A' }, { id: 'B' }];
  let acknowledge;
  const pending = optimisticRemoval({ id: 'A', key: 'id', read: () => rows, update: fn => { rows = fn(rows); },
    persist: () => new Promise(resolve => { acknowledge = resolve; }) });
  assert.deepEqual(rows, [{ id: 'B' }]);
  acknowledge({ queued: true });
  assert.deepEqual(await pending, { queued: true });
  assert.deepEqual(rows, [{ id: 'B' }]);
});

test('denied deletion restores only the deleted record and preserves concurrent edits', async () => {
  let rows = [{ id: 'A', notes: 'Original' }, { id: 'B', notes: 'Before' }];
  let reject;
  const pending = optimisticRemoval({ id: 'A', key: 'id', read: () => rows, update: fn => { rows = fn(rows); },
    persist: () => new Promise((_, failure) => { reject = failure; }) });
  rows = [{ id: 'B', notes: 'Edited while waiting' }, { id: 'C', notes: 'New' }];
  reject(Object.assign(new Error('Denied'), { code: '42501' }));
  await assert.rejects(pending, { code: '42501' });
  assert.deepEqual(rows, [{ id: 'A', notes: 'Original' }, { id: 'B', notes: 'Edited while waiting' }, { id: 'C', notes: 'New' }]);
});

test('failed offline queue persistence rolls back and never duplicates a restored row', async () => {
  let rows = [{ id: 'A', version: 1 }];
  const pending = optimisticRemoval({ id: 'A', key: 'id', read: () => rows, update: fn => { rows = fn(rows); },
    persist: async () => { rows = [{ id: 'A', version: 2 }]; throw new Error('OFFLINE_QUEUE_PERSIST_FAILED'); } });
  await assert.rejects(pending, /OFFLINE_QUEUE_PERSIST_FAILED/);
  assert.deepEqual(rows, [{ id: 'A', version: 2 }]);
});
