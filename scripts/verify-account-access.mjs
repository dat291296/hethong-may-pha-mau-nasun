import assert from 'node:assert/strict';

// Uses only the disposable staging accounts created by the isolated RLS runner.
export async function verifyAccountAccess(admin, viewer) {
  const before = await admin.auth.getSession();
  assert.ifError(before.error);
  const identity = await viewer.auth.getUser();
  assert.ifError(identity.error);
  const targetId = identity.data.user.id;
  const profile = await admin.from('profiles').select('role,managed_region').eq('id', targetId).single();
  assert.ifError(profile.error);
  const nextRegion = profile.data.managed_region === 'Miền Bắc' ? 'Miền Trung' : 'Miền Bắc';
  let changed = false;
  try {
    const authorized = await admin.rpc('require_account_admin_session');
    assert.ifError(authorized.error);
    assert.equal(authorized.data, true);
    const update = await admin.rpc('update_user_access', { target_user_id: targetId, target_role: profile.data.role, target_region: nextRegion });
    assert.ifError(update.error);
    assert.equal(update.data?.managed_region, nextRegion);
    changed = true;
    const after = await admin.auth.getSession();
    assert.ifError(after.error);
    assert.equal(after.data.session?.user.id, before.data.session?.user.id);
    assert.equal(after.data.session?.access_token, before.data.session?.access_token, 'Account updates must retain the administrator session');
    const forbidden = await viewer.rpc('require_account_admin_session');
    assert.ok(forbidden.error, 'Viewer must not manage accounts');
  } finally {
    if (changed) {
      const restore = await admin.rpc('update_user_access', { target_user_id: targetId, target_role: profile.data.role, target_region: profile.data.managed_region });
      assert.ifError(restore.error);
      assert.equal(restore.data?.managed_region, profile.data.managed_region);
    }
  }
}
