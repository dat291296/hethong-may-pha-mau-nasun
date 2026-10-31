export async function retainReviewedCommand(item,{saveArchive,remove,now=Date.now}){
 if(item?.action!=='FIELD_OPERATION'||!['needs_review','dead_letter'].includes(item.status)||!item.payload?.operationId)throw Error('FIELD_REVIEW_REQUIRED');
 const archive={version:1,item:structuredClone(item),retainedAt:now(),reason:'manual-recheck-with-current-server-state'};
 if(await saveArchive(archive)!==true)throw Error('FIELD_ARCHIVE_WRITE_FAILED');
 // The full original remains encrypted and inspectable before leaving the active outbox.
 if(await remove(item.id)!==true)throw Error('FIELD_ARCHIVE_QUEUE_REMOVE_FAILED');
 return archive;
}
export function fieldReviewDescription(command){
 const value=command?.payload||{};
 const notes=typeof value.notes==='string'?value.notes:typeof value.error_description==='string'?value.error_description:'';
 return {kind:command?.kind||'UNKNOWN',entityId:command?.entityId||'',expected:command?.expected??null,notes,
  materials:Array.isArray(value.materials_used)?value.materials_used.filter(item=>typeof item==='string'):[],
  photoCount:['photos','before_photos','after_photos'].reduce((sum,key)=>sum+(Array.isArray(value[key])?value[key].length:0),0)};
}
