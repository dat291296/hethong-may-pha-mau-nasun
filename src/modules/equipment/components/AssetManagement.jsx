import { pageWindow } from '../../../shared/data-access/pageWindow.js';
import { filterAssetSets, filterAssetDevices, indexRepairStatuses } from '../lib/assetFilters.js';
import AssetInventoryTables from './AssetInventoryTables.jsx';
import StockDeviceDialog from './StockDeviceDialog.jsx';
import DeviceEditDialog from './DeviceEditDialog.jsx';
import AssemblyDialog from './AssemblyDialog.jsx';
import SystemSetEditDialog from './SystemSetEditDialog.jsx';
import AssetPhotoLightbox from './AssetPhotoLightbox.jsx';
import MachineProfileDialog from './MachineProfileDialog.jsx';
import { userErrorMessage } from '../../../shared/security/userError.js';
import { assignedSetsForNpp, assertAdditionalSetConfirmed } from '../lib/assemblyGuard.js';
import { isUnknownSerial } from '../lib/deviceSerial.js';
import { summarizeInventory, nextWarehouseId, inventoryLinkIssues } from '../lib/inventorySummary.js';
import { prepareDeviceEdit, requireUniqueDeviceSerial } from '../lib/deviceEdit.js';
import WorkspaceFilterBar from '../../../shared/components/WorkspaceFilterBar.jsx';
import { uniqueOptions, canEditRegion } from '../../../shared/workspace/workspaceFilters.js';
import { resolveMachine, resolveMachineCode } from '../lib/machineWorkspace';
import { resolveMachineProfile, sameMachine } from '../lib/machineProfile.js';
import { recordOperationalError } from '../../../shared/diagnostics/operationalDiagnostics.js';
import { useFormDraft } from '../../../shared/hooks/useFormDraft.js';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../shared/context/AuthContext.jsx';
import { supabase, isSupabaseConfigured } from '../../../shared/data-access/supabase.js';
import { generateNextSetCode } from '../hooks/useAssets.js';
import { Cpu, Flame, Monitor, Printer, PlusCircle, Layers, FileSpreadsheet } from 'lucide-react';
import { compressImage } from '../../../shared/utils/imageCompressor.js';
import QrScannerModal from '../../../shared/components/QrScannerModal';
import { useModalScrollLock } from '../../../shared/hooks/useModalScrollLock.js';
import { exportExcel } from '../../../shared/utils/excelExport.js';
import { getSystemSetMissingFields } from '../utils/systemSetValidation.js';
import { useWorkspaceState, useWorkspaceScroll } from '../../../shared/hooks/useWorkspaceState';

export default function AssetManagement({ onReplaceEquipment,replacementEvents=[],replacementHistoryError='', initialProfile, onProfileRestored, globalSearch = '', initialFilter = 'ALL', repairTickets = [], auditLogs = [], onRequestRepair, onRequestMaintenance,
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
  const [showAssembleModal, setShowAssembleModal] = useState(false);
  const [showScanSerialModal, setShowScanSerialModal] = useState(false);
  const [scanTargetField, setScanTargetField] = useState('add');
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
  const initialQuickFilter = React.useRef(quickFilter);
  useEffect(() => { if (initialQuickFilter.current === quickFilter) return; initialQuickFilter.current = quickFilter; setCurrentPage(1); }, [quickFilter, setCurrentPage]);
  useEffect(() => {
    if (!globalSearch) { openedSearch.current = ''; return; }
    if (openedSearch.current === globalSearch) return;
    const machine = resolveMachine(systemSets, globalSearch);
    if (machine) { openedSearch.current = globalSearch; setSelectedSetDetails(machine); }
  }, [globalSearch, systemSets]);

  const openScannedMachine = value => {
    const code = String(value || '').trim();
    setScanInput(code);
    const machine = resolveMachineCode(systemSets, code);
    if (!machine) { setScanError('Không tìm thấy bộ máy duy nhất. Hãy quét hoặc nhập đúng mã bộ máy.'); return; }
    setScanInput(machine.setCode);
    setScanError('');
    setSelectedSetDetails(machine);
  };

  // Device Edit Modal state
  const [isSavingDevice, setIsSavingDevice] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null); // { category: 'dispenser'|'mixer'|'computer'|'printer', data }
  const [editFormData, setEditFormData] = useState({});

  // New Device Add Modal state
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [addDeviceCategory, setAddDeviceCategory] = useState('dispenser');

  // Auto scroll lock & reset position when any modal opens
  useModalScrollLock(showAssembleModal || !!editingSet || !!editingDevice || showAddDeviceModal || !!selectedPhotoViewer || !!selectedSetDetails || !!replacement);

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
    installationPhotos: []
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
      installationPhotos: []
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
    if (missingSerialDevices.length > 0 && !window.confirm(`⚠️ CẢNH BÁO SERI\n\n${missingSerialDevices.map(item => `• ${item.label}`).join('\n')} chưa có số seri. Khi ghép xong, thiết bị sẽ được đánh dấu nổi bật trong danh mục đã cấp phát.\n\nBạn vẫn muốn ghép bộ máy?`)) {
      return;
    }
    assemblingRef.current=true;setAssembling(true);
    try {
    await onAssembleSet(newSetData);
    await assemblyDraft.clear();
    setShowAssembleModal(false);
    setNewSetData({
      dispenserId: '', mixerId: '', computerId: '', printerId: '',
      nppId: '', nppName: '', region: '', province: '', salesperson: '',
      technician: '', installationPhotos: []
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
      alert(finalData.serial ? '✅ Đã lưu thông tin chỉnh sửa thành công!' : 'Đã lưu thiết bị. ⚠️ Chưa có serial; cần kỹ thuật viên phụ trách khu vực bổ sung trong hồ sơ máy.');
      setEditingDevice(null);
    } catch (err) {
      recordOperationalError('device',err);
      console.error('[Device] Save failed without payload');
      alert('⚠️ ' + (userErrorMessage(err) || 'Không lưu được thiết bị. Giữ nội dung đang nhập và thử lại.'));
    } finally {
      setIsSavingDevice(false);
    }
  };

  const handleDeleteDevice = (category, item) => {
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
      if (window.confirm(`⚠️ [CẢNH BÁO ADMIN]\n${catLabel} [${item.id || item.model}] đang được gán trong bộ máy [${item.setCode}]${nppText}.\n\nBạn có chắc chắn muốn XÓA THIẾT BỊ NÀY khỏi hệ thống không?\n(Hệ thống sẽ tự động gỡ/giải phóng thiết bị khỏi bộ máy ${item.setCode}).`)) {
        onDeleteDevice(category, item.id, item.setCode);
      }
    } else {
      if (window.confirm(`Bạn có chắc chắn muốn xóa ${catLabel} [${item.id || item.model}] khỏi kho?`)) {
        onDeleteDevice(category, item.id, null);
      }
    }
  };

  const handleAddDeviceSubmit = async (e) => {
    e.preventDefault();
    if(stockSavingRef.current || stockDraft.existing)return;
    if (!addFormData.id) {
      alert('Chưa tạo được mã quản lý. Vui lòng tải lại kho rồi thử lại.');
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
      stabilizer: set.stabilizer || 'Không dùng ổn áp',
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
      const result=await onEditSet(editingSet.setCode, editSetFormData);
      await setDraft.clear().catch(()=>console.warn('[SystemSet] Draft cleanup failed'));
      alert(result?.queued?'Đã lưu trên thiết bị, chờ đồng bộ.':'Đã lưu thông tin bộ máy.');
      setEditingSet(null);
    } catch (err) {
      console.error('Lỗi khi lưu bộ máy:', err);
      alert(userErrorMessage(err) || 'Không thể lưu bộ máy. Giữ bản nháp để đối chiếu.');
    } finally {setSavingRef.current=false;setSetSaving(false);}
  };

  const handleDeleteSet = async (setCode) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa bộ máy [${setCode}] không? Các thiết bị liên kết sẽ tự động được giải phóng và đưa lại về kho lẻ.`)) {
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

  const renderDeviceFilterBar = (categoryName, totalCount, isComputer = false) => {
    const rows = categoryName === 'Máy Chiết' ? sortedDispensers : categoryName === 'Máy Lắc' ? sortedMixers : isComputer ? sortedComputers : sortedPrinters;
    return <WorkspaceFilterBar search={searchTerm} onSearch={setSearchTerm} placeholder={`Tìm ${categoryName.toLocaleLowerCase('vi')}, mã, seri…`} count={rows.length} fields={[{key:'status',label:'Tình trạng',value:statusFilter,onChange:setStatusFilter,options:uniqueOptions(['NEW','UPDATED','ASSIGNED','FREE','Mới 100%','Đang chạy tốt','Cần bảo trì',...(isComputer ? ['DOI_TRA_MOI','DOI_TRA_CU'] : [])]).map(option=>({...option,label:({NEW:'Mới thêm',UPDATED:'Mới chỉnh sửa',ASSIGNED:'Đã gán bộ máy',FREE:'Tự do trong kho',DOI_TRA_MOI:'Đã đổi trả máy mới',DOI_TRA_CU:'Đổi trả máy cũ'})[option.value] || option.label}))},{key:'sort',label:'Sắp xếp',defaultValue:'DEFAULT',allLabel:'Mã quản lý (A–Z)',value:deviceSort,onChange:setDeviceSort,options:[{value:'NEWEST',label:'Mới cập nhật'}]}]} onReset={()=>{setSearchTerm('');setStatusFilter('ALL');setDeviceSort('DEFAULT');}}/>;
  };

  const getPaginatedList = (list) => {
    const window = pageWindow(list.length, currentPage, pageSize);
    return list.slice(window.start, window.end);
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
    <div className="workspace-screen assetmanagement-screen" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      

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
      
      <div className="filter-scan-actions"><button className="btn btn-secondary" aria-expanded={showManualScan} onClick={()=>setShowManualScan(value=>!value)}>Nhập mã bộ máy</button></div>
      {showManualScan && <form className="machine-serial-form" onSubmit={event => { event.preventDefault(); openScannedMachine(scanInput); }}><label>Mã bộ máy<input className="form-input" required maxLength={160} value={scanInput} onChange={event => { setScanInput(event.target.value); setScanError(''); }} placeholder="Nhập hoặc quét mã bộ máy" /></label><button type="button" className="btn btn-secondary" onClick={()=>{setScanTargetField('profile');setShowScanSerialModal(true);}}>Quét mã bộ máy</button><button type="submit" className="btn btn-primary">Mở hồ sơ</button></form>}
      {/* Sub-Tab Navigation Header */}
      <div className="glass-panel" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            className={`btn ${activeSubTab === 'comboSets' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('comboSets')}
          >
            <Layers size={16} />
            <span>Bộ Máy Pha Màu ({stockBundleSummary.totalReadySets})</span>
          </button>

          <button 
            className={`btn ${activeSubTab === 'dispensers' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('dispensers')}
          >
            <Flame size={16} />
            <span>Kho Máy Chiết ({dispensers.length})</span>
          </button>

          <button 
            className={`btn ${activeSubTab === 'mixers' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('mixers')}
          >
            <Cpu size={16} />
            <span>Kho Máy Lắc ({mixers.length})</span>
          </button>

          <button 
            className={`btn ${activeSubTab === 'computers' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('computers')}
          >
            <Monitor size={16} />
            <span>Kho Máy Tính ({computers.length})</span>
          </button>

          <button 
            className={`btn ${activeSubTab === 'printers' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('printers')}
          >
            <Printer size={16} />
            <span>Kho Máy In QL700 ({printers.length})</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {activeSubTab !== 'comboSets' && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={exportCurrentInventory}><FileSpreadsheet size={16} /><span>📤 Xuất Excel</span></button>
              <button className="btn btn-secondary btn-sm" style={{ borderColor: 'rgba(16,185,129,0.4)', color: 'var(--accent-emerald)' }}
                onClick={() => {
                  const typeMap = { dispensers: 'dispenser', mixers: 'mixer', computers: 'computer', printers: 'printer' };
                  onOpenImportModal(typeMap[activeSubTab] || 'dispenser');
                }}
              >
                <FileSpreadsheet size={16} />
                <span>📥 Import Từ Excel</span>
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleOpenAddDevice(activeSubTab.slice(0, -1))}>
                <PlusCircle size={16} />
                <span>Thêm Thiết Bị Lẻ Vào Kho</span>
              </button>
            </>
          )}

          {activeSubTab === 'comboSets' && (
            <><button className="btn btn-secondary btn-sm" onClick={exportCurrentInventory}><FileSpreadsheet size={16} /><span>📤 Xuất Bộ Máy</span></button><button className="btn btn-secondary btn-sm" style={{ borderColor: 'rgba(16,185,129,0.4)', color: 'var(--accent-emerald)' }} onClick={() => onOpenImportModal('systemSet')}><FileSpreadsheet size={16} /><span>📥 Nhập Bộ Máy</span></button><button className="btn btn-primary" onClick={handleOpenAssembleModal}><PlusCircle size={18} /><span>+ Ghép Bộ Thiết Bị Mới (Combo)</span></button></>
          )}
        </div>
      </div>

      <AssetInventoryTables onResetFilters={() => { setSearchTerm(''); setStatusFilter('ALL'); setModelFilter('ALL'); setQuickFilter('ALL'); setProvinceFilter('ALL'); setOwnerFilter('ALL'); setDateFrom(''); setDateTo(''); }} activeSubTab={activeSubTab} computers={computers} dispensers={dispensers} filteredSets={filteredSets} getAssignedInfo={getAssignedInfo} getPaginatedList={getPaginatedList} getSetPhotos={getSetPhotos} handleDeleteDevice={handleDeleteDevice} handleDeleteSet={handleDeleteSet} handleOpenEditDevice={handleOpenEditDevice} handleOpenEditSet={handleOpenEditSet} incompleteSystemSets={incompleteSystemSets} looseInventoryGroups={looseInventoryGroups} mixers={mixers} printers={printers} renderDeviceFilterBar={renderDeviceFilterBar} renderIssuedSerial={renderIssuedSerial} renderPaginationBar={renderPaginationBar} setSelectedPhotoViewer={setSelectedPhotoViewer} setSelectedSetDetails={setSelectedSetDetails} sortedComputers={sortedComputers} sortedDispensers={sortedDispensers} sortedMixers={sortedMixers} sortedPrinters={sortedPrinters} stockBundleSummary={stockBundleSummary} stockSets={stockSets} />

      <StockDeviceDialog addDeviceCategory={addDeviceCategory} addFormData={addFormData} closeStockEditor={closeStockEditor} handleAddDeviceSubmit={handleAddDeviceSubmit} isSavingDevice={isSavingDevice} modelOptions={modelOptions} setAddFormData={setAddFormData} setScanTargetField={setScanTargetField} setShowScanSerialModal={setShowScanSerialModal} showAddDeviceModal={showAddDeviceModal} stockDraft={stockDraft} />

      <DeviceEditDialog closeDeviceEditor={closeDeviceEditor} deviceDraft={deviceDraft} editFormData={editFormData} editingDevice={editingDevice} handleEditSubmit={handleEditSubmit} isSavingDevice={isSavingDevice} modelOptions={modelOptions} selectedSetDetails={selectedSetDetails} setEditFormData={setEditFormData} setScanTargetField={setScanTargetField} setShowScanSerialModal={setShowScanSerialModal} systemSets={systemSets} />

      <AssemblyDialog assembling={assembling} assemblyDraft={assemblyDraft} assemblyError={assemblyError} closeAssembly={closeAssembly} computers={computers} dispensers={dispensers} existingNppSets={existingNppSets} handleAssembleSubmit={handleAssembleSubmit} handleOpenAddDevice={handleOpenAddDevice} handleRemoveNewSetPhoto={handleRemoveNewSetPhoto} handleUploadNewSetPhotos={handleUploadNewSetPhotos} isMissingSerial={isMissingSerial} mixers={mixers} naturalSortCode={naturalSortCode} newSetData={newSetData} nppSearchTerm={nppSearchTerm} npps={npps} printers={printers} qcUsers={qcUsers} setNewSetData={setNewSetData} setNppSearchTerm={setNppSearchTerm} setSelectedPhotoViewer={setSelectedPhotoViewer} setShowAssembleModal={setShowAssembleModal} showAssembleModal={showAssembleModal} />

      <SystemSetEditDialog closeSetEditor={closeSetEditor} editNppSearchTerm={editNppSearchTerm} editSetFormData={editSetFormData} editingSet={editingSet} handleEditSetSubmit={handleEditSetSubmit} handleRemoveEditSetPhoto={handleRemoveEditSetPhoto} handleUploadEditSetPhotos={handleUploadEditSetPhotos} isSavingDevice={isSavingDevice} npps={npps} qcUsers={qcUsers} selectedSetDetails={selectedSetDetails} setDraft={setDraft} setEditNppSearchTerm={setEditNppSearchTerm} setEditSetFormData={setEditSetFormData} setSaving={setSaving} setSelectedPhotoViewer={setSelectedPhotoViewer} />

      <AssetPhotoLightbox selectedPhotoViewer={selectedPhotoViewer} setSelectedPhotoViewer={setSelectedPhotoViewer} />

      <MachineProfileDialog can={can} computers={computers} dispensers={dispensers} editingDevice={editingDevice} editingSet={editingSet} getSetPhotos={getSetPhotos} handleOpenEditDevice={handleOpenEditDevice} handleOpenEditSet={handleOpenEditSet} machineProfile={machineProfile} mixers={mixers} onReplaceEquipment={onReplaceEquipment} onRequestMaintenance={onRequestMaintenance} onRequestRepair={onRequestRepair} printers={printers} profileTab={profileTab} replacement={replacement} replacementEvents={replacementEvents} replacementHistoryError={replacementHistoryError} selectedSetDetails={selectedSetDetails} setProfileTab={setProfileTab} setReplacement={setReplacement} setSelectedPhotoViewer={setSelectedPhotoViewer} setSelectedSetDetails={setSelectedSetDetails} systemSets={systemSets} user={user} />

      {/* QR & BARCODE CAMERA SCANNER MODAL */}
      {showScanSerialModal && (
        <QrScannerModal
          title={scanTargetField === 'profile' ? 'Quét mã bộ máy' : undefined}
          onScanSuccess={(scannedText) => {
            if (scanTargetField === 'profile') { openScannedMachine(scannedText); } else if (scanTargetField === 'add') {
              setAddFormData(prev => ({ ...prev, serial: scannedText }));
            } else if (scanTargetField === 'edit') {
              setEditFormData(prev => ({ ...prev, serial: scannedText }));
            }
            setShowScanSerialModal(false);
          }}
          onClose={() => setShowScanSerialModal(false)}
        />
      )}

    </div>
  );
}
