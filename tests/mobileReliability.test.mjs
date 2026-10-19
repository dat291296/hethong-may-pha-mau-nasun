import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { completedSyncState } from '../src/lib/syncPresentation.js';
import { nextWarehouseId } from '../src/lib/inventorySummary.js';
import { requireReplaySession } from '../src/security/replaySession.js';

test('a suspended auth lock times out before any queued write is allowed', async () => {
  let continued = false;
  const client = { auth: { getUser: () => new Promise(() => {}) }, rpc: () => { continued = true; } };
  await assert.rejects(requireReplaySession(client, 'owner', () => 'owner', async () => ({}), 5), { code: 'AUTH_RESPONSE_TIMEOUT' });
  assert.equal(continued, false);
});

test('deferred, review and session failures always leave the syncing presentation', () => {
  assert.deepEqual(completedSyncState(true, 0), { state: 'idle', message: '' });
  for (const [success, remaining] of [[false, 3], [false, 0], [true, 2]]) {
    const state = completedSyncState(success, remaining);
    assert.equal(state.state, 'error');
    assert.ok(state.message);
  }
  assert.equal(completedSyncState(false, 2, 'Session rejected').message, 'Session rejected');
});

test('corrected computer sequences continue after COMP-102', () => {
  const renamed = Array.from({ length: 16 }, (_, index) => ({ id: `COMP-${String(index + 87).padStart(3, '0')}` }));
  assert.equal(nextWarehouseId('computer', [{ id: 'COMP-086' }, ...renamed]), 'COMP-103');
});

test('assembly acknowledgement uses the real set primary key and preserves blank serials', async () => {
  const hook = await readFile(new URL('../src/hooks/useAssets.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(hook, /rpc\('assemble_system_set_atomic'/);
  assert.match(hook, /result.data\.setCode !== setCode/);
  assert.doesNotMatch(hook, /select\('id,set_code'\)/);
  for (const device of ['disp', 'mix', 'prn']) assert.ok(app.includes(`${device}?.serial || ''`));
});
