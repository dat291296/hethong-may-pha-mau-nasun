import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const headersUrl = new URL('../public/_headers', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

test('all routes receive required browser security headers', async () => {
  const headers = await readFile(headersUrl, 'utf8');
  assert.match(headers, /^\/\*/m);
  for (const name of [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
  ]) {
    assert.match(headers, new RegExp(`^  ${name}:`, 'm'));
  }
});

test('CSP blocks executable third-party content and permits required app services', async () => {
  const headers = await readFile(headersUrl, 'utf8');
  const csp = headers.split(/\r?\n/).find(line => line.includes('Content-Security-Policy:')) || '';
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-eval'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /https:\/\/\*\.supabase\.co/);
  assert.match(csp, /wss:\/\/\*\.supabase\.co/);
});

test('HTML no longer executes the unused Leaflet CDN script', async () => {
  const html = await readFile(indexUrl, 'utf8');
  assert.doesNotMatch(html, /unpkg\.com\/leaflet/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i);
});
