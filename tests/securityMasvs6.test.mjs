import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profileUrl = new URL('../security/masvs/profile.json', import.meta.url);
const authUrl = new URL('../src/context/AuthContext.jsx', import.meta.url);
const supabaseUrl = new URL('../src/lib/supabase.js', import.meta.url);
const loginUrl = new URL('../src/components/LoginModal.jsx', import.meta.url);
const syncUrl = new URL('../src/lib/offlineSync.js', import.meta.url);
const viteUrl = new URL('../vite.config.js', import.meta.url);
const verifierUrl = new URL('../scripts/verify-production-build.mjs', import.meta.url);

test('production authentication fails closed instead of enabling mock admin', async () => {
  const [auth, supabase, login] = await Promise.all([
    readFile(authUrl, 'utf8'), readFile(supabaseUrl, 'utf8'), readFile(loginUrl, 'utf8'),
  ]);
  assert.match(supabase, /import\.meta\.env\.DEV && !isSupabaseConfigured/);
  assert.match(auth, /else if \(isDevelopmentFallback\)/);
  assert.match(auth, /Production must fail closed/);
  assert.match(auth, /isDevMode: isDevelopmentFallback/);
  assert.match(login, /AUTH_CONFIGURATION_UNAVAILABLE/);
});

test('production build omits source maps and verifies leaked secrets or dev identities', async () => {
  const [vite, verifier] = await Promise.all([readFile(viteUrl, 'utf8'), readFile(verifierUrl, 'utf8')]);
  assert.match(vite, /sourcemap: false/);
  assert.match(vite, /minify: 'oxc'/);
  assert.match(verifier, /PRIVATE KEY/);
  assert.match(verifier, /dev-admin/);
  assert.match(verifier, /sourceMappingURL/);
});

test('offline synchronization does not log business payloads', async () => {
  const source = await readFile(syncUrl, 'utf8');
  assert.doesNotMatch(source, /console\.(?:log|debug)\([^\n]*item\.payload/);
  assert.doesNotMatch(source, /console\.(?:log|debug)\([^\n]*, payload\)/);
});

test('MASVS-6 is marked implemented', async () => {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  assert.equal(profile.modules.find(item => item.id === 'MASVS-6')?.status, 'implemented');
});
