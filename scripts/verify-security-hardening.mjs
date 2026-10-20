import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { registerTestSession } from './register-test-session.mjs';
export async function verifySecurityHardening(service, env) {
  assert.equal(new URL(env.RLS_TEST_URL).hostname, 'kenznmtdfuexmfrtzypb.supabase.co');
  const client=createClient(env.RLS_TEST_URL,env.RLS_TEST_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=await client.auth.signInWithPassword({email:env.RLS_TEST_TECHNICIAN_EMAIL,password:env.RLS_TEST_TECHNICIAN_PASSWORD});
  assert.ifError(login.error);
  const owner=login.data.user.id;
  const sid=JSON.parse(Buffer.from(login.data.session.access_token.split('.')[1],'base64url')).session_id;
  const check=result=>{assert.ifError(result.error);return result.data;};
  try {
    const unregistered=await client.from('distributors').select('id').limit(1);
    assert.ok(unregistered.error || unregistered.data?.length===0,'Unregistered real JWT must not read business rows');
    await registerTestSession(client);
    const allowed=check(await client.from('distributors').select('id').eq('region','Miền Bắc').limit(1));
    assert.ok(allowed.length,'Registered technician must read fixture');
    for (const origin of ['https://untrusted.invalid','null']) {
      const foreign=createClient(env.RLS_TEST_URL,env.RLS_TEST_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Origin:origin,Authorization:'Bearer '+login.data.session.access_token}}});
      const denied=await foreign.from('distributors').select('id').limit(1);
      assert.ok(denied.error || denied.data?.length===0,'Foreign browser origin must not read business data with a valid JWT');
    }
    const approved=createClient(env.RLS_TEST_URL,env.RLS_TEST_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Origin:'https://kythuat-staging.nasun.workers.dev',Authorization:'Bearer '+login.data.session.access_token}}});
    assert.ok(check(await approved.from('distributors').select('id').limit(1)).length,'Approved staging origin must remain usable');
    const otherProfile=await client.from('profiles').select('id').neq('id',owner).limit(1);
    assert.ok(otherProfile.error || otherProfile.data.length===0,'IDOR: other profiles must be hidden');
    const escalation=await client.rpc('update_user_access',{target_user_id:owner,target_role:'admin',target_region:'Toàn Quốc'});
    assert.ok(escalation.error,'Technician must not grant admin');
    const injection=await client.rpc('edit_device_atomic',{p_table:'printers; SELECT 1',p_id:'SYN-NONEXISTENT',p_updates:{status:'Synthetic'},p_expected_updated_at:new Date().toISOString()});
    assert.ok(injection.error,'Dynamic table injection must fail');
    for(const update of [{expires_at:new Date(Date.now()-60000).toISOString()}, {idle_expires_at:new Date(Date.now()-60000).toISOString()}, {revoked_at:new Date().toISOString()}]) {
      check(await service.from('account_sessions').update({expires_at:new Date(Date.now()+3600000).toISOString(),idle_expires_at:new Date(Date.now()+3600000).toISOString(),revoked_at:null,...update}).eq('user_id',owner).eq('session_id',sid));
      const denied=await client.from('distributors').select('id').limit(1);
      assert.ok(denied.error || denied.data?.length===0,'Expired/idle/revoked JWT must not read business data');
      for (const [name,args] of [['get_sync_change_feed',{p_after_cursor:0,p_limit:1}],['get_sync_server_health',{}]]) {
        const rpcDenied=await client.rpc(name,args);
        assert.ok(rpcDenied.error,'Rejected JWT must not bypass RLS through '+name);
      }
      const registration=await client.rpc('register_trusted_device_session',{p_device_id:'SYN-REPLAY-'+sid,p_device_label:'Synthetic rejected replay',p_timezone:'UTC'});
      assert.ok(registration.error || registration.data?.valid===false,'Rejected session must not revive through registration');
    }
    console.log('Real JWT security checks passed: unregistered, expired, idle, revoked, registration replay, IDOR, admin escalation and table injection.');
  } finally { await client.auth.signOut({scope:'local'}); }
}
