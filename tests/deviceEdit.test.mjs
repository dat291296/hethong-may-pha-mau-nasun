import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDeviceEdit, saveDeviceEdit } from '../src/lib/deviceEdit.js';

test('all device categories preserve identity and explicit assignments', () => {
  for (const category of ['computer', 'dispenser', 'mixer', 'printer']) {
    const result = prepareDeviceEdit(category, { id: 'changed', serial: ' SERIAL ', isAssigned: true, setCode: 'SET-A' }, { id: 'original', serial: 'OLD' });
    assert.equal(result.id, 'original');
    assert.equal(result.sourceId, 'original');
    assert.equal(result.serial, 'SERIAL');
    assert.equal(result.setCode, 'SET-A');
    assert.equal(prepareDeviceEdit(category, { serial: 'SERIAL', isAssigned: false, setCode: 'SET-A' }, { id: 'original' }).setCode, null);
  }
  assert.equal(prepareDeviceEdit('computer', { isAssigned: false }, { id: 'PC', serial: 'PC-OLD' }).serial, 'PC-OLD');
  assert.throws(() => prepareDeviceEdit('printer', { serial: ' ' }, { id: 'PR' }));
});

test('atomic edit sends the original revision and never falls back to partial writes', async () => {
  const revision = '2026-10-08T00:00:00Z';
  let calls = 0;
  const run = result => query => query({ rpc: (name, params) => {
    calls++;
    assert.equal(name, 'edit_device_atomic');
    assert.equal(params.p_expected_updated_at, revision);
    assert.equal(params.p_id, 'PC');
    return result;
  } });
  await saveDeviceEdit(run({ data: [{ id: 'PC' }], error: null }), 'computers', 'PC', { os: 'Windows 11' }, revision);
  for (const code of ['42501', '23505', '40001', 'QUERY_TIMEOUT']) {
    await assert.rejects(saveDeviceEdit(run({ error: { code } }), 'computers', 'PC', {}, revision), { code });
  }
  await assert.rejects(saveDeviceEdit(run({ error: { code: 'PGRST202' } }), 'computers', 'PC', {}, revision), { code: 'SCHEMA_MIGRATION_REQUIRED' });
  await assert.rejects(saveDeviceEdit(run({ data: [], error: null }), 'computers', 'PC', {}, revision), { code: 'WRITE_CONFLICT' });
  assert.equal(calls, 7);
  await assert.rejects(saveDeviceEdit(() => assert.fail('must not send a stale draft'), 'computers', 'PC', {}, null), { code: 'REVISION_REQUIRED' });
});
