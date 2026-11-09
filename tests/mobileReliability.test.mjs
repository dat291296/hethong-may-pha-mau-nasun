Summary.js===
const categories = { dispensers: 'dispenser', mixers: 'mixer', computers: 'computer', printers: 'printer' };

export function summarizeInventory({ systemSets = [], ...devices }) {
  const stock = {};
  const loose = {};
  for (const [table, category] of Object.entries(categories)) {
    const referenced = new Set(systemSets.map(set => set[`${category}Id`]).filter(Boolean));
    stock[table] = (devices[table] || []).filter(device => !device.isAssigned && !device.setCode && !referenced.has(device.id));
  }
  const completeFromLooseDevices = Math.min(...Object.values(stock).map(rows => rows.length));
  const stockSets = systemSets.filter(set => set.status === 'TRONG_KHO');
  for (const table of Object.keys(categories)) loose[table] = stock[table].slice(completeFromLooseDevices);
  return { stock, stockSets, loose, completeFromLooseDevices,
    totalReadySets: stockSets.length + completeFromLooseDevices,
    totalSets: systemSets.length + completeFromLooseDevices };
}

export function nextWarehouseId(category, devices = []) {
  const prefix = { dispenser: 'DISP', mixer: 'MIXE', computer: 'COMP', printer: 'PRIN' }[category];
  if (!prefix) throw new Error('Unknown device category');
  const legacyPrefixes = { dispenser: ['DISP'], mixer: ['MIXE', 'MIX'], computer: ['COMP', 'PC'], printer: ['PRIN', 'PRN'] }[category];
  const acceptedPrefixes = new Set(legacyPrefixes.map(value => value.toUpperCase()));
  const used = new Set(devices.reduce((numbers, device) => {
    const id = String(device.id || '').trim().toUpperCase();
    const match = id.match(/^([A-Z]+)-(\d+)$/);
    const number = match
      ? (acceptedPrefixes.has(match[1]) ? Number(match[2]) : 0)
      : (/^\d+$/.test(id) ? Number(id) : 0);
    if (Number.isSafeInteger(number) && number >= 1 && number <= 999) numbers.push(number);
    return numbers;
  }, []));
  for (let number = 1; number <= 999; number += 1) {
    if (!used.has(number)) return `${prefix}-${String(number).padStart(3, '0')}`;
  }
  throw new Error('Device numbering limit reached');
}

export function inventoryLinkIssues({ systemSets = [], ...devices }) {
  const issues = [];
  const parents = new Map(systemSets.map(set => [set.setCode, set]));
  for (const [table, category] of Object.entries(categories)) {
    const rows = devices[table] || [];
    const deviceIds = new Set(rows.map(device => device.id));
    const references = new Map();
    for (const set of systemSets) {
      const id = set[`${category}Id`];
      if (!references.has(id)) references.set(id, []);
      references.get(id).push(set);
    }
    for (const device of rows) {
      const owners = references.get(device.id) || [];
      if (owners.length && (!device.isAssigned || owners.some(set => set.setCode !== device.setCode))) {
        issues.push(`${device.id}: bộ máy ${owners.map(set => set.setCode).join(', ')} tham chiếu nhưng trạng thái hoặc mã bộ trên thiết bị chưa khớp.`);
      }
      if (device.setCode) {
        const parent = parents.get(device.setCode);
        if (!parent || parent[`${category}Id`] !== device.id) {
          issues.push(`${device.id}: khai báo thuộc bộ ${device.setCode}, bộ máy đang liên kết ${parent?.[`${category}Id`] || 'chưa có thiết bị tương ứng'}.`);
        }
      }
    }
    for (const set of systemSets) {
      const id = set[`${category}Id`];
      if (id && !deviceIds.has(id)) issues.push(`${set.setCode}: không tìm thấy thiết bị ${id} trong dữ liệu đã tải.`);
    }
  }
  return issues;
}

===END src/modules/equipment/lib/inventorySummary.js===
===FILE src/modules/equipment/components/AssetManagement.jsx===
import { pageWindow } from '../../../shared/data-access/pageWindow.js';
import { filterAssetSets, filterAssetDevices, indexRepairStatuses } from '../lib/assetFilters.js';
import AssetInventoryTables from './AssetInventoryTables.jsx';
import { userErrorMessage } from '../../../shared/security/userError.js';
import { assignedSetsForNpp, assertAdditionalSetConfirmed } from '../lib/assemblyGuard.js';
import { isUnknownSerial } from '../lib/deviceSerial.js';
import { STABILIZER_NPP, normalizeStabilizerChoice } from '../lib/stabilizer.js';
import { summarizeInventory, nextWarehouseId, inventoryLinkIssues } from '../lib/inventorySummary.js';
import { prepareDeviceEdit, requireUniqueDeviceSerial } from '../lib/deviceEdit.js';
import WorkspaceFilterBar from '../../../shared/components/WorkspaceFilterBar.jsx';
import { uniqueOptions, canEditRegion } from '../../../shared/workspace/workspaceFilters.js';
import { resolveMachine, resolveMachineCode } from '../lib/machineWorkspace';
import { resolveMachineProfile, sameMachine } from '../lib/machineProfile.js';
import { recordOperationalError } from '../../../shared/diagnostics/operationalDiagnostics.js';
import { useFormDraft } from '../../../shared/hooks/useFormDraft.js';
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '../../../shared/context/AuthContext.jsx';
import { supabase, isSupabaseConfigured } from '../../../shared/data-access/supabase.js';
import { generateNextSetCode } from '../hooks/useAssets.js';
import { Cpu, Flame, Monitor, Printer, PlusCircle, Layers, FileSpreadsheet } from 'lucide-react';
import { compressImage } from '../../../shared/utils/imageCompressor.js';
import FloatingActionButton from '../../../shared/components/FloatingActionButton.jsx';
import { useModalScrollLock } from '../../../shared/hooks/useModalScrollLock.js';
import { exportExcel } from '../../../shared/utils/excelExport.js';
import { getSystemSetMissingFields } from '../utils/systemSetValidation.js';
import { useWorkspaceState, useWorkspaceScroll } from '../../../shared/hooks/useWorkspaceState';
import { usePullToRefresh } from '../../../shared/hooks/usePullToRefresh.js';
import { confirmAction } from '../../../shared/utils/confirmDialog.js';

const QrScannerModal = lazy(() => import('../../../shared/components/QrScannerModal.jsx'));
const StockDeviceDialog = lazy(() => import('./StockDeviceDialog.jsx'));
const DeviceEditDialog = lazy(() => import('./DeviceEditDialog.jsx'));
const AssemblyDialog = lazy(() => import('./AssemblyDialog.jsx'));
const SystemSetEditDialog = lazy(() => import('./SystemSetEditDialog.jsx'));
const AssetPhotoLightbox = lazy(() => import('./AssetPhotoLightbox.jsx'));
const MachineProfileDialog = lazy(() => import('./MachineProfileDialog.jsx'));
const DeviceLookupDialog = lazy(() => import('./DeviceLookupDialog.jsx'));

export default function AssetManagement({ onReplaceEquipment,replacementEvents=[],replacementHistoryError='', initialProfile, onProfileRestored, globalSearch = '', initialFilter = 'ALL', repairTickets = [], auditLogs = [], onRequestRepair, onRequestMaintenance, onReload,
  openScannerOnMount = false, onScannerOpened,
  systemSets,
  catalog,
  npps = [],
  dispensers,
  mixers,
  computers,
  printers,
  onAssembleSet,
  onAddStockDevice,
  onEditDevice,
  onDeleteDevice,
  onOpenImportModal,
  onEditSet,
  onDeleteSet
}) {
  const { user, can } = useAuth();
  const { pullDistance, refreshing, onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh(onReload, { disabled: !onReload });
  const fullCatalog = catalog || { systemSets, npps, dispensers, mixers, computers, printers };
  const exportCurrentInventory = () => {
    const config = {
      dispensers: { rows: dispensers, name: 'Kho_May_Chiet', columns: [{ key: 'id', label: 'Mã QL' }, { key: 'model', label: 'Model' }, { key: 'serial', label: 'Số Seri' }, { key: 'status', label: 'Tình Trạng' }, { key: 'setCode', label: 'Mã Bộ Máy' }] },
      mixers: { rows: mixers, name: 'Kho_May_Lac', columns: [{ key: 'id', label: 'Mã QL' }, { key: 'model', label: 'Model' }, { key: 'type', label: 'Loại Máy Lắc' }, { key: 'serial', label: 'Số Seri' }, { key: 'status', label: 'Tình Trạng' }, { key: 'setCode', label: 'Mã Bộ Máy' }] },
      computers: { rows: computers, name: 'Kho_May_Tinh', columns: [{ key: 'id', label: 'Mã QL' }, { key: 'type', label: 'Loại Máy' }, { key: 'os', label: 'Hệ Điều Hành' }, { key: 'specs', label: 'Cấu Hình' }, { key: 'network', label: 'Kết Nối Mạng' }, { key: 'status', label: 'Tình Trạng' }, { key: 'setCode', label: 'Mã Bộ Máy' }] },
      printers: { rows: printers, name: 'Kho_May_In', columns: [{ key: 'id', label: 'Mã QL' }, { key: 'model', label: 'Model' }, { key: 'serial', label: 'Số Seri' }, { key: 'connection', label: 'Kết Nối' }, { key: 'status', label: 'Tình Trạng' }, { key: 'setCode', label: 'Mã Bộ Máy' }] },
      comboSets: { rows: systemSets, name: 'Bo_May_Pha_Mau', columns: [{ key: 'setCode', label: 'Mã Bộ Máy' }, { key: 'nppName', label: 'Nhà Phân Phối' }, { key: 'region', label: 'Khu Vực' }, { key: 'province', label: 'Tỉnh / Thành Phố' }, { key: 'status', label: 'Trạng Thái' }, { key: 'dispenserModel', label: 'Máy Chiết' }, { key: 'dispenserSerial', label: 'Seri Máy Chiết' }, { key: 'mixerModel', label: 'Máy Lắc' }, { key: 'mixerSerial', label: 'Seri Máy Lắc' }, { key: 'computerType', label: 'Máy Tính' }, { key: 'printerSerial', label: 'Seri Máy In' }, { key: 'installDate', label: 'Ngày Lắp Đặt (YYYY-MM-DD)' }, { key: 'lastMaintenanceDate', label: 'Bảo Trì Gần Nhất (YYYY-MM-DD)' }, { key: 'nextMaintenanceDue', label: 'Bảo Trì Kế Tiếp (YYYY-MM-DD)' }, { key: 'technician', label: 'Kỹ Thuật Viên' }, { key: 'salesperson', label: 'Nhân Viên Kinh Doanh' }, { key: 'stabilizer', label: 'Ổn Áp' }, { key: 'notes', label: 'Ghi Chú' }] }
    }[activeSubTab];
    exportExcel(config.rows, config.columns, config.name, 'Data');
  };
  const [qcUsers, setQcUsers] = useState([]);

  // Fetch QC and Admin user profiles for technician selection
  useEffect(() => {
    async function loadQcProfiles() {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, role, managed_region')
            .in('role', ['technician', 'qc', 'manager', 'admin']);

          if (data && !error && data.length > 0) {
            const mapped = data.map(p => ({
              id: p.id,
              name: p.full_name || p.id,
              role: p.role,
              region: p.managed_region || 'Toàn Quốc'
            }));
            setQcUsers(mapped);
            return;
          }
        } catch (err) {
          console.warn('[AssetManagement] Error loading QC profiles:', err);
        }
      }

      // Fallback: Current logged in user or dev QC
      const fallbackList = [];
      if (user && (user.name || user.full_name)) {
        fallbackList.push({
          id: user.id || 'current-user',
          name: user.name || user.full_name,
          role: user.role || 'qc',
          region: user.managedRegion || 'Toàn Quốc'
        });
      }
      setQcUsers(fallbackList);
    }
    loadQcProfiles();
  }, [user]);

  const [activeSubTab, setActiveSubTab] = useState(() => {
    try {
      if (initialFilter !== 'ALL') return 'comboSets';
      return localStorage.getItem('nasun_assets_subtab') || 'comboSets';
    } catch {
      return 'comboSets';
    }
  }); // comboSets | dispensers | mixers | computers | printers

  useEffect(() => {
    try {
      localStorage.setItem('nasun_assets_subtab', activeSubTab);
    } catch (err) {
      console.warn('[AssetManagement] Failed to save active sub-tab:', err);
    }
  }, [activeSubTab]);
  const [searchTerm, setSearchTerm] = useWorkspaceState('assets:search', '');
  useEffect(() => { if (globalSearch) setSearchTerm(globalSearch); }, [globalSearch, setSearchTerm]);
  useEffect(()=>{if(!globalSearch)return;const target=[['dispensers',dispensers],['mixers',mixers],['computers',computers],['printers',printers]].find(([,list])=>list.some(device=>device.id===globalSearch));if(target)setActiveSubTab(target[0]);},[globalSearch,dispensers,mixers,computers,printers]);
  useWorkspaceScroll('assets');
  const [modelFilter, setModelFilter] = useWorkspaceState('assets:model', 'ALL');
  const [statusFilter, setStatusFilter] = useWorkspaceState('assets:status', 'ALL');
  const [provinceFilter, setProvinceFilter] = useWorkspaceState('assets:province', 'ALL');
  const [ownerFilter, setOwnerFilter] = useWorkspaceState('assets:owner', 'ALL');
  const [dateFrom, setDateFrom] = useWorkspaceState('assets:from', '');
  const [dateTo, setDateTo] = useWorkspaceState('assets:to', '');
  const targetSetFound = !!globalSearch && systemSets.some(item => item.setCode === globalSearch);
  useEffect(() => {
    if (targetSetFound) {
      setActiveSubTab('comboSets');
      setModelFilter('ALL');
      setStatusFilter('ALL');
    }
  }, [globalSearch, targetSetFound, setModelFilter, setStatusFilter]);
  const [currentPage, setCurrentPage] = useWorkspaceState('assets:page', 1);
  const [pageSize, setPageSize] = useState(10);
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobileViewport(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  const [showAssembleModal, setShowAssembleModal] = useState(false);
  const [showScanSerialModal, setShowScanSerialModal] = useState(false);
  const [scanTargetField, setScanTargetField] = useState('add');
  useEffect(() => {
    if (!openScannerOnMount) return;
    if (!can('qr:scan')) { setScanError('Tài khoản không có quyền tra cứu mã QR.'); onScannerOpened?.(); return; }
    setScanError('');
    setScanTargetField('profile');
    setShowScanSerialModal(true);
    onScannerOpened?.();
  }, [openScannerOnMount, onScannerOpened, can]);
  const [nppSearchTerm, setNppSearchTerm] = useState('');
  const [editNppSearchTerm, setEditNppSearchTerm] = useState('');

  const [deviceSort, setDeviceSort] = useState('DEFAULT'); // 'DEFAULT' | 'NEWEST'

  // Reset pagination on tab or filter change
  const initialFilters = React.useRef(`${activeSubTab}:${modelFilter}:${statusFilter}:${searchTerm}:${deviceSort}:${provinceFilter}:${ownerFilter}:${dateFrom}:${dateTo}`);
  useEffect(() => {
    const signature = `${activeSubTab}:${modelFilter}:${statusFilter}:${searchTerm}:${deviceSort}:${provinceFilter}:${ownerFilter}:${dateFrom}:${dateTo}`;
    if (initialFilters.current === signature) return;
    initialFilters.current = signature;
    setCurrentPage(1);
  }, [activeSubTab, modelFilter, statusFilter, searchTerm, deviceSort, provinceFilter, ownerFilter, dateFrom, dateTo, setCurrentPage]);

  // Helper to find assigned set & NPP info for any device item
  const getAssignedInfo = (item) => {
    const isAssigned = item.isAssigned || !!item.setCode;
    if (!isAssigned) {
      return { isAssigned: false, setCode: '—', nppName: null };
    }
    const assignedSet = systemSets.find(s => s.setCode === item.setCode);
    return {
      isAssigned: true,
      setCode: item.setCode || '—',
      nppName: assignedSet?.nppName || 'Kho Tổng Trung Tâm'
    };
  };

  // Set Edit state
  const [editingSet, setEditingSet] = useState(null);
  const [editSetFormData, setEditSetFormData] = useState({});

  // Fullscreen Photo Lightbox State
  const [selectedPhotoViewer, setSelectedPhotoViewer] = useState(null); // { isOpen: true, photos: [], activeIndex: 0, title: '' }

  // Set Details & Full Photo Gallery Modal State
  const [selectedSetDetails, setSelectedSetDetails] = useState(null);
  const [selectedDeviceLookup, setSelectedDeviceLookup] = useState(null);
  const [replacement,setReplacement]=useState(null);
  const openedSearch = React.useRef('');
  const [profileTab, setProfileTab] = useState('equipment');
  useEffect(() => {
    if (!initialProfile) return;
    setProfileTab(initialProfile.tab || 'equipment');
    const matches = systemSets.filter(machine => sameMachine(machine, initialProfile));
    if (matches.length !== 1) return;
    setSelectedSetDetails(matches[0]);
    openedSearch.current = globalSearch;
    onProfileRestored?.();
  }, [initialProfile, systemSets, globalSearch, onProfileRestored]);
  const [quickFilter, setQuickFilter] = useState(initialFilter);
  useEffect(() => { setQuickFilter(initialFilter); }, [initialFilter]);
  const [scanError, setScanError] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [showManualScan, setShowManualScan] = useState(false);
  const deviceSerialIndex = React.useMemo(() => {
    const index = new Map();
    const groups = [['dispenser', dispensers], ['mixer', mixers], ['computer', computers], ['printer', printers]];
    for (const [category, devices] of groups) for (const device of devices || []) {
      const serial = String(device.serial || '').trim().toLocaleLowerCase('vi');
      if (!serial) continue;
      if (!index.has(serial)) index.set(serial, []);
      index.get(serial).push({ category, device });
    }
    return index;
  }, [dispensers, mixers, computers, printers]);
  const initialQuickFilter = React.useRef(quickFilter);
  useEffect(() => { if (initialQuickFilter.current === quickFilter) return; initialQuickFilter.current = quickFilter; setCurrentPage(1); }, [quickFilter, setCurrentPage]);
  useEffect(() => {
    if (!globalSearch) { openedSearch.current = ''; return; }
    if (openedSearch.current === globalSearch) return;
    const machine = resolveMachine(systemSets, globalSearch);
    if (machine) { openedSearch.current = globalSearch; setSelectedSetDetails(machine); }
  }, [globalSearch, systemSets]);

  const openScannedCode = value => {
    if (!can('qr:scan')) { setScanError('Tài khoản không có quyền tra cứu mã QR.'); return false; }
    const code = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160);
    if (!code) {
      setScanError('Mã quét không hợp lệ. Hãy quét lại hoặc nhập serial thủ công.');
      return false;
    }
    setScanInput(code);

    const normalizedCode = code.toLocaleLowerCase('vi');
    const deviceMatches = deviceSerialIndex.get(normalizedCode) || [];

    if (deviceMatches.length > 1) {
      setScanError('Serial này trùng trên nhiều thiết bị. Hãy đối chiếu mã quản lý trước khi mở hồ sơ.');
      return false;
    }
    if (deviceMatches.length === 1) {
      const match = deviceMatches[0];
      const categoryIdKey = `${match.category}Id`;
      const categorySerialKey = `${match.category}Serial`;
      const assignedCandidates = systemSets.filter(machine =>
        (match.device.setCode && machine.setCode === match.device.setCode)
        || machine[categoryIdKey] === match.device.id
        || String(machine[categorySerialKey] || '').trim().toLocaleLowerCase('vi') === normalizedCode);
      const assignedSet = assignedCandidates.length === 1 ? assignedCandidates[0] : null;
      setSelectedSetDetails(null);
      setSelectedDeviceLookup({ ...match, assignedSet });
      setScanError('');
      return true;
    }

    const machine = resolveMachine(systemSets, code) || resolveMachineCode(systemSets, code);
    if (!machine) {
      setScanError('Không tìm thấy thiết bị hoặc bộ máy khớp với mã này. Hãy kiểm tra serial và thử lại.');
      return false;
    }
    setSelectedDeviceLookup(null);
    setScanInput(machine.setCode);
    setScanError('');
    setSelectedSetDetails(machine);
    return true;
  };

  // Device Edit Modal state
  const [isSavingDevice, setIsSavingDevice] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null); // { category: 'dispenser'|'mixer'|'computer'|'printer', data }
  const [editFormData, setEditFormData] = useState({});

  // New Device Add Modal state
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [addDeviceCategory, setAddDeviceCategory] = useState('dispenser');

  // Auto scroll lock & reset position when any modal opens
  useModalScrollLock(showAssembleModal || !!editingSet || !!editingDevice || showAddDeviceModal || !!selectedPhotoViewer || !!selectedSetDetails || !!selectedDeviceLookup || !!replacement);

  // Keyboard navigation for Lightbox Photo Viewer
  useEffect(() => {
    if (!selectedPhotoViewer || !selectedPhotoViewer.isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedPhotoViewer(null);
      } else if (e.key === 'ArrowLeft' && selectedPhotoViewer.photos.length > 1) {
        setSelectedPhotoViewer(prev => ({
          ...prev,
          activeIndex: (prev.activeIndex - 1 + prev.photos.length) % prev.photos.length
        }));
      } else if (e.key === 'ArrowRight' && selectedPhotoViewer.photos.length > 1) {
        setSelectedPhotoViewer(prev => ({
          ...prev,
          activeIndex: (prev.activeIndex + 1) % prev.photos.length
        }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhotoViewer]);

  // Helper to get all photos for a system set (combines direct installation photos with NPP photos fallback)
  const getSetPhotos = (set) => {
    if (!set) return [];
    const directPhotos = Array.isArray(set.installationPhotos) ? set.installationPhotos : 
                         (Array.isArray(set.installation_photos) ? set.installation_photos : []);
    if (directPhotos.length > 0) return directPhotos;
    // Fallback: Check associated NPP's photos
    const targetNpp = npps.find(n => n.id === set.nppId);
    if (targetNpp && Array.isArray(targetNpp.photos) && targetNpp.photos.length > 0) {
      return targetNpp.photos;
    }
    return [];
  };

  // Photo handlers for editing a set
  const handleUploadEditSetPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 6) { alert('Tối đa 6 ảnh cho mỗi bộ máy.'); return; }
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        setEditSetFormData(prev => ({
          ...prev,
          installationPhotos: [...(prev.installationPhotos || []), compressed]
        }));
      } catch (err) {
        console.error('Lỗi nén ảnh:', err);
        alert(`Không thể thêm ảnh ${file.name}: ${userErrorMessage(err)}`);
      }
    }
  };

  const handleRemoveEditSetPhoto = (index) => {
    setEditSetFormData(prev => ({
      ...prev,
      installationPhotos: (prev.installationPhotos || []).filter((_, i) => i !== index)
    }));
  };

  // Photo handlers for assembling a new combo set
  const handleUploadNewSetPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length + (newSetData.installationPhotos || []).length > 6) { alert('Tối đa 6 ảnh cho mỗi bộ máy.'); return; }
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        setNewSetData(prev => ({
          ...prev,
          installationPhotos: [...(prev.installationPhotos || []), compressed]
        }));
      } catch (err) {
        console.error('Lỗi nén ảnh:', err);
        alert(`Không thể thêm ảnh ${file.name}: ${userErrorMessage(err)}`);
      }
    }
  };

  const handleRemoveNewSetPhoto = (index) => {
    setNewSetData(prev => ({
      ...prev,
      installationPhotos: (prev.installationPhotos || []).filter((_, i) => i !== index)
    }));
  };

  const [addFormData, setAddFormData] = useState({
    model: '',
    serial: '',
    status: 'Mới 100%',
    type: 'All In One',
    os: 'Windows 11 Pro',
    specs: 'Core i5 / 16GB RAM / 512GB SSD',
    network: 'Có mạng LAN',
    connection: 'USB',
    hasStabilizer: false,
    stabilizerBrand: ''
  });

  const [assemblyError, setAssemblyError] = useState('');
  // Combo Assembly Form State
  const [newSetData, setNewSetData] = useState({
    dispenserId: '',
    mixerId: '',
    computerId: '',
    printerId: '',
    nppId: '',
    nppName: '',
    region: '',
    province: '',
    salesperson: '',
    technician: user?.name || user?.full_name || '',
    installationPhotos: [],
    stabilizer: STABILIZER_NPP
  });

  const isMissingSerial = device => isUnknownSerial(device?.serial);

  const generateNextWarehouseId = (category) => {
    const source = {
      dispenser: fullCatalog.dispensers,
      mixer: fullCatalog.mixers,
      computer: fullCatalog.computers,
      printer: fullCatalog.printers
    }[category] || [];
    return nextWarehouseId(category, source);
  };

  const stockSavingRef=React.useRef(false);
  const stockDraft=useFormDraft(`${user?.id}:stock:${addDeviceCategory}`,addFormData,showAddDeviceModal,saved=>{setAddFormData(saved);return true;});
  const closeStockEditor=async()=>{if(stockSavingRef.current)return;try {await stockDraft.flush();setShowAddDeviceModal(false);}catch(error){alert(userErrorMessage(error));}};
  const assemblingRef=React.useRef(false);
  const [assembling,setAssembling]=useState(false);
  const assemblyDraft=useFormDraft(`${user?.id}:assembly`,newSetData,showAssembleModal,saved=>{setNewSetData(saved);return true;});
  const closeAssembly=async()=>{if(assemblingRef.current)return;try {await assemblyDraft.flush();setShowAssembleModal(false);}catch(error){alert(userErrorMessage(error));}};

  const handleOpenAssembleModal = () => {
    const defaultTech = (user && ['admin', 'manager', 'technician', 'qc'].includes(user.role)) ? (user.name || user.full_name) : (qcUsers[0]?.name || '');
    const autoCode = generateNextSetCode(fullCatalog.systemSets);
    setNppSearchTerm('');
    setNewSetData({
      setCode: autoCode,
      operationId:crypto.randomUUID(),
      installDate:new Date().toLocaleDateString('en-CA'),
      dispenserId: '',
      mixerId: '',
      computerId: '',
      printerId: '',
      nppId: '',
      nppName: '',
      region: '',
      province: '',
      salesperson: '',
      technician: defaultTech,
      installationPhotos: [],
      stabilizer: STABILIZER_NPP
    });
    setShowAssembleModal(true);
  };

  const existingNppSets = assignedSetsForNpp(systemSets, newSetData.nppId);
  const handleAssembleSubmit = async (e) => {
    e.preventDefault();
    if(assemblingRef.current || assemblyDraft.existing)return;
    setAssemblyError('');
    try {assertAdditionalSetConfirmed(systemSets,newSetData.nppId,newSetData.confirmAdditionalSet);} catch(error){setAssemblyError(userErrorMessage(error));return;}
    if (!newSetData.dispenserId || !newSetData.mixerId || !newSetData.computerId || !newSetData.printerId) {
      alert('Vui lòng chọn đủ 4 thiết bị: 1 Máy Chiết + 1 Máy Lắc + 1 Máy Tính + 1 Máy In QL700!');
      return;
    }
    const selectedDevices = [
      { label: 'Máy chiết', device: dispensers.find(item => item.id === newSetData.dispenserId) },
      { label: 'Máy lắc', device: mixers.find(item => item.id === newSetData.mixerId) },
      { label: 'Máy in', device: printers.find(item => item.id === newSetData.printerId) }
    ];
    const missingSerialDevices = selectedDevices.filter(item => isMissingSerial(item.device));
    if (missingSerialDevices.length > 0 && !await confirmAction(`⚠️ CẢNH BÁO SERI\n\n${missingSerialDevices.map(item => `• ${item.label}`).join('\n')} chưa có số seri. Khi ghép xong, thiết bị sẽ được đánh dấu nổi bật trong danh mục đã cấp phát.\n\nBạn vẫn muốn ghép bộ máy?`, { title: 'Cảnh báo trước khi ghép bộ' })) {
      return;
    }
    assemblingRef.current=true;setAssembling(true);
    try {
    await onAssembleSet({ ...newSetData, stabilizer: normalizeStabilizerChoice(newSetData.stabilizer || STABILIZER_NPP) });
    await assemblyDraft.clear();
    setShowAssembleModal(false);
    setNewSetData({
      dispenserId: '', mixerId: '', computerId: '', printerId: '',
      nppId: '', nppName: '', region: '', province: '', salesperson: '',
      technician: '', installationPhotos: [], stabilizer: STABILIZER_NPP
    });
    } catch(error){alert(userErrorMessage(error) || 'Không ráp được bộ máy. Bản nháp được giữ nguyên.');}
    finally {assemblingRef.current=false;setAssembling(false);}
  };

  const handleOpenAddDevice = (category) => {
    setAddDeviceCategory(category);
    setAddFormData({
      id: generateNextWarehouseId(category),
      model: category === 'computer' ? 'All In One' : '',
      serial: '',
      status: 'Mới 100%',
      type: category === 'computer' ? 'All In One' : (category === 'mixer' ? 'Lắc xoay khép kín' : ''),
      os: 'Windows 11 Pro',
      specs: 'Core i5 / 16GB RAM / 512GB SSD',
      network: 'Có mạng LAN',
      connection: 'USB',
      hasStabilizer: false,
      stabilizerBrand: ''
    });
    setShowAddDeviceModal(true);
  };

  useEffect(() => {
    if (!selectedSetDetails) return;
    const matches = systemSets.filter(item => sameMachine(item, selectedSetDetails));
    if (matches.length === 1 && matches[0] !== selectedSetDetails) setSelectedSetDetails(matches[0]);
  }, [systemSets, selectedSetDetails]);
  const machineProfile = selectedSetDetails ? resolveMachineProfile(selectedSetDetails, systemSets,
    {dispenser:dispensers,mixer:mixers,computer:computers,printer:printers}, npps, repairTickets, auditLogs) : null;
  const deviceDraftValue = React.useMemo(() => ({ deviceId:editingDevice?.data.id, category:editingDevice?.category,
    revision:editingDevice?.data.updatedAt, form:editFormData }), [editingDevice,editFormData]);
  const deviceDraft = useFormDraft(editingDevice ? `${user?.id}:device:${editingDevice.category}:${editingDevice.data.id}` : null,
    deviceDraftValue, Boolean(editingDevice), saved => {
      if (saved.deviceId !== editingDevice?.data.id || saved.category !== editingDevice?.category || saved.revision !== editingDevice?.data.updatedAt) {
        alert('Bản nháp thuộc phiên bản thiết bị cũ. Đối chiếu nội dung trước khi sửa; chưa ghi đè dữ liệu.'); return false;
      }
      setEditFormData(saved.form); return true;
    });
  const closeDeviceEditor = async () => {
    try { await deviceDraft.flush(); setEditingDevice(null); }
    catch (error) { alert(userErrorMessage(error)); }
  };

  const modelOptions = category => [...new Set([...(category === 'dispenser' ? ['Satint', 'First-1', 'Satint A2', 'Hero', 'Corob', 'Fast & Fluid'] : category === 'mixer' ? ['Satint', 'First-1', 'Satint ST-50', 'KMC', 'Evoshake-200', 'YSA-2A'] : ['QL700']), ...({ dispenser: dispensers, mixer: mixers, printer: printers }[category] || []).map(device => device.model)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const handleOpenEditDevice = (category, data) => {
    const machine = systemSets.find(item=>item.setCode === data.setCode);
    if (!can('asset:edit') || !canEditRegion(user,machine?.region)) { alert('Thiết bị chưa có khu vực hoặc thuộc miền khác cần quản trị viên xử lý.'); return; }
    setEditingDevice({ category, data });
    const cleanType = category === 'computer' 
      ? (data.type === 'Case' ? 'Case' : 'All In One')
      : (data.type || '');
    setEditFormData({
      ...data,
      serial: category !== 'computer' && isUnknownSerial(data.serial) ? '' : data.serial || '',
      sourceId: data.id || '',
      type: cleanType,
      model: category === 'computer' ? cleanType : (data.model || ''),
      ...(category === 'computer' ? {
        tintingSoftware: machine?.tintingSoftware ?? data.tintingSoftware ?? '',
        softwareVersion: machine?.softwareVersion ?? data.softwareVersion ?? '',
      } : {}),
      id: data.id || '',
      isAssigned: data.isAssigned || !!data.setCode,
      setCode: data.setCode || ''
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingDevice || isSavingDevice) return;
    if (deviceDraft.existing) { alert('Khôi phục hoặc bỏ bản nháp cũ trước khi lưu.'); return; }
    const isAssigned = !!editFormData.isAssigned && !!editFormData.setCode;
    const cleanType = editingDevice.category === 'computer'
      ? (editFormData.type === 'Case' ? 'Case' : 'All In One')
      : editFormData.type;
    try {
      const finalData = prepareDeviceEdit(editingDevice.category, {
      ...editFormData,
      type: cleanType,
      model: editingDevice.category === 'computer' ? cleanType : editFormData.model,
      serial: editFormData.serial,
      isAssigned,
      setCode: isAssigned ? editFormData.setCode : null
      }, editingDevice.data);
      if (finalData.serial !== editingDevice.data.serial) {
        const inventory = { computer: fullCatalog.computers, dispenser: fullCatalog.dispensers, mixer: fullCatalog.mixers, printer: fullCatalog.printers }[editingDevice.category];
        requireUniqueDeviceSerial(finalData.serial, editingDevice.data.id, inventory, fullCatalog.systemSets, fullCatalog.npps);
      }
      setIsSavingDevice(true);
      await onEditDevice(editingDevice.category, finalData);
      await deviceDraft.clear().catch(() => recordOperationalError('draft',{code:'DRAFT_WRITE_FAILED'}));
      const conflictingSet = finalData.setCode && systemSets.find(set => set.setCode === finalData.setCode && set[`${editingDevice.category}Id`] && set[`${editingDevice.category}Id`] !== finalData.id);
      if (conflictingSet) alert('Đã lưu thiết bị. Liên kết cũ với bộ máy chưa khớp; hãy đối chiếu hồ sơ NPP. Thiết bị đang gán chính thức không bị thay thế.');
      alert(editingDevice.category === 'computer' || finalData.serial ? '✅ Đã lưu thông tin chỉnh sửa thành công!' : 'Đã lưu thiết bị. ⚠️ Chưa có serial; cần kỹ thuật viên phụ trách khu vực bổ sung trong hồ sơ máy.');
      setEditingDevice(null);
    } catch (err) {
      recordOperationalError('device',err);
      console.error('[Device] Save failed without payload');
      alert('⚠️ ' + (userErrorMessage(err) || 'Không lưu được thiết bị. Giữ nội dung đang nhập và thử lại.'));
    } finally {
      setIsSavingDevice(false);
    }
  };

  const handleDeleteDevice = async (category, item) => {
    const categoryNameMap = {
      dispenser: 'Máy chiết',
      mixer: 'Máy lắc',
      computer: 'Máy tính',
      printer: 'Máy in'
    };
    const catLabel = categoryNameMap[category] || 'Thiết bị';
    const assignedSet = item.setCode ? systemSets.find(s => s.setCode === item.setCode) : null;
    const nppText = assignedSet?.nppName ? ` (Đã gán cho NPP: ${assignedSet.nppName})` : '';

    if (item.isAssigned || item.setCode) {
      if (await confirmAction(`⚠️ ${catLabel} [${item.id || item.model}] đang được gán trong bộ máy [${item.setCode}]${nppText}.\n\nBạn có chắc chắn muốn xóa thiết bị này khỏi hệ thống không?\nHệ thống sẽ gỡ thiết bị khỏi bộ máy ${item.setCode}.`, { title: 'Xác nhận xóa thiết bị', confirmLabel: 'Xóa thiết bị', danger: true })) {
        onDeleteDevice(category, item.id, item.setCode);
      }
    } else {
      if (await confirmAction(`Bạn có chắc chắn muốn xóa ${catLabel} [${item.id || item.model}] khỏi kho?`, { title: 'Xác nhận xóa thiết bị', confirmLabel: 'Xóa thiết bị', danger: true })) {
        onDeleteDevice(category, item.id, null);
      }
    }
  };

  const handleAddDeviceSubmit = async (e) => {
    e.preventDefault();
    if(stockSavingRef.current || stockDraft.existing)return;
    let managementId;
    try {
      managementId = generateNextWarehouseId(addDeviceCategory);
    } catch (error) {
      alert(error.message === 'Device numbering limit reached'
        ? 'Đã sử dụng hết dải mã QL 001–999 cho loại thiết bị này.'
        : 'Chưa tạo được mã quản lý. Vui lòng tải lại kho rồi thử lại.');
      return;
    }
    if (addDeviceCategory !== 'computer' && !addFormData.model && !addFormData.type) {
      alert('Vui lòng nhập Model / Hệ máy!');
      return;
    }
    const cleanType = addDeviceCategory === 'computer'
      ? (addFormData.type === 'Case' ? 'Case' : 'All In One')
      : addFormData.type;
    const finalData = {
      ...addFormData,
      id: managementId,
      type: cleanType,
      model: addDeviceCategory === 'computer' ? cleanType : addFormData.model,
      serial: addDeviceCategory === 'computer' ? '—' : (addFormData.serial?.trim() || null)
    };
    stockSavingRef.current=true;setIsSavingDevice(true);
    try {
      const result=await onAddStockDevice(addDeviceCategory, finalData);
      await stockDraft.clear();
      alert(result?.queued ? 'Đã lưu trên thiết bị, chờ đồng bộ.' : 'Đã thêm thiết bị vào kho thành công.');
      setShowAddDeviceModal(false);
    } catch(error){alert(userErrorMessage(error) || 'Không thêm được thiết bị. Bản nháp được giữ nguyên.');}
    finally {stockSavingRef.current=false;setIsSavingDevice(false);}
  };

  const handleOpenEditSet = (set) => {
    if (!can('asset:edit') || !canEditRegion(user,set.region)) { alert('Bạn chỉ được sửa bộ máy thuộc khu vực được phân công.'); return; }
    const targetNpp = npps.find(n => n.id === set.nppId);
    setEditNppSearchTerm('');
    setEditingSet(set);
    setEditSetFormData({
      expectedRevision:set.updatedAt,
      setCode: set.setCode || set.set_code || '',
      nppId: set.nppId || '',
      nppName: set.nppName || '',
      region: set.region || '',
      province: set.province || '',
      status: set.status || 'TRONG_KHO',
      stabilizer: normalizeStabilizerChoice(set.stabilizer),
      technician: set.technician || ((user && ['admin', 'manager', 'technician', 'qc'].includes(user.role)) ? (user.name || user.full_name) : (qcUsers[0]?.name || '')),
      salesperson: set.salesperson || targetNpp?.salesperson || '',
      notes: set.notes || '',
      lastMaintenanceDate: set.lastMaintenanceDate || '',
      computerSerial: set.computerSerial || '',
      tintingSoftware: set.tintingSoftware || '',
      softwareVersion: set.softwareVersion || '',
      nextMaintenanceDue: set.nextMaintenanceDue || '',
      installationPhotos: set.installationPhotos || set.installation_photos || []
    });
  };

  const setSavingRef=React.useRef(false);
  const [setSaving,setSetSaving]=useState(false);
  const setDraft=useFormDraft(editingSet?`${user?.id}:system-set:${editingSet.setCode}`:null,editSetFormData,Boolean(editingSet),saved=>{
    if(saved.expectedRevision!==editingSet?.updatedAt){alert('Hồ sơ đã thay đổi. Giữ nháp cũ để đối chiếu trước khi lưu.');return false;}
    setEditSetFormData(saved);return true;
  });
  const closeSetEditor=async()=>{if(setSavingRef.current)return;try {await setDraft.flush();setEditingSet(null);}catch(error){alert(userErrorMessage(error));}};
  const handleEditSetSubmit = async (e) => {
    e.preventDefault();
    if (!editingSet || setSavingRef.current || setDraft.existing) return;
    setSavingRef.current=true;setSetSaving(true);
    try {
      const result=await onEditSet(editingSet.setCode, { ...editSetFormData, stabilizer: normalizeStabilizerChoice(editSetFormData.stabilizer) });
      await setDraft.clear().catch(()=>console.warn('[SystemSet] Draft cleanup failed'));
      alert(result?.queued?'Đã lưu trên thiết bị, chờ đồng bộ.':'Đã lưu thông tin bộ máy.');
      setEditingSet(null);
    } catch (err) {
      console.error('Lỗi khi lưu bộ máy:', err);
      alert(userErrorMessage(err) || 'Không thể lưu bộ máy. Giữ bản nháp để đối chiếu.');
    } finally {setSavingRef.current=false;setSetSaving(false);}
  };

  const handleDeleteSet = async (setCode) => {
    if (await confirmAction(`Bạn có chắc chắn muốn xóa bộ máy [${setCode}] không? Các thiết bị liên kết sẽ tự động được giải phóng và đưa lại về kho lẻ.`, { title: 'Xác nhận xóa bộ máy', confirmLabel: 'Xóa bộ máy', danger: true })) {
      try {
        await onDeleteSet(setCode);
      } catch (err) {
        console.error('Lỗi khi xóa bộ máy:', err);
        alert('⚠️ Không thể xóa bộ máy. Dữ liệu vẫn được giữ để đồng bộ lại.');
      }
    }
  };

  const naturalSortCode = (a, b, key = 'id') => {
    const valA = String(a?.[key] || a?.id || a?.setCode || '');
    const valB = String(b?.[key] || b?.id || b?.setCode || '');
    return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
  };

  const renderIssuedSerial = (item) => {
    const shouldWarn = isMissingSerial(item);
    if (!shouldWarn) {
      return <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{item.serial || 'N/A'}</span>;
    }
    return <span className="badge badge-danger" title="Thiết bị đã cấp phát nhưng chưa có số seri" style={{ fontSize: '0.72rem' }}>⚠️ Chưa có seri</span>;
  };

  const repairStatusIndex = React.useMemo(() => indexRepairStatuses(repairTickets), [repairTickets]);
  const today = new Date().toLocaleDateString('en-CA');
  const filteredSets = React.useMemo(() => filterAssetSets(systemSets, npps, repairStatusIndex, {
    model: modelFilter, status: statusFilter, province: provinceFilter, owner: ownerFilter,
    search: searchTerm, quick: quickFilter, from: dateFrom, to: dateTo,
  }, today), [systemSets, npps, repairStatusIndex, modelFilter, statusFilter, provinceFilter, ownerFilter, searchTerm, quickFilter, dateFrom, dateTo, today]);
  const sortedDispensers = React.useMemo(() => filterAssetDevices(dispensers, searchTerm, statusFilter, deviceSort), [dispensers, searchTerm, statusFilter, deviceSort]);
  const sortedMixers = React.useMemo(() => filterAssetDevices(mixers, searchTerm, statusFilter, deviceSort), [mixers, searchTerm, statusFilter, deviceSort]);
  const sortedComputers = React.useMemo(() => filterAssetDevices(computers, searchTerm, statusFilter, deviceSort), [computers, searchTerm, statusFilter, deviceSort]);
  const sortedPrinters = React.useMemo(() => filterAssetDevices(printers, searchTerm, statusFilter, deviceSort), [printers, searchTerm, statusFilter, deviceSort]);
  const activeListCount = ({ comboSets: filteredSets.length, dispensers: sortedDispensers.length, mixers: sortedMixers.length, computers: sortedComputers.length, printers: sortedPrinters.length })[activeSubTab] || 0;
  const hasNextPage = currentPage * pageSize < activeListCount;
  const loadNextPage = React.useCallback(() => {
    if (window.matchMedia('(max-width: 768px)').matches) setCurrentPage(page => page * pageSize < activeListCount ? page + 1 : page);
  }, [activeListCount, pageSize, setCurrentPage]);

  const renderDeviceFilterBar = (categoryName, totalCount, isComputer = false) => {
    const rows = categoryName === 'Máy Chiết' ? sortedDispensers : categoryName === 'Máy Lắc' ? sortedMixers : isComputer ? sortedComputers : sortedPrinters;
    return <WorkspaceFilterBar search={searchTerm} onSearch={setSearchTerm} placeholder={`Tìm ${categoryName.toLocaleLowerCase('vi')}, mã, seri…`} count={rows.length} fields={[{key:'status',label:'Tình trạng',value:statusFilter,onChange:setStatusFilter,options:uniqueOptions(['NEW','UPDATED','ASSIGNED','FREE','Mới 100%','Đang chạy tốt','Cần bảo trì',...(isComputer ? ['DOI_TRA_MOI','DOI_TRA_CU'] : [])]).map(option=>({...option,label:({NEW:'Mới thêm',UPDATED:'Mới chỉnh sửa',ASSIGNED:'Đã gán bộ máy',FREE:'Tự do trong kho',DOI_TRA_MOI:'Đã đổi trả máy mới',DOI_TRA_CU:'Đổi trả máy cũ'})[option.value] || option.label}))},{key:'sort',label:'Sắp xếp',defaultValue:'DEFAULT',allLabel:'Mã quản lý (A–Z)',value:deviceSort,onChange:setDeviceSort,options:[{value:'NEWEST',label:'Mới cập nhật'}]}]} onReset={()=>{setSearchTerm('');setStatusFilter('ALL');setDeviceSort('DEFAULT');}}/>;
  };

  const getPaginatedList = (list) => {
    const window = pageWindow(list.length, currentPage, pageSize);
    return list.slice(isMobileViewport ? 0 : window.start, window.end);
  };

  const renderPaginationBar = (totalCount) => {
    const window = pageWindow(totalCount, currentPage, pageSize);
    const totalPages = window.pages;
    const visiblePage = window.page;
    const startItem = totalCount === 0 ? 0 : window.start + 1;
    const endItem = window.end;

    return (
      <div className="pagination-bar">
        <div className="pagination-info">
          Hiển thị <strong>{startItem}–{endItem}</strong> trong tổng số <strong>{totalCount}</strong> mục
          <select 
            className="form-select" 
            value={pageSize} 
            onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            style={{ marginLeft: '12px', padding: '2px 8px', fontSize: '0.8rem', width: 'auto', display: 'inline-block' }}
          >
            <option value={10}>10 dòng/trang</option>
            <option value={25}>25 dòng/trang</option>
            <option value={50}>50 dòng/trang</option>
          </select>
        </div>

        <div className="pagination-controls">
          <button 
            className="pagination-btn" 
            disabled={visiblePage <= 1}
            onClick={() => setCurrentPage(Math.max(visiblePage - 1, 1))}
          >
            ‹ Trang Trước
          </button>
          
          <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--accent-cyan)', padding: '0 8px' }}>
            Trang {visiblePage} / {totalPages}
          </span>

          <button 
            className="pagination-btn" 
            disabled={visiblePage >= totalPages}
            onClick={() => setCurrentPage(Math.min(visiblePage + 1, totalPages))}
          >
            Trang Sau ›
          </button>
        </div>
      </div>
    );
  };

  // Inventory Stock Calculations (Items not yet assigned to any combo or setCode is null)
  const stockBundleSummary = React.useMemo(() => summarizeInventory({ systemSets, dispensers, mixers, computers, printers }), [systemSets, dispensers, mixers, computers, printers]);
  const { dispensers: stockDispensers, mixers: stockMixers, computers: stockComputers, printers: stockPrinters } = stockBundleSummary.stock;
  const stockSets = stockBundleSummary.stockSets;
  const linkIssues = React.useMemo(() => inventoryLinkIssues({ systemSets, dispensers, mixers, computers, printers }), [systemSets, dispensers, mixers, computers, printers]);

  const looseInventoryGroups = React.useMemo(() => [
    { key: 'dispensers', label: 'Máy chiết lẻ', icon: '🖨️', color: '#ec4899', items: stockBundleSummary.loose.dispensers, getName: item => `${item.model || 'Máy chiết'} · ${item.serial || item.id}` },
    { key: 'mixers', label: 'Máy lắc lẻ', icon: '🔄', color: '#38bdf8', items: stockBundleSummary.loose.mixers, getName: item => `${item.model || item.type || 'Máy lắc'} · ${item.serial || item.id}` },
    { key: 'computers', label: 'Máy tính lẻ', icon: '💻', color: '#a855f7', items: stockBundleSummary.loose.computers, getName: item => `${item.type || 'Máy tính'} · ${item.id}` },
    { key: 'printers', label: 'Máy in lẻ', icon: '🖨️', color: '#10b981', items: stockBundleSummary.loose.printers, getName: item => `${item.model || 'QL700'} · ${item.serial || item.id}` }
  ], [stockBundleSummary]);
  const incompleteSystemSets = React.useMemo(() => (systemSets || []).filter(set => getSystemSetMissingFields(set).length > 0), [systemSets]);

  // Breakdown by model/type for stock items
  const dispenserStockBreakdown = React.useMemo(() => {
    const map = {};
    stockDispensers.forEach(d => {
      const model = d.model || 'Khác';
      map[model] = (map[model] || 0) + 1;
    });
    return map;
  }, [stockDispensers]);

  const mixerStockBreakdown = React.useMemo(() => {
    const map = {};
    stockMixers.forEach(m => {
      const key = m.model || m.type || 'Khác';
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [stockMixers]);

  const computerStockBreakdown = React.useMemo(() => {
    const map = {};
    stockComputers.forEach(c => {
      const key = c.type || (c.os?.includes('Windows') ? 'Case/AIO' : 'Máy Tính');
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [stockComputers]);

  const printerStockBreakdown = React.useMemo(() => {
    const map = {};
    stockPrinters.forEach(p => {
      const key = p.model || 'QL700';
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [stockPrinters]);

  return (
    <div className="workspace-screen assetmanagement-screen" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="pull-refresh-indicator" aria-live="polite" style={{ height: `${Math.min(pullDistance, 72)}px`, opacity: refreshing || pullDistance > 12 ? 1 : 0 }}>
        <span className={refreshing ? 'is-refreshing' : ''}>{refreshing ? 'Đang làm mới…' : pullDistance >= 72 ? 'Thả để làm mới' : 'Kéo xuống để làm mới'}</span>
      </div>
      

      {activeSubTab === 'comboSets' && <WorkspaceFilterBar search={searchTerm} onSearch={setSearchTerm} placeholder="Tìm mã bộ, NPP, seri…" count={filteredSets.length} fields={[{key:'province',label:'Tỉnh / thành',value:provinceFilter,onChange:setProvinceFilter,options:uniqueOptions([...systemSets.map(item=>item.province),...npps.map(item=>item.province)])},{key:'owner',label:'Kỹ thuật viên',value:ownerFilter,onChange:setOwnerFilter,options:uniqueOptions(systemSets.map(item=>item.technician))},{key:'model',label:'Máy chiết',value:modelFilter,onChange:setModelFilter,options:uniqueOptions(systemSets.map(item=>item.dispenserModel))},{key:'status',label:'Trạng thái bộ máy',value:statusFilter,onChange:setStatusFilter,options:[{value:'DA_LAP_DAT',label:'Đã lắp đặt'},{value:'TRONG_KHO',label:'Trong kho'},{value:'DA_THU_HOI',label:'Đã thu hồi'},{value:'BAO_THUONG_BAO_TRI',label:'Đang bảo trì'}]},{key:'from',label:'Ngày lắp đặt · từ',type:'date',defaultValue:'',value:dateFrom,onChange:setDateFrom},{key:'to',label:'Ngày lắp đặt · đến',type:'date',defaultValue:'',value:dateTo,onChange:setDateTo}]} quick={[{value:'ALL',label:'Tất cả'},{value:'STOCK',label:'Trong kho'},{value:'PENDING',label:'Chờ sửa'},{value:'RETURN',label:'Chờ trả'},{value:'OVERDUE',label:'Quá hạn'}]} quickValue={quickFilter} onQuick={setQuickFilter} onReset={() => { setSearchTerm(''); setModelFilter('ALL'); setStatusFilter('ALL'); setQuickFilter('ALL'); setProvinceFilter('ALL'); setOwnerFilter('ALL'); setDateFrom(''); setDateTo(''); }}/>}

      {scanError && <p role="alert" className="resource-error">{scanError}</p>}
      {linkIssues.length > 0 && <details className="resource-error"><summary>Kiểm tra liên kết thiết bị: {linkIssues.length} điểm cần đối chiếu</summary><p>Thiết bị đã được bộ máy tham chiếu không được tính lại vào tồn kho. Hãy đối chiếu hồ sơ thực tế trước khi sửa liên kết.</p><ol>{linkIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ol></details>}
      {/* 📦 BẢNG TỔNG HỢP TỒN KHO THIẾT BỊ HIỆN TẠI */}
      <div className="glass-panel" style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.85) 100%)', border: '1px solid rgba(56,189,248,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <span>📦 Thống Kê Tồn Kho Thiết Bị Hiện Tại (Sẵn Sàng Cấp Phát)</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Thiết bị tự do được quy đổi theo công thức: 1 máy chiết + 1 máy lắc + 1 máy tính + 1 máy in = 1 bộ máy
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className="badge badge-info" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
              ● Sẵn sàng: {stockBundleSummary.totalReadySets} bộ máy · Lẻ: {looseInventoryGroups.reduce((total, group) => total + group.items.length, 0)} thiết bị
            </span>
          </div>
        </div>

        {/* 5 Stock Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          
          {/* 1. Máy Chiết Tồn Kho */}
          <div 
            className="glass-panel glass-panel-hover" 
            style={{ padding: '14px', cursor: 'pointer', borderTop: '3px solid #ec4899', background: activeSubTab === 'dispensers' ? 'rgba(236,72,153,0.12)' : 'rgba(15,23,42,0.6)' }}
            onClick={() => { setActiveSubTab('dispensers'); setStatusFilter('ALL'); }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Máy Chiết Trong Kho</span>
              <Flame size={18} color="#ec4899" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#ec4899', lineHeight: 1 }}>
              {stockDispensers.length} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>máy</span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-main)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
              {Object.keys(dispenserStockBreakdown).length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>Hết máy chiết tồn kho</span>
              ) : (
                Object.entries(dispenserStockBreakdown).map(([model, qty]) => (
                  <div key={model} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>• {model}:</span>
                    <strong style={{ color: '#fff' }}>{qty} cái</strong>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 2. Máy Lắc Tồn Kho */}
          <div 
            className="glass-panel glass-panel-hover" 
            style={{ padding: '14px', cursor: 'pointer', borderTop: '3px solid #38bdf8', background: activeSubTab === 'mixers' ? 'rgba(56,189,248,0.12)' : 'rgba(15,23,42,0.6)' }}
            onClick={() => { setActiveSubTab('mixers'); setStatusFilter('ALL'); }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Máy Lắc Trong Kho</span>
              <Cpu size={18} color="#38bdf8" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#38bdf8', lineHeight: 1 }}>
              {stockMixers.length} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>máy</span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-main)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
              {Object.keys(mixerStockBreakdown).length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>Hết máy lắc tồn kho</span>
              ) : (
                Object.entries(mixerStockBreakdown).map(([model, qty]) => (
                  <div key={model} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>• {model}:</span>
                    <strong style={{ color: '#fff' }}>{qty} cái</strong>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 3. Máy Tính Tồn Kho */}
          <div 
            className="glass-panel glass-panel-hover" 
            style={{ padding: '14px', cursor: 'pointer', borderTop: '3px solid #a855f7', background: activeSubTab === 'computers' ? 'rgba(168,85,247,0.12)' : 'rgba(15,23,42,0.6)' }}
            onClick={() => { setActiveSubTab('computers'); setStatusFilter('ALL'); }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Máy Tính Trong Kho</span>
              <Monitor size={18} color="#a855f7" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#a855f7', lineHeight: 1 }}>
              {stockComputers.length} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>bộ</span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-main)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
              {Object.keys(computerStockBreakdown).length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>Hết máy tính tồn kho</span>
              ) : (
                Object.entries(computerStockBreakdown).map(([type, qty]) => (
                  <div key={type} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>• {type}:</span>
                    <strong style={{ color: '#fff' }}>{qty} cái</strong>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 4. Máy In QL700 Tồn Kho */}
          <div 
            className="glass-panel glass-panel-hover" 
            style={{ padding: '14px', cursor: 'pointer', borderTop: '3px solid #10b981', background: activeSubTab === 'printers' ? 'rgba(16,185,129,0.12)' : 'rgba(15,23,42,0.6)' }}
            onClick={() => { setActiveSubTab('printers'); setStatusFilter('ALL'); }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Máy In Trong Kho</span>
              <Printer size={18} color="#10b981" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#10b981', lineHeight: 1 }}>
              {stockPrinters.length} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>máy</span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-main)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
              {Object.keys(printerStockBreakdown).length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>Hết máy in tồn kho</span>
              ) : (
                Object.entries(printerStockBreakdown).map(([model, qty]) => (
                  <div key={model} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>• {model}:</span>
                    <strong style={{ color: '#fff' }}>{qty} cái</strong>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 5. Bộ Máy Sẵn Sàng (TRONG_KHO) */}
          <div 
            className="glass-panel glass-panel-hover" 
            style={{ padding: '14px', cursor: 'pointer', borderTop: '3px solid #f59e0b', background: activeSubTab === 'comboSets' ? 'rgba(245,158,11,0.12)' : 'rgba(15,23,42,0.6)' }}
            onClick={() => { setActiveSubTab('comboSets'); setStatusFilter('ALL'); }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Bộ Máy Trong Kho</span>
              <Layers size={18} color="#f59e0b" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#f59e0b', lineHeight: 1 }}>
              {stockBundleSummary.totalReadySets} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>bộ máy</span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-main)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>• Tự quy đổi:</span><strong>{stockBundleSummary.completeFromLooseDevices} bộ</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}><span style={{ color: 'var(--text-muted)' }}>• Đã ghép trong kho:</span><strong>{stockSets.length} bộ</strong></div>
            </div>
          </div>

        </div>
      </div>
      
      {can('qr:scan') && <><div className="filter-scan-actions"><button className="btn btn-secondary" aria-expanded={showManualScan} onClick={()=>setShowManualScan(value=>!value)}>Nhập mã bộ máy</button></div>
      {showManualScan && <form className="machine-serial-form" onSubmit={event => { event.preventDefault(); openScannedCode(scanInput); }}><label>Mã bộ máy<input className="form-input" required maxLength={160} value={scanInput} onChange={event => { setScanInput(event.target.value); setScanError(''); }} placeholder="Nhập hoặc quét mã bộ máy" /></label><button type="button" className="btn btn-secondary" onClick={()=>{setScanError('');setScanTargetField('profile');setShowScanSerialModal(true);}}>Quét mã bộ máy</button><button type="submit" className="btn btn-primary">Mở hồ sơ</button></form>}</>}
      {/* Compact inventory navigation and actions */}
      <section className="glass-panel asset-inventory-toolbar" aria-label="Điều hướng và thao tác kho thiết bị">
        <nav className="asset-inventory-tabs" aria-label="Danh mục thiết bị">
          <button 
            type="button"
            className={`btn ${activeSubTab === 'comboSets' ? 'btn-primary' : 'btn-secondary'} btn-sm asset-inventory-tab`}
            aria-pressed={activeSubTab === 'comboSets'}
            title="Bộ máy pha màu"
            onClick={() => setActiveSubTab('comboSets')}
          >
            <Layers size={16} />
            <span>Bộ máy ({stockBundleSummary.totalReadySets})</span>
          </button>

          <button 
            type="button"
            className={`btn ${activeSubTab === 'dispensers' ? 'btn-primary' : 'btn-secondary'} btn-sm asset-inventory-tab`}
            aria-pressed={activeSubTab === 'dispensers'}
            title="Kho máy chiết"
            onClick={() => setActiveSubTab('dispensers')}
          >
            <Flame size={16} />
            <span>Máy chiết ({dispensers.length})</span>
          </button>

          <button 
            type="button"
            className={`btn ${activeSubTab === 'mixers' ? 'btn-primary' : 'btn-secondary'} btn-sm asset-inventory-tab`}
            aria-pressed={activeSubTab === 'mixers'}
            title="Kho máy lắc"
            onClick={() => setActiveSubTab('mixers')}
          >
            <Cpu size={16} />
            <span>Máy lắc ({mixers.length})</span>
          </button>

          <button 
            type="button"
            className={`btn ${activeSubTab === 'computers' ? 'btn-primary' : 'btn-secondary'} btn-sm asset-inventory-tab`}
            aria-pressed={activeSubTab === 'computers'}
            title="Kho máy tính"
            onClick={() => setActiveSubTab('computers')}
          >
            <Monitor size={16} />
            <span>Máy tính ({computers.length})</span>
          </button>

          <button 
            type="button"
            className={`btn ${activeSubTab === 'printers' ? 'btn-primary' : 'btn-secondary'} btn-sm asset-inventory-tab`}
            aria-pressed={activeSubTab === 'printers'}
            title="Kho máy in QL700"
            onClick={() => setActiveSubTab('printers')}
          >
            <Printer size={16} />
            <span>Máy in QL700 ({printers.length})</span>
          </button>
        </nav>

        <div className="asset-inventory-actions">
          {activeSubTab !== 'comboSets' && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={exportCurrentInventory}><FileSpreadsheet size={16} /><span>Xuất Excel</span></button>
              <button type="button" className="btn btn-secondary btn-sm asset-import-action"
                onClick={() => {
                  const typeMap = { dispensers: 'dispenser', mixers: 'mixer', computers: 'computer', printers: 'printer' };
                  onOpenImportModal(typeMap[activeSubTab] || 'dispenser');
                }}
              >
                <FileSpreadsheet size={16} />
                <span>Nhập Excel</span>
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleOpenAddDevice(activeSubTab.slice(0, -1))}>
                <PlusCircle size={16} />
                <span>Thêm Thiết Bị Lẻ Vào Kho</span>
              </button>
            </>
          )}

          {activeSubTab === 'comboSets' && (
            <><button type="button" className="btn btn-secondary btn-sm" onClick={exportCurrentInventory}><FileSpreadsheet size={16} /><span>Xuất bộ máy</span></button><button type="button" className="btn btn-secondary btn-sm asset-import-action" onClick={() => onOpenImportModal('systemSet')}><FileSpreadsheet size={16} /><span>Nhập bộ máy</span></button><button type="button" className="btn btn-primary btn-sm asset-primary-action" onClick={handleOpenAssembleModal}><PlusCircle size={16} /><span>Ghép bộ mới</span></button></>
          )}
        </div>
      </section>

      <AssetInventoryTables onResetFilters={() => { setSearchTerm(''); setStatusFilter('ALL'); setModelFilter('ALL'); setQuickFilter('ALL'); setProvinceFilter('ALL'); setOwnerFilter('ALL'); setDateFrom(''); setDateTo(''); }} activeSubTab={activeSubTab} computers={computers} dispensers={dispensers} filteredSets={filteredSets} getAssignedInfo={getAssignedInfo} getPaginatedList={getPaginatedList} getSetPhotos={getSetPhotos} handleDeleteDevice={handleDeleteDevice} handleDeleteSet={handleDeleteSet} handleOpenEditDevice={handleOpenEditDevice} handleOpenEditSet={handleOpenEditSet} incompleteSystemSets={incompleteSystemSets} looseInventoryGroups={looseInventoryGroups} mixers={mixers} printers={printers} renderDeviceFilterBar={renderDeviceFilterBar} renderIssuedSerial={renderIssuedSerial} renderPaginationBar={renderPaginationBar} setSelectedPhotoViewer={setSelectedPhotoViewer} setSelectedSetDetails={setSelectedSetDetails} sortedComputers={sortedComputers} sortedDispensers={sortedDispensers} sortedMixers={sortedMixers} sortedPrinters={sortedPrinters} stockBundleSummary={stockBundleSummary} stockSets={stockSets} hasNextPage={hasNextPage} loadNextPage={loadNextPage} onRequestRepair={onRequestRepair} canCreateRepair={can('repair:create')} />

      <Suspense fallback={null}>
        {showAddDeviceModal && <StockDeviceDialog addDeviceCategory={addDeviceCategory} addFormData={addFormData} closeStockEditor={closeStockEditor} handleAddDeviceSubmit={handleAddDeviceSubmit} isSavingDevice={isSavingDevice} modelOptions={modelOptions} setAddFormData={setAddFormData} setScanTargetField={setScanTargetField} setShowScanSerialModal={setShowScanSerialModal} showAddDeviceModal={showAddDeviceModal} stockDraft={stockDraft} />}
        {editingDevice && <DeviceEditDialog closeDeviceEditor={closeDeviceEditor} deviceDraft={deviceDraft} editFormData={editFormData} editingDevice={editingDevice} handleEditSubmit={handleEditSubmit} isSavingDevice={isSavingDevice} modelOptions={modelOptions} selectedSetDetails={selectedSetDetails} setEditFormData={setEditFormData} setScanTargetField={setScanTargetField} setShowScanSerialModal={setShowScanSerialModal} systemSets={systemSets} />}
        {showAssembleModal && <AssemblyDialog assembling={assembling} assemblyDraft={assemblyDraft} assemblyError={assemblyError} closeAssembly={closeAssembly} computers={computers} dispensers={dispensers} existingNppSets={existingNppSets} handleAssembleSubmit={handleAssembleSubmit} handleOpenAddDevice={handleOpenAddDevice} handleRemoveNewSetPhoto={handleRemoveNewSetPhoto} handleUploadNewSetPhotos={handleUploadNewSetPhotos} isMissingSerial={isMissingSerial} mixers={mixers} naturalSortCode={naturalSortCode} newSetData={newSetData} nppSearchTerm={nppSearchTerm} npps={npps} printers={printers} qcUsers={qcUsers} setNewSetData={setNewSetData} setNppSearchTerm={setNppSearchTerm} setSelectedPhotoViewer={setSelectedPhotoViewer} setShowAssembleModal={setShowAssembleModal} showAssembleModal={showAssembleModal} />}
        {editingSet && <SystemSetEditDialog closeSetEditor={closeSetEditor} editNppSearchTerm={editNppSearchTerm} editSetFormData={editSetFormData} editingSet={editingSet} handleEditSetSubmit={handleEditSetSubmit} handleRemoveEditSetPhoto={handleRemoveEditSetPhoto} handleUploadEditSetPhotos={handleUploadEditSetPhotos} isSavingDevice={isSavingDevice} npps={npps} qcUsers={qcUsers} selectedSetDetails={selectedSetDetails} setDraft={setDraft} setEditNppSearchTerm={setEditNppSearchTerm} setEditSetFormData={setEditSetFormData} setSaving={setSaving} setSelectedPhotoViewer={setSelectedPhotoViewer} />}
        {selectedPhotoViewer && <AssetPhotoLightbox selectedPhotoViewer={selectedPhotoViewer} setSelectedPhotoViewer={setSelectedPhotoViewer} />}
        {selectedSetDetails && !editingDevice && !editingSet && !replacement && <MachineProfileDialog can={can} computers={computers} dispensers={dispensers} editingDevice={editingDevice} editingSet={editingSet} getSetPhotos={getSetPhotos} handleOpenEditDevice={handleOpenEditDevice} handleOpenEditSet={handleOpenEditSet} machineProfile={machineProfile} mixers={mixers} onReplaceEquipment={onReplaceEquipment} onRequestMaintenance={onRequestMaintenance} onRequestRepair={onRequestRepair} printers={printers} profileTab={profileTab} replacement={replacement} replacementEvents={replacementEvents} replacementHistoryError={replacementHistoryError} selectedSetDetails={selectedSetDetails} setProfileTab={setProfileTab} setReplacement={setReplacement} setSelectedPhotoViewer={setSelectedPhotoViewer} setSelectedSetDetails={setSelectedSetDetails} systemSets={systemSets} user={user} />}
        {selectedDeviceLookup && <DeviceLookupDialog category={selectedDeviceLookup.category} device={selectedDeviceLookup.device} assignedSet={selectedDeviceLookup.assignedSet} onClose={() => setSelectedDeviceLookup(null)} onOpenMachine={machine => { setSelectedDeviceLookup(null); setProfileTab('equipment'); setSelectedSetDetails(machine); }} />}
      </Suspense>

      {/* QR & BARCODE CAMERA SCANNER MODAL */}
      {showScanSerialModal && (
        <Suspense fallback={<div className="modal-overlay" role="status">Đang tải máy quét…</div>}><QrScannerModal
          title={scanTargetField === 'profile' ? 'Quét serial thiết bị / mã bộ máy' : undefined}
          errorMessage={scanTargetField === 'profile' ? scanError : ''}
          onScanSuccess={(scannedText) => {
            let accepted = true;
            if (scanTargetField === 'profile') { accepted = openScannedCode(scannedText); } else if (scanTargetField === 'add') {
              setAddFormData(prev => ({ ...prev, serial: scannedText }));
            } else if (scanTargetField === 'edit') {
              setEditFormData(prev => ({ ...prev, serial: scannedText }));
            }
            if (accepted) setShowScanSerialModal(false);
          }}
          onClose={() => setShowScanSerialModal(false)}
        /></Suspense>
      )}

      {can('asset:create') && <FloatingActionButton icon={PlusCircle} label={activeSubTab === 'comboSets' ? 'Ghép bộ máy' : 'Thêm thiết bị'} onClick={() => activeSubTab === 'comboSets' ? handleOpenAssembleModal() : handleOpenAddDevice(activeSubTab.slice(0, -1))} />}

    </div>
  );
}

===END src/modules/equipment/components/AssetManagement.jsx===
===FILE tests/inventorySummary.test.mjs===
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeInventory, nextWarehouseId, inventoryLinkIssues } from '../src/modules/equipment/lib/inventorySummary.js';

test('withdrawn machine snapshots do not reserve returned physical inventory', () => {
  const systemSets = [{ setCode: 'RETURNED', status: 'DA_THU_HOI', dispenserId: null, mixerId: null, computerId: null, printerId: null, dispenserSerial: 'HISTORY' }];
  const devices = Object.fromEntries(['dispensers','mixers','computers','printers'].map(table => [table,[{id:table,isAssigned:false,setCode:null}]]));
  const result = summarizeInventory({systemSets,...devices});
  for (const table of Object.keys(devices)) assert.equal(result.stock[table].length,1);
  assert.equal(result.stockSets.length,0);
  assert.equal(result.totalReadySets,1);
  assert.deepEqual(inventoryLinkIssues({systemSets,...devices}),[]);
});

test('dashboard and warehouse include equivalent loose sets without double counting assembled stock', () => {
  const devices = Object.fromEntries(['dispensers', 'mixers', 'computers', 'printers'].map(table => [table, Array.from({ length: 23 }, (_, i) => ({ id: `${table}-${i}` }))]));
  const inventory = summarizeInventory({ ...devices, systemSets: [{ setCode: 'S1', status: 'TRONG_KHO' }, { setCode: 'S2', status: 'DA_LAP_DAT' }] });
  assert.equal(inventory.totalReadySets, 24);
  assert.equal(inventory.totalSets, 25);
  assert.equal(inventory.loose.computers.length, 0);
});

test('explicit set references and either assignment marker exclude equipment from loose stock', () => {
  const inventory = summarizeInventory({ systemSets: [{ computerId: 'C1' }], computers: [{ id: 'C1' }, { id: 'C2', isAssigned: true }, { id: 'C3', setCode: 'S3' }, { id: 'C4' }] });
  assert.deepEqual(inventory.stock.computers.map(row => row.id), ['C4']);
  assert.equal(inventory.totalReadySets, 0);
});

test('new category code uses only that category sequence and preserves its legacy prefixes', () => {
  assert.equal(nextWarehouseId('computer', [{ id: 'COMP-061' }, { id: 'MIXE-076' }, { id: 'COMP-03' }]), 'COMP-001');
  assert.equal(nextWarehouseId('computer', [{ id: 'PC-001' }, { id: 'PRIN-999' }]), 'COMP-002');
  assert.equal(nextWarehouseId('dispenser', [{ id: 'DISP-001' }, { id: 'MIXE-076' }]), 'DISP-002');
  assert.equal(nextWarehouseId('mixer', [{ id: 'MIX-001' }, { id: 'COMP-999' }]), 'MIXE-002');
  assert.equal(nextWarehouseId('printer', [{ id: 'PRIN-001' }, { id: 'COMP-999' }]), 'PRIN-002');
  assert.equal(nextWarehouseId('computer', [{ id: '1000' }, { id: 'unrelated-99999' }]), 'COMP-001');
  assert.equal(nextWarehouseId('computer', [{ id: 'PC-007' }]), 'COMP-001');
  assert.equal(nextWarehouseId('printer'), 'PRIN-001');
  assert.equal(nextWarehouseId('dispenser', [{ id: 'DISP-002' }, { id: 'DISP-003' }]), 'DISP-001');
  assert.throws(() => nextWarehouseId('computer', Array.from({ length: 999 }, (_, index) => ({ id: `COMP-${String(index + 1).padStart(3, '0')}` }))), /numbering limit/);
});

test('audit exposes conflicting links and missing referenced devices without modifying records', () => {
  const data = { systemSets: [{ setCode: 'S1', computerId: 'C1', printerId: 'P1' }], computers: [{ id: 'C1', isAssigned: false }, { id: 'C2', setCode: 'S1' }] };
  const before = JSON.stringify(data);
  const issues = inventoryLinkIssues(data);
  assert.equal(issues.length, 3);
  assert.ok(issues.some(issue => issue.includes('C2') && issue.includes('C1')));
  assert.equal(JSON.stringify(data), before);
});

===END tests/inventorySummary.test.mjs===
===FILE tests/mobileReliability.test.mjs===
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { completedSyncState } from '../src/shared/sync/syncPresentation.js';
import { nextWarehouseId } from '../src/modules/equipment/lib/inventorySummary.js';
import { requireReplaySession } from '../src/shared/security/replaySession.js';

test('a suspended auth lock times out before any queued write is allowed', async () => {
  let continued = false;
  const client = { auth: { getUser: () => new Promise(() => {}) }, rpc: () => { continued = true; } };
  await assert.rejects(requireReplaySession(client, 'owner', () => 'owner', async () => ({}), 5), { code: 'AUTH_RESPONSE_TIMEOUT' });
  assert.equal(continued, false);
});

test('deferred, review and session failures always leave the syncing presentation', () => {
  assert.deepEqual(completedSyncState(true, 0), { state: 'idle', message: '' });
  for (const [success, remaining] of [[false, 3], [false, 0], [true, 2]]) {
    const state = completedSyncState(success, remaining);
    assert.equal(state.state, 'error');
    assert.ok(state.message);
  }
  assert.equal(completedSyncState(false, 2, 'Session rejected').message, 'Session rejected');
});

test('computer code allocation reuses the lowest available value in a sparse sequence', () => {
  const renamed = Array.from({ length: 16 }, (_, index) => ({ id: `COMP-${String(index + 87).padStart(3, '0')}` }));
  assert.equal(nextWarehouseId('computer', [{ id: 'COMP-001' }, ...renamed]), 'COMP-002');
});

test('assembly acknowledgement uses the real set primary key and preserves blank serials', async () => {
  const hook = await readFile(new URL('../src/modules/equipment/hooks/useAssets.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app/App.jsx', import.meta.url), 'utf8');
  assert.match(hook, /rpc\('assemble_system_set_atomic'/);
  assert.match(hook, /result.data\.setCode !== setCode/);
  assert.doesNotMatch(hook, /select\('id,set_code'\)/);
  for (const device of ['disp', 'mix', 'prn']) assert.ok(app.includes(`${device}?.serial || ''`));
});
