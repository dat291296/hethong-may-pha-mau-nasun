import {supabase} from '../../../shared/lib/supabase.js';
import {getOfflineOwner} from '../../../shared/lib/offlineDb.js';
import {encodeFieldBlob} from './fieldAttachments.js';
export async function loadFieldDocuments({machines,ids=null}) {
  const owner=getOfflineOwner();const assertOwner=()=>{if(!owner||getOfflineOwner()!==owner)throw Error('OFFLINE_OWNER_CHANGED');};assertOwner();
  const models=[...new Set(machines.flatMap(machine=>['dispenser','mixer','computer','printer'].map(type=>machine[`${type}Model`])).filter(Boolean))];
  if(!models.length)return [];
  let query=supabase.from('technical_documents').select('id,title,machine_model,storage_path,file_size').eq('mime_type','application/pdf').in('machine_model',models).lte('file_size',2097152).order('id').limit(30);
  if(ids){if(!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length)throw Error('Chọn tối đa 3 tài liệu.');query=query.in('id',ids);}
  const {data,error}=await query;assertOwner();if(error)throw Error('Chưa tải được tài liệu PDF riêng tư. Kiểm tra kết nối và quyền truy cập.');
  if(!ids)return data||[];
  if(data.length!==ids.length)throw Error('Có tài liệu không còn trong phạm vi được phép. Chọn lại danh sách.');
  const files=[];
  for(const document of data){
    if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i.test(document.storage_path||''))throw Error('Tài liệu chưa có file PDF phù hợp để tải offline.');
    const result=await supabase.storage.from('technical-documents').download(document.storage_path);assertOwner();
    if(result.error||!result.data||result.data.size!==Number(document.file_size))throw Error('Chưa xác nhận đủ nội dung tài liệu. Gói cũ vẫn được giữ.');
    const header=new Uint8Array(await result.data.slice(0,5).arrayBuffer());
    if(String.fromCharCode(...header)!=='%PDF-')throw Error('Nội dung không phải PDF.');
    const machine=machines.find(row=>['dispenser','mixer','computer','printer'].some(type=>row[`${type}Model`]===document.machine_model));
    files.push({id:document.id,title:document.title,setCode:machine.setCode,data:await encodeFieldBlob(new Blob([result.data],{type:'application/pdf'}))});assertOwner();
  }
  return files;
}
