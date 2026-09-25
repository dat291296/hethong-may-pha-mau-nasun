import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_18_disable_mfa.sql', import.meta.url);
const authUrl = new URL('../src/context/AuthContext.jsx', import.meta.url);
const loginUrl = new URL('../src/components/LoginModal.jsx', import.meta.url);
const appUrl = new URL('../src/App.jsx', import.meta.url);

test('MFA requirement is disabled without modifying business tables', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /SET mfa_required = FALSE/);
  assert.match(sql, /WHERE id = auth\.uid\(\)[\s\S]*AND is_active = TRUE/);
  assert.match(sql, /NEW\.mfa_required := FALSE/);
  assert.doesNotMatch(sql, /(?:distributors|dispensers|mixers|computers|printers|system_sets)\s+(?:SET|DELETE)/i);
});

test('application no longer mounts or evaluates an MFA gate', async () => {
  const [app, auth] = await Promise.all([readFile(appUrl, 'utf8'), readFile(authUrl, 'utf8')]);
  assert.doesNotMatch(app, /MfaGate/);
  assert.doesNotMatch(auth, /mfaSatisfied|refreshMfaStatus|markMfaVerified|auth\.mfa/);
});

test('login screen has no shield decoration or email-format suggestion', async () => {
  const login = await readFile(loginUrl, 'utf8');
  assert.doesNotMatch(login, /ShieldCheck|auth-heading-icon/);
  assert.doesNotMatch(login, /placeholder="[^"]*@(?:gmail|nasun)\./i);
});
