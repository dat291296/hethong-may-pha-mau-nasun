import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PREVIEW_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
export async function createOfflinePreviewServer({ directory = fileURLToPath(new URL('../output/stage1-preview/', import.meta.url)), port = 5214 } = {}) {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(resolve(root, 'preview-manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.synthetic !== true || manifest.backendConnected !== false || !Array.isArray(manifest.files)) throw new Error('PREVIEW_MANIFEST_REQUIRED');
  const files = new Map();
  for (const entry of manifest.files) {
    const path = resolve(root, entry.path);
    if (!path.startsWith(root + sep) || !/^[a-zA-Z0-9_./-]+$/.test(entry.path)) throw new Error('PREVIEW_INVALID_ASSET');
    const bytes = await readFile(path);
    if (bytes.length !== entry.size || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('PREVIEW_INTEGRITY_FAILED');
    files.set('/' + entry.path, bytes);
  }
  const receipts = new Set();
  const server = createServer(async (request, response) => {
    const address = server.address();
    const hosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
    response.setHeader('Content-Security-Policy', PREVIEW_CSP);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (!hosts.includes(request.headers.host) || (request.headers.origin && !hosts.some(host => request.headers.origin === `http://${host}`))) { response.writeHead(403).end(); return; }
    if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    let url;
    try { url = new URL(request.url, 'http://127.0.0.1'); } catch { response.writeHead(400).end(); return; }
    if (url.pathname === '/__fixture') {
      const scenario = url.searchParams.get('scenario');
      const operation = url.searchParams.get('operation') || '';
      if (['lost-ack','replay'].includes(scenario)) {
        if (!/^s1-[a-z0-9-]{1,80}$/.test(operation) || receipts.size >= 1000) { response.writeHead(400).end(); return; }
        if (scenario === 'lost-ack') { receipts.add(operation); request.socket.destroy(); return; }
        if (!receipts.has(operation)) { response.writeHead(404).end(); return; }
        response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({ operation, commits: 1, synthetic: true })); return;
      }
      if (scenario === 'timeout') {
        const timer = setTimeout(() => { response.writeHead(200).end('{"synthetic":true}'); }, 2000);
        response.on('close', () => clearTimeout(timer)); return;
      }
      const status = { online: 200, unauthorized: 401, forbidden: 403, conflict: 409, invalid: 422, transient: 503 }[scenario];
      if (!status) { response.writeHead(400).end(); return; }
      response.setHeader('Content-Type','application/json'); response.writeHead(status).end('{"synthetic":true}'); return;
    }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const bytes = files.get(path);
    if (!bytes) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' }[extname(path)] || 'application/octet-stream');
    response.writeHead(200).end(request.method === 'HEAD' ? undefined : bytes);
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  return { server, origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((accept, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : accept()); }) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port=Number(process.argv[2] || 5214);
  if (!Number.isSafeInteger(port) || port<1024 || port>65535) throw new Error('INVALID_LOCAL_PREVIEW_PORT');
  createOfflinePreviewServer({port}).then(instance => { console.log(`[stage1] Synthetic preview: ${instance.origin}`); }).catch(() => { console.error('OFFLINE_PREVIEW_SERVER_FAILED'); process.exitCode = 1; });
}
