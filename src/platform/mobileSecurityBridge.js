const NATIVE_BRIDGE_NAME = 'NasunNativeSecurity';

export const RUNTIME_PLATFORMS = Object.freeze({ WEB: 'web', PWA: 'pwa', NATIVE: 'native' });

const REQUIRED_NATIVE_METHODS = Object.freeze([
  'getOrCreateEncryptionKey',
  'deleteEncryptionKey',
  'setScreenProtection',
  'getIntegrityToken',
]);

function getWindow() {
  return typeof window === 'undefined' ? null : window;
}

function getNativeBridge() {
  return getWindow()?.[NATIVE_BRIDGE_NAME] || null;
}

function isStandaloneDisplay() {
  const browserWindow = getWindow();
  if (!browserWindow) return false;
  return browserWindow.matchMedia?.('(display-mode: standalone)').matches === true
    || browserWindow.navigator?.standalone === true;
}

export function getRuntimePlatform() {
  if (getNativeBridge()) return RUNTIME_PLATFORMS.NATIVE;
  return isStandaloneDisplay() ? RUNTIME_PLATFORMS.PWA : RUNTIME_PLATFORMS.WEB;
}

export function getMobileSecurityCapabilities() {
  const bridge = getNativeBridge();
  const nativeReady = Boolean(bridge)
    && REQUIRED_NATIVE_METHODS.every(method => typeof bridge[method] === 'function');

  return Object.freeze({
    platform: getRuntimePlatform(),
    secureContext: getWindow()?.isSecureContext === true,
    webCrypto: Boolean(globalThis.crypto?.subtle),
    nativeBridge: nativeReady,
    hardwareBackedKey: nativeReady && bridge.hardwareBackedKey === true,
    screenProtection: nativeReady && bridge.screenProtection === true,
    appAttestation: nativeReady && bridge.appAttestation === true,
  });
}

export function requireNativeSecurityBridge() {
  const bridge = getNativeBridge();
  const missingMethods = REQUIRED_NATIVE_METHODS.filter(method => typeof bridge?.[method] !== 'function');
  if (missingMethods.length > 0) {
    const error = new Error(`NATIVE_SECURITY_BRIDGE_UNAVAILABLE: ${missingMethods.join(', ')}`);
    error.code = 'NATIVE_SECURITY_BRIDGE_UNAVAILABLE';
    throw error;
  }
  return bridge;
}

export const MOBILE_SECURITY_BRIDGE_CONTRACT = Object.freeze({
  globalName: NATIVE_BRIDGE_NAME,
  requiredMethods: REQUIRED_NATIVE_METHODS,
  optionalFlags: Object.freeze(['hardwareBackedKey', 'screenProtection', 'appAttestation']),
});
