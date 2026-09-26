import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const outputPath = path.resolve(process.argv[2] || 'dist/sbom.cdx.json');
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const components = [];

for (const [packagePath, metadata] of Object.entries(lock.packages || {})) {
  if (!packagePath || !metadata.version || packagePath.includes('node_modules/.bin/')) continue;
  const name = packagePath.split('node_modules/').pop();
  const component = {
    type: 'library',
    'bom-ref': `pkg:npm/${encodeURIComponent(name)}@${metadata.version}`,
    name,
    version: metadata.version,
    purl: `pkg:npm/${encodeURIComponent(name)}@${metadata.version}`,
    scope: metadata.dev ? 'optional' : 'required',
  };
  if (metadata.integrity?.startsWith('sha512-')) {
    component.hashes = [{ alg: 'SHA-512', content: Buffer.from(metadata.integrity.slice(7), 'base64').toString('hex') }];
  }
  components.push(component);
}

components.sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref']));
const serialSeed = createHash('sha256').update(JSON.stringify(components)).digest('hex');
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${serialSeed.slice(0, 8)}-${serialSeed.slice(8, 12)}-4${serialSeed.slice(13, 16)}-8${serialSeed.slice(17, 20)}-${serialSeed.slice(20, 32)}`,
  version: 1,
  metadata: {
    component: { type: 'application', name: lock.name, version: lock.version },
    tools: [{ vendor: 'NASUN', name: 'locked-npm-sbom-generator', version: '1' }],
  },
  components,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(sbom, null, 2), 'utf8');
console.log(`[security] CycloneDX SBOM generated with ${components.length} locked components.`);
