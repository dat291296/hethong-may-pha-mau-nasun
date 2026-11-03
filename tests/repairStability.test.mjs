import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRepairState } from '../src/modules/repairs/lib/repairState.js';
import { normalizeCalendarDate, normalizeOptionalTimestamp } from '../src/shared/utils/dateUtils.js';
import { userErrorMessage } from '../src/shared/security/userError.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(initialRows = [], persist) {
  const view = { owner: 'A', rows: initialRows, cached: null };
  const state = createRepairState({ initialRows, owner: () => view.owner,
    publish: rows => { view.rows = rows; },
    persist: persist || (async rows => { view.cached = structuredClone(rows); return true; }),
  });
  return { state, view };
}

test('concurrent repair changes serialize complete cache snapshots and survive reload', async () => {
  const firstWrite = deferred();
  let writes = 0, cached;
  const { state, view } = fixture([{ id: 'A', notes: 'before' }], async rows => {
    if (++writes === 1) await firstWrite.promise;
    cached = structuredClone(rows);
    return true;
  });
  const first = state.update(rows => [...rows, { id: 'B' }]);
  const second = state.update(rows => rows.map(row => row.id === 'A' ? { ...row, notes: 'after' } : row));
  const third = state.update(rows => [...rows, { id: 'C' }]);
  await Promise.resolve();
  assert.equal(writes, 1);
  assert.deepEqual(view.rows.map(row => row.id), ['A', 'B', 'C']);
  firstWrite.resolve();
  await Promise.all([first, second, third]);
  assert.deepEqual(cached, view.rows);
  const reopened = fixture();
  await reopened.state.acceptRead(reopened.state.captureRead(), cached, false);
  assert.deepEqual(reopened.view.rows, view.rows);
});

test('reads and delayed offline hydration cannot overwrite a repair mutation', async () => {
  const { state, view } = fixture([{ id: 'A', recordVersion: 1 }]);
  const before = state.captureRead();
  const write = state.beginWrite();
  const during = state.captureRead();
  assert.equal(await state.acceptRead(during, []), false);
  await state.update([{ id: 'A', recordVersion: 2 }], write.owner);
  write.finish();
  write.finish();
  assert.equal(await state.acceptRead(before, [], false), false);
  assert.equal(await state.acceptRead(during, []), false);
  assert.equal(view.rows[0].recordVersion, 2);
  assert.deepEqual(view.cached, view.rows);
  assert.equal(await state.acceptRead(state.captureRead(), view.rows), true);
});

test('failed cache writes retain acknowledged rows and block stale fallback until repaired', async () => {
  let fail = true, cached = [{ id: 'old' }];
  const { state, view } = fixture([], async rows => {
    if (fail) return false;
    cached = structuredClone(rows);
    return true;
  });
  await assert.rejects(state.update([{ id: 'saved' }]), { code: 'REPAIR_CACHE_WRITE_FAILED' });
  assert.equal(await state.acceptRead(state.captureRead(), cached, false), false);
  assert.deepEqual(view.rows, [{ id: 'saved' }]);
  await assert.rejects(state.flush(), { code: 'REPAIR_CACHE_WRITE_FAILED' });
  fail = false;
  await state.flush();
  assert.deepEqual(cached, view.rows);
  assert.equal(state.canCommit(state.captureRead()), true);
  assert.match(userErrorMessage({ code: 'REPAIR_CACHE_WRITE_FAILED' }), /không tạo lại phiếu/);
});

test('a rejected cache write does not poison subsequent snapshots', async () => {
  let writes = 0, cached;
  const { state, view } = fixture([], async rows => {
    if (++writes === 1) throw Error('quota');
    cached = rows;
    return true;
  });
  const first = state.update([{ id: 'A' }]);
  const second = state.update(rows => [...rows, { id: 'B' }]);
  await assert.rejects(first, /quota/);
  await second;
  assert.deepEqual(cached, view.rows);
  assert.equal(state.canCommit(state.captureRead()), true);
});

test('account switches discard late results without copying old repairs into the new cache', async () => {
  const gate = deferred();
  const writes = [];
  const { state, view } = fixture([], async rows => {
    writes.push({ owner: view.owner, rows });
    await gate.promise;
    return true;
  });
  const token = state.captureRead();
  const first = state.update([{ id: 'private-A' }], 'A');
  const queued = state.update(rows => [...rows, { id: 'queued-A' }], 'A');
  const results = Promise.allSettled([first, queued]);
  await Promise.resolve();
  view.owner = 'B';
  const next = state.captureRead();
  assert.deepEqual(view.rows, []);
  assert.equal(await state.acceptRead(token, [{ id: 'late-A' }]), false);
  gate.resolve();
  assert.deepEqual((await results).map(result => result.status), ['rejected', 'rejected']);
  await state.flush();
  assert.equal(writes.length, 1);
  assert.equal(await state.acceptRead(next, [{ id: 'private-B' }]), true);
  assert.equal(writes[1].owner, 'B');
  assert.deepEqual(writes[1].rows, [{ id: 'private-B' }]);
});

// Execute the real hook body with controlled hook slots and I/O. React does
// not render here; delayed acknowledgements exercise the production callbacks.
async function hookFixture(overrides = {}) {
  const slots = [];
  let cursor = 0;
  const view = { cached: [], online: true, owner: 'A' };
  const dependencies = {
    getOfflineOwner: () => view.owner,
    submitFieldCommand: async () => ({ queued: true }),
    recordOperationalError: () => {},
    normalizeCalendarDate, normalizeOptionalTimestamp, createRepairState,
    persistMutation: async options => options.write(),
    persistBatchMutation: async () => ({ queued: false }),
    fetchAllRows: async () => ({ data: [], error: null }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ||= { current: initial };
    },
    useCallback: fn => fn,
    useEffect: () => {},
    supabase: {}, isSupabaseConfigured: true,
    safeQuery: async () => ({ queued: false }),
    INITIAL_REPAIR_TICKETS: [],
    cacheOfflineData: async (_key, rows) => { view.cached = structuredClone(rows); return true; },
    getCachedOfflineData: async () => view.cached,
    enqueueOfflineAction: async () => {},
    getOfflineQueue: async () => [],
    triggerHaptic: () => {},
    navigator: { get onLine() { return view.online; } },
    crypto: globalThis.crypto,
    ...overrides,
  };
  const source = (await readFile(new URL('../src/modules/repairs/hooks/useRepairs.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(/export function /g, 'function ');
  const runHook = new Function(...Object.keys(dependencies), `${source}\nreturn useRepairs;`)(...Object.values(dependencies));
  return { view, render() { cursor = 0; return runHook(); } };
}

const ticket = id => ({ id, ticketCode: id, date: '2026-10-31', notes: 'before' });

test('real repair callbacks merge reverse-order acknowledgements without a React rerender', async () => {
  const a = deferred(), b = deferred();
  const f = await hookFixture({ submitFieldCommand: input => input.entityId === 'A' ? a.promise : b.promise });
  const hook = f.render();
  const first = hook.addTicket(ticket('A'));
  const second = hook.addTicket(ticket('B'));
  b.resolve({ queued: false, receipt: { version: 1 } });
  await second;
  a.resolve({ queued: false, receipt: { version: 1 } });
  await first;
  assert.deepEqual(f.render().repairTickets.map(row => row.id).sort(), ['A', 'B']);
  assert.deepEqual(f.view.cached, f.render().repairTickets);
});

test('real repair edits preserve another concurrent edit in both React and cache', async () => {
  const f = await hookFixture();
  const hook = f.render();
  await Promise.all([hook.addTicket(ticket('A')), hook.addTicket(ticket('B'))]);
  await Promise.all([
    hook.editTicket('A', { notes: 'edited-A', recordVersion: 0 }),
    hook.editTicket('B', { notes: 'edited-B', recordVersion: 0 }),
  ]);
  assert.deepEqual(f.view.cached.map(row => row.notes).sort(), ['edited-A', 'edited-B']);
  assert.deepEqual(f.view.cached, f.render().repairTickets);
});

test('real repair refresh drops server reads that precede an acknowledged create', async () => {
  const read = deferred(), started = deferred();
  const f = await hookFixture({ fetchAllRows: () => { started.resolve(); return read.promise; } });
  const hook = f.render();
  const pending = hook.refetch();
  await started.promise;
  await hook.addTicket(ticket('A'));
  read.resolve({ data: [], error: null });
  assert.equal(await pending, false);
  assert.equal(f.render().repairTickets[0].id, 'A');
  assert.deepEqual(f.view.cached, f.render().repairTickets);
});

test('real repair save waits for cache and surfaces failure without discarding acknowledged rows', async () => {
  const cache = deferred();
  const f = await hookFixture({ cacheOfflineData: () => cache.promise });
  let settled = false;
  const pending = f.render().addTicket(ticket('A'));
  pending.then(() => { settled = true; }, () => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  cache.resolve(false);
  await assert.rejects(pending, { code: 'REPAIR_CACHE_WRITE_FAILED' });
  assert.equal(f.render().repairTickets[0].id, 'A');
  assert.match(f.render().loadError, /không tạo lại phiếu/);
});

test('denied repair writes leave both visible rows and cache unchanged', async () => {
  const f = await hookFixture({ submitFieldCommand: async () => { throw Object.assign(Error('denied'), { code: '42501' }); } });
  await assert.rejects(f.render().addTicket(ticket('A')), { code: '42501' });
  assert.deepEqual(f.render().repairTickets, []);
  assert.deepEqual(f.view.cached, []);
});

test('repair deletion and concurrent creation keep the same complete cache snapshot', async () => {
  const deletion = deferred();
  const f = await hookFixture({ persistMutation: () => deletion.promise });
  const hook = f.render();
  await hook.addTicket(ticket('A'));
  const pending = hook.deleteTicket('A');
  await hook.addTicket(ticket('B'));
  deletion.resolve({ queued: true });
  await pending;
  assert.deepEqual(f.render().repairTickets.map(row => row.id), ['B']);
  assert.deepEqual(f.view.cached, f.render().repairTickets);
});

test('repair import releases the barrier before retrieving server-assigned versions', async () => {
  const f = await hookFixture({ fetchAllRows: async () => ({
    data: [{ id: 'A', ticket_code: 'A', record_version: 7 }], error: null,
  }) });
  await f.render().importTickets([ticket('A')]);
  assert.equal(f.render().repairTickets[0].recordVersion, 7);
  assert.deepEqual(f.view.cached, f.render().repairTickets);
});

test('late acknowledgement after an account change cannot publish or cache the old owner repair', async () => {
  const command = deferred();
  const f = await hookFixture({ submitFieldCommand: () => command.promise });
  const pending = f.render().addTicket(ticket('private-A'));
  f.view.owner = 'B';
  command.resolve({ queued: false, receipt: { version: 1 } });
  await assert.rejects(pending, { code: 'OFFLINE_OWNER_CHANGED' });
  assert.deepEqual(f.render().repairTickets, []);
  assert.deepEqual(f.view.cached, []);
});

test('a failed server write releases the barrier so subsequent refreshes can recover', async () => {
  const f = await hookFixture({
    submitFieldCommand: async () => { throw Object.assign(Error('timeout'), { code: 'QUERY_TIMEOUT' }); },
    fetchAllRows: async () => ({ data: [{ id: 'server-A', record_version: 2 }], error: null }),
  });
  await assert.rejects(f.render().addTicket(ticket('A')), { code: 'QUERY_TIMEOUT' });
  assert.equal(await f.render().refetch(), true);
  assert.equal(f.render().repairTickets[0].id, 'server-A');
  assert.deepEqual(f.view.cached, f.render().repairTickets);
});
