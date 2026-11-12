const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveBrowserPasswordCredential(email, password, {
  credentials = globalThis.navigator?.credentials,
  PasswordCredentialType = globalThis.PasswordCredential,
} = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail) || typeof password !== 'string' || !password) return false;
  if (typeof PasswordCredentialType !== 'function' || typeof credentials?.store !== 'function') return false;

  const credential = new PasswordCredentialType({ id: normalizedEmail, password });
  await credentials.store(credential);
  return true;
}

export async function loadBrowserPasswordCredential({
  credentials = globalThis.navigator?.credentials,
} = {}) {
  if (typeof credentials?.get !== 'function') return null;

  const credential = await credentials.get({ password: true, mediation: 'optional' });
  if (typeof credential?.id !== 'string' || typeof credential?.password !== 'string' || !credential.password) {
    return null;
  }

  return {
    email: credential.id.trim().toLowerCase(),
    password: credential.password,
  };
}
