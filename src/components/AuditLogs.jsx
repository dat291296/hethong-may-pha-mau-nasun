import React, { useState, useEffect } from 'react';
import { FileText, Filter, Search, Calendar, UserCheck, Download, ShieldAlert } from 'lucide-react';
import { useDebounce } from '../security/useDebounce.js';
import { sanitizeForSheet } from '../security/sanitize.js';
import { formatDateVN } from '../utils/dateUtils.js';
import { downloadSpreadsheet } from '../utils/secureSpreadsheet.js';

export default function AuditLogs({ globalSearch = '', auditLogs }) {
  const [filterType, setFilterType]     = useState('ALL');
  const [rawSearch, setRawSearch]       = useState('');
  useEffect(() => { setRawSearch(globalSearch); }, [globalSearch]);
  const [severityFilter, setSeverityFilter] = useState('ALL');

  // ── Debounce search input 180ms (DoS protection) ────────────────────────────
  const searchTerm = useDebounce(rawSearch, 180);

  const filteredLogs = auditLogs.filter(log => {
    const matchesType     = filterType === 'ALL' || log.type === filterType;
    const matchesSeverity = severityFilter === 'ALL' || (log.severity || 'INFO') === severityFilter;
    const q = searchTerm.toLowerCase();
    const matchesSearch   =
      (log.nppName   || '').toLowerCase().includes(q) ||
      (log.setCode   || '').toLowerCase().includes(q) ||
      (log.technician|| '').toLowerCase().includes(q) ||
      (log.reason    || '').toLowerCase().includes(q) ||
      (log.id        || '').toLowerCase().includes(q);
    return matchesType && matchesSeverity && matchesSearch;
  }).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  // ── Severity config ───────────────────────────────────────────────────────
  const getSeverityBadge = (log) => {
    const s = log.severity || (log.type?.startsWith('SECURITY') ? 'CRITICAL' : 'INFO');
    const cfg = {
      CRITICAL: { bg: 'rgba(244,63,94,0.12)', color: '#fb7185', border: 'rgba(244,63,94,0.3)', label: '🚨 CRITICAL' },
      WARNING:  { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.3)', label: '⚠️ WARNING'  },
      INFO:     { bg: 'rgba(16,185,129,0.08)', color: '#34d399', border: 'rgba(16,185,129,0.2)', label: '✓ INFO'      },
    };
    const c = cfg[s] || cfg.INFO;
    return (
      <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '2px 7px', borderRadius: '10px',
        background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
        {c.label}
      </span>
    );
  };

  // ── Export to Excel (with Formula Injection protection) ────────────────────
  const handleExport = async () => {
    const rows = filteredLogs.map(log => ({
      'Mã GD':           sanitizeForSheet(log.id),
      'Thời Gian':       sanitizeForSheet(log.timestamp),
      'Mức Độ':          sanitizeForSheet(log.severity || 'INFO'),
      'Loại Tác Nghiệp': sanitizeForSheet(log.type),
      'Nhà Phân Phối':   sanitizeForSheet(log.nppName),
      'Mã Bộ Máy':       sanitizeForSheet(log.setCode),
      'Lý Do':           sanitizeForSheet(log.reason),
      'Kỹ Thuật Viên':   sanitizeForSheet(log.technician),
      'Ghi Chú':         sanitizeForSheet(log.notes),
    }));

    const headers = Object.keys(rows[0] || {
      'Mã GD': '', 'Thời Gian': '', 'Mức Độ': '', 'Loại Tác Nghiệp': '',
      'Nhà Phân Phối': '', 'Mã Bộ Máy': '', 'Lý Do': '', 'Kỹ Thuật Viên': '', 'Ghi Chú': '',
    });
    const body = rows.map(row => headers.map(header => row[header] ?? ''));
    await downloadSpreadsheet(
      [headers, ...body],
      `NhatKy_TacNghiep_${new Date().toISOString().slice(0, 10)}.xlsx`,
      'NhatKyTacNghiep',
      headers.map(() => 28),
    );
  };

  const typeOptions = [
    { value: 'ALL',                label: 'Tất Cả Loại Tác Nghiệp' },
    { value: 'LẮP ĐẶT MỚI',       label: 'Lắp Đặt Mới' },
    { value: 'THU HỒI',           label: 'Thu Hồi' },
    { value: 'ĐIỀU CHUYỂN NPP',   label: 'Điều Chuyển NPP' },
    { value: 'BẢO TRÌ / SỬA CHỮA', label: 'Bảo Trì / Sửa Chữa' },
    { value: 'IMPORT EXCEL – NPP', label: 'Import Excel – NPP' },
    { value: 'IMPORT EXCEL – MÁY CHIẾT', label: 'Import Excel – Máy Chiết' },
    { value: 'IMPORT EXCEL – MÁY LẮC',   label: 'Import Excel – Máy Lắc' },
    { value: 'IMPORT EXCEL – MÁY TÍNH',  label: 'Import Excel – Máy Tính' },
    { value: 'IMPORT EXCEL – MÁY IN',    label: 'Import Excel – Máy In' },
  ];

  return (
    <div className="workspace-screen" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <div className="glass-panel" style={{ padding: '20px' }}>

        {/* Header Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '800' }}>Nhật Ký Tác Nghiệp Hệ Thống & Lịch Sử Giao Dịch</h3>
            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>{filteredLogs.length} bản ghi</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Search (debounced) */}
            <div style={{ position: 'relative', width: '240px' }}>
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Tìm NPP, mã bộ, kỹ thuật viên..."
                value={rawSearch}
                onChange={e => setRawSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '32px', height: '34px', fontSize: '0.8rem', width: '100%' }}
              />
            </div>

            {/* Type Filter */}
            <select className="form-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ height: '34px', fontSize: '0.8rem' }}>
              {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Severity Filter */}
            <select className="form-select" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={{ height: '34px', fontSize: '0.8rem' }}>
              <option value="ALL">Tất Cả Mức Độ</option>
              <option value="INFO">✓ INFO</option>
              <option value="WARNING">⚠️ WARNING</option>
              <option value="CRITICAL">🚨 CRITICAL</option>
            </select>

            {/* Export Button */}
            <button className="btn btn-secondary btn-sm" onClick={handleExport} style={{ height: '34px', borderColor: 'rgba(16,185,129,0.4)', color: 'var(--accent-emerald)' }}>
              <Download size={14} />
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>

        {/* Desktop View Table */}
        <div className="desktop-only data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã GD</th>
                <th>Thời Gian</th>
                <th>Mức Độ</th>
                <th>Loại Tác Nghiệp</th>
                <th>Nhà Phân Phối</th>
                <th>Mã Bộ Máy</th>
                <th>Lý Do Tác Nghiệp</th>
                <th>Kỹ Thuật Viên</th>
                <th>Ghi Chú</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    Không tìm thấy bản ghi nào phù hợp.
                  </td>
                </tr>
              ) : filteredLogs.map(log => {
                const isCritical = (log.severity || 'INFO') === 'CRITICAL';
                return (
                  <tr key={log.id} style={{ background: isCritical ? 'rgba(244,63,94,0.04)' : undefined }}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600', color: 'var(--accent-cyan)' }}>{log.id}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDateVN(log.timestamp, true)}</td>
                    <td>{getSeverityBadge(log)}</td>
                    <td>
                      {log.type === 'LẮP ĐẶT MỚI'        && <span className="badge badge-success">Lắp Đặt Mới</span>}
                      {log.type === 'THU HỒI'             && <span className="badge badge-danger">Thu Hồi</span>}
                      {log.type === 'ĐIỀU CHUYỂN NPP'     && <span className="badge badge-info">Điều Chuyển</span>}
                      {log.type === 'BẢO TRÌ / SỬA CHỮA' && <span className="badge badge-warning">Bảo Trì</span>}
                      {log.type?.startsWith('IMPORT EXCEL') && <span className="badge" style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>📥 Excel</span>}
                      {log.type?.startsWith('SECURITY')    && <span className="badge badge-danger">🚨 Security</span>}
                      {!['LẮP ĐẶT MỚI','THU HỒI','ĐIỀU CHUYỂN NPP','BẢO TRÌ / SỬA CHỮA'].includes(log.type) &&
                       !log.type?.startsWith('IMPORT EXCEL') && !log.type?.startsWith('SECURITY') && (
                        <span className="badge">{log.type}</span>
                       )}
                    </td>
                    <td style={{ fontWeight: '600' }}>{log.nppName}</td>
                    <td style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{log.setCode}</td>
                    <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.reason}</td>
                    <td style={{ fontWeight: '600' }}>{log.technician}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.notes}</td>
                    <td>
                      <span className="resource-muted">Chỉ đọc</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards */}
        <div className="mobile-only mobile-card-list">
          {filteredLogs.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Không tìm thấy bản ghi nào phù hợp.
            </div>
          ) : (
            filteredLogs.map(log => {
              const isCritical = (log.severity || 'INFO') === 'CRITICAL';
              return (
                <div className="mobile-card" key={log.id} style={{ borderLeft: isCritical ? '4px solid var(--accent-rose)' : '4px solid var(--border-color)' }}>
                  <div className="mobile-card-header">
                    <div>
                      <span className="mobile-card-title" style={{ color: 'var(--accent-cyan)' }}>{log.id}</span>
                      <div className="mobile-card-subtitle">{formatDateVN(log.timestamp, true)}</div>
                    </div>
                    <div>
                      {getSeverityBadge(log)}
                    </div>
                  </div>
                  <div className="mobile-card-body">
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Loại:</span>
                      <span className="mobile-card-value">
                        {log.type === 'LẮP ĐẶT MỚI'        && <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Lắp Đặt Mới</span>}
                        {log.type === 'THU HỒI'             && <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>Thu Hồi</span>}
                        {log.type === 'ĐIỀU CHUYỂN NPP'     && <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Điều Chuyển</span>}
                        {log.type === 'BẢO TRÌ / SỬA CHỮA' && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Bảo Trì</span>}
                        {log.type?.startsWith('IMPORT EXCEL') && <span className="badge" style={{ fontSize: '0.65rem', background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>📥 Excel</span>}
                        {log.type?.startsWith('SECURITY')    && <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>🚨 Security</span>}
                        {!['LẮP ĐẶT MỚI','THU HỒI','ĐIỀU CHUYỂN NPP','BẢO TRÌ / SỬA CHỮA'].includes(log.type) &&
                         !log.type?.startsWith('IMPORT EXCEL') && !log.type?.startsWith('SECURITY') && (
                          <span className="badge" style={{ fontSize: '0.65rem' }}>{log.type}</span>
                         )}
                      </span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">NPP:</span>
                      <span className="mobile-card-value">{log.nppName}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Bộ Máy:</span>
                      <span className="mobile-card-value" style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{log.setCode}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Lý do:</span>
                      <span className="mobile-card-value">{log.reason}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Kỹ thuật viên:</span>
                      <span className="mobile-card-value">{log.technician}</span>
                    </div>
                    <div className="mobile-card-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                      <span className="mobile-card-label">Ghi chú:</span>
                      <span className="mobile-card-value" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'left' }}>{log.notes}</span>
                    </div>
                  </div>

                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
}
