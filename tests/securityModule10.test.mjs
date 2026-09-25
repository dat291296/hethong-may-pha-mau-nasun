import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/security-analysis.yml', import.meta.url);

test('security CI scans production dependencies and source code', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /npm audit --omit=dev --audit-level=critical/);
  assert.match(workflow, /languages: javascript-typescript,python/);
  assert.match(workflow, /queries: security-extended/);
});

test('CodeQL actions are pinned and receive minimum permissions', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /github\/codeql-action\/init@[a-f0-9]{40}/);
  assert.match(workflow, /github\/codeql-action\/analyze@[a-f0-9]{40}/);
  assert.match(workflow, /security-events: write/);
  assert.match(workflow, /contents: read/);
});
