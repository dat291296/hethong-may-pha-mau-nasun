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
  const now = Date.now();
  const counts = queue.reduce((result, item) => {
    const status = item.status || 'pending';
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  const oldest = queue.reduce((value, item) => Math.min(value, Number(item.createdAt || item.timestamp || now)), now);
  let server = null;
  let serverError = null;
  if (isSupabaseConfigured && supabase && navigator.onLine) {
    const { data, error } = await supabase.rpc('get_sync_server_health');
    if (!error) server = data;
    else serverError = error.message || 'SYNC_SERVER_HEALTH_UNAVAILABLE';
  }
  const criticalCount = Number(counts.needs_review || 0) + Number(counts.dead_letter || 0);
  const waitingCount = Number(counts.pending || 0) + Number(counts.retry_wait || 0);
  const state = !navigator.onLine
    ? 'offline'
    : criticalCount > 0
      ? 'critical'
      : waitingCount > 0
        ? 'warning'
        : 'healthy';
  return {
    online: navigator.onLine,
    state,
    engineVersion: SYNC_ENGINE_VERSION,
    queueTotal: queue.length,
    counts,
    oldestQueueAgeSeconds: queue.length ? Math.max(0, Math.floor((now - oldest) / 1000)) : 0,
    queueItems: queue.slice(0, 50).map(item => ({
      id: String(item.operationId || item.id || ''),
      action: String(item.action || 'UNKNOWN'),
      entityType: String(item.entityType || item.category || ''),
      entityId: String(item.entityId || ''),
      status: String(item.status || 'pending'),
      attempts: Number(item.attempts || 0),
      ageSeconds: Math.max(0, Math.floor((now - Number(item.createdAt || item.timestamp || now)) / 1000)),
      nextRetryInSeconds: Math.max(0, Math.ceil((Number(item.nextAttemptAt || 0) - now) / 1000)),
      lastError: item.lastError ? String(item.lastError).slice(0, 240) : null,
    })),
    transport: transportState,
    server,
    serverError,
    measuredAt: new Date().toISOString()
  };
}
