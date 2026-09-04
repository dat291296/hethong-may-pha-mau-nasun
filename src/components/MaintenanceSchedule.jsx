import React, { useState, useMemo } from 'react';
import { CalendarClock, CheckCircle2, AlertTriangle, ShieldAlert, Wrench, Search, Edit3, Trash2, BarChart2, PieChart as PieChartIcon } from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  PieChart, 
  Pie, 
  Legend 
} from 'recharts';
import { formatDateVN } from '../utils/dateUtils.js';

export default function MaintenanceSchedule({ systemSets, onCompleteMaintenance, onUpdateSystemSet, onDeleteSystemSet }) {
  const [filter, setFilter] = useState('ALL'); // ALL | DUE_SOON | OVERDUE | OK
  const [selectedSet, setSelectedSet] = useState(null);
  const [techNotes, setTechNotes] = useState('');
  const [maintDate, setMaintDate] = useState(new Date().toISOString().split('T')[0]);

  // Edit maintenance states
  const [editingMaint, setEditingMaint] = useState(null);
  const [editMaintFormData, setEditMaintFormData] = useState({});

  const handleOpenEditMaint = (set) => {
    setEditingMaint(set);
    setEditMaintFormData({
      lastMaintenanceDate: set.lastMaintenanceDate || '',
      nextMaintenanceDue: set.nextMaintenanceDue || ''
    });
  };

  const handleEditMaintSubmit = (e) => {
    e.preventDefault();
    if (!editingMaint) return;
    onUpdateSystemSet(editingMaint.setCode, editMaintFormData);
    setEditingMaint(null);
  };

  const handleDeleteMaint = (setCode) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa lịch bảo trì của bộ máy [${setCode}] không? Ngày bảo trì gần nhất và hạn tiếp theo sẽ được đặt về trống.`)) {
      onUpdateSystemSet(setCode, {
        lastMaintenanceDate: null,
        nextMaintenanceDue: null
      });
    }
  };

  const naturalSortCode = (a, b, key = 'setCode') => {
    const valA = String(a?.[key] || a?.setCode || a?.set_code || '');
    const valB = String(b?.[key] || b?.setCode || b?.set_code || '');
    return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
  };

  const today = new Date();

  const processedSets = useMemo(() => {
    return systemSets.map(set => {
      if (!set.nextMaintenanceDue) {
        return { ...set, dueDays: 999, statusType: 'NO_DATE' };
      }
      const dueDate = new Date(set.nextMaintenanceDue);
      const diffTime = dueDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let statusType = 'OK';
      if (diffDays < 0) {
        statusType = 'OVERDUE';
      } else if (diffDays <= 30) {
        statusType = 'DUE_SOON'; // Warning: within 1 month (30 days)
      }

      return { ...set, dueDays: diffDays, statusType };
    });
  }, [systemSets]);

  // Monthly stats for 12 months chart
  const monthlyStats = useMemo(() => {
    const months = [
      { name: 'Thg 1', count: 0, overdue: 0 },
      { name: 'Thg 2', count: 0, overdue: 0 },
      { name: 'Thg 3', count: 0, overdue: 0 },
      { name: 'Thg 4', count: 0, overdue: 0 },
      { name: 'Thg 5', count: 0, overdue: 0 },
      { name: 'Thg 6', count: 0, overdue: 0 },
      { name: 'Thg 7', count: 0, overdue: 0 },
      { name: 'Thg 8', count: 0, overdue: 0 },
      { name: 'Thg 9', count: 0, overdue: 0 },
      { name: 'Thg 10', count: 0, overdue: 0 },
      { name: 'Thg 11', count: 0, overdue: 0 },
      { name: 'Thg 12', count: 0, overdue: 0 },
    ];
    processedSets.forEach(s => {
      if (s.nextMaintenanceDue) {
        const d = new Date(s.nextMaintenanceDue);
        if (!isNaN(d.getTime())) {
          const m = d.getMonth();
          if (m >= 0 && m < 12) {
            months[m].count += 1;
            if (s.statusType === 'OVERDUE') months[m].overdue += 1;
          }
        }
      }
    });
    return months;
  }, [processedSets]);

  // Status breakdown data for donut chart
  const statusPieData = useMemo(() => {
    const okCount = processedSets.filter(s => s.statusType === 'OK').length;
    const soonCount = processedSets.filter(s => s.statusType === 'DUE_SOON').length;
    const overdueCount = processedSets.filter(s => s.statusType === 'OVERDUE').length;
    const noDateCount = processedSets.filter(s => s.statusType === 'NO_DATE').length;

    return [
      { name: 'Bình thường (OK)', value: okCount, color: '#10b981' },
      { name: 'Sắp hạn (≤30N)', value: soonCount, color: '#f59e0b' },
      { name: 'Quá hạn bảo trì', value: overdueCount, color: '#f43f5e' },
      { name: 'Chưa đặt lịch', value: noDateCount, color: '#64748b' }
    ].filter(d => d.value > 0);
  }, [processedSets]);

  const filteredSets = processedSets.filter(s => {
    if (filter === 'DUE_SOON') return s.statusType === 'DUE_SOON';
    if (filter === 'OVERDUE') return s.statusType === 'OVERDUE';
    if (filter === 'OK') return s.statusType === 'OK';
    return true;
  });

  // Sort strictly in natural ascending order from 1 to N, top to bottom
  const sortedSets = [...filteredSets].sort((a, b) => naturalSortCode(a, b, 'setCode'));

  const handleCompleteSubmit = (e) => {
    e.preventDefault();
    if (!selectedSet) return;

    // Calculate next 1 year date
    const nextDateObj = new Date(maintDate);
    nextDateObj.setFullYear(nextDateObj.getFullYear() + 1);
    const nextDueStr = nextDateObj.toISOString().split('T')[0];

    onCompleteMaintenance({
      setCode: selectedSet.setCode,
      lastMaintenanceDate: maintDate,
      nextMaintenanceDue: nextDueStr,
      notes: techNotes
    });

    setSelectedSet(null);
    setTechNotes('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Info Panel */}
      <div className="glass-panel" style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(30,41,59,1) 0%, rgba(15,23,42,1) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>
            <CalendarClock size={28} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)' }}>
              Quy Trình & Biểu Đồ Lịch Bảo Trì Định Kỳ (1 Năm / Lần)
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Quy định: Mỗi bộ máy pha màu được bảo dưỡng 1 lần mỗi năm. Hệ thống phát <strong>Cảnh Báo Thông Báo Trước 1 Tháng (30 Ngày)</strong> để kỹ thuật viên chuẩn bị xếp lịch đi thị trường.
            </p>
          </div>
        </div>
      </div>

      {/* CHARTS & KPI SECTION */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Chart 1: Monthly Maintenance Load */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-cyan)' }}>
              <BarChart2 size={16} /> Phân Bổ Hạn Bảo Trì 12 Tháng
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tổng: {processedSets.length} bộ máy</span>
          </div>
          <div style={{ height: '190px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ background: '#1e293b', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }}
                  labelStyle={{ color: 'var(--accent-cyan)', fontWeight: 'bold' }}
                />
                <Bar dataKey="count" name="Số bộ máy đến hạn" fill="var(--accent-blue)" radius={[4, 4, 0, 0]}>
                  {monthlyStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.overdue > 0 ? '#f43f5e' : 'var(--accent-blue)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Status Breakdown Pie */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-emerald)' }}>
              <PieChartIcon size={16} /> Tỷ Lệ Tình Trạng Bảo Trì
            </span>
          </div>
          <div style={{ height: '190px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={`pie-cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ background: '#1e293b', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={30} 
                  formatter={(val) => <span style={{ fontSize: '0.75rem', color: 'var(--text-main)' }}>{val}</span>} 
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="glass-panel" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            className={`btn ${filter === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setFilter('ALL')}
          >
            Tất Cả ({processedSets.length})
          </button>
          <button 
            className={`btn ${filter === 'DUE_SOON' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setFilter('DUE_SOON')}
            style={filter === 'DUE_SOON' ? { background: '#f59e0b', color: '#000' } : {}}
          >
            ⚠️ Cảnh Báo Sắp Hạn (30 Ngày) ({processedSets.filter(s => s.statusType === 'DUE_SOON').length})
          </button>
          <button 
            className={`btn ${filter === 'OVERDUE' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setFilter('OVERDUE')}
            style={filter === 'OVERDUE' ? { background: '#f43f5e', color: '#fff' } : {}}
          >
            🚨 Đã Quá Hạn ({processedSets.filter(s => s.statusType === 'OVERDUE').length})
          </button>
          <button 
            className={`btn ${filter === 'OK' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setFilter('OK')}
          >
            ✓ Bình Thường ({processedSets.filter(s => s.statusType === 'OK').length})
          </button>
        </div>
      </div>

      {/* Table of Maintenance Items */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        {/* Desktop View Table */}
        <div className="desktop-only data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã Bộ Máy</th>
                <th>Nhà Phân Phối</th>
                <th>Khu Vực</th>
                <th>Máy Chiết (Model/Seri)</th>
                <th>Lần Bảo Trì Gần Nhất</th>
                <th>Hạn Bảo Trì Tiếp Theo</th>
                <th>Trạng Thái Cảnh Báo</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {sortedSets.map(set => (
                <tr key={set.id}>
                  <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{set.setCode}</td>
                  <td style={{ fontWeight: '600' }}>{set.nppName}</td>
                  <td>{set.region}</td>
                  <td>
                    <div>{set.dispenserModel}</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.dispenserSerial}</div>
                  </td>
                  <td>{formatDateVN(set.lastMaintenanceDate)}</td>
                  <td style={{ fontWeight: '700' }}>{formatDateVN(set.nextMaintenanceDue)}</td>
                  <td>
                    {set.statusType === 'OVERDUE' && (
                      <span className="badge badge-danger">🚨 Quá Hạn ({Math.abs(set.dueDays)} Ngày)</span>
                    )}
                    {set.statusType === 'DUE_SOON' && (
                      <span className="badge badge-warning">⚠️ Còn {set.dueDays} Ngày (Báo Trước 1 Tháng)</span>
                    )}
                    {set.statusType === 'OK' && (
                      <span className="badge badge-success">✓ Còn {set.dueDays} Ngày</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setSelectedSet(set)}>
                        <Wrench size={14} />
                        <span>Xác Nhận Bảo Trì</span>
                      </button>
                      <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleOpenEditMaint(set)}>
                        <Edit3 size={14} color="var(--accent-cyan)" />
                      </button>
                      <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDeleteMaint(set.setCode)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards */}
        <div className="mobile-only mobile-card-list">
          {sortedSets.map(set => (
            <div className="mobile-card" key={set.id}>
              <div className="mobile-card-header">
                <div>
                  <span className="mobile-card-title" style={{ color: 'var(--accent-cyan)' }}>{set.setCode}</span>
                  <div className="mobile-card-subtitle">{set.nppName} ({set.region})</div>
                </div>
                <div>
                  {set.statusType === 'OVERDUE' && (
                    <span className="badge badge-danger">🚨 Quá Hạn ({Math.abs(set.dueDays)}N)</span>
                  )}
                  {set.statusType === 'DUE_SOON' && (
                    <span className="badge badge-warning">⚠️ Còn {set.dueDays}N</span>
                  )}
                  {set.statusType === 'OK' && (
                    <span className="badge badge-success">✓ Còn {set.dueDays}N</span>
                  )}
                </div>
              </div>
              <div className="mobile-card-body">
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Máy Chiết:</span>
                  <span className="mobile-card-value">{set.dispenserModel} ({set.dispenserSerial})</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Bảo Trì Gần Nhất:</span>
                  <span className="mobile-card-value">{formatDateVN(set.lastMaintenanceDate)}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Hạn Tiếp Theo:</span>
                  <span className="mobile-card-value" style={{ fontWeight: '700' }}>{formatDateVN(set.nextMaintenanceDue)}</span>
                </div>
              </div>
              <div className="mobile-card-actions">
                <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setSelectedSet(set)}>
                  <Wrench size={14} />
                  <span>Xác Nhận Bảo Trì</span>
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditMaint(set)}>
                  <Edit3 size={14} color="var(--accent-cyan)" />
                  <span>Sửa</span>
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteMaint(set.setCode)}>
                  <Trash2 size={14} />
                  <span>Xóa</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Maintenance Completion Modal */}
      {selectedSet && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontWeight: '800' }}>Xác Nhận Đã Bảo Trì Bộ Máy [{selectedSet.setCode}]</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedSet(null)}>✕</button>
            </div>
            <form onSubmit={handleCompleteSubmit}>
              <div className="modal-body">
                <div style={{ background: 'var(--bg-main)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px', fontSize: '0.85rem' }}>
                  <div><strong>Nhà Phân Phối:</strong> {selectedSet.nppName}</div>
                  <div><strong>Máy Chiết:</strong> {selectedSet.dispenserModel} ({selectedSet.dispenserSerial})</div>
                </div>

                <div className="form-group">
                  <label className="form-label">Ngày Thao Tác Bảo Trì *</label>
                  <input type="date" className="form-input" required value={maintDate} onChange={e => setMaintDate(e.target.value)} />
                </div>

                <div style={{ padding: '10px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid var(--accent-blue)', borderRadius: '6px', marginBottom: '16px', fontSize: '0.8rem' }}>
                  📅 Hạn bảo trì tiếp theo sẽ tự động đặt là <strong>1 năm sau</strong> ({new Date(new Date(maintDate).setFullYear(new Date(maintDate).getFullYear() + 1)).toISOString().split('T')[0]}).
                </div>

                <div className="form-group">
                  <label className="form-label">Ghi Chú Kỹ Thuật Bảo Trì</label>
                  <textarea className="form-textarea" rows={3} placeholder="Đã kiểm tra 16 ống màu, vệ sinh cụm pít-tông chiết, tra mỡ trục máy lắc..." value={techNotes} onChange={e => setTechNotes(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedSet(null)}>Hủy Bỏ</button>
                <button type="submit" className="btn btn-primary">Lưu Lịch Bảo Trì</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MAINTENANCE MODAL */}
      {editingMaint && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 style={{ fontWeight: '800' }}>Sửa Lịch Bảo Trì Bộ Máy [{editingMaint.setCode}]</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingMaint(null)}>✕</button>
            </div>
            <form onSubmit={handleEditMaintSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Ngày Bảo Trì Gần Nhất</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={editMaintFormData.lastMaintenanceDate || ''} 
                    onChange={e => setEditMaintFormData({ ...editMaintFormData, lastMaintenanceDate: e.target.value })} 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Hạn Bảo Trì Tiếp Theo</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={editMaintFormData.nextMaintenanceDue || ''} 
                    onChange={e => setEditMaintFormData({ ...editMaintFormData, nextMaintenanceDue: e.target.value })} 
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingMaint(null)}>Hủy Bỏ</button>
                <button type="submit" className="btn btn-primary">Lưu Lịch Bảo Trì</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
