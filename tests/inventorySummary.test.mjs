import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeInventory, nextWarehouseId, inventoryLinkIssues } from '../src/lib/inventorySummary.js';

test('dashboard and warehouse include equivalent loose sets without double counting assembled stock', () => {
  const devices = Object.fromEntries(['dispensers', 'mixers', 'computers', 'printers'].map(table => [table, Array.from({ length: 23 }, (_, i) => ({ id: `${table}-${i}` }))]));
  const inventory = summarizeInventory({ ...devices, systemSets: [{ setCode: 'S1', status: 'TRONG_KHO' }, { setCode: 'S2', status: 'DA_LAP_DAT' }] });
  assert.equal(inventory.totalReadySets, 24);
  assert.equal(inventory.totalSets, 25);
  assert.equal(inventory.loose.computers.length, 0);
});

test('explicit set references and either assignment marker exclude equipment from loose stock', () => {
  const inventory = summarizeInventory({ systemSets: [{ computerId: 'C1' }], computers: [{ id: 'C1' }, { id: 'C2', isAssigned: true }, { id: 'C3', setCode: 'S3' }, { id: 'C4' }] });
  assert.deepEqual(inventory.stock.computers.map(row => row.id), ['C4']);
  assert.equal(inventory.totalReadySets, 0);
});

test('new category code respects legacy prefixes, short numeric IDs and sequences above 999', () => {
  assert.equal(nextWarehouseId('computer', [{ id: 'COMP-061' }, { id: 'MIXE-076' }, { id: 'COMP-03' }]), 'COMP-077');
  assert.equal(nextWarehouseId('computer', [{ id: '1000' }, { id: 'unrelated-99999' }]), 'COMP-1001');
  assert.equal(nextWarehouseId('printer'), 'PRIN-001');
});

test('audit exposes conflicting links and missing referenced devices without modifying records', () => {
  const data = { systemSets: [{ setCode: 'S1', computerId: 'C1', printerId: 'P1' }], computers: [{ id: 'C1', isAssigned: false }, { id: 'C2', setCode: 'S1' }] };
  const before = JSON.stringify(data);
  const issues = inventoryLinkIssues(data);
  assert.equal(issues.length, 3);
  assert.ok(issues.some(issue => issue.includes('C2') && issue.includes('C1')));
  assert.equal(JSON.stringify(data), before);
});
