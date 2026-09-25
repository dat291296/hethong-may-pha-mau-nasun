import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const offlineDbUrl = new URL('../src/lib/offlineDb.js', import.meta.url);
const bridgeUrl = new URL('../src/platform/mobileSecurityBridge.js', import.meta.url);
const profileUrl = new URL('../security/masvs/profile.json', import.meta.url);

test('encrypted records bind owner, store, and logical key with AES-GCM AAD', async () => {
  const source = await readFile(offlineDbUrl, 'utf8');
  assert.match(source, /function encryptionContext\(ownerId, storeName, logicalKey\)/);
  assert.match(source, /additionalData/);
  assert.match(source, /nasun\|\$\{CRYPTO_VERSION\}\|\$\{ownerId\}\|\$\{storeName\}\|\$\{logicalKey\}/);
  assert.match(source, /cryptoVersion: CRYPTO_VERSION/);
});

test('legacy encrypted records are upgraded without deleting failed records', async () => {
  const source = await readFile(offlineDbUrl, 'utf8');
  const upgradeStart = source.indexOf('async function upgradeEncryptedRecords');
  const upgradeEnd = source.indexOf('\nasync function deleteRecord', upgradeStart);
  const upgradeFunction = source.slice(upgradeStart, upgradeEnd);
  assert.match(source, /upgradeEncryptedRecords\(ownerId\)/);
  assert.match(source, /await putRecord\(storeName, \{ \.\.\.record, \.\.\.upgraded/);
  assert.match(source, /Preserved legacy encrypted/);
  assert.doesNotMatch(upgradeFunction, /\.delete\(|deleteRecord/);
});

test('web keys are non-extractable and have lifecycle metadata', async () => {
  const source = await readFile(offlineDbUrl, 'utf8');
  assert.match(source, /generateKey\([^)]*AES-GCM[^)]*false/s);
  assert.match(source, /keyLength: 256/);
  assert.match(source, /keyVersion: 1/);
  assert.match(source, /deleteRecord\('crypto_keys', ownerId\)/);
});

test('native runtime delegates cryptography to the platform keystore bridge', async () => {
  const [offlineDb, bridge] = await Promise.all([
    readFile(offlineDbUrl, 'utf8'),
    readFile(bridgeUrl, 'utf8'),
  ]);
  assert.match(bridge, /'encrypt'/);
  assert.match(bridge, /'decrypt'/);
  assert.match(offlineDb, /cryptoProvider: 'native-keystore'/);
  assert.match(offlineDb, /getNativeKeyAlias\(ownerId\)/);
  assert.match(offlineDb, /hardwareBacked: true/);
  assert.match(offlineDb, /capabilities\.platform === 'native' && !capabilities\.nativeBridge/);
  assert.match(offlineDb, /requireNativeSecurityBridge\(\)/);
});

test('MASVS-2 is marked implemented', async () => {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  const module = profile.modules.find(item => item.id === 'MASVS-2');
  assert.equal(module?.status, 'implemented');
});
