import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profileUrl = new URL('../security/masvs/profile.json', import.meta.url);
const generatorUrl = new URL('../scripts/generate-service-worker.mjs', import.meta.url);
const mainUrl = new URL('../src/main.jsx', import.meta.url);

test('service worker uses a versioned SHA-256 asset manifest', async () => {
  const source = await readFile(generatorUrl, 'utf8');
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /build-manifest\.json/);
  assert.match(source, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(source, /CACHE_INTEGRITY_FAILURE/);
});

test('cache installation fails closed and runtime caches only manifest assets', async () => {
  const source = await readFile(generatorUrl, 'utf8');
  assert.match(source, /await Promise\.all\(CORE_FILES/);
  assert.doesNotMatch(source, /Promise\.allSettled\(CORE_FILES/);
  assert.match(source, /if \(!ASSET_HASHES\[url\.pathname\]\) return/);
  assert.match(source, /url\.origin !== self\.location\.origin/);
});

test('PWA registration bypasses HTTP cache and reloads after controller change', async () => {
  const source = await readFile(mainUrl, 'utf8');
  assert.match(source, /updateViaCache: 'none'/);
  assert.match(source, /controllerchange/);
  assert.match(source, /window\.location\.reload\(\)/);
});

test('MASVS-7 is marked implemented', async () => {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  assert.equal(profile.modules.find(item => item.id === 'MASVS-7')?.status, 'implemented');
});
