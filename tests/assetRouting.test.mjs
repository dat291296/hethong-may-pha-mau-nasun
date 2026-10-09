import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

test('missing scripts cannot receive the SPA HTML fallback', async () => {
  const response = await worker.fetch(new Request('https://example.invalid/assets/old-build.js'), {
    ASSETS: { fetch: async () => new Response('<html>Shell</html>', { headers: { 'Content-Type': 'text/html' } }) },
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('existing JavaScript and navigation responses are preserved', async () => {
  for (const [path, type] of [['/assets/current.js', 'text/javascript'], ['/machines', 'text/html']]) {
    const original = new Response('content', { headers: { 'Content-Type': type } });
    const response = await worker.fetch(new Request('https://example.invalid' + path), { ASSETS: { fetch: async () => original } });
    assert.equal(response, original);
  }
});
