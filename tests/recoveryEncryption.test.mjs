import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir, open, rename } from 'node:fs/promises';
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
    const rejectedOutput = join(directory, 'rejected');
    await assert.rejects(decryptRecoveryBackup(output, rejectedOutput, 'different-synthetic-password'));
    await assert.rejects(readFile(rejectedOutput), { code: 'ENOENT' });
    const encrypted = await readFile(output);
    encrypted[100] ^= 1;
    await writeFile(output, encrypted);
    await assert.rejects(verifyEncryptedBackup(output, password));
    await assert.rejects(decryptRecoveryBackup(output, rejectedOutput, password));
    await assert.rejects(readFile(rejectedOutput), { code: 'ENOENT' });
    assert.deepEqual(await readFile(decrypted), content);
    assert.equal((await readdir(directory)).some(name => name.startsWith('.nasun-restore-')), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('verification and decryption keep the opened archive when its path is replaced', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nasun-encryption-race-'));
  try {
    const source = join(directory, 'source');
    const archive = join(directory, 'archive');
    const replaced = join(directory, 'replaced');
    const restored = join(directory, 'restored');
    const password = 'synthetic-backup-test-password';
    const content = Buffer.from('preserved synthetic recovery data');
    await writeFile(source, content);
    await encryptRecoveryBackup(source, archive, password);
    const probe = await open(archive, 'r');
    const prototype = Object.getPrototypeOf(probe);
    const originalStat = prototype.stat;
    await probe.close();
    for (const operation of [verifyEncryptedBackup, decryptRecoveryBackup]) {
      let swapped = false;
      t.mock.method(prototype, 'stat', async function (...args) {
        const result = await originalStat.apply(this, args);
        if (!swapped) {
          swapped = true;
          await rename(archive, replaced);
          await writeFile(archive, Buffer.alloc(100, 0));
        }
        return result;
      });
      if (operation === verifyEncryptedBackup) {
        const result = await operation(archive, password);
        assert.equal(result.sha256, createHash('sha256').update(content).digest('hex'));
      } else {
        await operation(archive, restored, password);
        assert.deepEqual(await readFile(restored), content);
      }
      t.mock.restoreAll();
      assert.equal(swapped, true);
      await rm(archive);
      await rename(replaced, archive);
    }
  } finally {
    t.mock.restoreAll();
    await rm(directory, { recursive: true, force: true });
  }
});
