import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStagingDestination, APPROVED_STAGING_REF } from '../scripts/apply-staging-safety.mjs';
const uri = ref => `postgresql://postgres:synthetic@db.${ref}.supabase.co:5432/postgres`;
test('only the approved isolated staging accepts a migration', () => {
  assert.equal(validateStagingDestination({ STAGING_DB_URL: uri(APPROVED_STAGING_REF), SUPABASE_DB_URL: uri('syntheticproduction') }).hostname, `db.${APPROVED_STAGING_REF}.supabase.co`);
  for (const environment of [
    { STAGING_DB_URL: uri('syntheticproduction'), SUPABASE_DB_URL: uri('syntheticproduction') },
    { STAGING_DB_URL: uri(APPROVED_STAGING_REF), SUPABASE_DB_URL: uri(APPROVED_STAGING_REF).replace('postgres:', 'other:') },
    { STAGING_DB_URL: uri('other'), SUPABASE_DB_URL: uri('syntheticproduction') },
    { STAGING_DB_URL: '', SUPABASE_DB_URL: uri('syntheticproduction') }
  ]) assert.throws(() => validateStagingDestination(environment));
});
test('pooler identity and password encoding are checked without exposing values', () => {
  const target = validateStagingDestination({ STAGING_DB_URL: `postgresql://postgres.${APPROVED_STAGING_REF}:synthetic%pass@aws-0.example.pooler.supabase.com:5432/postgres`, SUPABASE_DB_URL: uri('syntheticproduction') });
  assert.equal(decodeURIComponent(target.password), 'synthetic%pass');
  assert.throws(() => validateStagingDestination({ STAGING_DB_URL: 'secret-do-not-log', SUPABASE_DB_URL: uri('syntheticproduction') }), error => !error.message.includes('secret-do-not-log'));
});
