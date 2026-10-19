import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { completePasswordRecovery, signInEmailAccount } from '../src/security/authEmailFlows.js';
import { retireStagingUser } from './staging-user-cleanup.mjs';

export async function verifyAuthLifecycle(service, env) {
  if (new URL(env.RLS_TEST_URL).hostname !== 'kenznmtdfuexmfrtzypb.supabase.co') throw new Error('ISOLATED_STAGING_REQUIRED');
  const client = createClient(env.RLS_TEST_URL, env.RLS_TEST_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, options = {}) => fetch(input, { ...options, signal: AbortSignal.timeout(30000) }) },
  });
  const email = `nasun-auth-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString('base64url') + 'Aa1';
  const nextPassword = randomBytes(24).toString('base64url') + 'Bb2';
  let id;
  try {
    // Generate provider tokens without sending mail to a fictitious inbox.
    const signup = await service.auth.admin.generateLink({ type: 'signup', email, password });
    assert.ifError(signup.error);
    id = signup.data.user.id;
    const confirmation = await client.auth.verifyOtp({ type: 'signup', token_hash: signup.data.properties.hashed_token });
    assert.ifError(confirmation.error);
    assert.equal(confirmation.data.user.id, id);
    await client.auth.signOut({ scope: 'local' });
    const signedIn = await signInEmailAccount(client.auth, { email, password });
    assert.equal(signedIn.user.id, id);
    const logout = await client.auth.signOut({ scope: 'local' });
    assert.ifError(logout.error);
    assert.equal((await client.auth.getSession()).data.session, null);
    const invalid = await client.auth.signInWithPassword({ email, password: randomBytes(24).toString('hex') });
    assert.equal(invalid.error?.code, 'invalid_credentials');
    const recovery = await service.auth.admin.generateLink({ type: 'recovery', email });
    assert.ifError(recovery.error);
    const recovered = await client.auth.verifyOtp({ type: 'recovery', token_hash: recovery.data.properties.hashed_token });
    assert.ifError(recovered.error);
    assert.equal(recovered.data.user.id, id);
    await completePasswordRecovery(client.auth, nextPassword);
    await client.auth.signOut({ scope: 'local' });
    const oldPassword = await client.auth.signInWithPassword({ email, password });
    assert.equal(oldPassword.error?.code, 'invalid_credentials');
    assert.equal((await signInEmailAccount(client.auth, { email, password: nextPassword })).user.id, id);
    const reused = await client.auth.verifyOtp({ type: 'recovery', token_hash: recovery.data.properties.hashed_token });
    assert.ok(reused.error, 'Recovery tokens must not be reusable');
    console.log('Staging auth lifecycle passed: signup confirmation, login, logout, recovery, password rotation and token reuse rejection. SMTP delivery is not exercised.');
  } finally {
    await client.auth.signOut({ scope: 'local' });
    if (id) await retireStagingUser(service, id);
  }
}
