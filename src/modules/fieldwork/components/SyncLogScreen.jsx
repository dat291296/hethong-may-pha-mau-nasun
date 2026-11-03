import React, { useCallback, useEffect, useState } from 'react';
import { getSyncHistory } from '../../../shared/sync/offlineSync.js';
import { RefreshCw } from 'lucide-react';
import VirtualList from '../../../shared/components/VirtualList.jsx';

const RESULT_LABELS = { success: 'Thành công', failure: 'Thất bại' };

export default function SyncLogScreen({ onBack }) {
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setHistory(await getSyncHistory()); setError(''); }
    catch { setError('Không đọc được lịch sử trên thiết bị. Dữ liệu hàng chờ vẫn được giữ nguyên.'); }
  }, []);
  useEffect(() => { void refresh(); window.addEventListener('offline-queue-updated', refresh); return () => window.removeEventListener('offline-queue-updated', refresh); }, [refresh]);

  return (
    <section className="sync-log-screen">
      <header className="sync-log-header"><div><p className="eyebrow">CÀI ĐẶT · ĐỒNG BỘ</p><h1>Lịch sử đồng bộ</h1><p>Sự kiện được lưu mã hóa trên thiết bị này.</p></div><div className="sync-log-actions">{onBack && <button type="button" className="btn btn-secondary" onClick={onBack}>Quay lại</button>}<button type="button" className="btn btn-secondary" onClick={refresh} aria-label="Tải lại lịch sử"><RefreshCw size={17} />Tải lại</button></div></header>
      {error && <p className="resource-error" role="alert">{error}</p>}
      {!history.length && !error && <div className="sync-log-empty">Chưa có lượt đồng bộ nào được ghi nhận trên thiết bị này.</div>}
      <VirtualList className="sync-log-list" items={history} itemKey={(entry, index) => `${entry.at}-${index}`} height={560} itemSize={76} renderItem={(entry, index) => <article key={`${entry.at}-${index}`} className={entry.result === 'failure' ? 'sync-log-row is-error' : 'sync-log-row is-success'}><span className="sync-log-indicator" aria-hidden="true" /><div><strong>{entry.action || 'Thao tác đồng bộ'} · {RESULT_LABELS[entry.result] || 'Đã xử lý'}</strong><time dateTime={new Date(entry.at).toISOString()}>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(entry.at)}</time>{entry.errorCode && <code>{entry.errorCode}</code>}</div></article>} />
    </section>
  );
}
