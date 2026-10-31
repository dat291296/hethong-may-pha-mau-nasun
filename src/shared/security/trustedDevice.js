import { supabase } from '../lib/supabase.js';
import { secureAuthStorage } from './authRuntime.js';

const DEVICE_ID_KEY = 'nasun-trusted-device-id';

export function isMissingTrustedDeviceRpc(error) {
  return ['42883', 'PGRST202'].includes(String(error?.code || '')) ||
    /function .*trusted.* does not exist|schema cache/i.test(String(error?.message || ''));
}

export async function getTrustedDeviceId() {
  let deviceId = await secureAuthStorage.getItem(DEVICE_ID_KEY);
  if (deviceId) return deviceId;
  deviceId = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  await secureAuthStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

function getDeviceContext() {
  const platform = globalThis.navigator?.platform || 'Unknown platform';
  const browser = globalThis.navigator?.userAgentData?.brands?.[0]?.brand || 'Browser';
  return {
    label: `${browser} - ${platform}`.slice(0, 120),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  };
}

async function callTrustedDeviceRpc(name) {
  const deviceId = await getTrustedDeviceId();
  const context = getDeviceContext();
  const args = name === 'register_trusted_device_session'
    ? { p_device_id: deviceId, p_device_label: context.label, p_timezone: context.timezone }
    : { p_device_id: deviceId, p_timezone: context.timezone };
  const { data, error } = await supabase.rpc(name, args);
  if (error && isMissingTrustedDeviceRpc(error)) return { supported: false, state: null };
  if (error) throw error;
  return { supported: true, state: data };
}

export function registerTrustedDeviceSession() {
  return callTrustedDeviceRpc('register_trusted_device_session');
}

export function validateTrustedDeviceSession() {
  return callTrustedDeviceRpc('validate_trusted_device_session');
}
