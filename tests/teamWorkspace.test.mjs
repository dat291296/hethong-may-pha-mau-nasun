import test from 'node:test';
import assert from 'node:assert/strict';
import { isAssignedTo, repairNeedsAction, missingMachineFields, isDraftExpired, searchText, matchesSavedRepair } from '../src/lib/teamWorkspace.js';

test('explicit account assignment wins over ambiguous legacy technician names', () => {
  const user = { id: 'a', name: 'Đạt' };
  assert.equal(isAssignedTo({ assignedUserId: 'b', technician: 'Đạt' }, user), false);
  assert.equal(isAssignedTo({ assignedUserId: 'a', technician: 'Someone else' }, user), true);
  assert.equal(isAssignedTo({ technician: ' ĐẠT ' }, user), true);
  assert.equal(isAssignedTo({ technician: '' }, { id: 'a' }), false);
});
test('finished repairs awaiting return remain actionable', () => {
  assert.equal(repairNeedsAction({ processingStatus: 'Đã xử lý', customerReturnStatus: 'Chưa gửi trả' }), true);
  assert.equal(repairNeedsAction({ processingStatus: 'Đã xử lý', customerReturnStatus: 'Đã gửi trả' }), false);
  assert.equal(repairNeedsAction({ processingStatus: 'Chưa xử lý' }), true);
});
test('quality checks flag placeholders on installed machines, not warehouse inventory', () => {
  assert.deepEqual(missingMachineFields({ status: 'TRONG_KHO' }), []);
  const fields = missingMachineFields({ status: 'DA_LAP_DAT', dispenserSerial: 'N/A', mixerSerial: 'M1', computerSerial: 'PC1', printerSerial: 'P1' });
  assert.deepEqual(fields, ['Seri máy chiết', 'Hạn bảo trì']);
});
test('drafts expire after 30 days and Vietnamese search ignores accents', () => {
  assert.equal(isDraftExpired({ savedAt: 1000 }, 1000 + 31 * 86400000), true);
  assert.equal(isDraftExpired({ savedAt: 1000 }, 2000), false);
  assert.equal(searchText('Đại lý Hưng Lộc Sơn'), 'dai ly hung loc son');
});
test('lost insert acknowledgements only accept the same saved payload', () => {
  const payload = { id: 'uuid', notes: 'original', service_checklist: { a: true, b: false } };
  assert.equal(matchesSavedRepair({ ...payload, record_version: 1, service_checklist: { b: false, a: true } }, payload), true);
  assert.equal(matchesSavedRepair({ ...payload, notes: 'edited by a colleague' }, payload), false);
  assert.equal(matchesSavedRepair(null, payload), false);
});
