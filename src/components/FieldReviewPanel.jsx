import {useCallback,useEffect,useState} from 'react';
import {getQueue,getOfflineOwner,getOwnedCacheEntries,setCache,removeFromQueue,withOfflineLease} from '../lib/offlineDb.js';
import {fieldReviewDescription,retainReviewedCommand} from '../lib/fieldReview.js';
export default function FieldReviewPanel(){
 const [pending,setPending]=useState([]),[archived,setArchived]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{const owner=getOfflineOwner();try{const [queue,archive]=await Promise.all([getQueue(),getOwnedCacheEntries('field-review-original:')]);if(owner!==getOfflineOwner())return;setPending(queue.filter(item=>item.action==='FIELD_OPERATION'&&['needs_review','dead_letter'].includes(item.status)));setArchived(archive.filter(entry=>entry.value?.item).map(entry=>entry.value));}catch{setMessage('Không đọc được kho đối chiếu. Giữ dữ liệu thiết bị và thử lại.');}},[]);
 useEffect(()=>{refresh();window.addEventListener('offline-queue-updated',refresh);return()=>window.removeEventListener('offline-queue-updated',refresh);},[refresh]);
 const retain=async(id)=>{setBusy(true);try{
  const owner=getOfflineOwner();const task=async()=>{
   if(owner!==getOfflineOwner())throw Error('OWNER_CHANGED');
   const item=(await getQueue()).find(row=>row.id===id);if(item?.ownerId!==owner)throw Error('OWNER_CHANGED');
   await retainReviewedCommand(item,{saveArchive:value=>setCache(`field-review-original:${item.operationId}`,value),remove:async key=>{if(owner!==getOfflineOwner())throw Error('OWNER_CHANGED');return removeFromQueue(key);}});
  };
  if(navigator.locks?.request)await navigator.locks.request('nasun-offline-sync',{mode:'exclusive'},task);
  else if(!(await withOfflineLease('queue-sync',task)).acquired)throw Error('LOCK_BUSY');
  setMessage('Bản gốc đầy đủ đã được giữ trong kho đối chiếu bên dưới. Tải lại hồ sơ máy/phiếu từ server, đối chiếu nội dung rồi tạo bản sửa mới.');window.dispatchEvent(new Event('offline-queue-updated'));await refresh();
 }catch{setMessage('Chưa hoàn tất lưu bản gốc. Hàng chờ hoặc bản lưu vẫn được giữ; không xóa dữ liệu trình duyệt.');}finally{setBusy(false);}};
 const render=(command)=>{const view=fieldReviewDescription(command);return <><strong>{view.kind} · {view.entityId}</strong><p>Bản gốc: {view.expected??'Tạo mới'} · {view.photoCount} ảnh giữ trong bản lưu</p><label>Nội dung gốc<textarea readOnly className="form-textarea" value={[view.notes,...view.materials].filter(Boolean).join('\n')} /></label></>;};
 if(!pending.length&&!archived.length&&!message)return null;
 return <section className="field-offline" aria-label="Đối chiếu thay đổi chưa đồng bộ"><h4>Đối chiếu trước khi sửa lại</h4><p>Không thử ghi đè xung đột. Giữ bản gốc, tải bản server mới và kiểm tra lại đúng máy/seri/NPP.</p>{message&&<p role="status">{message}</p>}{pending.map(item=><article className="field-profile" key={item.id}>{render(item.payload)}<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>retain(item.id)}>Giữ bản gốc để đối chiếu và làm lại</button></article>)}<details><summary>Bản gốc đã giữ trên thiết bị ({archived.length})</summary>{archived.map(value=><article key={value.item.id}>{render(value.item.payload)}<small>Chỉ lưu trên thiết bị này; không phải bản backup và chưa gửi lại.</small></article>)}</details></section>;
}
