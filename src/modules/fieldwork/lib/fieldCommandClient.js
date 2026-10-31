import {supabase} from '../../../shared/lib/supabase.js';
import {getOfflineOwner,getQueue,addToQueue,getCacheStrict,setCache,withOfflineLease} from '../../../shared/lib/offlineDb.js';
import {makeFieldCommand,createFieldOutbox,requireFieldReceipt,fieldError} from './fieldCommands.js';

const receiptKey=id=>`field-receipt:${id}`;
export async function replayFieldCommand(command,assertOwner) {
  assertOwner();
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  let response;
  try{response=await supabase.rpc('execute_field_command',{p_command:command}).abortSignal(controller.signal);}
  finally{clearTimeout(timer);}
  const {data,error}=response;
  assertOwner();
  if(controller.signal.aborted)throw fieldError('QUERY_TIMEOUT');
  if(error){if(['42883','PGRST202'].includes(error.code))throw fieldError('SCHEMA_MIGRATION_REQUIRED');throw error;}
  const receipt=requireFieldReceipt(command,data);
  // A durable receipt must precede removal, including crash/reload after a successful commit.
  if(!await setCache(receiptKey(command.operationId),receipt))throw fieldError('FIELD_RECEIPT_WRITE_FAILED');
  assertOwner();return receipt;
}
export async function submitFieldCommand(input,options={}) {
  const owner=getOfflineOwner();
  const command=await makeFieldCommand({...input,owner});
  const assertOwner=()=>{if(!owner||owner!==getOfflineOwner())throw fieldError('OFFLINE_OWNER_CHANGED');};
  assertOwner();
  const stage=createFieldOutbox({owner:getOfflineOwner,loadQueue:getQueue,saveQueue:addToQueue,
    loadReceipt:id=>getCacheStrict(receiptKey(id)),notify:()=>window.dispatchEvent(new Event('offline-queue-updated'))});
  const locked=await withOfflineLease('field-stage',()=>stage(command,{online:navigator.onLine,confirmed:options.confirmed===true}));
  if(!locked.acquired)throw fieldError('SYNC_LEASE_LOST');
  const result=locked.value;
  if(!result.queued||!navigator.onLine)return result;
  const {syncOfflineQueue}=await import('../../../shared/lib/offlineSync.js');
  await syncOfflineQueue();assertOwner();
  const receipt=await getCacheStrict(receiptKey(command.operationId));assertOwner();
  if(receipt)return {queued:false,receipt:requireFieldReceipt(command,receipt)};
  const pending=(await getQueue()).find(item=>item.operationId===command.operationId);assertOwner();
  if(pending&&['needs_review','dead_letter'].includes(pending.status))throw fieldError(pending.lastErrorCode||'FIELD_REVIEW_REQUIRED');
  return {queued:true,operationId:command.operationId};
}
