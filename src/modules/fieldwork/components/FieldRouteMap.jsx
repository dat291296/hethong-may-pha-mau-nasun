import { userErrorMessage } from '../../../shared/security/userError.js';
import { calculateRoadMatrix, buildRoutePlan, suggestRouteOrder, routeIdentity, validRoadMatrix, parseCoordinates, distanceKm } from '../lib/routeEstimate.js';
import { getCacheStrict, setCache, getOfflineOwner } from '../../../shared/sync/offlineDb.js';
import { WorkspaceRegionContext } from '../../../shared/hooks/useWorkspaceState';
import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../../shared/context/AuthContext';
import { useWorkspaceState } from '../../../shared/hooks/useWorkspaceState';
import { matchesSearch } from '../../../shared/workspace/workspaceFilters.js';
import { confirmAction } from '../../../shared/utils/confirmDialog.js';
import {
  Navigation,
  MapPin,
  Building2,
  Phone,
  Calendar,
  Wrench,
  ExternalLink,
  Compass,
  Plus,
  Trash2,
  Check,
  Search,
  Layers,
  Map,
  UserCheck,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  Route,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { getRobustUserLocation } from '../../../shared/utils/gpsHelper.js';
import { PERMISSION_PURPOSES } from '../../../shared/security/permissionPolicy.js';

export default function FieldRouteMap({
  npps = [],
  systemSets = [],
  repairTickets = [],
  onAddAuditLog,
  onNavigateTab
}) {
  const { user } = useAuth();
  const [tripDate, setTripDate] = useWorkspaceState('route:date', new Date().toLocaleDateString('en-CA'));
  const [searchTerm, setSearchTerm] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('GRID'); // 'GRID' | 'TRIP'
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Selected Trip Route List (Array of NPP IDs)
  const [selectedTripNpps, setSelectedTripNpps] = useWorkspaceState('route:stops', []);
  const [checkInLogs, setCheckInLogs] = useState({});

  // GPS state
  const [userLocation, setUserLocation] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeConsent, setRouteConsent] = useState(false);
  const [roadMatrix, setRoadMatrix] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [originAt, setOriginAt] = useState(null);
  const [routeNotice, setRouteNotice] = useState('');
  const [hydratedKey, setHydratedKey] = useState(null);
  const region = React.useContext(WorkspaceRegionContext);
  const storageKey = 'field-route:v2:' + region;
  const storageTail = React.useRef(Promise.resolve());
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    let disposed = false;
    const owner = getOfflineOwner();
    setUserLocation(null); setOriginAt(null); setRoadMatrix(null); setRouteConsent(false);
    setSelectedTripNpps([]);
    void getCacheStrict(storageKey, null).then(saved => {
      if (disposed || owner !== getOfflineOwner()) return;
      if (saved?.version === 2) {
        if (Array.isArray(saved.ids)) setSelectedTripNpps([...new Set(saved.ids.filter(id => typeof id === 'string'))].slice(0, 25));
        if (parseCoordinates(saved.origin) && Number.isFinite(saved.originAt)) { setUserLocation(saved.origin); setOriginAt(saved.originAt); }
        setRoadMatrix(saved.matrix || null);
      }
    }).catch(() => { if (!disposed) setRouteNotice('Chưa đọc được tuyến đã lưu. Có thể chọn lại NPP để lập tuyến.'); })
      .finally(() => { if (!disposed) setHydratedKey(storageKey); });
    return () => { disposed = true; };
  }, [storageKey, setSelectedTripNpps]);
  useEffect(() => {
    if (hydratedKey !== storageKey) return;
    const owner = getOfflineOwner();
    const snapshot = { version: 2, ids: selectedTripNpps, origin: userLocation, originAt, matrix: roadMatrix };
    storageTail.current = storageTail.current.catch(() => {}).then(async () => {
      if (owner !== getOfflineOwner()) return;
      if (!await setCache(storageKey, snapshot)) throw Error('ROUTE_CACHE_FAILED');
    }).catch(() => setRouteNotice('Chưa lưu được tuyến trên thiết bị. Kiểm tra dung lượng trước khi đóng app.'));
  }, [hydratedKey, storageKey, selectedTripNpps, userLocation, originAt, roadMatrix]);
  const [routeError, setRouteError] = useState('');
  const routeGeneration = React.useRef(0);

  const locateRouteOrigin = async () => {
    setLocationBusy(true); setRouteError('');
    try {
      const result = await getRobustUserLocation({ purpose: PERMISSION_PURPOSES.ROUTE_ORIGIN, allowIpFallback: false });
      if (!result.success || !result.coords) throw new Error(result.errorMessage || 'Không lấy được vị trí GPS. Kiểm tra quyền vị trí của trình duyệt.');
      setUserLocation(result.coords); setOriginAt(Date.now()); setViewMode('GRID'); setRouteNotice('Đã lấy vị trí. Chọn các NPP cần ghé rồi mở Lộ trình đã chọn.');
    } catch(error) { setRouteError(userErrorMessage(error)); }
    finally { setLocationBusy(false); }
  };

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

  // Map each NPP to its machine status, maintenance status, and repair tickets
  const enrichedNpps = useMemo(() => {
    const today = new Date();
    return npps.map((npp) => {
      // Find system sets installed at this NPP
      const setsAtNpp = systemSets.filter((s) => s.nppId === npp.id && ['DA_LAP_DAT', 'BAO_THUONG_BAO_TRI'].includes(s.status));

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

      const hasCoordinates = Boolean(parseCoordinates(npp.locationCoordinates));
      const searchTarget = parseCoordinates(npp.locationCoordinates)?.join(',') || String(npp.address || '').trim();

      const googleMapsSearchUrl = searchTarget ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchTarget)}` : null;
      const googleMapsNavUrl = searchTarget ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(searchTarget)}` : null;

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
        const found = matchesSearch(searchTerm,[npp.id,npp.name,npp.address,npp.contactPerson,npp.phone,npp.province,npp.region]);

        const matchesProvince = provinceFilter === 'ALL' || npp.province === provinceFilter;

        let matchesStatus = true;
        if (statusFilter === 'REPAIR') matchesStatus = npp.activeRepairsCount > 0;
        if (statusFilter === 'DUE') matchesStatus = npp.minDiffDays <= 30;
        if (statusFilter === 'OK') matchesStatus = npp.priority === 'OK';

        return found && matchesProvince && matchesStatus;
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
      if (selectedTripNpps.length >= 25) { setRouteError('Mỗi tuyến tối đa 25 NPP. Bỏ bớt điểm trước khi thêm.'); return; }
      setSelectedTripNpps([...selectedTripNpps, nppId]);
    }
  };

  // Select all filtered NPPs
  const handleSelectAllFiltered = () => {
    const filteredIds = filteredNpps.map((n) => n.id);
    const newSelected = Array.from(new Set([...selectedTripNpps, ...filteredIds]));
    setSelectedTripNpps(newSelected.slice(0, 25));
    if (newSelected.length > 25) setRouteError('Đã chọn 25 NPP đầu tiên. Mỗi tuyến tối đa 25 điểm.');
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

  const currentRouteKey = routeIdentity(userLocation, tripNppObjects);
  const routeKeyRef = React.useRef(currentRouteKey);
  routeKeyRef.current = currentRouteKey;
  const hasRoadData = validRoadMatrix(roadMatrix, userLocation, tripNppObjects);
  const routeResult = useMemo(() => buildRoutePlan(userLocation, tripNppObjects, roadMatrix), [userLocation, tripNppObjects, roadMatrix]);
  const calculateSelectedRoute = React.useCallback(async () => {
    if (!routeConsent || !userLocation || routeBusy || !online) return;
    const key = currentRouteKey, owner = getOfflineOwner();
    const generation = ++routeGeneration.current;
    setRouteBusy(true); setRouteError('');
    try {
      const result = await calculateRoadMatrix(userLocation, tripNppObjects);
      if (generation === routeGeneration.current && key === routeKeyRef.current && owner === getOfflineOwner()) setRoadMatrix(result);
    } catch (error) {
      if (generation === routeGeneration.current && key === routeKeyRef.current && owner === getOfflineOwner()) setRouteError(userErrorMessage(error));
    } finally { if (generation === routeGeneration.current) setRouteBusy(false); }
  }, [routeConsent, userLocation, routeBusy, online, currentRouteKey, tripNppObjects]);
  useEffect(() => () => { routeGeneration.current++; }, []);
  const automaticRouteAttempt = React.useRef(null);
  useEffect(() => {
    if (!online || !routeConsent) { automaticRouteAttempt.current = null; return; }
    if (viewMode === 'TRIP' && !routeBusy && userLocation && tripNppObjects.length && !hasRoadData && automaticRouteAttempt.current !== currentRouteKey) {
      automaticRouteAttempt.current = currentRouteKey;
      void calculateSelectedRoute();
    }
  }, [viewMode, routeConsent, online, currentRouteKey, routeBusy, userLocation, tripNppObjects.length, hasRoadData, calculateSelectedRoute]);
  const kmLabel = value => Number.isFinite(value) ? value.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' km' : 'Chưa xác định';

  // Generate Google Maps Multi-stop URL for ALL selected NPPs
  const multiStopMapsUrl = useMemo(() => {
    if (tripNppObjects.length === 0 || tripNppObjects.some(npp => !parseCoordinates(npp.locationCoordinates) && !String(npp.address || '').trim())) return undefined;
    
    // Single selected NPP: open direct location search
    if (tripNppObjects.length === 1) {
      return tripNppObjects[0].googleMapsSearchUrl;
    }

    // 2 or more selected NPPs: Build Google Maps Directions with all stops
    const stops = tripNppObjects.map((npp) => {
      return encodeURIComponent(parseCoordinates(npp.locationCoordinates)?.join(',') || String(npp.address || '').trim());
    });

    return `https://www.google.com/maps/dir/${stops.join('/')}`;
  }, [tripNppObjects]);

  // Multi-stop directions starting from current user GPS
  const multiStopWithUserLocationUrl = useMemo(() => {
    if (tripNppObjects.length === 0 || tripNppObjects.some(npp => !parseCoordinates(npp.locationCoordinates) && !String(npp.address || '').trim())) return undefined;
    const stops = tripNppObjects.map((npp) => {
      return encodeURIComponent(parseCoordinates(npp.locationCoordinates)?.join(',') || String(npp.address || '').trim());
    });

    if (userLocation) {
      return `https://www.google.com/maps/dir/${userLocation[0]},${userLocation[1]}/${stops.join('/')}`;
    }

    return `https://www.google.com/maps/dir/${stops.join('/')}`;
  }, [tripNppObjects, userLocation]);

  // Check-in Handler with GPS Geofencing
  const handleCheckIn = async (npp) => {
    const locationResult = await getRobustUserLocation({ allowIpFallback: false, purpose: PERMISSION_PURPOSES.FIELD_CHECK_IN });
    const currentLocation = locationResult.success ? locationResult.coords : null;
    const timestamp =
      new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
      ' ' +
      new Date().toLocaleDateString('vi-VN');
    const nppCoords = parseCoordinates(npp.locationCoordinates);

    let distanceMsg = '';
    let requiresConfirmation = false;

    if (currentLocation && nppCoords && nppCoords.length === 2 && !isNaN(nppCoords[0]) && !isNaN(nppCoords[1])) {
      const dist = getDistanceKm(currentLocation[0], currentLocation[1], nppCoords[0], nppCoords[1]);

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
      const proceed = await confirmAction(
        `⚠️ CẢNH BÁO GPS GEOFENCING\n\n` +
          `${distanceMsg}\n\n` +
          `Bạn có muốn ghi nhận check-in thủ công, chưa xác minh được vị trí?`,
        { title: 'Xác nhận bỏ qua giới hạn GPS', confirmLabel: 'Ghi nhận check-in' }
      );
      if (!proceed) return;
    }

    try {
      if (!onAddAuditLog) throw new Error('Chưa có chức năng lưu check-in trên màn hình này.');
      const saved = await onAddAuditLog({
        type: requiresConfirmation ? 'CHECK-IN THỦ CÔNG' : 'CHECK-IN THỰC ĐỊA (GPS)',
        setCode: '—',
        nppId: npp.id,
        nppName: npp.name,
        serialList: `Tọa độ GPS: ${npp.locationCoordinates || '—'}`,
        technician: user?.name || user?.full_name || 'Kỹ thuật viên',
        reason: `${requiresConfirmation ? 'Check-in thủ công, chưa xác minh GPS' : 'Check-in có xác thực GPS'} tại ${npp.name} (${npp.province})`,
        notes: `Đã xác nhận có mặt lúc ${timestamp}. Cách vị trí GPS đại lý: ${
          currentLocation && nppCoords ? `${getDistanceKm(currentLocation[0], currentLocation[1], nppCoords[0] || 0, nppCoords[1] || 0).toFixed(3)} km` : 'Không xác định'
        }`
      });
      setCheckInLogs(prev => ({ ...prev, [npp.id]: timestamp }));
      setRouteNotice(saved?.queued ? 'Đã lưu check-in trên thiết bị. App sẽ tự gửi khi có kết nối hợp lệ.' : 'Đã lưu check-in thành công.');
    } catch (error) {
      setRouteError(userErrorMessage(error));
    }
  };

  const optimizeTripRoute = () => {
    try {
      const optimized = suggestRouteOrder(userLocation, tripNppObjects, roadMatrix);
      const next = buildRoutePlan(userLocation, optimized, roadMatrix);
      const saved = routeResult.km === null || next.km === null ? 0 : Math.max(0, routeResult.km - next.km);
      setSelectedTripNpps(optimized.map(npp => npp.id)); setViewMode('TRIP');
      setRouteNotice('Đã gợi ý thứ tự từ vị trí xuất phát' + (saved > 0.05 ? ', giảm khoảng ' + kmLabel(saved) : '; thứ tự hiện tại đã phù hợp') + (next.road ? ' theo đường bộ.' : ' theo đường thẳng, cần kiểm tra lại đường bộ khi có mạng.'));
    } catch (error) { setRouteError(userErrorMessage(error)); }
  };

  return (
    <div className="workspace-screen" style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: selectedTripNpps.length >

 0 ? '90px' : '20px' }}>
      <section className="glass-panel" style={{ padding: '20px', borderTop: '3px solid var(--accent-cyan)' }} aria-label="Lập lộ trình từ vị trí hiện tại">
        <h2 style={{ margin: '0 0 8px', display: 'flex', gap: 8, alignItems: 'center' }}><Route size={24} /> Lộ trình công tác NASUN</h2>
        <p style={{ color: 'var(--text-muted)' }}>1. Lấy vị trí · 2. Chọn NPP · 3. Xem khoảng cách và sắp xếp tuyến</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button className="btn btn-secondary" disabled={locationBusy || hydratedKey !== storageKey} onClick={locateRouteOrigin} style={{ minHeight: 44 }}><Navigation size={18} />{locationBusy ? 'Đang lấy vị trí…' : userLocation ? 'Cập nhật vị trí hiện tại' : 'Lấy vị trí hiện tại'}</button>
          <button className="btn btn-secondary" onClick={() => setViewMode('GRID')} style={{ minHeight: 44 }}>Chọn NPP ({tripNppObjects.length}/25)</button>
          <button className="btn btn-primary" onClick={() => setViewMode('TRIP')} style={{ minHeight: 44 }}>Lộ trình đã chọn ({tripNppObjects.length})</button>
        </div>
        {userLocation && <p style={{ color: 'var(--text-muted)' }}>Điểm xuất phát: GPS lấy lúc {new Date(originAt).toLocaleString('vi-VN')}. Cập nhật lại nếu anh đã di chuyển.</p>}
        {!online && <p role="status">Đang offline · vẫn chọn NPP, sắp xếp tuyến và xem khoảng cách đã lưu.</p>}
        {routeNotice && <p role="status">{routeNotice}</p>}
        {routeError && <p role="alert" className="resource-error">{routeError}</p>}
        {viewMode === 'TRIP' && tripNppObjects.length > 0 && <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Tổng tuyến từ điểm xuất phát</span><strong style={{ display: 'block', fontSize: '1.6rem', color: 'var(--accent-cyan)' }}>{kmLabel(routeResult.km)}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Thời gian di chuyển</span><strong style={{ display: 'block', fontSize: '1.6rem' }}>{Number.isFinite(routeResult.minutes) ? Math.ceil(routeResult.minutes) + ' phút' : 'Chưa có đường bộ'}</strong></div>
          </div>
          <p>{hasRoadData ? 'Khoảng cách đường bộ cho ô tô · lưu lúc ' + new Date(roadMatrix.savedAt).toLocaleString('vi-VN') + '. Chưa tính ùn tắc và thời gian làm việc tại NPP.' : 'Ước tính đường thẳng để tham khảo, không phải số km lái xe. Tính đường bộ khi có mạng để so sánh chính xác hơn.'}</p>
          {!userLocation && <p role="status">Lấy vị trí hiện tại để tính cả chặng đến NPP đầu tiên.</p>}
          {tripNppObjects.some(npp => !parseCoordinates(npp.locationCoordinates)) && <p role="alert">Thiếu tọa độ: {tripNppObjects.filter(npp => !parseCoordinates(npp.locationCoordinates)).map(npp => npp.name).join(', ')}. Bổ sung tọa độ trong hồ sơ NPP để tính đủ tuyến.</p>}
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}><input type="checkbox" checked={routeConsent} onChange={event => setRouteConsent(event.target.checked)} /> Cho phép gửi tọa độ điểm xuất phát và NPP đã chọn tới OSRM để tính đường bộ.</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
            <button className="btn btn-primary" disabled={!online || !routeConsent || !userLocation || routeBusy} onClick={calculateSelectedRoute} style={{ minHeight: 44 }}>{routeBusy ? 'Đang tính đường bộ…' : hasRoadData ? 'Cập nhật km đường bộ' : 'Tính km đường bộ'}</button>
            <button className="btn btn-secondary" disabled={!userLocation || tripNppObjects.length < 2 || routeBusy} onClick={optimizeTripRoute} style={{ minHeight: 44 }}>Gợi ý thứ tự ít km hơn</button>
          </div>
        </div>}
      </section>
      {viewMode === 'GRID' && <section className="glass-panel route-planner"><h2>Gom việc theo tỉnh / thành</h2><p>Chọn tỉnh để thêm tối đa 10 NPP cần sửa hoặc bảo trì vào chuyến. Có thể điều chỉnh thứ tự trước khi mở bản đồ.</p><label>Ngày công tác<input type="date" className="form-input" value={tripDate} onChange={event => setTripDate(event.target.value)} /></label><div className="workspace-tabs">{provinces.map(province => { const pending = enrichedNpps.filter(item => item.province === province && item.priority !== 'OK').sort((a, b) => a.minDiffDays - b.minDiffDays); return pending.length > 0 && <button key={province} onClick={() => { setProvinceFilter(province); setSelectedTripNpps(previous => [...new Set([...previous, ...pending.map(item => item.id)])].slice(0, 10)); setViewMode('TRIP'); }}>{province} ({pending.length} NPP)</button>; })}</div>{!enrichedNpps.some(item => item.priority !== 'OK') && <p>Chưa có NPP cần sửa hoặc đến hạn bảo trì.</p>}</section>}
      {/* Filter & Batch Selection Controls */}
      {viewMode === 'GRID' && <div className="glass-panel" style={{ padding: '16px 20px' }}>
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
      </div>}

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
                {tripNppObjects.length >= 2 && (
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
                    <span>Gợi ý thứ tự ít km hơn</span>
                  </button>
                )}

                <a
                  href={multiStopWithUserLocationUrl || multiStopMapsUrl}
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
                const leg = routeResult.legs[index];

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
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

                        <div style={{ marginTop: 10, display: 'grid', gap: 4, fontSize: '0.875rem' }}>
                          <span>Từ vị trí xuất phát, đi riêng: <strong>{kmLabel(leg?.directKm)}</strong></span>
                          <span>{index === 0 ? 'Chặng xuất phát → NPP này' : 'Từ ' + tripNppObjects[index - 1].name + ' → NPP này'}: <strong style={{ color: 'var(--accent-cyan)' }}>{kmLabel(leg?.km)}</strong></span>
                          <span>Cộng dồn theo tuyến: <strong>{kmLabel(leg?.cumulativeKm)}</strong>{Number.isFinite(leg?.minutes) ? ' · Chặng này khoảng ' + Math.ceil(leg.minutes) + ' phút' : ''}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{hasRoadData ? 'Đường bộ cho ô tô' : 'Ước tính đường thẳng'}</span>
                        </div>
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
                        href={npp.googleMapsSearchUrl || undefined}
                        aria-disabled={!npp.googleMapsSearchUrl}
                        title={!npp.googleMapsSearchUrl ? 'Cần bổ sung địa chỉ NPP trước khi mở bản đồ.' : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', textDecoration: 'none' }}
                      >
                        <ExternalLink size={13} />
                        <span>Xem Maps</span>
                      </a>

                      <a
                        href={npp.googleMapsNavUrl || undefined}
                        aria-disabled={!npp.googleMapsNavUrl}
                        title={!npp.googleMapsNavUrl ? 'Cần bổ sung địa chỉ NPP trước khi mở bản đồ.' : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--accent-cyan)', textDecoration: 'none' }}
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
                        {userLocation && <p style={{ margin: '6px 0 0', color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>Cách điểm xuất phát: {kmLabel(distanceKm(userLocation, npp.locationCoordinates))} · đường thẳng</p>}
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
                      Đường chim bay từ bạn: <strong>{nppDistance.toFixed(1)} km</strong>
                    </div>
                  )}

                  {/* Card Actions Footer */}
                  <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Google Maps Actions Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <a
                        href={npp.googleMapsSearchUrl || undefined}
                        aria-disabled={!npp.googleMapsSearchUrl}
                        title={!npp.googleMapsSearchUrl ? 'Cần bổ sung địa chỉ NPP trước khi mở bản đồ.' : undefined}
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
                      >
                        <ExternalLink size={14} />
                        <span>Xem Trên Google Maps</span>
                      </a>

                      <a
                        href={npp.googleMapsNavUrl || undefined}
                        aria-disabled={!npp.googleMapsNavUrl}
                        title={!npp.googleMapsNavUrl ? 'Cần bổ sung địa chỉ NPP trước khi mở bản đồ.' : undefined}
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

      {viewMode === 'GRID' && selectedTripNpps.length > 0 && <button className="btn btn-primary" style={{ position: 'sticky', bottom: 'calc(76px + env(safe-area-inset-bottom))', minHeight: 48, width: '100%', zIndex: 10 }} onClick={() => setViewMode('TRIP')}>Xem khoảng cách · {selectedTripNpps.length} NPP đã chọn</button>}
    </div>
  );
}
