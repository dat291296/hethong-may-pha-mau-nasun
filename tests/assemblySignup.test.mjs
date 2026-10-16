import test from 'node:test';
import assert from 'node:assert/strict';
import { assignedSetsForNpp, assertAdditionalSetConfirmed } from '../src/lib/assemblyGuard.js';
import { registerEmailAccount } from '../src/security/authEmailFlows.js';
import { getAuthErrorMessage } from '../src/security/authFeedback.js';

test('assembly requires explicit confirmation only when the selected NPP already has sets', () => {
  const sets = [{ nppId: 'NPP-1', setCode: 'SET-001' }, { npp_id: 'NPP-1', set_code: 'SET-002' }];
  assert.equal(assignedSetsForNpp(sets, 'NPP-1').length, 2);
  assert.throws(() => assertAdditionalSetConfirmed(sets, 'NPP-1', false), /SET-001, SET-002/);
  assert.doesNotThrow(() => assertAdditionalSetConfirmed(sets, 'NPP-1', true));
  assert.doesNotThrow(() => assertAdditionalSetConfirmed(sets, 'NPP-2', false));
  assert.deepEqual(assignedSetsForNpp([{ nppId: '' }], ''), []);
});

test('signup bounds waiting without retrying or claiming an uncertain request succeeded', async () => {
  let calls = 0;
  await assert.rejects(registerEmailAccount({ signUp: () => { calls++; return new Promise(() => {}); } }, { email: 'test@example.com' }, 5), { code: 'AUTH_RESPONSE_TIMEOUT' });
  assert.equal(calls, 1);
  assert.match(getAuthErrorMessage({ status: 504 }), /Máy chủ chưa xác nhận/);
  const data = await registerEmailAccount({ signUp: async input => ({ data: { email: input.email }, error: null }) }, { email: ' TEST@EXAMPLE.COM ' });
  assert.equal(data.email, 'test@example.com');
  await assert.rejects(registerEmailAccount({ signUp: async () => ({ error: Object.assign(new Error('timeout'), { status: 504 }) }) }, { email: 'test@example.com' }), { status: 504 });
});
