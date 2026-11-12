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
