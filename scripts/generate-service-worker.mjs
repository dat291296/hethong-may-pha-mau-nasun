import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const distDir = path.resolve('dist');

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path.join(directory, entry.name), relativePath));
    else if (entry.name !== 'sw.js' && entry.name !== '_headers' && !entry.name.endsWith('.map')) files.push(`/${relativePath}`);
  }
  return files.sort();
}

async function sha256File(relativeUrl) {
  const content = await readFile(path.join(distDir, relativeUrl.slice(1)));
  return createHash('sha256').update(content).digest('hex');
}

let files = await collectFiles(distDir);
const assetHashes = Object.fromEntries(await Promise.all(files.map(async file => [file, await sha256File(file)])));
assetHashes['/'] = assetHashes['/index.html'];
const fingerprintSource = Object.entries(assetHashes).sort(([a], [b]) => a.localeCompare(b));
const buildFingerprint = createHash('sha256').update(JSON.stringify(fingerprintSource)).digest('hex').slice(0, 16);

const manifest = { schemaVersion: 1, buildFingerprint, algorithm: 'SHA-256', assets: assetHashes };
await writeFile(path.join(distDir, 'build-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
assetHashes['/build-manifest.json'] = await sha256File('/build-manifest.json');
files = Array.from(new Set(['/index.html', '/', ...files, '/build-manifest.json']));
const cacheName = `nasun-offline-${buildFingerprint}`;

const serviceWorker = `const CACHE_NAME = ${JSON.stringify(cacheName)};
const CORE_FILES = ${JSON.stringify(files, null, 2)};
const ASSET_HASHES = ${JSON.stringify(assetHashes, null, 2)};

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

async function verifyResponse(pathname, response) {
  const expectedHash = ASSET_HASHES[pathname];
  if (!expectedHash || !response.ok || response.type === 'opaque') return false;
  const actualHash = await sha256Hex(await response.clone().arrayBuffer());
  return actualHash === expectedHash;
}

async function fetchVerified(url) {
  const response = await fetch(url, { cache: 'reload', redirect: 'error' });
  if (!await verifyResponse(url, response)) throw new Error('CACHE_INTEGRITY_FAILURE');
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(CORE_FILES.map(async url => cache.put(url, await fetchVerified(url))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkWithTimeout(request, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal, redirect: 'error' });
  } finally {
    clearTimeout(timeoutId);
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await networkWithTimeout(request);
        if (await verifyResponse('/index.html', response)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  if (!ASSET_HASHES[url.pathname]) return;
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached && await verifyResponse(url.pathname, cached)) return cached;
    try {
      const response = await fetchVerified(url.pathname);
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
`;

await writeFile(path.join(distDir, 'sw.js'), serviceWorker, 'utf8');
console.log(`[offline] Generated ${cacheName} with ${files.length} integrity-checked files.`);
