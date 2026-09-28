import { supabase, isSupabaseConfigured } from './supabase.js';
import { getCache, setCache } from './offlineDb.js';

const CURSOR_CACHE_KEY = 'sync_change_cursor_v1';
const POLL_INTERVAL_MS = 20_000;

let active = false;
let pollTimer = null;
let pullPromise = null;
let pendingCursor = null;
let runGeneration = 0;

function isUnavailable(error) {
  return ['42883', 'PGRST202'].includes(String(error?.code || '')) ||
    /get_sync_change_feed.*does not exist|schema cache/i.test(String(error?.message || ''));
}

export async function pullChangeFeed() {
  if (!active || pullPromise || pendingCursor !== null || !navigator.onLine || !isSupabaseConfigured || !supabase) {
    return pullPromise;
  }

  pullPromise = (async () => {
    const generation = runGeneration;
    const storedCursor = await getCache(CURSOR_CACHE_KEY, 0);
    const cursor = Number.isSafeInteger(Number(storedCursor)) ? Number(storedCursor) : 0;
    const { data, error } = await supabase.rpc('get_sync_change_feed', {
      p_after_cursor: cursor,
      p_limit: 250
    });
    if (error) {
      if (!isUnavailable(error)) console.warn('[ChangeFeed] Pull deferred:', error.message);
      return false;
    }
    if (!active || generation !== runGeneration) return false;

    const events = Array.isArray(data?.events) ? data.events : [];
    const nextCursor = Number(data?.nextCursor ?? cursor);
    if (events.length === 0) {
      if (nextCursor > cursor) await setCache(CURSOR_CACHE_KEY, nextCursor);
      return true;
    }

    pendingCursor = nextCursor;
    window.dispatchEvent(new CustomEvent('nasun-cloud-changes', {
      detail: { events, nextCursor, hasMore: Boolean(data?.hasMore) }
    }));
    return true;
  })().finally(() => {
    pullPromise = null;
  });
  return pullPromise;
}

export async function acknowledgeChangeFeedCursor(cursor, hasMore = false) {
  const numericCursor = Number(cursor);
  if (!Number.isSafeInteger(numericCursor) || numericCursor < 0) return false;
  await setCache(CURSOR_CACHE_KEY, numericCursor);
  pendingCursor = null;
  if (hasMore) queueMicrotask(() => pullChangeFeed());
  return true;
}

export function startChangeFeed() {
  if (active) return () => {};
  active = true;
  runGeneration += 1;
  const pullWhenVisible = () => {
    if (document.visibilityState === 'visible') pullChangeFeed();
  };
  pollTimer = window.setInterval(pullChangeFeed, POLL_INTERVAL_MS);
  window.addEventListener('online', pullChangeFeed);
  window.addEventListener('focus', pullChangeFeed);
  document.addEventListener('visibilitychange', pullWhenVisible);
  pullChangeFeed();

  return () => {
    active = false;
    runGeneration += 1;
    pendingCursor = null;
    window.clearInterval(pollTimer);
    pollTimer = null;
    window.removeEventListener('online', pullChangeFeed);
    window.removeEventListener('focus', pullChangeFeed);
    document.removeEventListener('visibilitychange', pullWhenVisible);
  };
}
