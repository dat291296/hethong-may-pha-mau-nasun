import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completePasswordRecovery,
  requestPasswordRecovery,
  resendSignupVerification,
} from '../src/security/authEmailFlows.js';

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
