import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthEventScheduler } from '../src/security/authEventScheduler.js';

test('auth listener returns synchronously and releases the lock before API calls', async () => {
  let locked = true;
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const scheduler = createAuthEventScheduler(async () => {
    assert.equal(locked, false, 'Calling APIs under the auth lock would deadlock');
    finish();
  }, error => { throw error; });
  assert.equal(scheduler.listener('SIGNED_IN', { user: { id: 'synthetic' } }), undefined);
  locked = false;
  await finished;
  scheduler.dispose();
});

test('auth events retain ordering and disposed listeners do not run queued work', async () => {
  const events = [];
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const scheduler = createAuthEventScheduler(async event => {
    events.push(event);
    if (events.length === 2) finish();
  }, error => { throw error; });
  scheduler.listener('SIGNED_IN', {});
  scheduler.listener('SIGNED_OUT', null);
  await finished;
  scheduler.listener('IGNORED_AFTER_DISPOSE', null);
  scheduler.dispose();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(events, ['SIGNED_IN', 'SIGNED_OUT']);
});
