import {inspectEvidenceImage} from '../../supabase/functions/_shared/evidenceProtocol.js';
import {dataChecksum} from './dataIntegrity.js';
export const MAX_FIELD_ATTACHMENT_BYTES=8*1024*1024;
export async function encodeFieldBlob(blob) {
  if(!blob?.size||blob.size>2*1024*1024)throw Error('Tệp tải offline phải nhỏ hơn 2 MB.');
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
  for(let index=0;index<bytes.length;index+=8192)binary+=String.fromCharCode(...bytes.subarray(index,index+8192));
  return `data:${blob.type};base64,${btoa(binary)}`;
}
export async function attachFieldFiles(pack,{photos=false,documents=[]}={}) {
  const attachments=[];
  if(photos)for(const machine of pack.machines){
    const images=machine.offlinePhotos||[];
    for(let index=0;index<images.length;index++){
      const checked=await inspectEvidenceImage(images[index]);
      attachments.push({id:`${machine.setCode}:photo:${index}`,setCode:machine.setCode,title:`Ảnh hồ sơ ${index+1}`,mime:checked.mime,data:images[index]});
    }
  }
  for(const document of documents){
    if(!pack.machines.some(machine=>machine.setCode===document.setCode)||typeof document.id!=='string'||!document.id
      ||typeof document.title!=='string'||document.title.length>160||!/^data:application\/pdf;base64,JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(document.data||'')
      ||document.data.length>Math.ceil(2*1024*1024*4/3)+40)throw Error('Tài liệu offline không khớp hồ sơ hoặc vượt giới hạn.');
    try{const decoded=atob(document.data.split(',')[1]);if(!decoded.startsWith('%PDF-'))throw Error();}catch{throw Error('Nội dung PDF offline chưa hợp lệ.');}
    attachments.push({...document,mime:'application/pdf'});
  }
  if(attachments.length>12||new Set(attachments.map(file=>file.id)).size!==attachments.length)throw Error('Tối đa 12 ảnh/tài liệu trong một gói, không nhận tệp trùng.');
  if(new TextEncoder().encode(JSON.stringify(attachments)).length>MAX_FIELD_ATTACHMENT_BYTES)throw Error('Ảnh và tài liệu vượt 8 MB. Chọn ít bộ máy hoặc ít tài liệu hơn.');
  const machines=pack.machines.map(({offlinePhotos:_offlinePhotos,...machine})=>machine);
  return {...pack,machines,attachments:await Promise.all(attachments.map(async file=>({...file,checksum:await dataChecksum(file.data)}))),
    excluded:['Chỉ ảnh và tài liệu được chọn, có trong gói này mới đọc được khi mất mạng.']};
}

export function fieldQueueSummary(queue,now=Date.now()) {
  const counts={pending:0,retry_wait:0,needs_review:0,dead_letter:0,syncing:0};let oldest=now;
  for(const item of queue){if(Object.hasOwn(counts,item.status||'pending'))counts[item.status||'pending']++;
    if(Number.isFinite(item.createdAt))oldest=Math.min(oldest,item.createdAt);}
  return {total:queue.length,counts,oldestMinutes:queue.length?Math.max(0,Math.floor((now-oldest)/60000)):0,
    requiresAttention:counts.needs_review+counts.dead_letter>0};
}
