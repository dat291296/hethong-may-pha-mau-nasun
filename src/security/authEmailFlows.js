function requireAuthClient(authClient) {
  if (!authClient) throw new Error('AUTH_CLIENT_REQUIRED');
  return authClient;
}

function normalizeEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) throw new Error('VALID_EMAIL_REQUIRED');
  return normalized;
}

export async function resendSignupVerification(authClient, email, emailRedirectTo) {
  const auth = requireAuthClient(authClient);
  const result = await auth.resend({
    type: 'signup',
    email: normalizeEmail(email),
    options: { emailRedirectTo },
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function requestPasswordRecovery(authClient, email, redirectTo) {
  const auth = requireAuthClient(authClient);
  const result = await auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo });
  if (result.error) throw result.error;
  return result.data;
}

export async function completePasswordRecovery(authClient, password) {
  const auth = requireAuthClient(authClient);
  const result = await auth.updateUser({ password });
  if (result.error) throw result.error;
  return result.data;
}
