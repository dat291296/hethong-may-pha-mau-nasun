import { buildSystemHealth } from '../lib/systemHealth.js';
import './dashboardReport.css';
import { repairStringList } from '../../repairs/lib/repairList.js';
import { useState } from 'react';
import { exportExcel } from '../../../shared/utils/excelExport.js';
import { downloadReportPdf } from '../../../shared/utils/reportPdf.js';

const columns = [
  { key: 'ticketCode', label: 'Mã phiếu' },
  { key: 'date', label: 'Ngày tiếp nhận' },
  { key: 'nppName', label: 'Nhà phân phối' },
  { key: 'productCategory', label: 'Thiết bị' },
  { key: 'machineModel', label: 'Model' },
  { key: 'actionDirection', label: 'Xử lý' },
  { key: 'replacementCondition', label: 'Mới / cũ' },
];

export default function DashboardReport({ machines, npps, devices, events, fetchTicketDetails, tickets, region, today, fleet, stock, regionalCounts, models }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [excelBusy, setExcelBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(['tickets', 'fleet', 'stock', 'activity', 'equipment', 'regions', 'models', 'health']);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [paperSize, setPaperSize] = useState('A4');
  if (!open) return <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)}>Báo cáo Dashboard</button>;

  const valid = Boolean(from && to && from <= to);
  const rows = valid ? tickets.filter(ticket => {
    const day = String(ticket.date ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= from && day <= to;
  }) : [];
  const counts = new Map();
  for (const row of rows) {
    const label = row.actionDirection === 'Xuất đổi'
      ? 'Đổi · ' + (row.replacementCondition || 'Chưa rõ')
      : row.actionDirection || 'Sửa chữa';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const activity = [...counts].map(([label, count]) => ({ label, count }));
  const categories = new Map();
  for (const row of rows) {
    const label = row.productCategory || 'Chưa phân loại';
    categories.set(label, (categories.get(label) ?? 0) + 1);
  }
  const equipment = [...categories].map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
  const formatDate = date => date.split('-').reverse().join('/');
  const scope = !region || region === 'ALL' ? 'Toàn quốc' : region;

  async function saveExcel() {
    setExcelBusy(true);
    setError('');
    try {
      await exportExcel(rows, columns, 'NASUN_' + from + '_' + to, 'Phiếu trong kỳ');
    } catch {
      setError('Không xuất được Excel. Hãy thử lại.');
    } finally {
      setExcelBusy(false);
    }
  }

  const metrics = [
    ['tickets', 'Phiếu trong kỳ', rows.length],
    ['fleet', 'Bộ máy hiện tại', fleet],
    ['stock', 'Bộ trong kho hiện tại', stock],
  ];
  const health = valid && selected.includes('health')
    ? buildSystemHealth({ machines, npps, devices, events, tickets, from, to })
    : null;
  const distributorNames = new Map(npps.map(npp => [npp.id, npp.name]));
  const installed = machines.filter(machine => machine.nppId && machine.status === 'DA_LAP_DAT');
  const allocations = installed.map(machine => [machine.setCode,
    distributorNames.get(machine.nppId) || machine.nppName || machine.nppId,
    machine.dispenserModel || '—', machine.region || '—']);
  const repairs = rows.map(ticket => [ticket.ticketCode || '—', formatDate(String(ticket.date).slice(0, 10)),
    ticket.nppName || '—', ticket.productCategory || '—', ticket.actionDirection || 'Sửa chữa',
    ticket.processingStatus || '—']);
  const tables = [
    ['allocated', 'Danh mục bộ máy đã cấp phát', ['Mã bộ', 'Nhà phân phối', 'Model máy chiết', 'Khu vực'], allocations],
    ['repairs', 'Theo dõi xử lý sửa chữa', ['Mã phiếu', 'Ngày nhận', 'Nhà phân phối', 'Thiết bị', 'Xử lý', 'Trạng thái'], repairs],
  ];
  const groups = [
    ['Tổng quan', [...metrics, ['regions', 'Bộ máy theo khu vực'], ['models', 'Model máy chiết']]],
    ['Sức khỏe máy pha màu', [['health', 'Tỷ lệ lỗi theo thiết bị']]],
    ['Bộ máy đã cấp phát', [tables[0]]],
    ['Theo dõi sửa chữa', [['activity', 'Xử lý trong kỳ'], ['equipment', 'Phiếu theo loại thiết bị'], tables[1], ['photos', 'Ảnh từ phiếu trong kỳ']]],
  ];
  const charts = [
    ['activity', 'Xử lý trong kỳ', activity],
    ['equipment', 'Phiếu theo loại thiết bị', equipment],
    ['regions', 'Bộ máy theo khu vực hiện tại', regionalCounts.map(row => ({ label: row.name, count: row.count }))],
    ['models', 'Model máy chiết hiện tại', models.map(row => ({ label: row.name, count: row.value }))],
  ];
  async function savePdf() {
    setPdfBusy(true);
    setError('');
    try {
      const photos = [];
      if (selected.includes('photos')) {
        for (const row of rows) {
          const detail = await fetchTicketDetails(row.id);
          for (const src of repairStringList(detail.photos)) {
            photos.push({ src, label: [row.ticketCode, row.nppName].filter(Boolean).join(' · ') });
          }
        }
      }
      await downloadReportPdf(
        'Báo cáo Dashboard ' + from + ' đến ' + to,
        [scope, 'Ngày xuất ' + today],
        [['Phạm vi số liệu', 'Phiếu theo ngày tiếp nhận. Danh mục cấp phát và số bộ máy phản ánh hiện trạng lúc xuất.']],
        charts.filter(([id]) => selected.includes(id)).map(([, label, data]) => [label, data]),
        { paperSize, health, period: formatDate(from) + ' – ' + formatDate(to),
          metrics: metrics.filter(([id]) => selected.includes(id)).map(([, label, count]) => [label, count]),
          photos: selected.includes('photos') ? photos : null,
          tables: [
            ...tables.filter(([id]) => selected.includes(id)).map(([, label, headers, data]) => [label, headers, data]),
          ] }
      );
    } catch {
      setError('Không tạo được PDF. Hãy thử lại; nếu có chọn ảnh, kiểm tra kết nối hoặc bỏ chọn ảnh.');
    } finally {
      setPdfBusy(false);
    }
  }

  return <section className="glass-panel system-health-panel dashboard-report" aria-label="Báo cáo Dashboard">
    <header className="report-heading"><div><span className="report-eyebrow">NASUN / VẬN HÀNH KỸ THUẬT</span><h2>Báo cáo hệ thống máy pha màu</h2>
    <p>{scope} · Theo ngày tiếp nhận phiếu</p></div><span className="report-paper-badge">PDF · {paperSize}</span></header>
    <div className="health-filters report-filters">
      <label>Từ ngày<input className="form-input" type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>Đến ngày<input className="form-input" type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      <label>Khổ giấy PDF<select className="form-input" value={paperSize} disabled={pdfBusy} onChange={event => setPaperSize(event.target.value)}><option value="A4">A4 · 210 × 297 mm</option><option value="A3">A3 · 297 × 420 mm</option></select></label>
    </div>
    <p className="report-help">Chọn nội dung cần đưa vào báo cáo. PDF chỉ xuất các mục được đánh dấu; A3 hiển thị được nhiều dòng hơn trên mỗi trang.</p>
    {!valid && <p role="alert">Chọn khoảng ngày hợp lệ.</p>}
    <div className="report-options">
      {groups.map(([title, options]) => (
        <fieldset key={title} disabled={pdfBusy}>
          <legend>{title}</legend>
          {options.map(([id, label]) => (
            <label key={id}>
              <input type="checkbox" checked={selected.includes(id)} onChange={event => {
                const checked = event.target.checked;
                setSelected(previous => checked ? [...previous, id] : previous.filter(item => item !== id));
              }} /> {label}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
    {valid && <>
      <div className="report-metrics">{metrics.filter(([id]) => selected.includes(id)).map(([id, label, count]) => <div key={id} className="report-metric"><span>{label}</span><strong>{Number(count).toLocaleString('vi-VN')}</strong></div>)}</div>
      {charts.filter(([id]) => selected.includes(id)).map(([id, label, data]) => <section key={id} className="report-chart">
        <h3>{label}</h3>
        {data.length ? data.map(row => <div key={row.label} className="report-chart-row"><span>{row.label}</span><strong>{row.count}</strong>
          <meter aria-label={row.label} min={0} max={Math.max(1, ...data.map(item => item.count))} value={row.count} />
        </div>) : <p>Không có dữ liệu.</p>}
      </section>)}
      {health && <section className="report-chart"><h3>Sức khỏe thiết bị đang vận hành</h3><p>{health.faultyTotal}/{health.operatingTotal} thiết bị có lỗi trong kỳ</p>{health.operatingStats.map(row => <div key={row.id} className="report-chart-row"><span>{row.name} · {row.faulty}/{row.operating}</span><strong>{row.rate == null ? 'Chưa đủ dữ liệu' : row.rate.toFixed(1) + '%'}</strong><meter aria-label={'Tỷ lệ lỗi ' + row.name} min={0} max={100} value={row.rate ?? 0} /></div>)}<p className="report-help">Mẫu số là thiết bị hiện đang hoạt động, đủ dữ liệu liên kết; không phải toàn bộ lịch sử vận hành.</p></section>}
      {tables.filter(([id]) => selected.includes(id)).map(([id, label, headers, data]) => (
        <details key={id} className="report-table">
          <summary>{label} · {data.length}</summary>
          <div><table><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead>
            <tbody>{data.slice(0, 10).map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>{value}</td>)}</tr>)}</tbody>
          </table></div>
          {data.length > 10 && <p>Xem trước 10 dòng. PDF xuất toàn bộ.</p>}
        </details>
      ))}
      {selected.includes('photos') && <p>Ảnh đính kèm sẽ được lấy từ chi tiết phiếu khi xuất PDF.</p>}
    </>}
    <div className="workspace-actions">
      <button className="btn btn-primary" disabled={!valid || !selected.length || pdfBusy} onClick={savePdf}>{pdfBusy ? 'Đang tạo PDF…' : 'Tải PDF'}</button>
      <button className="btn btn-secondary" disabled={!valid || excelBusy} onClick={saveExcel}>{excelBusy ? 'Đang xuất…' : 'Tải Excel'}</button>
      <button className="btn btn-secondary" onClick={() => setOpen(false)}>Đóng</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
