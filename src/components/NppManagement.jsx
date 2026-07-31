import React, { useState } from 'react';
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

export default function NppManagement({ npps, systemSets, onAddNpp, onEditNpp, onDeleteNpp, onOpenImportModal }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedNpp, setSelectedNpp] = useState(null);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNpp, setEditingNpp] = useState(null); // NPP object being edited

  // Form State (For both Add & Edit)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    region: 'Miền Bắc',
    province: 'Hà Nội',
    address: '',
    locationCoordinates: '',
    contactPerson: '',
    status: 'Đang hợp tác',
    photos: []
  });

  const filteredNpps = npps.filter(npp => {
    const matchesSearch = npp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          npp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          npp.phone.includes(searchTerm) ||
                          npp.address.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRegion = regionFilter === 'ALL' || npp.region === regionFilter;
    const matchesStatus = statusFilter === 'ALL' || npp.status === statusFilter;
    return matchesSearch && matchesRegion && matchesStatus;
  });

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      phone: '',
      region: 'Miền Bắc',
      province: 'Hà Nội',
      address: '',
      locationCoordinates: '',
      contactPerson: '',
      status: 'Đang hợp tác',
      photos: []
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (npp) => {
    setEditingNpp(npp);
    setFormData({
      name: npp.name || '',
      phone: npp.phone || '',
      region: npp.region || 'Miền Bắc',
      province: npp.province || 'Hà Nội',
      address: npp.address || '',
      locationCoordinates: npp.locationCoordinates || '',
      contactPerson: npp.contactPerson || '',
      status: npp.status || 'Đang hợp tác',
      photos: npp.photos || []
    });
  };

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          photos: [...prev.photos, reader.result]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemovePhoto = (index) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  const handleGetLocation = (e) => {
    e.preventDefault();
    if (!navigator.geolocation) {
      alert("Trình duyệt không hỗ trợ lấy vị trí định vị.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        setFormData(prev => ({
          ...prev,
          locationCoordinates: `${lat}, ${lng}`
        }));
      },
      (error) => {
        let msg = "Lỗi lấy GPS: ";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg += "Quyền định vị bị từ chối.";
            break;
          case error.POSITION_UNAVAILABLE:
            msg += "Tín hiệu định vị không có sẵn.";
            break;
          case error.TIMEOUT:
            msg += "Hết thời gian chờ phản hồi GPS.";
            break;
          default:
            msg += error.message;
        }
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert('Vui lòng nhập tên NPP và Số điện thoại!');
      return;
    }

    const newId = `NPP-${formData.region === 'Miền Bắc' ? 'HN' : formData.region === 'Miền Trung' ? 'DN' : 'HCM'}-00${npps.length + 1}`;
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} color="var(--text-muted)" />
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

      {/* NPP Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
        {filteredNpps.map((npp) => {
          const assignedSets = systemSets.filter(s => s.nppId === npp.id);
          return (
            <div key={npp.id} className="glass-panel glass-panel-hover" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>{npp.id}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {npp.status === 'Đang hợp tác' ? (
                      <span className="badge badge-success">✓ Đang hợp tác</span>
                    ) : (
                      <span className="badge badge-neutral">✕ Đã ngưng</span>
                    )}

                    {/* Edit & Delete Action Buttons */}
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
                    <span>{npp.address} ({npp.region})</span>
                  </div>

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
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Tên Nhà Phân Phối *</label>
                  <input type="text" className="form-input" required placeholder="Nhập tên NPP / Đại lý..." value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Số Điện Thoại *</label>
                    <input type="text" className="form-input" required placeholder="09xx xxx xxx" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Người Liên Hệ / Chủ Đại Lý</label>
                    <input type="text" className="form-input" placeholder="Tên người đại diện..." value={formData.contactPerson} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Khu Vực</label>
                    <select className="form-select" value={formData.region} onChange={e => setFormData({ ...formData, region: e.target.value })}>
                      <option value="Miền Bắc">Miền Bắc</option>
                      <option value="Miền Trung">Miền Trung</option>
                      <option value="Miền Nam">Miền Nam</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tỉnh / Thành Phố</label>
                    <input type="text" className="form-input" placeholder="Hà Nội, TP.HCM, Hải Phòng..." value={formData.province} onChange={e => setFormData({ ...formData, province: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Địa Chỉ Chi Tiết</label>
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
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.725rem',
                        fontWeight: '700',
                        color: 'var(--accent-cyan)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        background: 'rgba(6, 182, 212, 0.08)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(6, 182, 212, 0.15)'}
                      onMouseOut={e => e.currentTarget.style.background = 'rgba(6, 182, 212, 0.08)'}
                    >
                      <span>📍 Lấy GPS Tự Động</span>
                    </button>
                  </div>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ví dụ: 21.0024, 105.8412 hoặc dán Link Google Maps..." 
                    value={formData.locationCoordinates} 
                    onChange={e => setFormData({ ...formData, locationCoordinates: e.target.value })} 
                  />
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
                <div><strong>Khu Vực:</strong> {selectedNpp.region} ({selectedNpp.province})</div>
                <div><strong>SĐT Liên Hệ:</strong> {selectedNpp.phone} ({selectedNpp.contactPerson || 'Đại diện'})</div>
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
                <div className="data-table-container">
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
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedNpp(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
