import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
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
  const [modelFilter, setModelFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showAssembleModal, setShowAssembleModal] = useState(false);
  const [showScanSerialModal, setShowScanSerialModal] = useState(false);
  const [scanTargetField, setScanTargetField] = useState('add');

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
  const [addFormData, setAddFormData] = useState({
    model: '',
    serial: '',
    status: 'Mới 100%',
    type: 'Lắc xoay khép kín',
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
    setNewSetData({
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
      model: '',
      serial: '',
      status: 'Mới 100%',
      type: 'Lắc xoay khép kín',
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
    setEditFormData({
      ...data,
      id: data.id || '',
      isAssigned: data.isAssigned || !!data.setCode,
      setCode: data.setCode || ''
    });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editingDevice) return;
    const isAssigned = !!editFormData.isAssigned && !!editFormData.setCode;
    const finalData = {
      ...editFormData,
      serial: editFormData.serial?.trim() || (editingDevice.category === 'computer' ? 'Không seri' : editFormData.serial),
      isAssigned,
      setCode: isAssigned ? editFormData.setCode : null
    };
    onEditDevice(editingDevice.category, finalData);
    setEditingDevice(null);
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
      if (window.confirm(`⚠️ [CẢNH BÁO ADMIN]\n${catLabel} [${item.serial}] đang được gán trong bộ máy [${item.setCode}]${nppText}.\n\nBạn có chắc chắn muốn XÓA THIẾT BỊ NÀY khỏi hệ thống không?\n(Hệ thống sẽ tự động gỡ/giải phóng thiết bị khỏi bộ máy ${item.setCode}).`)) {
        onDeleteDevice(category, item.id, item.setCode);
      }
    } else {
      if (window.confirm(`Bạn có chắc chắn muốn xóa ${catLabel} Seri [${item.serial}] khỏi kho?`)) {
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
    if (!addFormData.model && !addFormData.type) {
      alert('Vui lòng nhập Model / Hệ máy!');
      return;
    }
    const finalData = {
      ...addFormData,
      serial: addFormData.serial?.trim() || (addDeviceCategory === 'computer' ? 'Không seri' : 'N/A')
    };
    onAddStockDevice(addDeviceCategory, finalData);
    setShowAddDeviceModal(false);
  };

  const handleOpenEditSet = (set) => {
    const targetNpp = npps.find(n => n.id === set.nppId);
    setEditingSet(set);
    setEditSetFormData({
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
      return matchesModel && matchesStatus;
    })
    .sort((a, b) => naturalSortCode(a, b, 'setCode'));

  const sortedDispensers = [...dispensers].sort((a, b) => naturalSortCode(a, b, 'id'));
  const sortedMixers = [...mixers].sort((a, b) => naturalSortCode(a, b, 'id'));
  const sortedComputers = [...computers].sort((a, b) => naturalSortCode(a, b, 'id'));
  const sortedPrinters = [...printers].sort((a, b) => naturalSortCode(a, b, 'id'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
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
          
          {/* Filters Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <Filter size={16} color="var(--text-muted)" />
            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Lọc Hệ Máy:</span>
            <select className="form-select" value={modelFilter} onChange={e => setModelFilter(e.target.value)} style={{ height: '36px', fontSize: '0.825rem' }}>
              <option value="ALL">Tất Cả Hệ Máy Chiết</option>
              <option value="Satint A2">Satint A2</option>
              <option value="Hero Eurotint">Hero Eurotint</option>
              <option value="Corob F1">Corob F1</option>
              <option value="Fast & Fluid HA480">Fast & Fluid HA480</option>
            </select>

            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Trạng Thái Bộ Máy:</span>
            <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: '36px', fontSize: '0.825rem' }}>
              <option value="ALL">Tất Cả Trạng Thái</option>
              <option value="DA_LAP_DAT">Đã Lắp Đặt</option>
              <option value="TRONG_KHO">Trong Kho</option>
              <option value="DA_THU_HOI">Đã Thu Hồi</option>
              <option value="BAO_THUONG_BAO_TRI">Đang Bảo Trì</option>
            </select>
          </div>

          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã Bộ Máy</th>
                  <th>Nhà Phân Phối</th>
                  <th>Máy Chiết (Seri)</th>
                  <th>Máy Lắc (Seri)</th>
                  <th>Máy Tính (Loại/OS)</th>
                  <th>Máy In (Model/Seri)</th>
                  <th>Cán Bộ Phụ Trách</th>
                  <th>Ổn Áp (Ghi Nhận)</th>
                  <th>Trạng Thái</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredSets.map(set => (
                  <tr key={set.id}>
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
                      <div>{set.pcType} ({set.pcOs})</div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.pcSerial}</div>
                    </td>
                    <td>
                      <div>{set.printerModel}</div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{set.printerSerial}</div>
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
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only mobile-card-list">
            {filteredSets.map(set => (
              <div className="mobile-card" key={set.id}>
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
                    <span className="mobile-card-value">{set.pcType} ({set.pcOs})</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Máy In:</span>
                    <span className="mobile-card-value">{set.printerModel} ({set.printerSerial})</span>
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
            ))}
          </div>
        </div>
      )}

      {/* VIEW 2: RAW DISPENSERS STOCK */}
      {activeSubTab === 'dispensers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '14px' }}>Danh Mục Máy Chiết (Kho & Đã Cấp Phát)</h3>
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
                {sortedDispensers.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
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
            {sortedDispensers.map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">{item.model}</span>
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
        </div>
      )}

      {/* VIEW 3: RAW MIXERS STOCK */}
      {activeSubTab === 'mixers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '14px' }}>Danh Mục Máy Lắc (Kho & Đã Cấp Phát)</h3>
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
                {sortedMixers.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
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
            {sortedMixers.map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">{item.model}</span>
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
        </div>
      )}

      {/* VIEW 4: RAW COMPUTERS STOCK */}
      {activeSubTab === 'computers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800' }}>Danh Mục Máy Tính (Case & AIO)</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>*Lưu ý: Ổn áp do NPP tự mua nên trong kho máy tính không có ổn áp sẵn.</span>
          </div>
          {/* Desktop View Table */}
          <div className="desktop-only data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã QL</th>
                  <th>Loại Máy</th>
                  <th>Hệ Điều Hành</th>
                  <th>Cấu Hình</th>
                  <th>Số Seri</th>
                  <th>Kết Nối Mạng</th>
                  <th>Ổn Áp (NPP Trang Bị)</th>
                  <th>Tình Trạng Cấp Phát & NPP</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {sortedComputers.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td style={{ fontWeight: '700' }}>{item.type}</td>
                    <td>{item.os}</td>
                    <td style={{ fontSize: '0.8rem' }}>{item.specs}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{item.serial}</td>
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
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleOpenEditDevice('computer', item)}>
                          <Edit3 size={14} color="var(--accent-cyan)" />
                        </button>
                        <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDeleteDevice('computer', item)}>
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
            {sortedComputers.map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">{item.type}</span>
                    <div className="mobile-card-subtitle">Seri: {item.serial}</div>
                  </div>
                  <div>
                    <span className="badge badge-purple">{item.os}</span>
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Mã Quản Lý:</span>
                    <span className="mobile-card-value">{item.id}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Cấu hình:</span>
                    <span className="mobile-card-value" style={{ fontSize: '0.8rem' }}>{item.specs}</span>
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
        </div>
      )}

      {/* VIEW 5: RAW PRINTERS STOCK */}
      {activeSubTab === 'printers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '14px' }}>Danh Mục Máy In (Model Chuẩn: QL700)</h3>
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
                {sortedPrinters.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
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
            {sortedPrinters.map(item => (
              <div className="mobile-card" key={item.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title">{item.model}</span>
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

                {/* Model */}
                <div className="form-group">
                  <label className="form-label">
                    {addDeviceCategory === 'dispenser' && 'Model Máy Chiết (Satint / Hero / Corob)'}
                    {addDeviceCategory === 'mixer' && 'Model Máy Lắc'}
                    {addDeviceCategory === 'computer' && 'Model / Hệ Máy Tính'}
                    {addDeviceCategory === 'printer' && 'Model Máy In (thường là QL700)'}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder={
                      addDeviceCategory === 'dispenser' ? 'VD: Satint AM16, Hero 6-L, Corob D7...' :
                      addDeviceCategory === 'mixer' ? 'VD: Satint ST-50, Evoshake-200, YSA-2A...' :
                      addDeviceCategory === 'computer' ? 'VD: Dell OptiPlex 3080, Asus AIO P1600...' :
                      'VD: Brother QL-700'
                    }
                    value={addFormData.model}
                    onChange={e => setAddFormData({ ...addFormData, model: e.target.value })}
                  />
                </div>

                {/* Serial */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>
                      Số Seri (Serial Number) {addDeviceCategory !== 'computer' ? '*' : '(Không bắt buộc)'}
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
                    required={addDeviceCategory !== 'computer'}
                    placeholder={addDeviceCategory === 'computer' ? 'Tùy chọn (Bấm Quét mã vạch hoặc để trống)' : 'Nhập seri hoặc bấm Quét mã vạch'}
                    value={addFormData.serial}
                    onChange={e => setAddFormData({ ...addFormData, serial: e.target.value })}
                  />
                </div>

                {/* Status */}
                <div className="form-group">
                  <label className="form-label">Tình Trạng Kỹ Thuật</label>
                  <select className="form-select" value={addFormData.status} onChange={e => setAddFormData({ ...addFormData, status: e.target.value })}>
                    <option value="Mới 100%">Mới 100%</option>
                    <option value="Đang chạy tốt">Đang chạy tốt</option>
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
                        <label className="form-label">Loại Máy Tính</label>
                        <select className="form-select" value={addFormData.type} onChange={e => setAddFormData({ ...addFormData, type: e.target.value })}>
                          <option value="AIO">AIO (All in One)</option>
                          <option value="Case">Case Để Bàn</option>
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

                {/* Printer-specific */}
                {addDeviceCategory === 'printer' && (
                  <div className="form-group">
                    <label className="form-label">Cổng Kết Nối</label>
                    <select className="form-select" value={addFormData.connection} onChange={e => setAddFormData({ ...addFormData, connection: e.target.value })}>
                      <option value="USB">USB</option>
                      <option value="LAN">LAN</option>
                      <option value="Wifi">Wifi</option>
                      <option value="Bluetooth">Bluetooth</option>
                    </select>
                  </div>
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
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3 style={{ fontWeight: '800' }}>Chỉnh Sửa Thông Tin Thiết Bị [{editFormData.serial || 'Không seri'}]</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingDevice(null)}>✕</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Mã Quản Lý (Mã QL)</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={editFormData.id || ''}
                    onChange={e => setEditFormData({ ...editFormData, id: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Model / Hệ Máy</label>
                  <input type="text" className="form-input" required value={editFormData.model || editFormData.type || ''} onChange={e => setEditFormData({ ...editFormData, model: e.target.value })} />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>
                      Số Seri (Serial Number) {editingDevice.category !== 'computer' ? '*' : '(Không bắt buộc)'}
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '2px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)' }}
                      onClick={() => {
                        setScanTargetField('edit');
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
                    required={editingDevice.category !== 'computer'}
                    placeholder={editingDevice.category === 'computer' ? 'Tùy chọn (Bấm Quét mã vạch hoặc để trống)' : 'Nhập seri hoặc bấm Quét mã vạch'}
                    value={editFormData.serial || ''}
                    onChange={e => setEditFormData({ ...editFormData, serial: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tình Trạng Kỹ Thuật</label>
                  <select className="form-select" value={editFormData.status || 'Đang chạy tốt'} onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}>
                    <option value="Mới 100%">Mới 100%</option>
                    <option value="Đang chạy tốt">Đang chạy tốt</option>
                    <option value="Cần bảo trì">Cần bảo trì</option>
                    {editingDevice.category === 'dispenser' && <option value="Hỏng đầu phun">Hỏng đầu phun</option>}
                    {editingDevice.category === 'mixer' && <option value="Hỏng motor">Hỏng motor</option>}
                    {editingDevice.category === 'printer' && <option value="Hỏng đầu in">Hỏng đầu in</option>}
                    <option value="Hỏng nặng">Hỏng nặng</option>
                  </select>
                </div>

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
                    <label className="form-label">Loại Máy Lắc (Chỉnh sửa)</label>
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
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">Loại Máy Tính</label>
                        <select className="form-select" value={editFormData.type || 'AIO'} onChange={e => setEditFormData({ ...editFormData, type: e.target.value })}>
                          <option value="AIO">AIO (All in One)</option>
                          <option value="Case">Case Để Bàn</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Hệ Điều Hành</label>
                        <input type="text" className="form-input" value={editFormData.os || ''} onChange={e => setEditFormData({ ...editFormData, os: e.target.value })} />
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
                  </>
                )}

                {/* Admin Assignment Section - Available for ALL device categories */}
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                  <label className="form-label" style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>
                    📌 Tình Trạng Cấp Phát & Nhà Phân Phối (Quyền Admin)
                  </label>

                  <div className="form-group" style={{ marginTop: '8px' }}>
                    <label className="form-label">Trạng Thái Cấp Phát</label>
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
                      <option value="FREE">⚪ Tự do trong kho (Chưa gán bộ máy nào)</option>
                      <option value="ASSIGNED">🟢 Đã gán vào Bộ máy / Nhà Phân Phối</option>
                    </select>
                  </div>

                  {editFormData.isAssigned && (
                    <div className="form-group">
                      <label className="form-label">Chọn Bộ Máy & NPP Gán Cho *</label>
                      <select
                        className="form-select"
                        required={editFormData.isAssigned}
                        value={editFormData.setCode || ''}
                        onChange={e => setEditFormData({ ...editFormData, setCode: e.target.value })}
                      >
                        <option value="">-- Chọn bộ máy / NPP gán cho --</option>
                        {systemSets.map(s => (
                          <option key={s.setCode} value={s.setCode}>
                            {s.setCode} — {s.nppName || 'Kho Tổng Trung Tâm'} ({s.province || s.region || 'TQ'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingDevice(null)}>Hủy Bỏ</button>
                <button type="submit" className="btn btn-primary">Lưu Thay Đổi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assemble Combo Modal */}
      {showAssembleModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontWeight: '800' }}>Ghép Bộ Máy Pha Màu Mới (Combo Set)</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAssembleModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAssembleSubmit}>
              <div className="modal-body">
                <div style={{ padding: '12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid var(--accent-blue)', borderRadius: '8px', marginBottom: '16px', fontSize: '0.825rem' }}>
                  💡 Quy chuẩn 1 Bộ Máy Pha Màu bao gồm: 1 Máy Chiết + 1 Máy Lắc + 1 Máy Tính + 1 Máy In QL700. (Ổn áp sẽ ghi nhận thêm khi lắp đặt tại NPP).
                </div>

                {/* NPP Selector */}
                <div className="form-group">
                  <label className="form-label">Chọn Nhà Phân Phối (Lấy dữ liệu từ Mục NPP)</label>
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
                    {npps.map(npp => (
                      <option key={npp.id} value={npp.id}>
                        {npp.name} ({npp.code || npp.id}) — {npp.province || npp.region || 'TQ'} {npp.salesperson ? `(KD: ${npp.salesperson})` : ''}
                      </option>
                    ))}
                  </select>
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
                    if (dev.isAssigned === true || dev.isAssigned === 'true' || dev.is_assigned === true || dev.is_assigned === 'true') return false;
                    if (dev.setCode && dev.setCode !== '' && dev.setCode !== 'null' && dev.setCode !== '—') return false;
                    if (dev.set_code && dev.set_code !== '' && dev.set_code !== 'null' && dev.set_code !== '—') return false;
                    return true;
                  };

                  const allDisp = (dispensers && dispensers.length > 0) ? dispensers : INITIAL_DISPENSERS;
                  const freeDisp = allDisp.filter(isDeviceFree);
                  const availDisp = [...(freeDisp.length > 0 ? freeDisp : allDisp)].sort((a, b) => naturalSortCode(a, b, 'id'));

                  const allMix = (mixers && mixers.length > 0) ? mixers : INITIAL_MIXERS;
                  const freeMix = allMix.filter(isDeviceFree);
                  const availMix = [...(freeMix.length > 0 ? freeMix : allMix)].sort((a, b) => naturalSortCode(a, b, 'id'));

                  const allPc = (computers && computers.length > 0) ? computers : INITIAL_COMPUTERS;
                  const freePc = allPc.filter(isDeviceFree);
                  const availPc = [...(freePc.length > 0 ? freePc : allPc)].sort((a, b) => naturalSortCode(a, b, 'id'));

                  const allPrn = (printers && printers.length > 0) ? printers : INITIAL_PRINTERS;
                  const freePrn = allPrn.filter(isDeviceFree);
                  const availPrn = [...(freePrn.length > 0 ? freePrn : allPrn)].sort((a, b) => naturalSortCode(a, b, 'id'));

                  return (
                    <>
                      <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label className="form-label" style={{ marginBottom: 0 }}>1. Chọn Máy Chiết Trong Kho *</label>
                          <button 
                            type="button" 
                            style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => { setShowAssembleModal(false); handleOpenAddDevice('dispenser'); }}
                          >
                            + Thêm máy chiết mới vào kho
                          </button>
                        </div>
                        <select className="form-select" required value={newSetData.dispenserId} onChange={e => setNewSetData({ ...newSetData, dispenserId: e.target.value })}>
                          <option value="">-- Chọn máy chiết từ kho ({availDisp.length} máy) --</option>
                          {availDisp.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.model} - Seri: {d.serial} {isDeviceFree(d) ? '🟢 (Tự do trong kho)' : `🟡 (Đang gán bộ ${d.setCode || d.set_code || ''})`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label className="form-label" style={{ marginBottom: 0 }}>2. Chọn Máy Lắc Trong Kho *</label>
                          <button 
                            type="button" 
                            style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => { setShowAssembleModal(false); handleOpenAddDevice('mixer'); }}
                          >
                            + Thêm máy lắc mới vào kho
                          </button>
                        </div>
                        <select className="form-select" required value={newSetData.mixerId} onChange={e => setNewSetData({ ...newSetData, mixerId: e.target.value })}>
                          <option value="">-- Chọn máy lắc từ kho ({availMix.length} máy) --</option>
                          {availMix.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.model} ({m.type}) - Seri: {m.serial} {isDeviceFree(m) ? '🟢 (Tự do trong kho)' : `🟡 (Đang gán bộ ${m.setCode || m.set_code || ''})`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label className="form-label" style={{ marginBottom: 0 }}>3. Chọn Máy Tính Trong Kho *</label>
                          <button 
                            type="button" 
                            style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => { setShowAssembleModal(false); handleOpenAddDevice('computer'); }}
                          >
                            + Thêm máy tính mới vào kho
                          </button>
                        </div>
                        <select className="form-select" required value={newSetData.computerId} onChange={e => setNewSetData({ ...newSetData, computerId: e.target.value })}>
                          <option value="">-- Chọn máy tính từ kho ({availPc.length} máy) --</option>
                          {availPc.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.type} ({c.os}) - Seri: {c.serial} {isDeviceFree(c) ? '🟢 (Tự do trong kho)' : `🟡 (Đang gán bộ ${c.setCode || c.set_code || ''})`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
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
                              {p.model} - Seri: {p.serial} {isDeviceFree(p) ? '🟢 (Tự do trong kho)' : `🟡 (Đang gán bộ ${p.setCode || p.set_code || ''})`}
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
      )}

      {/* EDIT SYSTEM SET MODAL */}
      {editingSet && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3 style={{ fontWeight: '800' }}>Chỉnh Sửa Thông Tin Bộ Máy [{editingSet.setCode}]</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingSet(null)}>✕</button>
            </div>
            <form onSubmit={handleEditSetSubmit}>
              <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                {/* NPP Dropdown */}
                <div className="form-group">
                  <label className="form-label">Chọn Nhà Phân Phối (Lấy từ Mục NPP)</label>
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
                          region: '',
                          province: '',
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
                    <option value="">-- Kho Tổng Trung Tâm (Chưa chọn NPP) --</option>
                    {npps.map(npp => (
                      <option key={npp.id} value={npp.id}>
                        {npp.name} ({npp.code || npp.id}) — {npp.province || npp.region || 'TQ'} {npp.salesperson ? `(KD: ${npp.salesperson})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Khu Vực (Vùng)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={editSetFormData.region} 
                      onChange={e => setEditSetFormData({ ...editSetFormData, region: e.target.value })} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tỉnh / Thành Phố</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={editSetFormData.province} 
                      onChange={e => setEditSetFormData({ ...editSetFormData, province: e.target.value })} 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Trạng Thái Bộ Máy</label>
                    <select 
                      className="form-select" 
                      value={editSetFormData.status} 
                      onChange={e => setEditSetFormData({ ...editSetFormData, status: e.target.value })}
                    >
                      <option value="DA_LAP_DAT">Đã Lắp Đặt</option>
                      <option value="TRONG_KHO">Trong Kho</option>
                      <option value="DA_THU_HOI">Đã Thu Hồi</option>
                      <option value="BAO_THUONG_BAO_TRI">Đang Bảo Trì</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ghi Nhận Ổn Áp</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={editSetFormData.stabilizer} 
                      onChange={e => setEditSetFormData({ ...editSetFormData, stabilizer: e.target.value })} 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Ngày Bảo Trì Gần Nhất</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={editSetFormData.lastMaintenanceDate || ''} 
                      onChange={e => setEditSetFormData({ ...editSetFormData, lastMaintenanceDate: e.target.value })} 
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
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingSet(null)}>Hủy Bỏ</button>
                <button type="submit" className="btn btn-primary">Lưu Thay Đổi</button>
              </div>
            </form>
          </div>
        </div>
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
