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

  const [dashboardPage, setDashboardPage] = React.useState(1);
  const [dashboardPageSize, setDashboardPageSize] = React.useState(10);

  // Sắp xếp bộ máy mới lắp đặt gần nhất lên đầu
  const sortedAllocatedSets = React.useMemo(() => {
    return [...systemSets].sort((a, b) => {
      const dateA = a.installedDate || a.installed_date || a.createdAt || a.created_at || '';
      const dateB = b.installedDate || b.installed_date || b.createdAt || b.created_at || '';
      if (dateA && dateB) {
        const comp = dateB.localeCompare(dateA);
        if (comp !== 0) return comp;
      }
      return String(b.setCode || b.id || '').localeCompare(String(a.setCode || a.id || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [systemSets]);

  const totalAllocatedPages = Math.ceil(sortedAllocatedSets.length / dashboardPageSize) || 1;
  const paginatedAllocatedSets = sortedAllocatedSets.slice(
    (dashboardPage - 1) * dashboardPageSize,
    dashboardPage * dashboardPageSize
  );

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Danh Mục Bộ Máy Cấp Phát (10 Bộ Mới Lắp Gần Nhất)</span>
              <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>Tổng {sortedAllocatedSets.length} bộ</span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Tự động sắp xếp theo ngày lắp đặt mới nhất • Hiển thị 10 dòng/trang
            </span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onOpenNewInstallation}>
            + Cấp Phát Lắp Đặt Mới
          </button>
        </div>

        {/* Desktop View Table */}
        <div className="desktop-only data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã Bộ Máy</th>
                <th>Tên Nhà Phân Phối</th>
                <th>Khu Vực</th>
                <th>Máy Chiết</th>
                <th>Máy Lắc</th>
                <th>Máy Tính & Cấu Hình</th>
                <th>Máy In</th>
                <th>Ổn Áp (NPP)</th>
                <th>Bảo Trì Tiếp Theo</th>
                <th>Trạng Thái</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAllocatedSets.map((set) => {
                const pcObj = computers?.find(c => 
                  (set.computerId && c.id === set.computerId) || 
                  (set.setCode && c.setCode === set.setCode) ||
                  (set.pcSerial && c.serial && c.serial !== '—' && c.serial === set.pcSerial)
                );
                const pcSpecs = pcObj?.specs || set.pcSpecs || 'Core i5 / 16GB RAM / 512GB SSD';
                const pcType = set.pcType || pcObj?.type || 'AIO';
                const pcOs = set.pcOs || pcObj?.os || 'Windows 11 Pro';
                const isPcReplaced = pcObj?.status === 'Đã đổi trả máy mới' || 
                                     pcObj?.status === 'Đổi trả mới' || 
                                     set.computerStatus === 'Đã đổi trả máy mới' || 
                                     set.pcStatus === 'Đã đổi trả máy mới' || 
                                     set.isPcReplaced;
                const isPcNew = pcObj?.status === 'Mới 100%' || set.computerStatus === 'Mới 100%';

                return (
                  <tr key={set.id || set.setCode}>
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
                      <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>{pcType} ({pcOs})</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: '600', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <HardDrive size={13} />
                        <span>{pcSpecs}</span>
                      </div>
                      {isPcReplaced && (
                        <span 
                          className="badge badge-purple" 
                          style={{ 
                            fontSize: '0.68rem', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            marginTop: '4px',
                            background: 'rgba(168,85,247,0.18)',
                            color: '#c084fc',
                            border: '1px solid rgba(168,85,247,0.4)',
                            fontWeight: '700'
                          }}
                          title="Máy tính đã được đổi trả máy mới cho NPP"
                        >
                          🔄 Đã đổi trả máy mới
                        </span>
                      )}
                      {!isPcReplaced && isPcNew && (
                        <span 
                          className="badge badge-success" 
                          style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}
                        >
                          ✨ Máy mới 100%
                        </span>
                      )}
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
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards */}
        <div className="mobile-only mobile-card-list">
          {paginatedAllocatedSets.map((set) => {
            const pcObj = computers?.find(c => 
              (set.computerId && c.id === set.computerId) || 
              (set.setCode && c.setCode === set.setCode) ||
              (set.pcSerial && c.serial && c.serial !== '—' && c.serial === set.pcSerial)
            );
            const pcSpecs = pcObj?.specs || set.pcSpecs || 'Core i5 / 16GB RAM / 512GB SSD';
            const pcType = set.pcType || pcObj?.type || 'AIO';
            const pcOs = set.pcOs || pcObj?.os || 'Windows 11 Pro';
            const isPcReplaced = pcObj?.status === 'Đã đổi trả máy mới' || 
                                 pcObj?.status === 'Đổi trả mới' || 
                                 set.computerStatus === 'Đã đổi trả máy mới' || 
                                 set.pcStatus === 'Đã đổi trả máy mới' || 
                                 set.isPcReplaced;

            return (
              <div className="mobile-card" key={set.id || set.setCode}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title" style={{ color: 'var(--accent-cyan)' }}>{set.setCode}</span>
                    <div className="mobile-card-subtitle">{set.nppName || 'Kho Tổng'} ({set.region})</div>
                  </div>
                  <div>
                    {set.status === 'DA_LAP_DAT' && <span className="badge badge-success">🟢 Đã Lắp</span>}
                    {set.status === 'TRONG_KHO' && <span className="badge badge-info">🔵 Kho</span>}
                    {set.status === 'DA_THU_HOI' && <span className="badge badge-danger">🔴 Thu Hồi</span>}
                    {set.status === 'BAO_THUONG_BAO_TRI' && <span className="badge badge-warning">🟡 Bảo Trì</span>}
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Máy Chiết:</span>
                    <span className="mobile-card-value">{set.dispenserModel} ({set.dispenserSerial})</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Máy Lắc:</span>
                    <span className="mobile-card-value">{set.mixerModel} ({set.mixerSerial})</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Máy Tính:</span>
                    <span className="mobile-card-value">
                      <div>{pcType} ({pcOs})</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: '600' }}>💻 {pcSpecs}</div>
                      {isPcReplaced && (
                        <span className="badge badge-purple" style={{ fontSize: '0.65rem', display: 'inline-block', marginTop: '2px' }}>
                          🔄 Đã đổi trả máy mới
                        </span>
                      )}
                    </span>
                  </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Máy In:</span>
                  <span className="mobile-card-value">{set.printerModel} ({set.printerSerial})</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Ổn Áp:</span>
                  <span className="mobile-card-value">
                    {set.stabilizer?.includes('Chưa') || set.stabilizer?.includes('Không') ? (
                      <span className="badge badge-danger" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>⚠️ {set.stabilizer}</span>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>✓ {set.stabilizer}</span>
                    )}
                  </span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Hạn Bảo Trì:</span>
                  <span className="mobile-card-value" style={{ fontWeight: '700' }}>{set.nextMaintenanceDue || 'Chưa có'}</span>
                </div>
              </div>
            </div>
          );
        })}
        </div>

        {/* Pagination Bar */}
        <div className="pagination-bar" style={{ marginTop: '16px' }}>
          <div className="pagination-info">
            Hiển thị <strong>{sortedAllocatedSets.length === 0 ? 0 : (dashboardPage - 1) * dashboardPageSize + 1}–{Math.min(dashboardPage * dashboardPageSize, sortedAllocatedSets.length)}</strong> trong tổng số <strong>{sortedAllocatedSets.length}</strong> bộ máy
            <select 
              className="form-select" 
              value={dashboardPageSize} 
              onChange={e => { setDashboardPageSize(Number(e.target.value)); setDashboardPage(1); }}
              style={{ marginLeft: '12px', padding: '2px 8px', fontSize: '0.8rem', width: 'auto', display: 'inline-block' }}
            >
              <option value={10}>10 bộ/trang</option>
              <option value={20}>20 bộ/trang</option>
              <option value={50}>50 bộ/trang</option>
            </select>
          </div>

          <div className="pagination-controls">
            <button 
              className="pagination-btn" 
              disabled={dashboardPage <= 1}
              onClick={() => setDashboardPage(prev => Math.max(prev - 1, 1))}
            >
              ‹ Trang Trước
            </button>
            
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--accent-cyan)', padding: '0 8px' }}>
              Trang {dashboardPage} / {totalAllocatedPages}
            </span>

            <button 
              className="pagination-btn" 
              disabled={dashboardPage >= totalAllocatedPages}
              onClick={() => setDashboardPage(prev => Math.min(prev + 1, totalAllocatedPages))}
            >
              Trang Sau ›
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
