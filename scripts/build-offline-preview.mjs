import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../previews/offline/', import.meta.url));
const destination = fileURLToPath(new URL('../output/stage1-preview/', import.meta.url));
export async function buildOfflinePreview() {
  await mkdir(destination, { recursive: true });
  const result = await build({
    configFile: false, root, envDir: false, publicDir: false,
    envPrefix: 'NASUN_PREVIEW_PUBLIC_UNUSED_', base: './',
    plugins: [react(), {
      name: 'synthetic-preview-boundary',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue;
          if (Object.keys(output.modules).some(id => /(?:\/src\/lib\/supabase\.js|\/src\/context\/AuthContext\.jsx|@supabase\/)/.test(id.replaceAll('\\', '/')))) {
            throw new Error('PREVIEW_REAL_BACKEND_IMPORT_REJECTED');
          }
        }
      },
    }],
    build: { outDir: destination, emptyOutDir: false, sourcemap: false,
      rolldownOptions: { input: { index: resolve(root, 'index.html'), regression: resolve(root, 'regression.html') } },
    },
  });
  await copyFile(new URL('../public/nasun_logo.png', import.meta.url), resolve(destination, 'nasun_logo.png'));
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output.map(file => file.fileName));
  const names = [...new Set([...outputs, 'nasun_logo.png'])];
  const files = await Promise.all(names.map(async path => {
    const bytes = await readFile(resolve(destination, path));
    const text = path.endsWith('.js') || path.endsWith('.html') ? bytes.toString('utf8') : '';
    if (/sb_secret_|service_role|SUPABASE_SERVICE_ROLE_KEY|BEGIN (?:RSA |EC )?PRIVATE KEY|tqoxyharlsubyqjxjnfg|kenznmtdfuexmfrtzypb/.test(text)) throw new Error('PREVIEW_UNEXPECTED_BACKEND_OR_SECRET_REFERENCE');
    return { path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  const manifest = { version: 1, synthetic: true, backendConnected: false, files };
  await writeFile(resolve(destination, 'preview-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('[stage1] Isolated synthetic preview built; no application environment files or backend client included.');
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildOfflinePreview().catch(() => { console.error('OFFLINE_PREVIEW_BUILD_FAILED'); process.exitCode = 1; });
