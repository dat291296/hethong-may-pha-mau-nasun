import React, { useState, useEffect } from 'react';
import SafePortal from './SafePortal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { generateNextSetCode } from '../hooks/useAssets.js';
import { 
  Cpu, 
  Flame, 
  Monitor, 
  Printer, 
  PlusCircle, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  Layers,
  Edit3,
  Trash2,
  X,
  FileSpreadsheet,
  Camera
} from 'lucide-react';
import QrScannerModal from './QrScannerModal';
import {
  INITIAL_DISPENSERS,
  INITIAL_MIXERS,
  INITIAL_COMPUTERS,
  INITIAL_PRINTERS
} from '../data/mockData';
import { useModalScrollLock } from '../hooks/useModalScrollLock.js';

export default function AssetManagement({
  systemSets,
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
  onExportDevicesExcel,
  isDateLocked = () => false,
  onEditSet,
  onDeleteSet
}) {
  const { user } = useAuth();
  const [qcUsers, setQcUsers] = useState([]);

  // Fetch QC and Admin user profiles for technician selection
  useEffect(() => {
    async function loadQcProfiles() {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, role, managed_region')
            .in('role', ['qc', 'admin']);

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

  const [activeSubTab, setActiveSubTab] = useState('comboSets'); // comboSets | dispensers | mixers | computers | printers
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showAssembleModal, setShowAssembleModal] = useState(false);
  const [showScanSerialModal, setShowScanSerialModal] = useState(false);
  const [scanTargetField, setScanTargetField] = useState('add');
  const [nppSearchTerm, setNppSearchTerm] = useState('');
  const [editNppSearchTerm, setEditNppSearchTerm] = useState('');

  const [deviceSort, setDeviceSort] = useState('DEFAULT'); // 'DEFAULT' | 'NEWEST'

  // Reset pagination on tab or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeSubTab, modelFilter, statusFilter, searchTerm, deviceSort]);

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

  // Device Edit Modal state
  const [editingDevice, setEditingDevice] = useState(null); // { category: 'dispenser'|'mixer'|'computer'|'printer', data }
  const [editFormData, setEditFormData] = useState({});

  // New Device Add Modal state
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [addDeviceCategory, setAddDeviceCategory] = useState('dispenser');

  // Auto scroll lock & reset position when any modal opens
  useModalScrollLock(showAssembleModal || !!editingSet || !!editingDevice || showAddDeviceModal);
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
    technician: user?.name || user?.full_name || ''
  });

  const handleOpenAssembleModal = () => {
    const defaultTech = (user && (user.role === 'qc' || user.role === 'admin')) ? (user.name || user.full_name) : (qcUsers[0]?.name || '');
    const autoCode = generateNextSetCode(systemSets);
    setNppSearchTerm('');
    setNewSetData({
      setCode: autoCode,
      dispenserId: '',
      mixerId: '',
      computerId: '',
      printerId: '',
      nppId: '',
      nppName: '',
      region: '',
      province: '',
      salesperson: '',
      technician: defaultTech
    });
    setShowAssembleModal(true);
  };

  const handleAssembleSubmit = (e) => {
    e.preventDefault();
    if (!newSetData.dispenserId || !newSetData.mixerId || !newSetData.computerId || !newSetData.printerId) {
      alert('Vui lòng chọn đủ 4 thiết bị: 1 Máy Chiết + 1 Máy Lắc + 1 Máy Tính + 1 Máy In QL700!');
      return;
    }
    onAssembleSet(newSetData);
    setShowAssembleModal(false);
    setNewSetData({
      dispenserId: '', mixerId: '', computerId: '', printerId: '',
      nppId: '', nppName: '', region: '', province: '', salesperson: '',
      technician: ''
    });
  };

  const handleOpenAddDevice = (category) => {
    setAddDeviceCategory(category);
    setAddFormData({
      id: '',
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

  const handleOpenEditDevice = (category, data) => {
    setEditingDevice({ category, data });
    const cleanType = category === 'computer' 
      ? (data.type === 'Case' ? 'Case' : 'All In One')
      : (data.type || '');
    setEditFormData({
      ...data,
      type: cleanType,
      model: category === 'computer' ? cleanType : (data.model || ''),
      id: data.id || '',
      isAssigned: data.isAssigned || !!data.setCode,
      setCode: data.setCode || ''
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingDevice) return;
    const isAssigned = !!editFormData.isAssigned && !!editFormData.setCode;
    const cleanType = editingDevice.category === 'computer'
      ? (editFormData.type === 'Case' ? 'Case' : 'All In One')
      : editFormData.type;
    const finalData = {
      ...editFormData,
      type: cleanType,
      model: editingDevice.category === 'computer' ? cleanType : editFormData.model,
      serial: editingDevice.category === 'computer' ? '—' : (editFormData.serial?.trim() || 'N/A'),
      isAssigned,
      setCode: isAssigned ? editFormData.setCode : null
    };
    try {
      await onEditDevice(editingDevice.category, finalData);
      alert('✅ Đã lưu thông tin chỉnh sửa thành công!');
      setEditingDevice(null);
    } catch (err) {
      console.error('Lỗi khi lưu thiết bị:', err);
      alert('⚠️ Có lỗi xảy ra khi lưu thiết bị!');
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

  const handleAddDeviceSubmit = (e) => {
    e.preventDefault();
    if (addDeviceCategory !== 'computer' && !addFormData.serial) {
      alert('Vui lòng nhập Số Seri!');
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
      serial: addDeviceCategory === 'computer' ? '—' : (addFormData.serial?.trim() || 'N/A')
    };
    onAddStockDevice(addDeviceCategory, finalData);
    alert('✅ Đã thêm thiết bị vào kho thành công!');
    setShowAddDeviceModal(false);
  };

  const handleOpenEditSet = (set) => {
    const targetNpp = npps.find(n => n.id === set.nppId);
    setEditNppSearchTerm('');
    setEditingSet(set);
    setEditSetFormData({
      setCode: set.setCode || set.set_code || '',
      nppId: set.nppId || '',
      nppName: set.nppName || '',
      region: set.region || '',
      province: set.province || '',
      status: set.status || 'TRONG_KHO',
      stabilizer: set.stabilizer || 'Không dùng ổn áp',
      technician: set.technician || ((user && (user.role === 'qc' || user.role === 'admin')) ? (user.name || user.full_name) : (qcUsers[0]?.name || '')),
      salesperson: set.salesperson || targetNpp?.salesperson || '',
      notes: set.notes || '',
      lastMaintenanceDate: set.lastMaintenanceDate || '',
      nextMaintenanceDue: set.nextMaintenanceDue || ''
    });
  };

  const handleEditSetSubmit = (e) => {
    e.preventDefault();
    if (!editingSet) return;
    onEditSet(editingSet.setCode, editSetFormData);
    alert('✅ Đã lưu thông tin bộ máy thành công!');
    setEditingSet(null);
  };

  const handleDeleteSet = (setCode) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa bộ máy [${setCode}] không? Các thiết bị liên kết sẽ tự động được giải phóng và đưa lại về kho lẻ.`)) {
      onDeleteSet(setCode);
    }
  };

  const naturalSortCode = (a, b, key = 'id') => {
    const valA = String(a?.[key] || a?.id || a?.setCode || '');
    const valB = String(b?.[key] || b?.id || b?.setCode || '');
    return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
  };

  const filteredSets = [...systemSets]
    .filter(s => {
      const matchesModel = modelFilter === 'ALL' || s.dispenserModel === modelFilter;
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
      const matchesSearch = !searchTerm || (
        (s.setCode && s.setCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.nppName && s.nppName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.dispenserSerial && s.dispenserSerial.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.mixerSerial && s.mixerSerial.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      return matchesModel && matchesStatus && matchesSearch;
    })
    .sort((a, b) => naturalSortCode(a, b, 'setCode'));

  const filterDevice = (list) => {
    return [...list].filter(item => {
      let matchesStatus = true;
      if (statusFilter === 'ALL') {
        matchesStatus = true;
      } else if (statusFilter === 'NEW') {
        matchesStatus = !!item.isNew || item.status === 'Mới 100%';
      } else if (statusFilter === 'UPDATED') {
        matchesStatus = !!item.isUpdated || !!item.updatedAt;
      } else if (statusFilter === 'ASSIGNED') {
        matchesStatus = !!item.isAssigned || !!item.setCode;
      } else if (statusFilter === 'FREE') {
        matchesStatus = !item.isAssigned && !item.setCode;
      } else if (statusFilter === 'DOI_TRA_MOI') {
        matchesStatus = item.status === 'Đã đổi trả máy mới';
      } else if (statusFilter === 'DOI_TRA_CU') {
        matchesStatus = item.status === 'Đổi trả máy cũ' || item.status === 'Đã đổi trả máy cũ';
      } else {
        matchesStatus = item.status === statusFilter;
      }

      const matchesSearch = !searchTerm || (
        (item.id && item.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.model && item.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.serial && item.serial !== '—' && item.serial.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.type && item.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.specs && item.specs.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.os && item.os.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.setCode && item.setCode.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      return matchesStatus && matchesSearch;
    });
  };

  const sortDeviceList = (list) => {
    if (deviceSort === 'NEWEST') {
      return [...list].sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return naturalSortCode(a, b, 'id');
      });
    }
    return [...list].sort((a, b) => naturalSortCode(a, b, 'id'));
  };

  const sortedDispensers = sortDeviceList(filterDevice(dispensers));
  const sortedMixers = sortDeviceList(filterDevice(mixers));
  const sortedComputers = sortDeviceList(filterDevice(computers));
  const sortedPrinters = sortDeviceList(filterDevice(printers));

  const renderDeviceFilterBar = (categoryName, totalCount, isComputer = false) => {
    const newCount = (isComputer ? computers : (categoryName === 'Máy Chiết' ? dispensers : (categoryName === 'Máy Lắc' ? mixers : printers))).filter(i => i.isNew || i.status === 'Mới 100%').length;
    const updatedCount = (isComputer ? computers : (categoryName === 'Máy Chiết' ? dispensers : (categoryName === 'Máy Lắc' ? mixers : printers))).filter(i => i.isUpdated || i.updatedAt).length;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '260px' }}>
          <input
            type="text"
            placeholder={`Tìm ${categoryName} (Mã, hệ máy...)...`}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="form-input"
            style={{ height: '36px', fontSize: '0.825rem', paddingLeft: '32px' }}
          />
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}>🔍</span>
        </div>

        <Filter size={16} color="var(--accent-cyan)" />
        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--accent-cyan)' }}>Lọc Danh Mục:</span>
        <select 
          className="form-select" 
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value)} 
          style={{ height: '36px', fontSize: '0.825rem', minWidth: '180px' }}
        >
          <option value="ALL">Tất Cả Danh Mục ({totalCount})</option>
          <option value="NEW">🆕 Mới thêm ({newCount})</option>
          <option value="UPDATED">✏️ Mới chỉnh sửa ({updatedCount})</option>
          <option value="ASSIGNED">🟢 Đã gán bộ máy</option>
          <option value="FREE">⚪ Tự do trong kho</option>
          <option value="Mới 100%">Mới 100%</option>
          <option value="Đang chạy tốt">Đang chạy tốt</option>
          <option value="Cần bảo trì">Cần bảo trì</option>
          {isComputer && (
            <>
              <option value="DOI_TRA_MOI">🔄 Đã đổi trả máy mới</option>
              <option value="DOI_TRA_CU">🔁 Đổi trả máy cũ</option>
            </>
          )}
        </select>

        <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Sắp xếp:</span>
        <select 
          className="form-select" 
          value={deviceSort} 
          onChange={e => setDeviceSort(e.target.value)} 
          style={{ height: '36px', fontSize: '0.825rem' }}
        >
          <option value="DEFAULT">Mã quản lý (A-Z)</option>
          <option value="NEWEST">Mới cập nhật / thêm gần đây</option>
        </select>

        {(searchTerm || statusFilter !== 'ALL' || deviceSort !== 'DEFAULT') && (
          <button 
            className="btn btn-secondary btn-sm"
            style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)', height: '36px' }}
            onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); setDeviceSort('DEFAULT'); }}
          >
            ✕ Xóa bộ lọc
          </button>
        )}
      </div>
    );
  };

  const getPaginatedList = (list) => {
    const start = (currentPage - 1) * pageSize;
    return list.slice(start, start + pageSize);
  };

  const renderPaginationBar = (totalCount) => {
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalCount);

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
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          >
            ‹ Trang Trước
          </button>
          
          <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--accent-cyan)', padding: '0 8px' }}>
            Trang {currentPage} / {totalPages}
          </span>

          <button 
            className="pagination-btn" 
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
          >
            Trang Sau ›
          </button>
        </div>
      </div>
    );
  };

  // Inventory Stock Calculations (Items not yet assigned to any combo or setCode is null)
  const stockDispensers = React.useMemo(() => (dispensers || []).filter(d => !d.isAssigned && !d.setCode), [dispensers]);
  const stockMixers = React.useMemo(() => (mixers || []).filter(m => !m.isAssigned && !m.setCode), [mixers]);
  const stockComputers = React.useMemo(() => (computers || []).filter(c => !c.isAssigned && !c.setCode), [computers]);
  const stockPrinters = React.useMemo(() => (printers || []).filter(p => !p.isAssigned && !p.setCode), [printers]);
  const stockSets = React.useMemo(() => (systemSets || []).filter(s => s.status === 'TRONG_KHO'), [systemSets]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 📦 BẢNG TỔNG HỢP TỒN KHO THIẾT BỊ HIỆN TẠI */}
      <div className="glass-panel" style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.85) 100%)', border: '1px solid rgba(56,189,248,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <span>📦 Thống Kê Tồn Kho Thiết Bị Hiện Tại (Sẵn Sàng Cấp Phát)</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Bao gồm các thiết bị lẻ lưu kho chưa ghép vào bộ máy và các bộ máy hoàn chỉnh đang nằm trong kho tổng
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className="badge badge-info" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
              ● Tổng: {stockDispensers.length + stockMixers.length + stockComputers.length + stockPrinters.length} thiết bị lẻ + {stockSets.length} bộ máy kho
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
            onClick={() => { setActiveSubTab('comboSets'); setStatusFilter('TRONG_KHO'); }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Bộ Máy Trong Kho</span>
              <Layers size={18} color="#f59e0b" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#f59e0b', lineHeight: 1 }}>
              {stockSets.length} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>bộ máy</span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-main)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>• Tình trạng:</span>
                <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Sẵn sàng lắp mới</span>
              </div>
            </div>
          </div>

        </div>
      </div>
      
      {/* Sub-Tab Navigation Header */}
      <div className="glass-panel" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            className={`btn ${activeSubTab === 'comboSets' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('comboSets')}
          >
            <Layers size={16} />
            <span>Bộ Máy Pha Màu ({systemSets.length})</span>
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
              <button className="btn btn-secondary btn-sm" style={{ borderColor: 'rgba(16,185,129,0.4)', color: 'var(--accent-emerald)' }}
                onClick={() => {
                  const typeMap = { dispensers: 'dispenser', mixers: 'mixer', computers: 'computer', printers: 'printer' };
                  onOpenImportModal(typeMap[activeSubTab] || 'dispenser');
                }}
              >
                <FileSpreadsheet size={16} />
                <span>📥 Import Từ Excel</span>
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setAddDeviceCategory(activeSubTab.slice(0, -1)); setShowAddDeviceModal(true); }}>
                <PlusCircle size={16} />
                <span>Thêm Thiết Bị Lẻ Vào Kho</span>
              </button>
            </>
          )}

          {activeSubTab === 'comboSets' && (
            <button className="btn btn-primary" onClick={handleOpenAssembleModal}>
              <PlusCircle size={18} />
              <span>+ Ghép Bộ Thiết Bị Mới (Combo)</span>
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: COMBO SETS MANAGEMENT */}
      {activeSubTab === 'comboSets' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          
          {/* Filters Bar & Search Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '240px' }}>
              <input
                type="text"
                placeholder="Tìm Mã bộ, NPP, Seri..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="form-input"
                style={{ height: '36px', fontSize: '0.825rem', paddingLeft: '32px' }}
              />
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}>🔍</span>
            </div>

            <Filter size={16} color="var(--text-muted)" />
            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Hệ Máy:</span>
            <select className="form-select" value={modelFilter} onChange={e => setModelFilter(e.target.value)} style={{ height: '36px', fontSize: '0.825rem' }}>
              <option value="ALL">Tất Cả Hệ Máy Chiết</option>
              <option value="Satint A2">Satint A2</option>
              <option value="Hero Eurotint">Hero Eurotint</option>
              <option value="Corob F1">Corob F1</option>
              <option value="Fast & Fluid HA480">Fast & Fluid HA480</option>
            </select>

            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Trạng Thái:</span>
            <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: '36px', fontSize: '0.825rem' }}>
              <option value="ALL">Tất Cả Trạng Thái</option>
              <option value="DA_LAP_DAT">🟢 Đã Lắp Đặt</option>
              <option value="TRONG_KHO">⚪ Trong Kho</option>
              <option value="DA_THU_HOI">🔴 Đã Thu Hồi</option>
              <option value="BAO_THUONG_BAO_TRI">🟡 Đang Bảo Trì</option>
            </select>
          </div>

          {/* Active Filter Chips */}
          {(searchTerm || modelFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <div className="active-filter-chips">
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>Bộ lọc đang chọn:</span>
              {searchTerm && (
                <div className="filter-chip">
                  <span>🔍 "{searchTerm}"</span>
                  <span className="filter-chip-remove" onClick={() => setSearchTerm('')}>✕</span>
                </div>
              )}
              {modelFilter !== 'ALL' && (
                <div className="filter-chip">
                  <span>⚙️ {modelFilter}</span>
                  <span className="filter-chip-remove" onClick={() => setModelFilter('ALL')}>✕</span>
                </div>
              )}
              {statusFilter !== 'ALL' && (
                <div className="filter-chip">
                  <span>⚡ {statusFilter}</span>
                  <span className="filter-chip-remove" onClick={() => setStatusFilter('ALL')}>✕</span>
                </div>
              )}
              <button 
                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { setSearchTerm(''); setModelFilter('ALL'); setStatusFilter('ALL'); }}
              >
                Xóa tất cả bộ lọc
              </button>
            </div>
          )}

          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã Bộ Máy</th>
                  <th>Nhà Phân Phối</th>
                  <th>Máy Chiết (Seri)</th>
                  <th>Máy Lắc (Seri)</th>
                  <th>Máy Tính (Cấu hình)</th>
                  <th>Máy In (Model/Seri)</th>
                  <th>Cán Bộ Phụ Trách</th>
                  <th>Ổn Áp (Ghi Nhận)</th>
                  <th>Trạng Thái</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {getPaginatedList(filteredSets).map(set => {
                  const pcObj = (computers || []).find(c => (set.computerId && c.id === set.computerId) || (set.computerSerial && c.serial === set.computerSerial));
                  const pcSpecsText = pcObj?.specs || set.pcSpecs || (set.pcType ? `${set.pcType} (${set.pcOs || ''})` : set.computerType || 'Core i5 / 16GB / 512GB SSD');
                  const pcSerialText = set.computerSerial || set.pcSerial || pcObj?.serial || 'N/A';

                  const prnObj = (printers || []).find(p => (set.printerId && p.id === set.printerId) || (set.printerSerial && p.serial === set.printerSerial));
                  const printerModelText = prnObj?.model || set.printerModel || 'QL700';
                  const printerSerialText = set.printerSerial || prnObj?.serial || 'N/A';

                  return (
                    <tr key={set.id || set.setCode}>
                      <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{set.setCode}</td>
                      <td style={{ fontWeight: '600' }}>{set.nppName || 'Kho Tổng Trung Tâm'}</td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{set.dispenserModel}</div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.dispenserSerial}</div>
                      </td>
                      <td>
                        <div>{set.mixerModel}</div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.mixerSerial}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{pcSpecsText}</div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <span>💻 {set.computerId || pcObj?.id || 'Máy Tính'}</span>
                          {(pcObj?.status === 'Đã đổi trả máy mới' || set.computerStatus === 'Đã đổi trả máy mới') && (
                            <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>🔄 Đã đổi trả máy mới</span>
                          )}
                          {(pcObj?.status === 'Đổi trả máy cũ' || pcObj?.status === 'Đã đổi trả máy cũ' || set.computerStatus === 'Đổi trả máy cũ' || set.computerStatus === 'Đã đổi trả máy cũ') && (
                            <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>🔁 Đổi trả máy cũ</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{printerModelText}</div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Seri: {printerSerialText}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem', fontWeight: '600' }}>🛠️ {set.technician || 'Chưa gán KTV'}</div>
                        <div style={{ fontSize: '0.775rem', color: 'var(--accent-cyan)', marginTop: '2px' }}>💼 KD: {set.salesperson || 'Chưa gán NVKD'}</div>
                      </td>
                      <td>
                        {set.stabilizer?.includes('Chưa') || set.stabilizer?.includes('Không') ? (
                          <span className="badge badge-warning">⚠️ {set.stabilizer}</span>
                        ) : (
                          <span className="badge badge-success">✓ {set.stabilizer}</span>
                        )}
                      </td>
                      <td>
                        {set.status === 'DA_LAP_DAT' && <span className="badge badge-success">● Đã Lắp Đặt</span>}
                        {set.status === 'TRONG_KHO' && <span className="badge badge-info">● Trong Kho</span>}
                        {set.status === 'DA_THU_HOI' && <span className="badge badge-danger">● Đã Thu Hồi</span>}
                        {set.status === 'BAO_THUONG_BAO_TRI' && <span className="badge badge-warning">● Bảo Trì</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleOpenEditSet(set)}>
                            <Edit3 size={14} color="var(--accent-cyan)" />
                          </button>
                          <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDeleteSet(set.setCode)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only mobile-card-list">
            {getPaginatedList(filteredSets).map(set => {
              const pcObj = (computers || []).find(c => (set.computerId && c.id === set.computerId) || (set.computerSerial && c.serial === set.computerSerial));
              const pcSpecsText = pcObj?.specs || set.pcSpecs || (set.pcType ? `${set.pcType} (${set.pcOs || ''})` : set.computerType || 'Core i5 / 16GB / 512GB SSD');
              const pcSerialText = set.computerSerial || set.pcSerial || pcObj?.serial || 'N/A';

              const prnObj = (printers || []).find(p => (set.printerId && p.id === set.printerId) || (set.printerSerial && p.serial === set.printerSerial));
              const printerModelText = prnObj?.model || set.printerModel || 'QL700';
              const printerSerialText = set.printerSerial || prnObj?.serial || 'N/A';

              return (
                <div className="mobile-card" key={set.id || set.setCode}>
                  <div className="mobile-card-header">
                    <div>
                      <span className="mobile-card-title" style={{ color: 'var(--accent-cyan)' }}>{set.setCode}</span>
                      <div className="mobile-card-subtitle">{set.nppName || 'Kho Tổng Trung Tâm'}</div>
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
                        {pcSpecsText}
                        {(pcObj?.status === 'Đã đổi trả máy mới' || set.computerStatus === 'Đã đổi trả máy mới') && (
                          <span className="badge badge-warning" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🔄 Đã đổi trả máy mới</span>
                        )}
                        {(pcObj?.status === 'Đổi trả máy cũ' || pcObj?.status === 'Đã đổi trả máy cũ' || set.computerStatus === 'Đổi trả máy cũ' || set.computerStatus === 'Đã đổi trả máy cũ') && (
                          <span className="badge badge-purple" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🔁 Đổi trả máy cũ</span>
                        )}
                      </span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Máy In:</span>
                      <span className="mobile-card-value">{printerModelText} (Seri: {printerSerialText})</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Cán bộ phụ trách:</span>
                      <span className="mobile-card-value">🛠️ KTV: {set.technician || 'Chưa gán'} | 💼 KD: {set.salesperson || 'Chưa gán'}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Ổn Áp:</span>
                      <span className="mobile-card-value">{set.stabilizer}</span>
                    </div>
                  </div>
                  <div className="mobile-card-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditSet(set)}>
                      <Edit3 size={14} color="var(--accent-cyan)" />
                      <span>Sửa</span>
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteSet(set.setCode)}>
                      <Trash2 size={14} />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Footer */}
          {renderPaginationBar(filteredSets.length)}
        </div>
      )}

      {/* VIEW 2: RAW DISPENSERS STOCK */}
      {activeSubTab === 'dispensers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '10px' }}>Danh Mục Máy Chiết (Kho & Đã Cấp Phát)</h3>
            {renderDeviceFilterBar('Máy Chiết', dispensers.length, false)}
          </div>
          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã QL</th>
                  <th>Hệ Máy / Model</th>
                  <th>Số Seri (Unique)</th>
                  <th>Tình Trạng Kỹ Thuật</th>
                  <th>Tình Trạng Cấp Phát</th>
                  <th>Mã Bộ Máy Gắn Vào</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {getPaginatedList(sortedDispensers).map(item => (
                  <tr key={item.id}>
                    <td>
                      <span style={{ fontWeight: '700' }}>{item.id}</span>
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                      {item.isUpdated && <span className="badge badge-info" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>✏️ Đã sửa</span>}
                    </td>
                    <td style={{ fontWeight: '700' }}>{item.model}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{item.serial}</td>
                    <td>
                      {item.status === 'Mới 100%' && <span className="badge badge-success">{item.status}</span>}
                      {item.status === 'Đang chạy tốt' && <span className="badge badge-info">{item.status}</span>}
                      {item.status === 'Cần bảo trì' && <span className="badge badge-warning">{item.status}</span>}
                      {item.status === 'Hỏng đầu phun' && <span className="badge badge-danger">⚠️ {item.status}</span>}
                    </td>
                    <td>
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? (
                          <div>
                            <span className="badge badge-success">🟢 Đã gán bộ</span>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--accent-cyan)', marginTop: '2px' }}>{info.setCode}</div>
                            <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>🏢 {info.nppName}</div>
                          </div>
                        ) : (
                          <span className="badge badge-neutral">⚪ Tự do trong kho</span>
                        );
                      })()}
                    </td>
                    <td>{item.setCode || 'Chưa gán'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleOpenEditDevice('dispenser', item)}>
                          <Edit3 size={14} color="var(--accent-cyan)" />
                        </button>
                        <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDeleteDevice('dispenser', item)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only mobile-card-list">
            {getPaginatedList(sortedDispensers).map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">
                      {item.model}
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                      {item.isUpdated && <span className="badge badge-info" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>✏️ Đã sửa</span>}
                    </span>
                    <div className="mobile-card-subtitle">Seri: {item.serial}</div>
                  </div>
                  <div>
                    {item.status === 'Mới 100%' && <span className="badge badge-success">{item.status}</span>}
                    {item.status === 'Đang chạy tốt' && <span className="badge badge-info">{item.status}</span>}
                    {item.status === 'Cần bảo trì' && <span className="badge badge-warning">{item.status}</span>}
                    {item.status === 'Hỏng đầu phun' && <span className="badge badge-danger">⚠️ {item.status}</span>}
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Mã Quản Lý:</span>
                    <span className="mobile-card-value">{item.id}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Trạng thái cấp phát:</span>
                    <span className="mobile-card-value">
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? `🟢 Gán [${info.setCode}] (${info.nppName})` : '⚪ Tự do trong kho';
                      })()}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditDevice('dispenser', item)}>
                    <Edit3 size={14} color="var(--accent-cyan)" />
                    <span>Sửa</span>
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDevice('dispenser', item)}>
                    <Trash2 size={14} />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          {renderPaginationBar(sortedDispensers.length)}
        </div>
      )}

      {/* VIEW 3: RAW MIXERS STOCK */}
      {activeSubTab === 'mixers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '10px' }}>Danh Mục Máy Lắc (Kho & Đã Cấp Phát)</h3>
            {renderDeviceFilterBar('Máy Lắc', mixers.length, false)}
          </div>
          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã QL</th>
                  <th>Hệ Máy</th>
                  <th>Loại Máy Lắc</th>
                  <th>Số Seri (Unique)</th>
                  <th>Tình Trạng Kỹ Thuật</th>
                  <th>Tình Trạng Cấp Phát & NPP</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {getPaginatedList(sortedMixers).map(item => (
                  <tr key={item.id}>
                    <td>
                      <span style={{ fontWeight: '700' }}>{item.id}</span>
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                      {item.isUpdated && <span className="badge badge-info" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>✏️ Đã sửa</span>}
                    </td>
                    <td style={{ fontWeight: '700' }}>{item.model}</td>
                    <td>{item.type}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{item.serial}</td>
                    <td><span className="badge badge-info">{item.status}</span></td>
                    <td>
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? (
                          <div>
                            <span className="badge badge-success">🟢 Đã gán bộ</span>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--accent-cyan)', marginTop: '2px' }}>{info.setCode}</div>
                            <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>🏢 {info.nppName}</div>
                          </div>
                        ) : (
                          <span className="badge badge-neutral">⚪ Tự do trong kho</span>
                        );
                      })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleOpenEditDevice('mixer', item)}>
                          <Edit3 size={14} color="var(--accent-cyan)" />
                        </button>
                        <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDeleteDevice('mixer', item)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only mobile-card-list">
            {getPaginatedList(sortedMixers).map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">
                      {item.model}
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                      {item.isUpdated && <span className="badge badge-info" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>✏️ Đã sửa</span>}
                    </span>
                    <div className="mobile-card-subtitle">Seri: {item.serial}</div>
                  </div>
                  <div>
                    <span className="badge badge-info">{item.status}</span>
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Mã Quản Lý:</span>
                    <span className="mobile-card-value">{item.id}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Loại máy:</span>
                    <span className="mobile-card-value">{item.type}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Tình trạng cấp phát:</span>
                    <span className="mobile-card-value">
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? `🟢 Gán [${info.setCode}] (${info.nppName})` : '⚪ Tự do trong kho';
                      })()}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditDevice('mixer', item)}>
                    <Edit3 size={14} color="var(--accent-cyan)" />
                    <span>Sửa</span>
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDevice('mixer', item)}>
                    <Trash2 size={14} />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          {renderPaginationBar(sortedMixers.length)}
        </div>
      )}

      {/* VIEW 4: RAW COMPUTERS STOCK */}
      {activeSubTab === 'computers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '4px' }}>Danh Mục Máy Tính (Case & AIO)</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '10px' }}>
              *Lưu ý: Đã bỏ quản lý số seri máy tính. Ổn áp do NPP tự trang bị.
            </span>
            {renderDeviceFilterBar('Máy Tính', computers.length, true)}
          </div>
          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã QL</th>
                  <th>Loại Máy</th>
                  <th>Hệ Điều Hành</th>
                  <th>Cấu Hình (Chi Tiết)</th>
                  <th>Tình Trạng Kỹ Thuật</th>
                  <th>Kết Nối Mạng</th>
                  <th>Ổn Áp (NPP Trang Bị)</th>
                  <th>Tình Trạng Cấp Phát & NPP</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {getPaginatedList(sortedComputers).map(item => (
                  <tr key={item.id}>
                    <td>
                      <span style={{ fontWeight: '700' }}>{item.id}</span>
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                      {item.isUpdated && <span className="badge badge-info" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>✏️ Đã sửa</span>}
                    </td>
                    <td style={{ fontWeight: '700' }}>{item.type === 'Case' ? 'Case' : 'All In One'}</td>
                    <td>{item.os}</td>
                    <td style={{ fontSize: '0.825rem', color: 'var(--accent-cyan)', fontWeight: '600' }}>{item.specs}</td>
                    <td>
                      {item.status === 'Đã đổi trả máy mới' ? (
                        <span className="badge badge-warning" style={{ fontWeight: '700' }}>🔄 Đã đổi trả máy mới</span>
                      ) : (item.status === 'Đổi trả máy cũ' || item.status === 'Đã đổi trả máy cũ') ? (
                        <span className="badge badge-purple" style={{ fontWeight: '700' }}>🔁 Đổi trả máy cũ</span>
                      ) : item.status === 'Mới 100%' ? (
                        <span className="badge badge-success">{item.status}</span>
                      ) : (
                        <span className="badge badge-info">{item.status || 'Đang chạy tốt'}</span>
                      )}
                    </td>
                    <td>{item.network}</td>
                    <td>
                      {item.stabilizer?.hasStabilizer ? (
                        <span className="badge badge-success">✓ {item.stabilizer.brand}</span>
                      ) : (
                        <span className="badge badge-neutral">Không có</span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? (
                          <div>
                            <span className="badge badge-success" style={{ fontWeight: '700' }}>🟢 {info.setCode}</span>
                            <div style={{ fontSize: '0.75rem', marginTop: '2px', color: 'var(--text-muted)' }}>
                              {info.nppName}
                            </div>
                          </div>
                        ) : (
                          <span className="badge badge-neutral">⚪ Tự do trong kho</span>
                        );
                      })()}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleOpenEditDevice('computer', item)} 
                          title="Sửa Máy Tính"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Edit3 size={14} color="var(--accent-cyan)" />
                          <span>Sửa</span>
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleDeleteDevice('computer', item)} 
                          title="Xóa Máy Tính"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)' }}
                        >
                          <Trash2 size={14} color="var(--accent-red)" />
                          <span>Xóa</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only mobile-card-list">
            {getPaginatedList(sortedComputers).map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">
                      {item.type === 'Case' ? 'Case' : 'All In One'}
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                      {item.isUpdated && <span className="badge badge-info" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>✏️ Đã sửa</span>}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-purple)' }}>HĐH: {item.os}</div>
                  </div>
                  <div>
                    {item.status === 'Đã đổi trả máy mới' ? (
                      <span className="badge badge-warning">🔄 Đổi trả mới</span>
                    ) : (item.status === 'Đổi trả máy cũ' || item.status === 'Đã đổi trả máy cũ') ? (
                      <span className="badge badge-purple">🔁 Đổi trả cũ</span>
                    ) : (
                      <span className="badge badge-purple">{item.status || item.os}</span>
                    )}
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Mã Quản Lý:</span>
                    <span className="mobile-card-value">{item.id}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Cấu hình:</span>
                    <span className="mobile-card-value" style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>{item.specs}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Tình trạng cấp phát:</span>
                    <span className="mobile-card-value">
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? `🟢 Gán [${info.setCode}] (${info.nppName})` : '⚪ Tự do trong kho';
                      })()}
                    </span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Mạng:</span>
                    <span className="mobile-card-value">{item.network}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Ổn áp (NPP):</span>
                    <span className="mobile-card-value">
                      {item.stabilizer?.hasStabilizer ? `✓ ${item.stabilizer.brand}` : 'Chưa có'}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditDevice('computer', item)}>
                    <Edit3 size={14} color="var(--accent-cyan)" />
                    <span>Sửa</span>
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDevice('computer', item)}>
                    <Trash2 size={14} />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          {renderPaginationBar(sortedComputers.length)}
        </div>
      )}

      {/* VIEW 5: RAW PRINTERS STOCK */}
      {activeSubTab === 'printers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '10px' }}>Danh Mục Máy In (Model Chuẩn: QL700)</h3>
            {renderDeviceFilterBar('Máy In', printers.length, false)}
          </div>
          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã QL</th>
                  <th>Model Máy In</th>
                  <th>Số Seri</th>
                  <th>Cổng Kết Nối</th>
                  <th>Tình Trạng</th>
                  <th>Tình Trạng Cấp Phát & NPP</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {getPaginatedList(sortedPrinters).map(item => (
                  <tr key={item.id}>
                    <td>
                      <span style={{ fontWeight: '700' }}>{item.id}</span>
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                      {item.isUpdated && <span className="badge badge-info" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>✏️ Đã sửa</span>}
                    </td>
                    <td style={{ fontWeight: '700' }}>{item.model}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{item.serial}</td>
                    <td>{item.connection}</td>
                    <td><span className="badge badge-info">{item.status}</span></td>
                    <td>
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? (
                          <div>
                            <span className="badge badge-success">🟢 Đã gán bộ</span>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--accent-cyan)', marginTop: '2px' }}>{info.setCode}</div>
                            <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>🏢 {info.nppName}</div>
                          </div>
                        ) : (
                          <span className="badge badge-neutral">⚪ Tự do trong kho</span>
                        );
                      })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleOpenEditDevice('printer', item)}>
                          <Edit3 size={14} color="var(--accent-cyan)" />
                        </button>
                        <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDeleteDevice('printer', item)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only mobile-card-list">
            {getPaginatedList(sortedPrinters).map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">
                      {item.model}
                      {item.isNew && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>🆕 Mới</span>}
                      {item.isUpdated && <span className="badge badge-info" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>✏️ Đã sửa</span>}
                    </span>
                    <div className="mobile-card-subtitle">Seri: {item.serial}</div>
                  </div>
                  <div>
                    <span className="badge badge-info">{item.status}</span>
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Mã Quản Lý:</span>
                    <span className="mobile-card-value">{item.id}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Kết nối:</span>
                    <span className="mobile-card-value">{item.connection}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Tình trạng cấp phát:</span>
                    <span className="mobile-card-value">
                      {(() => {
                        const info = getAssignedInfo(item);
                        return info.isAssigned ? `🟢 Gán [${info.setCode}] (${info.nppName})` : '⚪ Tự do trong kho';
                      })()}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditDevice('printer', item)}>
                    <Edit3 size={14} color="var(--accent-cyan)" />
                    <span>Sửa</span>
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDevice('printer', item)}>
                    <Trash2 size={14} />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          {renderPaginationBar(sortedPrinters.length)}
        </div>
      )}

      {/* ADD STOCK DEVICE MODAL */}
      {showAddDeviceModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3 style={{ fontWeight: '800' }}>
                Thêm Thiết Bị Lẻ Vào Kho —&nbsp;
                {addDeviceCategory === 'dispenser' && '🖱️ Máy Chiết'}
                {addDeviceCategory === 'mixer' && '🔄 Máy Lắc'}
                {addDeviceCategory === 'computer' && '💻 Máy Tính'}
                {addDeviceCategory === 'printer' && '🖨️ Máy In QL700'}
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddDeviceModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddDeviceSubmit}>
              <div className="modal-body">

                {/* Mã QL (ID) */}
                <div className="form-group">
                  <label className="form-label">
                    Mã Quản Lý (Mã QL) <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(Tùy chọn - Tự động tạo nếu để trống)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={`VD: ${addDeviceCategory.toUpperCase().slice(0, 4)}-009`}
                    value={addFormData.id || ''}
                    onChange={e => setAddFormData({ ...addFormData, id: e.target.value })}
                  />
                </div>

                {/* Model - Ẩn đối với Máy tính vì chỉ phân biệt All In One và Case */}
                {addDeviceCategory !== 'computer' && (
                  <div className="form-group">
                    <label className="form-label">
                      {addDeviceCategory === 'dispenser' && 'Model Máy Chiết (Satint / Hero / Corob)'}
                      {addDeviceCategory === 'mixer' && 'Model Máy Lắc'}
                      {addDeviceCategory === 'printer' && 'Model Máy In (thường là QL700)'}
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      placeholder={
                        addDeviceCategory === 'dispenser' ? 'VD: Satint AM16, Hero 6-L, Corob D7...' :
                        addDeviceCategory === 'mixer' ? 'VD: Satint ST-50, Evoshake-200, YSA-2A...' :
                        'VD: Brother QL-700'
                      }
                      value={addFormData.model}
                      onChange={e => setAddFormData({ ...addFormData, model: e.target.value })}
                    />
                  </div>
                )}

                {/* Serial - Ẩn hoàn toàn đối với Máy tính */}
                {addDeviceCategory !== 'computer' && (
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>
                        Số Seri (Serial Number) *
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)' }}
                        onClick={() => {
                          setScanTargetField('add');
                          setShowScanSerialModal(true);
                        }}
                      >
                        <Camera size={14} />
                        <span>📷 Quét Mã Vạch</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      className="form-input"
                      required
                      placeholder="Nhập seri hoặc bấm Quét mã vạch"
                      value={addFormData.serial}
                      onChange={e => setAddFormData({ ...addFormData, serial: e.target.value })}
                    />
                  </div>
                )}

                {/* Status */}
                <div className="form-group">
                  <label className="form-label">Tình Trạng Kỹ Thuật</label>
                  <select className="form-select" value={addFormData.status} onChange={e => setAddFormData({ ...addFormData, status: e.target.value })}>
                    <option value="Mới 100%">Mới 100%</option>
                    <option value="Đang chạy tốt">Đang chạy tốt</option>
                    {addDeviceCategory === 'computer' && (
                      <>
                        <option value="Đã đổi trả máy mới">🔄 Đã đổi trả máy mới</option>
                        <option value="Đổi trả máy cũ">🔁 Đổi trả máy cũ</option>
                      </>
                    )}
                    <option value="Cần bảo trì">Cần bảo trì</option>
                    {addDeviceCategory === 'dispenser' && <option value="Hỏng đầu phun">Hỏng đầu phun</option>}
                    {addDeviceCategory === 'mixer' && <option value="Hỏng motor">Hỏng motor</option>}
                    {addDeviceCategory === 'printer' && <option value="Hỏng đầu in">Hỏng đầu in</option>}
                    <option value="Hỏng nặng">Hỏng nặng</option>
                  </select>
                </div>

                {/* Mixer-specific: type */}
                {addDeviceCategory === 'mixer' && (
                  <div className="form-group">
                    <label className="form-label">Loại Máy Lắc</label>
                    <select className="form-select" value={addFormData.type} onChange={e => setAddFormData({ ...addFormData, type: e.target.value })}>
                      <option value="Lắc xoay khép kín">Lắc xoay khép kín</option>
                      <option value="Lắc rung đứng">Lắc rung đứng</option>
                      <option value="Lắc rung ngang">Lắc rung ngang</option>
                      <option value="Lắc mâm xoay">Lắc mâm xoay</option>
                    </select>
                  </div>
                )}

                {/* Computer-specific */}
                {addDeviceCategory === 'computer' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">Loại Máy Tính (Chỉ gồm 2 loại)</label>
                        <select 
                          className="form-select" 
                          value={addFormData.type === 'Case' ? 'Case' : 'All In One'} 
                          onChange={e => setAddFormData({ ...addFormData, type: e.target.value, model: e.target.value })}
                        >
                          <option value="All In One">All In One</option>
                          <option value="Case">Case</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Hệ Điều Hành</label>
                        <input type="text" className="form-input" placeholder="Windows 11 Pro" value={addFormData.os} onChange={e => setAddFormData({ ...addFormData, os: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cấu Hình (Specs)</label>
                      <input type="text" className="form-input" placeholder="Core i5 / 16GB RAM / 512GB SSD" value={addFormData.specs} onChange={e => setAddFormData({ ...addFormData, specs: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Kết Nối Mạng</label>
                      <select className="form-select" value={addFormData.network} onChange={e => setAddFormData({ ...addFormData, network: e.target.value })}>
                        <option value="Có mạng LAN">Có mạng LAN</option>
                        <option value="Có mạng Wifi">Có mạng Wifi</option>
                        <option value="Không có mạng">Không có mạng</option>
                      </select>
                    </div>
                  </>
                )}

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddDeviceModal(false)}>Hủy Bỏ</button>
                <button type="submit" className="btn btn-primary">✅ Thêm Vào Kho</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT DEVICE MODAL */}
      {editingDevice && (
        <SafePortal>
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '580px' }}>
              <div className="modal-header">
                <h3 style={{ fontWeight: '800' }}>
                  Chỉnh Sửa Thông Tin {editingDevice.category === 'computer' ? `Máy Tính [Mã: ${editFormData.id}]` : `Thiết Bị [${editFormData.serial || 'Không seri'}]`}
                </h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingDevice(null)}>✕</button>
              </div>
              <form onSubmit={handleEditSubmit}>
                <div className="modal-body" ref={el => { if (el) el.scrollTop = 0; }}>
                  
                  {/* ROW 1: SERIAL NUMBER & MODEL - TOP OF FORM */}
                  <div className="responsive-form-grid">
                    {editingDevice.category !== 'computer' && (
                      <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label className="form-label" style={{ marginBottom: 0 }}>
                            🏷️ Số Seri (Serial) *
                          </label>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '0.725rem', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)' }}
                            onClick={() => {
                              setScanTargetField('edit');
                              setShowScanSerialModal(true);
                            }}
                          >
                            <Camera size={12} />
                            <span>📷 Quét Mã</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          className="form-input"
                          required
                          placeholder="Nhập seri hoặc bấm Quét mã"
                          value={editFormData.serial || ''}
                          onChange={e => setEditFormData({ ...editFormData, serial: e.target.value })}
                        />
                      </div>
                    )}

                    {editingDevice.category !== 'computer' && (
                      <div className="form-group">
                        <label className="form-label">⚙️ Model / Hệ Máy *</label>
                        <input type="text" className="form-input" required value={editFormData.model || editFormData.type || ''} onChange={e => setEditFormData({ ...editFormData, model: e.target.value })} />
                      </div>
                    )}
                  </div>

                  {/* ROW 2: MÃ QL & TÌNH TRẠNG KỸ THUẬT */}
                  <div className="responsive-form-grid">
                    <div className="form-group">
                      <label className="form-label">Mã Quản Lý (Nội bộ)</label>
                      <input
                        type="text"
                        className="form-input"
                        required
                        value={editFormData.id || ''}
                        onChange={e => setEditFormData({ ...editFormData, id: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">🛠️ Tình Trạng Kỹ Thuật</label>
                      <select className="form-select" value={editFormData.status || 'Đang chạy tốt'} onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}>
                        <option value="Mới 100%">Mới 100%</option>
                        <option value="Đang chạy tốt">Đang chạy tốt</option>
                        {editingDevice.category === 'computer' && (
                          <>
                            <option value="Đã đổi trả máy mới">🔄 Đã đổi trả máy mới</option>
                            <option value="Đổi trả máy cũ">🔁 Đổi trả máy cũ</option>
                          </>
                        )}
                        <option value="Cần bảo trì">Cần bảo trì</option>
                        {editingDevice.category === 'dispenser' && <option value="Hỏng đầu phun">Hỏng đầu phun</option>}
                        {editingDevice.category === 'mixer' && <option value="Hỏng motor">Hỏng motor</option>}
                        {editingDevice.category === 'printer' && <option value="Hỏng đầu in">Hỏng đầu in</option>}
                        <option value="Hỏng nặng">Hỏng nặng</option>
                      </select>
                    </div>
                  </div>

                  {/* CATEGORY SPECIFIC OPTIONS */}
                  {editingDevice.category === 'printer' && (
                    <div className="form-group">
                      <label className="form-label">Cổng Kết Nối</label>
                      <select className="form-select" value={editFormData.connection || 'USB'} onChange={e => setEditFormData({ ...editFormData, connection: e.target.value })}>
                        <option value="USB">USB</option>
                        <option value="LAN">LAN</option>
                        <option value="Wifi">Wifi</option>
                        <option value="Bluetooth">Bluetooth</option>
                      </select>
                    </div>
                  )}

                  {editingDevice.category === 'mixer' && (
                    <div className="form-group">
                      <label className="form-label">Loại Máy Lắc</label>
                      <select
                        className="form-select"
                        value={editFormData.type || 'Lắc xoay khép kín'}
                        onChange={e => setEditFormData({ ...editFormData, type: e.target.value })}
                      >
                        <option value="Lắc xoay khép kín">Lắc xoay khép kín</option>
                        <option value="Lắc rung đứng">Lắc rung đứng</option>
                        <option value="Lắc rung ngang">Lắc rung ngang</option>
                        <option value="Lắc mâm xoay">Lắc mâm xoay</option>
                      </select>
                    </div>
                  )}

                  {editingDevice.category === 'computer' && (
                    <div className="responsive-form-grid">
                      <div className="form-group">
                        <label className="form-label">Loại Máy Tính & OS</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <select 
                            className="form-select" 
                            style={{ width: '130px' }} 
                            value={editFormData.type === 'Case' ? 'Case' : 'All In One'} 
                            onChange={e => setEditFormData({ ...editFormData, type: e.target.value, model: e.target.value })}
                          >
                            <option value="All In One">All In One</option>
                            <option value="Case">Case</option>
                          </select>
                          <input type="text" className="form-input" style={{ flex: 1 }} placeholder="Hệ điều hành..." value={editFormData.os || ''} onChange={e => setEditFormData({ ...editFormData, os: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Kết Nối Mạng</label>
                        <select className="form-select" value={editFormData.network || 'Có mạng LAN'} onChange={e => setEditFormData({ ...editFormData, network: e.target.value })}>
                          <option value="Có mạng LAN">Có mạng LAN</option>
                          <option value="Có mạng Wifi">Có mạng Wifi</option>
                          <option value="Không có mạng">Không có mạng</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ gridColumn: 'span 2' }}>
                        <label className="form-label">💻 Cấu Hình Chi Tiết (Specs: CPU / RAM / SSD)</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="VD: Core i5 / 16GB RAM / 512GB SSD" 
                          value={editFormData.specs || ''} 
                          onChange={e => setEditFormData({ ...editFormData, specs: e.target.value })} 
                        />
                      </div>
                    </div>
                  )}

                  {/* ASSIGNMENT & NPP SECTION */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border-color)' }}>
                    <div className="responsive-form-grid">
                      <div className="form-group">
                        <label className="form-label">📌 Trạng Thái Cấp Phát</label>
                        <select
                          className="form-select"
                          value={editFormData.isAssigned ? 'ASSIGNED' : 'FREE'}
                          onChange={e => {
                            const isAssigned = e.target.value === 'ASSIGNED';
                            setEditFormData({
                              ...editFormData,
                              isAssigned,
                              setCode: isAssigned ? editFormData.setCode : ''
                            });
                          }}
                        >
                          <option value="FREE">⚪ Tự do trong kho</option>
                          <option value="ASSIGNED">🟢 Đã gán vào Bộ máy / NPP</option>
                        </select>
                      </div>

                      {editFormData.isAssigned && (
                        <div className="form-group">
                          <label className="form-label">🏢 Bộ Máy & NPP Gán Cho *</label>
                          <select
                            className="form-select"
                            required={editFormData.isAssigned}
                            value={editFormData.setCode || ''}
                            onChange={e => setEditFormData({ ...editFormData, setCode: e.target.value })}
                          >
                            <option value="">-- Chọn bộ máy / NPP --</option>
                            {systemSets.map(s => (
                              <option key={s.setCode} value={s.setCode}>
                                {s.setCode} — {s.nppName || 'Kho Trung Tâm'}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingDevice(null)}>Hủy Bỏ</button>
                  <button type="submit" className="btn btn-primary">Lưu Thay Đổi</button>
                </div>
              </form>
            </div>
          </div>
        </SafePortal>
      )}

      {/* Assemble Combo Modal */}
      {showAssembleModal && (
        <SafePortal>
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h3 style={{ fontWeight: '800' }}>Ghép Bộ Máy Pha Màu Mới (Combo Set)</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAssembleModal(false)}>✕</button>
              </div>
              <form onSubmit={handleAssembleSubmit}>
                <div className="modal-body" ref={el => { if (el) el.scrollTop = 0; }}>
                  <div style={{ padding: '12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid var(--accent-blue)', borderRadius: '8px', marginBottom: '16px', fontSize: '0.825rem' }}>
                    💡 Quy chuẩn 1 Bộ Máy Pha Màu bao gồm: 1 Máy Chiết + 1 Máy Lắc + 1 Máy Tính + 1 Máy In QL700. (Ổn áp sẽ ghi nhận thêm khi lắp đặt tại NPP).
                  </div>

                  {/* NPP Selector & Set Code */}
                  <div className="responsive-form-grid" style={{ marginBottom: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">🏷️ Mã Bộ Máy (Tự động tăng dần *)</label>
                      <input
                        type="text"
                        className="form-input"
                        required
                        placeholder="VD: SET-2026-003"
                        value={newSetData.setCode || ''}
                        onChange={e => setNewSetData({ ...newSetData, setCode: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>🏢 Chọn Nhà Phân Phối (Mục NPP)</span>
                        {nppSearchTerm && (
                          <span 
                            style={{ color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => setNppSearchTerm('')}
                          >
                            ✕ Xóa lọc
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="🔍 Tìm tên hoặc mã NPP..."
                        value={nppSearchTerm}
                        onChange={e => setNppSearchTerm(e.target.value)}
                        style={{ marginBottom: '6px', fontSize: '0.8rem', padding: '4px 8px' }}
                      />
                      <select
                        className="form-select"
                        value={newSetData.nppId || ''}
                        onChange={e => {
                          const selectedId = e.target.value;
                          const targetNpp = npps.find(n => n.id === selectedId);
                          setNewSetData({
                            ...newSetData,
                            nppId: selectedId,
                            nppName: targetNpp ? targetNpp.name : 'Kho Tổng Trung Tâm',
                            region: targetNpp ? (targetNpp.region || '') : '',
                            province: targetNpp ? (targetNpp.province || '') : '',
                            salesperson: targetNpp ? (targetNpp.salesperson || '') : '',
                            status: targetNpp ? 'DA_LAP_DAT' : 'TRONG_KHO'
                          });
                        }}
                      >
                        <option value="">-- Kho Tổng Trung Tâm (Chưa chọn NPP) --</option>
                        {npps
                          .filter(npp => {
                            if (!nppSearchTerm.trim()) return true;
                            const term = nppSearchTerm.toLowerCase();
                            return (
                              (npp.name && npp.name.toLowerCase().includes(term)) ||
                              (npp.code && npp.code.toLowerCase().includes(term)) ||
                              (npp.id && npp.id.toLowerCase().includes(term)) ||
                              (npp.province && npp.province.toLowerCase().includes(term)) ||
                              (npp.salesperson && npp.salesperson.toLowerCase().includes(term))
                            );
                          })
                          .map(npp => (
                            <option key={npp.id} value={npp.id}>
                              {npp.name} ({npp.code || npp.id}) — {npp.province || npp.region || 'TQ'} {npp.salesperson ? `(KD: ${npp.salesperson})` : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">🛠️ Kỹ Thuật Viên Phụ Trách</label>
                      <select
                        className="form-select"
                        value={newSetData.technician || ''}
                        onChange={e => setNewSetData({ ...newSetData, technician: e.target.value })}
                      >
                        <option value="">-- Chọn tài khoản Kỹ Thuật Viên (QC) --</option>
                        {qcUsers.map(u => (
                          <option key={u.id || u.name} value={u.name}>
                            👤 {u.name} ({u.role?.toUpperCase() === 'QC' ? 'QC/KTV' : u.role?.toUpperCase() || 'KTV'} - {u.region || 'TQ'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">💼 Kinh Doanh Phụ Trách (Tự động từ NPP)</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Tự động điền theo NPP chọn ở trên..."
                        value={newSetData.salesperson || ''}
                        onChange={e => setNewSetData({ ...newSetData, salesperson: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Helper logic for filtering available devices */}
                  {(() => {
                    const isDeviceFree = (dev) => {
                      if (!dev) return false;
                      return !dev.isAssigned && (!dev.setCode || dev.setCode === '');
                    };

                    const availDisp = dispensers
                      .filter(d => isDeviceFree(d) || d.id === newSetData.dispenserId)
                      .sort((a, b) => naturalSortCode(a, b, 'id'));

                    const availMix = mixers
                      .filter(m => isDeviceFree(m) || m.id === newSetData.mixerId)
                      .sort((a, b) => naturalSortCode(a, b, 'id'));

                    const availComp = computers
                      .filter(c => isDeviceFree(c) || c.id === newSetData.computerId)
                      .sort((a, b) => naturalSortCode(a, b, 'id'));

                    const availPrn = printers
                      .filter(p => isDeviceFree(p) || p.id === newSetData.printerId)
                      .sort((a, b) => naturalSortCode(a, b, 'id'));

                    return (
                      <>
                        <div className="form-group">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label className="form-label" style={{ marginBottom: 0 }}>1. Chọn Máy Chiết *</label>
                            <button 
                              type="button" 
                              style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => { setShowAssembleModal(false); handleOpenAddDevice('dispenser'); }}
                            >
                              + Thêm máy chiết mới vào kho
                            </button>
                          </div>
                          <select className="form-select" required value={newSetData.dispenserId} onChange={e => setNewSetData({ ...newSetData, dispenserId: e.target.value })}>
                            <option value="">-- Chọn máy chiết ({availDisp.length} máy) --</option>
                            {availDisp.map(d => (
                              <option key={d.id} value={d.id}>
                                [{d.id}] {d.model} — Seri: {d.serial} {isDeviceFree(d) ? '🟢 (Tự do trong kho)' : `🟡 (Đang gán bộ ${d.setCode || d.set_code || ''})`}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label className="form-label" style={{ marginBottom: 0 }}>2. Chọn Máy Lắc *</label>
                            <button 
                              type="button" 
                              style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => { setShowAssembleModal(false); handleOpenAddDevice('mixer'); }}
                            >
                              + Thêm máy lắc mới vào kho
                            </button>
                          </div>
                          <select className="form-select" required value={newSetData.mixerId} onChange={e => setNewSetData({ ...newSetData, mixerId: e.target.value })}>
                            <option value="">-- Chọn máy lắc ({availMix.length} máy) --</option>
                            {availMix.map(m => (
                              <option key={m.id} value={m.id}>
                                [{m.id}] {m.model} ({m.type || 'Lắc xoay'}) — Seri: {m.serial} {isDeviceFree(m) ? '🟢 (Tự do trong kho)' : `🟡 (Đang gán bộ ${m.setCode || m.set_code || ''})`}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label className="form-label" style={{ marginBottom: 0 }}>3. Chọn Máy Tính *</label>
                            <button 
                              type="button" 
                              style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => { setShowAssembleModal(false); handleOpenAddDevice('computer'); }}
                            >
                              + Thêm máy tính mới vào kho
                            </button>
                          </div>
                          <select className="form-select" required value={newSetData.computerId} onChange={e => setNewSetData({ ...newSetData, computerId: e.target.value })}>
                            <option value="">-- Chọn máy tính ({availComp.length} máy) --</option>
                            {availComp.map(c => (
                              <option key={c.id} value={c.id}>
                                [{c.id}] {c.type} ({c.os || 'Win'} | {c.specs || 'N/A'}) {c.status === 'Đã đổi trả máy mới' ? '🔄 [Đã đổi trả máy mới]' : (c.status === 'Đổi trả máy cũ' || c.status === 'Đã đổi trả máy cũ') ? '🔁 [Đổi trả máy cũ]' : ''} {isDeviceFree(c) ? '🟢 (Tự do trong kho)' : `🟡 (Đang gán bộ ${c.setCode || c.set_code || ''})`}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label className="form-label" style={{ marginBottom: 0 }}>4. Chọn Máy In QL700 *</label>
                            <button 
                              type="button" 
                              style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => { setShowAssembleModal(false); handleOpenAddDevice('printer'); }}
                            >
                              + Thêm máy in mới vào kho
                            </button>
                          </div>
                          <select className="form-select" required value={newSetData.printerId} onChange={e => setNewSetData({ ...newSetData, printerId: e.target.value })}>
                            <option value="">-- Chọn máy in QL700 ({availPrn.length} máy) --</option>
                            {availPrn.map(p => (
                              <option key={p.id} value={p.id}>
                                [{p.id}] {p.model} — Seri: {p.serial} {isDeviceFree(p) ? '🟢 (Tự do trong kho)' : `🟡 (Đang gán bộ ${p.setCode || p.set_code || ''})`}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAssembleModal(false)}>Hủy Bỏ</button>
                  <button type="submit" className="btn btn-primary">Xác Nhận Tạo Bộ Combo</button>
                </div>
              </form>
            </div>
          </div>
        </SafePortal>
      )}

      {/* EDIT SYSTEM SET MODAL */}
      {editingSet && (
        <SafePortal>
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '600px' }}>
              <div className="modal-header">
                <h3 style={{ fontWeight: '800' }}>Chỉnh Sửa Thông Tin Bộ Máy [{editingSet.setCode}]</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingSet(null)}>✕</button>
              </div>
              <form onSubmit={handleEditSetSubmit}>
                <div className="modal-body" ref={el => { if (el) el.scrollTop = 0; }}>
                  
                  {/* PRIMARY EDIT FIELDS - TOP OF FORM */}
                  <div className="responsive-form-grid" style={{ marginBottom: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">🏷️ Mã Bộ Máy *</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        required
                        placeholder="VD: SET-2026-002"
                        value={editSetFormData.setCode || ''} 
                        onChange={e => setEditSetFormData({ ...editSetFormData, setCode: e.target.value })} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>🏢 Chọn Nhà Phân Phối Gán Cho</span>
                        {editNppSearchTerm && (
                          <span 
                            style={{ color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => setEditNppSearchTerm('')}
                          >
                            ✕ Xóa lọc
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="🔍 Tìm tên hoặc mã NPP..."
                        value={editNppSearchTerm}
                        onChange={e => setEditNppSearchTerm(e.target.value)}
                        style={{ marginBottom: '6px', fontSize: '0.8rem', padding: '4px 8px' }}
                      />
                      <select
                        className="form-select"
                        value={editSetFormData.nppId || ''}
                        onChange={e => {
                          const selectedId = e.target.value;
                          if (!selectedId) {
                            setEditSetFormData({
                              ...editSetFormData,
                              nppId: '',
                              nppName: 'Kho Tổng Trung Tâm',
                              region: 'Kho Tổng',
                              province: 'Kho Tổng',
                              salesperson: ''
                            });
                          } else {
                            const targetNpp = npps.find(n => n.id === selectedId);
                            setEditSetFormData({
                              ...editSetFormData,
                              nppId: selectedId,
                              nppName: targetNpp ? targetNpp.name : editSetFormData.nppName,
                              region: targetNpp ? (targetNpp.region || editSetFormData.region) : editSetFormData.region,
                              province: targetNpp ? (targetNpp.province || editSetFormData.province) : editSetFormData.province,
                              salesperson: targetNpp ? (targetNpp.salesperson || editSetFormData.salesperson) : editSetFormData.salesperson
                            });
                          }
                        }}
                      >
                        <option value="">-- Kho Trung Tâm (Chưa gán NPP) --</option>
                        {npps
                          .filter(npp => {
                            if (!editNppSearchTerm.trim()) return true;
                            const term = editNppSearchTerm.toLowerCase();
                            return (
                              (npp.name && npp.name.toLowerCase().includes(term)) ||
                              (npp.code && npp.code.toLowerCase().includes(term)) ||
                              (npp.id && npp.id.toLowerCase().includes(term)) ||
                              (npp.province && npp.province.toLowerCase().includes(term)) ||
                              (npp.salesperson && npp.salesperson.toLowerCase().includes(term))
                            );
                          })
                          .map(npp => (
                            <option key={npp.id} value={npp.id}>
                              {npp.name} ({npp.code || npp.id}) — {npp.province || npp.region || 'TQ'}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">⚡ Trạng Thái Bộ Máy</label>
                      <select 
                        className="form-select" 
                        value={editSetFormData.status} 
                        onChange={e => setEditSetFormData({ ...editSetFormData, status: e.target.value })}
                      >
                        <option value="DA_LAP_DAT">🟢 Đã Lắp Đặt</option>
                        <option value="TRONG_KHO">⚪ Trong Kho</option>
                        <option value="DA_THU_HOI">🔴 Đã Thu Hồi</option>
                        <option value="BAO_THUONG_BAO_TRI">🟡 Đang Bảo Trì</option>
                      </select>
                    </div>
                  </div>

                  <div className="responsive-form-grid">
                    <div className="form-group">
                      <label className="form-label">🔌 Ghi Nhận Ổn Áp</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Lioa 2000VA..."
                        value={editSetFormData.stabilizer} 
                        onChange={e => setEditSetFormData({ ...editSetFormData, stabilizer: e.target.value })} 
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Hạn Bảo Trì Tiếp Theo</label>
                      <input 
                        type="date" 
                        className="form-input" 
                        value={editSetFormData.nextMaintenanceDue || ''} 
                        onChange={e => setEditSetFormData({ ...editSetFormData, nextMaintenanceDue: e.target.value })} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">🛠️ Kỹ Thuật Viên Phụ Trách</label>
                      <select
                        className="form-select"
                        value={editSetFormData.technician || ''}
                        onChange={e => setEditSetFormData({ ...editSetFormData, technician: e.target.value })}
                      >
                        <option value="">-- Chọn tài khoản Kỹ Thuật Viên (QC) --</option>
                        {qcUsers.map(u => (
                          <option key={u.id || u.name} value={u.name}>
                            👤 {u.name} ({u.role?.toUpperCase() === 'QC' ? 'QC/KTV' : u.role?.toUpperCase() || 'KTV'} - {u.region || 'TQ'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">💼 Kinh Doanh Phụ Trách (Tự động từ NPP)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Tự động điền theo NPP..."
                        value={editSetFormData.salesperson || ''} 
                        onChange={e => setEditSetFormData({ ...editSetFormData, salesperson: e.target.value })} 
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Ghi Chú Chi Tiết</label>
                    <textarea 
                      className="form-textarea" 
                      rows={2} 
                      value={editSetFormData.notes} 
                      onChange={e => setEditSetFormData({ ...editSetFormData, notes: e.target.value })} 
                    />
                  </div>                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingSet(null)}>Hủy Bỏ</button>
                  <button type="submit" className="btn btn-primary">Lưu Thay Đổi</button>
                </div>
              </form>
            </div>
          </div>
        </SafePortal>
      )}

      {/* QR & BARCODE CAMERA SCANNER MODAL */}
      {showScanSerialModal && (
        <QrScannerModal
          onScanSuccess={(scannedText) => {
            if (scanTargetField === 'add') {
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
