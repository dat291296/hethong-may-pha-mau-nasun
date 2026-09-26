import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/sync_sec_module_1_foundation.sql', import.meta.url);
const trustedDeviceUrl = new URL('../src/security/trustedDevice.js', import.meta.url);
const syncQueueUrl = new URL('../src/lib/syncQueue.js', import.meta.url);
const authUrl = new URL('../src/context/AuthContext.jsx', import.meta.url);

test('SYNC-SEC-1 migration is additive and does not mutate business records', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.sync_operations/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.trusted_devices/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.account_sessions/);
  assert.doesNotMatch(sql, /(?:DELETE FROM|TRUNCATE|DROP TABLE)\s+public\.(?:distributors|dispensers|mixers|computers|printers|system_sets)/i);
});

test('sync ledger derives user identity from auth and rejects operation reuse mismatch', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /caller_id UUID := auth\.uid\(\)/);
  assert.match(sql, /OPERATION_ID_REUSE_MISMATCH/);
  assert.match(sql, /octet_length\(payload::TEXT\) > 262144/);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.sync_operations FROM authenticated/);
});

test('trusted devices replace MFA with bounded sessions and anomaly events', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /trusted_until[\s\S]*INTERVAL '90 days'/);
  assert.match(sql, /expires_at[\s\S]*INTERVAL '24 hours'/);
  assert.match(sql, /idle_expires_at[\s\S]*INTERVAL '8 hours'/);
  assert.match(sql, /OFFSET 2/);
  assert.match(sql, /ANOMALOUS_LOGIN_DETECTED/);
  assert.doesNotMatch(sql, /auth\.mfa|aal2|mfa_required/i);
});

test('client registers and revalidates trusted sessions with deployment fallback', async () => {
  const [device, auth, syncQueue] = await Promise.all([
    readFile(trustedDeviceUrl, 'utf8'), readFile(authUrl, 'utf8'), readFile(syncQueueUrl, 'utf8')
  ]);
  assert.match(device, /PGRST202/);
  assert.match(device, /register_trusted_device_session/);
  assert.match(device, /validate_trusted_device_session/);
  assert.match(auth, /registerTrustedDeviceSession/);
  assert.match(auth, /validateTrustedDeviceSession/);
  assert.match(syncQueue, /SYNC_CONTRACT_VERSION/);
  assert.match(syncQueue, /entityType/);
});
