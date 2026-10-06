import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { inventoryStorage, exportStorageBackup } from '../scripts/export-storage-backup.mjs';

function mockStorage(entries, pageCap = 200) {
  return {
    listBuckets: async ({ offset }) => ({ data: offset ? [] : [{ id: 'documents', public: false }] }),
    from: () => ({ list: async (prefix, options) => ({ data: (entries[prefix] || []).slice(options.offset, options.offset + pageCap) }) })
  };
}

test('Storage inventory includes nested files and more than 1000 objects', async () => {
  const entries = Array.from({ length: 1203 }, (_, index) => ({ id: `file-${index}`, name: `${index}.pdf`, metadata: { size: 3 } }));
  const inventory = await inventoryStorage(mockStorage({ '': [{ id: null, metadata: null, name: 'manuals' }], manuals: entries }));
  assert.equal(inventory.objects.length, 1203);
  assert.equal(inventory.objects[0].bucket, 'documents');
  assert.ok(inventory.objects.every(file => file.name.startsWith('manuals/')));
});

test('Storage export preserves names in manifest and validates file contents', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'nasun-storage-test-'));
  try {
    const content = Buffer.from('Synthetic document');
    const storage = mockStorage({ '': [{ id: 'file', name: 'Tài liệu.pdf', metadata: { size: content.length } }] });
    const result = await exportStorageBackup({ storage, outputDirectory, fetchObject: async () => new Response(content) });
    assert.equal(result.objects, 1);
    const manifest = JSON.parse(await readFile(join(outputDirectory, 'manifest.json'), 'utf8'));
    assert.equal(manifest.files[0].name, 'Tài liệu.pdf');
    assert.equal(manifest.files[0].sha256, createHash('sha256').update(content).digest('hex'));
    assert.deepEqual(await readFile(join(outputDirectory, manifest.files[0].file)), content);
  } finally { await rm(outputDirectory, { recursive: true, force: true }); }
});

test('failed downloads never produce a successful manifest', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'nasun-storage-test-'));
  try {
    const storage = mockStorage({ '': [{ id: 'file', name: 'one.pdf', metadata: { size: 3 } }] });
    await assert.rejects(exportStorageBackup({ storage, outputDirectory, fetchObject: async () => new Response(null, { status: 403 }) }), /HTTP_403/);
    await assert.rejects(readFile(join(outputDirectory, 'manifest.json')), { code: 'ENOENT' });
  } finally { await rm(outputDirectory, { recursive: true, force: true }); }
});

test('rejects path traversal and incomplete download sizes', async () => {
  await assert.rejects(inventoryStorage(mockStorage({ '': [{ id: 'file', name: '../secret', metadata: {} }] })), /INVALID_STORAGE_OBJECT_PATH/);
  const outputDirectory = await mkdtemp(join(tmpdir(), 'nasun-storage-test-'));
  try {
    const storage = mockStorage({ '': [{ id: 'file', name: 'one.pdf', metadata: { size: 300 } }] });
    await assert.rejects(exportStorageBackup({ storage, outputDirectory, fetchObject: async () => new Response('short') }), /SIZE_MISMATCH/);
  } finally { await rm(outputDirectory, { recursive: true, force: true }); }
});

test('detects objects changing during the export', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'nasun-storage-test-'));
  try {
    const entries = { '': [{ id: 'file', name: 'one.pdf', updated_at: 'before', metadata: { size: 3 } }] };
    await assert.rejects(exportStorageBackup({ storage: mockStorage(entries), outputDirectory, fetchObject: async () => {
      entries[''][0].updated_at = 'after';
      return new Response('abc');
    } }), /STORAGE_CHANGED_DURING_BACKUP/);
  } finally { await rm(outputDirectory, { recursive: true, force: true }); }
});
