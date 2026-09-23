import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const distDir = path.resolve('dist');

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path.join(directory, entry.name), relativePath));
    } else if (entry.name !== 'sw.js' && entry.name !== '_headers' && !entry.name.endsWith('.map')) {
      files.push(`/${relativePath}`);
    }
  }
  return files;
}

const files = await collectFiles(distDir);
const indexContent = await readFile(path.join(distDir, 'index.html'), 'utf8');
const buildFingerprint = createHash('sha256').update(indexContent).digest('hex').slice(0, 16);
const cacheName = `nasun-offline-${buildFingerprint}`;
const coreFiles = Array.from(new Set(['/index.html', '/', ...files]));

const serviceWorker = `const CACHE_NAME = ${JSON.stringify(cacheName)};
const CORE_FILES = ${JSON.stringify(coreFiles, null, 2)};

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add('/index.html');
    await Promise.allSettled(CORE_FILES.map(url => cache.add(url)));
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
    return await fetch(request, { signal: controller.signal });
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
        if (response.ok) {
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

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    const networkPromise = fetch(request).then(async response => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);
    return cached || (await networkPromise) || Response.error();
  })());
});
`;

await writeFile(path.join(distDir, 'sw.js'), serviceWorker, 'utf8');
console.log(`[offline] Generated ${cacheName} with ${coreFiles.length} cached files.`);
