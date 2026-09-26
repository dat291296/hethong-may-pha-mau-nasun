const HTTPS_PROTOCOL = 'https:';
const DEFAULT_TIMEOUT_MS = 15_000;

const EXTERNAL_ENDPOINT_RULES = Object.freeze([
  Object.freeze({ hostname: 'api.bigdatacloud.net', pathPrefix: '/data/reverse-geocode-client' }),
  Object.freeze({ hostname: 'ipapi.co', pathPrefix: '/json/' }),
]);

function createNetworkError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseUrl(value, baseUrl = globalThis.location?.origin) {
  try {
    return new URL(typeof value === 'string' ? value : value?.url, baseUrl);
  } catch {
    throw createNetworkError('INVALID_NETWORK_URL', 'Network URL is invalid');
  }
}

function isApprovedSupabaseHostname(hostname) {
  return /^[a-z0-9-]+\.supabase\.co$/i.test(hostname);
}

export function validateSupabaseEndpoint(value) {
  const url = parseUrl(value);
  if (url.protocol !== HTTPS_PROTOCOL || !isApprovedSupabaseHostname(url.hostname)) {
    throw createNetworkError('UNTRUSTED_SUPABASE_ENDPOINT', 'Supabase endpoint must use HTTPS on supabase.co');
  }
  if (url.username || url.password || url.port) {
    throw createNetworkError('INVALID_SUPABASE_ENDPOINT', 'Supabase endpoint must not contain credentials or a custom port');
  }
  return url.origin;
}

export function assertAllowedNetworkUrl(value, options = {}) {
  const url = parseUrl(value);
  if (url.protocol !== HTTPS_PROTOCOL) {
    throw createNetworkError('CLEAR_TEXT_NETWORK_BLOCKED', 'Only HTTPS network requests are allowed');
  }

  const expectedSupabaseOrigin = options.supabaseOrigin
    ? validateSupabaseEndpoint(options.supabaseOrigin)
    : null;
  if (expectedSupabaseOrigin && url.origin === expectedSupabaseOrigin) return url;

  const rule = EXTERNAL_ENDPOINT_RULES.find(item => (
    url.hostname === item.hostname && url.pathname.startsWith(item.pathPrefix)
  ));
  if (options.allowExternal === true && rule) return url;

  throw createNetworkError('NETWORK_ENDPOINT_BLOCKED', `Network endpoint is not allowlisted: ${url.hostname}`);
}

function createTimeoutSignal(timeoutMs, sourceSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(sourceSignal?.reason);
  if (sourceSignal?.aborted) abort();
  else sourceSignal?.addEventListener?.('abort', abort, { once: true });
  const timeoutId = globalThis.setTimeout(() => controller.abort(createNetworkError(
    'NETWORK_TIMEOUT',
    `Network request exceeded ${timeoutMs} ms`,
  )), timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      globalThis.clearTimeout(timeoutId);
      sourceSignal?.removeEventListener?.('abort', abort);
    },
  };
}

export async function secureFetch(value, init = {}, policy = {}) {
  const url = assertAllowedNetworkUrl(value, policy);
  const timeoutMs = Number.isFinite(policy.timeoutMs) && policy.timeoutMs > 0
    ? policy.timeoutMs
    : DEFAULT_TIMEOUT_MS;
  const timeout = createTimeoutSignal(timeoutMs, init.signal);
  try {
    return await globalThis.fetch(url.toString(), {
      ...init,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: timeout.signal,
    });
  } finally {
    timeout.dispose();
  }
}

export function createSupabaseFetch(supabaseOrigin) {
  const trustedOrigin = validateSupabaseEndpoint(supabaseOrigin);
  return (value, init = {}) => secureFetch(value, init, {
    supabaseOrigin: trustedOrigin,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
}

export const NETWORK_POLICY = Object.freeze({
  clearTextAllowed: false,
  redirectsAllowed: false,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  externalEndpoints: EXTERNAL_ENDPOINT_RULES,
});
