import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createClient } from '@supabase/supabase-js';

export async function inventoryStorage(storage) {
  const buckets = [];
  const bucketIds = new Set();
  while (true) {
    const { data, error } = await storage.listBuckets({ limit: 100, offset: buckets.length, sortColumn: 'name', sortOrder: 'asc' });
    if (error || !Array.isArray(data)) throw new Error('STORAGE_BUCKET_LIST_FAILED');
    if (!data.length) break;
    for (const bucket of data) {
      if (!bucket.id || bucketIds.has(bucket.id)) throw new Error('STORAGE_BUCKET_INVENTORY_CHANGED');
      bucketIds.add(bucket.id);
      buckets.push(bucket);
    }
  }
  const objects = [];
  for (const bucket of [...buckets].sort((a, b) => a.id.localeCompare(b.id))) {
    const folders = [''];
    const visited = new Set();
    while (folders.length) {
      const prefix = folders.shift();
      if (visited.has(prefix) || prefix.split('/').length > 128) throw new Error('STORAGE_FOLDER_CYCLE');
      visited.add(prefix);
      let offset = 0;
      const seen = new Set();
      while (true) {
        const { data, error: listError } = await storage.from(bucket.id).list(prefix, {
          limit: 500, offset, sortBy: { column: 'name', order: 'asc' }
        });
        if (listError || !Array.isArray(data)) throw new Error('STORAGE_OBJECT_LIST_FAILED');
        if (data.length === 0) break;
        for (const entry of data) {
          if (typeof entry.name !== 'string' || !entry.name || seen.has(entry.name)) throw new Error('STORAGE_INVENTORY_CHANGED');
          seen.add(entry.name);
          const name = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (name.split('/').some(part => part === '.' || part === '..')) throw new Error('INVALID_STORAGE_OBJECT_PATH');
          if (entry.id == null && entry.metadata == null) folders.push(name);
          else objects.push({ bucket: bucket.id, name, id: entry.id, updatedAt: entry.updated_at, metadata: entry.metadata });
        }
        offset += data.length;
      }
    }
  }
  objects.sort((a, b) => `${a.bucket}\0${a.name}`.localeCompare(`${b.bucket}\0${b.name}`));
  return { buckets, objects };
}

export async function exportStorageBackup({ storage, fetchObject, outputDirectory }) {
  const inventory = await inventoryStorage(storage);
  await mkdir(join(outputDirectory, 'objects'), { recursive: true, mode: 0o700 });
  const files = [];
  for (const object of inventory.objects) {
    const file = `objects/${createHash('sha256').update(`${object.bucket}\0${object.name}`).digest('hex')}`;
    const response = await fetchObject(object.bucket, object.name);
    if (!response.ok || !response.body) throw new Error(`STORAGE_DOWNLOAD_FAILED_HTTP_${response.status}`);
    let bytes = 0;
    const digest = createHash('sha256');
    const checksum = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      digest.update(chunk);
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), checksum, createWriteStream(join(outputDirectory, file), { flags: 'wx', mode: 0o600 }));
    const expectedSize = object.metadata?.size;
    if (expectedSize != null && Number(expectedSize) !== bytes) throw new Error('STORAGE_SIZE_MISMATCH');
    files.push({ ...object, file, bytes, sha256: digest.digest('hex') });
  }
  const after = await inventoryStorage(storage);
  const snapshot = value => JSON.stringify({
    buckets: [...value.buckets].sort((a, b) => a.id.localeCompare(b.id)), objects: value.objects
  });
  if (snapshot(inventory) !== snapshot(after)) throw new Error('STORAGE_CHANGED_DURING_BACKUP');
  const manifest = { version: 1, createdAt: new Date().toISOString(), buckets: inventory.buckets, files,
    recoveryVerification: 'Checksums verified locally; full Supabase restore drill is still required.' };
  await writeFile(join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
  return { objects: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) };
}

async function main() {
  const endpoint = new URL(process.env.BACKUP_SUPABASE_URL || '');
  const key = process.env.BACKUP_SUPABASE_SERVICE_ROLE_KEY;
  if (endpoint.protocol !== 'https:' || !key) throw new Error('BACKUP_STORAGE_CONFIGURATION_REQUIRED');
  const client = createClient(endpoint.origin, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const summary = await exportStorageBackup({
    storage: client.storage,
    outputDirectory: resolve(process.argv[2] || 'backup/recovery/storage'),
    fetchObject: (bucket, name) => fetch(`${endpoint.origin}/storage/v1/object/${encodeURIComponent(bucket)}/${name.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      redirect: 'error', signal: AbortSignal.timeout(300000)
    })
  });
  console.log(`Storage backup verified: ${summary.objects} objects, ${summary.bytes} bytes.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Storage backup failed; no verified recovery archive will be published.'); process.exitCode = 1; });
}
