import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFieldCommand,requireFieldReceipt,createFieldOutbox,validateMaintenanceChecklist} from '../src/lib/fieldCommands.js';
import {attachFieldFiles,fieldQueueSummary} from '../src/lib/fieldAttachments.js';
import {flushBeforeAppUpdate} from '../src/lib/appUpdateSafety.js';
import {retainReviewedCommand} from '../src/lib/fieldReview.js';
const base={owner:'synthetic-A',kind:'REPAIR_EDIT',entityId:'ticket-A',expected:3,payload:{id:'ticket-A',notes:'Thay linh kiện tại hiện trường'}};
const receipt=command=>({ok:true,operationId:command.operationId,kind:command.kind,entityId:command.entityId,version:4,checksum:command.checksum});
test('field identity survives reload and changes for a changed revision, actor or payload',async()=>{
 const first=await makeFieldCommand(base);
 assert.deepEqual(await makeFieldCommand({...base,payload:{notes:base.payload.notes,id:'ticket-A'}}),first);
 for(const change of [{expected:4},{owner:'synthetic-B'},{payload:{id:'ticket-A',notes:'Nội dung khác'}}])assert.notEqual((await makeFieldCommand({...base,...change})).operationId,first.operationId);
 for(const expected of [null,0,-1,'3'])await assert.rejects(makeFieldCommand({...base,expected}),{code:'REVISION_REQUIRED'});
});
test('only the matching durable receipt can acknowledge an operation',async()=>{
 const command=await makeFieldCommand(base);assert.equal(requireFieldReceipt(command,receipt(command)).version,4);
 for(const change of [{ok:false},{operationId:'wrong'},{kind:'MAINTENANCE'},{entityId:'foreign'},{checksum:'wrong'},{version:3},{version:NaN}])assert.throws(()=>requireFieldReceipt(command,{...receipt(command),...change}),{code:'FIELD_RECEIPT_INVALID'});
});
test('outbox persists before transport, preserves review state and refuses a second unresolved edit',async()=>{
 let queue=[],saved=0;const command=await makeFieldCommand(base);
 const stage=createFieldOutbox({owner:()=>base.owner,loadQueue:async()=>queue,loadReceipt:async()=>null,saveQueue:async item=>{queue.push(item);saved++;return true;}});
 assert.equal((await stage(command)).queued,true);assert.equal(saved,1);
 assert.equal((await stage(command)).queued,true);assert.equal(saved,1);
 await assert.rejects(stage(await makeFieldCommand({...base,payload:{id:'ticket-A',notes:'Second'}})),{code:'FIELD_PENDING_EDIT'});
 queue[0].status='needs_review';queue[0].lastErrorCode='PT409';await assert.rejects(stage(command),{code:'PT409'});assert.equal(queue.length,1);
});
test('quota and account switch do not acknowledge a write',async()=>{
 const command=await makeFieldCommand(base);
 const stage=createFieldOutbox({owner:()=>base.owner,loadQueue:async()=>[],loadReceipt:async()=>null,saveQueue:async()=>false});
 await assert.rejects(stage(command),{code:'OFFLINE_QUEUE_WRITE_FAILED'});
 let owner=base.owner;
 const changed=createFieldOutbox({owner:()=>owner,loadQueue:async()=>{owner='synthetic-B';return [];},loadReceipt:async()=>null,saveQueue:async()=>true});
 await assert.rejects(changed(command),{code:'OFFLINE_OWNER_CHANGED'});
});
test('a cached receipt never acknowledges another payload using the same explicit operation ID',async()=>{
 const first=await makeFieldCommand(base),second=await makeFieldCommand({...base,operationId:first.operationId,payload:{id:'ticket-A',notes:'Changed'}});
 const stage=createFieldOutbox({owner:()=>base.owner,loadQueue:async()=>[],loadReceipt:async()=>receipt(first),saveQueue:async()=>true});
 await assert.rejects(stage(second),{code:'FIELD_RECEIPT_INVALID'});
});
test('allocation requires a revision, live confirmation, and a connection before queueing',async()=>{
 const command=await makeFieldCommand({...base,kind:'INSTALL',expected:'2026-10-27T01:00:00Z'});let writes=0;
 const stage=createFieldOutbox({owner:()=>base.owner,loadQueue:async()=>[],loadReceipt:async()=>null,saveQueue:async()=>{writes++;return true;}});
 for(const options of [{},{online:true},{confirmed:true}])await assert.rejects(stage(command,options),{code:'ONLINE_CONFIRMATION_REQUIRED'});
 assert.equal(writes,0);assert.equal((await stage(command,{online:true,confirmed:true})).queued,true);
});
test('checklist requires a version, identity and an answer for every captured step',()=>{
 const checklist={version:1,model:'Synthetic dispenser',serial:'SYN-001',steps:[{id:'1',label:'Kiểm tra ống',result:'PASS'}]};
 assert.equal(validateMaintenanceChecklist(checklist),false);
 assert.equal(validateMaintenanceChecklist({...checklist,steps:[{...checklist.steps[0],result:'ISSUE'}]}),true);
 for(const change of [{version:2},{steps:[]},{steps:[{...checklist.steps[0],result:''}]}])assert.throws(()=>validateMaintenanceChecklist({...checklist,...change}),{code:'INVALID_CHECKLIST'});
});
test('field files are bounded, bound to selected machines and do not change the old pack',async()=>{
 const pack={machines:[{setCode:'SYN-MACHINE',offlinePhotos:[]}],repairs:[]},old=structuredClone(pack);
 const file={id:'SYN-DOC',setCode:'SYN-MACHINE',title:'Synthetic manual',data:'data:application/pdf;base64,JVBERi0xLjQKJSVFT0Y='};
 const next=await attachFieldFiles(pack,{documents:[file]});assert.deepEqual(pack,old);assert.equal(next.attachments.length,1);assert.equal(next.attachments[0].checksum.length,64);
 await assert.rejects(attachFieldFiles(pack,{documents:[{...file,setCode:'FOREIGN'}]}));
 await assert.rejects(attachFieldFiles(pack,{documents:[{...file,data:'data:text/html;base64,PHNjcmlwdD4='}]}));
 await assert.rejects(attachFieldFiles(pack,{documents:[file,file]}));
});
test('operational summary contains counts and ages without business payloads',()=>{
 const result=fieldQueueSummary([{status:'needs_review',createdAt:0,payload:{secret:'customer'}},{status:'retry_wait',createdAt:30000}],120000);
 assert.equal(result.total,2);assert.equal(result.oldestMinutes,2);assert.equal(result.requiresAttention,true);assert.doesNotMatch(JSON.stringify(result),/secret|customer|payload/);
});
test('five isolated field clients preserve independent queues and stable identities',async()=>{
 const states=await Promise.all(Array.from({length:5},async(_,index)=>{
  const owner=`synthetic-${index}`,queue=[];
  const command=await makeFieldCommand({...base,owner,entityId:`ticket-${index}`});
  const stage=createFieldOutbox({owner:()=>owner,loadQueue:async()=>queue,loadReceipt:async()=>null,saveQueue:async item=>{queue.push(item);return true;}});
  await stage(command);await stage(command);return queue;
 }));
 assert.equal(new Set(states.map(queue=>queue[0].operationId)).size,5);assert.ok(states.every(queue=>queue.length===1));
});
test('application updates wait for every active draft and stop if one cannot be saved',async()=>{
 const target=new EventTarget();let saved=0;
 target.addEventListener('nasun-prepare-update',event=>{event.detail.waitUntil(Promise.resolve().then(()=>saved++));event.detail.waitUntil(Promise.resolve().then(()=>saved++));});
 assert.deepEqual(await flushBeforeAppUpdate(target),{draftsFlushed:2,requiresAllTabsClosed:true});assert.equal(saved,2);
 target.addEventListener('nasun-prepare-update',event=>event.detail.waitUntil(Promise.reject(Error('QUOTA'))));
 await assert.rejects(flushBeforeAppUpdate(target),/QUOTA/);
});
test('reviewed outbox edits only leave the active queue after the entire original is retained',async()=>{
 const command=await makeFieldCommand(base);const item={id:'local-item',action:'FIELD_OPERATION',status:'needs_review',payload:command};
 let removed=false;await assert.rejects(retainReviewedCommand(item,{saveArchive:async()=>false,remove:async()=>{removed=true;return true;}}));assert.equal(removed,false);
 let archive;await retainReviewedCommand(item,{saveArchive:async value=>{archive=value;return true;},remove:async()=>{assert.deepEqual(archive.item,item);removed=true;return true;}});assert.equal(removed,true);
 assert.deepEqual(archive.item.payload.payload,base.payload);
 await assert.rejects(retainReviewedCommand({...item,status:'pending'},{saveArchive:async()=>true,remove:async()=>true}));
});
test('outbox byte budget rejects a new photo-heavy intent without discarding older entries',async()=>{
 const command=await makeFieldCommand(base);const original={id:'old',payload:{notes:'Legacy entry retained'}};let writes=0;
 const stage=createFieldOutbox({owner:()=>base.owner,loadQueue:async()=>[original],loadReceipt:async()=>null,saveQueue:async()=>{writes++;return true;},maxBytes:100});
 await assert.rejects(stage(command),{code:'OFFLINE_DOCUMENT_FULL'});assert.equal(writes,0);assert.equal(original.payload.notes,'Legacy entry retained');
});
