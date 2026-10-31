import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceGateway,inspectEvidenceImage} from '../supabase/functions/_shared/evidenceProtocol.js';
import {copyLegacyEvidence,deriveLegacyEvidenceIntent} from '../src/shared/lib/evidenceCopy.js';
const actor='10000000-0000-4000-8000-000000000001',session='20000000-0000-4000-8000-000000000001';
const id='30000000-0000-4000-8000-000000000001',operationId='40000000-0000-4000-8000-000000000001';
const image='data:image/png;base64,iVBORw0KGgo=';
const body={id,operationId,setCode:'SYNTHETIC-SET',image};
function fixture(){
 const controls={auth:true,deny:false,revoked:false,corrupt:false,wrongAck:false,wrongPath:false,storageDown:false};let bytes=null,commits=0,metadata=null;
 const gateway=createEvidenceGateway({
  authenticate:async()=>{if(!controls.auth)throw Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED',status:401});return {userId:actor,sessionId:session};},
  reserve:async(_auth,value)=>{if(controls.deny)throw {code:'42501',message:'private SQL and customer payload'};
   metadata||={id,operation_id:operationId,created_by:actor,machine_set_code:body.setCode,bucket_id:'machine-evidence',object_path:`${actor}/${id}/${value.sha256}.png`,sha256:value.sha256,byte_size:value.bytes,mime_type:value.mime};
   return {...metadata,object_path:controls.wrongPath?'foreign/private':metadata.object_path};},
  writeObject:async(_item,value)=>{if(controls.storageDown)throw Error('secret-in-provider-error');bytes||=value;},
  readObject:async()=>controls.corrupt?new Uint8Array([1,2,3]):bytes,
  confirm:async(_auth,item,sha256)=>{if(controls.revoked)throw {code:'42501'};if(!metadata.verified_at){metadata.verified_at='verified';commits++;}return {ok:true,id,operationId:controls.wrongAck?'wrong':operationId,sha256,verified:true};},
 });
 const request=(value=body,headers={})=>gateway(new Request('https://synthetic.invalid/functions/v1/machine-evidence',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)}));
 return {request,controls,commits:()=>commits};
}
test('gateway verifies bytes before finalization and replay produces one acknowledgement',async()=>{
 const f=fixture();for(let i=0;i<2;i++){const response=await f.request();assert.equal(response.status,200);assert.equal((await response.json()).verified,true);}assert.equal(f.commits(),1);
});
test('gateway denies untrusted origin, missing auth, cross-region permission and revocation',async()=>{
 const f=fixture();assert.equal((await f.request(body,{Origin:'https://untrusted.example'})).status,403);
 f.controls.auth=false;assert.equal((await f.request()).status,401);f.controls.auth=true;
 f.controls.deny=true;const denied=await f.request();assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/SQL|customer|payload/);
 f.controls.deny=false;f.controls.revoked=true;assert.equal((await f.request()).status,403);assert.equal(f.commits(),0);
});
test('gateway rejects spoofed images, oversized files and injected ownership/path properties',async()=>{
 const f=fixture();for(const extra of [{actor:'foreign'},{bucket:'public'},{path:'foreign/file'}])assert.equal((await f.request({...body,...extra})).status,400);
 for(const data of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,PHNjcmlwdD4=','data:image/jpeg;base64,'+Buffer.alloc(2097153,255).toString('base64')])assert.equal((await f.request({...body,image:data})).status,400);
 assert.equal(f.commits(),0);
});
test('bad storage checksums, provider failures and missing receipts never confirm an image',async()=>{
 for(const control of ['corrupt','storageDown','wrongPath','wrongAck']){
  const f=fixture();f.controls[control]=true;const response=await f.request();assert.notEqual(response.status,200);assert.doesNotMatch(await response.text(),/secret-in-provider-error/);
  if(control!=='wrongAck')assert.equal(f.commits(),0);
 }
});
test('copying legacy images verifies every receipt and never changes the original list',async()=>{
 const images=[image,image];const original=structuredClone(images);let saves=0;
 const result=await copyLegacyEvidence({images,setCode:'S',allocate:async()=>({id,operationId}),upload:async()=>({id,operationId,ok:true,verified:true,sha256:(await inspectEvidenceImage(image)).sha256}),saveReceipt:async()=>{saves++;return true;}});
 assert.equal(result.legacyRetained,true);assert.equal(saves,2);assert.deepEqual(images,original);
 await assert.rejects(copyLegacyEvidence({images,setCode:'S',allocate:async()=>({id,operationId}),upload:async()=>({ok:true}),saveReceipt:async()=>true}));assert.deepEqual(images,original);
});
test('legacy image intent remains stable across reloads and binds owner, machine, position and content',async()=>{
 const value={owner:actor,setCode:'S1',index:0,sha256:(await inspectEvidenceImage(image)).sha256};
 const first=await deriveLegacyEvidenceIntent(value);assert.deepEqual(await deriveLegacyEvidenceIntent({...value}),first);
 for(const changes of [{owner:session},{setCode:'S2'},{index:1},{sha256:'a'.repeat(64)}])assert.notDeepEqual(await deriveLegacyEvidenceIntent({...value,...changes}),first);
});
