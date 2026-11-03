import { supabase } from '../data-access/supabase.js';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function decodeVapidKey(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

export async function subscribeToPushNotifications() {
  if (!VAPID_PUBLIC_KEY || !supabase) throw new Error('PUSH_NOT_CONFIGURED');
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('PUSH_NOT_SUPPORTED');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(VAPID_PUBLIC_KEY) });
  const { error } = await supabase.functions.invoke('manage-push-subscription', { body: { action: 'upsert', subscription: subscription.toJSON() } });
  if (error) throw error;
  return subscription;
}

export async function unsubscribeFromPushNotifications() {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;
  if (supabase) await supabase.functions.invoke('manage-push-subscription', { body: { action: 'delete', endpoint: subscription.endpoint } });
  return subscription.unsubscribe();
}

export function hasPushNotificationConfig() {
  return Boolean(VAPID_PUBLIC_KEY && supabase);
}
