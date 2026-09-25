import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const deployUrl = new URL('../.github/workflows/deploy.yml', import.meta.url);
const scanUrl = new URL('../.github/workflows/secret-scanning.yml', import.meta.url);
const ignoreUrl = new URL('../.gitignore', import.meta.url);
const rootUrl = new URL('../', import.meta.url);

test('deploy workflow reads public configuration from GitHub variables', async () => {
  const workflow = await readFile(deployUrl, 'utf8');
  assert.match(workflow, /vars\.VITE_SUPABASE_URL/);
  assert.match(workflow, /vars\.VITE_SUPABASE_ANON_KEY/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow, /sb_publishable_[A-Za-z0-9_-]+/);
});

test('local credentials and database exports are ignored', async () => {
  const ignore = await readFile(ignoreUrl, 'utf8');
  for (const pattern of ['.env.*', '*.pem', '*.key', '*.dump', '*.backup']) {
    assert.ok(ignore.includes(pattern), `Missing .gitignore pattern: ${pattern}`);
  }
  assert.match(ignore, /!\.env\.example/);
});

test('CI runs pinned Gitleaks scanning and source has no embedded publishable key', async () => {
  const workflow = await readFile(scanUrl, 'utf8');
  assert.match(workflow, /gitleaks\/gitleaks-action@[a-f0-9]{40}/);

  const files = [
    '.github/workflows/deploy.yml',
    'nasun-agent-software/config.json',
    'nasun-agent-software/agent_gui.py',
    'nasun-agent-software/NasunAgentSetup.cs',
  ];
  for (const file of files) {
    const content = await readFile(new URL(file, rootUrl), 'utf8');
    assert.doesNotMatch(content, /sb_publishable_[A-Za-z0-9_-]+/, `Embedded key remains in ${file}`);
  }
});
