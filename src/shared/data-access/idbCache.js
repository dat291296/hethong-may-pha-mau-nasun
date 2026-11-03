import { cacheOfflineData, getCachedOfflineData } from '../sync/offlineSync.js';

export const REFERENCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const REFERENCE_TABLES = Object.freeze(['system_set_types', 'distributor_types', 'regions']);
const CACHE_VERSION = 1;

function cacheKey(key) {
  const normalized = String(key || '').trim();
  if (!normalized || normalized.length > 120) throw new Error('INVALID_IDB_CACHE_KEY');
  return `idb-cache:v${CACHE_VERSION}:${normalized}`;
}

export async function readIdbCache(key, { allowExpired = false, now = Date.now() } = {}) {
  const record = await getCachedOfflineData(cacheKey(key), null);
  if (!record || record.version !== CACHE_VERSION || !Number.isFinite(record.cachedAt) || !('value' in record)) return null;
  const isStale = now - record.cachedAt >= record.ttlMs;
  if (isStale && !allowExpired) return null;
  return { data: record.value, cachedAt: record.cachedAt, stale: isStale };
}

export async function writeIdbCache(key, value, { ttlMs = REFERENCE_CACHE_TTL_MS, now = Date.now() } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs < 1) throw new Error('INVALID_IDB_CACHE_TTL');
  return cacheOfflineData(cacheKey(key), { version: CACHE_VERSION, value, cachedAt: now, ttlMs });
}

export async function loadReferenceTable(table, fetcher, { force = false } = {}) {
  if (!REFERENCE_TABLES.includes(table) || typeof fetcher !== 'function') throw new Error('INVALID_REFERENCE_TABLE');
  const cached = await readIdbCache(`reference:${table}`, { allowExpired: true });
  if (cached && !cached.stale && !force) return { ...cached, source: 'cache' };

  const refresh = Promise.resolve().then(fetcher).then(async data => {
    await writeIdbCache(`reference:${table}`, data);
    return { data, cachedAt: Date.now(), stale: false, source: 'server' };
  });
  if (cached && !force) {
    refresh.catch(error => console.warn(`[idbCache] Background refresh failed for ${table}.`));
    return { ...cached, source: 'stale-cache', refresh };
  }
  return refresh;
}
