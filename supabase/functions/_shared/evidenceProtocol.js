export const EVIDENCE_BUCKET='machine-evidence';
export const MAX_EVIDENCE_BYTES=2097152;
export function evidenceError(code,status=400){return Object.assign(new Error(code),{code,status});}
export async function inspectEvidenceImage(value){
 if(typeof value!=='string'||value.length>2796250)throw evidenceError('INVALID_IMAGE');
 const match=value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match||match[2].length%4)throw evidenceError('INVALID_IMAGE');
 let bytes;try{bytes=Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0));}catch{throw evidenceError('INVALID_IMAGE');}
 if(!bytes.length||bytes.length>MAX_EVIDENCE_BYTES)throw evidenceError('IMAGE_SIZE_LIMIT');
 const starts=(...prefix)=>prefix.every((value,index)=>bytes[index]===value);
 const ascii=(start,end)=>String.fromCharCode(...bytes.subarray(start,end));
 if(!(match[1]==='image/jpeg'&&starts(255,216,255)||match[1]==='image/png'&&starts(137,80,78,71,13,10,26,10)
 ||match[1]==='image/webp'&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'))throw evidenceError('IMAGE_TYPE_MISMATCH');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
 return {bytes,sha256,mime:match[1],extension:{'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[match[1]]};
}
export async function evidenceDigest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');}
export function evidenceIdentity(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw evidenceError('INVALID_EVIDENCE_ID');return value.toLowerCase();}

export function createEvidenceGateway(deps){
 const allowedOrigins=new Set(['https://kythuat.nasun.workers.dev','https://kythuat-staging.nasun.workers.dev']);
 return async request=>{
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin&&allowedOrigins.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'});
  const response=(status,data)=>new Response(data===null?null:JSON.stringify(data),{status,headers});
  if(origin&&!allowedOrigins.has(origin))return response(403,{error:'ORIGIN_REJECTED'});
  if(request.method==='OPTIONS')return response(204,null);
  if(request.method!=='POST')return response(405,{error:'METHOD_NOT_ALLOWED'});
  try{
   const identity=await deps.authenticate(request);
   if(!identity?.userId||!identity.sessionId)throw evidenceError('AUTH_REQUIRED',401);
   const auth={...identity,userId:evidenceIdentity(identity.userId),sessionId:evidenceIdentity(identity.sessionId)};
   const reader=request.body?.getReader();if(!reader)throw evidenceError('INVALID_BODY');
   const chunks=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>3*1024*1024){await reader.cancel();throw evidenceError('BODY_TOO_LARGE',413);}chunks.push(value);}
   const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
   let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw evidenceError('INVALID_BODY');}
   if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['id','operationId','setCode','image'].includes(key)))throw evidenceError('INVALID_BODY');
   body.id=evidenceIdentity(body.id);body.operationId=evidenceIdentity(body.operationId);
   if(typeof body.setCode!=='string'||!body.setCode.trim()||body.setCode.length>120||/[\u0000-\u001f]/.test(body.setCode))throw evidenceError('INVALID_MACHINE');
   const image=await inspectEvidenceImage(body.image);
   const item=await deps.reserve(auth,{id:body.id,operationId:body.operationId,setCode:body.setCode,sha256:image.sha256,bytes:image.bytes.length,mime:image.mime});
   const path=`${auth.userId}/${body.id}/${image.sha256}.${image.extension}`;
   if(item?.id!==body.id||item.operation_id!==body.operationId||item.created_by!==auth.userId||item.machine_set_code!==body.setCode
    ||item.bucket_id!==EVIDENCE_BUCKET||item.object_path!==path||item.sha256!==image.sha256||item.byte_size!==image.bytes.length||item.mime_type!==image.mime)throw evidenceError('EVIDENCE_BINDING_REJECTED',403);
   if(!item.verified_at)await deps.writeObject(item,image.bytes,image.mime);
   const stored=await deps.readObject(item);
   if(!(stored instanceof Uint8Array)||stored.length!==image.bytes.length||await evidenceDigest(stored)!==image.sha256)throw evidenceError('EVIDENCE_CHECKSUM_MISMATCH',409);
   const receipt=await deps.confirm(auth,item,image.sha256,stored.length);
   if(receipt?.ok!==true||receipt.id!==body.id||receipt.operationId!==body.operationId||receipt.sha256!==image.sha256||receipt.verified!==true)throw evidenceError('EVIDENCE_ACK_MISSING',503);
   return response(200,receipt);
  }catch(error){
   const safeCodes=new Set(['AUTH_REQUIRED','ORIGIN_REJECTED','INVALID_IMAGE','IMAGE_SIZE_LIMIT','IMAGE_TYPE_MISMATCH','INVALID_EVIDENCE_ID','INVALID_BODY','BODY_TOO_LARGE','INVALID_MACHINE','EVIDENCE_BINDING_REJECTED','EVIDENCE_CHECKSUM_MISMATCH','EVIDENCE_ACK_MISSING']);
   const status=error?.code==='42501'?403:error?.code==='54000'?429:['23514','23505'].includes(error?.code)?409:safeCodes.has(error?.code)?error.status:503;
   return response(status,{error:safeCodes.has(error?.code)?error.code:status===403?'ACCESS_DENIED':status===429?'RATE_LIMITED':status===409?'CONFLICT':'EVIDENCE_UNAVAILABLE'});
  }
 };
}
