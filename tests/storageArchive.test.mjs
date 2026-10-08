import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyStorageArchive } from '../scripts/verify-storage-archive.mjs';

test('disk verifier detects tampering, missing files and traversal without restoring data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nasun-storage-verify-'));
  try {
    await mkdir(join(directory, 'objects'));
    const content = Buffer.from('synthetic');
    const entry = { bucket: 'documents', name: 'example', file: `objects/${createHash('sha256').update('documents\0example').digest('hex')}`, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
    const save = files => writeFile(join(directory, 'manifest.json'), JSON.stringify({ version: 1, files }));
    await save([entry]); await writeFile(join(directory, entry.file), content);
    assert.equal((await verifyStorageArchive(directory)).databaseRestoreVerified, false);
    await writeFile(join(directory, entry.file), 'corrupted');
    await assert.rejects(verifyStorageArchive(directory), /CHECKSUM/);
    await save([{ ...entry, file: '../outside' }]);
    await assert.rejects(verifyStorageArchive(directory), /INVALID_STORAGE_ENTRY/);
    await save([entry]); await rm(join(directory, entry.file));
    await assert.rejects(verifyStorageArchive(directory), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
