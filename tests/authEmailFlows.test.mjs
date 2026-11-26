import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveEmailAuthSession,
  signInEmailAccount,
  registerEmailAccount,
  completePasswordRecovery,
  requestPasswordRecovery,
  resendSignupVerification,
} from '../src/shared/security/authEmailFlows.js';

test('every email auth operation releases the UI when the provider never responds', async () => {
  const hanging = () => new Promise(() => {});
  const auth = { signInWithPassword: hanging, signUp: hanging, resend: hanging, resetPasswordForEmail: hanging, updateUser: hanging };
  const credentials = { email: 'user@example.com', password: 'SyntheticPassword123' };
  for (const action of [
    () => signInEmailAccount(auth, credentials, 5),
    () => registerEmailAccount(auth, credentials, 5),
    () => resendSignupVerification(auth, credentials.email, 'https://app.example', 5),
    () => requestPasswordRecovery(auth, credentials.email, 'https://app.example', 5),
    () => completePasswordRecovery(auth, credentials.password, 5),
  ]) await assert.rejects(action, { code: 'AUTH_RESPONSE_TIMEOUT' });
});

test('verification email flow sends normalized email and redirect URL', async () => {
  let payload;
  const auth = { resend: async value => { payload = value; return { data: { sent: true }, error: null }; } };
  const result = await resendSignupVerification(auth, ' User@Example.COM ', 'https://app.example/verify');
  assert.deepEqual(payload, {
    type: 'signup',
    email: 'user@example.com',
    options: { emailRedirectTo: 'https://app.example/verify' },
  });
  assert.equal(result.sent, true);
});

test('password recovery sends normalized email and redirect URL', async () => {
  let email;
  let options;
  const auth = { resetPasswordForEmail: async (value, config) => { email = value; options = config; return { data: {}, error: null }; } };
  await requestPasswordRecovery(auth, ' Admin@Example.COM ', 'https://app.example/recovery');
  assert.equal(email, 'admin@example.com');
  assert.deepEqual(options, { redirectTo: 'https://app.example/recovery' });
});

test('password recovery updates the password and propagates provider errors', async () => {
  let payload;
  const successAuth = { updateUser: async value => { payload = value; return { data: { user: {} }, error: null }; } };
  await completePasswordRecovery(successAuth, 'SecurePassword123');
  assert.deepEqual(payload, { password: 'SecurePassword123' });

  const providerError = new Error('expired link');
  const failedAuth = { updateUser: async () => ({ data: null, error: providerError }) };
  await assert.rejects(() => completePasswordRecovery(failedAuth, 'SecurePassword123'), providerError);
});

test('email callback waits for exchange before reading the session', async () => {
  const location = { search: '?recovery=true&code=synthetic' };
  let initialized = false;
  const session = { user: { id: 'synthetic' } };
  const auth = {
    initialize: async () => { await Promise.resolve(); initialized = true; location.search = '?recovery=true'; return { error: null }; },
    getSession: async () => { assert.equal(initialized, true); return { data: { session }, error: null }; },
  };
  assert.equal(await resolveEmailAuthSession(auth, location), session);
});

test('missing PKCE verifier cannot reuse an unrelated existing session', async () => {
  const auth = {
    initialize: async () => ({ error: null }),
    getSession: async () => { assert.fail('Must not use an existing session'); },
  };
  await assert.rejects(() => resolveEmailAuthSession(auth, { search: '?recovery=true&code=synthetic' }), { code: 'pkce_verifier_missing' });
});

test('callback rejects missing sessions and propagates exchange errors', async () => {
  const auth = {
    initialize: async () => ({ error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
  };
  await assert.rejects(() => resolveEmailAuthSession(auth, { search: '?recovery=true' }), { code: 'session_not_found' });
  auth.initialize = async () => ({ error: { code: 'flow_state_expired' } });
  await assert.rejects(() => resolveEmailAuthSession(auth, { search: '?verified=true' }), { code: 'flow_state_expired' });
  auth.initialize = () => new Promise(() => {});
  await assert.rejects(() => resolveEmailAuthSession(auth, { search: '' }, 5), { code: 'AUTH_RESPONSE_TIMEOUT' });
});
