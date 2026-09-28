import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const htmlUrl = new URL('../public/docs/nasun-system-architecture.html', import.meta.url);
const publicManifestUrl = new URL('../public/docs/nasun-architecture.json', import.meta.url);
const sourceManifestUrl = new URL('../docs/nasun-architecture.json', import.meta.url);

test('ENT-4 publishes architecture matching the current PWA and Supabase boundary', async () => {
  const [html, publicManifest, sourceManifest] = await Promise.all([
    readFile(htmlUrl, 'utf8'),
    readFile(publicManifestUrl, 'utf8'),
    readFile(sourceManifestUrl, 'utf8'),
  ]);
  const publicModel = JSON.parse(publicManifest);
  const sourceModel = JSON.parse(sourceManifest);
  assert.equal(publicModel.updatedForModule, 'ENT-4');
  assert.equal(sourceModel.updatedForModule, 'ENT-4');
  assert.equal(publicModel.boundaries.directMachineControl, false);
  assert.equal(publicModel.boundaries.serviceRoleInClient, false);
  assert.match(html, /Supabase Auth \+ RLS/);
  assert.match(html, /Queue idempotent/);
  assert.match(html, /không điều khiển trực tiếp máy pha màu/);
});

test('ENT-4 removes stale executable-client and server-proxy claims', async () => {
  const sources = await Promise.all([
    readFile(htmlUrl, 'utf8'),
    readFile(publicManifestUrl, 'utf8'),
    readFile(sourceManifestUrl, 'utf8'),
  ]);
  const combined = sources.join('\n');
  assert.doesNotMatch(combined, /Desktop Agent|npp-agent|Edge Functions proxy|service key giu|materialized view/i);
});
