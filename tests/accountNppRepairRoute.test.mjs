import test from 'node:test';
import assert from 'node:assert/strict';
import { nextNppCode, validateNppCode } from '../src/modules/distributors/lib/nppCodes.js';
import { repairMissingFields } from '../src/modules/repairs/lib/repairCompleteness.js';
import { parseCoordinates, calculateRoadRoute } from '../src/modules/fieldwork/lib/routeEstimate.js';

test('NPP code suggestions respect region sequences and allow manual numbered codes', () => {
  const rows = [{ id: 'NPP-MB-060' }, { id: 'uuid', code: 'NPP-MB-072' }, { id: 'NPP-MT-010' }];
  assert.equal(nextNppCode('Miền Bắc', rows), 'NPP-MB-073');
  assert.equal(nextNppCode('Miền Nam', rows), 'NPP-MN-001');
  assert.equal(validateNppCode('NPP-MB-060', 'Miền Bắc'), true);
  assert.equal(validateNppCode('NPP-MT-060', 'Miền Bắc'), false);
  assert.equal(validateNppCode('NPP-MB-000', 'Miền Bắc'), false);
});

test('repair tickets do not require a device serial, SLA, or photos', () => {
  const fields = repairMissingFields({ productCategory: 'Máy lắc', serialNumber: 'AUTO-1', fieldVisitStatus: 'completed' });
  assert.ok(!fields.includes('Số seri thiết bị'));
  assert.ok(!repairMissingFields({ productCategory: 'Máy tính', serialNumber: '', fieldVisitStatus: 'scheduled' }).includes('Số seri thiết bị'));
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

import { distanceKm, routeIdentity, calculateRoadMatrix, buildRoutePlan, suggestRouteOrder, validRoadMatrix } from '../src/modules/fieldwork/lib/routeEstimate.js';
const origin = [0, 0];
const stops = [{ id: 'A', name: 'A', locationCoordinates: '0,2' }, { id: 'B', name: 'B', locationCoordinates: '0,1' }];

test('offline distances include GPS to the first NPP, independent and cumulative distances', () => {
  const plan = buildRoutePlan(origin, stops);
  assert.equal(plan.road, false);
  assert.ok(plan.legs[0].km > 220);
  assert.equal(plan.km, plan.legs[0].km + plan.legs[1].km);
  assert.ok(plan.legs[1].directKm < plan.legs[1].cumulativeKm);
  assert.equal(plan.minutes, null);
  assert.equal(buildRoutePlan(null, stops).km, null);
  assert.equal(buildRoutePlan(origin, [{ id: 'missing', locationCoordinates: '' }, stops[0]]).km, null);
  assert.equal(distanceKm([0, 0], [0, 0]), 0);
});

test('suggestions start at GPS, need no fixed endpoint and never worsen the original route', () => {
  assert.deepEqual(suggestRouteOrder(origin, stops).map(stop => stop.id), ['B', 'A']);
  const original = buildRoutePlan(origin, stops).km;
  const suggestion = suggestRouteOrder(origin, stops);
  assert.ok(buildRoutePlan(origin, suggestion).km <= original);
  assert.equal(stops[0].id, 'A');
  assert.throws(() => suggestRouteOrder(null, stops));
  assert.throws(() => suggestRouteOrder(origin, [{ id: 'missing' }]));
});

test('road matrix distinguishes direct distance from route legs and survives order changes', async () => {
  const matrix = await calculateRoadMatrix(origin, stops, async (url, options) => {
    assert.match(url, /table\/v1\/driving\/0,0;2,0;1,0\?annotations=distance,duration/);
    assert.equal(options.credentials, 'omit');
    return { ok: true, json: async () => ({ code: 'Ok', distances: [[0, 2000, 1000], [3000, 0, 4000], [1500, 500, 0]], durations: [[0, 200, 100], [300, 0, 400], [150, 50, 0]] }) };
  });
  const plan = buildRoutePlan(origin, stops, matrix);
  assert.equal(plan.road, true);
  assert.equal(plan.km, 6);
  assert.equal(plan.legs[1].directKm, 1);
  assert.equal(plan.legs[1].km, 4);
  const better = suggestRouteOrder(origin, stops, matrix);
  assert.deepEqual(better.map(stop => stop.id), ['B', 'A']);
  assert.equal(buildRoutePlan(origin, better, matrix).km, 1.5);
  assert.equal(validRoadMatrix(matrix, [0, 0.1], stops), false);
  assert.equal(validRoadMatrix(matrix, origin, [{ ...stops[0], locationCoordinates: '1,2' }, stops[1]]), false);
  assert.equal(routeIdentity(origin, stops), routeIdentity(origin, [...stops].reverse()));
});

test('unreachable roads stay unknown instead of becoming zero distance', () => {
  const matrix = { key: routeIdentity(origin, stops), ids: ['A', 'B'], distances: [[0, 1000, null], [1000, 0, null], [null, null, 0]], durations: [[0, 60, null], [60, 0, null], [null, null, 0]] };
  const plan = buildRoutePlan(origin, stops, matrix);
  assert.equal(plan.km, null);
  assert.equal(plan.legs[1].directKm, null);
  assert.throws(() => suggestRouteOrder(origin, stops, matrix));
});

test('invalid matrix and excess stops cannot become a road estimate', async () => {
  await assert.rejects(calculateRoadMatrix(origin, Array.from({ length: 26 }, (_, id) => ({ id, locationCoordinates: '0,1' })), () => assert.fail('must not call network')));
  await assert.rejects(calculateRoadMatrix(origin, stops, async () => ({ ok: true, json: async () => ({ code: 'Ok', distances: [[-1]], durations: [] }) })));
});
