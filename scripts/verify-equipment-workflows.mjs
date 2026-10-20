import { registerTestSession } from './register-test-session.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export async function verifyEquipmentWorkflows(service, env) {
  if (new URL(env.RLS_TEST_URL).hostname !== 'kenznmtdfuexmfrtzypb.supabase.co') throw Error('ISOLATED_STAGING_REQUIRED');
  const prefix=`SYN-WORK-${randomUUID()}`;
  const distributorIds=[`${prefix}-A`,`${prefix}-B`,`${prefix}-SOUTH`];
  const setCodes=[];
  const clients=[];
  let cleanupAdmin;
  let originalError;
  try {
    const inserted=await service.from('distributors').insert(distributorIds.map((id,index)=>({id,name:'Synthetic workflow verification',region:index===2?'Miền Nam':'Miền Bắc',status:'Đang hợp tác',brand:'Nasun'})));
    assert.ifError(inserted.error);
    for (const role of ['admin','manager','technician','qc','viewer']) {
      const client=createClient(env.RLS_TEST_URL,env.RLS_TEST_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(30000)})}});
      clients.push(client);
      if(role==='admin')cleanupAdmin=client;
      const login=await client.auth.signInWithPassword({email:env[`RLS_TEST_${role.toUpperCase()}_EMAIL`],password:env[`RLS_TEST_${role.toUpperCase()}_PASSWORD`]});
      assert.ifError(login.error);
      const registered=await client.rpc('register_trusted_device_session',{p_device_id:`${prefix}-${role}`,p_device_label:'Synthetic workflow acceptance',p_timezone:'UTC'});
      assert.ifError(registered.error);
      const code=`${prefix}-${role}`;
      const created=await service.from('system_sets').insert({set_code:code,npp_name:'Synthetic warehouse',region:'Miền Bắc',status:'TRONG_KHO'});
      assert.ifError(created.error);setCodes.push(code);
      const invoke=(workflow,payload,operationId=randomUUID())=>client.rpc('execute_equipment_workflow',{p_operation_id:operationId,p_workflow:workflow,p_payload:payload});
      const payload={setCode:code,nppId:distributorIds[0],installedDate:new Date().toISOString().slice(0,10),photos:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1cAAAAASUVORK5CYII=']};
      const operationId=randomUUID();
      const install=await invoke('INSTALL',payload,operationId);
      if(role==='viewer') {assert.ok(install.error,'Viewer must not install');continue;}
      assert.ifError(install.error);
      const replay=await invoke('INSTALL',payload,operationId);
      assert.ifError(replay.error);assert.deepEqual(replay.data,install.data);
      assert.ok((await invoke('INSTALL',{...payload,notes:'mismatch'},operationId)).error,'Operation identity must bind content');
      const maintenanceArgs={p_operation_id:randomUUID(),p_set_code:code,p_date:payload.installedDate,p_next_date:new Date(Date.now()+365*86400000).toISOString().slice(0,10),p_notes:'Synthetic checklist acceptance',p_photos:[],p_has_issues:false};
      const maintenance=await client.rpc('complete_machine_maintenance',maintenanceArgs);
      assert.ifError(maintenance.error);
      assert.ifError((await client.rpc('complete_machine_maintenance',maintenanceArgs)).error);

      if(role!=='admin') assert.ok((await invoke('TRANSFER',{setCode:code,newNppId:distributorIds[2]})).error,'Cross-region transfer must fail');
      assert.ifError((await invoke('TRANSFER',{setCode:code,newNppId:distributorIds[1]})).error);
      assert.ifError((await invoke('WITHDRAW',{setCode:code,reason:'Synthetic acceptance',warehouseRegion:'Miền Bắc'})).error);
      const final=await service.from('system_sets').select('status,npp_id').eq('set_code',code).single();
      assert.ifError(final.error);assert.equal(final.data.status,'TRONG_KHO');assert.equal(final.data.npp_id,null);
      const logs=await service.from('audit_logs').select('id',{count:'exact',head:true}).eq('set_code',code);
      assert.ifError(logs.error);assert.equal(logs.count,4,'Replay must not duplicate audit entries');
    }
    console.log('Synthetic equipment workflows verified: four operational roles, viewer denial, region boundary, replay and audit count.');
  } catch(error) { originalError=error;throw error; }
  finally {
    let cleanupError;
    try {
      // Sensitive deletion requires a fresh authenticated administrator, even for fixtures.
      if(setCodes.length) {
        assert.ok(cleanupAdmin,'Synthetic administrator client required for cleanup');
        const login=await cleanupAdmin.auth.signInWithPassword({email:env.RLS_TEST_ADMIN_EMAIL,password:env.RLS_TEST_ADMIN_PASSWORD});
        assert.ifError(login.error);
        await registerTestSession(cleanupAdmin);
        assert.ifError((await cleanupAdmin.from('system_sets').delete().in('set_code',setCodes)).error);
      }
    } catch(error) {cleanupError=error;}
    try {assert.ifError((await service.from('distributors').delete().in('id',distributorIds)).error);} catch(error) {cleanupError ||= error;}
    for(const client of clients) {try {await client.auth.signOut({scope:'local'});} catch(error) {cleanupError ||= error;}}
    // Immutable synthetic audit entries intentionally remain in isolated staging.
    if(cleanupError) {
      console.error('Synthetic workflow cleanup incomplete; existing business records were not targeted.');
      if(!originalError)throw cleanupError;
    }
  }
}
