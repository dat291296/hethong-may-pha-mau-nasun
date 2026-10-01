import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const healthUrl = new URL('../src/lib/syncHealth.js', import.meta.url);
const modalUrl = new URL('../src/components/DataBackupSyncModal.jsx', import.meta.url);

test('ENT-8 exposes actionable sync health without business payloads', async () => {
  const source = await readFile(healthUrl, 'utf8');
  assert.match(source, /state,/);
  assert.match(source, /queueItems: queue\.slice\(0, 50\)/);
  assert.match(source, /nextRetryInSeconds/);
  assert.match(source, /lastError: item\.lastError/);
  const queueProjection = source.slice(source.indexOf('queueItems:'), source.indexOf('transport:', source.indexOf('queueItems:')));
  assert.doesNotMatch(queueProjection, /payload/);
});

test('ENT-8 dashboard refreshes continuously and displays conflict states', async () => {
  const source = await readFile(modalUrl, 'utf8');
  assert.match(source, /window\.setInterval\(refreshSyncHealth, 5000\)/);
  assert.match(source, /Cần xử lý lỗi/);
  assert.match(source, /needs_review/);
  assert.match(source, /dead_letter/);
  assert.match(source, /nextRetryInSeconds/);
});
