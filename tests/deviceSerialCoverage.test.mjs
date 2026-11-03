import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptionalSerial, isUnknownSerial } from '../src/modules/equipment/lib/deviceSerial.js';
import { nppCoverage } from '../src/modules/distributors/lib/nppCoverage.js';
import { missingMachineFields } from '../src/modules/fieldwork/lib/teamWorkspace.js';
import { missingDeviceFields, missingSystemSetFields } from '../src/modules/equipment/lib/dataCompleteness.js';
import { getSystemSetMissingFields } from '../src/modules/equipment/utils/systemSetValidation.js';
import { isStabilizerMissing, normalizeStabilizerChoice, STABILIZER_MISSING, STABILIZER_NPP } from '../src/modules/equipment/lib/stabilizer.js';

test('unknown and generated serials stay unknown instead of creating fake serials', () => {
  for (const value of ['', null, 'N/A', '—', 'AUTO-MIXE-123']) {
    assert.equal(normalizeOptionalSerial(value), null);
    assert.equal(isUnknownSerial(value), true);
  }
  assert.equal(normalizeOptionalSerial(' REAL-123 '), 'REAL-123');
  assert.ok(missingMachineFields({ status: 'DA_LAP_DAT', mixerSerial: 'AUTO-MIXE-123' }).includes('Seri máy lắc'));
  assert.ok(getSystemSetMissingFields({ dispenserSerial: 'AUTO-DISP-001', mixerSerial: 'AUTO-MIXE-001', printerSerial: 'AUTO-PRIN-001' }).filter(field => field.startsWith('Seri')).length === 3);
  assert.ok(missingSystemSetFields({ computerSerial: '', region: 'Nam', province: 'HCM', tintingSoftware: 'NASUN', softwareVersion: '1', technician: 'KTV' }).every(field => field !== 'Seri máy tính'));
  assert.ok(!missingDeviceFields({ id: 'COMP-001', model: 'PC', status: 'Tốt' }, 'computer').includes('Số seri'));
});

test('stabilizer state has only the requested choice labels and warns for missing records', () => {
  assert.equal(normalizeStabilizerChoice('Lioa 2000VA (NPP tự mua)'), STABILIZER_NPP);
  assert.equal(normalizeStabilizerChoice('Không có'), STABILIZER_MISSING);
  assert.equal(isStabilizerMissing(''), true);
  assert.equal(isStabilizerMissing(STABILIZER_NPP), false);
});

test('coverage counts distributors once and treats withdrawn or warehouse sets as unassigned', () => {
  const npps = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const sets = [{ nppId: 'A', status: 'DA_LAP_DAT' }, { nppId: 'A', status: 'BAO_THUONG_BAO_TRI' }, { nppId: 'B', status: 'DA_THU_HOI' }, { nppId: 'C', status: 'TRONG_KHO' }];
  const result = nppCoverage(npps, sets);
  assert.deepEqual(result.assigned.map(npp => npp.id), ['A']);
  assert.deepEqual(result.unassigned.map(npp => npp.id), ['B', 'C']);
});
