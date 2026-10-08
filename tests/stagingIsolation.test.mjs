import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('temporary fixture runner rejects every project except approved staging before API access', () => {
  const result = spawnSync(process.execPath, ['scripts/run-staging-rls.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, RLS_TEST_URL: 'https://production.supabase.co', STAGING_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-secret-never-log' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /approved nasun-staging project/);
  assert.doesNotMatch(result.stderr + result.stdout, /synthetic-secret-never-log/);
});

test('temporary fixture runner refuses a staging URL matching production', () => {
  const url = 'https://kenznmtdfuexmfrtzypb.supabase.co';
  const result = spawnSync(process.execPath, ['scripts/run-staging-rls.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, RLS_TEST_URL: url, RLS_PRODUCTION_URL: url, STAGING_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-secret-never-log' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /isolated from production/);
  assert.doesNotMatch(result.stderr + result.stdout, /synthetic-secret-never-log/);
});
