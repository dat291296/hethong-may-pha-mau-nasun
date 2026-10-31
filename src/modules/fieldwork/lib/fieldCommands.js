import { canonicalData, dataChecksum } from '../../../shared/lib/dataIntegrity.js';

export const FIELD_COMMAND_VERSION = 1;
export const MAX_FIELD_OUTBOX_BYTES=32*1024*1024;
export const FIELD_COMMAND_KINDS = ['REPAIR_CREATE','REPAIR_EDIT','MAINTENANCE','INSTALL','TRANSFER','WITHDRAW'];
export const ONLINE_FIELD_KINDS = ['INSTALL','TRANSFER','WITHDRAW'];
export function fieldError(code) { return Object.assign(new Error(code), {code}); }
export async function makeFieldCommand({owner,kind,entityId,expected=null,payload,operationId}) {
  if (!owner || !FIELD_COMMAND_KINDS.includes(kind) || typeof entityId!=='string' || !entityId.trim() || entityId.length>160
    || !payload || Array.isArray(payload) || typeof payload!=='object') throw fieldError('INVALID_FIELD_COMMAND');
  if (kind==='REPAIR_EDIT' && (!Number.isSafeInteger(expected) || expected<1)) throw fieldError('REVISION_REQUIRED');
  if (['MAINTENANCE',...ONLINE_FIELD_KINDS].includes(kind) && (typeof expected!=='string' || !Number.isFinite(Date.parse(expected)))) throw fieldError('REVISION_REQUIRED');
  const request={version:FIELD_COMMAND_VERSION,kind,entityId,expected,payload:structuredClone(payload)};
  if(new TextEncoder().encode(canonicalData(request)).length>12*1024*1024)throw fieldError('FIELD_COMMAND_TOO_LARGE');
  const checksum=await dataChecksum({owner,...request});
  const hex=checksum.slice(0,32).split('');hex[12]='8';hex[16]=((parseInt(hex[16],16)&3)|8).toString(16);
  const value=hex.join('');
  const stableId=`${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
  const id=operationId||stableId;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw fieldError('INVALID_FIELD_COMMAND');
  return {...request,operationId:id,owner,checksum};
}
export function requireFieldReceipt(command,receipt) {
  if(receipt?.ok!==true || receipt.operationId!==command.operationId || receipt.kind!==command.kind || receipt.entityId!==command.entityId
    ||receipt.checksum!==command.checksum|| !Number.isSafeInteger(receipt.version) || receipt.version<1
    ||(command.kind==='REPAIR_EDIT'&&receipt.version<=command.expected))throw fieldError('FIELD_RECEIPT_INVALID');
  return receipt;
}
export function validateMaintenanceChecklist(checklist) {
  if(checklist?.version!==1 || typeof checklist.model!=='string' || typeof checklist.serial!=='string'
    || !Array.isArray(checklist.steps) || !checklist.steps.length || checklist.steps.length>30
    || checklist.steps.some((step,index)=>step.id!==String(index+1)||typeof step.label!=='string'||!step.label||step.label.length>300||!['PASS','ISSUE','NA'].includes(step.result))) throw fieldError('INVALID_CHECKLIST');
  return checklist.steps.some(step=>step.result==='ISSUE');
}

// A durable entry is created before any network call; pending and confirmed are distinct.
export function createFieldOutbox({owner,loadQueue,saveQueue,loadReceipt,notify=()=>{},now=Date.now,maxBytes=MAX_FIELD_OUTBOX_BYTES}) {
  return async(command,{online=false,confirmed=false}={})=>{
    const account=owner();
    const assertOwner=()=>{if(!account||account!==command.owner||owner()!==account)throw fieldError('OFFLINE_OWNER_CHANGED');};
    assertOwner();
    if(ONLINE_FIELD_KINDS.includes(command.kind)&&(!online||!confirmed))throw fieldError('ONLINE_CONFIRMATION_REQUIRED');
    const receipt=await loadReceipt(command.operationId);assertOwner();
    if(receipt){requireFieldReceipt(command,receipt);return {queued:false,receipt};}
    const queue=await loadQueue();assertOwner();
    const previous=queue.find(item=>item.operationId===command.operationId);
    if(previous){
      if(previous.payload?.checksum!==command.checksum)throw fieldError('FIELD_INTENT_CONFLICT');
      if(['needs_review','dead_letter'].includes(previous.status))throw fieldError(previous.lastErrorCode||'FIELD_REVIEW_REQUIRED');
      return {queued:true,operationId:command.operationId};
    }
    if(queue.some(item=>item.action==='FIELD_OPERATION'&&item.payload?.entityId===command.entityId))throw fieldError('FIELD_PENDING_EDIT');
    if(queue.length>=250)throw fieldError('OFFLINE_DOCUMENT_FULL');
    let bytes=new TextEncoder().encode(canonicalData(command)).byteLength;
    for(const item of queue){bytes+=new TextEncoder().encode(JSON.stringify(item.payload||{})).byteLength;if(bytes>maxBytes)break;}
    if(bytes>maxBytes)throw fieldError('OFFLINE_DOCUMENT_FULL');
    const at=now();
    const item={id:`field:${command.operationId}`,operationId:command.operationId,ownerId:account,action:'FIELD_OPERATION',payload:command,
      entityType:command.kind.startsWith('REPAIR')?'repair_tickets':'system_sets',entityId:command.entityId,
      schemaVersion:3,engineVersion:2,contractVersion:1,status:'pending',attempts:0,nextAttemptAt:0,createdAt:at,updatedAt:at,timestamp:at};
    if(await saveQueue(item)!==true)throw fieldError('OFFLINE_QUEUE_WRITE_FAILED');
    assertOwner();notify();return {queued:true,operationId:command.operationId};
  };
}
