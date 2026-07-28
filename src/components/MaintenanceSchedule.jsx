import React, { useState } from 'react';
import { CalendarClock, CheckCircle2, AlertTriangle, ShieldAlert, Wrench, Search } from 'lucide-react';

export default function MaintenanceSchedule({ systemSets, onCompleteMaintenance }) {
  const [filter, setFilter] = useState('ALL'); // ALL | DUE_SOON | OVERDUE | OK
  const [selectedSet, setSelectedSet] = useState(null);
  const [techNotes, setTechNotes] = useState('');
  const [maintDate, setMaintDate] = useState(new Date().toISOString().split('T')[0]);

  const today = new Date('2026-07-26');

  const processedSets = systemSets.map(set => {
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

  const filteredSets = processedSets.filter(s => {
    if (filter === 'DUE_SOON') return s.statusType === 'DUE_SOON';
    if (filter === 'OVERDUE') return s.statusType === 'OVERDUE';
    if (filter === 'OK') return s.statusType === 'OK';
    return true;
  });

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
              Quy Trình Bảo Trì Định Kỳ (1 Năm / Lần)
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Quy định: Mỗi bộ máy pha màu được bảo dưỡng 1 lần mỗi năm. Hệ thống phát <strong>Cảnh Báo Thông Báo Trước 1 Tháng (30 Ngày)</strong> để kỹ thuật viên chuẩn bị xếp lịch đi thị trường.
            </p>
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
        <div className="data-table-container">
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
              {filteredSets.map(set => (
                <tr key={set.id}>
                  <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{set.setCode}</td>
                  <td style={{ fontWeight: '600' }}>{set.nppName}</td>
                  <td>{set.region}</td>
                  <td>
                    <div>{set.dispenserModel}</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.dispenserSerial}</div>
                  </td>
                  <td>{set.lastMaintenanceDate || 'Chưa thực hiện'}</td>
                  <td style={{ fontWeight: '700' }}>{set.nextMaintenanceDue || 'N/A'}</td>
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
                    <button className="btn btn-secondary btn-sm" onClick={() => setSelectedSet(set)}>
                      <Wrench size={14} />
                      <span>Xác Nhận Bảo Trì</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

    </div>
  );
}
