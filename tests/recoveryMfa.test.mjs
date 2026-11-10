import test from 'node:test';
import assert from 'node:assert/strict';
import { completePasswordRecovery, verifyRecoveryMfa } from '../src/shared/security/authEmailFlows.js';
import { getAuthErrorMessage } from '../src/shared/security/authFeedback.js';

test('recovery exposes only verified TOTP factors when MFA is required', async () => {
  const auth = {
    getSession: async () => ({ data: { session: {} } }),
    refreshSession: async () => ({ data: { session: {} } }),
    updateUser: async () => ({ error: { code: 'insufficient_aal', status: 401 } }),
    mfa: { listFactors: async () => ({ data: { totp: [
      { id: 'verified', status: 'verified', friendly_name: 'Authenticator', secret: 'never expose' },
      { id: 'pending', status: 'unverified' },
    ] } }) },
  };
  await assert.rejects(() => completePasswordRecovery(auth, 'SyntheticPassword123'), error => {
    assert.equal(error.code, 'RECOVERY_MFA_REQUIRED');
    assert.deepEqual(error.factors, [{ id: 'verified', friendly_name: 'Authenticator' }]);
    return true;
  });
  auth.mfa.listFactors = async () => ({ data: { totp: [] } });
  await assert.rejects(() => completePasswordRecovery(auth, 'SyntheticPassword123'), { code: 'RECOVERY_MFA_UNAVAILABLE' });
  auth.mfa.listFactors = async () => ({ error: { code: 'session_not_found' } });
  await assert.rejects(() => completePasswordRecovery(auth, 'SyntheticPassword123'), { code: 'session_not_found' });
});

test('MFA verification raises assurance before retrying password update', async () => {
  let verified = false;
  const auth = {
    getSession: async () => ({ data: { session: {} } }),
    refreshSession: async () => ({ data: { session: {} } }),
    mfa: { challengeAndVerify: async payload => {
      assert.deepEqual(payload, { factorId: 'factor', code: '123456' });
      verified = true;
      return { data: { access_token: 'synthetic' } };
    } },
    updateUser: async () => { assert.equal(verified, true); return { data: { user: { id: 'synthetic' } } }; },
  };
  await verifyRecoveryMfa(auth, 'factor', '123456');
  assert.equal((await completePasswordRecovery(auth, 'SyntheticPassword123')).user.id, 'synthetic');
});

test('invalid, rejected, and stalled MFA codes do not succeed', async () => {
  const auth = { mfa: { challengeAndVerify: async () => { assert.fail('Invalid input must not reach the provider'); } } };
  for (const code of ['', '12345', 'abcdef', '1234567']) {
    await assert.rejects(() => verifyRecoveryMfa(auth, 'factor', code), { code: 'mfa_verification_failed' });
  }
  auth.mfa.challengeAndVerify = async () => ({ error: { code: 'mfa_verification_failed' } });
  await assert.rejects(() => verifyRecoveryMfa(auth, 'factor', '123456'), { code: 'mfa_verification_failed' });
  auth.mfa.challengeAndVerify = () => new Promise(() => {});
  await assert.rejects(() => verifyRecoveryMfa(auth, 'factor', '123456', 5), { code: 'AUTH_RESPONSE_TIMEOUT' });
});

test('MFA recovery errors provide actionable feedback', () => {
  assert.match(getAuthErrorMessage({ code: 'insufficient_aal', status: 401 }, 'update-password'), /hai lớp/);
  assert.match(getAuthErrorMessage({ code: 'RECOVERY_MFA_REQUIRED' }, 'update-password'), /6 số/);
  assert.match(getAuthErrorMessage({ code: 'RECOVERY_MFA_UNAVAILABLE' }, 'update-password'), /quản trị viên/);
  assert.match(getAuthErrorMessage({ code: 'mfa_verification_failed' }, 'update-password'), /Mã xác thực/);
});
