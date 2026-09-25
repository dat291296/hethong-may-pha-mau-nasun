import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/security_module_13_rls_probe.sql', import.meta.url);
const verifierUrl = new URL('../scripts/verify-rls.mjs', import.meta.url);
const workflowUrl = new URL('../.github/workflows/rls-integration.yml', import.meta.url);

test('RLS probe is invoker-scoped, authenticated-only, and non-persistent', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /RAISE EXCEPTION 'RLS_PROBE_ROLLBACK'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.run_rls_security_probe\(TEXT\) FROM anon/);
  assert.doesNotMatch(sql, /^\s*(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\b/im);
});

test('live verifier covers anonymous, vertical, and regional access boundaries', async () => {
  const verifier = await readFile(verifierUrl, 'utf8');
  assert.match(verifier, /Anonymous users must not execute the RLS probe/);
  assert.match(verifier, /adminResult\.can_insert_target_region, true/);
  assert.match(verifier, /qcOwnResult\.can_insert_target_region, true/);
  assert.match(verifier, /qcForeignResult\.can_insert_target_region, false/);
  assert.match(verifier, /viewerResult\.can_insert_target_region, false/);
});

test('privileged integration accounts retain MFA enforcement', async () => {
  const [verifier, workflow] = await Promise.all([
    readFile(verifierUrl, 'utf8'),
    readFile(workflowUrl, 'utf8'),
  ]);
  assert.match(verifier, /getAuthenticatorAssuranceLevel/);
  assert.match(verifier, /mfa\.challenge/);
  assert.match(verifier, /mfa\.verify/);
  assert.match(workflow, /RLS_TEST_ADMIN_TOTP_SECRET/);
  assert.match(workflow, /RLS_TEST_QC_TOTP_SECRET/);
});
