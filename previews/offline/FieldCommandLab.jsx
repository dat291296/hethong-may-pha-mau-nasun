import {useEffect,useState} from 'react';
import {makeFieldCommand,createFieldOutbox,requireFieldReceipt} from '../../src/lib/fieldCommands.js';
import {getOfflineOwner,getQueue,addToQueue,removeFromQueue,getCacheStrict,setCache,withOfflineLease} from '../../src/lib/offlineDb.js';
import {fieldQueueSummary} from '../../src/lib/fieldAttachments.js';
import {resolveFailureState} from '../../src/lib/syncQueue.js';
import FieldReviewPanel from '../../src/components/FieldReviewPanel.jsx';
const initialRevision='2026-10-27T01:00:00.000Z';
export default function FieldCommandLab({mode,quota}){
 const [kind,setKind]=useState('REPAIR_EDIT'),[notes,setNotes]=useState('Kiểm tra dây nguồn tại hiện trường'),[confirmed,setConfirmed]=useState(false),[queue,setQueue]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [expected,setExpected]=useState(1);
 const refresh=async()=>{setQueue((await getQueue()).filter(item=>item.action==='FIELD_OPERATION'));window.dispatchEvent(new Event('offline-queue-updated'));};
 useEffect(()=>{const changed=()=>getQueue().then(items=>setQueue(items.filter(item=>item.action==='FIELD_OPERATION')));changed();window.addEventListener('offline-queue-updated',changed);return()=>window.removeEventListener('offline-queue-updated',changed);},[]);
 const stage=createFieldOutbox({owner:getOfflineOwner,loadQueue:getQueue,saveQueue:item=>quota?false:addToQueue(item),loadReceipt:id=>getCacheStrict(`lab-receipt:${id}`)});
 const machineKind=!kind.startsWith('REPAIR');const entityId=machineKind?'NS-DEMO-001':'SYN-REPAIR-001';
 async function submit(){setBusy(true);setMessage('');try{
  const payload={id:entityId,notes};
  const command=await makeFieldCommand({owner:getOfflineOwner(),kind,entityId,expected:machineKind?initialRevision:expected,payload});
  const result=await stage(command,{online:mode==='online'||mode==='lost',confirmed});
  setMessage(result.queued?'Đã lưu bền vững vào hàng chờ · Chưa có xác nhận server mô phỏng.':'Thao tác này đã có receipt đúng mã và nội dung.');if(result.receipt&&kind.startsWith('REPAIR'))setExpected(result.receipt.version);await refresh();
 }catch(error){setMessage(error.code==='ONLINE_CONFIRMATION_REQUIRED'?'Cấp phát/điều chuyển/thu hồi cần mạng và tích xác nhận.':error.code==='FIELD_PENDING_EDIT'?'Còn thay đổi của hồ sơ này trong hàng chờ. Giữ bản gốc và đối chiếu trước khi sửa tiếp.':error.code==='OFFLINE_QUEUE_WRITE_FAILED'?'Không lưu được hàng chờ. Nội dung còn trên màn hình, chưa được coi là đã lưu.':error.code||'Chưa lưu được.');}finally{setBusy(false);}}
 async function sync(){setBusy(true);try{
  const result=await withOfflineLease('field-lab-sync',async assertLease=>{
   for(const item of (await getQueue()).filter(item=>item.action==='FIELD_OPERATION'&&!['needs_review','dead_letter'].includes(item.status))){
    try{
     assertLease();if(mode==='offline')throw Object.assign(Error('NETWORK'),{code:'QUERY_TIMEOUT'});
     if(mode==='expired'||mode==='forbidden')throw Object.assign(Error('DENIED'),{code:'42501'});
     const command=item.payload;const state=await getCacheStrict('lab-server',{versions:{},receipts:{},auditCount:0});
     let receipt=state.receipts[command.operationId];
     if(!receipt){
      const current=state.versions[command.entityId]??1;
      if(command.kind.startsWith('REPAIR')&&command.expected!==current)throw Object.assign(Error('CONFLICT'),{code:'PT409'});
      receipt={ok:true,operationId:command.operationId,kind:command.kind,entityId:command.entityId,version:current+1,checksum:command.checksum};
      state.receipts[command.operationId]=receipt;state.versions[command.entityId]=current+1;state.auditCount++;
      if(!await setCache('lab-server',state))throw Error('WRITE_FAILED');
     }
     if(mode==='lost')throw Object.assign(Error('ACK_LOST'),{code:'QUERY_TIMEOUT'});
     requireFieldReceipt(command,receipt);if(!await setCache(`lab-receipt:${command.operationId}`,receipt))throw Error('WRITE_FAILED');
     assertLease();await removeFromQueue(item.id);if(command.kind.startsWith('REPAIR'))setExpected(receipt.version);
    }catch(error){await addToQueue({...item,...resolveFailureState(item,error)});}
   }
  });
  if(!result.acquired)throw Error('LEASE_UNAVAILABLE');
  const server=await getCacheStrict('lab-server',{auditCount:0});setMessage(`Server mô phỏng ghi ${server.auditCount} lần. Gửi lại sau mất phản hồi không tạo thêm lần ghi.`);await refresh();
 }catch{setMessage('Chưa hoàn tất đồng bộ. Dữ liệu vẫn được giữ.');}finally{setBusy(false);}}
 const summary=fieldQueueSummary(queue);
 return <section className="card"><span className="eyebrow">GIAI ĐOẠN 4–10 · LÕI HÀNG CHỜ DÙNG CHUNG VỚI APP</span><h2>Nghiệp vụ hiện trường</h2><p className="muted">Transport ở đây là mô phỏng. App thật gọi RPC giao dịch mới; kết quả staging được nghiệm thu riêng.</p><label>Nghiệp vụ<select aria-label="Nghiệp vụ mới" value={kind} disabled={busy} onChange={event=>{setKind(event.target.value);setConfirmed(false);}}>{[['REPAIR_EDIT','Sửa phiếu'],['MAINTENANCE','Checklist bảo trì'],['INSTALL','Cấp phát'],['TRANSFER','Điều chuyển'],['WITHDRAW','Thu hồi']].map(([value,title])=><option value={value} key={value}>{title}</option>)}</select></label><p>Hồ sơ: <strong>{entityId}</strong> · Bản gốc: {machineKind?'Thời điểm hồ sơ được mở':expected}</p><label>Nội dung / vật tư<textarea aria-label="Nội dung nghiệp vụ mới" value={notes} onChange={event=>setNotes(event.target.value)} disabled={busy}/></label>{['INSTALL','TRANSFER','WITHDRAW'].includes(kind)&&<label className="check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Đã đối chiếu đúng máy và NPP khi có mạng</label>}<div className="actions"><button disabled={busy||!notes.trim()} onClick={submit}>Lưu vào hàng chờ</button><button disabled={busy} onClick={sync}>Gửi / thử lại cùng mã</button><button disabled={busy||mode!=="online"} onClick={async()=>{const state=await getCacheStrict("lab-server",{versions:{}});setExpected(state.versions[entityId]??1);setConfirmed(false);setMessage("Đã đọc bản server mới. Đối chiếu bản gốc đã giữ trước khi soạn và gửi lại.");}}>Đọc bản server mới</button><button disabled={busy} onClick={async()=>{const state=await getCacheStrict('lab-server',{versions:{},receipts:{},auditCount:0});state.versions['SYN-REPAIR-001']=(state.versions['SYN-REPAIR-001']??1)+1;await setCache('lab-server',state);setMessage('Đồng nghiệp đã sửa phiếu. Bản gốc của bạn được giữ khi có xung đột.');}}>Đồng nghiệp sửa phiếu</button></div><p role="status">{message}</p><div className="stats"><span>Hàng chờ <b>{summary.total}</b></span><span>Cần duyệt <b>{summary.counts.needs_review}</b></span><span>Chờ thử lại <b>{summary.counts.retry_wait}</b></span></div>{queue.map(item=><article className="stage" key={item.id}><strong>{item.payload.kind}</strong><div><p>{item.status} · {item.attempts} lần gửi</p><small>{item.lastError||'Chưa có xác nhận server'}</small></div></article>)}<FieldReviewPanel/><p className="muted">Không có nút xóa lịch sử. Bản cần duyệt không tự gửi lại và không được ghi đè lên bản mới của đồng nghiệp.</p></section>;
}
