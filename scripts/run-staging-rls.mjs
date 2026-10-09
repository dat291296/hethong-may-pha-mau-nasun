import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const expectedHost = 'kenznmtdfuexmfrtzypb.supabase.co';
const url = process.env.RLS_TEST_URL;
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const users = [];
let client;

async function main() {
  if (!url || new URL(url).hostname !== expectedHost || new URL(url).protocol !== 'https:') {
    throw new Error('Temporary accounts require the approved nasun-staging project');
  }
  if (new URL(url).origin === new URL(process.env.RLS_PRODUCTION_URL).origin) {
    throw new Error('Staging must be isolated from production');
  }
  if (!key) throw new Error('STAGING_SUPABASE_SERVICE_ROLE_KEY is required');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, options = {}) => {
      try {
        const response = await fetch(input, { ...options, signal: AbortSignal.any([options.signal, AbortSignal.timeout(30000)].filter(Boolean)) });
        if (response.status >= 400) console.error(`Staging setup HTTP status: ${response.status}`);
        return response;
      } catch (error) {
        const codes = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'ERR_INVALID_ARG_TYPE'];
        const code = codes.includes(error.cause?.code) ? error.cause.code : codes.includes(error.code) ? error.code : 'NETWORK_REQUEST_FAILED';
        console.error(`Staging setup network error: ${code}`);
        throw error;
      }
    } },
  });
  for (const region of ['Miền Bắc', 'Miền Trung', 'Miền Nam']) {
    const { count, error } = await client.from('distributors').select('id', { count: 'exact', head: true }).eq('region', region);
    if (error || !count) {
      const reason = error ? (error.code || (/timeout|abort/i.test(error.message) ? 'REQUEST_TIMEOUT' : 'QUERY_FAILED')) : 'NO_FIXTURES';
      throw new Error(`Staging fixture storage check failed for ${region} (${reason})`);
    }
  }
  const env = { ...process.env };
  delete env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  for (const role of ['admin', 'manager', 'technician', 'qc', 'viewer']) {
    console.log(`Preparing synthetic staging role: ${role}`);
    const email = `nasun-rls-${role}-${randomUUID()}@example.invalid`;
    const password = randomBytes(32).toString('base64url');
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${password}`);
    const region = role === 'admin' ? 'Toàn Quốc' : 'Miền Bắc';
    const { data, error } = await client.auth.admin.createUser({
      email, password, email_confirm: true,
      app_metadata: { nasun_rls_fixture: true, fixture_role: role, fixture_region: region },
    });
    if (error || !data.user) throw new Error(`Cannot create staging ${role} fixture (${error?.code || 'AUTH_FAILED'})`);
    users.push(data.user.id);
    const { data: fixtureIdentity, error: fixtureIdentityError } = await client.auth.admin.getUserById(data.user.id);
    if (fixtureIdentityError || fixtureIdentity.user?.app_metadata?.nasun_rls_fixture !== true) {
      throw new Error('Generated staging account is missing its trusted fixture marker');
    }
    const { error: removeProfileError } = await client.from('profiles').delete().eq('id', data.user.id);
    if (removeProfileError) throw new Error(`Cannot initialize generated staging profile (${removeProfileError.code})`);
    const { error: insertProfileError } = await client.from('profiles').insert({
      id: data.user.id, full_name: `Synthetic staging ${role}`, role, managed_region: region, is_active: true, mfa_required: false,
    });
    if (insertProfileError) throw new Error(`Cannot insert generated staging profile (${insertProfileError.code})`);
    const { data: profile, error: profileError } = await client.from('profiles').select('role,managed_region,is_active,mfa_required').eq('id', data.user.id).single();
    if (profileError || profile?.role !== role || profile?.managed_region !== region || profile?.is_active !== true) {
      throw new Error(`Staging ${role} profile initialization failed (${profileError?.code || `role=${profile?.role}; region=${profile?.managed_region}; active=${profile?.is_active}`})`);
    }
    env[`RLS_TEST_${role.toUpperCase()}_EMAIL`] = email;
    env[`RLS_TEST_${role.toUpperCase()}_PASSWORD`] = password;
    env[`RLS_TEST_${role.toUpperCase()}_REGION`] = region;
  }
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify-rls.mjs'], { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('Staging RLS verification failed')));
  });
  const { verifySessionRevocation } = await import('./verify-session-revocation.mjs');
  await verifySessionRevocation(client, env);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const id of users.reverse()) {
    const { error } = await client.auth.admin.deleteUser(id);
    if (error) {
      console.error('Failed to remove a temporary staging account');
      process.exitCode = 1;
    }
  }
}
