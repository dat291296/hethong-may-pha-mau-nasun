import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const agentUrl = new URL('../nasun-agent-software/agent.py', import.meta.url);
const guiUrl = new URL('../nasun-agent-software/agent_gui.py', import.meta.url);
const setupUrl = new URL('../nasun-agent-software/NasunAgentSetup.cs', import.meta.url);

test('agent formula downloads reject path traversal and non-HTTPS URLs', async () => {
  const [agent, setup] = await Promise.all([readFile(agentUrl, 'utf8'), readFile(setupUrl, 'utf8')]);
  assert.match(agent, /os\.path\.basename\(filename or ""\)/);
  assert.match(agent, /download_uri\.scheme != "https"/);
  assert.match(setup, /Path\.GetFileName\(filename\)/);
  assert.match(setup, /parsedDownloadUrl\.Scheme != Uri\.UriSchemeHttps/);
});

test('agent startup task does not invoke a command shell', async () => {
  const gui = await readFile(guiUrl, 'utf8');
  assert.doesNotMatch(gui, /subprocess\.run\([^\n]*shell=True/);
  assert.match(gui, /create_task_args/);
  assert.match(gui, /shell=False/);
});
