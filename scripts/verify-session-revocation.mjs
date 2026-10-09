import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { requireReplaySession } from '../src/security/replaySession.js';

export async function verifySessionRevocation(service, environment) {
  const client = createClient(environment.RLS_TEST_URL, environment.RLS_TEST_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(30000) }) },
  });
  const signedIn = await client.auth.signInWithPassword({ email: environment.RLS_TEST_VIEWER_EMAIL, password: environment.RLS_TEST_VIEWER_PASSWORD });
  assert.ifError(signedIn.error);
  const owner = signedIn.data.user.id;
  const deviceId = `NASUN-STAGING-SESSION-${crypto.randomUUID()}`;
  const args = { p_device_id: deviceId, p_timezone: 'UTC' };
  const validate = async () => {
    const result = await client.rpc('validate_trusted_device_session', args);
    assert.ifError(result.error);
    return { supported: true, state: result.data };
  };
  try {
    const registration = await client.rpc('register_trusted_device_session', { ...args, p_device_label: 'Synthetic session verification' });
    assert.ifError(registration.error);
    assert.equal(registration.data.valid, true);
    await requireReplaySession(client, owner, () => owner, validate);
    const fixture = await service.auth.admin.getUserById(owner);
    assert.ifError(fixture.error);
    assert.equal(fixture.data.user.app_metadata.nasun_rls_fixture, true, 'Only disposable fixture sessions may be revoked');
    const revoked = await service.from('account_sessions').update({ revoked_at: new Date().toISOString(), revoked_reason: 'STAGING_VERIFICATION' }).eq('user_id', owner).select('session_id');
    assert.ifError(revoked.error);
    assert.equal(revoked.data.length, 1);
    assert.equal((await validate()).state.valid, false);
    await assert.rejects(requireReplaySession(client, owner, () => owner, validate), /SESSION_REJECTED/);
    const repeated = await client.rpc('register_trusted_device_session', { ...args, p_device_label: 'Synthetic session verification' });
    assert.ifError(repeated.error);
    assert.equal(repeated.data.valid, false, 'A revoked JWT must not reactivate its session');
    assert.equal((await validate()).state.valid, false);
    console.log('Staging revoked-session replay and re-registration rejection verified on disposable account.');
  } finally {
    await client.auth.signOut({ scope: 'local' });
  }
}
