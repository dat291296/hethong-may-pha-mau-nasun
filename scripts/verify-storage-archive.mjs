import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyStorageArchive(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('INVALID_STORAGE_MANIFEST');
  const seen = new Set();
  let totalBytes = 0;
  for (const entry of manifest.files) {
    if (typeof entry.bucket !== 'string' || typeof entry.name !== 'string'
      || !/^objects\/[a-f0-9]{64}$/.test(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || seen.has(entry.file)) throw new Error('INVALID_STORAGE_ENTRY');
    const expectedFile = `objects/${createHash('sha256').update(`${entry.bucket}\0${entry.name}`).digest('hex')}`;
    if (entry.file !== expectedFile) throw new Error('STORAGE_IDENTITY_MISMATCH');
    seen.add(entry.file);
    const handle = await open(join(directory, entry.file), 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size !== entry.bytes) throw new Error('STORAGE_SIZE_MISMATCH');
      const digest = createHash('sha256');
      let bytes = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        bytes += chunk.length; digest.update(chunk);
      }
      if (bytes !== entry.bytes || digest.digest('hex') !== entry.sha256) throw new Error('STORAGE_CHECKSUM_MISMATCH');
      totalBytes += bytes;
    } finally { await handle.close(); }
  }
  return { objects: manifest.files.length, bytes: totalBytes, scope: 'local-storage-files-only', databaseRestoreVerified: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyStorageArchive(process.argv[2]).then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('Storage archive verification failed.'); process.exitCode = 1; });
}
