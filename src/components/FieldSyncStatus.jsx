import { getPerformanceSnapshot } from '../lib/performanceMetrics.js';
import {useCallback,useEffect,useState} from 'react';
import {getQueue,getOfflineOwner} from '../lib/offlineDb.js';
import {fieldQueueSummary} from '../lib/fieldAttachments.js';
import {syncOfflineQueue} from '../lib/offlineSync.js';
import {userErrorMessage} from '../security/userError.js';
import './FieldSyncStatus.css';
import {flushBeforeAppUpdate} from '../lib/appUpdateSafety.js';
function DataLoadIndicator({ loading, error, online, pending, sending }) {
 const [duration, setDuration] = useState(() => getPerformanceSnapshot().DATA_LOAD?.value);
 useEffect(() => {
  const received = event => { if (event.detail?.name === 'DATA_LOAD') setDuration(event.detail.value); };
  window.addEventListener('nasun-performance-metric', received);
  return () => window.removeEventListener('nasun-performance-metric', received);
 }, []);
 const label = error ? 'Chưa tải đủ dữ liệu' : sending ? 'Đang gửi thay đổi…' : !online ? 'Đang dùng bản lưu offline' : loading ? 'Đang tải dữ liệu…' : pending ? `${pending} thay đổi chờ xác nhận` : 'Dữ liệu đã tải';
 const state = error ? 'error' : loading || sending ? 'loading' : !online || pending ? 'pending' : 'ready';
 return <div className={`data-load-indicator ${state}`} role="status" aria-live="polite" title={error || (duration === undefined ? label : `Lượt tải gần nhất: ${(duration / 1000).toFixed(1)} giây`)}><span aria-hidden="true" className="data-load-dot" />{label}</div>;
}
export default function FieldSyncStatus({ dataLoading = false, dataError = '' }){
 const [summary,setSummary]=useState(null),[online,setOnline]=useState(navigator.onLine),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [updateReady,setUpdateReady]=useState(false);
 const refresh=useCallback(async()=>{const owner=getOfflineOwner();setOnline(navigator.onLine);try{const queue=await getQueue();if(owner===getOfflineOwner())setSummary(fieldQueueSummary(queue));}catch{setNotice('Không đọc được hàng chờ. Không xóa dữ liệu trình duyệt.');}},[]);
 useEffect(()=>{
  refresh();const changed=()=>refresh();const message=event=>setNotice(typeof event.detail==='string'?event.detail.slice(0,200):'');
  for(const event of ['online','offline','focus','offline-queue-updated','nasun-sync-completed'])window.addEventListener(event,changed);
  window.addEventListener('nasun-field-notice',message);const timer=setInterval(changed,30000);
  const updated=()=>setUpdateReady(true);window.addEventListener('nasun-app-update-ready',updated);
  navigator.serviceWorker?.getRegistration().then(reg=>{if(reg?.waiting)setUpdateReady(true);}).catch(()=>{});
  return()=>{clearInterval(timer);for(const event of ['online','offline','focus','offline-queue-updated','nasun-sync-completed'])window.removeEventListener(event,changed);window.removeEventListener('nasun-field-notice',message);window.removeEventListener('nasun-app-update-ready',updated);};
 },[refresh]);
 const indicator = <DataLoadIndicator loading={dataLoading} error={dataError} online={online} pending={summary?.total} sending={busy} />;
 if(online&&!summary?.total&&!notice&&!updateReady)return indicator;
 return <>{indicator}<aside className="field-sync-status" aria-label="Trạng thái dữ liệu trên thiết bị"><div role="status"><strong>{online?'Có mạng':'Đang offline'} · {summary?.total??'…'} thay đổi chưa xác nhận</strong><span>{summary?.counts.needs_review||0} cần duyệt · {summary?.counts.dead_letter||0} dừng thử lại{summary?.oldestMinutes?` · Cũ nhất ${summary.oldestMinutes} phút`:''}</span>{notice&&<p>{notice}</p>}</div><button type="button" className="btn btn-secondary" disabled={!online||busy} onClick={async()=>{setBusy(true);try{const ok=await syncOfflineQueue();setNotice(ok?'Server đã xác nhận hàng chờ.':'Còn thay đổi chưa xác nhận. Mở Đồng bộ dữ liệu để kiểm tra; dữ liệu vẫn được giữ.');}catch(error){setNotice(userErrorMessage(error));}finally{setBusy(false);await refresh();}}}>{busy?'Đang gửi…':'Đồng bộ ngay'}</button>{updateReady&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await flushBeforeAppUpdate();setNotice("Đã lưu các nháp đang mở. Đóng tất cả tab NASUN rồi mở lại để dùng bản mới; hàng chờ được giữ nguyên.");}catch{setNotice("Chưa lưu đủ bản nháp. Giữ app mở, kiểm tra dung lượng và thử lại; chưa cập nhật.");}finally{setBusy(false);}}}>Lưu nháp trước khi cập nhật</button>}</aside></>;
}
