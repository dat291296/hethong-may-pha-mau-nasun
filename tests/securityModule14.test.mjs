import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_14_session_validation.sql', import.meta.url);
const authUrl = new URL('../src/context/AuthContext.jsx', import.meta.url);

test('session validation migration is read-only and authenticated-only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_session_security_state\(\)/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_session_security_state\(\) FROM anon/);
  assert.doesNotMatch(sql, /^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\b/im);
});

test('client revalidates sessions on interval, reconnect, focus, and visibility', async () => {
  const auth = await readFile(authUrl, 'utf8');
  assert.match(auth, /SESSION_VALIDATION_MS = 5 \* 60 \* 1000/);
  assert.match(auth, /rpc\('get_session_security_state'\)/);
  assert.match(auth, /addEventListener\('online', validateSession\)/);
  assert.match(auth, /addEventListener\('focus', validateSession\)/);
  assert.match(auth, /addEventListener\('visibilitychange', validateWhenVisible\)/);
});

test('invalid or disabled sessions are cleared without disabling offline access', async () => {
  const auth = await readFile(authUrl, 'utf8');
  assert.match(auth, /!navigator\.onLine/);
  assert.match(auth, /ACCOUNT_DISABLED_OR_MISSING/);
  assert.match(auth, /signOut\(\{ scope: 'local' \}\)/);
  assert.match(auth, /TOKEN_REFRESH_FAILED/);
  assert.match(auth, /persistOfflineUser\(null\)/);
});
