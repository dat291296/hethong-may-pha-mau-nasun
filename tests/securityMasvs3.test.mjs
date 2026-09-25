import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const supabaseUrl = new URL('../src/lib/supabase.js', import.meta.url);
const authRuntimeUrl = new URL('../src/security/authRuntime.js', import.meta.url);
const loginUrl = new URL('../src/components/LoginModal.jsx', import.meta.url);
const bridgeUrl = new URL('../src/platform/mobileSecurityBridge.js', import.meta.url);
const profileUrl = new URL('../security/masvs/profile.json', import.meta.url);

test('Supabase authentication uses PKCE and the runtime storage adapter', async () => {
  const source = await readFile(supabaseUrl, 'utf8');
  assert.match(source, /flowType: 'pkce'/);
  assert.match(source, /storage: secureAuthStorage/);
  assert.match(source, /persistSession: true/);
  assert.match(source, /autoRefreshToken: true/);
});

test('native sessions require secure platform storage and approved redirects', async () => {
  const [runtime, bridge] = await Promise.all([
    readFile(authRuntimeUrl, 'utf8'),
    readFile(bridgeUrl, 'utf8'),
  ]);
  assert.match(bridge, /'getSecureItem'/);
  assert.match(bridge, /'setSecureItem'/);
  assert.match(bridge, /'removeSecureItem'/);
  assert.match(bridge, /'getAuthRedirectUrl'/);
  assert.match(runtime, /capabilities\.platform === 'native' && !capabilities\.nativeBridge/);
  assert.match(runtime, /INVALID_NATIVE_AUTH_REDIRECT/);
});

test('email verification, recovery, and OAuth use centralized redirect generation', async () => {
  const source = await readFile(loginUrl, 'utf8');
  assert.match(source, /getAuthRedirectUrl\(AUTH_REDIRECT_PURPOSES\.LOGIN\)/);
  assert.match(source, /getAuthRedirectUrl\(AUTH_REDIRECT_PURPOSES\.VERIFIED\)/);
  assert.match(source, /getAuthRedirectUrl\(AUTH_REDIRECT_PURPOSES\.RECOVERY\)/);
  assert.doesNotMatch(source, /redirectTo: window\.location\.origin/);
});

test('local login throttling does not store plaintext email identifiers', async () => {
  const [runtime, login] = await Promise.all([
    readFile(authRuntimeUrl, 'utf8'),
    readFile(loginUrl, 'utf8'),
  ]);
  assert.match(runtime, /subtle\.digest\('SHA-256'/);
  assert.match(login, /const identifier = await createPrivateIdentifier\(email\)/);
  assert.doesNotMatch(login, /attempts\[email\]/);
});

test('MASVS-3 is implemented without mandatory MFA', async () => {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  const module = profile.modules.find(item => item.id === 'MASVS-3');
  assert.equal(module?.status, 'implemented');
  assert.equal(profile.mobileMigrationRules.mfaMandatory, false);
});
