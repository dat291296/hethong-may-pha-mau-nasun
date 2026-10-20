import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
export async function verifyEquipmentReplacement(service,env){
 if(new URL(env.RLS_TEST_URL).hostname!=='kenznmtdfuexmfrtzypb.supabase.co')throw Error('ISOLATED_STAGING_REQUIRED');
 const prefix='SYN-REPLACE-'+randomUUID();const nppId=prefix+'-NPP';const sets=[];const devices={computers:[],dispensers:[],mixers:[],printers:[]};const clients=[];let admin;let primaryError;
 const check=result=>{assert.ifError(result.error);return result.data;};
 try{
  check(await service.from('distributors').insert({id:nppId,name:'Synthetic replacement acceptance',region:'Miền Bắc',status:'Đang hợp tác',brand:'Nasun'}));
  for(const role of ['admin','manager','technician','qc','viewer']){
   const client=createClient(env.RLS_TEST_URL,env.RLS_TEST_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(30000)})}});clients.push(client);if(role==='admin')admin=client;
   check(await client.auth.signInWithPassword({email:env[`RLS_TEST_${role.toUpperCase()}_EMAIL`],password:env[`RLS_TEST_${role.toUpperCase()}_PASSWORD`]}));
   check(await client.rpc('register_trusted_device_session',{p_device_id:prefix+'-'+role,p_device_label:'Synthetic replacement acceptance',p_timezone:'UTC'}));
   const code=prefix+'-'+role;const south=code+'-SOUTH';
   check(await service.from('system_sets').insert([{set_code:code,npp_id:nppId,npp_name:'Synthetic acceptance',region:'Miền Bắc',status:'DA_LAP_DAT'},{set_code:south,npp_name:'Synthetic south',region:'Miền Nam',status:'TRONG_KHO'}]));sets.push(code,south);
   for(const [kind,table] of [['computer','computers'],['dispenser','dispensers'],['mixer','mixers'],['printer','printers']]){
    const oldId=code+'-'+kind+'-OLD',newId=code+'-'+kind+'-NEW';
    const base={status:'Đang chạy tốt',...(kind==='computer'?{type:'Case'}:{model:'Synthetic model'})};
    check(await service.from(table).insert([{...base,id:oldId,serial:oldId,set_code:code,is_assigned:true},{...base,id:newId,serial:newId,set_code:null,is_assigned:false}]));devices[table].push(oldId,newId);
    check(await service.from('system_sets').update({[kind+'_id']:oldId,[kind+'_serial']:oldId}).eq('set_code',code));
    const before=check(await service.from('system_sets').select('updated_at').eq('set_code',code).single());
    const args={p_operation_id:randomUUID(),p_set_code:code,p_category:kind,p_device_id:newId,p_expected_device_id:oldId,p_expected_updated_at:before.updated_at,p_reason:'Synthetic real JWT acceptance',p_old_condition:'Cần bảo trì',p_action:'replace'};
    const replace=await client.rpc('replace_machine_equipment',args);
    if(role==='viewer'){assert.ok(replace.error,'Viewer replacement must fail');continue;}
    check(replace);assert.equal(replace.data.ok,true);assert.equal(replace.data.newDeviceId,newId);
    assert.deepEqual(check(await client.rpc('replace_machine_equipment',args)),replace.data,'Replay result must match');
    assert.ok((await client.rpc('replace_machine_equipment',{...args,p_reason:'Mismatched replay'})).error,'Operation content is immutable');
    const old=check(await service.from(table).select('set_code,is_assigned,status').eq('id',oldId).single());assert.equal(old.set_code,null);assert.equal(old.is_assigned,false);assert.equal(old.status,'Cần bảo trì');
    const incoming=check(await service.from(table).select('set_code,is_assigned').eq('id',newId).single());assert.equal(incoming.set_code,code);assert.equal(incoming.is_assigned,true);
    const machine=check(await service.from('system_sets').select(kind+'_id,'+kind+'_serial').eq('set_code',code).single());assert.equal(machine[kind+'_id'],newId);assert.equal(machine[kind+'_serial'],newId);
    assert.ok((await client.rpc('replace_machine_equipment',{...args,p_operation_id:randomUUID(),p_device_id:oldId,p_expected_device_id:newId})).error,'Stale revision must fail');
    if(role!=='admin')assert.ok((await client.rpc('replace_machine_equipment',{...args,p_operation_id:randomUUID(),p_set_code:south})).error,'Cross-region replacement must fail');
    const events=await service.from('equipment_replacement_events').select('operation_id',{count:'exact',head:true}).eq('operation_id',args.p_operation_id);assert.ifError(events.error);assert.equal(events.count,1);
    assert.ok((await client.from('equipment_replacement_events').update({reason:'Forbidden'}).eq('operation_id',args.p_operation_id)).error,'History update must fail');
    assert.ok((await client.from('equipment_replacement_events').delete().eq('operation_id',args.p_operation_id)).error,'History deletion must fail');
   }
   const audit=await service.from('audit_logs').select('id',{count:'exact',head:true}).eq('set_code',code);assert.ifError(audit.error);assert.equal(audit.count,role==='viewer'?0:4,'Audit must be exactly once per category');
  }
  console.log('Real JWT equipment replacement passed: five roles, four categories, warehouse preservation, conflict/replay and immutable history.');
 }catch(error){primaryError=error;throw error;}
 finally{
  let cleanupError;const cleanup=async operation=>{try{check(await operation());}catch(error){cleanupError ||= error;}};
  for(const [table,ids]of Object.entries(devices))if(ids.length)await cleanup(()=>service.from(table).update({set_code:null,is_assigned:false}).in('id',ids));
  if(admin&&sets.length){await cleanup(()=>admin.auth.signInWithPassword({email:env.RLS_TEST_ADMIN_EMAIL,password:env.RLS_TEST_ADMIN_PASSWORD}));await cleanup(()=>admin.from('system_sets').delete().in('set_code',sets));}
  for(const [table,ids]of Object.entries(devices))if(ids.length)await cleanup(()=>service.from(table).delete().in('id',ids));
  await cleanup(()=>service.from('distributors').delete().eq('id',nppId));
  for(const client of clients){try{await client.auth.signOut({scope:'local'});}catch(error){cleanupError ||= error;}}
  // Immutable synthetic events remain in isolated staging. Test identities are retired by the caller.
  if(cleanupError&&!primaryError)throw Error('Synthetic replacement cleanup incomplete; no existing business IDs were targeted');
 }
}
