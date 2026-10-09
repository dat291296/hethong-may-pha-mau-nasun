import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('readiness covers official groups without claiming live or native compliance', async () => {
  const report = JSON.parse(await readFile(new URL('../security/masvs/readiness.json', import.meta.url), 'utf8'));
  assert.deepEqual(report.groups.map(group => group.id), ['STORAGE', 'CRYPTO', 'AUTH', 'NETWORK', 'PLATFORM', 'CODE', 'RESILIENCE', 'PRIVACY'].map(id => `MASVS-${id}`));
  assert.ok(report.groups.every(group => group.state === 'source-only' && group.nativeState === 'not-verified'));
  for (const item of [...report.groups, ...report.priorities]) {
    for (const path of item.evidence) await access(new URL(`../${path}`, import.meta.url));
  }
  assert.ok(report.priorities.every(item => item.acceptance && item.remaining));
});
