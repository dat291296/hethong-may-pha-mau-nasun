import test from 'node:test';
import assert from 'node:assert/strict';
import { requireCompleteWrite, updateWithRevision } from '../src/lib/guardedWrite.js';
import { persistMutation } from '../src/lib/durableMutation.js';

test('schema mismatch never drops fields or becomes offline success', async () => {
  let queued = false;
  for (const code of ['42703', 'PGRST204']) {
    await assert.rejects(persistMutation({ online: true,
      write: async () => requireCompleteWrite({ error: { code } }),
      queue: async () => { queued = true; } }), { code: 'SCHEMA_MIGRATION_REQUIRED' });
  }
  assert.equal(queued, false);
});

test('stale revision is rejected and current revision can update', async () => {
  let record = { id: 'synthetic', updated_at: '2026-10-08T01:00:00.000Z', name: 'Original' };
  const runQuery = async query => query({ from: () => ({ update: updates => {
    const filters = {};
    const builder = { eq: (key, value) => { filters[key] = value; return builder; },
      select: async () => {
        if (record.id !== filters.id || record.updated_at !== filters.updated_at) return { data: [], error: null };
        record = { ...record, ...updates, updated_at: '2026-10-08T01:00:01.000Z' };
        return { data: [{ id: record.id, updated_at: record.updated_at }], error: null };
      } };
    return builder;
  } }) });
  const revision = record.updated_at;
  await updateWithRevision({ runQuery, table: 'distributors', id: record.id, updates: { name: 'First' }, expectedRevision: revision });
  await assert.rejects(updateWithRevision({ runQuery, table: 'distributors', id: record.id, updates: { name: 'Stale' }, expectedRevision: revision }), { code: 'WRITE_CONFLICT' });
  assert.equal(record.name, 'First');
});

test('missing revision prevents any network write and permission errors propagate', async () => {
  await assert.rejects(updateWithRevision({ runQuery: () => assert.fail('must not write'), expectedRevision: null }), { code: 'REVISION_REQUIRED' });
  assert.throws(() => requireCompleteWrite({ error: { code: '42501' } }), { code: '42501' });
});
