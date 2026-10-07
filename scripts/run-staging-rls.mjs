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
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const env = { ...process.env };
  delete env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  for (const role of ['admin', 'manager', 'technician', 'qc', 'viewer']) {
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
    env[`RLS_TEST_${role.toUpperCase()}_EMAIL`] = email;
    env[`RLS_TEST_${role.toUpperCase()}_PASSWORD`] = password;
    env[`RLS_TEST_${role.toUpperCase()}_REGION`] = region;
  }
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify-rls.mjs'], { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('Staging RLS verification failed')));
  });
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
