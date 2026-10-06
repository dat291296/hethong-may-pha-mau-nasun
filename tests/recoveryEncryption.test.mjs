import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { encryptRecoveryBackup, verifyEncryptedBackup, decryptRecoveryBackup } from '../scripts/encrypt-recovery-backup.mjs';

test('recovery archives authenticate roundtrips and reject corruption or wrong passwords', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nasun-encryption-test-'));
  try {
    const input = join(directory, 'input');
    const output = join(directory, 'output');
    const password = 'synthetic-backup-test-password';
    const content = Buffer.alloc(1024 * 1024, 'test');
    await writeFile(input, content);
    const result = await encryptRecoveryBackup(input, output, password);
    assert.equal(result.bytes, content.length);
    assert.equal(result.sha256, createHash('sha256').update(content).digest('hex'));
    const decrypted = join(directory, 'decrypted');
    await decryptRecoveryBackup(output, decrypted, password);
    assert.deepEqual(await readFile(decrypted), content);
    await assert.rejects(decryptRecoveryBackup(output, decrypted, password), { code: 'EEXIST' });
    await assert.rejects(verifyEncryptedBackup(output, 'different-synthetic-password'));
    const encrypted = await readFile(output);
    encrypted[100] ^= 1;
    await writeFile(output, encrypted);
    await assert.rejects(verifyEncryptedBackup(output, password));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
