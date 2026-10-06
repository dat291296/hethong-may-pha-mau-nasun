import test from 'node:test';
import assert from 'node:assert/strict';
import { persistMutation } from '../src/lib/durableMutation.js';

test('permission and validation failures never become queued successes', async () => {
  for (const error of [{ code: '42501', message: 'permission denied' }, { code: '23505', message: 'duplicate key' }]) {
    let queued = false;
    await assert.rejects(persistMutation({ online: true, write: async () => ({ error }), queue: async () => { queued = true; } }));
    assert.equal(queued, false);
  }
});

test('zero affected rows report a rejected write', async () => {
  await assert.rejects(persistMutation({ online: true, write: async () => ({ data: [], error: null }), queue: async () => assert.fail('must not queue') }), { code: 'PERSISTENCE_DENIED' });
});

test('offline success waits for durable queue completion', async () => {
  let finish;
  let complete = false;
  const pending = persistMutation({ online: false, write: async () => assert.fail('must not write'), queue: () => new Promise(resolve => { finish = resolve; }) }).then(result => { complete = true; return result; });
  await Promise.resolve();
  assert.equal(complete, false);
  finish();
  assert.deepEqual(await pending, { queued: true });
});

test('queue storage failure propagates to the caller', async () => {
  await assert.rejects(persistMutation({ online: false, queue: async () => { throw new Error('QUOTA_EXCEEDED'); } }), /QUOTA_EXCEEDED/);
});

test('network timeout queues while successful writes do not', async () => {
  let queued = 0;
  const queue = async () => { queued++; };
  assert.deepEqual(await persistMutation({ online: true, write: async () => ({ error: { code: 'QUERY_TIMEOUT' } }), queue }), { queued: true });
  assert.equal(queued, 1);
  const result = await persistMutation({ online: true, write: async () => ({ data: [{ id: 'npp-1' }], error: null }), queue });
  assert.equal(result.queued, false);
  assert.equal(queued, 1);
});
