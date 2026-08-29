import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
  PackageCheck
} from 'lucide-react';
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
  'Máy tính',
  'Máy in',
  'Phụ kiện',
  'Linh kiện'
];

import { compressImage } from '../utils/imageCompressor.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useModalScrollLock } from '../hooks/useModalScrollLock.js';

export default function DeviceRepairProcessing({
  repairTickets = [],
  npps = [],
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

  // Auto-fill from Handbook if prefilledTicket is provided
  React.useEffect(() => {
    if (prefilledTicket) {
      setEditingTicket(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        technician: 'Nguyễn Văn Hùng',
        nppId: npps.length > 0 ? npps[0].id : '',
        nppName: npps.length > 0 ? npps[0].name : '',
        productCategory: prefilledTicket.productCategory || 'Máy chiết',
        machineModel: prefilledTicket.machineModel || 'Satint A2',
        serialNumber: prefilledTicket.serialNumber || '',
        errorCategory: prefilledTicket.errorCategory || 'Lỗi phần cứng',
        errorDescription: prefilledTicket.errorDescription || '',
        photos: [],
        actionDirection: 'Sửa chữa',
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

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    technician: 'Nguyễn Văn Hùng',
    nppId: '',
    nppName: '',
    productCategory: 'Máy chiết',
    machineModel: 'Satint A2',
    serialNumber: '',
    errorCategory: 'Lỗi phần cứng / Cụm chiết',
    errorDescription: '',
    photos: [],
    actionDirection: 'Sửa chữa', // 'Sửa chữa' | 'Xuất đổi'
    replacementCondition: 'Mới', // 'Mới' | 'Cũ'
    processingStatus: 'Chưa xử lý', // 'Chưa xử lý' | 'Đã xử lý'
    customerReturnStatus: 'Chưa gửi trả', // 'Chưa gửi trả' | 'Đã gửi trả'
    notes: ''
  });

  const handleOpenAdd = () => {
    setEditingTicket(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      technician: 'Nguyễn Văn Hùng',
      nppId: npps.length > 0 ? npps[0].id : '',
      nppName: npps.length > 0 ? npps[0].name : '',
      productCategory: 'Máy chiết',
      machineModel: 'Satint A2',
      serialNumber: '',
      errorCategory: 'Lỗi phần cứng',
      errorDescription: '',
      photos: [],
      actionDirection: 'Sửa chữa',
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
    setFormData({ ...ticket });
    setShowModal(true);
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

    if (!sanitized.errorDescription || !sanitized.serialNumber) {
      alert('Vui lòng nhập Số Seri thiết bị và Diễn giải lỗi!');
      return;
    }

    // Format validation
    const serialCheck = validateSerial(sanitized.serialNumber);
    if (!serialCheck.valid) {
      alert(serialCheck.error);
      return;
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
                    <td>{ticket.date}</td>
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
                    <span className="mobile-card-value">{ticket.date}</span>
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
      {showModal && createPortal(
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
                <div className="responsive-form-grid">
                  <div className="form-group">
                    <label className="form-label">🏢 1. Tên Nhà Phân Phối (NPP) *</label>
                    <select className="form-select" required value={formData.nppId} onChange={e => setFormData({ ...formData, nppId: e.target.value })}>
                      <option value="">-- Chọn NPP từ danh sách --</option>
                      {npps.map(n => (
                        <option key={n.id} value={n.id}>[{n.id}] {n.name} - {n.region}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">🏷️ 2. Số Seri Thiết Bị (Serial) *</label>
                    <input type="text" className="form-input" required placeholder="Nhập số seri duy nhất..." value={formData.serialNumber} onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} />
                  </div>
                </div>

                <div className="responsive-form-grid">
                  <div className="form-group">
                    <label className="form-label">⚙️ 3. Phân Loại Sản Phẩm & Model *</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select className="form-select" style={{ flex: 1 }} value={formData.productCategory} onChange={e => setFormData({ ...formData, productCategory: e.target.value })}>
                        {PRODUCT_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <select className="form-select" style={{ flex: 1 }} value={formData.machineModel} onChange={e => setFormData({ ...formData, machineModel: e.target.value })}>
                        {MACHINE_MODELS.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">⚠️ 4. Phân Loại Tên Lỗi</label>
                    <input type="text" className="form-input" placeholder="Nghẹt vòi, hỏng bo, rò rỉ tinh màu..." value={formData.errorCategory} onChange={e => setFormData({ ...formData, errorCategory: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">📝 5. Diễn Giải Mô Tả Lỗi Chi Tiết *</label>
                  <textarea className="form-textarea" rows={2} required placeholder="Mô tả hiện trạng hỏng hóc thực tế..." value={formData.errorDescription} onChange={e => setFormData({ ...formData, errorDescription: e.target.value })} />
                </div>

                {/* Processing Directions & Statuses */}
                <div style={{ padding: '12px 14px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '8px' }}>
                    🛠️ Phương Án & Tình Trạng Xử Lý
                  </div>

                  <div className="responsive-form-grid" style={{ marginBottom: '8px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Hướng Xử Lý</label>
                      <select className="form-select" value={formData.actionDirection} onChange={e => setFormData({ ...formData, actionDirection: e.target.value })}>
                        <option value="Sửa chữa">Sửa chữa</option>
                        <option value="Xuất đổi">Xuất đổi máy khác</option>
                      </select>
                    </div>

                    {formData.actionDirection === 'Xuất đổi' && (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Tình Trạng Máy Xuất Đổi</label>
                        <select className="form-select" value={formData.replacementCondition} onChange={e => setFormData({ ...formData, replacementCondition: e.target.value })}>
                          <option value="Mới">Mới (Đổi máy mới 100%)</option>
                          <option value="Cũ">Cũ (Đổi máy cũ chạy tốt)</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="responsive-form-grid">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Tình Trạng Sửa</label>
                      <select className="form-select" value={formData.processingStatus} onChange={e => setFormData({ ...formData, processingStatus: e.target.value })}>
                        <option value="Chưa xử lý">⏳ Chưa xử lý (Đang sửa/chờ linh kiện)</option>
                        <option value="Đã xử lý">✓ Đã xử lý (Khắc phục xong)</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Gửi Trả Khách</label>
                      <select className="form-select" value={formData.customerReturnStatus} onChange={e => setFormData({ ...formData, customerReturnStatus: e.target.value })}>
                        <option value="Chưa gửi trả">📦 Chưa gửi trả (Kho trung tâm)</option>
                        <option value="Đã gửi trả">✓ Đã gửi trả (Đã giao lại NPP)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECONDARY METADATA - BOTTOM OF FORM */}
                <div className="responsive-form-grid" style={{ paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                  <div className="form-group">
                    <label className="form-label">📅 Ngày Đi Xử Lý</label>
                    <input type="date" className="form-input" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">👤 Kỹ Thuật Viên Phụ Trách</label>
                    <input type="text" className="form-input" required placeholder="Tên KTV đi xử lý..." value={formData.technician} onChange={e => setFormData({ ...formData, technician: e.target.value })} />
                  </div>
                </div>

                {/* Photo Capture Section */}
                <div className="form-group">
                  <label className="form-label">📸 Chụp Ảnh Hiện Trường Lỗi & Linh Kiện Hỏng</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                      <Camera size={16} />
                      <span>Chụp / Upload Ảnh Lỗi</span>
                      <input type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} />
                    </label>
                  </div>

                  {formData.photos && formData.photos.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
                      {formData.photos.map((url, idx) => (
                        <div key={idx} style={{ position: 'relative', width: '100%', height: '70px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                          <img src={url} alt="Error photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
        </div>,
        document.body
      )}

      {/* VIEW TICKET DETAIL MODAL */}
      {selectedTicket && createPortal(
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
              
              <div className="ticket-detail-grid" style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                <div><strong>Ngày Xử Lý:</strong> {selectedTicket.date}</div>
                <div><strong>Kỹ Thuật Viên:</strong> {selectedTicket.technician}</div>
                <div style={{ gridColumn: 'span 2' }}><strong>Nhà Phân Phối:</strong> {selectedTicket.nppName}</div>
                <div><strong>Sản Phẩm:</strong> {selectedTicket.productCategory}</div>
                <div><strong>Loại Máy / Model:</strong> {selectedTicket.machineModel}</div>
                <div><strong>Số Seri:</strong> <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{selectedTicket.serialNumber}</span></div>
                <div><strong>Hướng Xử Lý:</strong> {selectedTicket.actionDirection} {selectedTicket.actionDirection === 'Xuất đổi' ? `(${selectedTicket.replacementCondition})` : ''}</div>
                <div><strong>Tình Trạng Sửa:</strong> {selectedTicket.processingStatus}</div>
                <div><strong>Gửi Trả Khách:</strong> {selectedTicket.customerReturnStatus}</div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontWeight: '700', marginBottom: '6px' }}>Diễn Giải Lỗi Hiện Trường:</h4>
                <p style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.1)', borderLeft: '3px solid var(--accent-amber)', borderRadius: '4px', fontSize: '0.9rem' }}>
                  {selectedTicket.errorDescription}
                </p>
              </div>

              {selectedTicket.photos && selectedTicket.photos.length > 0 && (
                <div>
                  <h4 style={{ fontWeight: '700', marginBottom: '8px' }}>Hình Ảnh Linh Kiện Lỗi:</h4>
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
      )}

    </div>
  );
}
