import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const offlineDbUrl = new URL('../src/lib/offlineDb.js', import.meta.url);
const authContextUrl = new URL('../src/context/AuthContext.jsx', import.meta.url);
const cacheFiles = [
  new URL('../src/App.jsx', import.meta.url),
  new URL('../src/hooks/useAssets.js', import.meta.url),
  new URL('../src/hooks/useNpps.js', import.meta.url),
  new URL('../src/hooks/useRepairs.js', import.meta.url),
  new URL('../src/hooks/useAuditLogs.js', import.meta.url),
  new URL('../src/components/TechHandbook.jsx', import.meta.url),
];

test('offline cache and queue use non-extractable AES-GCM encryption', async () => {
  const source = await readFile(offlineDbUrl, 'utf8');
  assert.match(source, /AES-GCM/);
  assert.match(source, /generateKey\([^)]*\{ name: 'AES-GCM', length: 256 \}[^)]*false/s);
  assert.match(source, /crypto\.subtle\.encrypt/);
  assert.match(source, /crypto\.subtle\.decrypt/);
  assert.match(source, /ciphertext/);
  assert.match(source, /iv: Array\.from\(iv\)/);
});

test('offline records are isolated by authenticated owner', async () => {
  const source = await readFile(offlineDbUrl, 'utf8');
  assert.match(source, /scopedKey\(ownerId, key\)/);
  assert.match(source, /record\.ownerId === ownerId/);
  assert.match(source, /initializeOfflineStorage\(userId\)/);
});

test('business cache is not persisted as plaintext localStorage', async () => {
  const sources = await Promise.all(cacheFiles.map(file => readFile(file, 'utf8')));
  const combined = sources.join('\n');
  assert.doesNotMatch(combined, /localStorage\.setItem\(['"`]?(?:nasun_npps|nasun_dispensers|nasun_mixers|nasun_computers|nasun_printers|nasun_system_sets|nasun_audit_logs|cached_repair_tickets|tech_handbook_errors|tech_handbook_field_tips)/);
});

test('logout clears encrypted user data and protects pending offline changes', async () => {
  const offlineDb = await readFile(offlineDbUrl, 'utf8');
  const authContext = await readFile(authContextUrl, 'utf8');
  assert.match(offlineDb, /clearOfflineStorage/);
  assert.match(offlineDb, /deleteOwnedRecords\('cached_data', ownerId\)/);
  assert.match(offlineDb, /deleteOwnedRecords\('offline_queue', ownerId\)/);
  assert.match(offlineDb, /deleteRecord\('crypto_keys', ownerId\)/);
  assert.match(authContext, /pendingItems\.length > 0/);
  assert.match(authContext, /syncOfflineQueue\(\)/);
  assert.match(authContext, /await clearOfflineStorage\(signedOutUserId\)/);
});

test('legacy plaintext data is migrated before deletion', async () => {
  const source = await readFile(offlineDbUrl, 'utf8');
  assert.match(source, /const migrated = await setCache\(record\.key, record\.data\);\s*if \(migrated\) await deleteRecord/);
  assert.match(source, /const migrated = await addToQueue\(record\);\s*if \(migrated\) await deleteRecord/);
  assert.match(source, /const migrated = await setCache\(cacheKey, JSON\.parse\(raw\)\);\s*if \(migrated\) localStorage\.removeItem\(storageKey\)/);
});
