const diagnosticCodes = new Set(['OPERATION_FAILED', 'AUTH_REQUIRED', 'ACCOUNT_DISABLED',
  'REVISION_REQUIRED', 'OFFLINE_QUEUE_WRITE_FAILED', 'OFFLINE_OWNER_CHANGED', 'DRAFT_WRITE_FAILED',
  'QUOTA_EXCEEDED', 'NETWORK_ERROR', 'REPAIR_CACHE_WRITE_FAILED', 'MONITORING_PROBE']);
const areas = new Set(['auth', 'device', 'draft', 'runtime', 'sync']);
const errorTypes = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'AggregateError']);
export const diagnosticCode = value => diagnosticCodes.has(value) ? value : 'OPERATION_FAILED';

export function validateSentryDsn(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^o\d+\.ingest(?:\.(?:us|de))?\.sentry\.io$/.test(url.hostname)
      || !/^[a-f0-9]{32}$/.test(url.username) || url.password || url.port || url.search || url.hash
      || !/^\/\d+$/.test(url.pathname)) throw Error();
    return url;
  } catch { throw new Error('MONITORING_DSN_INVALID'); }
}

export function safeCrashEvent(entry, error, { origin, assets = [], release, environment, eventId, timestamp }) {
  const frames = [];
  // Never send the message, arbitrary function names, stack text or URL query.
  // Only code locations that also exist in the browser's loaded asset inventory
  // may leave the device. Unrecognized stacks remain a code-only error.
  if (typeof error?.stack === 'string' && typeof origin === 'string') {
    for (const value of assets.slice(0, 150)) {
      try {
        const url = new URL(value, origin);
        if (url.origin !== origin || !/^\/assets\/[\w-]+\.js$/.test(url.pathname)) continue;
        const literal = (url.origin + url.pathname).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = error.stack.slice(0, 16000).match(new RegExp(literal + ':(\\d{1,7}):(\\d{1,7})\\b'));
        if (match && frames.length < 8) frames.push({ filename: url.pathname, lineno: Number(match[1]), colno: Number(match[2]), in_app: true });
      } catch { /* Invalid resource names are omitted. */ }
    }
  }
  const area = areas.has(entry?.area) ? entry.area : 'runtime';
  const code = diagnosticCode(entry?.code);
  return { event_id: eventId, timestamp: timestamp / 1000, platform: 'javascript', level: 'error',
    release: /^[a-f0-9]{40}$/.test(release || '') ? release : 'unversioned',
    environment: ['production', 'staging', 'development'].includes(environment) ? environment : 'development',
    tags: { area }, fingerprint: [area, code, ...frames.map(frame => `${frame.filename}:${frame.lineno}`)],
    exception: { values: [{ type: errorTypes.has(error?.name) ? error.name : 'Error', value: code,
      ...(frames.length ? { stacktrace: { frames: frames.reverse() } } : {}) }] } };
}

export function createRemoteReporter({ dsn, release, environment, origin, assets = () => [],
  fetcher = globalThis.fetch, now = Date.now, uuid = () => crypto.randomUUID(), timeoutMs = 5000 } = {}) {
  if (!dsn) return { enabled: false, capture: async () => ({ status: 'disabled' }) };
  let target;
  try { target = validateSentryDsn(dsn); }
  catch { return { enabled: false, capture: async () => ({ status: 'invalid-configuration' }) }; }
  const endpoint = new URL(`/api${target.pathname}/envelope/`, target.origin);
  endpoint.searchParams.set('sentry_key', target.username);
  endpoint.searchParams.set('sentry_version', '7');
  const seen = new Map();
  let windowStart = -Infinity, sent = 0, pauseUntil = 0;
  return { enabled: true, async capture(entry, error) {
    const time = now();
    if (time < pauseUntil) return { status: 'rate-limited' };
    if (time - windowStart >= 60000) { windowStart = time; sent = 0; seen.clear(); }
    if (sent >= 10) return { status: 'rate-limited' };
    try {
      const eventId = uuid().replaceAll('-', '');
      if (!/^[a-f0-9]{32}$/.test(eventId)) return { status: 'invalid-event' };
      const event = safeCrashEvent(entry, error, { release, environment, origin, assets: assets(), eventId, timestamp: time });
      const key = JSON.stringify(event.fingerprint);
      if (seen.has(key)) return { status: 'duplicate' };
      seen.set(key, time); sent++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const body = JSON.stringify({ event_id: eventId }) + '\n' + JSON.stringify({ type: 'event' }) + '\n' + JSON.stringify(event) + '\n';
        const response = await fetcher(endpoint.href, { method: 'POST', body, signal: controller.signal,
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, credentials: 'omit',
          referrerPolicy: 'no-referrer', redirect: 'error', keepalive: true });
        const quota = response.headers.get('x-sentry-rate-limits')?.split(':')[0];
        if (response.status === 429 || quota) {
          const retry = quota || response.headers.get('retry-after');
          const delay = Number.isFinite(Number(retry)) && retry !== null ? Number(retry) * 1000 : Date.parse(retry) - time;
          pauseUntil = time + Math.min(3600000, Math.max(60000, Number.isFinite(delay) ? delay : 60000));
        }
        return response.ok ? { status: 'accepted', eventId } : { status: 'rejected' };
      } finally { clearTimeout(timer); }
    } catch { return { status: 'unavailable' }; }
  } };
}
