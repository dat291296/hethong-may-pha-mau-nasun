import test from 'node:test';
import assert from 'node:assert/strict';
import { nextNppCode, validateNppCode } from '../src/lib/nppCodes.js';
import { repairMissingFields } from '../src/lib/repairCompleteness.js';
import { parseCoordinates, calculateRoadRoute } from '../src/lib/routeEstimate.js';

test('NPP code suggestions respect region sequences and allow manual numbered codes', () => {
  const rows = [{ id: 'NPP-MB-060' }, { id: 'uuid', code: 'NPP-MB-072' }, { id: 'NPP-MT-010' }];
  assert.equal(nextNppCode('Miền Bắc', rows), 'NPP-MB-073');
  assert.equal(nextNppCode('Miền Nam', rows), 'NPP-MN-001');
  assert.equal(validateNppCode('NPP-MB-060', 'Miền Bắc'), true);
  assert.equal(validateNppCode('NPP-MT-060', 'Miền Bắc'), false);
  assert.equal(validateNppCode('NPP-MB-000', 'Miền Bắc'), false);
});

test('incomplete repairs identify missing fields without requiring SLA or photos', () => {
  const fields = repairMissingFields({ productCategory: 'Máy lắc', serialNumber: 'AUTO-1', fieldVisitStatus: 'completed' });
  assert.ok(fields.includes('Số seri thiết bị'));
  assert.ok(fields.includes('Diễn giải lỗi'));
  assert.ok(fields.includes('Checklist công tác'));
  assert.ok(!fields.some(field => /SLA|Ảnh/.test(field)));
});

test('route validation rejects missing/invalid coordinates instead of reporting zero km', async () => {
  assert.equal(parseCoordinates(','), null);
  assert.equal(parseCoordinates('91,100'), null);
  assert.deepEqual(parseCoordinates('21,105'), [21,105]);
  await assert.rejects(calculateRoadRoute([21,105], [{ locationCoordinates: '' }], () => assert.fail('must not transmit invalid coordinates')));
});

test('road estimates preserve stop order and accumulate duration and distance', async () => {
  const result = await calculateRoadRoute([21,105], [{ id: 'A', name: 'A', locationCoordinates: '22,106' }, { id: 'B', name: 'B', locationCoordinates: '23,107' }], async url => {
    assert.ok(url.startsWith('https://router.project-osrm.org/route/v1/driving/105,21;106,22;107,23'));
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 3000, duration: 180, legs: [{ distance: 1000, duration: 60 }, { distance: 2000, duration: 120 }] }] }) };
  });
  assert.equal(result.km, 3);
  assert.equal(result.minutes, 3);
  assert.equal(result.legs[1].cumulativeKm, 3);
  assert.equal(result.legs[0].id, 'A');
});
