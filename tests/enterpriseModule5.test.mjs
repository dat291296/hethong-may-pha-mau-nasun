import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/deploy.yml', import.meta.url);
const verifierUrl = new URL('../scripts/verify-deployment.mjs', import.meta.url);
const healthUrl = new URL('../public/health.json', import.meta.url);
const headersUrl = new URL('../public/_headers', import.meta.url);

test('ENT-5 deploy workflow serializes production releases and validates configuration', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /timeout-minutes:/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /account_id.*wrangler\.jsonc/);
});

test('ENT-5 performs a bounded HTTPS smoke test after deployment', async () => {
  const [workflow, verifier, healthText, headers] = await Promise.all([
    readFile(workflowUrl, 'utf8'),
    readFile(verifierUrl, 'utf8'),
    readFile(healthUrl, 'utf8'),
    readFile(headersUrl, 'utf8'),
  ]);
  const health = JSON.parse(healthText);
  assert.equal(health.status, 'ok');
  assert.match(workflow, /verify-deployment\.mjs/);
  assert.match(verifier, /DEPLOYMENT_URL_MUST_USE_HTTPS/);
  assert.match(verifier, /AbortSignal\.timeout\(15_000\)/);
  assert.match(verifier, /content-security-policy/);
  assert.match(verifier, /strict-transport-security/);
  assert.match(headers, /\/health\.json\s+Cache-Control: no-cache, no-store, must-revalidate/);
});
