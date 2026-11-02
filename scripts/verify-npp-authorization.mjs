import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hasPermission } from '../src/shared/security/rbac.js';
import { REGIONS, canEditRegion } from '../src/shared/workspace/workspaceFilters.js';

// Clients are authenticated as the disposable users owned by run-staging-rls.
// Never target existing NPPs, profiles or sessions in this acceptance check.
export async function verifyNppAuthorization(admin, clients, environment = process.env) {
  try {
    const staging = new URL(environment.RLS_TEST_URL);
    const production = new URL(environment.RLS_PRODUCTION_URL);
    if (staging.href !== 'https://kenznmtdfuexmfrtzypb.supabase.co/'
      || staging.origin === production.origin) throw Error();
  } catch { throw new Error('NPP_AUTHORIZATION_ISOLATED_STAGING_REQUIRED'); }
  assert.deepEqual(clients.map(item => item.role).sort(), ['admin', 'manager', 'qc', 'technician', 'viewer']);
  assert.equal(admin, clients.find(item => item.role === 'admin').client);
  for (const { client } of clients) {
    const identity = await client.auth.getUser();
    assert.ifError(identity.error);
    assert.equal(identity.data.user.app_metadata?.nasun_rls_fixture, true, 'Disposable fixture identities required');
    assert.match(identity.data.user.email, /^nasun-rls-.*@example\.invalid$/);
  }
  const prefix = `SYN-NPP-AUTH-${randomUUID()}`;
  const ownedIds = new Set();
  let originalError;
  let outcome;
  let cleanupFailed = false;
  let checks = 0;
  function checked(result) { assert.ifError(result.error); return result.data; }
  try {
    const fixtures = REGIONS.map((region, index) => {
      const id = `${prefix}-${index}`;
      ownedIds.add(id);
      return { id, name: 'Synthetic authorization fixture', region, status: 'Đang hợp tác' };
    });
    assert.equal(checked(await admin.from('distributors').insert(fixtures).select('id')).length, 3);
    for (const { role, client } of clients) {
      const identity = checked(await client.auth.getUser());
      const profile = checked(await client.from('profiles').select('role,managed_region')
        .eq('id', identity.user.id).single());
      assert.equal(profile.role, role);
      const user = { role, managedRegion: profile.managed_region };
      for (const fixture of fixtures) {
        const canRead = role === 'admin' || profile.managed_region === fixture.region;
        const canWrite = hasPermission(role, 'npp:create') && canEditRegion(user, fixture.region);
        const visible = checked(await client.from('distributors').select('id').eq('id', fixture.id));
        assert.equal(visible.length === 1, canRead, `${role}: NPP read boundary`);
        checks++;
        const id = `${prefix}-${role}-${REGIONS.indexOf(fixture.region)}-new`;
        ownedIds.add(id);
        const created = await client.from('distributors').insert({ id, name: 'Synthetic NPP insert',
          region: fixture.region, status: 'Đang hợp tác' }).select('id');
        if (canWrite) assert.deepEqual(checked(created).map(row => row.id), [id]);
        else assert.ok(created.error, `${role}: unauthorized NPP insert must fail`);
        checks++;
        const edited = await client.from('distributors').update({ name: 'Synthetic NPP edit' })
          .eq('id', fixture.id).select('id');
        if (canWrite) assert.deepEqual(checked(edited).map(row => row.id), [fixture.id]);
        else assert.ok(edited.error || edited.data?.length === 0, `${role}: unauthorized NPP edit must fail`);
        checks++;
        // Test WITH CHECK on a visible row as well as USING on hidden rows.
        if (canRead) {
          const destination = REGIONS.find(region => region !== fixture.region);
          const moved = await client.from('distributors').update({ region: destination, npp_code: null })
            .eq('id', fixture.id).select('id');
          if (role === 'admin') {
            assert.equal(checked(moved).length, 1);
            checked(await admin.from('distributors').update({ region: fixture.region, npp_code: null }).eq('id', fixture.id));
          } else assert.ok(moved.error || moved.data?.length === 0, `${role}: cross-region reassignment must fail`);
          checks++;
        }
        if (!hasPermission(role, 'npp:delete')) {
          const removed = await client.from('distributors').delete().eq('id', fixture.id).select('id');
          assert.ok(removed.error || removed.data?.length === 0, `${role}: NPP delete must fail`);
          checks++;
        }
      }
    }
    outcome = { status: 'passed', checks, realJwt: true };
  } catch (error) {
    originalError = error;
  } finally {
    // Attempt every own fixture even after a denial or network failure. Preserve
    // the first failure, while making any incomplete cleanup explicit in CI.
    for (const id of ownedIds) {
      try {
        const removed = await admin.from('distributors').delete().eq('id', id).select('id');
        if (removed.error) cleanupFailed = true;
      } catch { cleanupFailed = true; }
    }
    try {
      assert.equal(checked(await admin.rpc('require_account_admin_session')), true);
      assert.equal(checked(await admin.from('distributors').select('id').in('id', [...ownedIds])).length, 0);
    } catch { cleanupFailed = true; }
    if (cleanupFailed && originalError) console.error('NPP_AUTHORIZATION_FIXTURE_CLEANUP_INCOMPLETE');
  }
  if (originalError) throw originalError;
  if (cleanupFailed) throw new Error('NPP_AUTHORIZATION_FIXTURE_CLEANUP_INCOMPLETE');
  return outcome;
}
