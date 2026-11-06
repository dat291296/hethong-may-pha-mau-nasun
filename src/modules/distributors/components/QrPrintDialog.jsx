import React, { useMemo, useState } from 'react';
import { Printer, X, RefreshCw, CheckSquare, Square, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../shared/context/AuthContext.jsx';
import { hasPermission } from '../../../shared/security/rbac.js';
import { buildNppQrPayload } from '../lib/qrPayload.js';
import { countLabelSheets, fitLabelName, paginateLabels, splitIntoBatches, validatePrintableNpp } from '../lib/qrPrint.js';

const yieldToBrowser = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

function readPreferences() {
  try { return JSON.parse(localStorage.getItem('nasun-qr-print-settings') || '{}'); } catch { return {}; }
}

function Label({ item }) {
  const npp = item.npp;
  const name = fitLabelName(npp.name);
  return (
    <article className="nasun-qr-label" aria-label={`Tem QR ${npp.code}`}>
      <div className="nasun-label-logo"><img src="/nasun_logo.png" alt=""/><span>nasun</span><small>SƠN Việt tròn Việt</small></div>
      <strong className="nasun-label-title">QUÉT ĐỂ XEM THÔNG TIN NPP</strong>
      <div className="nasun-qr-frame"><span className="qr-corner top-left"/><span className="qr-corner top-right"/><span className="qr-corner bottom-left"/><span className="qr-corner bottom-right"/><div className="nasun-qr-code" dangerouslySetInnerHTML={{ __html: item.svg }} /></div>
      <strong className="nasun-label-name" style={{ fontSize: `${name.fontSize}pt` }}>{name.lines.map((line, index) => <React.Fragment key={index}>{index > 0 && <br/>}{line}</React.Fragment>)}</strong>
      <strong className="nasun-label-code">{npp.code}</strong>
      <small className="nasun-label-footer">Quét bằng camera điện thoại · {new URL(buildNppQrPayload(npp.qrToken)).host}</small>
    </article>
  );
}

export default function QrPrintDialog({ npps = [], systemSets = [], auditLogs = [], onClose, onAuditPrint }) {
  const { user } = useAuth();
  const allowed = hasPermission(user?.role, 'qr:print');
  const prefs = useMemo(readPreferences, []);
  const [query, setQuery] = useState('');
  const [province, setProvince] = useState('ALL');
  const [brand, setBrand] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [coverage, setCoverage] = useState('ALL');
  const [neverPrinted, setNeverPrinted] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [copies, setCopies] = useState(() => Math.max(1, Math.min(10, Number(prefs.copies) || 1)));
  const [paper, setPaper] = useState(() => prefs.paper === 'a4' ? 'a4' : 'a8');
  const [skip, setSkip] = useState(() => Math.max(0, Math.min(9, Number(prefs.skip) || 0)));
  const [generated, setGenerated] = useState([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const lastPrintedByNpp = useMemo(() => {
    const map = new Map();
    for (const entry of auditLogs || []) {
      if (!String(entry.type || '').includes('IN TEM QR')) continue;
      const ids = String(entry.notes || '').match(/NPP-(?:MB|MT|MN)-\d{3,}/g) || [];
      for (const id of ids) if (!map.has(id)) map.set(id, entry.timestamp);
    }
    return map;
  }, [auditLogs]);

  const filtered = useMemo(() => npps.filter(npp => {
    const machineSets = systemSets.filter(item => String(item.nppId || item.npp_id) === String(npp.id));
    const searchText = `${npp.name || ''} ${npp.code || ''} ${npp.province || ''}`.toLocaleLowerCase('vi');
    const printedAt = lastPrintedByNpp.get(npp.code || npp.id);
    return (!query || searchText.includes(query.toLocaleLowerCase('vi')))
      && (province === 'ALL' || npp.province === province)
      && (brand === 'ALL' || (npp.brand || 'Nasun') === brand)
      && (status === 'ALL' || npp.status === status)
      && (coverage === 'ALL' || (coverage === 'ASSIGNED' ? machineSets.length > 0 : machineSets.length === 0))
      && (!neverPrinted || !printedAt);
  }), [npps, systemSets, query, province, brand, status, coverage, neverPrinted, lastPrintedByNpp]);

  const invalid = useMemo(() => new Map(npps.map(npp => [npp.id, validatePrintableNpp(npp)])), [npps]);
  const selectedNpps = useMemo(() => npps.filter(item => selected.has(item.id)), [npps, selected]);
  const printable = selectedNpps.filter(item => !invalid.get(item.id));
  const blocked = selectedNpps.filter(item => invalid.get(item.id));
  const labelCount = printable.length * copies;
  const pages = paper === 'a8' ? [] : paginateLabels(generated, { columns: 2, rows: 5, skip });
  const sheets = paper === 'a8' ? labelCount : countLabelSheets(printable.length, copies, skip, 10);

  const remember = next => {
    try { localStorage.setItem('nasun-qr-print-settings', JSON.stringify(next)); } catch { /* Optional preference only. */ }
  };
  const selectAll = () => setSelected(current => new Set([...current, ...filtered.map(item => item.id)]));
  const toggle = id => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const prepareLabels = async () => {
    if (!allowed) { setMessage('Tài khoản không có quyền in tem QR.'); return; }
    if (!printable.length) { setMessage(blocked.length ? 'Các NPP đã chọn chưa đủ dữ liệu hợp lệ để in.' : 'Chọn ít nhất một NPP hợp lệ.'); return; }
    if (labelCount > 500) { setMessage('Mỗi lượt tối đa 500 tem. Giảm số NPP hoặc số bản.'); return; }
    setBusy(true); setMessage(''); setProgress(0); setGenerated([]);
    try {
      const { default: QRCode } = await import('qrcode');
      const work = printable.flatMap(npp => Array.from({ length: copies }, () => ({ npp, url: buildNppQrPayload(npp.qrToken) })));
      const output = [];
      const batches = splitIntoBatches(work);
      for (let index = 0; index < batches.length; index += 1) {
        const results = await Promise.all(batches[index].map(async item => ({ ...item, svg: await QRCode.toString(item.url, { type: 'svg', errorCorrectionLevel: 'Q', margin: 2, width: 256 }) })));
        output.push(...results);
        setProgress(Math.round(output.length / work.length * 100));
        await yieldToBrowser();
      }
      setGenerated(output);
      remember({ copies, paper, skip });
      setMessage(`${output.length} tem sẵn sàng. Khi in, chọn kích thước thực tế 100%.`);
    } catch (error) {
      console.error('[QrPrint] QR generation failed:', error?.message || error);
      setMessage('Không tạo được mã QR. Dữ liệu NPP vẫn nguyên vẹn; thử lại sau.');
    } finally { setBusy(false); }
  };

  const printLabels = async () => {
    if (!allowed || !generated.length || generated.length > 500) return;
    try {
      await onAuditPrint?.({ npps: printable.map(item => item.code || item.id), count: generated.length, paper });
      window.setTimeout(() => window.print(), 100);
    } catch (error) {
      console.error('[QrPrint] Audit write failed:', error?.code || error?.name);
      setMessage('Chưa ghi được nhật ký in tem nên đã dừng thao tác in.');
    }
  };

  if (!allowed) return <div role="alert" className="modal-overlay"><section className="modal-content"><p>Tài khoản không có quyền in tem QR.</p><button className="btn btn-secondary" onClick={onClose}>Đóng</button></section></div>;

  return <div className="modal-overlay qr-print-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section className="modal-content qr-print-dialog" role="dialog" aria-modal="true" aria-labelledby="qr-print-title">
      <header className="qr-print-header no-print"><div><h2 id="qr-print-title">In tem QR NPP · A8</h2><p><ShieldCheck size={15}/> Quét trong app sau khi đăng nhập · mã QR không mở dữ liệu công khai</p></div><button className="btn btn-secondary" aria-label="Đóng" onClick={onClose}><X size={20}/></button></header>
      <div className="qr-print-controls no-print">
        <div className="qr-filter-grid">
          <input className="form-input" placeholder="Tìm tên hoặc mã NPP" value={query} onChange={event => setQuery(event.target.value)} />
          <select className="form-select" value={province} onChange={event => setProvince(event.target.value)}><option value="ALL">Tất cả tỉnh / thành</option>{[...new Set(npps.map(item => item.province).filter(Boolean))].sort().map(item => <option key={item}>{item}</option>)}</select>
          <select className="form-select" value={brand} onChange={event => setBrand(event.target.value)}><option value="ALL">Tất cả hãng</option><option>Nasun</option><option>Natos</option></select>
          <select className="form-select" value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">Mọi trạng thái</option><option>Đang hợp tác</option><option>Đã ngưng hợp tác</option></select>
          <select className="form-select" value={coverage} onChange={event => setCoverage(event.target.value)}><option value="ALL">Có và chưa ghép bộ</option><option value="ASSIGNED">Đã ghép bộ</option><option value="UNASSIGNED">Chưa ghép bộ</option></select>
          <label className="qr-check"><input type="checkbox" checked={neverPrinted} onChange={event => setNeverPrinted(event.target.checked)}/> Chưa từng in tem</label>
        </div>
        <div className="qr-selection-actions"><button className="btn btn-secondary" onClick={selectAll}>Chọn tất cả theo bộ lọc ({filtered.length})</button><button className="btn btn-secondary" onClick={() => setSelected(new Set())}>Bỏ chọn</button><strong>Đã chọn {selected.size} NPP · Hợp lệ {printable.length} · Bị chặn {blocked.length}</strong></div>
        <div className="qr-print-list" role="listbox" aria-label="Danh sách NPP in tem">
          {filtered.map(item => <label className="qr-print-row" key={item.id}><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} aria-label={`Chọn ${item.name}`}/>{selected.has(item.id) ? <CheckSquare size={16}/> : <Square size={16}/>}<span><strong>{item.code || item.id} · {item.name}</strong><small>{item.province || item.region} · {item.brand || 'Nasun'} · {invalid.get(item.id) || `In lần cuối: ${lastPrintedByNpp.get(item.code || item.id) || 'Chưa ghi nhận'}`}</small></span></label>)}
        </div>
        <div className="qr-print-options">
          <label>Khổ tem<select className="form-select" value={paper} onChange={event => { const value = event.target.value; setPaper(value); remember({ copies, paper: value, skip }); }}><option value="a8">A8 · 52 × 74 mm · mỗi NPP một tờ</option><option value="a4">A4 · 10 tem A8 xoay ngang · lưới 2 × 5</option></select></label>
          {paper === 'a4' && <label>Bỏ qua ô đầu<select className="form-select" value={skip} onChange={event => { const value = Number(event.target.value); setSkip(value); remember({ copies, paper, skip: value }); }}>{Array.from({ length: 10 }, (_, index) => <option key={index} value={index}>{index}</option>)}</select></label>}
          <label>Số bản mỗi NPP<input className="form-input" type="number" min="1" max="10" value={copies} onChange={event => { const value = Math.max(1, Math.min(10, Number(event.target.value) || 1)); setCopies(value); remember({ copies: value, paper, skip }); }}/></label>
          <strong>{labelCount} tem · {sheets} {paper === 'a8' ? 'tờ A8' : 'tờ A4'}</strong>
        </div>
        {busy && <div className="qr-progress" role="status">Đang tạo mã QR · {progress}%<progress max="100" value={progress}/></div>}
        {message && <p role="status" className="qr-print-message">{message}</p>}
        <div className="qr-print-footer"><button className="btn btn-secondary" onClick={prepareLabels} disabled={busy || !selected.size}><RefreshCw size={16}/> {busy ? 'Đang chuẩn bị…' : 'Tạo bản xem trước'}</button><button className="btn btn-primary" onClick={printLabels} disabled={!generated.length || busy}><Printer size={16}/> In / Lưu PDF</button><span>Chọn “Kích thước thực tế / 100%” trong hộp thoại in.</span></div>
      </div>
      {generated.length > 0 && <div className={`nasun-qr-preview ${paper === 'a4' ? 'is-a4' : 'is-a8'}`} aria-label="Xem trước tem QR">{paper === 'a8' ? generated.map((item, index) => <Label key={`${item.npp.id}-${index}`} item={item}/>) : pages.map((page, pageIndex) => <div className="nasun-a4-page" key={`page-${pageIndex}`}>{page.map((item, index) => item ? <div className="nasun-a4-slot" key={`${pageIndex}-${index}`}><Label item={item}/></div> : <div className="nasun-a4-slot empty" key={`empty-${pageIndex}-${index}`}/>)}</div>)}</div>}
      <style>{`
        .qr-print-overlay{z-index:9998;overflow:auto;align-items:flex-start;padding:16px}.qr-print-dialog{width:min(1200px,100%);max-width:1200px;max-height:calc(100dvh - 32px);overflow:auto;padding:20px;background:var(--bg-main)}.qr-print-header,.qr-selection-actions,.qr-print-options,.qr-print-footer{display:flex;align-items:center;gap:12px;justify-content:space-between}.qr-print-header h2{margin:0;font-size:1.1rem}.qr-print-header p{display:flex;align-items:center;gap:6px;color:var(--text-muted);margin:5px 0 0;font-size:.8rem}.qr-filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:16px}.qr-check,.qr-print-options label{display:flex;align-items:center;gap:8px;color:var(--text-main);font-size:.82rem}.qr-print-options label{flex-direction:column;align-items:stretch;flex:1}.qr-print-options .form-select,.qr-print-options .form-input{min-height:42px}.qr-selection-actions{flex-wrap:wrap;margin:12px 0;font-size:.82rem}.qr-print-list{max-height:190px;overflow:auto;border:1px solid var(--border-color);border-radius:10px}.qr-print-row{display:flex;align-items:center;gap:9px;min-height:48px;padding:6px 10px;border-bottom:1px solid var(--border-color);cursor:pointer}.qr-print-row:last-child{border:0}.qr-print-row span{display:flex;flex-direction:column;min-width:0}.qr-print-row strong,.qr-print-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.qr-print-row small{font-size:.72rem;color:var(--text-muted)}.qr-print-options{margin-top:12px;flex-wrap:wrap}.qr-progress{display:flex;gap:12px;align-items:center;margin:12px 0}.qr-progress progress{flex:1}.qr-print-message{color:var(--accent-cyan)}.qr-print-footer{justify-content:flex-start;flex-wrap:wrap;margin:14px 0}.qr-print-footer span{font-size:.78rem;color:var(--text-muted)}.nasun-qr-preview{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;justify-content:center;padding:16px;background:#e2e8f0;border-radius:12px}.nasun-qr-label{width:52mm;height:74mm;box-sizing:border-box;padding:2mm 2.2mm;overflow:hidden;background:#fff;color:#0f172a;display:flex;align-items:center;flex-direction:column;position:relative;font-family:Arial,sans-serif;gap:1.1mm;break-after:page;page-break-after:always}.nasun-label-logo{width:100%;height:11mm;flex:none;background:#e8232a;border-radius:1.5mm;display:flex;align-items:center;position:relative;overflow:hidden;color:#fff;padding:0 4mm;box-sizing:border-box}.nasun-label-logo img{height:7mm;width:7mm;object-fit:contain}.nasun-label-logo span{font:bold 21pt Georgia,serif;line-height:1}.nasun-label-logo small{position:absolute;right:1.5mm;top:1mm;background:#ffeb00;color:#003a8c;font:bold 4pt Arial;padding:.5mm}.nasun-label-title{font-size:6pt;line-height:1.1;text-align:center;margin-top:.4mm;white-space:nowrap}.nasun-qr-frame{width:31mm;height:31mm;box-sizing:border-box;display:grid;place-items:center;border:1px solid #cbd5e1;border-radius:1.5mm;position:relative;flex:none}.nasun-qr-code svg{width:26mm;height:26mm;display:block}.qr-corner{position:absolute;width:5mm;height:5mm;border-color:#e8232a;border-style:solid}.top-left{top:-1px;left:-1px;border-width:1.2px 0 0 1.2px}.top-right{top:-1px;right:-1px;border-width:1.2px 1.2px 0 0}.bottom-left{bottom:-1px;left:-1px;border-width:0 0 1.2px 1.2px}.bottom-right{bottom:-1px;right:-1px;border-width:0 1.2px 1.2px 0}.nasun-label-name{text-align:center;line-height:1.06;max-width:100%;max-height:7mm;overflow:hidden}.nasun-label-code{height:6mm;min-height:6mm;width:44mm;background:#0f172a;color:#fff;border-radius:1.4mm;display:grid;place-items:center;font:bold 9pt 'Courier New',monospace;white-space:nowrap}.nasun-label-footer{font-size:4.3pt;color:#64748b;white-space:nowrap;margin-top:auto}.nasun-qr-preview.is-a4{display:block;width:auto;margin:auto}.nasun-a4-page{display:grid;grid-template-columns:repeat(2,74mm);grid-template-rows:repeat(5,52mm);gap:0;width:max-content;margin:0 auto;break-after:page;page-break-after:always}.nasun-a4-page:last-child{break-after:auto;page-break-after:auto}.nasun-a4-slot{width:74mm;height:52mm;display:grid;place-items:center;overflow:hidden}.nasun-a4-slot .nasun-qr-label{width:52mm;height:74mm;padding-block:1mm;transform:rotate(90deg)}.nasun-a4-slot.empty{background:transparent}.qr-print-dialog:has(.nasun-qr-preview){max-height:calc(100dvh - 32px)}@media(max-width:700px){.qr-print-overlay{padding:6px}.qr-print-dialog{padding:12px;max-height:calc(100dvh - 12px)}.qr-selection-actions{align-items:flex-start;flex-direction:column}.qr-print-footer>*{width:100%}}
        @media print{ @page{size:${paper === 'a8' ? '52mm 74mm' : 'A4'};margin:${paper === 'a8' ? '0' : '4mm'}} body *{visibility:hidden!important}.nasun-qr-preview,.nasun-qr-preview *{visibility:visible!important}.qr-print-overlay{position:static!important;display:block!important;padding:0!important;background:#fff!important}.qr-print-dialog{position:static!important;overflow:visible!important;width:auto!important;max-height:none!important;padding:0!important;background:#fff!important}.qr-print-header,.qr-print-controls{display:none!important}.nasun-qr-preview{display:${paper === 'a8' ? 'block' : 'block'}!important;gap:0!important;padding:0!important;margin:0!important;background:#fff!important;border-radius:0!important}.nasun-qr-label{box-shadow:none!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.nasun-qr-label{break-after:page;page-break-after:always}.nasun-qr-preview.is-a8 .nasun-qr-label:last-child{break-after:auto;page-break-after:auto}.nasun-qr-preview.is-a4 .nasun-qr-label{break-after:auto!important;page-break-after:auto!important}.nasun-a4-page{grid-template-columns:repeat(2,74mm)!important;grid-template-rows:repeat(5,52mm)!important;break-after:page;page-break-after:always}.nasun-a4-page:last-child{break-after:auto!important;page-break-after:auto!important}.nasun-a4-slot{width:74mm!important;height:52mm!important}.nasun-a4-slot.empty{visibility:hidden!important}.nasun-a4-slot .nasun-qr-label{break-after:auto!important;page-break-after:auto!important}}
      `}</style>
    </section>
  </div>;
}
