import React, { useState, useMemo, useEffect } from 'react';
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
  Check,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  Layers,
  Map,
  UserCheck,
  Copy,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  Route,
  Share2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { getRobustUserLocation } from '../utils/gpsHelper.js';

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
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Selected Trip Route List (Array of NPP IDs)
  const [selectedTripNpps, setSelectedTripNpps] = useState([]);
  const [checkInLogs, setCheckInLogs] = useState({});

  // GPS state
  const [userLocation, setUserLocation] = useState(null);

  // User Geolocation on mount (with fallback)
  useEffect(() => {
    getRobustUserLocation({ allowIpFallback: true }).then((res) => {
      if (res.success && res.coords) {
        setUserLocation(res.coords);
      }
    });
  }, []);

  // Distance helper (Haversine formula in km)
  const getDistanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

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

      // Find latest machine installation date for this NPP
      let latestInstallDate = null;
      setsAtNpp.forEach((s) => {
        const d = s.installedDate || s.createdAt || s.lastMaintenanceDate;
        if (d) {
          if (!latestInstallDate || new Date(d) > new Date(latestInstallDate)) {
            latestInstallDate = d;
          }
        }
      });
      const sortDateValue = latestInstallDate 
        ? new Date(latestInstallDate).getTime() 
        : (npp.createdAt ? new Date(npp.createdAt).getTime() : 0);

      // Priority level for route planning
      let priority = 'OK'; // 'REPAIR' | 'DUE' | 'UPCOMING' | 'OK'
      if (activeRepairs.length > 0) {
        priority = 'REPAIR';
      } else if (minDiffDays <= 0) {
        priority = 'OVERDUE';
      } else if (minDiffDays <= 30) {
        priority = 'DUE';
      }

      const hasCoordinates = npp.locationCoordinates && npp.locationCoordinates.includes(',');
      const searchTarget = hasCoordinates
        ? npp.locationCoordinates.trim()
        : `${npp.name}, ${npp.address || npp.province || ''}`;

      const googleMapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchTarget)}`;
      const googleMapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(searchTarget)}`;

      return {
        ...npp,
        hasCoordinates,
        installedSetsCount: setsAtNpp.length,
        activeRepairsCount: activeRepairs.length,
        minDiffDays,
        nextDueStr,
        latestInstallDate,
        sortDateValue,
        priority,
        googleMapsNavUrl,
        googleMapsSearchUrl
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

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, provinceFilter, statusFilter]);

  // Filtered NPP list - Sorted with newest installed NPPs first!
  const filteredNpps = useMemo(() => {
    return enrichedNpps
      .filter((npp) => {
        const matchesSearch =
          npp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          npp.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          npp.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          npp.phone?.includes(searchTerm);

        const matchesProvince = provinceFilter === 'ALL' || npp.province === provinceFilter;

        let matchesStatus = true;
        if (statusFilter === 'REPAIR') matchesStatus = npp.activeRepairsCount > 0;
        if (statusFilter === 'DUE') matchesStatus = npp.minDiffDays <= 30;
        if (statusFilter === 'OK') matchesStatus = npp.priority === 'OK';

        return matchesSearch && matchesProvince && matchesStatus;
      })
      .sort((a, b) => {
        // Ưu tiên hiển thị nhà phân phối mới lắp gần nhất trên đầu
        if (b.sortDateValue !== a.sortDateValue) {
          return b.sortDateValue - a.sortDateValue;
        }
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [enrichedNpps, searchTerm, provinceFilter, statusFilter]);

  // Pagination calculation (10 NPPs per page)
  const totalPages = Math.ceil(filteredNpps.length / pageSize) || 1;
  const paginatedNpps = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredNpps.slice(start, start + pageSize);
  }, [filteredNpps, currentPage, pageSize]);

  // Add / Remove from Trip
  const toggleTripSelection = (nppId) => {
    if (selectedTripNpps.includes(nppId)) {
      setSelectedTripNpps(selectedTripNpps.filter((id) => id !== nppId));
    } else {
      setSelectedTripNpps([...selectedTripNpps, nppId]);
    }
  };

  // Select all filtered NPPs
  const handleSelectAllFiltered = () => {
    const filteredIds = filteredNpps.map((n) => n.id);
    const newSelected = Array.from(new Set([...selectedTripNpps, ...filteredIds]));
    setSelectedTripNpps(newSelected);
  };

  // Deselect all
  const handleDeselectAll = () => {
    setSelectedTripNpps([]);
  };

  // Reorder items in trip
  const moveTripItem = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= selectedTripNpps.length) return;
    const newSelected = [...selectedTripNpps];
    const temp = newSelected[index];
    newSelected[index] = newSelected[targetIndex];
    newSelected[targetIndex] = temp;
    setSelectedTripNpps(newSelected);
  };

  // Get full objects of selected trip NPPs
  const tripNppObjects = useMemo(() => {
    return selectedTripNpps
      .map((id) => enrichedNpps.find((n) => n.id === id))
      .filter(Boolean);
  }, [selectedTripNpps, enrichedNpps]);

  // Total route distance calculation
  const totalTripDistanceKm = useMemo(() => {
    if (tripNppObjects.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < tripNppObjects.length - 1; i++) {
      const a = tripNppObjects[i].locationCoordinates?.split(',').map(Number);
      const b = tripNppObjects[i + 1].locationCoordinates?.split(',').map(Number);
      if (a && b && a.length === 2 && b.length === 2 && !isNaN(a[0]) && !isNaN(b[0])) {
        total += getDistanceKm(a[0], a[1], b[0], b[1]);
      }
    }
    return total;
  }, [tripNppObjects]);

  // Generate Google Maps Multi-stop URL for ALL selected NPPs
  const multiStopMapsUrl = useMemo(() => {
    if (tripNppObjects.length === 0) return '#';
    
    // Single selected NPP: open direct location search
    if (tripNppObjects.length === 1) {
      return tripNppObjects[0].googleMapsSearchUrl;
    }

    // 2 or more selected NPPs: Build Google Maps Directions with all stops
    const stops = tripNppObjects.map((npp) => {
      if (npp.locationCoordinates && npp.locationCoordinates.includes(',')) {
        return npp.locationCoordinates.trim();
      }
      return encodeURIComponent(`${npp.name}, ${npp.address || npp.province || ''}`);
    });

    return `https://www.google.com/maps/dir/${stops.join('/')}`;
  }, [tripNppObjects]);

  // Multi-stop directions starting from current user GPS
  const multiStopWithUserLocationUrl = useMemo(() => {
    if (tripNppObjects.length === 0) return '#';
    const stops = tripNppObjects.map((npp) => {
      if (npp.locationCoordinates && npp.locationCoordinates.includes(',')) {
        return npp.locationCoordinates.trim();
      }
      return encodeURIComponent(`${npp.name}, ${npp.address || npp.province || ''}`);
    });

    if (userLocation) {
      return `https://www.google.com/maps/dir/${userLocation[0]},${userLocation[1]}/${stops.join('/')}`;
    }

    return `https://www.google.com/maps/dir/${stops.join('/')}`;
  }, [tripNppObjects, userLocation]);

  // Check-in Handler with GPS Geofencing
  const handleCheckIn = async (npp) => {
    const timestamp =
      new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
      ' ' +
      new Date().toLocaleDateString('vi-VN');
    const nppCoords = npp.locationCoordinates?.split(',').map(Number);

    let distanceMsg = '';
    let requiresConfirmation = false;

    if (userLocation && nppCoords && nppCoords.length === 2 && !isNaN(nppCoords[0]) && !isNaN(nppCoords[1])) {
      const dist = getDistanceKm(userLocation[0], userLocation[1], nppCoords[0], nppCoords[1]);

      if (dist > 0.1) {
        // 100 meters
        requiresConfirmation = true;
        distanceMsg = `Khoảng cách thực tế của bạn đến đại lý là ${dist.toFixed(2)} km (vượt quá bán kính 100m yêu cầu).`;
      }
    } else {
      requiresConfirmation = true;
      distanceMsg = `Không thể định vị GPS của bạn hoặc đại lý chưa có tọa độ GPS.`;
    }

    if (requiresConfirmation) {
      const proceed = confirm(
        `⚠️ CẢNH BÁO GPS GEOFENCING\n\n` +
          `${distanceMsg}\n\n` +
          `Bạn có muốn ghi nhận check-in thực tế ở chế độ DEV (Bỏ qua định vị)?`
      );
      if (!proceed) return;
    }

    setCheckInLogs((prev) => ({
      ...prev,
      [npp.id]: timestamp
    }));

    if (onAddAuditLog) {
      await onAddAuditLog({
        type: 'CHECK-IN THỰC ĐỊA (GPS)',
        setCode: '—',
        nppId: npp.id,
        nppName: npp.name,
        serialList: `Tọa độ GPS: ${npp.locationCoordinates || '—'}`,
        technician: 'KTV. Nguyễn Văn Hùng',
        reason: `Check-in thực địa có xác thực tọa độ tại ${npp.name} (${npp.province})`,
        notes: `Đã xác nhận có mặt lúc ${timestamp}. Cách vị trí GPS đại lý: ${
          userLocation && nppCoords ? `${getDistanceKm(userLocation[0], userLocation[1], nppCoords[0] || 0, nppCoords[1] || 0).toFixed(3)} km` : 'Không xác định'
        }`
      });
    }

    alert(`📍 Đã Check-in thành công tại: ${npp.name}\nThời gian: ${timestamp}`);
  };

  // Traveling Salesperson Problem (TSP) Nearest-Neighbor Optimizer
  const optimizeTripRoute = () => {
    if (selectedTripNpps.length <= 2) {
      alert('Cần chọn ít nhất 3 nhà phân phối để thực hiện tối ưu hóa lộ trình!');
      return;
    }

    const unvisited = [...tripNppObjects];
    const optimized = [];

    // Start with the first selected distributor or closest to user
    let current = unvisited.shift();
    optimized.push(current);

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      const currCoords = current.locationCoordinates?.split(',').map(Number);
      if (!currCoords || currCoords.length !== 2) {
        current = unvisited.shift();
        optimized.push(current);
        continue;
      }

      for (let i = 0; i < unvisited.length; i++) {
        const targetCoords = unvisited[i].locationCoordinates?.split(',').map(Number);
        if (!targetCoords || targetCoords.length !== 2) continue;

        const dist = getDistanceKm(currCoords[0], currCoords[1], targetCoords[0], targetCoords[1]);
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      current = unvisited.splice(nearestIdx, 1)[0];
      optimized.push(current);
    }

    setSelectedTripNpps(optimized.map((n) => n.id));

    if (onAddAuditLog) {
      onAddAuditLog({
        type: 'TỐI ƯU HÓA LỘ TRÌNH',
        setCode: '—',
        nppId: '—',
        nppName: 'Lộ trình công tác',
        serialList: `${optimized.length} điểm dừng`,
        technician: 'KTV. Nguyễn Văn Hùng',
        reason: 'Sắp xếp tuyến đường bảo trì tối ưu (Nearest Neighbor TSP)',
        notes: `Thứ tự tối ưu: ${optimized.map((n, idx) => `${idx + 1}. ${n.name}`).join(' -> ')}`
      });
    }

    alert(
      `⚡ Đã tối ưu hóa đường đi thành công!\nSắp xếp lại ${optimized.length} chặng di chuyển theo khoảng cách ngắn nhất.`
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: selectedTripNpps.length > 0 ? '90px' : '20px' }}>
      {/* Top Banner & Main Actions */}
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
              <h2 style={{ fontSize: '1.35rem', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>
                Lộ Trình Công Tác & Tuyến Đường Google Maps
              </h2>
              <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>Google Maps Sync</span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
              Tích chọn các nhà phân phối cần ghé thăm, bấm xem trên Google Maps để mở toàn bộ các điểm dừng và lộ trình di chuyển.
            </p>
          </div>

          {/* Direct Google Maps Action for Selected NPPs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div
              style={{
                background: selectedTripNpps.length > 0 ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${selectedTripNpps.length > 0 ? 'rgba(6,182,212,0.4)' : 'var(--border-color)'}`,
                padding: '8px 16px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <MapPin size={20} color={selectedTripNpps.length > 0 ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>
                  Đại lý đã chọn
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: '900', color: selectedTripNpps.length > 0 ? 'var(--accent-cyan)' : '#fff' }}>
                  {selectedTripNpps.length} / {npps.length} NPP
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
                  padding: '10px 20px',
                  fontWeight: '800',
                  fontSize: '0.9rem',
                  textDecoration: 'none',
                  background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                  boxShadow: '0 0 20px rgba(6,182,212,0.4)'
                }}
                title="Mở Google Maps hiển thị toàn bộ các nhà phân phối đã chọn"
              >
                <Compass size={20} />
                <span>Xem Trên Google Maps ({selectedTripNpps.length} NPP)</span>
                <ExternalLink size={15} />
              </a>
            )}
          </div>
        </div>

        {/* Quick KPI Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '20px' }}>
          <div style={{ background: 'rgba(15,23,42,0.5)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Tổng NPP Hệ Thống</span>
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

      {/* Filter & Batch Selection Controls */}
      <div className="glass-panel" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'center' }}>
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Tìm NPP, tỉnh thành, địa chỉ, SĐT..."
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
              <option value="ALL">🏙️ Tất cả Tỉnh / Thành phố ({provinces.length})</option>
              {provinces.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
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
              <option value="ALL">📌 Tất cả Trạng thái</option>
              <option value="REPAIR">🛠️ Đang cần sửa chữa khẩn</option>
              <option value="DUE">⚠️ Sắp đến hạn bảo trì (≤30 ngày)</option>
              <option value="OK">🟢 Hoạt động bình thường</option>
            </select>
          </div>

          {/* View Mode Switcher */}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
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
              <span>Tất Cả NPP ({filteredNpps.length})</span>
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
              <Route size={16} />
              <span>Lộ Trình Đã Chọn ({selectedTripNpps.length})</span>
            </button>
          </div>
        </div>

        {/* Batch Selection Action Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleSelectAllFiltered}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Chọn tất cả các nhà phân phối theo bộ lọc hiện tại"
            >
              <CheckSquare size={14} />
              <span>Chọn Tất Cả Theo Bộ Lọc ({filteredNpps.length})</span>
            </button>

            {selectedTripNpps.length > 0 && (
              <button
                onClick={handleDeselectAll}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444' }}
              >
                <Square size={14} />
                <span>Bỏ Chọn Tất Cả</span>
              </button>
            )}
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Đang hiển thị trang <strong style={{ color: 'var(--accent-cyan)' }}>{currentPage} / {totalPages}</strong> ({filteredNpps.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} – {Math.min(currentPage * pageSize, filteredNpps.length)} trong tổng {filteredNpps.length} NPP mới lắp gần nhất)
            {selectedTripNpps.length > 0 && (
              <span style={{ marginLeft: '10px', color: 'var(--accent-cyan)', fontWeight: '700' }}>
                • Đã chọn: {selectedTripNpps.length} NPP
              </span>
            )}
          </div>
        </div>
      </div>

      {/* VIEW MODE: TRIP (DETAILED SELECTED STOPS VIEW) */}
      {viewMode === 'TRIP' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Route size={22} /> Danh Sách Điểm Dừng & Lộ Trình Đã Chọn
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                {tripNppObjects.length > 0
                  ? `Có ${tripNppObjects.length} nhà phân phối trong tuyến đường. Bạn có thể sắp xếp lại thứ tự ghé thăm.`
                  : 'Chưa có nhà phân phối nào được chọn. Hãy chuyển sang danh sách để tích chọn các NPP.'}
              </p>
            </div>

            {tripNppObjects.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {tripNppObjects.length >= 3 && (
                  <button
                    onClick={optimizeTripRoute}
                    className="btn btn-primary btn-sm"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-purple) 0%, #7c3aed 100%)',
                      borderColor: 'rgba(147, 51, 234, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.8rem',
                      fontWeight: '700'
                    }}
                  >
                    <span>⚡ Tối Ưu Lộ Trình (TSP)</span>
                  </button>
                )}

                <a
                  href={multiStopMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                  style={{
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: '800',
                    fontSize: '0.85rem'
                  }}
                >
                  <Compass size={16} />
                  <span>Mở Google Maps ({tripNppObjects.length} điểm)</span>
                  <ExternalLink size={14} />
                </a>

                <button
                  onClick={handleDeselectAll}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem' }}
                >
                  Xóa Lộ Trình
                </button>
              </div>
            )}
          </div>

          {tripNppObjects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              <MapPin size={48} style={{ opacity: 0.3, marginBottom: '14px' }} />
              <h4 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '8px' }}>Chưa Chọn Nhà Phân Phối Nào</h4>
              <p style={{ fontSize: '0.875rem', marginBottom: '20px' }}>
                Vui lòng quay lại tab "Tất Cả NPP" và bấm chọn các đại lý cần đi công tác hoặc bảo trì.
              </p>
              <button
                onClick={() => setViewMode('GRID')}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <Plus size={16} />
                <span>Xem và Chọn Nhà Phân Phối</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tripNppObjects.map((npp, index) => {
                const nppCoords = npp.locationCoordinates?.split(',').map(Number);
                const prevNpp = index > 0 ? tripNppObjects[index - 1] : null;
                const prevCoords = prevNpp?.locationCoordinates?.split(',').map(Number);
                
                let legDistance = null;
                if (prevCoords && nppCoords && prevCoords.length === 2 && nppCoords.length === 2 && !isNaN(prevCoords[0]) && !isNaN(nppCoords[0])) {
                  legDistance = getDistanceKm(prevCoords[0], prevCoords[1], nppCoords[0], nppCoords[1]);
                }

                const isCheckedIn = !!checkInLogs[npp.id];

                return (
                  <div
                    key={npp.id}
                    style={{
                      background: 'rgba(15,23,42,0.7)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      flexWrap: 'wrap'
                    }}
                  >
                    {/* Stop Number & Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: '280px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                          color: '#0f172a',
                          fontWeight: '900',
                          fontSize: '0.95rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        {index + 1}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '800', fontSize: '1rem', color: '#fff' }}>{npp.name}</span>
                          <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>{npp.province}</span>
                          {isCheckedIn && (
                            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>✓ Đã Check-in</span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MapPin size={13} color="var(--accent-cyan)" />
                          <span>{npp.address}</span>
                        </div>

                        {legDistance !== null && (
                          <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '700', marginTop: '4px' }}>
                            🚗 Chặng di chuyển từ điểm #{index}: ~{legDistance.toFixed(1)} km
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Reorder and Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {/* Move Up/Down */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => moveTripItem(index, -1)}
                          disabled={index === 0}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 8px', opacity: index === 0 ? 0.3 : 1 }}
                          title="Chuyển lên trước"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          onClick={() => moveTripItem(index, 1)}
                          disabled={index === tripNppObjects.length - 1}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 8px', opacity: index === tripNppObjects.length - 1 ? 0.3 : 1 }}
                          title="Chuyển xuống sau"
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>

                      {/* Google Maps link for single item */}
                      <a
                        href={npp.googleMapsSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', textDecoration: 'none' }}
                        title="Xem trên Google Maps"
                      >
                        <ExternalLink size={13} />
                        <span>Xem Maps</span>
                      </a>

                      <a
                        href={npp.googleMapsNavUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--accent-cyan)', textDecoration: 'none' }}
                        title="Chỉ đường"
                      >
                        <Compass size={13} />
                        <span>Chỉ Đường</span>
                      </a>

                      <button
                        onClick={() => handleCheckIn(npp)}
                        className={`btn ${isCheckedIn ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                        style={{ fontSize: '0.75rem' }}
                      >
                        {isCheckedIn ? '✓ Check-in' : '📍 Check-in'}
                      </button>

                      <button
                        onClick={() => toggleTripSelection(npp.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '6px 8px', color: '#ef4444' }}
                        title="Xóa khỏi lộ trình"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE: GRID (ALL NPPS WITH SELECTION CHECKBOXES) */}
      {viewMode === 'GRID' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {filteredNpps.length === 0 ? (
            <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Building2 size={40} color="var(--text-muted)" style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>Không tìm thấy Nhà Phân Phối nào phù hợp với bộ lọc!</p>
            </div>
          ) : (
            paginatedNpps.map((npp, index) => {
              const isSelected = selectedTripNpps.includes(npp.id);
              const nppCoords = npp.locationCoordinates?.split(',').map(Number);
              const nppDistance =
                userLocation && nppCoords && nppCoords.length === 2 && !isNaN(nppCoords[0]) && !isNaN(nppCoords[1])
                  ? getDistanceKm(userLocation[0], userLocation[1], nppCoords[0], nppCoords[1])
                  : null;
              const isCheckedIn = !!checkInLogs[npp.id];
              const globalRank = (currentPage - 1) * pageSize + index + 1;

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
                    background: isSelected ? 'rgba(6,182,212,0.08)' : undefined,
                    boxShadow: isSelected ? '0 0 16px rgba(6,182,212,0.2)' : undefined,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Card Top Info */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ flex: 1, paddingRight: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>
                            {npp.region} • {npp.province}
                          </span>
                          {npp.latestInstallDate && (
                            <span className="badge badge-success" style={{ fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: '700' }}>
                              <Calendar size={11} /> Lắp: {npp.latestInstallDate}
                            </span>
                          )}
                          {currentPage === 1 && index < 10 && npp.latestInstallDate && (
                            <span className="badge badge-cyan" style={{ fontSize: '0.65rem', fontWeight: '800' }}>
                              ⭐ Mới lắp #{globalRank}
                            </span>
                          )}
                        </div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>
                          {npp.name}
                        </h3>
                      </div>

                      {/* Selection Toggle Button */}
                      <button
                        type="button"
                        onClick={() => toggleTripSelection(npp.id)}
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        style={{
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: '700',
                          flexShrink: 0
                        }}
                      >
                        {isSelected ? <Check size={14} /> : <Plus size={14} />}
                        <span>{isSelected ? 'Đã Chọn' : 'Chọn'}</span>
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

                  {/* Distance Info */}
                  {nppDistance !== null && (
                    <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🚗 Cách vị trí của bạn: <strong>{nppDistance.toFixed(1)} km</strong>
                    </div>
                  )}

                  {/* Card Actions Footer */}
                  <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Google Maps Actions Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <a
                        href={npp.googleMapsSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary btn-sm"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '0.75rem',
                          textDecoration: 'none',
                          fontWeight: '800'
                        }}
                        title="Xem vị trí trực tiếp trên Google Maps"
                      >
                        <ExternalLink size={14} />
                        <span>Xem Trên Google Maps</span>
                      </a>

                      <a
                        href={npp.googleMapsNavUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.75rem',
                          color: 'var(--accent-cyan)',
                          textDecoration: 'none'
                        }}
                        title="Chỉ đường Google Maps từ vị trí hiện tại"
                      >
                        <Compass size={14} color="var(--accent-cyan)" />
                        <span>Chỉ Đường</span>
                      </a>
                    </div>

                    {/* Other Actions Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <a
                        href={`tel:${npp.phone}`}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                      >
                        <Phone size={14} color="#10b981" />
                        <span>{npp.phone || 'Gọi điện'}</span>
                      </a>

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
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Pagination Bar for Grid View */}
      {viewMode === 'GRID' && totalPages > 1 && (
        <div
          className="glass-panel"
          style={{
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            background: 'rgba(15,23,42,0.85)',
            border: '1px solid var(--border-color)'
          }}
        >
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Hiển thị <strong style={{ color: 'var(--accent-cyan)' }}>{(currentPage - 1) * pageSize + 1} – {Math.min(currentPage * pageSize, filteredNpps.length)}</strong> trong <strong style={{ color: '#fff' }}>{filteredNpps.length}</strong> NPP (10 NPP mới lắp gần nhất / trang)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setCurrentPage((p) => Math.max(1, p - 1));
                window.scrollTo({ top: 300, behavior: 'smooth' });
              }}
              disabled={currentPage === 1}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: currentPage === 1 ? 0.35 : 1 }}
            >
              <ChevronLeft size={16} />
              <span>Trang trước</span>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                className={`btn btn-sm ${currentPage === pageNum ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setCurrentPage(pageNum);
                  window.scrollTo({ top: 300, behavior: 'smooth' });
                }}
                style={{
                  minWidth: '34px',
                  height: '34px',
                  padding: '0 8px',
                  fontWeight: currentPage === pageNum ? '800' : '500'
                }}
              >
                {pageNum}
              </button>
            ))}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setCurrentPage((p) => Math.min(totalPages, p + 1));
                window.scrollTo({ top: 300, behavior: 'smooth' });
              }}
              disabled={currentPage === totalPages}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: currentPage === totalPages ? 0.35 : 1 }}
            >
              <span>Trang sau</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STICKY BOTTOM ACTION BAR (WHEN NPPS ARE SELECTED) */}
      {selectedTripNpps.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(6, 182, 212, 0.4)',
            borderRadius: '16px',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 10px 35px rgba(0, 0, 0, 0.6), 0 0 20px rgba(6, 182, 212, 0.25)',
            zIndex: 999,
            maxWidth: '90vw',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                background: 'var(--accent-cyan)',
                color: '#0f172a',
                padding: '4px 10px',
                borderRadius: '8px',
                fontWeight: '900',
                fontSize: '0.85rem'
              }}
            >
              {selectedTripNpps.length} NPP
            </span>
            <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: '700' }}>
              Đã chọn vào tuyến
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {selectedTripNpps.length >= 3 && (
              <button
                onClick={optimizeTripRoute}
                className="btn btn-secondary btn-sm"
                style={{
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(147, 51, 234, 0.15)',
                  color: '#c084fc',
                  borderColor: 'rgba(147, 51, 234, 0.3)'
                }}
              >
                <span>⚡ Tối Ưu Thứ Tự</span>
              </button>
            )}

            {/* Main Google Maps View Button */}
            <a
              href={multiStopMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                fontSize: '0.85rem',
                fontWeight: '900',
                textDecoration: 'none',
                background: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)',
                boxShadow: '0 0 15px rgba(6,182,212,0.4)'
              }}
              title="Mở Google Maps hiển thị các nhà phân phối đã chọn"
            >
              <Compass size={16} />
              <span>Xem Trên Google Maps</span>
              <ExternalLink size={14} />
            </a>

            {userLocation && (
              <a
                href={multiStopWithUserLocationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  color: 'var(--accent-cyan)',
                  textDecoration: 'none'
                }}
                title="Chỉ đường từ vị trí GPS hiện tại của bạn"
              >
                <Navigation size={14} />
                <span>Từ vị trí của tôi</span>
              </a>
            )}

            <button
              onClick={handleDeselectAll}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', padding: '6px 10px', color: '#ef4444' }}
              title="Bỏ chọn tất cả"
            >
              Bỏ Chọn
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
