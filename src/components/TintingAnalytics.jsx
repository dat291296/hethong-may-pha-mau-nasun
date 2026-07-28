import React, { useState } from 'react';
import { BarChart3, Flame, AlertTriangle, CheckCircle2, Search, TrendingUp, Award, Droplet } from 'lucide-react';

export default function TintingAnalytics({ tintingLogs, npps }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [nppFilter, setNppFilter] = useState('ALL');

  const filteredLogs = tintingLogs.filter(log => {
    const matchesSearch = log.colorCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.nppName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.dispenserSerial.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesNpp = nppFilter === 'ALL' || log.nppId === nppFilter;
    return matchesSearch && matchesNpp;
  });

  // Calculate stats
  const totalLiters = tintingLogs.reduce((sum, log) => sum + (log.totalVolumeLiters || 0), 0);
  const totalPigment = tintingLogs.reduce((sum, log) => sum + (log.pigmentUsedMl || 0), 0);

  // Top NPPs Leaderboard
  const nppVolumeMap = tintingLogs.reduce((acc, curr) => {
    acc[curr.nppName] = (acc[curr.nppName] || 0) + curr.totalVolumeLiters;
    return acc;
  }, {});

  const leaderboard = Object.keys(nppVolumeMap).map(nppName => ({
    nppName,
    volume: nppVolumeMap[nppName]
  })).sort((a, b) => b.volume - a.volume);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Overview Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        
        <div className="glass-panel" style={{ padding: '18px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Tổng Sơn Đã Pha</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--accent-cyan)', marginTop: '4px' }}>
            {totalLiters} <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>Lít</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', marginTop: '4px' }}>▲ Năng suất pha màu tăng trưởng</div>
        </div>

        <div className="glass-panel" style={{ padding: '18px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Tổng Tinh Màu Chiết</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--accent-purple)', marginTop: '4px' }}>
            {totalPigment.toFixed(1)} <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>ml</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Đồng bộ tự động từ máy chiết</div>
        </div>

        <div className="glass-panel" style={{ padding: '18px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>NPP Hoạt Động Top 1</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#fbbf24', marginTop: '4px' }}>
            🏆 {leaderboard[0]?.nppName || 'N/A'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Sản lượng: {leaderboard[0]?.volume || 0} Lít sơn</div>
        </div>

      </div>

      {/* Inactivity Clogging Warning Banner */}
      <div style={{
        padding: '14px 20px',
        background: 'rgba(244, 63, 94, 0.1)',
        border: '1px solid var(--accent-rose)',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <AlertTriangle size={20} color="#fb7185" />
        <div style={{ fontSize: '0.825rem', color: '#fb7185' }}>
          <strong>CẢNH BÁO NGHẸT ĐẦU PHUN:</strong> Máy chiết tại <strong>Công Ty TNHH Vật Liệu Hải Phòng</strong> không có giao dịch pha màu nào trong hơn 15 ngày. Khuyên nhắc NPP súc rửa ống tinh màu định kỳ!
        </div>
      </div>

      {/* Main Tinting Log Table */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '800' }}>Nhật Ký Giao Dịch Pha Màu Thực Tế Tại Các NPP</h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Tìm mã màu, Seri máy..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '32px', height: '34px', fontSize: '0.8rem', width: '100%' }}
              />
            </div>
          </div>
        </div>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã Lượt Pha</th>
                <th>Thời Gian</th>
                <th>Nhà Phân Phối</th>
                <th>Máy Chiết (Seri)</th>
                <th>Mã Màu (Color Code)</th>
                <th>Dòng Sơn & Gốc Base</th>
                <th>Quy Cách</th>
                <th>Tổng Lít</th>
                <th>Tinh Màu (ml)</th>
                <th>Trạng Thái</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600', color: 'var(--accent-cyan)' }}>{log.id}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.timestamp}</td>
                  <td style={{ fontWeight: '600' }}>{log.nppName}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{log.dispenserSerial}</td>
                  <td style={{ fontWeight: '700', color: '#fbbf24' }}>{log.colorCode}</td>
                  <td>
                    <div>{log.productLine}</div>
                    <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>{log.base}</span>
                  </td>
                  <td>{log.containerSize} x {log.quantity}</td>
                  <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{log.totalVolumeLiters} L</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{log.pigmentUsedMl} ml</td>
                  <td>
                    {log.status === 'HOÀN THÀNH' ? (
                      <span className="badge badge-success">✓ Thành Công</span>
                    ) : (
                      <span className="badge badge-danger">✕ Hủy Bỏ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
