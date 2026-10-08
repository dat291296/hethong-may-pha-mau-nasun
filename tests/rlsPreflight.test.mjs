import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRlsConfiguration, requireRlsConfiguration } from '../scripts/rls-preflight.mjs';

function fixture() {
  const environment = {
    RLS_TEST_URL: 'https://synthetic-staging.supabase.co',
    RLS_PRODUCTION_URL: 'https://synthetic-production.supabase.co',
    RLS_TEST_ANON_KEY: 'sb_publishable_synthetic',
  };
  for (const role of ['admin', 'manager', 'technician', 'qc', 'viewer']) {
    const prefix = `RLS_TEST_${role.toUpperCase()}`;
    environment[`${prefix}_EMAIL`] = `${role}@example.invalid`;
    environment[`${prefix}_PASSWORD`] = 'synthetic-secret';
    if (role !== 'admin') environment[`${prefix}_REGION`] = 'Miền Bắc';
  }
  return environment;
}

test('preflight accepts isolated staging with five distinct accounts', () => {
  assert.equal(validateRlsConfiguration(fixture()).valid, true);
});
test('preflight reports all missing names and never exposes configured values', () => {
  const environment = { RLS_TEST_ADMIN_PASSWORD: 'synthetic-private-value' };
  const result = validateRlsConfiguration(environment);
  assert.ok(result.issues.includes('MISSING:RLS_TEST_URL'));
  assert.ok(result.issues.includes('MISSING:RLS_TEST_VIEWER_EMAIL'));
  assert.ok(!JSON.stringify(result).includes('synthetic-private-value'));
});
test('preflight refuses production, insecure URLs and privileged keys', () => {
  const environment = fixture();
  environment.RLS_TEST_URL = environment.RLS_PRODUCTION_URL;
  assert.throws(() => requireRlsConfiguration(environment), /isolated staging/);
  for (const url of ['http://synthetic.supabase.co', 'https://attacker.example', 'https://user:password@synthetic.supabase.co', 'https://synthetic.supabase.co/rest/v1']) {
    environment.RLS_TEST_URL = url;
    assert.ok(validateRlsConfiguration(environment).issues.includes('INVALID_ENDPOINT:RLS_TEST_URL'));
  }
  environment.RLS_TEST_URL = fixture().RLS_TEST_URL;
  environment.RLS_TEST_ANON_KEY = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  assert.ok(validateRlsConfiguration(environment).issues.includes('PUBLIC_KEY_REQUIRED:RLS_TEST_ANON_KEY'));
});
test('preflight rejects reused identities and invalid region assignments', () => {
  const environment = fixture();
  environment.RLS_TEST_QC_EMAIL = environment.RLS_TEST_ADMIN_EMAIL;
  environment.RLS_TEST_VIEWER_REGION = 'Toàn Quốc';
  assert.ok(validateRlsConfiguration(environment).issues.includes('DISTINCT_ACCOUNT_REQUIRED:RLS_TEST_QC_EMAIL'));
  assert.ok(validateRlsConfiguration(environment).issues.includes('INVALID_REGION:RLS_TEST_VIEWER_REGION'));
});
