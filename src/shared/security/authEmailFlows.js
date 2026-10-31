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
  const result = await waitForAuthResponse(() => auth.updateUser({ password }), timeoutMs);
  if (result.error) throw result.error;
  return result.data;
}
