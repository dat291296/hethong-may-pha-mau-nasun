import React from 'react';
import { 
  Building2, 
  Cpu, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  ArrowUpRight, 
  RefreshCw, 
  CalendarClock, 
  Flame,
  Monitor,
  Printer,
  HardDrive
} from 'lucide-react';
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
  Pie 
} from 'recharts';

export default function Dashboard({ 
  systemSets, 
  npps, 
  dispensers, 
  mixers, 
  computers, 
  printers,
  maintenanceAlerts, 
  unstabilizedAlerts,
  setActiveTab,
  onOpenNewInstallation
}) {
  // Stat calculations
  const totalSetsCount = systemSets.length;
  const installedSetsCount = systemSets.filter(s => s.status === 'DA_LAP_DAT').length;
  const stockSetsCount = systemSets.filter(s => s.status === 'TRONG_KHO').length;
  const revokedSetsCount = systemSets.filter(s => s.status === 'DA_THU_HOI').length;
  const maintenanceSetsCount = systemSets.filter(s => s.status === 'BAO_THUONG_BAO_TRI').length;

  // Region data for chart
  const regionChartData = [
    { name: 'Miền Bắc', count: systemSets.filter(s => s.region === 'Miền Bắc').length },
    { name: 'Miền Trung', count: systemSets.filter(s => s.region === 'Miền Trung').length },
    { name: 'Miền Nam', count: systemSets.filter(s => s.region === 'Miền Nam').length },
    { name: 'Trong Kho', count: systemSets.filter(s => s.region === 'Kho Tổng').length },
  ];

  // Dispenser Model distribution chart data
  const modelCounts = systemSets.reduce((acc, curr) => {
    const model = curr.dispenserModel || 'Khác';
    acc[model] = (acc[model] || 0) + 1;
    return acc;
  }, {});

  const modelChartData = Object.keys(modelCounts).map(key => ({
    name: key,
    value: modelCounts[key]
  }));

  const COLORS = ['#38bdf8', '#06b6d4', '#10b981', '#f59e0b', '#a855f7'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Warning Banners */}
      {maintenanceAlerts.length > 0 && (
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(90deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%)',
          border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>
              <CalendarClock size={24} />
            </div>
            <div>
              <div style={{ fontWeight: '800', color: '#fbbf24', fontSize: '0.95rem' }}>
                CẢNH BÁO: BẢO TRÌ ĐỊNH KỲ 1 NĂM ({maintenanceAlerts.length} Bộ Máy Cần Bảo Trì Trong 30 Ngày)
              </div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-main)', marginTop: '2px' }}>
                Quy định bảo trì 1 năm/lần. Hệ thống phát thông báo trước 1 tháng đến ngày kiểm tra.
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('maintenance')}>
            Xem Lịch Bảo Trì Chi Tiết
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
        
        {/* Total Sets */}
        <div className="glass-panel glass-panel-hover" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Tổng Bộ Máy Pha Màu</span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-blue)' }}>
              <Cpu size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1.1 }}>
            {totalSetsCount} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Bộ</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', fontSize: '0.75rem', flexWrap: 'wrap' }}>
            <span className="badge badge-success">● {installedSetsCount} Đã Lắp</span>
            <span className="badge badge-info">● {stockSetsCount} Trong Kho</span>
          </div>
        </div>

        {/* Active Distributors */}
        <div className="glass-panel glass-panel-hover" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Nhà Phân Phối (NPP)</span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' }}>
              <Building2 size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1.1 }}>
            {npps.length} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Đại lý</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
            <span className="badge badge-success">● {npps.filter(n => n.status === 'Đang hợp tác').length} Đang hợp tác</span>
            <span className="badge badge-neutral">● {npps.filter(n => n.status === 'Đã ngưng hợp tác').length} Ngưng</span>
          </div>
        </div>

        {/* Dispenser & Mixer Inventory */}
        <div className="glass-panel glass-panel-hover" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Thiết Bị Chiết & Lắc</span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', color: 'var(--accent-purple)' }}>
              <Flame size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1.1 }}>
            {dispensers.length + mixers.length} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Thiết bị</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
            <span className="badge badge-purple">{dispensers.length} Máy Chiết</span>
            <span className="badge badge-info">{mixers.length} Máy Lắc</span>
          </div>
        </div>

        {/* Stabilizer Warnings (NPP self-bought) */}
        <div className="glass-panel glass-panel-hover" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Cảnh Báo Ổn Áp</span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.15)', color: 'var(--accent-rose)' }}>
              <ShieldAlert size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1.1 }}>
            {unstabilizedAlerts.length} <span style={{ fontSize: '0.9rem', color: 'var(--accent-rose)', fontWeight: 'normal' }}>Chưa trang bị</span>
          </div>
          <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            *Ổn áp do NPP tự mua trang bị
          </div>
        </div>

      </div>

      {/* Charts Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        
        {/* Region Distribution Chart */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '16px', color: 'var(--text-main)' }}>
            Phân Bố Bộ Máy Pha Màu Theo Khu Vực
          </h3>
          <div style={{ width: '100%', height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Bar dataKey="count" fill="var(--accent-cyan)" radius={[6, 6, 0, 0]}>
                  {regionChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Machine System Model Distribution */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '16px', color: 'var(--text-main)' }}>
            Tỷ Lệ Các Hệ Máy Chiết (Satint A2, Hero, Corob F1...)
          </h3>
          <div style={{ width: '100%', height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={modelChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {modelChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Installed System Sets Table */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-main)' }}>
              Danh Sách Bộ Máy Đã Cấp Phát Cho Nhà Phân Phối
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Hiển thị chi tiết máy chiết, máy lắc, máy tính, máy in QL700 và tình trạng ổn áp
            </span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onOpenNewInstallation}>
            + Cấp Phát Lắp Đặt Mới
          </button>
        </div>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã Bộ Máy</th>
                <th>Tên Nhà Phân Phối</th>
                <th>Khu Vực</th>
                <th>Máy Chiết</th>
                <th>Máy Lắc</th>
                <th>Máy Tính (OS)</th>
                <th>Máy In</th>
                <th>Ổn Áp (NPP)</th>
                <th>Bảo Trì Tiếp Theo</th>
                <th>Trạng Thái</th>
              </tr>
            </thead>
            <tbody>
              {systemSets.map((set) => (
                <tr key={set.id}>
                  <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{set.setCode}</td>
                  <td style={{ fontWeight: '600' }}>{set.nppName || 'Kho Tổng'}</td>
                  <td>{set.region}</td>
                  <td>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>{set.dispenserModel}</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.dispenserSerial}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>{set.mixerModel}</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.mixerSerial}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>{set.pcType} ({set.pcOs})</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.pcSerial}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>{set.printerModel}</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.printerSerial}</div>
                  </td>
                  <td>
                    {set.stabilizer?.includes('Chưa') || set.stabilizer?.includes('Không') ? (
                      <span className="badge badge-danger">⚠️ {set.stabilizer}</span>
                    ) : (
                      <span className="badge badge-success">✓ {set.stabilizer}</span>
                    )}
                  </td>
                  <td>
                    {set.nextMaintenanceDue ? (
                      <div style={{ fontSize: '0.825rem', fontWeight: '600' }}>{set.nextMaintenanceDue}</div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.775rem' }}>Chưa có</span>
                    )}
                  </td>
                  <td>
                    {set.status === 'DA_LAP_DAT' && <span className="badge badge-success">🟢 Đã Lắp Đặt</span>}
                    {set.status === 'TRONG_KHO' && <span className="badge badge-info">🔵 Trong Kho</span>}
                    {set.status === 'DA_THU_HOI' && <span className="badge badge-danger">🔴 Đã Thu Hồi</span>}
                    {set.status === 'BAO_THUONG_BAO_TRI' && <span className="badge badge-warning">🟡 Đang Bảo Trì</span>}
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
