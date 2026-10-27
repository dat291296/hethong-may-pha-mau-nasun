import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {registerTestSession} from './register-test-session.mjs';
const fixtureImage='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1cAAAAASUVORK5CYII=';
export async function verifyMachineEvidence(service,env){
 if(new URL(env.RLS_TEST_URL).origin!=='https://kenznmtdfuexmfrtzypb.supabase.co')throw Error('ISOLATED_STAGING_REQUIRED');
 const prefix=`SYN-EVIDENCE-${randomUUID()}`;const codes=[prefix+'-NORTH',prefix+'-SOUTH'];
 const clients={};const objects=[];let created=false;
 try{
  for(const role of ['admin','technician','viewer']){
   const client=createClient(env.RLS_TEST_URL,env.RLS_TEST_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,options={})=>fetch(input,{...options,signal:AbortSignal.timeout(30000)})}});
   const login=await client.auth.signInWithPassword({email:env[`RLS_TEST_${role.toUpperCase()}_EMAIL`],password:env[`RLS_TEST_${role.toUpperCase()}_PASSWORD`]});assert.ifError(login.error);
   const identity=await service.auth.admin.getUserById(login.data.user.id);assert.ifError(identity.error);assert.equal(identity.data.user.app_metadata.nasun_rls_fixture,true);
   await registerTestSession(client);clients[role]=client;
  }
  assert.ifError((await service.from('system_sets').insert(codes.map((set_code,index)=>({set_code,npp_name:'Synthetic evidence verification',region:index?'Miền Nam':'Miền Bắc',status:'TRONG_KHO'})))).error);created=true;
  const id=randomUUID(),operationId=randomUUID();const request={id,operationId,setCode:codes[0],image:fixtureImage};
  const invoke=(client,body)=>client.functions.invoke('machine-evidence',{body});
  const saved=await invoke(clients.technician,request);assert.ifError(saved.error);assert.equal(saved.data.verified,true);
  const replay=await invoke(clients.technician,request);assert.ifError(replay.error);assert.deepEqual(replay.data,saved.data);
  const item=await service.from('machine_evidence').select('object_path').eq('id',id).single();assert.ifError(item.error);objects.push(item.data.object_path);
  const events=await service.from('machine_evidence_events').select('id',{head:true,count:'exact'}).eq('evidence_id',id);assert.ifError(events.error);assert.equal(events.count,2);
  assert.ok((await invoke(clients.technician,{...request,id:randomUUID(),operationId:randomUUID(),setCode:codes[1]})).error,'Foreign region upload must fail');
  assert.ok((await invoke(clients.viewer,{...request,id:randomUUID(),operationId:randomUUID()})).error,'Viewer upload must fail');
  assert.ok((await invoke(clients.technician,{...request,actor:'injected'})).error,'Injected ownership must fail');
  const anonymous=createClient(env.RLS_TEST_URL,env.RLS_TEST_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  assert.ok((await anonymous.storage.from('machine-evidence').download(item.data.object_path)).error,'Anonymous access must fail');
  assert.ok((await clients.technician.storage.from('machine-evidence').upload(item.data.object_path,new Uint8Array([1]),{upsert:true,contentType:'image/png'})).error,'Direct overwrite must fail');
  const removal=await clients.technician.storage.from('machine-evidence').remove([item.data.object_path]);
  assert.ok(removal.error||!removal.data?.length,'Client removal must not delete an object');
  assert.ifError((await clients.technician.storage.from('machine-evidence').download(item.data.object_path)).error);
  assert.ok((await clients.technician.rpc('finalize_machine_evidence',{p_id:id,p_actor:randomUUID(),p_session:randomUUID(),p_sha256:saved.data.sha256,p_byte_size:1})).error,'Client must not finalize evidence');
  assert.ifError((await clients.technician.auth.signOut()).error);
  assert.ok((await invoke(clients.technician,request)).error,'Signed-out actor must not replay');
  console.log('Staging evidence verified: real JWT, private read, region and role denial, replay, immutable objects and exact audit count.');
 }catch{throw Error('STAGING_EVIDENCE_VERIFICATION_FAILED');}
 finally{
  // Only disposable, prefix-checked staging fixtures are eligible for cleanup.
  if(objects.length){for(const path of objects)assert.ok(/^[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f]{64}\.png$/.test(path));assert.ifError((await service.storage.from('machine-evidence').remove(objects)).error);}
  if(created){assert.ok(codes.every(code=>code.startsWith(prefix)));await registerTestSession(clients.admin);assert.ifError((await clients.admin.from('system_sets').delete().in('set_code',codes)).error);}
  for(const client of Object.values(clients))await client.auth.signOut({scope:'local'});
  // Immutable evidence history remains; the parent runner retires generated accounts.
 }
}
