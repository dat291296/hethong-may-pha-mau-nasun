import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/database-backup.yml', import.meta.url);

test('ENT-7 creates encrypted scheduled backups without exposing database credentials', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /secrets\.SUPABASE_DB_URL/);
  assert.match(workflow, /BACKUP_ENCRYPTION_PASSPHRASE/);
  assert.match(workflow, /pg_dump --schema=public --format=custom/);
  assert.match(workflow, /openssl enc -aes-256-cbc/);
  assert.match(workflow, /shred -u nasun-public\.dump/);
  assert.match(workflow, /retention-days: 7/);
  assert.doesNotMatch(workflow, /postgres(?:ql)?:\/\/[^$\s]+:[^$\s]+@/i);
});

test('ENT-7 verifies a staged restore before uploading the backup', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const restoreIndex = workflow.indexOf('Verify backup can be restored');
  const encryptIndex = workflow.indexOf('Encrypt verified backup');
  const uploadIndex = workflow.indexOf('Upload encrypted backup');
  assert.ok(restoreIndex > 0 && encryptIndex > restoreIndex && uploadIndex > encryptIndex);
  assert.match(workflow, /pg_restore --section=pre-data/);
  assert.match(workflow, /pg_restore --section=data/);
  assert.match(workflow, /pg_restore --section=post-data/);
  assert.match(workflow, /CREATE EXTENSION IF NOT EXISTS "uuid-ossp"/);
  assert.match(workflow, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
  assert.match(workflow, /RESTORE_OK/);
});
