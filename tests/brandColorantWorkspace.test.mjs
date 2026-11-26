import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeBrand, scopeWorkspace } from '../src/shared/workspace/regionalWorkspace.js';
import { COLORANTS, colorantDevice, supportsColorantSlots, validColorantSlots } from '../src/modules/equipment/lib/colorantSlots.js';

test('a replacement selects its own layout and a transferred dispenser keeps its layout', () => {
  const old = { id: 'A', serial: 'SN01', setCode: 'S2', colorantSlots: Object.keys(COLORANTS) };
  const incoming = { id: 'B', serial: 'SN02', setCode: 'S1' };
  const fleet = [old, incoming];
  const originalSite = { setCode: 'S1', dispenserId: 'B', dispenserSerial: 'SN02' };
  assert.equal(colorantDevice(originalSite, fleet), incoming);
  assert.equal(colorantDevice({ setCode: 'S2', dispenserId: 'A', dispenserSerial: 'SN01' }, fleet), old);
  assert.equal(colorantDevice({ ...originalSite, dispenserSerial: 'SN01' }, fleet), null);
  assert.equal(colorantDevice(originalSite, [...fleet, { id: 'C', serial: 'sn02' }]), null);
  assert.equal(colorantDevice(originalSite, [{ ...incoming, serial: 'AUTO-1' }]), null);
});

test('brand follows distributor, respects historical ticket owner and excludes common stock', () => {
  const data = {
    npps: [{ id: 'N1', brand: 'Nasun', region: 'Miền Bắc' }, { id: 'N2', brand: 'NATOS', region: 'Miền Nam' }],
    systemSets: [{ setCode: 'S1', nppId: 'N2', dispenserId: 'D1' }],
    dispensers: [{ id: 'D1', setCode: 'S1' }, { id: 'D2' }], mixers: [], computers: [], printers: [],
    repairTickets: [{ id: 'old', nppId: 'N1', setCode: 'S1' }, { id: 'current', nppId: 'N2' }],
    auditLogs: [], tintingLogs: [],
  };
  const result = scopeBrand(data, 'Natos');
  assert.deepEqual(result.dispensers.map(row => row.id), ['D1']);
  assert.deepEqual(result.repairTickets.map(row => row.id), ['current']);
  assert.equal(scopeWorkspace(result, 'Miền Bắc').repairTickets.length, 0);
  assert.equal(scopeBrand(data, 'ALL'), data);
});

test('only supported models accept complete permutations of the 14 codes', () => {
  for (const model of ['Satint A2', 'Santint A2-100']) assert.ok(supportsColorantSlots(model));
  assert.equal(supportsColorantSlots('Satint A20'), false);
  const codes = Object.keys(COLORANTS);
  assert.ok(validColorantSlots([...codes].reverse()));
  assert.equal(validColorantSlots(codes.slice(1)), false);
  assert.equal(validColorantSlots([...codes.slice(1), 'B']), false);
  assert.equal(validColorantSlots([...codes.slice(1), 'XX']), false);
});
