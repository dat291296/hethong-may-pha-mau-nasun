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
  const isUnauthorized = error => error?.status === 401 || ['invalid_jwt', 'session_not_found'].includes(error?.code);
  const session = await refresh(current.data.session);
  let result = await waitForAuthResponse(() => auth.updateUser({ password }), timeoutMs);
  if (result.error && isUnauthorized(result.error)) {
    await refresh(session);
    result = await waitForAuthResponse(() => auth.updateUser({ password }), timeoutMs);
    if (result.error && isUnauthorized(result.error)) {
      throw Object.assign(new Error('Recovery session expired'), { code: 'session_not_found' });
    }
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
