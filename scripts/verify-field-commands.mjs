import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {registerTestSession} from './register-test-session.mjs';
import {makeFieldCommand,requireFieldReceipt} from '../src/lib/fieldCommands.js';
export async function verifyFieldCommands(service,env){
 if(new URL(env.RLS_TEST_URL).origin!=='https://kenznmtdfuexmfrtzypb.supabase.co')throw Error('ISOLATED_STAGING_REQUIRED');
 const prefix=`SYN-FIELD-${randomUUID()}`,nppIds=[`${prefix}-A`,`${prefix}-B`,`${prefix}-SOUTH`],code=`${prefix}-MACHINE`;
 const clients={},tickets=[],timings={};let phase='SETUP',machineCreated=false,nppsCreated=false;
 const checked=(result,label)=>{if(result.error)throw Error(`STAGING_FIELD_${label}_${result.error.code||'REQUEST_FAILED'}`);return result.data;};
 try{
  checked(await service.from('distributors').insert(nppIds.map((id,index)=>({id,name:'Synthetic field acceptance',region:index===2?'Miền Nam':'Miền Bắc',brand:'Nasun',status:'Đang hợp tác'}))),'NPP');nppsCreated=true;
  for(const role of ['admin','manager','technician','qc','viewer']){
   const client=createClient(env.RLS_TEST_URL,env.RLS_TEST_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,options={})=>fetch(input,{...options,signal:AbortSignal.timeout(30000)})}});
   const login=await client.auth.signInWithPassword({email:env[`RLS_TEST_${role.toUpperCase()}_EMAIL`],password:env[`RLS_TEST_${role.toUpperCase()}_PASSWORD`]});checked(login,'LOGIN');
   const identity=checked(await service.auth.admin.getUserById(login.data.user.id),'MARKER');assert.equal(identity.user.app_metadata.nasun_rls_fixture,true);
   await registerTestSession(client);clients[role]={client,owner:login.data.user.id};
  }
  const invoke=async(role,input)=>{
   const command=await makeFieldCommand({...input,owner:clients[role].owner});
   const result=await clients[role].client.rpc('execute_field_command',{p_command:command});return {command,...result};
  };
  const day=new Date().toISOString().slice(0,10);phase='CONCURRENT_CREATE';const started=performance.now();
  await Promise.all(Object.keys(clients).map(async role=>{
   const id=`${prefix}-${role}`;const payload={id,ticket_code:id,date:day,technician:'Synthetic technician',npp_id:nppIds[0],npp_name:'Synthetic field acceptance',product_category:'Máy lắc',machine_model:'Synthetic shaker',serial_number:'SYN-FIELD-001',error_description:'Synthetic field fault',materials_used:['Dây nguồn có dấu cách']};
   const request={kind:'REPAIR_CREATE',entityId:id,payload};
   const saved=await invoke(role,request);
   if(role==='viewer'){assert.ok(saved.error,'Viewer must not create a field repair');return;}
   checked(saved,'CREATE');tickets.push(id);requireFieldReceipt(saved.command,saved.data);
   const replay=await invoke(role,request);checked(replay,'CREATE_REPLAY');assert.deepEqual(replay.data,saved.data);
   const audit=await service.from('audit_logs').select('id',{head:true,count:'exact'}).eq('id',`AUDIT-FIELD-${saved.command.operationId}`);checked(audit,'AUDIT');assert.equal(audit.count,1);
  }));timings.fiveClientsCreateMs=Math.round(performance.now()-started);
  phase='REPAIR_CONCURRENCY';
  const id=`${prefix}-technician`,original=checked(await service.from('repair_tickets').select('record_version').eq('id',id).single(),'VERSION');
  const updates=await Promise.all(['technician','admin'].map(role=>invoke(role,{kind:'REPAIR_EDIT',entityId:id,expected:original.record_version,payload:{id,notes:`Synthetic writer ${role}`}})));
  assert.equal(updates.filter(result=>!result.error).length,1);assert.equal(updates.filter(result=>result.error?.code==='PT409').length,1);
  const winner=updates.find(result=>!result.error);requireFieldReceipt(winner.command,winner.data);
  const conflict=await clients.technician.client.rpc('execute_field_command',{p_command:{...winner.command,owner:clients.technician.owner,payload:{id,notes:'Changed intent'}}});assert.ok(conflict.error);
  const foreign=await invoke('technician',{kind:'REPAIR_CREATE',entityId:`${prefix}-FOREIGN`,payload:{id:`${prefix}-FOREIGN`,ticket_code:`${prefix}-FOREIGN`,date:day,npp_id:nppIds[2]}});assert.ok(foreign.error);
  const injected=await invoke('technician',{kind:'REPAIR_EDIT',entityId:id,expected:winner.data.version,payload:{id,created_by:clients.admin.owner}});assert.ok(injected.error);
  phase='MAINTENANCE';
  checked(await service.from('system_sets').insert({set_code:code,npp_name:'Synthetic field warehouse',region:'Miền Bắc',status:'TRONG_KHO',dispenser_model:'Synthetic dispenser',dispenser_serial:'SYN-FIELD-DISP'}),'MACHINE');machineCreated=true;
  const revision=async()=>checked(await service.from('system_sets').select('updated_at').eq('set_code',code).single(),'MACHINE_REVISION').updated_at;
  const expected=await revision();
  const checklist={version:1,model:'Synthetic dispenser',serial:'SYN-FIELD-DISP',steps:[{id:'1',label:'Synthetic inspection',result:'ISSUE'}]};
  const payload={setCode:code,lastMaintenanceDate:day,nextMaintenanceDue:`${Number(day.slice(0,4))+1}${day.slice(4)}`,notes:'Synthetic maintenance checklist acceptance',photos:[],checklist};
  const wrong=await invoke('technician',{kind:'MAINTENANCE',entityId:code,expected,payload:{...payload,checklist:{...checklist,serial:'WRONG-SERIAL'}}});assert.ok(wrong.error);
  const maintained=await invoke('technician',{kind:'MAINTENANCE',entityId:code,expected,payload});checked(maintained,'MAINTENANCE');requireFieldReceipt(maintained.command,maintained.data);
  const replayed=await invoke('technician',{kind:'MAINTENANCE',entityId:code,expected,payload});checked(replayed,'MAINTENANCE_REPLAY');assert.deepEqual(replayed.data,maintained.data);
  phase='ALLOCATION';
  // Use a fresh warehouse state; only this newly created synthetic machine is changed.
  checked(await service.from('system_sets').update({status:'TRONG_KHO'}).eq('set_code',code),'RESET_FIXTURE');
  const installed=await invoke('technician',{kind:'INSTALL',entityId:code,expected:await revision(),payload:{setCode:code,nppId:nppIds[0],installedDate:day,photos:[]}});checked(installed,'INSTALL');
  const stale=await invoke('technician',{kind:'WITHDRAW',entityId:code,expected,payload:{setCode:code,withdrawDate:day,reason:'Synthetic stale withdrawal',warehouseRegion:'Miền Bắc'}});assert.equal(stale.error?.code,'PT409');
  const transferred=await invoke('technician',{kind:'TRANSFER',entityId:code,expected:await revision(),payload:{setCode:code,newNppId:nppIds[1],transferDate:day,reason:'Synthetic transfer',photos:[]}});checked(transferred,'TRANSFER');
  const withdrawn=await invoke('technician',{kind:'WITHDRAW',entityId:code,expected:await revision(),payload:{setCode:code,withdrawDate:day,reason:'Synthetic withdrawal',warehouseRegion:'Miền Bắc',photos:[]}});checked(withdrawn,'WITHDRAW');
  await mkdir('output',{recursive:true});await writeFile('output/field-stage-acceptance.json',JSON.stringify({passed:true,synthetic:true,project:'nasun-staging',checks:['five-role-create-and-replay','single-audit','concurrent-edit-one-winner','foreign-region-denied','protected-field-denied','wrong-machine-checklist-denied','maintenance-replay','allocation-transfer-withdraw','stale-allocation-denied'],timings,realSafariVerified:false,fullRestoreVerified:false},null,2));
  console.log('Field command staging passed: five roles, concurrent revision conflict, replay, atomic audit, checklist identity, allocation and stale-write denial.');
 }catch(error){throw Error(`FIELD_ACCEPTANCE_${phase}: ${/^STAGING_FIELD_[A-Z0-9_]+$/.test(error.message)?error.message:error.code||'ASSERTION_FAILED'}`);}
 finally{
  const admin=clients.admin?.client;
  if(admin){await registerTestSession(admin);if(tickets.length){assert.ok(tickets.every(id=>id.startsWith(prefix)));checked(await admin.from('repair_tickets').delete().in('id',tickets),'CLEANUP_REPAIRS');}
   if(machineCreated)checked(await admin.from('system_sets').delete().eq('set_code',code),'CLEANUP_MACHINE');}
  if(nppsCreated)checked(await service.from('distributors').delete().in('id',nppIds),'CLEANUP_NPPS');
  for(const item of Object.values(clients))await item.client.auth.signOut({scope:'local'});
 }
}
