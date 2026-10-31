import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_TABLES, assetColumns, assetCacheKey, cachedAssetSnapshot, createAssetRefreshQueue } from '../src/modules/equipment/lib/assetQuery.js';
import { summarizeInventory } from '../src/modules/equipment/lib/inventorySummary.js';
import { fetchAllRows } from '../src/shared/data-access/paginatedQuery.js';

test('dashboard projections retain inventory identities and defer heavy editable fields', async () => {
  for (const table of ASSET_TABLES) {
    const summary = assetColumns(table).split(',');
    const full = assetColumns(table, true).split(',');
    assert.ok(summary.every(column => full.includes(column)));
    assert.equal(new Set(full).size, full.length);
    assert.ok(!full.includes('*'));
    if (table !== 'system_sets') {
      for (const key of ['id', 'is_assigned', 'set_code', 'status', 'serial']) assert.ok(summary.includes(key));
    }
  }
  for (const field of ['notes', 'installation_photos']) {
    assert.ok(!assetColumns('system_sets').split(',').includes(field));
    assert.ok(assetColumns('system_sets', true).split(',').includes(field));
  }
  for (const field of ['os', 'specs', 'network', 'stabilizer']) {
    assert.ok(!assetColumns('computers').split(',').includes(field));
    assert.ok(assetColumns('computers', true).split(',').includes(field));
  }
  const calls = [];
  const data = [{ set_code: 'SET-1', status: 'TRONG_KHO' }];
  const result = await fetchAllRows(client => client.from('system_sets').select(assetColumns('system_sets'), { count: 'exact' }).order('set_code'), async build => {
    const query = { select(columns) { calls.push(columns); return this; }, order() { return this; }, range() { return this; } };
    build({ from(table) { assert.equal(table, 'system_sets'); return query; } });
    return { data, count: 1 };
  }, 'summary', { key: 'set_code' });
  assert.deepEqual(result.data, data);
  assert.deepEqual(calls, [assetColumns('system_sets')]);
});

test('lightweight device indices preserve loose-stock totals and reference exclusions', () => {
  const systemSets = [{ setCode: 'SET-1', status: 'TRONG_KHO', dispenserId: 'd1' }];
  const devices = Object.fromEntries(['dispensers', 'mixers', 'computers', 'printers'].map(table => [table, [
    { id: table === 'dispensers' ? 'd1' : `${table}-1`, isAssigned: false, setCode: null, specs: 'Heavy content' },
    { id: `${table}-2`, isAssigned: false, setCode: null },
    { id: `${table}-3`, isAssigned: true, setCode: 'OTHER' },
  ]]));
  const indices = Object.fromEntries(Object.entries(devices).map(([table, rows]) => [table, rows.map(({ id, isAssigned, setCode }) => ({ id, isAssigned, setCode }))]));
  const full = summarizeInventory({ systemSets, ...devices });
  const summary = summarizeInventory({ systemSets, ...indices });
  assert.equal(summary.totalReadySets, full.totalReadySets);
  assert.equal(summary.totalSets, full.totalSets);
  assert.equal(summary.completeFromLooseDevices, 1);
});

test('summary caches cannot replace full editing data or revive deleted records', () => {
  assert.notEqual(assetCacheKey('system_sets', false), assetCacheKey('system_sets', true));
  const full = [{ setCode: 'OLD', notes: 'Keep notes', installationPhotos: ['private-image'] }];
  assert.deepEqual(cachedAssetSnapshot(full, { fullSnapshot: false, rows: [] }), { rows: [], details: false });
  const rows = [{ setCode: 'NEW', updatedAt: '2026-10-30T00:00:00Z' }];
  assert.deepEqual(cachedAssetSnapshot(full, { fullSnapshot: false, rows }), { rows, details: false });
  assert.deepEqual(cachedAssetSnapshot(full, { fullSnapshot: true }), { rows: full, details: true });
  assert.deepEqual(cachedAssetSnapshot(full, null), { rows: full, details: true });
  assert.equal(full[0].notes, 'Keep notes');
  assert.throws(() => assetColumns('users'), /UNKNOWN_ASSET_TABLE/);
});

test('concurrent table refreshes merge changes and every caller awaits the final batch', async () => {
  let release;
  const firstBatch = new Promise(resolve => { release = resolve; });
  const batches = [];
  const refresh = createAssetRefreshQueue(async tables => {
    batches.push(tables);
    if (batches.length === 1) await firstBatch;
    return true;
  });
  const first = refresh(['dispensers']);
  const second = refresh(['mixers', 'system_sets']);
  const third = refresh(['mixers']);
  assert.equal(second, first);
  assert.equal(third, first);
  release();
  assert.equal(await second, true);
  assert.deepEqual(batches, [['dispensers'], ['mixers', 'system_sets']]);
});

test('failed batches block checkpoint acknowledgement and a later refresh can recover', async () => {
  let calls = 0;
  const refresh = createAssetRefreshQueue(async () => ++calls !== 1);
  assert.equal(await refresh(['system_sets']), false);
  assert.equal(await refresh(['system_sets']), true);
});
