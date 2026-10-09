import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { updateWithRevision } from '../src/lib/guardedWrite.js';

// Called only after the isolated staging preflight in verify-rls.mjs.
export async function verifyWriteIntegrity(admin) {
  const id = `NASUN-STAGING-VERIFY-${randomUUID()}`;
  let inserted = false;
  try {
    const { data: authenticated, error: authError } = await admin.rpc('require_recent_authentication');
    assert.ok(!authError && authenticated === true, 'Recent-authentication RPC must authorize the staging administrator');
    const { data, error } = await admin.from('distributors').insert({
      id, name: 'Synthetic verification fixture', region: 'Miền Bắc', brand: 'Nasun', phone: ''
    }).select('id, updated_at');
    // Track cleanup even if a successful insert has an invalid returning payload.
    inserted = !error;
    assert.ok(!error && data?.length === 1, 'Staging fixture insertion must return one row');
    const expectedRevision = data[0].updated_at;
    const runQuery = query => query(admin);
    const options = { runQuery, table: 'distributors', id, expectedRevision };
    const first = await updateWithRevision({ ...options, updates: { name: 'Synthetic first writer' } });
    assert.notEqual(first.data[0].updated_at, expectedRevision, 'Server must advance updated_at on writes');
    await assert.rejects(updateWithRevision({ ...options, updates: { name: 'Synthetic stale writer' } }), { code: 'WRITE_CONFLICT' });
    const { data: saved, error: readError } = await admin.from('distributors').select('name').eq('id', id).single();
    assert.ok(!readError && saved?.name === 'Synthetic first writer', 'A stale writer must not overwrite the accepted update');
  } finally {
    if (inserted) {
      const { data, error } = await admin.from('distributors').delete().eq('id', id).select('id');
      assert.ok(!error && data?.length === 1, 'Synthetic staging fixture cleanup failed; inspect NASUN-STAGING-VERIFY records');
    }
  }
}
