import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegion, regionalMachineCounts, inManagedRegion, taskPriority } from '../src/lib/teamWorkspace.js';

test('regional totals normalize legacy values and use NPP region when absent', () => {
  assert.equal(normalizeRegion('BẮC'), 'Miền Bắc');
  const result = regionalMachineCounts([{ region: 'Miền Bắc', status: 'DA_LAP_DAT' }, { nppId: 'N1' }, { region: 'Kho Tổng' }], [{ id: 'N1', region: 'NAM' }]);
  assert.deepEqual(result.map(row => row.count), [1, 0, 1]);
  assert.equal(result[0].installed, 1);
});

test('regional work excludes another region and unassigned accounts', () => {
  const user = { role: 'manager', managedRegion: 'Miền Bắc' };
  assert.equal(inManagedRegion({ nppId: 'N1' }, user, [{ id: 'N1', region: 'BẮC' }]), true);
  assert.equal(inManagedRegion({ region: 'Miền Nam' }, user), false);
  assert.equal(inManagedRegion({ region: 'Miền Bắc' }, { role: 'manager' }), false);
  assert.equal(inManagedRegion({}, { role: 'admin' }), true);
});

test('priority puts overdue work before repairs, today, return and upcoming maintenance', () => {
  const today = '2026-10-15';
  const rows = [{ due: '2026-10-14' }, { tab: 'repairs', label: 'Sửa chữa' }, { due: today }, { label: 'Chờ gửi trả' }, { label: 'Bảo trì', due: '2026-10-20' }];
  assert.deepEqual(rows.map(row => taskPriority(row, today)), [0, 1, 2, 3, 4]);
});
