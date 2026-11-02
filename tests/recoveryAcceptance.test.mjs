import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessRecoveryAcceptance, writeRecoveryAcceptance } from '../scripts/recovery-acceptance.mjs';

const fixture = () => ({ passed: true, environment: 'disposable-local-Supabase-on-public-standard-runner',
  productionDataUsed: false, hostedRestoreVerified: false, revision: 'a'.repeat(40),
  restoredTableCount: 28, elapsedSeconds: 141, database: true, authIdentityAndPasswordLogin: true,
  privateStorageBytesAndDenials: true, regionalRls: true, grantsAndPolicies: true, encryptionRoundtrip: true });

test('a successful synthetic restore is never promoted to production backup recovery acceptance', () => {
  const result = assessRecoveryAcceptance({ ...fixture(), fullRestoreVerified: true, hostedRestoreVerified: true });
  assert.equal(result.syntheticRestoreVerified, true);
  assert.equal(result.productionArchiveRestoreVerified, false);
  assert.equal(result.hostedRestoreVerified, false);
});

test('missing Auth, Storage, permissions or encryption checks invalidate recovery evidence', () => {
  for (const key of ['database', 'authIdentityAndPasswordLogin', 'privateStorageBytesAndDenials',
    'regionalRls', 'grantsAndPolicies', 'encryptionRoundtrip', 'passed']) {
    assert.equal(assessRecoveryAcceptance({ ...fixture(), [key]: false }).syntheticRestoreVerified, false);
  }
  for (const other of [{ elapsedSeconds: 0 }, { restoredTableCount: 0 }, { revision: 'PRIVATE' },
    { environment: 'production' }, { productionDataUsed: true }]) {
    assert.equal(assessRecoveryAcceptance({ ...fixture(), ...other }).syntheticRestoreVerified, false);
  }
});

test('production recovery requires an identified archive, empty isolated target, data and ownership verification', () => {
  const evidence = { ...fixture(), source: 'production-archive', productionDataUsed: true,
    environment: 'isolated-restore-runner', destinationWasEmpty: true, isolatedDestination: true,
    databaseSnapshotsMatch: true, storageOwnershipVerified: true, archiveSha256: 'b'.repeat(64), backupRunId: 123 };
  assert.equal(assessRecoveryAcceptance(evidence).productionArchiveEvidenceComplete, true);
  assert.equal(assessRecoveryAcceptance(evidence).productionArchiveRestoreVerified, false);
  assert.equal(assessRecoveryAcceptance(evidence).hostedRestoreVerified, false);
  for (const key of ['destinationWasEmpty', 'isolatedDestination', 'databaseSnapshotsMatch', 'storageOwnershipVerified']) {
    assert.equal(assessRecoveryAcceptance({ ...evidence, [key]: false }).productionArchiveEvidenceComplete, false);
  }
  assert.equal(assessRecoveryAcceptance({ ...evidence, archiveSha256: '' }).productionArchiveEvidenceComplete, false);
  assert.equal(assessRecoveryAcceptance({ ...evidence, backupRunId: null }).productionArchiveEvidenceComplete, false);
});

test('published recovery report excludes customer data and refuses to overwrite prior evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nasun-recovery-acceptance-'));
  const input = join(directory, 'runtime.json'), output = join(directory, 'acceptance.json');
  await writeFile(input, JSON.stringify({ ...fixture(), email: 'PRIVATE', password: 'PRIVATE', rows: ['CUSTOMER'] }));
  await writeRecoveryAcceptance(input, output);
  const text = await readFile(output, 'utf8');
  assert.doesNotMatch(text, /PRIVATE|CUSTOMER|password|email/);
  assert.equal(JSON.parse(text).productionArchiveRestoreVerified, false);
  await assert.rejects(writeRecoveryAcceptance(input, output), { code: 'EEXIST' });
});

test('an incomplete drill cannot publish a successful acceptance file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nasun-recovery-incomplete-'));
  const input = join(directory, 'runtime.json'), output = join(directory, 'acceptance.json');
  await writeFile(input, JSON.stringify({ ...fixture(), database: false }));
  await assert.rejects(writeRecoveryAcceptance(input, output), { message: 'RECOVERY_RUNTIME_EVIDENCE_INCOMPLETE' });
  await assert.rejects(readFile(output), { code: 'ENOENT' });
});

test('monitoring defaults off, retains source map restrictions and creates no new notification channel', async () => {
  const [main, config, env, workflow] = await Promise.all([
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
    readFile(new URL('../.env.example', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/recovery-drill.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(main, /VITE_REMOTE_REPORTING_ENABLED === 'true'/);
  assert.match(env, /VITE_REMOTE_REPORTING_ENABLED=false/);
  assert.match(config, /sourcemap: false/);
  assert.match(config, /monitoring-csp/);
  assert.match(workflow, /output\/recovery-acceptance.json/);
  assert.doesNotMatch(workflow, /slack|webhook|send.mail|issues: write/i);
});
