import {createClient} from 'npm:@supabase/supabase-js@2.110.9';
import {createEvidenceGateway,evidenceError,MAX_EVIDENCE_BYTES} from '../_shared/evidenceProtocol.js';
const url=Deno.env.get('SUPABASE_URL')!;
const timedFetch=(input:any,options:any={})=>fetch(input,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(20000)].filter(Boolean))});
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:timedFetch}});
const checked=(result:any)=>{if(result.error)throw result.error;return result.data;};
Deno.serve(createEvidenceGateway({
 authenticate:async(request:Request)=>{
  const token=request.headers.get('Authorization');if(!token?.startsWith('Bearer '))throw evidenceError('AUTH_REQUIRED',401);
  const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:token},fetch:timedFetch}});
  const identity=await client.auth.getUser(token.slice(7));if(identity.error||!identity.data.user)throw evidenceError('AUTH_REQUIRED',401);
  const state=checked(await client.rpc('get_session_security_state'));
  if(state?.user_id!==identity.data.user.id||state.profile_found!==true||state.is_active!==true)throw evidenceError('AUTH_REQUIRED',401);
  let claims;try{const part=token.slice(7).split('.')[1].replace(/-/g,'+').replace(/_/g,'/');claims=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')));}catch{throw evidenceError('AUTH_REQUIRED',401);}
  return {userId:identity.data.user.id,sessionId:claims.session_id,client};
 },
 throttle:async(auth:any)=>checked(await auth.client.rpc('consume_machine_evidence_quota')),
 reserve:async(auth:any,item:any)=>checked(await auth.client.rpc('reserve_machine_evidence',{p_id:item.id,p_operation_id:item.operationId,p_set_code:item.setCode,p_sha256:item.sha256,p_byte_size:item.bytes,p_mime_type:item.mime})),
 writeObject:async(item:any,bytes:Uint8Array,mime:string)=>{
  const result=await service.storage.from(item.bucket_id).upload(item.object_path,bytes,{contentType:mime,upsert:false});
  if(result.error&&!['409','Duplicate'].includes(String((result.error as any).statusCode))&&result.error.message!=='The resource already exists')throw result.error;
 },
 readObject:async(item:any)=>{
  const blob=checked(await service.storage.from(item.bucket_id).download(item.object_path));
  if(!blob||blob.size>MAX_EVIDENCE_BYTES)throw evidenceError('EVIDENCE_CHECKSUM_MISMATCH',409);
  return new Uint8Array(await blob.arrayBuffer());
 },
 confirm:async(auth:any,item:any,sha256:string,bytes:number)=>checked(await service.rpc('finalize_machine_evidence',{p_id:item.id,p_actor:auth.userId,p_session:auth.sessionId,p_sha256:sha256,p_byte_size:bytes})),
}));
