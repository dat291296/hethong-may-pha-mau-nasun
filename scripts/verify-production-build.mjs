import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const forbiddenPatterns = [
  { name: 'Supabase service role key', pattern: /service_role/i },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'development account', pattern: /dev-admin|qc@dev\.local|viewer@dev\.local/ },
  { name: 'source map reference', pattern: /sourceMappingURL=/ },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

const files = await walk(distDir);
const sourceMaps = files.filter(file => file.endsWith('.map'));
if (sourceMaps.length > 0) throw new Error(`Production source maps are forbidden: ${sourceMaps.join(', ')}`);

for (const file of files.filter(item => /\.(?:html|js|json|css)$/i.test(item))) {
  const content = await readFile(file, 'utf8');
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(content)) throw new Error(`${rule.name} found in ${path.relative(distDir, file)}`);
  }
}

console.log(`[security] Production build verified (${files.length} files).`);
