import { secureAuthStorage } from './authRuntime.js';

const REMEMBERED_ACCOUNT_KEY = 'nasun.remembered-login-email';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function loadRememberedAccount(storage = secureAuthStorage) {
  const email = normalizeEmail(await storage.getItem(REMEMBERED_ACCOUNT_KEY));
  if (!EMAIL_PATTERN.test(email)) {
    if (email) await storage.removeItem(REMEMBERED_ACCOUNT_KEY);
    return '';
  }
  return email;
}

export async function saveRememberedAccount(email, storage = secureAuthStorage) {
  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw Object.assign(new Error('A valid email is required to remember the account'), { code: 'INVALID_REMEMBERED_EMAIL' });
  }
  await storage.setItem(REMEMBERED_ACCOUNT_KEY, normalizedEmail);
}

export async function clearRememberedAccount(storage = secureAuthStorage) {
  await storage.removeItem(REMEMBERED_ACCOUNT_KEY);
}
