import React, { useState, useMemo } from 'react';
import SafePortal from './SafePortal.jsx';
import { formatDateVN } from '../utils/dateUtils.js';
import {
  PlusCircle,
  Wrench,
  Eye,
  Edit3,
  Trash2,
  Search,
  Clock, 
  Camera, 
  X, 
  MapPin, 
  Check,
  AlertTriangle,
  RefreshCw,
  Building2,
  BookOpen,
  ClipboardCheck,
  ShieldAlert,
  PackageCheck,
  BarChart2,
  PieChart as PieChartIcon,
  Calendar
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
  Pie, 
  Legend 
} from 'recharts';
import { sanitizeFormData, validatePhone, validateSerial } from '../security/sanitize.js';

export const MACHINE_MODELS = [
  'AI88',
  'AIO',
  'Case máy tính',
  'Màn hình máy tính',
  'QL700',
  'Satint A2',
  'Satint A2-100',
  'Hero',
  'D200',
  'Khác / Linh kiện'
];

export const PRODUCT_CATEGORIES = [
  'Máy chiết',
  'Máy lắc',
  'Case',
  'AIO',
  'QL700',
  'Màn hình',
  'Khác / Linh kiện'
];

import { compressImage } from '../utils/imageCompressor.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useModalScrollLock } from '../hooks/useModalScrollLock.js';

export default function DeviceRepairProcessing({
  repairTickets = [],
  npps = [],
  systemSets = [],
  qcUsers = [],
  onAddTicket,
  onEditTicket,
  onDeleteTicket,
  onPrintTicket,
  prefilledTicket,
  onClearPrefill,
  isDateLocked = () => false
}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('ALL'); // ALL | PENDING | NOT_RETURNED | REPLACED
  const [searchTerm, setSearchTerm] = useState('');
  const [nppSearchTerm, setNppSearchTerm] = useState('');

  const isTicketAllowed = (ticketNppId) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'qc') {
      if (user.managedRegion === 'Toàn Quốc') return true;
      const targetNpp = npps.find(n => n.id === ticketNppId);
      return targetNpp ? user.managedRegion === targetNpp.region : false;
    }
    return false;
  };
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [modelFilter, setModelFilter] = useState('ALL');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);

  useModalScrollLock(showModal || !!editingTicket || !!selectedTicket);

  // 1-Year failure statistics for dashboard charts
  const failureStats = useMemo(() => {
    const categoryCount = {};
    const errorTypeCount = {};

    repairTickets.forEach(t => {
      const cat = t.productCategory || 'Khác';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;

      const err = t.errorCategory || (t.errorDescription ? t.errorDescription.slice(0, 20) : 'Sự cố chung');
      errorTypeCount[err] = (errorTypeCount[err] || 0) + 1;
    });

    const categoryData = Object.keys(categoryCount).map(name => ({
      name,
      count: categoryCount[name]
    })).sort((a, b) => b.count - a.count);

    const colors = ['#f43f5e', '#f59e0b', '#3b82f6', '#10b981', '#a855f7', '#64748b'];
    const pieData = Object.keys(categoryCount).map((name, idx) => ({
      name,
      value: categoryCount[name],
      color: colors[idx % colors.length]
    }));

    return { categoryData, pieData };
  }, [repairTickets]);

  // Form State
  const defaultTechnician = (user && (user.role === 'qc' || user.role === 'admin')) 
    ? (user.name || user.full_name) 
    : (qcUsers && qcUsers.length > 0 ? qcUsers[0].name : 'Nguyễn Văn Hùng');

  const getDeviceFromCombo = (assignedSet, category) => {
    if (!assignedSet) return { model: '', serial: '' };
    switch (category) {
      case 'Máy chiết':
      case 'Máy Chiết Sơn':
        return {
          model: assignedSet.dispenserModel || 'Satint A2',
          serial: assignedSet.dispenserSerial || ''
        };
      case 'Máy lắc':
      case 'Máy Lắc Sơn':
        return {
          model: assignedSet.mixerModel || 'Satint ST-50',
          serial: assignedSet.mixerSerial || ''
        };
      case 'Case':
        return {
          model: assignedSet.pcType === 'Case' ? (assignedSet.pcOs || 'Case PC') : 'Case PC',
          serial: assignedSet.pcType === 'Case' ? (assignedSet.pcSerial || '') : (assignedSet.pcSerial || '')
        };
      case 'AIO':
        return {
          model: assignedSet.pcType === 'AIO' ? (assignedSet.pcOs || 'AIO PC') : 'AIO PC',
          serial: assignedSet.pcType === 'AIO' ? (assignedSet.pcSerial || '') : (assignedSet.pcSerial || '')
        };
      case 'QL700':
      case 'Máy In Tem QL700':
        return {
          model: assignedSet.printerModel || 'QL700',
          serial: assignedSet.printerSerial || ''
        };
      case 'Màn hình':
        return {
          model: 'Màn hình',
          serial: ''
        };
      default:
        return {
          model: '',
          serial: ''
        };
    }
  };

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    technician: defaultTechnician,
    nppId: '',
    nppName: '',
    productCategory: 'Máy chiết',
    machineModel: 'Satint A2',
    serialNumber: '',
    errorCategory: 'Lỗi phần cứng / Cụm chiết',
    errorDescription: '',
    photos: [],
    actionDirection: 'Sửa chữa',
    exchangeType: 'Không xuất đổi',
    replacementCondition: 'Mới',
    processingStatus: 'Chưa xử lý',
    customerReturnStatus: 'Chưa gửi trả',
    notes: ''
  });

  // Auto-fill from Handbook if prefilledTicket is provided
  React.useEffect(() => {
    if (prefilledTicket) {
      setEditingTicket(null);
      setNppSearchTerm('');
      setFormData({
        date: new Date().toISOString().split('T')[0],
        technician: defaultTechnician,
        nppId: npps.length > 0 ? npps[0].id : '',
        nppName: npps.length > 0 ? npps[0].name : '',
        productCategory: prefilledTicket.productCategory || 'Máy chiết',
        machineModel: prefilledTicket.machineModel || 'Satint A2',
        serialNumber: prefilledTicket.serialNumber || '',
        errorCategory: prefilledTicket.errorCategory || 'Lỗi phần cứng',
        errorDescription: prefilledTicket.errorDescription || '',
        photos: [],
        actionDirection: prefilledTicket.actionDirection || 'Sửa chữa',
        exchangeType: prefilledTicket.exchangeType || 'Không xuất đổi',
        replacementCondition: 'Mới',
        processingStatus: 'Chưa xử lý',
        customerReturnStatus: 'Chưa gửi trả',
        notes: ''
      });
      setShowModal(true);
      if (onClearPrefill) onClearPrefill();
    }
  }, [prefilledTicket]);

  // Reset scroll position of modal-body to top when modal opens
  React.useEffect(() => {
    if (showModal || editingTicket || selectedTicket) {
      setTimeout(() => {
        document.querySelectorAll('.modal-body').forEach(el => el.scrollTop = 0);
      }, 50);
    }
  }, [showModal, editingTicket, selectedTicket]);

  const handleOpenAdd = () => {
    setEditingTicket(null);
    setNppSearchTerm('');
    setFormData({
      date: new Date().toISOString().split('T')[0],
      technician: defaultTechnician,
      nppId: '',
      nppName: '',
      productCategory: 'Máy chiết',
      machineModel: 'Satint A2',
      serialNumber: '',
      errorCategory: 'Lỗi phần cứng',
      errorDescription: '',
      photos: [],
      actionDirection: 'Sửa chữa',
      exchangeType: 'Không xuất đổi',
      replacementCondition: 'Mới',
      processingStatus: 'Chưa xử lý',
      customerReturnStatus: 'Chưa gửi trả',
      notes: ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (ticket) => {
    if (isDateLocked(ticket.date)) {
      alert(`Thao tác bị khóa: Phiếu thuộc tháng ${ticket.date.substring(0, 7)} đã chốt sổ kế toán!`);
      return;
    }
    if (!isTicketAllowed(ticket.nppId)) {
      alert('Bạn không có quyền chỉnh sửa phiếu sửa chữa ở khu vực này!');
      return;
    }
    setEditingTicket(ticket);
    setNppSearchTerm('');
    setFormData({
      ...ticket,
      exchangeType: ticket.exchangeType || (ticket.actionDirection === 'Xuất đổi' ? 'Xuất đổi máy mới 100%' : 'Không xuất đổi')
    });
    setShowModal(true);
  };

  // Helper when NPP is chosen: auto detect linked system set
  const currentAssignedSet = useMemo(() => {
    if (!formData.nppId) return null;
    return systemSets.find(s => s.nppId === formData.nppId);
  }, [systemSets, formData.nppId]);

  const filteredNpps = useMemo(() => {
    if (!nppSearchTerm.trim()) return npps;
    const term = nppSearchTerm.toLowerCase();
    return npps.filter(n => 
      (n.name && n.name.toLowerCase().includes(term)) || 
      (n.id && n.id.toLowerCase().includes(term)) || 
      (n.region && n.region.toLowerCase().includes(term))
    );
  }, [npps, nppSearchTerm]);

  const handleCategoryChange = (newCat) => {
    const assignedSet = systemSets.find(s => s.nppId === formData.nppId);
    const { model, serial } = getDeviceFromCombo(assignedSet, newCat);
    setFormData(prev => ({
      ...prev,
      productCategory: newCat,
      machineModel: model !== undefined && model !== '' ? model : (newCat === 'Màn hình' ? 'Màn hình' : prev.machineModel),
      serialNumber: serial !== undefined ? serial : prev.serialNumber
    }));
  };

  const handleSelectNpp = (selectedId) => {
    const targetNpp = npps.find(n => n.id === selectedId);
    const assignedSet = systemSets.find(s => s.nppId === selectedId);
    const currentCat = formData.productCategory || 'Máy chiết';
    const { model, serial } = getDeviceFromCombo(assignedSet, currentCat);

    setFormData(prev => ({
      ...prev,
      nppId: selectedId,
      nppName: targetNpp ? targetNpp.name : '',
      machineModel: model || prev.machineModel,
      serialNumber: serial !== undefined ? serial : prev.serialNumber
    }));
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      try {
        const compressedBase64 = await compressImage(file);
        setFormData(prev => ({
          ...prev,
          photos: [...(prev.photos || []), compressedBase64]
        }));
      } catch (err) {
        console.error('Error compressing image:', err);
        // Fallback to reading file directly on error
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({
            ...prev,
            photos: [...(prev.photos || []), reader.result]
          }));
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleRemovePhoto = (index) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Sanitize input form data
    const sanitized = sanitizeFormData(formData);

    const isSerialRequired = !['Màn hình', 'Khác / Linh kiện', 'Khác', 'Phụ kiện'].includes(sanitized.productCategory);

    if (!sanitized.errorDescription || (isSerialRequired && !sanitized.serialNumber)) {
      alert(isSerialRequired ? 'Vui lòng nhập Số Seri thiết bị và Diễn giải lỗi!' : 'Vui lòng nhập Diễn giải tình trạng lỗi!');
      return;
    }

    // Format validation (chỉ kiểm tra nếu có nhập serial)
    if (sanitized.serialNumber && sanitized.serialNumber.trim() && sanitized.serialNumber !== 'Không có seri') {
      const serialCheck = validateSerial(sanitized.serialNumber);
      if (!serialCheck.valid) {
        alert(serialCheck.error);
        return;
      }
    }

    // Check monthly closing locks
    if (isDateLocked(sanitized.date)) {
      alert(`Thao tác bị khóa: Tháng ${sanitized.date.substring(0, 7)} đã chốt sổ kế toán!`);
      return;
    }
    if (editingTicket && isDateLocked(editingTicket.date)) {
      alert(`Thao tác bị khóa: Phiếu cũ thuộc tháng ${editingTicket.date.substring(0, 7)} đã chốt sổ kế toán!`);
      return;
    }

    // Check region permission
    if (!isTicketAllowed(sanitized.nppId)) {
      alert('Bạn không có quyền tạo hoặc chỉnh sửa phiếu sửa chữa ở khu vực này!');
      return;
    }

    const selectedNppObj = npps.find(n => n.id === sanitized.nppId);
    const finalNppName = selectedNppObj ? selectedNppObj.name : sanitized.nppName || 'NPP Khác';

    if (editingTicket) {
      onEditTicket({
        ...sanitized,
        nppName: finalNppName
      });
    } else {
      const newTicketCode = `TICK-202607-00${repairTickets.length + 1}`;
      onAddTicket({
        ...sanitized,
        id: newTicketCode,
        ticketCode: newTicketCode,
        nppName: finalNppName
      });
    }

    setShowModal(false);
  };

  const handleDelete = (ticket) => {
    if (isDateLocked(ticket.date)) {
      alert(`Thao tác bị khóa: Phiếu thuộc tháng ${ticket.date.substring(0, 7)} đã chốt sổ kế toán!`);
      return;
    }
    if (!isTicketAllowed(ticket.nppId)) {
      alert('Bạn không có quyền xóa phiếu sửa chữa ở khu vực này!');
      return;
    }
    if (confirm(`Bạn có chắc chắn muốn xóa Phiếu xử lý máy [${ticket.ticketCode}]?`)) {
      onDeleteTicket(ticket.id);
    }
  };

  // Filtered Tickets
  const filteredTickets = repairTickets.filter(t => {
    const matchesSearch = t.ticketCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.nppName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.technician.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.errorDescription.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === 'ALL' || t.productCategory === categoryFilter;
    const matchesModel = modelFilter === 'ALL' || t.machineModel === modelFilter;

    let matchesTab = true;
    if (activeTab === 'PENDING') matchesTab = t.processingStatus === 'Chưa xử lý';
    if (activeTab === 'NOT_RETURNED') matchesTab = t.customerReturnStatus === 'Chưa gửi trả';
    if (activeTab === 'REPLACED') matchesTab = t.actionDirection === 'Xuất đổi';

    return matchesSearch && matchesCategory && matchesModel && matchesTab;
  });

  // Calculate statistics
  const pendingCount = repairTickets.filter(t => t.processingStatus === 'Chưa xử lý').length;
  const notReturnedCount = repairTickets.filter(t => t.customerReturnStatus === 'Chưa gửi trả').length;
  const replacedCount = repairTickets.filter(t => t.actionDirection === 'Xuất đổi').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 1-YEAR FAILURE ANALYSIS DASHBOARD CHARTS */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)' }}>
              <BarChart2 size={20} /> Biểu Đồ Thống Kê Thiết Bị & Sự Cố Hay Hỏng Nhất Trong 1 Năm
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Phân tích tần suất hỏng hóc theo chủng loại thiết bị và linh kiện để chuẩn bị vật tư dự phòng.
            </p>
          </div>
          <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>Tổng {repairTickets.length} phiếu sửa chữa</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {/* Chart 1: Failure Count by Product Category */}
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--accent-cyan)', display: 'block', marginBottom: '8px' }}>
              📊 Số Lượng Sự Cố Theo Thiết Bị
            </span>
            <div style={{ height: '180px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={failureStats.categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }} />
                  <Bar dataKey="count" name="Số lần sự cố" fill="#f43f5e" radius={[4, 4, 0, 0]}>
                    {failureStats.categoryData.map((entry, index) => {
                      const colors = ['#f43f5e', '#f59e0b', '#3b82f6', '#10b981', '#a855f7'];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Proportion Pie Chart */}
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--accent-emerald)', display: 'block', marginBottom: '8px' }}>
              🥧 Tỷ Lệ Hỏng Hóc Theo Chủng Loại
            </span>
            <div style={{ height: '180px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={failureStats.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {failureStats.pieData.map((entry, index) => (
                      <Cell key={`pie-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }} />
                  <Legend 
                    verticalAlign="bottom" 
                    height={26} 
                    formatter={(val) => <span style={{ fontSize: '0.725rem', color: 'var(--text-main)' }}>{val}</span>} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        
        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-cyan)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Tổng Số Phiếu Xử Lý</span>
            <Wrench size={20} color="var(--accent-cyan)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '6px' }}>{repairTickets.length}</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-amber)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Chưa Xử Lý (Cần Gấp)</span>
            <Clock size={20} color="var(--accent-amber)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '6px', color: 'var(--accent-amber)' }}>{pendingCount}</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-rose)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Chưa Gửi Trả NPP</span>
            <PackageCheck size={20} color="var(--accent-rose)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '6px', color: 'var(--accent-rose)' }}>{notReturnedCount}</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-purple)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Phiếu Xuất Đổi Máy</span>
            <RefreshCw size={20} color="var(--accent-purple)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '6px', color: 'var(--accent-purple)' }}>{replacedCount}</div>
        </div>

      </div>

      {/* Main Filter & Action Bar */}
      <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          
          {/* Filter Sub-Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button 
              className={`btn ${activeTab === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setActiveTab('ALL')}
            >
              <span>Tất Cả Phiếu ({repairTickets.length})</span>
            </button>

            <button 
              className={`btn ${activeTab === 'PENDING' ? 'btn-danger' : 'btn-secondary'} btn-sm`}
              onClick={() => setActiveTab('PENDING')}
            >
              <span>⚠️ Chưa Xử Lý ({pendingCount})</span>
            </button>

            <button 
              className={`btn ${activeTab === 'NOT_RETURNED' ? 'btn-secondary' : 'btn-secondary'} btn-sm`}
              style={activeTab === 'NOT_RETURNED' ? { background: 'var(--accent-amber)', color: '#000', fontWeight: 'bold' } : {}}
              onClick={() => setActiveTab('NOT_RETURNED')}
            >
              <span>📦 Chưa Gửi Trả Khách ({notReturnedCount})</span>
            </button>

            <button 
              className={`btn ${activeTab === 'REPLACED' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setActiveTab('REPLACED')}
            >
              <span>🔄 Xuất Đổi ({replacedCount})</span>
            </button>
          </div>

          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <PlusCircle size={18} />
            <span>+ Tạo Phiếu Xử Lý Máy Mới</span>
          </button>
        </div>

        {/* Warning Banner for Locked Month */}
        <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#ef4444', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
          <ShieldAlert size={16} />
          <span>Lưu ý: Hệ thống tự động khóa các thao tác Thêm/Sửa/Xóa đối với các phiếu phát sinh trong các tháng đã chốt sổ kế toán.</span>
        </div>

        {/* Search & Select Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Tìm Mã phiếu, NPP, Seri, KTV..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '36px', height: '38px', fontSize: '0.85rem', width: '100%' }}
            />
          </div>

          <select className="form-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ height: '38px', fontSize: '0.85rem' }}>
            <option value="ALL">Tất Cả Danh Mục</option>
            {PRODUCT_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select className="form-select" value={modelFilter} onChange={e => setModelFilter(e.target.value)} style={{ height: '38px', fontSize: '0.85rem' }}>
            <option value="ALL">Tất Cả Loại Máy / Model</option>
            {MACHINE_MODELS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

        </div>

      </div>

      {/* Tickets Data Table */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        {/* Desktop View Table */}
        <div className="desktop-only data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã Phiếu</th>
                <th>Ngày Xử Lý</th>
                <th>Kỹ Thuật Viên</th>
                <th>Nhà Phân Phối</th>
                <th>Sản Phẩm / Loại Máy</th>
                <th>Số Seri</th>
                <th>Diễn Giải Lỗi</th>
                <th>Hướng Xử Lý</th>
                <th>Tình Trạng Sửa</th>
                <th>Gửi Trả Khách</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    Không tìm thấy phiếu xử lý máy nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredTickets.map(ticket => (
                  <tr key={ticket.id}>
                    <td style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {ticket.ticketCode}
                    </td>
                    <td>{formatDateVN(ticket.date)}</td>
                    <td style={{ fontWeight: '600' }}>{ticket.technician}</td>
                    <td>{ticket.nppName}</td>
                    <td>
                      <div style={{ fontWeight: '700' }}>{ticket.machineModel}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ticket.productCategory}</div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>{ticket.serialNumber}</td>
                    <td style={{ maxWidth: '220px', fontSize: '0.825rem' }}>
                      <div style={{ color: 'var(--text-main)', fontWeight: '500' }}>{ticket.errorDescription}</div>
                      {ticket.errorCategory && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>[{ticket.errorCategory}]</span>
                      )}
                    </td>
                    <td>
                      {ticket.actionDirection === 'Xuất đổi' ? (
                        <div>
                          <span className="badge badge-purple">🔄 Xuất Đổi</span>
                          <div style={{ fontSize: '0.725rem', marginTop: '2px', color: 'var(--accent-purple)' }}>Máy {ticket.replacementCondition}</div>
                        </div>
                      ) : (
                        <span className="badge badge-info">🛠️ Sửa Chữa</span>
                      )}
                    </td>
                    <td>
                      {ticket.processingStatus === 'Đã xử lý' ? (
                        <span className="badge badge-success">✓ Đã xử lý</span>
                      ) : (
                        <span className="badge badge-warning">⏳ Chưa xử lý</span>
                      )}
                    </td>
                    <td>
                      {ticket.customerReturnStatus === 'Đã gửi trả' ? (
                        <span className="badge badge-success">✓ Đã gửi trả</span>
                      ) : (
                        <span className="badge badge-danger">📦 Chưa gửi trả</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} title="Xem chi tiết" onClick={() => setSelectedTicket(ticket)}>
                          <Eye size={14} color="var(--accent-cyan)" />
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          style={{ padding: '4px 8px', opacity: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 0.4 : 1, cursor: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 'not-allowed' : 'pointer' }} 
                          title={isDateLocked(ticket.date) ? "Tháng đã chốt sổ" : !isTicketAllowed(ticket.nppId) ? "Bạn không phụ trách khu vực này" : "Chỉnh sửa phiếu"} 
                          onClick={() => {
                            if (!isDateLocked(ticket.date) && isTicketAllowed(ticket.nppId)) {
                              handleOpenEdit(ticket);
                            }
                          }}
                        >
                          <Edit3 size={14} color={(isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? "var(--text-muted)" : "var(--accent-amber)"} />
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          style={{ padding: '4px 8px', opacity: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 0.4 : 1, cursor: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 'not-allowed' : 'pointer' }} 
                          title={isDateLocked(ticket.date) ? "Tháng đã chốt sổ" : !isTicketAllowed(ticket.nppId) ? "Bạn không phụ trách khu vực này" : "Xóa phiếu"} 
                          onClick={() => {
                            if (!isDateLocked(ticket.date) && isTicketAllowed(ticket.nppId)) {
                              handleDelete(ticket);
                            }
                          }}
                        >
                          <Trash2 size={14} color={(isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? "var(--text-muted)" : "#ef4444"} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards */}
        <div className="mobile-only mobile-card-list">
          {filteredTickets.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Không tìm thấy phiếu xử lý máy nào phù hợp với bộ lọc.
            </div>
          ) : (
            filteredTickets.map(ticket => (
              <div className="mobile-card" key={ticket.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title" style={{ color: 'var(--accent-cyan)' }}>{ticket.ticketCode}</span>
                    <div className="mobile-card-subtitle">{ticket.nppName}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                    {ticket.processingStatus === 'Đã xử lý' ? (
                      <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>✓ Đã xử lý</span>
                    ) : (
                      <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>⏳ Chưa xử lý</span>
                    )}
                    {ticket.customerReturnStatus === 'Đã gửi trả' ? (
                      <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>✓ Đã trả</span>
                    ) : (
                      <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>📦 Chưa trả</span>
                    )}
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Sản phẩm:</span>
                    <span className="mobile-card-value">{ticket.machineModel} ({ticket.productCategory})</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Số Seri:</span>
                    <span className="mobile-card-value" style={{ fontFamily: 'var(--font-mono)' }}>{ticket.serialNumber}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Lỗi:</span>
                    <span className="mobile-card-value">{ticket.errorDescription}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Kỹ thuật viên:</span>
                    <span className="mobile-card-value">{ticket.technician}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Ngày xử lý:</span>
                    <span className="mobile-card-value">{formatDateVN(ticket.date)}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Hướng xử lý:</span>
                    <span className="mobile-card-value">
                      {ticket.actionDirection === 'Xuất đổi' ? (
                        <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>🔄 Xuất đổi ({ticket.replacementCondition})</span>
                      ) : (
                        <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>🛠️ Sửa chữa</span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectedTicket(ticket)}>
                    <Eye size={14} color="var(--accent-cyan)" />
                    <span>Xem</span>
                  </button>
                   <button 
                    className="btn btn-secondary btn-sm" 
                    disabled={isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)}
                    style={{ opacity: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 0.4 : 1 }}
                    onClick={() => {
                      if (!isDateLocked(ticket.date) && isTicketAllowed(ticket.nppId)) {
                        handleOpenEdit(ticket);
                      }
                    }}
                  >
                    <Edit3 size={14} color={(isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? "var(--text-muted)" : "var(--accent-amber)"} />
                    <span>Sửa</span>
                  </button>
                  <button 
                    className="btn btn-danger btn-sm" 
                    disabled={isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)}
                    style={{ opacity: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 0.4 : 1 }}
                    onClick={() => {
                      if (!isDateLocked(ticket.date) && isTicketAllowed(ticket.nppId)) {
                        handleDelete(ticket);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CREATE / EDIT TICKET MODAL */}
      {showModal && (
        <SafePortal>
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '720px' }}>
              <div className="modal-header">
                <h3 style={{ fontWeight: '800' }}>
                  {editingTicket ? `Chỉnh Sửa Phiếu Xử Lý Máy [${editingTicket.ticketCode}]` : 'Tạo Phiếu Xử Lý Máy & Sửa Chữa Mới'}
                </h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body" ref={el => { if (el) el.scrollTop = 0; }}>
                  
                  {/* PRIMARY EDIT FIELDS - TOP OF FORM */}
                  {/* FIELD 1: NGÀY XỬ LÝ MÁY & KỸ THUẬT VIÊN */}
                  <div className="responsive-form-grid" style={{ marginBottom: '14px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>
                        📅 1. Ngày Xử Lý Máy / Báo Hỏng *
                      </label>
                      <input 
                        type="date" 
                        className="form-input" 
                        required 
                        value={formData.date || ''} 
                        onChange={e => setFormData({ ...formData, date: e.target.value })} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: '700' }}>
                        👨‍🔧 Kỹ Thuật Viên Phụ Trách / Xử Lý *
                      </label>
                      <select 
                        className="form-select" 
                        required 
                        value={formData.technician || ''} 
                        onChange={e => setFormData({ ...formData, technician: e.target.value })}
                      >
                        {qcUsers && qcUsers.length > 0 ? (
                          qcUsers.map((u, idx) => (
                            <option key={u.id || idx} value={u.name || u.full_name || u.id}>
                              👤 {u.name || u.full_name || u.id} ({u.role === 'admin' ? 'Quản Trị' : 'QC Kỹ Thuật'} - {u.region || u.managedRegion || 'Toàn Quốc'})
                            </option>
                          ))
                        ) : (
                          <option value={user?.name || user?.full_name || 'Nguyễn Văn Hùng'}>
                            👤 {user?.name || user?.full_name || 'Nguyễn Văn Hùng'} (Kỹ Thuật Viên)
                          </option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* FIELD 2: NHÀ PHÂN PHỐI VỚI TÌM KIẾM & BỘ MÁY TỰ ĐỘNG ĐIỀN */}
                  <div className="form-group" style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label className="form-label" style={{ fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: 0 }}>
                        🏢 2. Tên Nhà Phân Phối (NPP) *
                      </label>
                      {formData.nppId && (
                        <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                          Mã: {formData.nppId}
                        </span>
                      )}
                    </div>
                    
                    <div style={{ position: 'relative', marginBottom: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
                        placeholder="🔍 Tìm nhanh tên hoặc mã NPP..."
                        value={nppSearchTerm}
                        onChange={e => setNppSearchTerm(e.target.value)}
                      />
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                      {nppSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setNppSearchTerm('')}
                          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >✕</button>
                      )}
                    </div>

                    <select 
                      className="form-select" 
                      required 
                      value={formData.nppId} 
                      onChange={e => handleSelectNpp(e.target.value)}
                    >
                      <option value="">-- Chọn NPP từ danh sách ({filteredNpps.length} NPP) --</option>
                      {filteredNpps.map(n => (
                        <option key={n.id} value={n.id}>[{n.id}] {n.name} - {n.region}</option>
                      ))}
                    </select>

                    {/* Quick selection of devices from the assigned combo set */}
                    {currentAssignedSet && (
                      <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px', border: '1px dashed var(--accent-blue)' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--accent-blue)', marginBottom: '6px' }}>
                          ⚡ Bộ máy [{currentAssignedSet.setCode}] - Bấm để chọn nhanh thiết bị sự cố:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {currentAssignedSet.dispenserSerial && (
                            <button
                              type="button"
                              className={`btn btn-sm ${formData.productCategory === 'Máy chiết' ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  productCategory: 'Máy chiết',
                                  machineModel: currentAssignedSet.dispenserModel || 'Satint A2',
                                  serialNumber: currentAssignedSet.dispenserSerial || ''
                                }));
                              }}
                            >
                              🎯 Chiết: {currentAssignedSet.dispenserModel} ({currentAssignedSet.dispenserSerial})
                            </button>
                          )}
                          {currentAssignedSet.mixerSerial && (
                            <button
                              type="button"
                              className={`btn btn-sm ${formData.productCategory === 'Máy lắc' ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  productCategory: 'Máy lắc',
                                  machineModel: currentAssignedSet.mixerModel || 'Natos V1',
                                  serialNumber: currentAssignedSet.mixerSerial || ''
                                }));
                              }}
                            >
                              🌀 Lắc: {currentAssignedSet.mixerModel} ({currentAssignedSet.mixerSerial})
                            </button>
                          )}
                          {currentAssignedSet.pcSerial && (
                            <button
                              type="button"
                              className={`btn btn-sm ${(formData.productCategory === 'Case' || formData.productCategory === 'AIO') ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => {
                                const isAio = currentAssignedSet.pcType === 'AIO';
                                setFormData(prev => ({
                                  ...prev,
                                  productCategory: isAio ? 'AIO' : 'Case',
                                  machineModel: currentAssignedSet.pcOs || currentAssignedSet.pcType || 'Máy tính',
                                  serialNumber: currentAssignedSet.pcSerial || ''
                                }));
                              }}
                            >
                              💻 {currentAssignedSet.pcType || 'Máy tính'}: {currentAssignedSet.pcOs} ({currentAssignedSet.pcSerial})
                            </button>
                          )}
                          {currentAssignedSet.printerSerial && (
                            <button
                              type="button"
                              className={`btn btn-sm ${formData.productCategory === 'QL700' ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  productCategory: 'QL700',
                                  machineModel: currentAssignedSet.printerModel || 'QL700',
                                  serialNumber: currentAssignedSet.printerSerial || ''
                                }));
                              }}
                            >
                              🖨️ Máy in: {currentAssignedSet.printerModel || 'QL700'} ({currentAssignedSet.printerSerial})
                            </button>
                          )}
                          <button
                            type="button"
                            className={`btn btn-sm ${formData.productCategory === 'Màn hình' ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ fontSize: '0.75rem' }}
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                productCategory: 'Màn hình',
                                machineModel: 'Màn hình hiển thị',
                                serialNumber: ''
                              }));
                            }}
                          >
                            🖥️ Màn hình
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* FIELD 3 & 4: PHÂN LOẠI SẢN PHẨM & SỐ SERI */}
                  <div className="responsive-form-grid">
                    <div className="form-group">
                      <label className="form-label">📂 3. Phân Loại Thiết Bị *</label>
                      <select 
                        className="form-select" 
                        required 
                        value={formData.productCategory} 
                        onChange={e => handleCategoryChange(e.target.value)}
                      >
                        {PRODUCT_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">
                        🏷️ 4. Số Seri Thiết Bị {['Màn hình', 'Khác / Linh kiện'].includes(formData.productCategory) ? '(Không bắt buộc)' : '*'}
                      </label>
                      <input 
                        type="text" 
                        className="form-input" 
                        required={!['Màn hình', 'Khác / Linh kiện'].includes(formData.productCategory)} 
                        placeholder={['Màn hình', 'Khác / Linh kiện'].includes(formData.productCategory) ? "Có thể để trống hoặc ghi chú..." : "Nhập số seri duy nhất..."} 
                        value={formData.serialNumber} 
                        onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} 
                      />
                    </div>
                  </div>

                  <div className="responsive-form-grid">
                    <div className="form-group">
                      <label className="form-label">⚙️ Model Chi Tiết</label>
                      <input type="text" className="form-input" placeholder="Ví dụ: Satint A2, Mixer AI88, QL-700..." value={formData.machineModel} onChange={e => setFormData({ ...formData, machineModel: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">📦 Trạng Thái Trả Khách</label>
                      <select className="form-select" value={formData.customerReturnStatus} onChange={e => setFormData({ ...formData, customerReturnStatus: e.target.value })}>
                        <option value="Chưa gửi trả">📦 Chưa Gửi Trả</option>
                        <option value="Đã gửi trả">✓ Đã Gửi Trả NPP</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">⚠️ 5. Diễn Giải Tình Trạng Lỗi *</label>
                    <textarea className="form-input" rows={2} required placeholder="Mô tả chi tiết sự cố kỹ thuật..." value={formData.errorDescription} onChange={e => setFormData({ ...formData, errorDescription: e.target.value })} />
                  </div>

                  <div className="responsive-form-grid">
                    <div className="form-group">
                      <label className="form-label">🛠️ Hướng Xử Lý Kỹ Thuật</label>
                      <select 
                        className="form-select" 
                        value={formData.actionDirection} 
                        onChange={e => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            actionDirection: val,
                            exchangeType: val === 'Xuất đổi' 
                              ? (prev.exchangeType === 'Không xuất đổi' ? 'Xuất đổi máy mới 100%' : prev.exchangeType)
                              : 'Không xuất đổi'
                          }));
                        }}
                      >
                        <option value="Sửa chữa">🛠️ Sửa Chữa Tại Kho/Đại Lý</option>
                        <option value="Xuất đổi">🔄 Xuất Đổi Máy Khác</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">📦 Xuất Đổi Máy Mới Hoặc Cũ</label>
                      <select 
                        className="form-select" 
                        value={formData.exchangeType || (formData.actionDirection === 'Xuất đổi' ? 'Xuất đổi máy mới 100%' : 'Không xuất đổi')} 
                        onChange={e => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            exchangeType: val,
                            actionDirection: val !== 'Không xuất đổi' ? 'Xuất đổi' : prev.actionDirection
                          }));
                        }}
                      >
                        <option value="Không xuất đổi">⚪ Không Xuất Đổi (Giữ máy sửa)</option>
                        <option value="Xuất đổi máy mới 100%">✨ Xuất Đổi Máy Mới 100%</option>
                        <option value="Xuất đổi máy cũ (đã qua sử dụng)">🔄 Xuất Đổi Máy Cũ (Đã qua sử dụng)</option>
                      </select>
                    </div>
                  </div>

                  <div className="responsive-form-grid">
                    <div className="form-group">
                      <label className="form-label">⚡ Tình Trạng Sửa Chữa</label>
                      <select className="form-select" value={formData.processingStatus} onChange={e => setFormData({ ...formData, processingStatus: e.target.value })}>
                        <option value="Chưa xử lý">⏳ Chưa Xử Lý</option>
                        <option value="Đang xử lý">🔧 Đang Xử Lý</option>
                        <option value="Đã xử lý">✓ Đã Xử Lý Xong</option>
                      </select>
                    </div>
                  </div>

                  {/* Photo Upload Section */}
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                    <label className="form-label">📸 Ảnh Chụp Hiện Trường / Thiết Bị Hỏng</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                        <Camera size={14} />
                        <span>Chụp / Chọn Ảnh</span>
                        <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} />
                      </label>
                    </div>
                    {formData.photos && formData.photos.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
                        {formData.photos.map((url, idx) => (
                          <div key={idx} style={{ position: 'relative', width: '100%', height: '65px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                            <img src={url} alt="ticket photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(idx)}
                              style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy Bỏ</button>
                  <button type="submit" className="btn btn-primary">{editingTicket ? 'Cập Nhật Phiếu' : 'Tạo Phiếu Mới'}</button>
                </div>
              </form>
            </div>
          </div>
        </SafePortal>
      )}

      {/* VIEW TICKET DETAIL MODAL */}
      {selectedTicket && (
        <SafePortal>
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '640px' }}>
              <div className="modal-header">
                <div>
                  <span className="badge badge-info">{selectedTicket.ticketCode}</span>
                  <h3 style={{ fontWeight: '800', marginTop: '4px' }}>Chi Tiết Phiếu Xử Lý Máy</h3>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedTicket(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
                  <div><strong>Nhà Phân Phối:</strong> {selectedTicket.nppName}</div>
                  <div><strong>Sản Phẩm & Seri:</strong> {selectedTicket.machineModel} ({selectedTicket.serialNumber})</div>
                  <div><strong>Kỹ Thuật Viên:</strong> {selectedTicket.technician}</div>
                  <div><strong>Ngày Tạo:</strong> {formatDateVN(selectedTicket.date)}</div>
                  <div><strong>Diễn Giải Lỗi:</strong> {selectedTicket.errorDescription}</div>
                  <div><strong>Hướng Xử Lý:</strong> {selectedTicket.actionDirection}</div>
                  <div><strong>Tình Trạng Sửa:</strong> {selectedTicket.processingStatus}</div>
                  <div><strong>Gửi Trả Khách:</strong> {selectedTicket.customerReturnStatus}</div>
                </div>

                {selectedTicket.photos && selectedTicket.photos.length > 0 && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px' }}>📸 Ảnh Đính Kèm:</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                      {selectedTicket.photos.map((url, idx) => (
                        <a key={idx} href={url} target="_blank" rel="noreferrer" style={{ height: '90px', borderRadius: '6px', overflow: 'hidden', display: 'block', border: '1px solid var(--border-color)' }}>
                          <img src={url} alt="error photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setSelectedTicket(null)}>Đóng</button>
              </div>
            </div>
          </div>
        </SafePortal>
      )}

    </div>
  );
}
