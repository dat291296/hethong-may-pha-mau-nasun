import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  PlusCircle, 
  Search, 
  Filter, 
  Phone, 
  MapPin, 
  Cpu, 
  Edit3, 
  Trash2, 
  Camera, 
  ExternalLink,
  Eye,
  X,
  Upload,
  Image as ImageIcon,
  FileSpreadsheet
} from 'lucide-react';

import { compressImage } from '../utils/imageCompressor.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getRobustUserLocation, fetchIpLocation } from '../utils/gpsHelper.js';
import GpsPermissionModal from './GpsPermissionModal.jsx';
import { useModalScrollLock } from '../hooks/useModalScrollLock.js';

export default function NppManagement({ npps, systemSets, onAddNpp, onEditNpp, onDeleteNpp, onOpenImportModal }) {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [selectedNpp, setSelectedNpp] = useState(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, regionFilter, statusFilter, brandFilter]);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNpp, setEditingNpp] = useState(null); // NPP object being edited

  // Lock body scroll & reset modal-body scrollTop to 0 when modal opens
  useModalScrollLock(showAddModal || !!editingNpp || !!selectedNpp);

  // Form State (For both Add & Edit)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    brand: 'Nasun',
    region: 'Miền Bắc',
    province: 'Hà Nội',
    address: '',
    locationCoordinates: '',
    contactPerson: '',
    salesperson: '',
    status: 'Đang hợp tác',
    photos: []
  });

  const filteredNpps = npps.filter(npp => {
    const matchesSearch = npp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          npp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          npp.phone.includes(searchTerm) ||
                          npp.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (npp.salesperson && npp.salesperson.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRegion = regionFilter === 'ALL' || npp.region === regionFilter;
    const matchesStatus = statusFilter === 'ALL' || npp.status === statusFilter;
    const matchesBrand = brandFilter === 'ALL' || (npp.brand || 'Nasun') === brandFilter;
    return matchesSearch && matchesRegion && matchesStatus && matchesBrand;
  });

  const isRegionAllowed = (nppRegion) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'qc') {
      return user.managedRegion === 'Toàn Quốc' || user.managedRegion === nppRegion;
    }
    return false;
  };

  const handleOpenAdd = () => {
    const defaultRegion = (user?.role === 'qc' && user?.managedRegion !== 'Toàn Quốc') ? user.managedRegion : 'Miền Bắc';
    setFormData({
      name: '',
      phone: '',
      brand: 'Nasun',
      region: defaultRegion,
      province: 'Hà Nội',
      address: '',
      locationCoordinates: '',
      contactPerson: '',
      salesperson: '',
      status: 'Đang hợp tác',
      photos: []
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (npp) => {
    if (!isRegionAllowed(npp.region)) {
      alert(`Bạn không có quyền chỉnh sửa NPP ở khu vực ${npp.region}!`);
      return;
    }
    setEditingNpp(npp);
    setFormData({
      name: npp.name || '',
      phone: npp.phone || '',
      brand: npp.brand || 'Nasun',
      region: npp.region || 'Miền Bắc',
      province: npp.province || 'Hà Nội',
      address: npp.address || '',
      locationCoordinates: npp.locationCoordinates || '',
      contactPerson: npp.contactPerson || '',
      salesperson: npp.salesperson || '',
      status: npp.status || 'Đang hợp tác',
      photos: npp.photos || []
    });
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

  // GPS & Permission states
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [gpsStatusMsg, setGpsStatusMsg] = useState('');
  const [showGpsPermissionModal, setShowGpsPermissionModal] = useState(false);
  const [isNonSecureContext, setIsNonSecureContext] = useState(false);

  const handleGetLocation = async (e) => {
    if (e) e.preventDefault();
    setIsGpsLoading(true);
    setGpsStatusMsg('Đang lấy vị trí...');

    const res = await getRobustUserLocation({ allowIpFallback: true });
    setIsGpsLoading(false);

    if (res.success && res.lat && res.lng) {
      setFormData(prev => ({
        ...prev,
        locationCoordinates: `${res.lat}, ${res.lng}`
      }));

      let sourceName = 'GPS Phần Cứng';
      if (res.source === 'GPS_LOW') sourceName = 'GPS Chuẩn (Cellular/Wi-Fi)';
      if (res.source === 'IP_FALLBACK') sourceName = 'Định Vị IP Dự Phòng';

      setGpsStatusMsg(`📍 Tự động ghi nhận (${sourceName})`);
    } else {
      if (res.isPermissionDenied || res.isNonSecureContext) {
        setIsNonSecureContext(res.isNonSecureContext);
        setShowGpsPermissionModal(true);
      } else {
        alert(res.errorMessage || 'Không thể lấy vị trí định vị.');
      }
      setGpsStatusMsg('');
    }
  };

  const handleRetryIpFallback = async () => {
    setIsGpsLoading(true);
    setGpsStatusMsg('Đang định vị qua IP dự phòng...');
    const ipRes = await fetchIpLocation('Người dùng chọn định vị IP dự phòng.');
    setIsGpsLoading(false);

    if (ipRes.success && ipRes.lat && ipRes.lng) {
      setFormData(prev => ({
        ...prev,
        locationCoordinates: `${ipRes.lat}, ${ipRes.lng}`
      }));
      setGpsStatusMsg('📍 Đã cập nhật vị trí IP dự phòng');
    } else {
      alert(ipRes.errorMessage || 'Không thể định vị qua IP dự phòng.');
      setGpsStatusMsg('');
    }
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert('Vui lòng nhập tên NPP và Số điện thoại!');
      return;
    }

    if (!isRegionAllowed(formData.region)) {
      alert(`Bạn không có quyền thêm NPP mới ở khu vực ${formData.region}!`);
      return;
    }

    const regionCode = formData.region === 'Miền Bắc' ? 'MB' : formData.region === 'Miền Trung' ? 'MT' : 'MN';
    const regionNpps = npps.filter(n => n.region === formData.region);
    const seq = String(regionNpps.length + 1).padStart(3, '0');
    const newId = `NPP-${regionCode}-${seq}`;
    const mapsUrl = formData.locationCoordinates 
      ? `https://maps.google.com/?q=${encodeURIComponent(formData.locationCoordinates)}`
      : '';

    onAddNpp({
      ...formData,
      id: newId,
      googleMapsUrl: mapsUrl,
      createdAt: new Date().toISOString().split('T')[0]
    });

    setShowAddModal(false);
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editingNpp) return;

    if (!isRegionAllowed(formData.region)) {
      alert(`Bạn không có quyền chuyển đổi NPP sang khu vực ${formData.region}!`);
      return;
    }
    if (!isRegionAllowed(editingNpp.region)) {
      alert(`Bạn không có quyền chỉnh sửa NPP ở khu vực ${editingNpp.region}!`);
      return;
    }

    const mapsUrl = formData.locationCoordinates 
      ? `https://maps.google.com/?q=${encodeURIComponent(formData.locationCoordinates)}`
      : '';

    onEditNpp({
      ...editingNpp,
      ...formData,
      googleMapsUrl: mapsUrl
    });

    setEditingNpp(null);
  };

  const handleDelete = (npp) => {
    if (!isRegionAllowed(npp.region)) {
      alert(`Bạn không có quyền xóa NPP ở khu vực ${npp.region}!`);
      return;
    }
    if (confirm(`Bạn có chắc chắn muốn xóa Nhà Phân Phối "${npp.name}" (${npp.id}) khỏi hệ thống?`)) {
      onDeleteNpp(npp.id);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Search & Action Bar */}
      <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Tìm theo Mã, Tên NPP, SĐT..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '36px', height: '38px', fontSize: '0.85rem', width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Filter size={16} color="var(--text-muted)" />
            <select className="form-select" value={brandFilter} onChange={e => setBrandFilter(e.target.value)} style={{ height: '38px', fontSize: '0.85rem' }}>
              <option value="ALL">Tất Cả Hãng (Nasun / Natos)</option>
              <option value="Nasun">Hãng Nasun</option>
              <option value="Natos">Hãng Natos</option>
            </select>

            <select className="form-select" value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ height: '38px', fontSize: '0.85rem' }}>
              <option value="ALL">Tất Cả Khu Vực</option>
              <option value="Miền Bắc">Miền Bắc</option>
              <option value="Miền Trung">Miền Trung</option>
              <option value="Miền Nam">Miền Nam</option>
            </select>

            <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: '38px', fontSize: '0.85rem' }}>
              <option value="ALL">Tất Cả Trạng Thái</option>
              <option value="Đang hợp tác">Đang hợp tác</option>
              <option value="Đã ngưng hợp tác">Đã ngưng hợp tác</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={onOpenImportModal}>
            <FileSpreadsheet size={18} color="var(--accent-emerald)" />
            <span>📥 Import Từ Excel</span>
          </button>
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <PlusCircle size={18} />
            <span>Thêm Nhà Phân Phối Mới</span>
          </button>
        </div>
      </div>

      {/* Active Filter Chips */}
      {(searchTerm || regionFilter !== 'ALL' || statusFilter !== 'ALL' || brandFilter !== 'ALL') && (
        <div className="active-filter-chips">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>Bộ lọc đang chọn:</span>
          {searchTerm && (
            <div className="filter-chip">
              <span>🔍 "{searchTerm}"</span>
              <span className="filter-chip-remove" onClick={() => setSearchTerm('')}>✕</span>
            </div>
          )}
          {brandFilter !== 'ALL' && (
            <div className="filter-chip">
              <span>🎨 {brandFilter}</span>
              <span className="filter-chip-remove" onClick={() => setBrandFilter('ALL')}>✕</span>
            </div>
          )}
          {regionFilter !== 'ALL' && (
            <div className="filter-chip">
              <span>📍 {regionFilter}</span>
              <span className="filter-chip-remove" onClick={() => setRegionFilter('ALL')}>✕</span>
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
            onClick={() => { setSearchTerm(''); setRegionFilter('ALL'); setStatusFilter('ALL'); setBrandFilter('ALL'); }}
          >
            Xóa tất cả bộ lọc
          </button>
        </div>
      )}

      {/* NPP Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {filteredNpps
          .slice((currentPage - 1) * pageSize, currentPage * pageSize)
          .map((npp) => {
          const assignedSets = systemSets.filter(s => s.nppId === npp.id);
          return (
            <div key={npp.id} className="glass-panel glass-panel-hover" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>{npp.id}</span>
                    <span className="badge" style={{
                      background: (npp.brand || 'Nasun') === 'Natos' ? 'rgba(168, 85, 247, 0.18)' : 'rgba(6, 182, 212, 0.18)',
                      color: (npp.brand || 'Nasun') === 'Natos' ? '#c084fc' : '#22d3ee',
                      border: (npp.brand || 'Nasun') === 'Natos' ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(6, 182, 212, 0.4)',
                      fontWeight: '700'
                    }}>
                      {npp.brand || 'Nasun'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {npp.status === 'Đang hợp tác' ? (
                      <span className="badge badge-success">✓ Đang hợp tác</span>
                    ) : (
                      <span className="badge badge-neutral">✕ Đã ngưng</span>
                    )}

                    {/* Edit & Delete Action Buttons */}
                    {isRegionAllowed(npp.region) ? (
                      <>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          style={{ padding: '4px 8px' }}
                          title="Sửa thông tin NPP"
                          onClick={() => handleOpenEdit(npp)}
                        >
                          <Edit3 size={14} color="var(--accent-cyan)" />
                        </button>
                        <button 
                          className="btn btn-danger btn-sm" 
                          style={{ padding: '4px 8px' }}
                          title="Xóa NPP"
                          onClick={() => handleDelete(npp)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }} title="Không phụ trách khu vực này">
                        🔒 {npp.region}
                      </span>
                    )}
                  </div>
                </div>

                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '8px' }}>
                  {npp.name}
                </h3>

                <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Phone size={14} color="var(--accent-cyan)" />
                    <span>{npp.phone} ({npp.contactPerson || 'Đại diện'})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <MapPin size={14} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{npp.province} ({npp.region})</span>
                  </div>

                  {/* Salesperson */}
                  {npp.salesperson && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem' }}>💼</span>
                      <span style={{ color: 'var(--accent-emerald)', fontWeight: '600' }}>KD: {npp.salesperson}</span>
                    </div>
                  )}

                  {/* Location Coordinates & Google Maps Link */}
                  {npp.locationCoordinates && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <span className="badge badge-purple" style={{ fontSize: '0.675rem' }}>📍 {npp.locationCoordinates}</span>
                      <a 
                        href={npp.googleMapsUrl || `https://maps.google.com/?q=${encodeURIComponent(npp.locationCoordinates)}`} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '2px', textDecoration: 'none' }}
                      >
                        <span>Vị Trí Maps</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}

                  {/* Photos count */}
                  {npp.photos && npp.photos.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--accent-emerald)', marginTop: '2px' }}>
                      <ImageIcon size={14} />
                      <span>{npp.photos.length} Ảnh Mặt Bằng/Lắp Máy</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                  <Cpu size={16} color="var(--accent-blue)" />
                  <span style={{ fontWeight: '700' }}>{assignedSets.length}</span>
                  <span style={{ color: 'var(--text-muted)' }}>Bộ Máy Cấp Phát</span>
                </div>

                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedNpp(npp)}>
                  <Eye size={14} />
                  <span>Chi Tiết Máy & Ảnh</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Footer */}
      {(() => {
        const totalCount = filteredNpps.length;
        const totalPages = Math.ceil(totalCount / pageSize) || 1;
        const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
        const endItem = Math.min(currentPage * pageSize, totalCount);

        return (
          <div className="pagination-bar">
            <div className="pagination-info">
              Hiển thị <strong>{startItem}–{endItem}</strong> trong tổng số <strong>{totalCount}</strong> Nhà Phân Phối
              <select 
                className="form-select" 
                value={pageSize} 
                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                style={{ marginLeft: '12px', padding: '2px 8px', fontSize: '0.8rem', width: 'auto', display: 'inline-block' }}
              >
                <option value={12}>12 NPP/trang</option>
                <option value={24}>24 NPP/trang</option>
                <option value={48}>48 NPP/trang</option>
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
      })()}

      {/* ADD / EDIT NPP MODAL */}
      {(showAddModal || editingNpp) && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <h3 style={{ fontWeight: '800' }}>
                {editingNpp ? `Chỉnh Sửa Thông Tin NPP [${editingNpp.id}]` : 'Thêm Nhà Phân Phối (NPP) Mới'}
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddModal(false); setEditingNpp(null); }}>✕</button>
            </div>
            <form onSubmit={editingNpp ? handleEditSubmit : handleAddSubmit}>
              <div className="modal-body" ref={el => { if (el) el.scrollTop = 0; }}>
                
                {/* PRIMARY EDIT FIELDS - TOP OF FORM */}
                <div className="responsive-form-grid">
                  <div className="form-group">
                    <label className="form-label">🏢 Tên Nhà Phân Phối *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      placeholder="Nhập tên NPP / Đại lý..." 
                      value={formData.name} 
                      onChange={e => setFormData({ ...formData, name: e.target.value })} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">📞 Số Điện Thoại *</label>
                    <input type="text" className="form-input" required placeholder="09xx xxx xxx" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                </div>

                <div className="responsive-form-grid">
                  <div className="form-group">
                    <label className="form-label">👤 Người Liên Hệ / Chủ Đại Lý</label>
                    <input type="text" className="form-input" placeholder="Tên người đại diện..." value={formData.contactPerson} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">💼 Nhân Viên Kinh Doanh Phụ Trách</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Tên nhân viên kinh doanh..."
                      value={formData.salesperson}
                      onChange={e => setFormData({ ...formData, salesperson: e.target.value })}
                    />
                  </div>
                </div>

                <div className="responsive-form-grid">
                  <div className="form-group">
                    <label className="form-label">📍 Khu Vực</label>
                    <select 
                      className="form-select" 
                      value={formData.region} 
                      disabled={user?.role === 'qc' && user?.managedRegion !== 'Toàn Quốc'}
                      onChange={e => setFormData({ ...formData, region: e.target.value })}
                    >
                      <option value="Miền Bắc">Miền Bắc</option>
                      <option value="Miền Trung">Miền Trung</option>
                      <option value="Miền Nam">Miền Nam</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">🏙️ Tỉnh / Thành Phố</label>
                    <input type="text" className="form-input" placeholder="Hà Nội, TP.HCM, Hải Phòng..." value={formData.province} onChange={e => setFormData({ ...formData, province: e.target.value })} />
                  </div>
                </div>

                <div className="responsive-form-grid">
                  <div className="form-group">
                    <label className="form-label">🎨 Hãng Phân Phối / Hãng Sơn *</label>
                    <select
                      className="form-select"
                      value={formData.brand || 'Nasun'}
                      onChange={e => setFormData({ ...formData, brand: e.target.value })}
                    >
                      <option value="Nasun">Nasun</option>
                      <option value="Natos">Natos</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">⚡ Trạng Thái Hoạt Động</label>
                    <select className="form-select" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                      <option value="Đang hợp tác">Đang hợp tác</option>
                      <option value="Đã ngưng hợp tác">Đã ngưng hợp tác</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">🏠 Địa Chỉ Chi Tiết</label>
                  <input type="text" className="form-input" placeholder="Số nhà, đường, phường/xã..." value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                </div>

                {/* GPS Location & Maps Coordinates */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>
                      <span>📍 Vị Trí / Tọa Độ GPS (Cho Kỹ Thuật Viên)</span>
                    </label>
                    <button 
                      type="button" 
                      onClick={handleGetLocation} 
                      disabled={isGpsLoading}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.725rem',
                        fontWeight: '700',
                        color: 'var(--accent-cyan)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        background: 'rgba(6, 182, 212, 0.08)',
                        borderRadius: '6px',
                        cursor: isGpsLoading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                        opacity: isGpsLoading ? 0.7 : 1
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(6, 182, 212, 0.15)'}
                      onMouseOut={e => e.currentTarget.style.background = 'rgba(6, 182, 212, 0.08)'}
                    >
                      <span>{isGpsLoading ? '⌛ Đang lấy vị trí...' : '📍 Lấy GPS Tự Động'}</span>
                    </button>
                  </div>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ví dụ: 21.0024, 105.8412 hoặc dán Link Google Maps..." 
                    value={formData.locationCoordinates} 
                    onChange={e => setFormData({ ...formData, locationCoordinates: e.target.value })} 
                  />
                  {gpsStatusMsg && (
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#10b981', marginTop: '4px' }}>
                      {gpsStatusMsg}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Trạng Thái Hoạt Động</label>
                  <select className="form-select" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                    <option value="Đang hợp tác">Đang hợp tác</option>
                    <option value="Đã ngưng hợp tác">Đã ngưng hợp tác</option>
                  </select>
                </div>

                {/* Photo Upload Section */}
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <label className="form-label" style={{ marginBottom: '8px' }}>
                    <span>📸 Hình Ảnh Minh Họa / Ảnh Mặt Bằng Lắp Đặt Tại NPP</span>
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                      <Camera size={16} />
                      <span>Chụp / Tải Ảnh Lên</span>
                      <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} />
                    </label>
                  </div>

                  {formData.photos && formData.photos.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px' }}>
                      {formData.photos.map((url, idx) => (
                        <div key={idx} style={{ position: 'relative', width: '100%', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                          <img src={url} alt="NPP photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(idx)}
                            style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddModal(false); setEditingNpp(null); }}>Hủy Bỏ</button>
                <button type="submit" className="btn btn-primary">{editingNpp ? 'Cập Nhật NPP' : 'Lưu NPP Mới'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NPP DETAIL & PHOTO GALLERY MODAL */}
      {selectedNpp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <div>
                <span className="badge badge-info">{selectedNpp.id}</span>
                <h3 style={{ fontWeight: '800', marginTop: '4px' }}>{selectedNpp.name}</h3>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedNpp(null)}>✕</button>
            </div>
            <div className="modal-body">
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div><strong>Hãng:</strong> <span className="badge badge-purple" style={{ fontSize: '0.8rem' }}>{selectedNpp.brand || 'Nasun'}</span></div>
                <div><strong>Khu Vực:</strong> {selectedNpp.region} ({selectedNpp.province})</div>
                <div style={{ gridColumn: 'span 2' }}><strong>SĐT Liên Hệ:</strong> {selectedNpp.phone} ({selectedNpp.contactPerson || 'Đại diện'})</div>
                {selectedNpp.salesperson && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <strong>💼 Nhân Viên KD Phụ Trách:</strong> 
                    <span style={{ color: 'var(--accent-emerald)', fontWeight: '600' }}>{selectedNpp.salesperson}</span>
                  </div>
                )}
                <div style={{ gridColumn: 'span 2' }}>
                  <strong>Địa Chỉ:</strong> {selectedNpp.address}
                </div>
                
                {selectedNpp.locationCoordinates && (
                  <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <strong>Vị Trí Tọa Độ GPS:</strong>
                    <span className="badge badge-purple">📍 {selectedNpp.locationCoordinates}</span>
                    <a 
                      href={selectedNpp.googleMapsUrl || `https://maps.google.com/?q=${encodeURIComponent(selectedNpp.locationCoordinates)}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="btn btn-primary btn-sm"
                    >
                      <span>📍 Định Vị Google Maps</span>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                )}
              </div>

              {/* Photos Gallery */}
              {selectedNpp.photos && selectedNpp.photos.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Camera size={18} color="var(--accent-cyan)" />
                    <span>Hình Ảnh Minh Họa Mặt Bằng / Lắp Máy ({selectedNpp.photos.length} Ảnh):</span>
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                    {selectedNpp.photos.map((url, idx) => (
                      <a key={idx} href={url} target="_blank" rel="noreferrer" style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', height: '130px', display: 'block' }}>
                        <img src={url} alt="NPP photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <h4 style={{ fontWeight: '700', marginBottom: '12px' }}>Danh Sách Bộ Máy Pha Màu Tại NPP Này:</h4>
              {systemSets.filter(s => s.nppId === selectedNpp.id).length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có bộ máy pha màu nào được cấp phát cho NPP này.</div>
              ) : (
                <>
                  <div className="desktop-only data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Mã Bộ Máy</th>
                          <th>Máy Chiết</th>
                          <th>Máy Lắc</th>
                          <th>Máy Tính</th>
                          <th>Ổn Áp</th>
                          <th>Trạng Thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {systemSets.filter(s => s.nppId === selectedNpp.id).map(set => (
                          <tr key={set.id}>
                            <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{set.setCode}</td>
                            <td>{set.dispenserModel} ({set.dispenserSerial})</td>
                            <td>{set.mixerModel} ({set.mixerSerial})</td>
                            <td>{set.pcType} ({set.pcOs})</td>
                            <td>{set.stabilizer}</td>
                            <td><span className="badge badge-success">● {set.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mobile-only mobile-card-list">
                    {systemSets.filter(s => s.nppId === selectedNpp.id).map(set => (
                      <div className="mobile-card" key={set.id} style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
                        <div className="mobile-card-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginBottom: '6px' }}>
                          <span className="mobile-card-title" style={{ color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>{set.setCode}</span>
                          <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>{set.status}</span>
                        </div>
                        <div className="mobile-card-body" style={{ gap: '4px' }}>
                          <div className="mobile-card-row" style={{ fontSize: '0.8rem' }}>
                            <span className="mobile-card-label">Máy Chiết:</span>
                            <span className="mobile-card-value">{set.dispenserModel} ({set.dispenserSerial})</span>
                          </div>
                          <div className="mobile-card-row" style={{ fontSize: '0.8rem' }}>
                            <span className="mobile-card-label">Máy Lắc:</span>
                            <span className="mobile-card-value">{set.mixerModel} ({set.mixerSerial})</span>
                          </div>
                          <div className="mobile-card-row" style={{ fontSize: '0.8rem' }}>
                            <span className="mobile-card-label">Máy Tính:</span>
                            <span className="mobile-card-value">{set.pcType} ({set.pcOs})</span>
                          </div>
                          <div className="mobile-card-row" style={{ fontSize: '0.8rem' }}>
                            <span className="mobile-card-label">Ổn Áp:</span>
                            <span className="mobile-card-value">{set.stabilizer}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedNpp(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* GPS Permission Guidance Modal */}
      <GpsPermissionModal 
        isOpen={showGpsPermissionModal}
        onClose={() => setShowGpsPermissionModal(false)}
        onRetryIpFallback={handleRetryIpFallback}
        isNonSecureContext={isNonSecureContext}
      />

    </div>
  );
}
