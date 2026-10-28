import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceGateway } from '../supabase/functions/_shared/evidenceProtocol.js';
import { redactSecurityDetails } from '../src/security/securityEvents.js';
import { validateStagingDestination } from '../scripts/apply-staging-safety.mjs';
import { readFile, readdir } from 'node:fs/promises';

test('every workflow job with production database or backup credentials requires the backup environment and protected main', async () => {
  const root = new URL('../.github/workflows/', import.meta.url);
  let checked = 0;
  for (const file of await readdir(root)) {
    const content = await readFile(new URL(file, root), 'utf8');
    for (const job of content.split(/(?=^  [a-zA-Z][\w-]*:\s*$)/m)) {
      if (!/secrets\.(?:SUPABASE_DB_URL|BACKUP_SUPABASE_SERVICE_ROLE_KEY|BACKUP_ENCRYPTION_PASSPHRASE)/.test(job)) continue;
      assert.match(job, /^    environment: backup$/m, file);
      assert.match(job, /^    if: github\.ref == 'refs\/heads\/main' && github\.ref_protected$/m, file);
      checked++;
    }
  }
  assert.ok(checked >= 8, 'Production secret consumers must be included in the scan');
});

test('staging isolation uses public production identity without receiving production database credentials', () => {
  const environment = { STAGING_DB_URL: 'postgresql://postgres.kenznmtdfuexmfrtzypb:synthetic@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres', RLS_PRODUCTION_URL: 'https://tqoxyharlsubyqjxjnfg.supabase.co' };
  assert.equal(validateStagingDestination(environment).hostname, 'aws-0-ap-southeast-2.pooler.supabase.com');
  for (const RLS_PRODUCTION_URL of ['https://kenznmtdfuexmfrtzypb.supabase.co', 'https://tqoxyharlsubyqjxjnfg.supabase.co.evil.invalid', 'http://tqoxyharlsubyqjxjnfg.supabase.co', 'https://user:password@tqoxyharlsubyqjxjnfg.supabase.co']) {
    assert.throws(() => validateStagingDestination({ ...environment, RLS_PRODUCTION_URL }));
  }
});

test('security details redact nested case-varied credentials before console and transport', () => {
  const value = { Password: 'dummy', nested: [{ 'Access-Token': 'dummy', API_KEY: 'dummy', safe: 'retained' }] };
  assert.deepEqual(redactSecurityDetails(value), { Password: '[REDACTED]', nested: [{ 'Access-Token': '[REDACTED]', API_KEY: '[REDACTED]', safe: 'retained' }] });
  assert.equal(value.Password, 'dummy');
  const recursive = {}; recursive.child = recursive;
  assert.doesNotThrow(() => redactSecurityDetails(recursive));
});

const identity = { userId: '10000000-0000-4000-8000-000000000001', sessionId: '20000000-0000-4000-8000-000000000001' };
test('quota denies repeated evidence before reading body, hashing or storage', async () => {
  let quotaCalls = 0;
  const gateway = createEvidenceGateway({
    authenticate: async () => identity,
    throttle: async () => { quotaCalls++; return { allowed: false, retry_after_seconds: 17 }; },
    reserve: async () => assert.fail('Throttled requests must not reserve objects'),
  });
  for (let i = 0; i < 3; i++) {
    const result = await gateway(new Request('https://synthetic.invalid', { method: 'POST', body: 'invalid JSON' }));
    assert.equal(result.status, 429);
    assert.equal(result.headers.get('Retry-After'), '17');
    assert.deepEqual(await result.json(), { error: 'RATE_LIMITED' });
  }
  assert.equal(quotaCalls, 3);
});
test('quota outage and missing acknowledgement fail closed without exposing provider errors', async () => {
  for (const throttle of [async () => undefined, async () => { throw Error('private-provider-data'); }]) {
    const gateway = createEvidenceGateway({ authenticate: async () => identity, throttle });
    const result = await gateway(new Request('https://synthetic.invalid', { method: 'POST', body: '{}' }));
    assert.equal(result.status, 503);
    assert.doesNotMatch(await result.text(), /private-provider-data/);
  }
});
test('anonymous requests cannot consume another actor quota', async () => {
  const gateway = createEvidenceGateway({ authenticate: async () => null, throttle: async () => assert.fail('Authentication must precede quota') });
  assert.equal((await gateway(new Request('https://synthetic.invalid', { method: 'POST', body: '{}' }))).status, 401);
});
