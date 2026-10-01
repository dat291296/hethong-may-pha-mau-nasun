const rawBaseUrl = process.argv[2] || process.env.DEPLOYMENT_URL;

if (!rawBaseUrl) {
  throw new Error('DEPLOYMENT_URL_REQUIRED');
}

const baseUrl = new URL(rawBaseUrl);
if (baseUrl.protocol !== 'https:') {
  throw new Error('DEPLOYMENT_URL_MUST_USE_HTTPS');
}

const attempts = 6;
const requiredHeaders = {
  'content-security-policy': /default-src 'self'/i,
  'strict-transport-security': /max-age=/i,
  'x-content-type-options': /^nosniff$/i,
  'x-frame-options': /^DENY$/i,
};

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function request(pathname) {
  const url = new URL(pathname, baseUrl);
  url.searchParams.set('healthcheck', Date.now().toString(36));
  return fetch(url, {
    cache: 'no-store',
    redirect: 'error',
    headers: { accept: pathname.endsWith('.json') ? 'application/json' : 'text/html' },
    signal: AbortSignal.timeout(15_000),
  });
}

async function verify() {
  const healthResponse = await request('/health.json');
  if (!healthResponse.ok) throw new Error(`HEALTH_HTTP_${healthResponse.status}`);
  const health = await healthResponse.json();
  if (health.status !== 'ok' || health.service !== 'nasun-paint-management') {
    throw new Error('HEALTH_PAYLOAD_INVALID');
  }

  const appResponse = await request('/');
  if (!appResponse.ok) throw new Error(`APP_HTTP_${appResponse.status}`);
  const html = await appResponse.text();
  if (!/<div id="root"><\/div>/i.test(html)) throw new Error('APP_SHELL_INVALID');

  for (const [header, expected] of Object.entries(requiredHeaders)) {
    const actual = appResponse.headers.get(header) || '';
    if (!expected.test(actual)) throw new Error(`SECURITY_HEADER_INVALID:${header}`);
  }
}

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await verify();
    console.log(`[operations] Deployment healthy: ${baseUrl.origin}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`[operations] Health check ${attempt}/${attempts} failed: ${error.message}`);
    if (attempt < attempts) await delay(Math.min(2 ** attempt * 1_000, 10_000));
  }
}

throw new Error(`DEPLOYMENT_HEALTH_CHECK_FAILED: ${lastError?.message || 'UNKNOWN'}`);
