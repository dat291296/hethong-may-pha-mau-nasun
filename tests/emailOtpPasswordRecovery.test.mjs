import test from 'node:test';
import assert from 'node:assert/strict';
import { completeEmailOtpPasswordRecovery } from '../src/shared/security/authEmailFlows.js';

test('email OTP recovery calls the server gate with the verified user session', async () => {
  let invocation;
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-user-token' } } }) },
    functions: { invoke: async (...args) => { invocation = args; return { data: { success: true } }; } },
  };
  const result = await completeEmailOtpPasswordRecovery(client, 'StrongPassword123');
  assert.deepEqual(result, { success: true });
  assert.equal(invocation[0], 'password-recovery');
  assert.deepEqual(invocation[1].body, { password: 'StrongPassword123' });
  assert.equal(invocation[1].headers.Authorization, 'Bearer synthetic-user-token');
});

test('email OTP recovery rejects missing sessions, weak passwords, and unconfirmed updates', async () => {
  const client = {
    auth: { getSession: async () => ({ data: { session: null } }) },
    functions: { invoke: async () => ({ data: { success: true } }) },
  };
  await assert.rejects(() => completeEmailOtpPasswordRecovery(client, 'StrongPassword123'), { code: 'session_not_found' });
  client.auth.getSession = async () => ({ data: { session: { access_token: 'synthetic-user-token' } } });
  await assert.rejects(() => completeEmailOtpPasswordRecovery(client, 'weak'), { code: 'weak_password' });
  client.functions.invoke = async () => ({ data: { success: false } });
  await assert.rejects(() => completeEmailOtpPasswordRecovery(client, 'StrongPassword123'), { code: 'RECOVERY_UPDATE_UNCONFIRMED' });
});

