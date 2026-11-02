import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshScheduler } from '../src/shared/data-access/refreshScheduler.js';
import { queryWithDeadline } from '../src/shared/data-access/queryDeadline.js';
import { filterAssetSets, filterAssetDevices, indexRepairStatuses } from '../src/modules/equipment/lib/assetFilters.js';
import { pageWindow } from '../src/shared/data-access/pageWindow.js';

test('pagination clamps persisted pages after filters or acknowledged deletions shrink a collection', () => {
  const rows = Array.from({ length: 11 }, (_, id) => id);
  const before = pageWindow(rows.length, 2, 10);
  assert.deepEqual(rows.slice(before.start, before.end), [10]);
  const after = pageWindow(10, 2, 10);
  assert.equal(after.page, 1); assert.equal(after.start, 0); assert.equal(after.end, 10);
  assert.deepEqual(pageWindow(0, 999, 10), { page: 1, pages: 1, size: 10, start: 0, end: 0 });
  assert.equal(pageWindow(11, 'bad', 5000).page, 1);
});

function timers() {
  const jobs = new Map(); let id = 0;
  return { setTimer: fn => { jobs.set(++id, fn); return id; }, clearTimer: key => jobs.delete(key),
    count: () => jobs.size, async flush() { const work = [...jobs.values()]; jobs.clear(); await Promise.all(work.map(fn => fn())); } };
}
test('realtime bursts share one refresh and disposal cancels scheduled work', async () => {
  const clock = timers(); let calls = 0;
  const scheduler = createRefreshScheduler(async () => { calls++; }, clock);
  for (let count = 0; count < 100; count++) scheduler.schedule();
  assert.equal(clock.count(), 1);
  await clock.flush(); assert.equal(calls, 1);
  scheduler.schedule(); scheduler.dispose();
  await clock.flush(); assert.equal(calls, 1);
});
test('realtime events during a pending request produce a single trailing refresh', async () => {
  const clock = timers(); let release, calls = 0;
  const scheduler = createRefreshScheduler(async () => { if (++calls === 1) await new Promise(resolve => { release = resolve; }); }, clock);
  scheduler.schedule(); const pending = clock.flush();
  for (let count = 0; count < 50; count++) scheduler.schedule();
  assert.equal(calls, 1); release(); await pending;
  assert.equal(clock.count(), 1); await clock.flush(); assert.equal(calls, 2);
});
test('realtime failures are handled and later events can recover', async () => {
  const clock = timers(); let calls = 0, errors = 0;
  const scheduler = createRefreshScheduler(async () => { if (++calls === 1) throw Error('network'); }, { ...clock, onError: () => { errors++; } });
  scheduler.schedule(); await clock.flush();
  scheduler.schedule(); await clock.flush();
  assert.equal(errors, 1); assert.equal(calls, 2);
});
test('query deadline aborts its actual builder and treats a possible commit as uncertain', async () => {
  let signal;
  const builder = { abortSignal(value) { signal = value; return this; }, then(resolve) {
    signal.addEventListener('abort', () => resolve({ data: [{ id: 'late-server-commit' }], error: null }));
  } };
  const result = await queryWithDeadline({}, () => builder, { timeoutMs: 5 });
  assert.equal(signal.aborted, true);
  assert.equal(result.data, null); assert.equal(result.error.code, 'QUERY_TIMEOUT');
  assert.equal(result.error.outcomeUnknown, true);
});
test('deadline also releases an opaque promise while fast responses and synchronous failures remain intact', async () => {
  assert.equal((await queryWithDeadline({}, () => new Promise(() => {}), { timeoutMs: 5 })).error.code, 'QUERY_TIMEOUT');
  assert.deepEqual(await queryWithDeadline({}, () => Promise.resolve({ data: ['saved'], error: null })), { data: ['saved'], error: null });
  const failure = Error('invalid');
  assert.equal((await queryWithDeadline({}, () => { throw failure; })).error, failure);
});

const filters = { model: 'ALL', status: 'ALL', province: 'ALL', owner: 'ALL', search: '', quick: 'ALL', from: '', to: '' };
test('indexed repair filters retain NPP boundaries and unfinished versus awaiting-return semantics', () => {
  const sets = [ { setCode: 'S10', nppId: 'A', dispenserSerial: 'SERIAL', status: 'DA_LAP_DAT' },
    { setCode: 'S2', nppId: 'B', dispenserSerial: 'SERIAL', status: 'TRONG_KHO' } ];
  const tickets = [{ nppId: 'A', serialNumber: 'SERIAL', processingStatus: 'Chưa xử lý' }];
  const index = indexRepairStatuses(tickets);
  assert.deepEqual(filterAssetSets(sets, [], index, { ...filters, quick: 'PENDING' }, '2026-11-02').map(row => row.setCode), ['S10']);
  assert.deepEqual(filterAssetSets(sets, [], index, filters, '2026-11-02').map(row => row.setCode), ['S2', 'S10']);
  assert.deepEqual(filterAssetSets(sets, [], index, { ...filters, quick: 'STOCK' }, '2026-11-02').map(row => row.setCode), ['S2']);
  assert.deepEqual(tickets, [{ nppId: 'A', serialNumber: 'SERIAL', processingStatus: 'Chưa xử lý' }]);
});
test('asset filtering preserves phone search, fallback province, inclusive dates and input order', () => {
  const rows = [{ setCode: 'S10', nppId: 'A', installDate: '2026-11-02', nextMaintenanceDue: '2026-11-01' }, { setCode: 'S2', nppId: 'B' }];
  const result = filterAssetSets(rows, [{ id: 'A', phone: '0901234567', province: 'Đà Nẵng' }], new Map(),
    { ...filters, province: 'Đà Nẵng', search: '090123', from: '2026-11-02', to: '2026-11-02', quick: 'OVERDUE' }, '2026-11-02');
  assert.equal(result.length, 1); assert.equal(result[0].setCode, 'S10');
  assert.deepEqual(rows.map(row => row.setCode), ['S10', 'S2']);
});
test('stock filtering respects either assignment marker and sorts natural IDs without mutating inputs', () => {
  const rows = [{ id: 'PC10', type: 'Máy tính', status: 'Mới 100%', setCode: 'S1' }, { id: 'PC2', type: 'Máy tính' }];
  assert.deepEqual(filterAssetDevices(rows, 'may tinh', 'ALL', 'DEFAULT').map(row => row.id), ['PC2', 'PC10']);
  assert.deepEqual(filterAssetDevices(rows, '', 'FREE', 'DEFAULT').map(row => row.id), ['PC2']);
  assert.deepEqual(filterAssetDevices(rows, '', 'ASSIGNED', 'DEFAULT').map(row => row.id), ['PC10']);
  assert.deepEqual(rows.map(row => row.id), ['PC10', 'PC2']);
});
