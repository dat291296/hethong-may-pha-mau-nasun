import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSecureBackup, parseAndValidateBackup } from '../src/utils/secureBackup.js';

const utilityUrl = new URL('../src/utils/secureBackup.js', import.meta.url);
const modalUrl = new URL('../src/components/DataBackupSyncModal.jsx', import.meta.url);

test('backup files use a versioned schema and SHA-256 integrity checksum', async () => {
  const utility = await readFile(utilityUrl, 'utf8');
  assert.match(utility, /nasun-paint-system-backup\/v3/);
  assert.match(utility, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(utility, /expected !== parsed\.integrity\?\.checksum/);
});

test('backup parser limits resource consumption and blocks prototype pollution', async () => {
  const utility = await readFile(utilityUrl, 'utf8');
  assert.match(utility, /MAX_BACKUP_BYTES = 10 \* 1024 \* 1024/);
  assert.match(utility, /MAX_RECORDS_PER_COLLECTION = 10_000/);
  assert.match(utility, /MAX_FIELDS_PER_RECORD = 100/);
  assert.match(utility, /'__proto__', 'prototype', 'constructor'/);
  assert.match(utility, /unknownKeys/);
});

test('full backup import and export are admin-only and require confirmation', async () => {
  const modal = await readFile(modalUrl, 'utf8');
  assert.match(modal, /role === ROLES\.ADMIN/);
  assert.match(modal, /parseAndValidateBackup\(importJsonText\)/);
  assert.match(modal, /window\.confirm/);
  assert.match(modal, /integrityVerified/);
});

test('modified backup content fails integrity validation', async () => {
  const backup = await createSecureBackup({ npps: [{ id: 'NPP-TEST', name: 'Original' }] });
  backup.data.npps[0].name = 'Modified';
  await assert.rejects(
    () => parseAndValidateBackup(JSON.stringify(backup)),
    /đã bị thay đổi hoặc bị hỏng/,
  );
});
