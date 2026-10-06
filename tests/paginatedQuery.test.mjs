import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows } from '../src/lib/paginatedQuery.js';

function query() { return { range: (from, to) => ({ from, to }) }; }

test('retrieves more than 1000 rows even when API caps pages below requested size', async () => {
  const records = Array.from({ length: 1603 }, (_, id) => ({ id: `record-${id}` }));
  const result = await fetchAllRows(query, async build => {
    const { from, to } = build();
    return { data: records.slice(from, Math.min(to + 1, from + 200)), count: records.length, error: null };
  }, 'large-table');
  assert.deepEqual(result.data, records);
});

test('later-page failures never return a partial authoritative dataset', async () => {
  const result = await fetchAllRows(query, async build => build().from === 0
    ? { data: [{ id: 'one' }], count: 2 }
    : { error: new Error('Network failure') }, 'failed-page');
  assert.equal(result.data, null);
  assert.match(result.error.message, /Network/);
});

test('detects changing totals and repeated rows between pages', async () => {
  for (const nextPage of [{ data: [{ id: 'two' }], count: 3 }, { data: [{ id: 'one' }], count: 2 }]) {
    const result = await fetchAllRows(query, async build => build().from === 0
      ? { data: [{ id: 'one' }], count: 2 } : nextPage, 'unstable');
    assert.equal(result.data, null);
    assert.equal(result.error.code, 'INCOMPLETE_QUERY');
  }
});

test('empty tables are authoritative and premature empty pages are rejected', async () => {
  assert.deepEqual(await fetchAllRows(query, async () => ({ data: [], count: 0 }), 'empty'), { data: [], error: null });
  const incomplete = await fetchAllRows(query, async () => ({ data: [], count: 3 }), 'incomplete');
  assert.equal(incomplete.data, null);
  assert.match(incomplete.error.message, /INCOMPLETE/);
});

test('supports system set keys without renaming or filtering historical records', async () => {
  const records = [{ set_code: 'SET-2024-001' }, { set_code: 'SET-2023-005' }];
  const result = await fetchAllRows(query, async () => ({ data: records, count: 2 }), 'sets', { key: 'set_code' });
  assert.deepEqual(result.data, records);
});
