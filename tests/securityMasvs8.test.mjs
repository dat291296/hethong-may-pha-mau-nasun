import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profileUrl = new URL('../security/masvs/profile.json', import.meta.url);
const packageUrl = new URL('../package.json', import.meta.url);
const lockUrl = new URL('../package-lock.json', import.meta.url);
const sbomUrl = new URL('../scripts/generate-sbom.mjs', import.meta.url);
const securityWorkflowUrl = new URL('../.github/workflows/security-analysis.yml', import.meta.url);
const deployWorkflowUrl = new URL('../.github/workflows/deploy.yml', import.meta.url);

test('release uses a committed npm lockfile and deterministic CycloneDX SBOM', async () => {
  const [pkg, lock, generator] = await Promise.all([
    readFile(packageUrl, 'utf8').then(JSON.parse),
    readFile(lockUrl, 'utf8').then(JSON.parse),
    readFile(sbomUrl, 'utf8'),
  ]);
  assert.equal(lock.lockfileVersion, 3);
  assert.match(pkg.scripts.build, /generate-sbom\.mjs/);
  assert.match(generator, /CycloneDX/);
  assert.match(generator, /specVersion: '1\.5'/);
  assert.match(generator, /metadata\.integrity/);
});

test('CI audits dependencies, generates an SBOM, and gates deployment on security tests', async () => {
  const [securityWorkflow, deployWorkflow] = await Promise.all([
    readFile(securityWorkflowUrl, 'utf8'), readFile(deployWorkflowUrl, 'utf8'),
  ]);
  assert.match(securityWorkflow, /npm ci --ignore-scripts/);
  assert.match(securityWorkflow, /npm audit --omit=dev --audit-level=critical/);
  assert.match(securityWorkflow, /generate-sbom\.mjs/);
  assert.match(securityWorkflow, /upload-artifact@[a-f0-9]{40} # v4/);
  assert.doesNotMatch(securityWorkflow, /uses: actions\/(?:checkout|setup-node|upload-artifact)@v\d/);
  assert.doesNotMatch(deployWorkflow, /uses: actions\/(?:checkout|setup-node)@v\d/);
  assert.match(deployWorkflow, /npm run test:security/);
  assert.match(deployWorkflow, /npm audit --omit=dev --audit-level=critical/);
});

test('MASVS-8 is marked implemented', async () => {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  assert.equal(profile.modules.find(item => item.id === 'MASVS-8')?.status, 'implemented');
});
