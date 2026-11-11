import test from 'node:test';
import assert from 'node:assert/strict';
import { completeEmailOtpPasswordRecovery, requestRecoveryEmailCode, verifyRecoveryEmailCode } from '../src/shared/security/authEmailFlows.js';

test('password recovery requests an email OTP without creating accounts', async () => {
  let request;
  const auth = {
    signInWithOtp: async value => { request = value; return { data: {}, error: null }; },
    resetPasswordForEmail: async () => { throw new Error('legacy recovery-link flow must not be used'); },
  };
  await requestRecoveryEmailCode(auth, ' Admin@Example.com ');
  assert.equal(request.email, 'admin@example.com');
  assert.equal(request.options.shouldCreateUser, false);
});

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


test('email OTP preserves configured code lengths and rejects malformed codes before sending', async () => {
  const requests = [];
  const auth = { verifyOtp: async request => { requests.push(request); return { data: { session: { access_token: 'synthetic' } } }; } };
  for (const token of ['012345', '01234567', '0123456789']) {
    await verifyRecoveryEmailCode(auth, 'admin@example.com', token);
    assert.deepEqual(requests.at(-1), { email: 'admin@example.com', token, type: 'email' });
  }
  for (const token of ['12345', '12345678901', '1234abcd']) {
    await assert.rejects(() => verifyRecoveryEmailCode(auth, 'admin@example.com', token), { code: 'email_otp_invalid' });
  }
  assert.equal(requests.length, 3);
});
