import { getQueue } from './offlineDb.js';
import { supabase, isSupabaseConfigured } from './supabase.js';
import { SYNC_ENGINE_VERSION } from './syncQueue.js';

let transportState = { status: 'POLLING', error: null, at: null };

if (typeof window !== 'undefined') {
  window.addEventListener('nasun-sync-transport', event => {
    transportState = {
      status: event.detail?.status || 'UNKNOWN',
      error: event.detail?.error || null,
      at: event.detail?.at || Date.now()
    };
  });
}

export async function getSyncHealthSnapshot() {
  const queue = await getQueue();
  const counts = queue.reduce((result, item) => {
    const status = item.status || 'pending';
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  const oldest = queue.reduce((value, item) => Math.min(value, Number(item.createdAt || item.timestamp || Date.now())), Date.now());
  let server = null;
  if (isSupabaseConfigured && supabase && navigator.onLine) {
    const { data, error } = await supabase.rpc('get_sync_server_health');
    if (!error) server = data;
  }
  return {
    online: navigator.onLine,
    engineVersion: SYNC_ENGINE_VERSION,
    queueTotal: queue.length,
    counts,
    oldestQueueAgeSeconds: queue.length ? Math.max(0, Math.floor((Date.now() - oldest) / 1000)) : 0,
    transport: transportState,
    server,
    measuredAt: new Date().toISOString()
  };
}
