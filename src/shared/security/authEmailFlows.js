function requireAuthClient(authClient) {
  if (!authClient) throw new Error('AUTH_CLIENT_REQUIRED');
  return authClient;
}

function normalizeEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) throw new Error('VALID_EMAIL_REQUIRED');
  return normalized;
}

export async function waitForAuthResponse(operation, timeoutMs = 25000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('Authentication response timed out'), { code: 'AUTH_RESPONSE_TIMEOUT' })), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function signInEmailAccount(authClient, credentials, timeoutMs = 25000) {
  const auth = requireAuthClient(authClient);
  const result = await waitForAuthResponse(() => auth.signInWithPassword({ ...credentials, email: normalizeEmail(credentials.email) }), timeoutMs);
  if (result.error) throw result.error;
  return result.data;
}

export async function registerEmailAccount(authClient, credentials, timeoutMs = 25000) {
  const auth = requireAuthClient(authClient);
  const result = await waitForAuthResponse(() => auth.signUp({ ...credentials, email: normalizeEmail(credentials.email) }), timeoutMs);
  if (result.error) throw result.error;
  return result.data;
}

export async function resendSignupVerification(authClient, email, emailRedirectTo, timeoutMs = 25000) {
  const auth = requireAuthClient(authClient);
  const result = await waitForAuthResponse(() => auth.resend({
    type: 'signup',
    email: normalizeEmail(email),
    options: { emailRedirectTo },
  }), timeoutMs);
  if (result.error) throw result.error;
  return result.data;
}

export async function requestPasswordRecovery(authClient, email, redirectTo, timeoutMs = 25000) {
  const auth = requireAuthClient(authClient);
  const result = await waitForAuthResponse(() => auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo }), timeoutMs);
  if (result.error) throw result.error;
  return result.data;
}

export async function verifyRecoveryMfa(authClient, factorId, code, timeoutMs = 25000) {
  if (!factorId || !/^\d{6}$/.test(code)) {
    throw Object.assign(new Error('Invalid MFA code'), { code: 'mfa_verification_failed' });
  }
  const result = await waitForAuthResponse(() => requireAuthClient(authClient).mfa.challengeAndVerify({ factorId, code }), timeoutMs);
  if (result.error) throw result.error;
  return result.data;
}

export async function completePasswordRecovery(authClient, password, timeoutMs = 25000) {
  const auth = requireAuthClient(authClient);
  const result = await waitForAuthResponse(() => auth.updateUser({ password }), timeoutMs);
  if (result.error?.code === 'insufficient_aal') {
    const factors = await waitForAuthResponse(() => auth.mfa.listFactors(), timeoutMs);
    if (factors.error) throw factors.error;
    const available = (factors.data?.totp || []).filter(factor => factor.status === 'verified');
    throw Object.assign(new Error('Recovery requires MFA'), {
      code: available.length ? 'RECOVERY_MFA_REQUIRED' : 'RECOVERY_MFA_UNAVAILABLE',
      factors: available.map(({ id, friendly_name }) => ({ id, friendly_name })),
    });
  }
  if (result.error) throw result.error;
  return result.data;
}

// Await URL exchange before trusting a callback or exposing account actions.
export async function resolveEmailAuthSession(authClient, location, timeoutMs = 25000) {
  const auth = requireAuthClient(authClient);
  const result = await waitForAuthResponse(async () => {
    const initialized = await auth.initialize();
    if (initialized.error) throw initialized.error;
    // The SDK leaves the code in the URL when no matching PKCE verifier exists.
    if (new URLSearchParams(location.search).has('code')) {
      throw Object.assign(new Error('PKCE verifier unavailable'), { code: 'pkce_verifier_missing' });
    }
    return auth.getSession();
  }, timeoutMs);
  if (result.error) throw result.error;
  if (!result.data?.session) {
    throw Object.assign(new Error('Recovery session unavailable'), { code: 'session_not_found' });
  }
  return result.data.session;
}
