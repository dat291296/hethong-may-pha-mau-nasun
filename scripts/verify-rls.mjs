import { verifyDeviceEdit } from './verify-device-edit.mjs';
import { verifyStorageAccess } from './verify-storage-access.mjs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { verifyWriteIntegrity } from './verify-write-integrity.mjs';
import { requireRlsConfiguration } from './rls-preflight.mjs';

const REQUIRED_REGIONS = ['Miền Bắc', 'Miền Trung', 'Miền Nam'];
const url = process.env.RLS_TEST_URL?.trim();
const anonKey = process.env.RLS_TEST_ANON_KEY?.trim();

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
  if (error) throw new Error(`${role} login failed: ${error.code || error.status || 'AUTH_FAILED'}`);
  return client;
}

async function probe(client, region) {
  const { data, error } = await client.rpc('run_rls_security_probe', { target_region: region });
  if (error) throw new Error(`RLS probe failed for ${region}: ${error.message}`);
  return data;
}

async function main() {
  requireRlsConfiguration(process.env);
  if (!url || !anonKey) throw new Error('Configure RLS_TEST_URL and RLS_TEST_ANON_KEY');
  const productionUrl = requireEnvironment('RLS_PRODUCTION_URL');
  if (new URL(url).origin === new URL(productionUrl).origin) throw new Error('RLS tests require an isolated staging project');

  const tables = ['distributors', 'system_sets', 'repair_tickets'];
  const anonymous = newClient();
  const { error: anonymousError } = await anonymous.rpc('run_rls_security_probe', { target_region: REQUIRED_REGIONS[0] });
  assert.ok(anonymousError, 'Anonymous users must not execute the RLS probe');
  for (const table of tables) {
    const { data, error } = await anonymous.from(table).select('*').limit(1);
    assert.ok(error || data?.length === 0, `Anonymous access exposed ${table}`);
  }

  const roles = ['admin', 'manager', 'technician', 'qc', 'viewer'];
  const clients = [];
  try {
    for (const role of roles) clients.push({ role, client: await signIn(role) });
    const admin = clients[0].client;
    await verifyDeviceEdit(admin, clients.find(item => item.role === 'viewer').client);
    console.log('Staging device edits verified: four categories, stock, assignment, move, stale-write rejection and rollback.');
    await verifyWriteIntegrity(admin);
    console.log('Staging recent authentication and stale-write rejection verified.');
    await verifyStorageAccess(anonymous, clients);
    console.log('Staging private Storage read, upload, delete and synthetic cleanup verified.');
    for (const region of REQUIRED_REGIONS) {
      const { count, error } = await admin.from('distributors').select('id', { count: 'exact', head: true }).eq('region', region);
      assert.ifError(error);
      assert.ok(count > 0, 'Staging requires synthetic distributor fixtures in every region');
    }
    for (const { role, client } of clients) {
      const region = role === 'admin' ? 'Toàn Quốc' : requireEnvironment(`RLS_TEST_${role.toUpperCase()}_REGION`);
      if (role !== 'admin') assert.ok(REQUIRED_REGIONS.includes(region), 'Test accounts require a concrete region');
      const { data: identity, error: identityError } = await client.auth.getUser();
      assert.ifError(identityError);
      const { data: profile, error: profileError } = await client.from('profiles').select('id,role,managed_region,is_active').eq('id', identity.user.id).single();
      assert.ifError(profileError);
      assert.equal(profile.role, role);
      assert.equal(profile.is_active, true);
      assert.equal(profile.managed_region, region);
      for (const targetRegion of REQUIRED_REGIONS) {
        const result = await probe(client, targetRegion);
        assert.equal(result.effective_role, role);
        const permitted = role === 'admin' || ['manager', 'qc'].includes(role) && targetRegion === region;
        assert.equal(result.can_insert_target_region, permitted, `${role} insert policy mismatch`);
        if (role !== 'admin' && targetRegion !== region) {
          for (const table of ['distributors', 'system_sets']) {
            const { data, error } = await client.from(table).select(table === 'system_sets' ? 'set_code' : 'id').eq('region', targetRegion).limit(1);
            assert.ifError(error);
            assert.equal(data.length, 0, `${role} can read a foreign region in ${table}`);
          }
        }
      }
    }
    console.log('RLS integration passed: anonymous + five roles, own/foreign region, rollback-only insert probes.');
  } finally {
    for (const { client } of clients) await client.auth.signOut({ scope: 'local' });
  }
}
main().catch((error) => {
  console.error(`RLS integration test failed: ${error.message}`);
  process.exitCode = 1;
});
