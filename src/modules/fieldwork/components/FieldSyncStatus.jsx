import { getPerformanceSnapshot } from '../../../shared/diagnostics/performanceMetrics.js';
import {useCallback,useEffect,useState} from 'react';
import {getQueue,getOfflineOwner} from '../../../shared/sync/offlineDb.js';
import {fieldQueueSummary} from '../lib/fieldAttachments.js';
import {syncOfflineQueue} from '../../../shared/sync/offlineSync.js';
import {userErrorMessage} from '../../../shared/security/userError.js';
import './FieldSyncStatus.css';
import {flushBeforeAppUpdate} from '../../../shared/updates/appUpdateSafety.js';
import SyncStatusBadge from './SyncStatusBadge.jsx';
import NotificationPermissionPrompt from '../../../shared/components/NotificationPermissionPrompt.jsx';
import { triggerHaptic } from '../../../shared/platform/haptics.js';
import ConflictResolutionModal from './ConflictResolutionModal.jsx';
function DataLoadIndicator({ loading, error, online, pending, sending }) {
 const duration = getPerformanceSnapshot().DATA_LOAD?.value;
 const label = error ? '⚠ Lỗi sync · dữ liệu cần kiểm tra' : sending ? '⏳ Đang đồng bộ' : !online ? '● Offline · đang dùng cache' : loading ? 'Đang tải dữ liệu…' : pending ? `⏳ ${pending} thay đổi chờ sync` : '● Đã đồng bộ';
 const state = error ? 'error' : loading || sending ? 'loading' : !online || pending ? 'pending' : 'ready';
 return <div className={`data-load-indicator ${state}`} role="status" aria-live="polite" title={error || (duration === undefined ? label : `Lượt tải gần nhất: ${(duration / 1000).toFixed(1)} giây`)}><span aria-hidden="true" className="data-load-dot" />{label}</div>;
}
export default function FieldSyncStatus({ dataLoading = false, dataError = '', onOpenOfflinePage }){
 const [summary,setSummary]=useState(null),[online,setOnline]=useState(navigator.onLine),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[reviewItems,setReviewItems]=useState([]),[conflictItem,setConflictItem]=useState(null);
 const [updateReady,setUpdateReady]=useState(false);
 const refresh=useCallback(async()=>{const owner=getOfflineOwner();setOnline(navigator.onLine);try{const queue=await getQueue();if(owner===getOfflineOwner()){setSummary(fieldQueueSummary(queue));setReviewItems(queue.filter(item=>['needs_review','dead_letter'].includes(item.status)));}}catch{setNotice('Không đọc được hàng chờ. Không xóa dữ liệu trình duyệt.');}},[]);
 useEffect(()=>{
  refresh();const changed=()=>refresh();const message=event=>setNotice(typeof event.detail==='string'?event.detail.slice(0,200):'');
  for(const event of ['online','offline','focus','offline-queue-updated','nasun-sync-completed'])window.addEventListener(event,changed);
  window.addEventListener('nasun-field-notice',message);const timer=setInterval(changed,30000);
  const updated=()=>setUpdateReady(true);window.addEventListener('nasun-app-update-ready',updated);
  const backgroundSyncRequest = event => { if (event.data?.type === 'NASUN_BACKGROUND_SYNC_REQUEST' && navigator.onLine) void syncOfflineQueue(); };
  const registerBackgroundSync = () => navigator.serviceWorker?.ready.then(registration => registration.sync?.register('nasun-offline-sync')).catch(() => {});
  navigator.serviceWorker?.addEventListener('message', backgroundSyncRequest);
  window.addEventListener('offline-queue-updated', registerBackgroundSync);
  navigator.serviceWorker?.getRegistration().then(reg=>{if(reg?.waiting)setUpdateReady(true);}).catch(()=>{});
  return()=>{clearInterval(timer);for(const event of ['online','offline','focus','offline-queue-updated','nasun-sync-completed'])window.removeEventListener(event,changed);window.removeEventListener('offline-queue-updated',registerBackgroundSync);navigator.serviceWorker?.removeEventListener('message',backgroundSyncRequest);window.removeEventListener('nasun-field-notice',message);window.removeEventListener('nasun-app-update-ready',updated);};
 },[refresh]);
 const syncError = Boolean(dataError || summary?.requiresAttention || notice.includes('chưa') || notice.includes('lỗi'));
 const indicator = <DataLoadIndicator loading={dataLoading} error={dataError || (summary?.requiresAttention ? 'Có thao tác cần đối chiếu' : '')} online={online} pending={summary?.total} sending={busy} />;
 const showPanel = !online || summary?.total || notice || updateReady;
 return <>{indicator}{showPanel&&<aside className="field-sync-status" aria-label="Trạng thái dữ liệu trên thiết bị"><div><SyncStatusBadge online={online} pending={summary?.total||0} error={syncError} busy={busy} /><span>{summary?.counts.needs_review||0} cần duyệt · {summary?.counts.dead_letter||0} dừng thử lại{summary?.oldestMinutes?` · Cũ nhất ${summary.oldestMinutes} phút`:''}</span>{notice&&<p role="status">{notice}</p>}</div>{!online&&<button type="button" className="btn btn-secondary" onClick={onOpenOfflinePage}>Hồ sơ offline</button>}<button type="button" className="btn btn-secondary" disabled={!online||busy} onClick={async()=>{setBusy(true);try{const ok=await syncOfflineQueue();setNotice(ok?'Server đã xác nhận hàng chờ.':'Còn thay đổi chưa xác nhận. Dữ liệu vẫn được giữ.');if(ok)triggerHaptic('medium');else triggerHaptic('strong');}catch(error){triggerHaptic('strong');setNotice(userErrorMessage(error));}finally{setBusy(false);await refresh();}}}>{busy?'Đang gửi…':'Đồng bộ ngay'}</button>{reviewItems.length>0&&<div className="sync-review-list"><strong>{reviewItems.length} thao tác cần đối chiếu</strong>{reviewItems.slice(0,5).map(item=><button type="button" className="btn btn-secondary" key={item.id} onClick={()=>setConflictItem(item)}>{item.action} · {item.entityId||item.id} <span>Đối chiếu</span></button>)}</div>}{updateReady&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await flushBeforeAppUpdate();setNotice("Đã lưu các nháp đang mở. Đóng tất cả tab NASUN rồi mở lại để dùng bản mới; hàng chờ được giữ nguyên.");}catch{setNotice("Chưa lưu đủ bản nháp. Giữ app mở, kiểm tra dung lượng và thử lại; chưa cập nhật.");}finally{setBusy(false);}}}>Lưu nháp trước khi cập nhật</button>}</aside>}<NotificationPermissionPrompt />{conflictItem&&<ConflictResolutionModal item={conflictItem} onClose={()=>{setConflictItem(null);void refresh();}} />}</>;
}
