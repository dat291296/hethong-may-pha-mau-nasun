import test from 'node:test';
import assert from 'node:assert/strict';
import { persistMutation, persistQueueReplacement } from '../src/lib/durableMutation.js';

test('permission and validation failures never become queued successes', async () => {
  for (const error of [{ code: '42501', message: 'permission denied' }, { code: '23505', message: 'duplicate key' }]) {
    let queued = false;
    await assert.rejects(persistMutation({ online: true, write: async () => ({ error }), queue: async () => { queued = true; } }));
    assert.equal(queued, false);
  }
});

test('replacement failure preserves the previous edit and successful commit precedes removal', async () => {
  const stored = new Map([['old', { note: 'preserved edit' }]]);
  const remove = async id => { stored.delete(id); return true; };
  await assert.rejects(persistQueueReplacement({ save: async () => false, remove, newItem: { id: 'new' }, previousId: 'old' }), /PERSIST_FAILED/);
  assert.deepEqual(stored.get('old'), { note: 'preserved edit' });
  await persistQueueReplacement({ save: async item => { stored.set(item.id, item); return true; },
    remove: async id => { assert.ok(stored.has('new')); return remove(id); }, newItem: { id: 'new', note: 'updated edit' }, previousId: 'old' });
  assert.equal(stored.has('old'), false);
  assert.equal(stored.get('new').note, 'updated edit');
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
