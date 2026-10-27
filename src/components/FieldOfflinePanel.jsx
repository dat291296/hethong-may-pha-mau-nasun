import { useCallback, useEffect, useState } from 'react';
import { buildFieldPack, FIELD_PACK_KEY, readFieldPack } from '../lib/fieldOffline.js';
import { getCacheStrict, setCache, getOfflineOwner, getOwnedCacheEntries, getQueue } from '../lib/offlineDb.js';
import './FieldOfflinePanel.css';
import {sealDataSnapshot,verifyDataSnapshot} from '../lib/dataIntegrity.js';

export default function FieldOfflinePanel({ machines = [], npps = [], repairs = [], online = navigator.onLine }) {
  const [pack, setPack] = useState(null);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [clock, setClock] = useState(Date.now());
  const owner = getOfflineOwner();
  const refresh = useCallback(async () => {
    try {
      const currentOwner = getOfflineOwner();
      const [saved, entries] = await Promise.all([getCacheStrict(FIELD_PACK_KEY), getOwnedCacheEntries('form-draft:')]);
      const verified=saved ? await verifyDataSnapshot(saved) : true;
      if (currentOwner !== getOfflineOwner()) return;
      setPack(verified?saved:null); setDrafts(entries.filter(entry => entry.value?.value)); setClock(Date.now());
      if(!verified)setMessage('Gói cũ chưa có xác nhận toàn vẹn hoặc đã thay đổi. Kết nối lại và tải gói mới; bản cũ chưa bị xóa.');
    } catch { setMessage('Không đọc được dữ liệu trên thiết bị. Giữ nguyên dữ liệu và thử lại.'); }
  }, []);
  useEffect(() => { refresh(); const timer = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(timer); }, [refresh, owner]);
  const view = readFieldPack(pack, owner, query, clock);
  const candidates = machines.filter(row => `${row.setCode} ${row.nppName || ''}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))).slice(0, 50);
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      if (!online || !navigator.onLine) throw new Error('Cần có mạng để chuẩn bị gói hồ sơ.');
      if ((await getQueue()).length) throw new Error('Còn thay đổi chưa gửi. Hãy xử lý hàng chờ trước khi tải gói.');
      const currentOwner = getOfflineOwner();
      const next = await sealDataSnapshot(buildFieldPack({ owner: currentOwner, machines, npps, repairs, selected }));
      if (currentOwner !== getOfflineOwner() || !await setCache(FIELD_PACK_KEY, next)) throw new Error('Không lưu được gói hồ sơ. Kiểm tra dung lượng thiết bị.');
      setPack(next); setClock(Date.now()); setOpened(null); setMessage('Đã lưu gói trên thiết bị. Dữ liệu này là ảnh chụp danh sách hiện tại, cần đối chiếu khi có thay đổi.');
    } catch (error) { setMessage(error.message.startsWith('OFFLINE_') ? 'Tài khoản đã thay đổi. Hãy mở lại màn hình.' : error.message); }
    finally { setBusy(false); }
  };
  return <section className="field-offline" aria-label="Hồ sơ mang đi hiện trường">
    <header><div><h4>Hồ sơ mang đi hiện trường</h4><p>Tải trước tối đa 20 bộ máy · Gói đọc trong 8 giờ</p></div><span className={`field-pill ${online ? '' : 'field-warning'}`}>{online ? 'Có mạng' : 'Đang offline'}</span></header>
    <input aria-label="Tìm gói hồ sơ theo mã bộ máy hoặc NPP" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm mã bộ máy / tên NPP" />
    <details><summary>Chọn bộ máy để tải ({selected.length}/20)</summary><div className="field-list">{candidates.map(row => <label key={row.setCode}><input type="checkbox" checked={selected.includes(row.setCode)} disabled={busy || !online || (!selected.includes(row.setCode) && selected.length >= 20)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.setCode] : previous.filter(code => code !== row.setCode))} /><span><strong>{row.setCode}</strong><small>{row.nppName || 'Chưa có tên NPP'}</small></span></label>)}{!candidates.length && <p>Không có hồ sơ trong danh sách đang tải.</p>}</div><button className="btn btn-primary" type="button" disabled={busy || !online || !selected.length} onClick={save}>{busy ? 'Đang lưu gói…' : 'Tải gói đã chọn'}</button></details>
    {message && <p role="status">{message}</p>}
    {view.state === 'missing' && <p>Chưa tải gói. Có mạng và chọn bộ máy trước khi đi hiện trường.</p>}
    {view.state === 'expired' && <p role="status" className="field-warning">Gói đã hết hạn đọc. Kết nối lại để tải và đối chiếu; bản nháp chưa gửi vẫn được giữ.</p>}
    {view.state === 'ready' && <><p className="field-muted">Đã tải {new Date(view.savedAt).toLocaleString('vi-VN')} · Chưa bao gồm ảnh/tệp chưa tải riêng.</p><div className="field-list">{view.machines.map(row => <button type="button" key={row.setCode} onClick={() => setOpened(row)}><strong>{row.setCode}</strong><small>{row.nppName || 'Chưa có tên NPP'} · Xem hồ sơ đã tải →</small></button>)}{!view.machines.length && <p>Không tìm thấy trong gói đã tải. Không có nghĩa bộ máy không tồn tại.</p>}</div>
      {opened && view.machines.some(row => row.setCode === opened.setCode) && <article className="field-profile"><button type="button" className="btn btn-secondary" onClick={() => setOpened(null)}>← Quay lại gói hồ sơ</button><h4>{opened.setCode} · {opened.nppName}</h4><div className="field-slots">{[['dispenser','Máy chiết'],['mixer','Máy lắc'],['computer','Máy tính'],['printer','Máy in']].map(([key,label]) => <div key={key}><small>{label}</small><strong>{opened[`${key}Model`] || 'Chưa có model'}</strong><span>{opened[`${key}Serial`] || '⚠ Chưa có seri'}</span></div>)}</div><p>Bảo trì tiếp: {opened.nextMaintenanceDue || '⚠ Chưa điền'}</p><details><summary>Lịch sử sửa chữa đã tải</summary>{pack.repairs.filter(row => row.setCode === opened.setCode || row.nppId === opened.nppId).map(row => <p key={row.id}>{row.date} · {row.productCategory} · {row.issue || row.problemDescription || row.processingStatus || 'Chưa điền mô tả'}</p>)}<p className="field-muted">Chỉ gồm dữ liệu có trong gói, không phải toàn bộ lịch sử.</p></details></article>}</>}
    <footer><strong>{drafts.length} bản nháp biểu mẫu trên thiết bị</strong><p>Khôi phục tại phiếu sửa chữa hoặc checklist tương ứng. Nháp trên 30 ngày được giữ để đối chiếu, không tự xóa. Hàng chờ gửi và bản nháp là hai trạng thái khác nhau.</p><button type="button" className="btn btn-secondary" onClick={refresh}>Kiểm tra lại dữ liệu cục bộ</button></footer>
    <p className="field-muted">Không xóa dữ liệu trình duyệt khi còn nháp/hàng chờ. Gói tải trước không phải bản backup và không thay thế việc server kiểm tra quyền khi gửi.</p>
  </section>;
}
