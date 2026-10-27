import {inspectEvidenceImage,evidenceIdentity} from '../../supabase/functions/_shared/evidenceProtocol.js';
export async function deriveLegacyEvidenceIntent({owner,setCode,index,sha256}){
 owner=evidenceIdentity(owner);
 if(typeof setCode!=='string'||!setCode||setCode.length>120||!Number.isSafeInteger(index)||index<0||!/^[0-9a-f]{64}$/.test(sha256))throw Error('INVALID_LEGACY_EVIDENCE_IDENTITY');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['nasun-evidence-v1',owner,setCode,index,sha256]))));
 bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes.subarray(0,16),byte=>byte.toString(16).padStart(2,'0')).join('');
 const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
 return {id,operationId:id};
}
// Copy first, verify remotely, retain every legacy value until a later approved migration.
export async function copyLegacyEvidence({images,setCode,owner,allocate=identity=>deriveLegacyEvidenceIntent({owner,...identity}),upload,saveReceipt}){
 if(!Array.isArray(images)||!setCode)throw Error('INVALID_LEGACY_EVIDENCE');
 const originals=images.slice();
 const receipts=[];
 for(let index=0;index<originals.length;index++){
  const image=await inspectEvidenceImage(originals[index]);
  const intent=await allocate({setCode,index,sha256:image.sha256});
  const receipt=await upload({id:intent.id,operationId:intent.operationId,setCode,image:originals[index]});
  if(receipt?.ok!==true||receipt.verified!==true||receipt.id!==intent.id||receipt.operationId!==intent.operationId||receipt.sha256!==image.sha256)throw Error('EVIDENCE_COPY_NOT_VERIFIED');
  if(await saveReceipt({setCode,index,...receipt})!==true)throw Error('EVIDENCE_RECEIPT_NOT_DURABLE');
  receipts.push(receipt);
 }
 if(images.length!==originals.length||images.some((image,index)=>image!==originals[index]))throw Error('EVIDENCE_SOURCE_CHANGED');
 return {receipts,legacyRetained:true};
}
