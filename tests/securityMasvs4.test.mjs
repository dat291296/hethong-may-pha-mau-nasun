import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  NETWORK_POLICY,
  assertAllowedNetworkUrl,
  secureFetch,
  validateSupabaseEndpoint,
} from '../src/security/networkPolicy.js';

const profileUrl = new URL('../security/masvs/profile.json', import.meta.url);
const networkPolicyUrl = new URL('../security/masvs/network-policy.json', import.meta.url);
const headersUrl = new URL('../public/_headers', import.meta.url);
const gpsUrl = new URL('../src/utils/gpsHelper.js', import.meta.url);
const supabaseUrl = new URL('../src/lib/supabase.js', import.meta.url);

test('Supabase transport accepts only HTTPS project endpoints', () => {
  assert.equal(validateSupabaseEndpoint('https://project-ref.supabase.co'), 'https://project-ref.supabase.co');
  assert.throws(() => validateSupabaseEndpoint('http://project-ref.supabase.co'), /HTTPS/);
  assert.throws(() => validateSupabaseEndpoint('https://supabase.co.attacker.example'), /HTTPS/);
  assert.throws(() => validateSupabaseEndpoint('https://user:pass@project-ref.supabase.co'), /credentials/);
});

test('runtime network allowlist blocks cleartext and unknown hosts', () => {
  assert.equal(
    assertAllowedNetworkUrl('https://ipapi.co/json/', { allowExternal: true }).hostname,
    'ipapi.co',
  );
  assert.throws(
    () => assertAllowedNetworkUrl('https://ipapi.co/unsafe', { allowExternal: true }),
    /not allowlisted/,
  );
  assert.throws(
    () => assertAllowedNetworkUrl('http://api.bigdatacloud.net/data/reverse-geocode-client', { allowExternal: true }),
    /HTTPS/,
  );
});

test('secure fetch omits credentials, referrer, and redirects', async () => {
  const originalFetch = globalThis.fetch;
  let observed;
  globalThis.fetch = async (url, init) => {
    observed = { url, init };
    return { ok: true };
  };
  try {
    await secureFetch('https://ipapi.co/json/', {}, { allowExternal: true, timeoutMs: 1000 });
    assert.equal(observed.init.credentials, 'omit');
    assert.equal(observed.init.redirect, 'error');
    assert.equal(observed.init.referrerPolicy, 'no-referrer');
    assert.equal(observed.url, 'https://ipapi.co/json/');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('application routes Supabase and IP location through the network policy', async () => {
  const [supabaseSource, gpsSource] = await Promise.all([
    readFile(supabaseUrl, 'utf8'),
    readFile(gpsUrl, 'utf8'),
  ]);
  assert.match(supabaseSource, /createSupabaseFetch\(validatedSupabaseUrl\)/);
  assert.match(gpsSource, /secureFetch/);
  assert.doesNotMatch(gpsSource, /await fetch\(/);
});

test('CSP and future native policy deny cleartext transport', async () => {
  const [profile, policy, headers] = await Promise.all([
    readFile(profileUrl, 'utf8').then(JSON.parse),
    readFile(networkPolicyUrl, 'utf8').then(JSON.parse),
    readFile(headersUrl, 'utf8'),
  ]);
  assert.equal(profile.modules.find(item => item.id === 'MASVS-4')?.status, 'implemented');
  assert.equal(policy.clearTextTraffic, false);
  assert.equal(policy.redirectPolicy, 'deny');
  assert.ok(policy.nativeRequirements.android.some(item => item.includes('usesCleartextTraffic=false')));
  assert.ok(policy.nativeRequirements.ios.some(item => item.includes('does not allow arbitrary loads')));
  assert.match(headers, /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co https:\/\/api\.bigdatacloud\.net https:\/\/ipapi\.co/);
  assert.match(headers, /upgrade-insecure-requests/);
  assert.equal(NETWORK_POLICY.clearTextAllowed, false);
});
