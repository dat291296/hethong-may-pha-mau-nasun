import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRestoreConfiguration, requireEmptyRestoreDestination } from '../scripts/restore-preflight.mjs';
function fixture() { return { RESTORE_SUPABASE_URL: 'https://syntheticrestore.supabase.co', RLS_TEST_URL: 'https://syntheticstaging.supabase.co', RLS_PRODUCTION_URL: 'https://syntheticproduction.supabase.co', RESTORE_DB_URL: 'postgresql://postgres:synthetic@db.syntheticrestore.supabase.co:5432/postgres' }; }
test('restore refuses live projects and mismatched database connections', () => {
  validateRestoreConfiguration(fixture());
  for (const update of [{ RESTORE_SUPABASE_URL: fixture().RLS_PRODUCTION_URL }, { RESTORE_SUPABASE_URL: fixture().RLS_TEST_URL }, { RESTORE_DB_URL: 'postgresql://postgres:synthetic@db.syntheticproduction.supabase.co/postgres' }, { RESTORE_SUPABASE_URL: 'http://syntheticrestore.supabase.co' }]) assert.throws(() => validateRestoreConfiguration({ ...fixture(), ...update }));
});
test('every data store must be empty before restoring', () => {
  const counts = { public_tables: 0, auth_users: 0, storage_objects: 0, storage_buckets: 0 };
  requireEmptyRestoreDestination(counts);
  for (const key of Object.keys(counts)) {
    assert.throws(() => requireEmptyRestoreDestination({ ...counts, [key]: 1 }));
    assert.throws(() => requireEmptyRestoreDestination({ ...counts, [key]: undefined }));
  }
});
