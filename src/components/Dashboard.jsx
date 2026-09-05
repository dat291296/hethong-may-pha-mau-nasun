import React, { useState, useMemo } from 'react';
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
  HardDrive,
  Wrench,
  Search,
  Eye,
  X,
  Clock,
  Layers,
  FileText,
  Filter,
  Check,
  RotateCcw,
  Sparkles
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
import SafePortal from './SafePortal.jsx';

export default function Dashboard({ 
  systemSets = [], 
  npps = [], 
  dispensers = [], 
  mixers = [], 
  computers = [], 
  printers = [],
  repairTickets = [],
  auditLogs = [],
  maintenanceAlerts = [], 
  unstabilizedAlerts = [],
  setActiveTab,
  onOpenNewInstallation
}) {
  // Stat calculations
  const totalSetsCount = systemSets.length;
  const installedSetsCount = systemSets.filter(s => s.status === 'DA_LAP_DAT').length;
  const stockSetsCount = systemSets.filter(s => s.status === 'TRONG_KHO').length;
  const revokedSetsCount = systemSets.filter(s => s.status === 'DA_THU_HOI').length;
  const maintenanceSetsCount = systemSets.filter(s => s.status === 'BAO_THUONG_BAO_TRI').length;

  // Repair & replacement statistics
  const totalRepairsCount = useMemo(() => 
    repairTickets.filter(t => t.actionDirection === 'Sửa chữa' || !t.actionDirection).length
  , [repairTickets]);

  const newExchangesCount = useMemo(() => 
    repairTickets.filter(t => t.actionDirection === 'Xuất đổi' && t.replacementCondition === 'Mới').length
  , [repairTickets]);

  const oldExchangesCount = useMemo(() => 
    repairTickets.filter(t => t.actionDirection === 'Xuất đổi' && t.replacementCondition === 'Cũ').length
  , [repairTickets]);

  const totalExchangesCount = newExchangesCount + oldExchangesCount;

  const uniqueNppsWithRepairs = useMemo(() => {
    const setOfNpps = new Set();
    repairTickets.forEach(t => {
      if (t.nppId) setOfNpps.add(t.nppId);
      else if (t.nppName) setOfNpps.add(t.nppName);
    });
    return setOfNpps.size;
  }, [repairTickets]);

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

  // Pagination for main allocation table
  const [dashboardPage, setDashboardPage] = useState(1);
  const [dashboardPageSize, setDashboardPageSize] = useState(10);

  // Modal state for NPP repair detail
  const [selectedNppHistory, setSelectedNppHistory] = useState(null);

  // Dedicated repair table filter states
  const [repairSearchTerm, setRepairSearchTerm] = useState('');
  const [repairCategoryFilter, setRepairCategoryFilter] = useState('ALL');
  const [repairActionFilter, setRepairActionFilter] = useState('ALL');
  const [repairPage, setRepairPage] = useState(1);
  const [repairPageSize, setRepairPageSize] = useState(10);

  // Sắp xếp bộ máy mới lắp đặt gần nhất lên đầu
  const sortedAllocatedSets = useMemo(() => {
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

  // Helper to match tickets for an NPP or Set
  const getTicketsForSetOrNpp = (setOrNpp) => {
    if (!setOrNpp) return [];
    const nppId = (setOrNpp.nppId || setOrNpp.id || '').trim().toLowerCase();
    const nppName = (setOrNpp.nppName || setOrNpp.name || '').trim().toLowerCase();
    const setCode = (setOrNpp.setCode || '').trim().toLowerCase();
    const dispenserSerial = (setOrNpp.dispenserSerial || '').trim().toLowerCase();
    const mixerSerial = (setOrNpp.mixerSerial || '').trim().toLowerCase();
    const pcSerial = (setOrNpp.pcSerial || '').trim().toLowerCase();
    const printerSerial = (setOrNpp.printerSerial || '').trim().toLowerCase();

    return repairTickets.filter(t => {
      const tNppId = (t.nppId || '').trim().toLowerCase();
      const tNppName = (t.nppName || '').trim().toLowerCase();
      const tSerial = (t.serialNumber || '').trim().toLowerCase();
      const tNotes = (t.notes || '').trim().toLowerCase();

      if (nppId && tNppId && tNppId === nppId) return true;
      if (nppName && tNppName && (tNppName.includes(nppName) || nppName.includes(tNppName))) return true;
      if (setCode && tNotes && tNotes.includes(setCode)) return true;
      if (dispenserSerial && dispenserSerial !== '—' && tSerial && tSerial === dispenserSerial) return true;
      if (mixerSerial && mixerSerial !== '—' && tSerial && tSerial === mixerSerial) return true;
      if (pcSerial && pcSerial !== '—' && tSerial && tSerial === pcSerial) return true;
      if (printerSerial && printerSerial !== '—' && tSerial && tSerial === printerSerial) return true;
      return false;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  };

  // Helper to compute statistics for tickets of an NPP
  const getNppTicketStats = (tickets = []) => {
    const total = tickets.length;
    const exchangeNew = tickets.filter(t => t.actionDirection === 'Xuất đổi' && t.replacementCondition === 'Mới').length;
    const exchangeOld = tickets.filter(t => t.actionDirection === 'Xuất đổi' && t.replacementCondition === 'Cũ').length;
    const totalExchanges = exchangeNew + exchangeOld;
    const repairs = tickets.filter(t => t.actionDirection === 'Sửa chữa' || !t.actionDirection).length;

    const dispenserTickets = tickets.filter(t => t.productCategory === 'Máy chiết');
    const mixerTickets = tickets.filter(t => t.productCategory === 'Máy lắc');
    const computerTickets = tickets.filter(t => 
      t.productCategory === 'Case' || 
      t.productCategory === 'AIO' || 
      t.productCategory === 'Máy tính' || 
      t.productCategory === 'Màn hình'
    );
    const printerTickets = tickets.filter(t => t.productCategory === 'Máy in' || t.productCategory === 'QL700');

    return {
      total,
      exchangeNew,
      exchangeOld,
      totalExchanges,
      repairs,
      dispenserTickets,
      mixerTickets,
      computerTickets,
      printerTickets
    };
  };

  // Filtered repair tickets for dedicated table
  const filteredRepairTickets = useMemo(() => {
    return repairTickets.filter(t => {
      // Text search
      const q = repairSearchTerm.toLowerCase();
      const matchSearch = !repairSearchTerm || 
        (t.ticketCode && t.ticketCode.toLowerCase().includes(q)) ||
        (t.nppName && t.nppName.toLowerCase().includes(q)) ||
        (t.nppId && t.nppId.toLowerCase().includes(q)) ||
        (t.productCategory && t.productCategory.toLowerCase().includes(q)) ||
        (t.machineModel && t.machineModel.toLowerCase().includes(q)) ||
        (t.serialNumber && t.serialNumber.toLowerCase().includes(q)) ||
        (t.errorCategory && t.errorCategory.toLowerCase().includes(q)) ||
        (t.errorDescription && t.errorDescription.toLowerCase().includes(q)) ||
        (t.notes && t.notes.toLowerCase().includes(q)) ||
        (t.technician && t.technician.toLowerCase().includes(q));

      // Category filter
      let matchCat = true;
      if (repairCategoryFilter !== 'ALL') {
        if (repairCategoryFilter === 'Máy tính') {
          matchCat = ['Case', 'AIO', 'Máy tính', 'Màn hình'].includes(t.productCategory);
        } else if (repairCategoryFilter === 'Máy in') {
          matchCat = ['Máy in', 'QL700'].includes(t.productCategory);
        } else {
          matchCat = t.productCategory === repairCategoryFilter;
        }
      }

      // Action filter
      let matchAction = true;
      if (repairActionFilter === 'NEW') {
        matchAction = t.actionDirection === 'Xuất đổi' && t.replacementCondition === 'Mới';
      } else if (repairActionFilter === 'OLD') {
        matchAction = t.actionDirection === 'Xuất đổi' && t.replacementCondition === 'Cũ';
      } else if (repairActionFilter === 'REPAIR') {
        matchAction = t.actionDirection === 'Sửa chữa';
      }

      return matchSearch && matchCat && matchAction;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [repairTickets, repairSearchTerm, repairCategoryFilter, repairActionFilter]);

  const totalRepairPages = Math.ceil(filteredRepairTickets.length / repairPageSize) || 1;
  const paginatedRepairTickets = filteredRepairTickets.slice(
    (repairPage - 1) * repairPageSize,
    repairPage * repairPageSize
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

      {/* Stat Cards Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
        
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
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', color: 'var(--accent-purple)' }}>
              <Building2 size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1.1 }}>
            {npps.length} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Đại lý</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
            <span className="badge badge-success">● {npps.filter(n => n.status === 'Đang hợp tác').length} Hợp tác</span>
            <span className="badge badge-neutral">● {npps.filter(n => n.status === 'Đã ngưng hợp tác').length} Ngưng</span>
          </div>
        </div>

        {/* Dispenser & Mixer Inventory */}
        <div className="glass-panel glass-panel-hover" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Thiết Bị Chiết & Lắc</span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' }}>
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

        {/* Repair & Parts Stat Card */}
        <div 
          className="glass-panel glass-panel-hover" 
          style={{ padding: '20px', cursor: 'pointer' }}
          onClick={() => {
            const el = document.getElementById('repair-tracking-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          title="Bấm để cuộn xuống bảng chi tiết sửa chữa & thay thế linh kiện"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontWeight: '700', textTransform: 'uppercase' }}>Sửa Chữa & Linh Kiện</span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-cyan)' }}>
              <Wrench size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1.1 }}>
            {totalRepairsCount} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Lượt sửa</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', fontSize: '0.75rem', flexWrap: 'wrap' }}>
            <span className="badge badge-info">● {uniqueNppsWithRepairs} NPP có sự cố</span>
            <span className="badge badge-neutral">Chiết • Lắc • Tính • In</span>
          </div>
        </div>

        {/* Machine Exchanges Stat Card */}
        <div 
          className="glass-panel glass-panel-hover" 
          style={{ padding: '20px', cursor: 'pointer' }}
          onClick={() => {
            const el = document.getElementById('repair-tracking-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          title="Bấm để cuộn xuống bảng chi tiết đổi trả máy"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-amber)', fontWeight: '700', textTransform: 'uppercase' }}>Đổi Trả Thiết Bị</span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)' }}>
              <RefreshCw size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1.1 }}>
            {totalExchangesCount} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Lượt đổi</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', fontSize: '0.75rem', flexWrap: 'wrap' }}>
            <span className="badge badge-success">✨ {newExchangesCount} Máy mới</span>
            <span className="badge badge-purple">🔁 {oldExchangesCount} Máy cũ</span>
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
              <span>Danh Mục Bộ Máy Cấp Phát & Lịch Sử Xử Lý Thiết Bị</span>
              <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>Tổng {sortedAllocatedSets.length} bộ</span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Tự động liên kết lịch sử sửa chữa, thay linh kiện & số lần đổi trả máy (Máy chiết, Máy lắc, Máy tính, Máy in)
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('repairs')}>
              <Wrench size={14} /> Xử Lý Sửa Chữa
            </button>
            <button className="btn btn-primary btn-sm" onClick={onOpenNewInstallation}>
              + Cấp Phát Lắp Đặt Mới
            </button>
          </div>
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
                <th style={{ minWidth: '220px' }}>Lịch Sử Sửa Chữa & Đổi Trả</th>
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

                // Find repair & exchange history for this specific set/NPP
                const nppTickets = getTicketsForSetOrNpp(set);
                const nppStats = getNppTicketStats(nppTickets);

                const hasPcExchangeTicket = nppStats.computerTickets.some(t => t.actionDirection === 'Xuất đổi' && t.replacementCondition === 'Mới');
                const hasPcExchangeOldTicket = nppStats.computerTickets.some(t => t.actionDirection === 'Xuất đổi' && t.replacementCondition === 'Cũ');

                const isPcReplaced = hasPcExchangeTicket ||
                                     pcObj?.status === 'Đã đổi trả máy mới' || 
                                     pcObj?.status === 'Đổi trả mới' || 
                                     set.computerStatus === 'Đã đổi trả máy mới' || 
                                     set.pcStatus === 'Đã đổi trả máy mới' || 
                                     set.isPcReplaced;
                const isPcReplacedOld = hasPcExchangeOldTicket ||
                                        pcObj?.status === 'Đổi trả máy cũ' || 
                                        pcObj?.status === 'Đã đổi trả máy cũ' || 
                                        set.computerStatus === 'Đổi trả máy cũ' || 
                                        set.computerStatus === 'Đã đổi trả máy cũ' ||
                                        set.pcStatus === 'Đổi trả máy cũ' || 
                                        set.pcStatus === 'Đã đổi trả máy cũ';
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
                          className="badge badge-warning" 
                          style={{ 
                            fontSize: '0.68rem', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            marginTop: '4px',
                            fontWeight: '700'
                          }}
                          title="Máy tính đã được đổi trả máy mới cho NPP"
                        >
                          🔄 Đã đổi trả máy mới
                        </span>
                      )}
                      {isPcReplacedOld && (
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
                          title="Máy tính đổi trả máy cũ"
                        >
                          🔁 Đổi trả máy cũ
                        </span>
                      )}
                      {!isPcReplaced && !isPcReplacedOld && isPcNew && (
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
                    
                    {/* Repair & Exchange History Summary Column */}
                    <td>
                      {nppTickets.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {/* Top Badges */}
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {nppStats.totalExchanges > 0 && (
                              <span 
                                className="badge badge-warning" 
                                style={{ fontSize: '0.7rem', padding: '2px 6px', fontWeight: '700' }}
                                title={`Đổi trả: ${nppStats.exchangeNew} lần máy mới, ${nppStats.exchangeOld} lần máy cũ`}
                              >
                                🔄 {nppStats.totalExchanges} lần đổi ({nppStats.exchangeNew} mới, {nppStats.exchangeOld} cũ)
                              </span>
                            )}
                            {nppStats.repairs > 0 && (
                              <span 
                                className="badge badge-info" 
                                style={{ fontSize: '0.7rem', padding: '2px 6px', fontWeight: '700' }}
                              >
                                🛠️ {nppStats.repairs} lần sửa/linh kiện
                              </span>
                            )}
                          </div>

                          {/* Quick summary per equipment */}
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {nppStats.dispenserTickets.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: 'var(--accent-purple)', fontWeight: '600' }}>• Chiết:</span>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                                  {nppStats.dispenserTickets[0].errorCategory || nppStats.dispenserTickets[0].notes || 'Bảo dưỡng'}
                                </span>
                              </div>
                            )}
                            {nppStats.mixerTickets.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: 'var(--accent-blue)', fontWeight: '600' }}>• Lắc:</span>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                                  {nppStats.mixerTickets[0].actionDirection === 'Xuất đổi' ? `Đổi ${nppStats.mixerTickets[0].replacementCondition || ''}` : nppStats.mixerTickets[0].errorCategory}
                                </span>
                              </div>
                            )}
                            {nppStats.computerTickets.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>• Máy tính:</span>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                                  {nppStats.computerTickets[0].actionDirection === 'Xuất đổi' ? `Đổi ${nppStats.computerTickets[0].replacementCondition === 'Mới' ? 'máy mới' : 'máy cũ'}` : nppStats.computerTickets[0].errorCategory}
                                </span>
                              </div>
                            )}
                            {nppStats.printerTickets.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: 'var(--text-main)', fontWeight: '600' }}>• Máy in:</span>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                                  {nppStats.printerTickets[0].errorCategory || 'Thay đầu in/cáp'}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Detail Button */}
                          <button 
                            className="btn btn-secondary btn-xs" 
                            style={{ alignSelf: 'flex-start', fontSize: '0.7rem', padding: '2px 8px', marginTop: '2px' }}
                            onClick={() => setSelectedNppHistory({ ...set, tickets: nppTickets, stats: nppStats })}
                          >
                            <FileText size={12} /> Xem chi tiết ({nppTickets.length} lần)
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} /> Hoạt động ổn định (0 sự cố)
                        </div>
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

            const nppTickets = getTicketsForSetOrNpp(set);
            const nppStats = getNppTicketStats(nppTickets);

            const hasPcExchangeTicket = nppStats.computerTickets.some(t => t.actionDirection === 'Xuất đổi' && t.replacementCondition === 'Mới');
            const hasPcExchangeOldTicket = nppStats.computerTickets.some(t => t.actionDirection === 'Xuất đổi' && t.replacementCondition === 'Cũ');

            const isPcReplaced = hasPcExchangeTicket ||
                                 pcObj?.status === 'Đã đổi trả máy mới' || 
                                 pcObj?.status === 'Đổi trả mới' || 
                                 set.computerStatus === 'Đã đổi trả máy mới' || 
                                 set.pcStatus === 'Đã đổi trả máy mới' || 
                                 set.isPcReplaced;
            const isPcReplacedOld = hasPcExchangeOldTicket ||
                                    pcObj?.status === 'Đổi trả máy cũ' || 
                                    pcObj?.status === 'Đã đổi trả máy cũ' || 
                                    set.computerStatus === 'Đổi trả máy cũ' || 
                                    set.computerStatus === 'Đã đổi trả máy cũ' ||
                                    set.pcStatus === 'Đổi trả máy cũ' || 
                                    set.pcStatus === 'Đã đổi trả máy cũ';

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
                        <span className="badge badge-warning" style={{ fontSize: '0.65rem', display: 'inline-block', marginTop: '2px', fontWeight: '700' }}>
                          🔄 Đã đổi trả máy mới
                        </span>
                      )}
                      {isPcReplacedOld && (
                        <span className="badge badge-purple" style={{ fontSize: '0.65rem', display: 'inline-block', marginTop: '2px', fontWeight: '700' }}>
                          🔁 Đổi trả máy cũ
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Máy In:</span>
                    <span className="mobile-card-value">{set.printerModel} ({set.printerSerial})</span>
                  </div>

                  {/* Mobile Repair & Exchange Summary */}
                  <div className="mobile-card-row" style={{ alignItems: 'flex-start', paddingTop: '6px', borderTop: '1px dashed var(--border-color)' }}>
                    <span className="mobile-card-label">Sửa & Đổi trả:</span>
                    <span className="mobile-card-value">
                      {nppTickets.length > 0 ? (
                        <div>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            {nppStats.totalExchanges > 0 && (
                              <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                                🔄 {nppStats.totalExchanges} lần đổi
                              </span>
                            )}
                            {nppStats.repairs > 0 && (
                              <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                                🛠️ {nppStats.repairs} lần sửa
                              </span>
                            )}
                          </div>
                          <button 
                            className="btn btn-secondary btn-xs" 
                            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                            onClick={() => setSelectedNppHistory({ ...set, tickets: nppTickets, stats: nppStats })}
                          >
                            Xem {nppTickets.length} sự cố
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--accent-emerald)', fontSize: '0.75rem' }}>✓ Ổn định</span>
                      )}
                    </span>
                  </div>

                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination Bar for Main Table */}
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

      {/* DEDICATED SECTION: XỬ LÝ SỬA CHỮA, THAY LINH KIỆN & ĐỔI TRẢ THIẾT BỊ THEO NPP */}
      <div id="repair-tracking-section" className="glass-panel" style={{ padding: '24px' }}>
        
        {/* Header of Section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-blue)' }}>
                <Wrench size={22} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                Theo Dõi Xử Lý Sửa Chữa, Thay Linh Kiện & Đổi Trả Thiết Bị
              </h3>
            </div>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Dữ liệu chi tiết từng nhà phân phối: sửa thiết bị gì, thay linh kiện nào, đổi trả máy mới hay cũ và tổng số lần đổi trả để dễ quản lý.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge badge-info" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              Tổng {filteredRepairTickets.length} phiếu xử lý
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('repairs')}>
              Mở Tab Xử Lý Sửa Chữa <ArrowUpRight size={14} />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          marginBottom: '20px', 
          flexWrap: 'wrap', 
          background: 'rgba(0,0,0,0.2)', 
          padding: '14px', 
          borderRadius: '10px',
          border: '1px solid var(--border-color)'
        }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text"
              className="form-control"
              placeholder="Tìm theo NPP, linh kiện, model, mã phiếu..."
              value={repairSearchTerm}
              onChange={e => { setRepairSearchTerm(e.target.value); setRepairPage(1); }}
              style={{ paddingLeft: '36px', fontSize: '0.85rem' }}
            />
          </div>

          {/* Category Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} color="var(--text-muted)" />
            <select 
              className="form-select"
              value={repairCategoryFilter}
              onChange={e => { setRepairCategoryFilter(e.target.value); setRepairPage(1); }}
              style={{ fontSize: '0.85rem', width: 'auto' }}
            >
              <option value="ALL">Tất Cả Thiết Bị</option>
              <option value="Máy chiết">Máy chiết</option>
              <option value="Máy lắc">Máy lắc</option>
              <option value="Máy tính">Máy tính (Case & AIO)</option>
              <option value="Máy in">Máy in (QL700)</option>
            </select>
          </div>

          {/* Action Filter (New / Old exchange / Repair) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <select 
              className="form-select"
              value={repairActionFilter}
              onChange={e => { setRepairActionFilter(e.target.value); setRepairPage(1); }}
              style={{ fontSize: '0.85rem', width: 'auto' }}
            >
              <option value="ALL">Tất Cả Hình Thức</option>
              <option value="NEW">✨ Xuất đổi máy mới 100%</option>
              <option value="OLD">🔁 Xuất đổi máy cũ</option>
              <option value="REPAIR">🛠️ Sửa chữa & Thay linh kiện</option>
            </select>
          </div>

          {(repairSearchTerm || repairCategoryFilter !== 'ALL' || repairActionFilter !== 'ALL') && (
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setRepairSearchTerm('');
                setRepairCategoryFilter('ALL');
                setRepairActionFilter('ALL');
                setRepairPage(1);
              }}
              style={{ fontSize: '0.8rem' }}
            >
              <RotateCcw size={13} /> Xóa Lọc
            </button>
          )}
        </div>

        {/* Repair Table */}
        <div className="desktop-only data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã Phiếu & Ngày</th>
                <th>Nhà Phân Phối</th>
                <th>Thiết Bị & Model</th>
                <th style={{ minWidth: '240px' }}>Hiện Tượng Lỗi & Linh Kiện Thay Thế</th>
                <th>Hình Thức Xử Lý</th>
                <th>Lịch Sử Đổi Trả NPP</th>
                <th>KTV Phụ Trách</th>
                <th>Trạng Thái</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRepairTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    Không tìm thấy phiếu xử lý thiết bị nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                paginatedRepairTickets.map(ticket => {
                  // Find all tickets of this NPP to compute total exchange count
                  const allNppTickets = repairTickets.filter(t => 
                    (t.nppId && ticket.nppId && t.nppId === ticket.nppId) ||
                    (t.nppName && ticket.nppName && t.nppName.trim().toLowerCase() === ticket.nppName.trim().toLowerCase())
                  );
                  const nppStats = getNppTicketStats(allNppTickets);

                  const isNewExchange = ticket.actionDirection === 'Xuất đổi' && ticket.replacementCondition === 'Mới';
                  const isOldExchange = ticket.actionDirection === 'Xuất đổi' && ticket.replacementCondition === 'Cũ';
                  const isRepair = ticket.actionDirection === 'Sửa chữa';

                  return (
                    <tr key={ticket.id || ticket.ticketCode}>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>{ticket.ticketCode}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <Clock size={11} /> {ticket.date}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>{ticket.nppName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mã NPP: {ticket.nppId || 'N/A'}</div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}>
                          {['Case', 'AIO', 'Máy tính', 'Màn hình'].includes(ticket.productCategory) && <Monitor size={15} color="var(--accent-cyan)" />}
                          {ticket.productCategory === 'Máy chiết' && <Flame size={15} color="var(--accent-purple)" />}
                          {ticket.productCategory === 'Máy lắc' && <RefreshCw size={15} color="var(--accent-blue)" />}
                          {['Máy in', 'QL700'].includes(ticket.productCategory) && <Printer size={15} color="var(--accent-emerald)" />}
                          <span>{ticket.productCategory}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Model: <strong>{ticket.machineModel || 'N/A'}</strong>
                        </div>
                        <div style={{ fontSize: '0.725rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          S/N: {ticket.serialNumber || '—'}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                          {ticket.errorDescription}
                        </div>
                        {ticket.errorCategory && (
                          <span 
                            className="badge badge-neutral" 
                            style={{ 
                              fontSize: '0.7rem', 
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: 'var(--accent-cyan)',
                              display: 'inline-block',
                              marginBottom: '4px'
                            }}
                          >
                            🛠️ {ticket.errorCategory}
                          </span>
                        )}
                        {ticket.notes && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--accent-amber)', fontStyle: 'italic', marginTop: '2px' }}>
                            📝 Thay/Xử lý: {ticket.notes}
                          </div>
                        )}
                      </td>

                      <td>
                        {isNewExchange && (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '700' }}>
                            <Sparkles size={12} /> Đổi Máy Mới 100%
                          </span>
                        )}
                        {isOldExchange && (
                          <span 
                            className="badge badge-purple" 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '4px', 
                              fontWeight: '700',
                              background: 'rgba(168,85,247,0.18)',
                              color: '#c084fc',
                              border: '1px solid rgba(168,85,247,0.4)'
                            }}
                          >
                            🔁 Đổi Máy Cũ Chuẩn
                          </span>
                        )}
                        {isRepair && (
                          <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '700' }}>
                            <Wrench size={12} /> Sửa & Thay Linh Kiện
                          </span>
                        )}
                        {!isNewExchange && !isOldExchange && !isRepair && (
                          <span className="badge badge-neutral">{ticket.actionDirection || 'Đang xử lý'}</span>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontSize: '0.8rem' }}>
                            Tổng: {nppStats.totalExchanges} lần đổi máy
                          </span>
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                            • {nppStats.exchangeNew} lần máy mới
                          </div>
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                            • {nppStats.exchangeOld} lần máy cũ
                          </div>
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                            • {nppStats.repairs} lần sửa linh kiện
                          </div>
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.825rem', fontWeight: '600' }}>{ticket.technician || 'KTV Nasun'}</div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {ticket.processingStatus === 'Đã xử lý' ? (
                            <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>✓ Đã xử lý</span>
                          ) : (
                            <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>⏳ Chưa xử lý</span>
                          )}
                          {ticket.customerReturnStatus === 'Đã gửi trả' ? (
                            <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>📦 Đã gửi trả NPP</span>
                          ) : (
                            <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>Chưa gửi trả</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View for Repair Table */}
        <div className="mobile-only mobile-card-list">
          {paginatedRepairTickets.map(ticket => {
            const isNewExchange = ticket.actionDirection === 'Xuất đổi' && ticket.replacementCondition === 'Mới';
            const isOldExchange = ticket.actionDirection === 'Xuất đổi' && ticket.replacementCondition === 'Cũ';
            const isRepair = ticket.actionDirection === 'Sửa chữa';

            return (
              <div className="mobile-card" key={ticket.id || ticket.ticketCode}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title" style={{ color: 'var(--accent-cyan)' }}>{ticket.ticketCode}</span>
                    <div className="mobile-card-subtitle">{ticket.nppName} ({ticket.date})</div>
                  </div>
                  <div>
                    {isNewExchange && <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>✨ Đổi mới</span>}
                    {isOldExchange && <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>🔁 Đổi cũ</span>}
                    {isRepair && <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>🛠️ Sửa chữa</span>}
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Thiết Bị:</span>
                    <span className="mobile-card-value font-mono">{ticket.productCategory} ({ticket.machineModel || 'N/A'})</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Hiện Tượng:</span>
                    <span className="mobile-card-value">{ticket.errorDescription}</span>
                  </div>
                  {ticket.notes && (
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Linh kiện thay:</span>
                      <span className="mobile-card-value" style={{ color: 'var(--accent-amber)' }}>{ticket.notes}</span>
                    </div>
                  )}
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">KTV:</span>
                    <span className="mobile-card-value">{ticket.technician} • {ticket.processingStatus}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination Bar for Repair Table */}
        <div className="pagination-bar" style={{ marginTop: '16px' }}>
          <div className="pagination-info">
            Hiển thị <strong>{filteredRepairTickets.length === 0 ? 0 : (repairPage - 1) * repairPageSize + 1}–{Math.min(repairPage * repairPageSize, filteredRepairTickets.length)}</strong> trong <strong>{filteredRepairTickets.length}</strong> phiếu
            <select 
              className="form-select" 
              value={repairPageSize} 
              onChange={e => { setRepairPageSize(Number(e.target.value)); setRepairPage(1); }}
              style={{ marginLeft: '12px', padding: '2px 8px', fontSize: '0.8rem', width: 'auto', display: 'inline-block' }}
            >
              <option value={10}>10 phiếu/trang</option>
              <option value={20}>20 phiếu/trang</option>
              <option value={50}>50 phiếu/trang</option>
            </select>
          </div>

          <div className="pagination-controls">
            <button 
              className="pagination-btn" 
              disabled={repairPage <= 1}
              onClick={() => setRepairPage(prev => Math.max(prev - 1, 1))}
            >
              ‹ Trước
            </button>
            
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--accent-cyan)', padding: '0 8px' }}>
              Trang {repairPage} / {totalRepairPages}
            </span>

            <button 
              className="pagination-btn" 
              disabled={repairPage >= totalRepairPages}
              onClick={() => setRepairPage(prev => Math.min(prev + 1, totalRepairPages))}
            >
              Sau ›
            </button>
          </div>
        </div>

      </div>

      {/* DETAIL MODAL: NPP REPAIR & REPLACEMENT HISTORY */}
      {selectedNppHistory && (
        <SafePortal>
          <div className="modal-overlay" onClick={() => setSelectedNppHistory(null)}>
            <div 
              className="modal-content" 
              style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Wrench size={20} color="var(--accent-cyan)" />
                    <span>Lịch Sử Sửa Chữa & Đổi Trả Thiết Bị</span>
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)', fontWeight: '600', marginTop: '2px' }}>
                    {selectedNppHistory.nppName || 'Kho Tổng'} • Bộ máy: {selectedNppHistory.setCode} ({selectedNppHistory.region})
                  </div>
                </div>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setSelectedNppHistory(null)}
                  style={{ padding: '6px' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Summary Metrics */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', 
                gap: '12px', 
                margin: '20px 0',
                padding: '16px',
                background: 'rgba(0,0,0,0.25)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tổng Lượt Can Thiệp</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-main)' }}>
                    {selectedNppHistory.stats?.total || 0} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>lần</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-amber)' }}>Đổi Máy Mới 100%</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--accent-amber)' }}>
                    {selectedNppHistory.stats?.exchangeNew || 0} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>máy</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#c084fc' }}>Đổi Máy Cũ</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#c084fc' }}>
                    {selectedNppHistory.stats?.exchangeOld || 0} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>máy</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)' }}>Sửa & Thay Linh Kiện</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--accent-blue)' }}>
                    {selectedNppHistory.stats?.repairs || 0} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>lượt</span>
                  </div>
                </div>
              </div>

              {/* Ticket Timeline List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  Chi Tiết Từng Lần Xử Lý (Thứ tự mới nhất đến cũ nhất):
                </h4>

                {(!selectedNppHistory.tickets || selectedNppHistory.tickets.length === 0) ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nhà phân phối này chưa có sự cố sửa chữa hay đổi trả thiết bị nào.
                  </div>
                ) : (
                  selectedNppHistory.tickets.map((ticket, idx) => {
                    const isNew = ticket.actionDirection === 'Xuất đổi' && ticket.replacementCondition === 'Mới';
                    const isOld = ticket.actionDirection === 'Xuất đổi' && ticket.replacementCondition === 'Cũ';

                    return (
                      <div 
                        key={ticket.id || idx}
                        style={{
                          padding: '16px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '800', color: 'var(--accent-cyan)' }}>{ticket.ticketCode}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ngày: {ticket.date}</span>
                          </div>
                          <div>
                            {isNew && <span className="badge badge-success">✨ Xuất Đổi Máy Mới 100%</span>}
                            {isOld && <span className="badge badge-purple">🔁 Xuất Đổi Máy Cũ</span>}
                            {!isNew && !isOld && <span className="badge badge-info">🛠️ Sửa Chữa & Thay Linh Kiện</span>}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '0.85rem' }}>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Thiết Bị: </span>
                            <strong>{ticket.productCategory}</strong> - {ticket.machineModel} ({ticket.serialNumber || '—'})
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>KTV Thực Hiện: </span>
                            <strong>{ticket.technician}</strong>
                          </div>
                        </div>

                        <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Hiện tượng lỗi: </span>
                          <span>{ticket.errorDescription}</span>
                        </div>

                        {ticket.errorCategory && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                            🏷️ Nhóm lỗi: <strong>{ticket.errorCategory}</strong>
                          </div>
                        )}

                        {ticket.notes && (
                          <div style={{ 
                            padding: '8px 12px', 
                            background: 'rgba(245, 158, 11, 0.08)', 
                            borderLeft: '3px solid var(--accent-amber)', 
                            borderRadius: '4px',
                            fontSize: '0.825rem',
                            color: 'var(--text-main)'
                          }}>
                            <strong>Linh kiện thay thế / Nội dung xử lý:</strong> {ticket.notes}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', marginTop: '4px' }}>
                          <span className="badge badge-neutral">Trạng thái: {ticket.processingStatus}</span>
                          <span className="badge badge-neutral">Bàn giao: {ticket.customerReturnStatus}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button className="btn btn-secondary" onClick={() => setSelectedNppHistory(null)}>
                  Đóng
                </button>
              </div>

            </div>
          </div>
        </SafePortal>
      )}

    </div>
  );
}
