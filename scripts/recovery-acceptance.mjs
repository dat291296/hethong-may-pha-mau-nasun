import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requiredChecks = ['database', 'authIdentityAndPasswordLogin', 'privateStorageBytesAndDenials',
  'regionalRls', 'grantsAndPolicies', 'encryptionRoundtrip'];
export function assessRecoveryAcceptance(evidence) {
  const runtimeChecksPassed = evidence?.passed === true && requiredChecks.every(key => evidence[key] === true)
    && Number.isSafeInteger(evidence?.restoredTableCount) && evidence.restoredTableCount > 0
    && Number.isSafeInteger(evidence?.elapsedSeconds) && evidence.elapsedSeconds > 0;
  const revisionValid = /^[a-f0-9]{40}$/.test(evidence?.revision || '');
  const syntheticRestoreVerified = runtimeChecksPassed && revisionValid && evidence?.productionDataUsed === false
    && evidence?.environment === 'disposable-local-Supabase-on-public-standard-runner';
  const productionArchiveEvidenceComplete = runtimeChecksPassed && revisionValid
    && evidence?.source === 'production-archive' && evidence?.productionDataUsed === true
    && evidence?.destinationWasEmpty === true && evidence?.isolatedDestination === true
    && evidence?.databaseSnapshotsMatch === true && evidence?.storageOwnershipVerified === true
    && /^[a-f0-9]{64}$/.test(evidence?.archiveSha256 || '')
    && Number.isSafeInteger(evidence?.backupRunId) && evidence.backupRunId > 0;
  // This parser checks metadata, not archive contents or restore execution.
  // Caller-supplied success flags must never certify a production restore.
  return { syntheticRestoreVerified, productionArchiveEvidenceComplete,
    productionArchiveRestoreVerified: false, hostedRestoreVerified: false,
    elapsedSeconds: runtimeChecksPassed ? evidence.elapsedSeconds : null,
    restoredTableCount: runtimeChecksPassed ? evidence.restoredTableCount : null,
    limitation: 'No independently verified production archive restore; metadata completeness, synthetic recovery and backup success are insufficient.' };
}

export async function writeRecoveryAcceptance(input, output) {
  const evidence = JSON.parse(await readFile(input, 'utf8'));
  const result = assessRecoveryAcceptance(evidence);
  if (!result.syntheticRestoreVerified && !result.productionArchiveEvidenceComplete) throw new Error('RECOVERY_RUNTIME_EVIDENCE_INCOMPLETE');
  // Publish only aggregate verification facts, never customer rows, credentials,
  // backup file names, signed download links or arbitrary evidence properties.
  await writeFile(output, JSON.stringify({ version: 1, revision: evidence.revision, ...result }, null, 2), { mode: 0o600, flag: 'wx' });
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeRecoveryAcceptance(process.argv[2], process.argv[3])
    .then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('RECOVERY_ACCEPTANCE_FAILED'); process.exitCode = 1; });
}
