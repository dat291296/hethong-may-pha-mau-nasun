import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/staging.yml', import.meta.url);

test('ENT-6 uses an isolated manually approved staging environment', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /STAGING_SUPABASE_URL/);
  assert.match(workflow, /STAGING_SUPABASE_ANON_KEY/);
  assert.match(workflow, /PRODUCTION_SUPABASE_URL/);
  assert.match(workflow, /must not use the production Supabase project/);
  assert.match(workflow, /wrangler deploy --name kythuat-staging/);
  assert.match(workflow, /verify-deployment\.mjs/);
  assert.doesNotMatch(workflow, /push:\s*\n\s*branches:\s*\[?main/);
});
