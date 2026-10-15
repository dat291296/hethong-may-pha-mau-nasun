import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptionalSerial, isUnknownSerial } from '../src/lib/deviceSerial.js';
import { nppCoverage } from '../src/lib/nppCoverage.js';
import { missingMachineFields } from '../src/lib/teamWorkspace.js';

test('unknown and generated serials stay unknown instead of creating fake serials', () => {
  for (const value of ['', null, 'N/A', '—', 'AUTO-MIXE-123']) {
    assert.equal(normalizeOptionalSerial(value), null);
    assert.equal(isUnknownSerial(value), true);
  }
  assert.equal(normalizeOptionalSerial(' REAL-123 '), 'REAL-123');
  assert.ok(missingMachineFields({ status: 'DA_LAP_DAT', mixerSerial: 'AUTO-MIXE-123' }).includes('Seri máy lắc'));
});

test('coverage counts distributors once and treats withdrawn or warehouse sets as unassigned', () => {
  const npps = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const sets = [{ nppId: 'A', status: 'DA_LAP_DAT' }, { nppId: 'A', status: 'BAO_THUONG_BAO_TRI' }, { nppId: 'B', status: 'DA_THU_HOI' }, { nppId: 'C', status: 'TRONG_KHO' }];
  const result = nppCoverage(npps, sets);
  assert.deepEqual(result.assigned.map(npp => npp.id), ['A']);
  assert.deepEqual(result.unassigned.map(npp => npp.id), ['B', 'C']);
});
