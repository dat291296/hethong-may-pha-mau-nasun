import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_11_mfa_enforcement.sql', import.meta.url);
const authUrl = new URL('../src/context/AuthContext.jsx', import.meta.url);
const gateUrl = new URL('../src/components/MfaGate.jsx', import.meta.url);
const loginUrl = new URL('../src/components/LoginModal.jsx', import.meta.url);

test('MFA migration preserves business data and enables privileged MFA', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /^\s*(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\b/im);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(sql, /WHERE role IN \('admin', 'qc'\)/);
});

test('database authorization requires aal2 for privileged roles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /auth\.jwt\(\)->>'aal'/);
  assert.match(sql, /role NOT IN \('admin', 'qc'\)/);
  assert.match(sql, /public\.has_privileged_aal\(\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.has_privileged_aal\(\) FROM anon/);
});

test('frontend enrolls and verifies TOTP before privileged access', async () => {
  const [auth, gate] = await Promise.all([readFile(authUrl, 'utf8'), readFile(gateUrl, 'utf8')]);
  assert.match(auth, /getAuthenticatorAssuranceLevel/);
  assert.match(auth, /PRIVILEGED_SESSION_MS = 8 \* 60 \* 60 \* 1000/);
  assert.match(gate, /mfa\.enroll/);
  assert.match(gate, /mfa\.challenge/);
  assert.match(gate, /mfa\.verify/);
});

test('login UI applies a local cooldown and stronger signup minimum', async () => {
  const login = await readFile(loginUrl, 'utf8');
  assert.match(login, /MAX_LOGIN_FAILURES = 5/);
  assert.match(login, /LOGIN_LOCK_MS = 15 \* 60 \* 1000/);
  assert.match(login, /mode === 'signup' \? 12 : 6/);
});
