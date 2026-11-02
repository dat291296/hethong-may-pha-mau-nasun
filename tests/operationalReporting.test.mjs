import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteReporter, safeCrashEvent, validateSentryDsn } from '../src/shared/diagnostics/remoteReporting.js';
import { recordOperationalError, configureOperationalReporting, getOperationalDiagnostics, startErrorMonitoring } from '../src/shared/diagnostics/operationalDiagnostics.js';

const dsn = 'https://0123456789abcdef0123456789abcdef@o123.ingest.us.sentry.io/456';
const release = 'a'.repeat(40);
const origin = 'https://app.example.invalid';
const eventId = 'b'.repeat(32);
const asset = `${origin}/assets/index-ABcd1234.js`;

test('monitoring accepts only HTTPS public DSNs on approved Sentry ingestion hosts', () => {
  assert.equal(validateSentryDsn(dsn).pathname, '/456');
  for (const value of [dsn.replace('https:', 'http:'), dsn.replace('sentry.io', 'attacker.invalid'),
    dsn.replace('@', ':private@'), dsn + '?token=secret', dsn + '#secret', dsn.replace('/456', '/456/other')]) {
    assert.throws(() => validateSentryDsn(value), { message: 'MONITORING_DSN_INVALID' });
  }
});

test('unconfigured or invalid monitoring makes no network request', async () => {
  const fetcher = () => assert.fail('Disabled monitoring must not send');
  for (const value of ['', undefined, 'private-do-not-echo']) {
    const reporter = createRemoteReporter({ dsn: value, fetcher });
    assert.equal(reporter.enabled, false);
    assert.notEqual((await reporter.capture({ code: 'NETWORK_ERROR' })).status, 'accepted');
  }
});

test('crash event excludes messages, identities, customer data, arbitrary stacks and query tokens', () => {
  const error = { name: 'PRIVATE_TYPE', message: 'CUSTOMER_SECRET', email: 'PRIVATE_EMAIL',
    stack: `Error: CUSTOMER_SECRET\n at PRIVATE_FUNCTION (${asset}:123:45)\n at https://outside.invalid/PRIVATE.js:5:6` };
  const result = safeCrashEvent({ area: 'runtime', code: 'PRIVATE_CODE', payload: 'PRIVATE_PAYLOAD' }, error,
    { origin, assets: [asset + '?token=PRIVATE_TOKEN', 'https://outside.invalid/PRIVATE.js'],
      release, environment: 'production', eventId, timestamp: 1000 });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|CUSTOMER|token|outside/);
  assert.equal(result.exception.values[0].type, 'Error');
  assert.equal(result.exception.values[0].value, 'OPERATION_FAILED');
  assert.deepEqual(result.exception.values[0].stacktrace.frames, [
    { filename: '/assets/index-ABcd1234.js', lineno: 123, colno: 45, in_app: true },
  ]);
  assert.equal(result.release, release);
});

test('unrecognized frames and unsafe releases are omitted rather than truncated and leaked', () => {
  const result = safeCrashEvent({ area: 'PRIVATE', code: 'NETWORK_ERROR' }, { stack: `at ${asset}:10:20` },
    { origin, assets: [], release: 'PRIVATE_RELEASE', environment: 'PRIVATE_ENV', eventId, timestamp: 0 });
  assert.equal(result.release, 'unversioned');
  assert.equal(result.environment, 'development');
  assert.equal(result.exception.values[0].stacktrace, undefined);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});

test('remote transport sends a bounded Sentry envelope without cookies, referrer or redirects', async () => {
  let sent;
  const reporter = createRemoteReporter({ dsn, release, environment: 'staging', origin, assets: () => [asset],
    uuid: () => eventId, now: () => 1000, fetcher: async (url, options) => {
      sent = { url, options }; return new Response('', { status: 200 });
    } });
  const receipt = await reporter.capture({ area: 'runtime', code: 'NETWORK_ERROR' }, new TypeError('PRIVATE'));
  assert.equal(receipt.status, 'accepted');
  assert.equal(new URL(sent.url).pathname, '/api/456/envelope/');
  const [header, item, event] = sent.options.body.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(header.event_id, eventId);
  assert.equal(item.type, 'event');
  assert.equal(event.event_id, eventId);
  assert.equal(event.release, release);
  assert.equal(sent.options.credentials, 'omit');
  assert.equal(sent.options.referrerPolicy, 'no-referrer');
  assert.equal(sent.options.redirect, 'error');
  assert.doesNotMatch(sent.options.body, /PRIVATE/);
});

test('repeated errors are deduplicated and distinct errors are capped per minute', async () => {
  let calls = 0, time = 1000;
  const reporter = createRemoteReporter({ dsn, now: () => time,
    fetcher: async () => { calls++; return new Response('', { status: 200 }); } });
  assert.equal((await reporter.capture({ code: 'AUTH_REQUIRED' })).status, 'accepted');
  assert.equal((await reporter.capture({ code: 'AUTH_REQUIRED' })).status, 'duplicate');
  for (const code of ['ACCOUNT_DISABLED', 'REVISION_REQUIRED', 'OFFLINE_QUEUE_WRITE_FAILED', 'OFFLINE_OWNER_CHANGED',
    'DRAFT_WRITE_FAILED', 'QUOTA_EXCEEDED', 'NETWORK_ERROR', 'REPAIR_CACHE_WRITE_FAILED', 'MONITORING_PROBE']) {
    await reporter.capture({ code });
  }
  assert.equal(calls, 10);
  assert.equal((await reporter.capture({ code: 'OPERATION_FAILED' })).status, 'rate-limited');
  time += 60000;
  assert.equal((await reporter.capture({ code: 'AUTH_REQUIRED' })).status, 'accepted');
});

test('provider rate limits pause submission without automatic retries', async () => {
  let calls = 0, time = 1000;
  const reporter = createRemoteReporter({ dsn, now: () => time, fetcher: async () => {
    calls++; return new Response('', { status: 429, headers: { 'Retry-After': '300' } });
  } });
  assert.equal((await reporter.capture({ code: 'NETWORK_ERROR' })).status, 'rejected');
  time += 120000;
  assert.equal((await reporter.capture({ code: 'AUTH_REQUIRED' })).status, 'rate-limited');
  assert.equal(calls, 1);
  time += 300000;
  await reporter.capture({ code: 'AUTH_REQUIRED' });
  assert.equal(calls, 2);
});

test('network failure and abort settle safely without recursive reporting', async () => {
  const reporter = createRemoteReporter({ dsn, timeoutMs: 5, fetcher: async (_url, options) =>
    new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('PRIVATE')))) });
  assert.equal((await reporter.capture({ code: 'NETWORK_ERROR' })).status, 'unavailable');
});

test('window crash, rejected promise and handled errors share scrubbed diagnostics and dispose correctly', () => {
  const captured = [];
  configureOperationalReporting({ enabled: true, capture(entry, error) { captured.push({ entry, error }); } });
  const target = new EventTarget();
  const stop = startErrorMonitoring(target);
  const crash = new Event('error');
  crash.error = new TypeError('PRIVATE');
  target.dispatchEvent(crash);
  const rejection = new Event('unhandledrejection');
  rejection.reason = new Error('PRIVATE');
  target.dispatchEvent(rejection);
  recordOperationalError('sync', { code: 'NETWORK_ERROR', message: 'PRIVATE' });
  assert.equal(captured.length, 3);
  assert.doesNotMatch(JSON.stringify(getOperationalDiagnostics()), /PRIVATE/);
  stop(); target.dispatchEvent(crash);
  assert.equal(captured.length, 3);
  configureOperationalReporting(null);
});

test('a throwing reporting adapter cannot break a save or grow diagnostics without bound', () => {
  configureOperationalReporting({ enabled: true, capture() { throw Error('PRIVATE'); } });
  assert.doesNotThrow(() => recordOperationalError('draft', new Error('PRIVATE')));
  for (let index = 0; index < 100; index++) recordOperationalError('runtime');
  assert.equal(getOperationalDiagnostics().recent.length, 50);
  configureOperationalReporting(null);
});
