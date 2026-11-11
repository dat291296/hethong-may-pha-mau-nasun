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

export async function requestRecoveryEmailCode(authClient, email, timeoutMs = 25000) {
  const auth = requireAuthClient(authClient);
  const result = await waitForAuthResponse(() => auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: false, data: { flow: 'password_recovery' } },
  }), timeoutMs);
  if (result.error) throw result.error;
  return result.data;
}

export async function verifyRecoveryEmailCode(authClient, email, token, timeoutMs = 25000) {
  const auth = requireAuthClient(authClient);
  const normalized = normalizeEmail(email);
  if (!/^\d{6,10}$/.test(token)) throw Object.assign(new Error('Invalid email code'), { code: 'email_otp_invalid' });
  const result = await waitForAuthResponse(() => auth.verifyOtp({ email: normalized, token, type: 'email' }), timeoutMs);
  if (result.error) throw result.error;
  if (!result.data?.session) throw Object.assign(new Error('Recovery session unavailable'), { code: 'session_not_found' });
  return result.data;
}

export async function completeEmailOtpPasswordRecovery(supabaseClient, password, timeoutMs = 25000) {
  if (!supabaseClient?.auth || !supabaseClient?.functions) throw new Error('AUTH_CLIENT_REQUIRED');
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw Object.assign(new Error('Password does not meet recovery requirements'), { code: 'weak_password' });
  }
  const current = await waitForAuthResponse(() => supabaseClient.auth.getSession(), timeoutMs);
  if (current.error) throw current.error;
  if (!current.data?.session?.access_token) throw Object.assign(new Error('Recovery session unavailable'), { code: 'session_not_found' });
  const result = await waitForAuthResponse(() => supabaseClient.functions.invoke('password-recovery', {
    body: { password },
    headers: { Authorization: `Bearer ${current.data.session.access_token}` },
  }), timeoutMs);
  if (result.error) throw result.error;
  if (!result.data?.success) throw Object.assign(new Error('Password recovery was not confirmed'), { code: 'RECOVERY_UPDATE_UNCONFIRMED' });
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
  const current = await waitForAuthResponse(() => auth.getSession(), timeoutMs);
  if (current.error) throw current.error;
  if (!current.data?.session) throw Object.assign(new Error('Recovery session unavailable'), { code: 'session_not_found' });

  const refresh = async session => {
    const refreshed = await waitForAuthResponse(() => auth.refreshSession(session), timeoutMs);
    if (refreshed.error) throw refreshed.error;
    if (!refreshed.data?.session) throw Object.assign(new Error('Recovery session unavailable'), { code: 'session_not_found' });
    return refreshed.data.session;
  };
  const isUnauthorized = error => error?.code !== 'insufficient_aal' && (error?.status === 401 || ['invalid_jwt', 'session_not_found'].includes(error?.code));
  const session = await refresh(current.data.session);
  let result = await waitForAuthResponse(() => auth.updateUser({ password }), timeoutMs);
  if (result.error && isUnauthorized(result.error)) {
    await refresh(session);
    result = await waitForAuthResponse(() => auth.updateUser({ password }), timeoutMs);
    if (result.error && isUnauthorized(result.error)) {
      throw Object.assign(new Error('Recovery session expired'), { code: 'session_not_found' });
    }
  }
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
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    // A link may contain a PKCE code or a Supabase implicit-flow access token.
    if (hash.has('access_token')) {
      const callback = await auth.getSession();
      if (callback.error) throw callback.error;
      if (callback.data?.session) return callback;
    }
    if (query.has('code')) {
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
