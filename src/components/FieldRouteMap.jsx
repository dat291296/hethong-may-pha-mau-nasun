import React, { useState, useMemo } from 'react';
import {
  Navigation,
  MapPin,
  Building2,
  Phone,
  Calendar,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Clock,
  Compass,
  Plus,
  Trash2,
  Play,
  Check,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  Layers,
  Map,
  UserCheck
} from 'lucide-react';

export default function FieldRouteMap({
  npps = [],
  systemSets = [],
  repairTickets = [],
  onAddAuditLog,
  onNavigateTab
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('GRID'); // 'GRID' | 'TRIP'

  // Selected Trip Route List (Array of NPP IDs)
  const [selectedTripNpps, setSelectedTripNpps] = useState([]);
  const [checkInLogs, setCheckInLogs] = useState({});

  // Reference date for maintenance calculations
  const today = new Date('2026-07-26');

  // Map each NPP to its machine status, maintenance status, and repair tickets
  const enrichedNpps = useMemo(() => {
    return npps.map((npp) => {
      // Find system sets installed at this NPP
      const setsAtNpp = systemSets.filter((s) => s.nppId === npp.id && s.status === 'DA_LAP_DAT');

      // Find active repair tickets for this NPP
      const activeRepairs = repairTickets.filter(
        (t) => (t.nppId === npp.id || t.nppName === npp.name) && t.processingStatus === 'Chưa xử lý'
      );

      // Check nearest maintenance due date
      let minDiffDays = 999;
      let nextDueStr = null;

      setsAtNpp.forEach((s) => {
        if (s.nextMaintenanceDue) {
          const dueDate = new Date(s.nextMaintenanceDue);
          const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
          if (diffDays < minDiffDays) {
            minDiffDays = diffDays;
            nextDueStr = s.nextMaintenanceDue;
          }
        }
      });

      // Priority level for route planning
      let priority = 'OK'; // 'REPAIR' | 'DUE' | 'UPCOMING' | 'OK'
      if (activeRepairs.length > 0) {
        priority = 'REPAIR';
      } else if (minDiffDays <= 0) {
        priority = 'OVERDUE';
      } else if (minDiffDays <= 30) {
        priority = 'DUE';
      }

      return {
        ...npp,
        installedSetsCount: setsAtNpp.length,
        activeRepairsCount: activeRepairs.length,
        minDiffDays,
        nextDueStr,
        priority
      };
    });
  }, [npps, systemSets, repairTickets]);

  // Distinct Provinces for Filter Dropdown
  const provinces = useMemo(() => {
    const set = new Set();
    npps.forEach((n) => {
      if (n.province) set.add(n.province);
    });
    return Array.from(set);
  }, [npps]);

  // Filtered NPP list
  const filteredNpps = useMemo(() => {
    return enrichedNpps.filter((npp) => {
      const matchesSearch =
        npp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        npp.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        npp.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        npp.phone?.includes(searchTerm);

      const matchesProvince = provinceFilter === 'ALL' || npp.province === provinceFilter;

      let matchesStatus = true;
      if (statusFilter === 'REPAIR') matchesStatus = npp.activeRepairsCount > 0;
      if (statusFilter === 'DUE') matchesStatus = npp.minDiffDays <= 30;
      if (statusFilter === 'OK') matchesStatus = npp.priority === 'OK';

      return matchesSearch && matchesProvince && matchesStatus;
    });
  }, [enrichedNpps, searchTerm, provinceFilter, statusFilter]);

  // Add / Remove from Trip
  const toggleTripSelection = (nppId) => {
    if (selectedTripNpps.includes(nppId)) {
      setSelectedTripNpps(selectedTripNpps.filter((id) => id !== nppId));
    } else {
      setSelectedTripNpps([...selectedTripNpps, nppId]);
    }
  };

  // Get full objects of selected trip NPPs
  const tripNppObjects = useMemo(() => {
    return selectedTripNpps
      .map((id) => enrichedNpps.find((n) => n.id === id))
      .filter(Boolean);
  }, [selectedTripNpps, enrichedNpps]);

  // Generate Google Maps Multi-stop Directions Link
  const multiStopMapsUrl = useMemo(() => {
    if (tripNppObjects.length === 0) return '#';
    const coordsList = tripNppObjects
      .map((n) => n.locationCoordinates)
      .filter(Boolean);

    if (coordsList.length === 0) return '#';
    if (coordsList.length === 1) return `https://maps.google.com/?q=${coordsList[0]}`;

    // Google Maps multi-destination URL format:
    // https://www.google.com/maps/dir/lat1,lng1/lat2,lng2/lat3,lng3
    return `https://www.google.com/maps/dir/${coordsList.join('/')}`;
  }, [tripNppObjects]);

  // Check-in Handler
  const handleCheckIn = async (npp) => {
    const timestamp = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('vi-VN');
    setCheckInLogs((prev) => ({
      ...prev,
      [npp.id]: timestamp
    }));

    if (onAddAuditLog) {
      await onAddAuditLog({
        type: 'CHECK-IN THỰC ĐỊA',
        setCode: '—',
        nppId: npp.id,
        nppName: npp.name,
        serialList: `Tọa độ GPS: ${npp.locationCoordinates || '—'}`,
        technician: 'KTV. Nguyễn Văn Hùng',
        reason: `Check-in thực địa tại ${npp.name} (${npp.province})`,
        notes: `Đã xác nhận có mặt lúc ${timestamp}`
      });
    }

    alert(`📍 Đã Check-in thành công tại: ${npp.name}\nThời gian: ${timestamp}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner & Stats */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 100%)',
          borderLeft: '4px solid #06b6d4'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <Navigation size={26} color="var(--accent-cyan)" />
              <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                Bản Đồ Lịch Trình Công Tác & Tuyến Đường Bảo Trì
              </h2>
              <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>Field GPS Route</span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
              Sắp xếp lộ trình di chuyển tối ưu cho Kỹ thuật viên, kết nối trực tiếp ứng dụng Google Maps Navigation di động.
            </p>
          </div>

          {/* Trip Summary Badge & Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div
              style={{
                background: 'rgba(6,182,212,0.12)',
                border: '1px solid rgba(6,182,212,0.3)',
                padding: '8px 16px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <MapPin size={20} color="var(--accent-cyan)" />
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>
                  Chuyến công tác hiện tại
                </div>
                <div style={{ fontSize: '1rem', fontWeight: '900', color: 'var(--accent-cyan)' }}>
                  {selectedTripNpps.length} Đại lý đã chọn
                </div>
              </div>
            </div>

            {selectedTripNpps.length > 0 && (
              <a
                href={multiStopMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  fontWeight: '800',
                  fontSize: '0.875rem',
                  textDecoration: 'none'
                }}
              >
                <Compass size={18} />
                <span>Mở Chỉ Đường Google Maps ({selectedTripNpps.length} chặng)</span>
              </a>
            )}
          </div>
        </div>

        {/* Quick KPI Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '20px' }}>
          <div style={{ background: 'rgba(15,23,42,0.5)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Tổng NPP Thực Địa</span>
            <span style={{ fontSize: '1.25rem', fontWeight: '900', color: '#fff' }}>{npps.length} NPP</span>
          </div>

          <div style={{ background: 'rgba(245,158,11,0.08)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.25)' }}>
            <span style={{ fontSize: '0.75rem', color: '#f59e0b', display: 'block', marginBottom: '2px' }}>⚠️ Cần Bảo Trì (≤30 ngày)</span>
            <span style={{ fontSize: '1.25rem', fontWeight: '900', color: '#f59e0b' }}>
              {enrichedNpps.filter((n) => n.minDiffDays <= 30).length} NPP
            </span>
          </div>

          <div style={{ background: 'rgba(239,68,68,0.08)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.25)' }}>
            <span style={{ fontSize: '0.75rem', color: '#ef4444', display: 'block', marginBottom: '2px' }}>🛠️ Đang Cần Sửa Chữa</span>
            <span style={{ fontSize: '1.25rem', fontWeight: '900', color: '#ef4444' }}>
              {enrichedNpps.filter((n) => n.activeRepairsCount > 0).length} NPP
            </span>
          </div>

          <div style={{ background: 'rgba(16,185,129,0.08)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.25)' }}>
            <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'block', marginBottom: '2px' }}>🟢 Đã Check-in Hôm Nay</span>
            <span style={{ fontSize: '1.25rem', fontWeight: '900', color: '#10b981' }}>
              {Object.keys(checkInLogs).length} NPP
            </span>
          </div>
        </div>
      </div>

      {/* Filter & View Control Bar */}
      <div className="glass-panel" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'center' }}>
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Tìm NPP, tỉnh thành, địa chỉ, người liên hệ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '38px',
                height: '40px',
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.85rem'
              }}
            />
          </div>

          {/* Province Filter */}
          <div>
            <select
              value={provinceFilter}
              onChange={(e) => setProvinceFilter(e.target.value)}
              style={{
                width: '100%',
                height: '40px',
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: '#fff',
                padding: '0 12px',
                fontSize: '0.85rem'
              }}
            >
              <option value="ALL">🏙️ Tất cả Tỉnh / Thành phố</option>
              {provinces.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Status Priority Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: '100%',
                height: '40px',
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: '#fff',
                padding: '0 12px',
                fontSize: '0.85rem'
              }}
            >
              <option value="ALL">📌 Tất cả Trạng thái Thực địa</option>
              <option value="REPAIR">🛠️ Đang cần sửa chữa khẩn</option>
              <option value="DUE">⚠️ Sắp đến hạn bảo trì (≤30 ngày)</option>
              <option value="OK">🟢 Hoạt động bình thường</option>
            </select>
          </div>

          {/* Mode Switcher */}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setViewMode('GRID')}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'GRID' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)',
                color: viewMode === 'GRID' ? '#0f172a' : 'var(--text-muted)',
                fontWeight: '700',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Map size={16} />
              <span>Danh Sách Thẻ ({filteredNpps.length})</span>
            </button>

            <button
              onClick={() => setViewMode('TRIP')}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'TRIP' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)',
                color: viewMode === 'TRIP' ? '#0f172a' : 'var(--text-muted)',
                fontWeight: '700',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Compass size={16} />
              <span>Lộ Trình Đã Chọn ({selectedTripNpps.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* TRIP PLANNER DRAWER (If trip mode or selected items present) */}
      {selectedTripNpps.length > 0 && (
        <div
          className="glass-panel"
          style={{
            padding: '20px',
            background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(15,23,42,0.9) 100%)',
            border: '1px solid rgba(6,182,212,0.3)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', margin: 0, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Navigation size={20} /> Danh Sách Chặng Lộ Trình Công Tác ({selectedTripNpps.length} điểm dừng)
            </h3>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedTripNpps([])}
                style={{ fontSize: '0.75rem' }}
              >
                Xóa Tất Cả Chặng
              </button>

              <a
                href={multiStopMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Compass size={14} /> Mở Google Maps Chỉ Đường
              </a>
            </div>
          </div>

          {/* Horizontal / Grid sequence list */}
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
            {tripNppObjects.map((npp, index) => (
              <div
                key={npp.id}
                style={{
                  minWidth: '240px',
                  maxWidth: '280px',
                  background: 'rgba(15,23,42,0.8)',
                  padding: '14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  position: 'relative',
                  flexShrink: 0
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <span
                    style={{
                      background: 'var(--accent-cyan)',
                      color: '#0f172a',
                      fontWeight: '900',
                      fontSize: '0.75rem',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {index + 1}
                  </span>

                  <button
                    onClick={() => toggleTripSelection(npp.id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                    title="Xóa khỏi lộ trình"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={{ fontWeight: '800', fontSize: '0.9rem', color: '#fff', marginBottom: '4px' }}>
                  {npp.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  📍 {npp.address}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '0.75rem' }}>
                  <a href={`tel:${npp.phone}`} style={{ color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={12} /> {npp.phone}
                  </a>

                  {checkInLogs[npp.id] ? (
                    <span style={{ color: '#10b981', fontWeight: '700' }}>✓ Đã Check-in</span>
                  ) : (
                    <button
                      onClick={() => handleCheckIn(npp)}
                      style={{
                        background: 'rgba(16,185,129,0.15)',
                        color: '#10b981',
                        border: '1px solid rgba(16,185,129,0.3)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        fontWeight: '700'
                      }}
                    >
                      Check-in
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NPP CARDS GRID VIEW */}
      {viewMode === 'GRID' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {filteredNpps.length === 0 ? (
            <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Building2 size={40} color="var(--text-muted)" style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>Không tìm thấy Nhà Phân Phối nào phù hợp với bộ lọc!</p>
            </div>
          ) : (
            filteredNpps.map((npp) => {
              const isSelectedForTrip = selectedTripNpps.includes(npp.id);
              const isCheckedIn = !!checkInLogs[npp.id];

              return (
                <div
                  key={npp.id}
                  className="glass-panel"
                  style={{
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px',
                    borderLeft: `4px solid ${
                      npp.priority === 'REPAIR'
                        ? '#ef4444'
                        : npp.priority === 'DUE' || npp.priority === 'OVERDUE'
                        ? '#f59e0b'
                        : 'var(--accent-cyan)'
                    }`,
                    background: isSelectedForTrip ? 'rgba(6,182,212,0.06)' : undefined
                  }}
                >
                  {/* Card Top Info */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <span className="badge badge-purple" style={{ fontSize: '0.65rem', marginBottom: '4px', display: 'inline-block' }}>
                          {npp.region} • {npp.province}
                        </span>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>
                          {npp.name}
                        </h3>
                      </div>

                      <button
                        onClick={() => toggleTripSelection(npp.id)}
                        className={`btn ${isSelectedForTrip ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        {isSelectedForTrip ? <Check size={14} /> : <Plus size={14} />}
                        <span>{isSelectedForTrip ? 'Đã Chọn' : '+ Lộ Trình'}</span>
                      </button>
                    </div>

                    {/* Address & GPS */}
                    <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <MapPin size={14} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>{npp.address}</span>
                      </div>
                      {npp.locationCoordinates && (
                        <div style={{ fontSize: '0.725rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', paddingLeft: '20px' }}>
                          GPS: {npp.locationCoordinates}
                        </div>
                      )}
                    </div>

                    {/* Status Badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                      {npp.activeRepairsCount > 0 && (
                        <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Wrench size={12} /> Có {npp.activeRepairsCount} phiếu sửa chữa
                        </span>
                      )}

                      {npp.minDiffDays <= 30 && (
                        <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={12} /> Hạn bảo trì: {npp.minDiffDays <= 0 ? 'Quá hạn!' : `Còn ${npp.minDiffDays} ngày`}
                        </span>
                      )}

                      {npp.installedSetsCount > 0 ? (
                        <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Layers size={12} /> {npp.installedSetsCount} bộ máy đang chạy
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Chưa lắp bộ máy</span>
                      )}

                      {isCheckedIn && (
                        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <UserCheck size={12} /> Đã Check-in ({checkInLogs[npp.id]})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <a
                        href={`tel:${npp.phone}`}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                      >
                        <Phone size={14} color="#10b981" />
                        <span>{npp.phone || 'Gọi điện'}</span>
                      </a>

                      {npp.googleMapsUrl && (
                        <a
                          href={npp.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                          title="Mở Google Maps đơn điểm"
                        >
                          <ExternalLink size={14} />
                          <span>Map</span>
                        </a>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => handleCheckIn(npp)}
                        className={`btn ${isCheckedIn ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                        style={{ fontSize: '0.75rem' }}
                      >
                        {isCheckedIn ? '✓ Check-in Lại' : '📍 Check-in'}
                      </button>

                      {onNavigateTab && npp.activeRepairsCount > 0 && (
                        <button
                          onClick={() => onNavigateTab('repairs')}
                          className="btn btn-danger btn-sm"
                          style={{ fontSize: '0.75rem' }}
                        >
                          Sửa Chữa
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
