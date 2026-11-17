import {
  getMobileSecurityCapabilities,
  requireNativeSecurityBridge,
} from '../platform/mobileSecurityBridge.js';

const AUTH_REDIRECT_PURPOSES = Object.freeze({
  LOGIN: 'login',
  VERIFIED: 'verified',
  RECOVERY: 'recovery',
});

function usesNativeAuthStorage() {
  const capabilities = getMobileSecurityCapabilities();
  if (capabilities.platform === 'native' && !capabilities.nativeBridge) {
    requireNativeSecurityBridge();
  }
  return capabilities.nativeBridge;
}

export const secureAuthStorage = Object.freeze({
  async getItem(key) {
    if (usesNativeAuthStorage()) {
      return requireNativeSecurityBridge().getSecureItem({ key });
    }
    return globalThis.localStorage?.getItem(key) ?? null;
  },

  async setItem(key, value) {
    if (usesNativeAuthStorage()) {
      await requireNativeSecurityBridge().setSecureItem({ key, value });
      return;
    }
    globalThis.localStorage?.setItem(key, value);
  },

  async removeItem(key) {
    if (usesNativeAuthStorage()) {
      await requireNativeSecurityBridge().removeSecureItem({ key });
      return;
    }
    globalThis.localStorage?.removeItem(key);
  },
});

// This identifies a previously signed-in account only; the encrypted offline grant
// must separately authorize local access. Never use this for server authorization.
export async function readStoredAuthUser(storage = secureAuthStorage) {
  try {
    const session = JSON.parse(await storage.getItem('paint-tinting-auth'));
    return typeof session?.user?.id === 'string' && session.user.id
      && typeof session.refresh_token === 'string' && session.refresh_token
      ? { id: session.user.id } : null;
  } catch {
    return null;
  }
}

export async function getAuthRedirectUrl(purpose = AUTH_REDIRECT_PURPOSES.LOGIN) {
  if (!Object.values(AUTH_REDIRECT_PURPOSES).includes(purpose)) {
    throw new Error('INVALID_AUTH_REDIRECT_PURPOSE');
  }
  if (usesNativeAuthStorage()) {
    const redirectUrl = await requireNativeSecurityBridge().getAuthRedirectUrl({ purpose });
    if (typeof redirectUrl !== 'string' || !redirectUrl.trim()) {
      throw new Error('INVALID_NATIVE_AUTH_REDIRECT');
    }
    return redirectUrl;
  }

  const browserWindow = globalThis.window;
  if (!browserWindow?.location) throw new Error('BROWSER_LOCATION_UNAVAILABLE');
  const redirect = new URL(browserWindow.location.pathname || '/', browserWindow.location.origin);
  if (purpose !== AUTH_REDIRECT_PURPOSES.LOGIN) redirect.searchParams.set(purpose, 'true');
  return redirect.toString();
}

export async function createPrivateIdentifier(value) {
  if (!globalThis.crypto?.subtle) throw new Error('WEB_CRYPTO_UNAVAILABLE');
  const normalized = String(value || '').trim().toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export { AUTH_REDIRECT_PURPOSES };
