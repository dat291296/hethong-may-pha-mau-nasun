import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_REGIONS = ['Miền Bắc', 'Miền Trung', 'Miền Nam'];
const url = process.env.RLS_TEST_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.RLS_TEST_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function newClient() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signIn(role) {
  const prefix = `RLS_TEST_${role.toUpperCase()}`;
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({
    email: requireEnvironment(`${prefix}_EMAIL`),
    password: requireEnvironment(`${prefix}_PASSWORD`),
  });
  if (error) throw new Error(`${role} login failed: ${error.message}`);
  return client;
}

async function probe(client, region) {
  const { data, error } = await client.rpc('run_rls_security_probe', { target_region: region });
  if (error) throw new Error(`RLS probe failed for ${region}: ${error.message}`);
  return data;
}

async function main() {
  if (!url || !anonKey) throw new Error('Configure RLS_TEST_URL and RLS_TEST_ANON_KEY');

  const anonymous = newClient();
  const { error: anonymousError } = await anonymous.rpc('run_rls_security_probe', {
    target_region: REQUIRED_REGIONS[0],
  });
  assert.ok(anonymousError, 'Anonymous users must not execute the RLS probe');

  const [admin, qc, viewer] = await Promise.all([
    signIn('admin'),
    signIn('qc'),
    signIn('viewer'),
  ]);

  const qcRegion = requireEnvironment('RLS_TEST_QC_REGION');
  assert.ok(REQUIRED_REGIONS.includes(qcRegion), 'RLS_TEST_QC_REGION must be a supported region');
  const foreignRegion = REQUIRED_REGIONS.find((region) => region !== qcRegion);

  const [adminResult, qcOwnResult, qcForeignResult, viewerResult] = await Promise.all([
    probe(admin, foreignRegion),
    probe(qc, qcRegion),
    probe(qc, foreignRegion),
    probe(viewer, REQUIRED_REGIONS[0]),
  ]);

  assert.equal(adminResult.effective_role, 'admin');
  assert.equal(adminResult.can_insert_target_region, true);
  assert.equal(qcOwnResult.effective_role, 'qc');
  assert.equal(qcOwnResult.managed_region, qcRegion);
  assert.equal(qcOwnResult.can_insert_target_region, true);
  assert.equal(qcForeignResult.can_insert_target_region, false);
  assert.equal(viewerResult.effective_role, 'viewer');
  assert.equal(viewerResult.can_insert_target_region, false);

  console.log(JSON.stringify({ status: 'passed', adminResult, qcOwnResult, qcForeignResult, viewerResult }, null, 2));
}

main().catch((error) => {
  console.error(`RLS integration test failed: ${error.message}`);
  process.exitCode = 1;
});
