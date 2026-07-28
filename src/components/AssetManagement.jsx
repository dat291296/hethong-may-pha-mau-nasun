import React, { useState } from 'react';
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
  FileSpreadsheet
} from 'lucide-react';

export default function AssetManagement({
  systemSets,
  dispensers,
  mixers,
  computers,
  printers,
  onAssembleSet,
  onAddStockDevice,
  onEditDevice,
  onDeleteDevice,
  onOpenImportModal
}) {
  const [activeSubTab, setActiveSubTab] = useState('comboSets'); // comboSets | dispensers | mixers | computers | printers
  const [modelFilter, setModelFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showAssembleModal, setShowAssembleModal] = useState(false);

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
  });

  const handleAssembleSubmit = (e) => {
    e.preventDefault();
    if (!newSetData.dispenserId || !newSetData.mixerId || !newSetData.computerId || !newSetData.printerId) {
      alert('Vui lòng chọn đủ 4 thiết bị: 1 Máy Chiết + 1 Máy Lắc + 1 Máy Tính + 1 Máy In QL700!');
      return;
    }
    onAssembleSet(newSetData);
    setShowAssembleModal(false);
    setNewSetData({ dispenserId: '', mixerId: '', computerId: '', printerId: '' });
  };

  const handleOpenEditDevice = (category, data) => {
    setEditingDevice({ category, data });
    setEditFormData({ ...data });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editingDevice) return;
    onEditDevice(editingDevice.category, editFormData);
    setEditingDevice(null);
  };

  const handleDeleteDevice = (category, item) => {
    if (item.isAssigned) {
      alert(`Không thể xóa thiết bị ${item.serial} vì đang được gán trong bộ máy ${item.setCode}. Vui lòng thu hồi bộ máy trước khi xóa!`);
      return;
    }
    if (confirm(`Bạn có chắc chắn muốn xóa thiết bị Seri [${item.serial}] khỏi kho?`)) {
      onDeleteDevice(category, item.id);
    }
  };

  const handleAddDeviceSubmit = (e) => {
    e.preventDefault();
    if (!addFormData.serial || !addFormData.model) {
      alert('Vui lòng nhập Model và Số Seri!');
      return;
    }
    onAddStockDevice(addDeviceCategory, addFormData);
    setShowAddDeviceModal(false);
  };

  const filteredSets = systemSets.filter(s => {
    const matchesModel = modelFilter === 'ALL' || s.dispenserModel === modelFilter;
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchesModel && matchesStatus;
  });

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
            <button className="btn btn-primary" onClick={() => setShowAssembleModal(true)}>
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

          {/* Combo Table */}
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã Bộ Máy</th>
                  <th>Nhà Phân Phối</th>
                  <th>Máy Chiết (Seri)</th>
                  <th>Máy Lắc (Seri)</th>
                  <th>Máy Tính (Loại/OS)</th>
                  <th>Máy In (Model/Seri)</th>
                  <th>Ổn Áp (Ghi Nhận)</th>
                  <th>Trạng Thái</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: RAW DISPENSERS STOCK */}
      {activeSubTab === 'dispensers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '14px' }}>Danh Mục Máy Chiết (Kho & Đã Cấp Phát)</h3>
          <div className="data-table-container">
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
                {dispensers.map(item => (
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
                    <td>{item.isAssigned ? <span className="badge badge-success">Đã gán bộ</span> : <span className="badge badge-neutral">Tự do trong kho</span>}</td>
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
        </div>
      )}

      {/* VIEW 3: RAW MIXERS STOCK */}
      {activeSubTab === 'mixers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '14px' }}>Danh Mục Máy Lắc (Kho & Đã Cấp Phát)</h3>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã QL</th>
                  <th>Hệ Máy</th>
                  <th>Loại Máy Lắc</th>
                  <th>Số Seri (Unique)</th>
                  <th>Tình Trạng Kỹ Thuật</th>
                  <th>Cấp Phát</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {mixers.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td style={{ fontWeight: '700' }}>{item.model}</td>
                    <td>{item.type}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{item.serial}</td>
                    <td><span className="badge badge-info">{item.status}</span></td>
                    <td>{item.isAssigned ? <span className="badge badge-success">Đã gán bộ</span> : <span className="badge badge-neutral">Tự do trong kho</span>}</td>
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
        </div>
      )}

      {/* VIEW 4: RAW COMPUTERS STOCK */}
      {activeSubTab === 'computers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800' }}>Danh Mục Máy Tính (Case & AIO)</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>*Lưu ý: Ổn áp do NPP tự mua nên trong kho máy tính không có ổn áp sẵn.</span>
          </div>
          <div className="data-table-container">
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
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {computers.map(item => (
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
        </div>
      )}

      {/* VIEW 5: RAW PRINTERS STOCK */}
      {activeSubTab === 'printers' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '14px' }}>Danh Mục Máy In (Model Chuẩn: QL700)</h3>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã QL</th>
                  <th>Model Máy In</th>
                  <th>Số Seri</th>
                  <th>Cổng Kết Nối</th>
                  <th>Tình Trạng</th>
                  <th>Cấp Phát</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {printers.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td style={{ fontWeight: '700' }}>{item.model}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{item.serial}</td>
                    <td>{item.connection}</td>
                    <td><span className="badge badge-info">{item.status}</span></td>
                    <td>{item.isAssigned ? <span className="badge badge-success">Đã gán bộ</span> : <span className="badge badge-neutral">Tự do trong kho</span>}</td>
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
        </div>
      )}

      {/* EDIT DEVICE MODAL */}
      {editingDevice && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3 style={{ fontWeight: '800' }}>Chỉnh Sửa Thông Tin Thiết Bị [{editFormData.serial}]</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingDevice(null)}>✕</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Model / Hệ Máy</label>
                  <input type="text" className="form-input" required value={editFormData.model || editFormData.type || ''} onChange={e => setEditFormData({ ...editFormData, model: e.target.value })} />
                </div>

                <div className="form-group">
                  <label className="form-label">Số Seri (Serial Number - Duy nhất)</label>
                  <input type="text" className="form-input" required value={editFormData.serial || ''} onChange={e => setEditFormData({ ...editFormData, serial: e.target.value })} />
                </div>

                <div className="form-group">
                  <label className="form-label">Tình Trạng Kỹ Thuật</label>
                  <select className="form-select" value={editFormData.status || 'Đang chạy tốt'} onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}>
                    <option value="Mới 100%">Mới 100%</option>
                    <option value="Đang chạy tốt">Đang chạy tốt</option>
                    <option value="Cần bảo trì">Cần bảo trì</option>
                    <option value="Hỏng đầu phun">Hỏng đầu phun / Hư hỏng</option>
                  </select>
                </div>

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

                <div className="form-group">
                  <label className="form-label">1. Chọn Máy Chiết Trong Kho *</label>
                  <select className="form-select" required value={newSetData.dispenserId} onChange={e => setNewSetData({ ...newSetData, dispenserId: e.target.value })}>
                    <option value="">-- Chọn máy chiết từ kho --</option>
                    {dispensers.filter(d => !d.isAssigned).map(d => (
                      <option key={d.id} value={d.id}>{d.model} - Seri: {d.serial} ({d.status})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">2. Chọn Máy Lắc Trong Kho *</label>
                  <select className="form-select" required value={newSetData.mixerId} onChange={e => setNewSetData({ ...newSetData, mixerId: e.target.value })}>
                    <option value="">-- Chọn máy lắc từ kho --</option>
                    {mixers.filter(m => !m.isAssigned).map(m => (
                      <option key={m.id} value={m.id}>{m.model} ({m.type}) - Seri: {m.serial}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">3. Chọn Máy Tính Trong Kho *</label>
                  <select className="form-select" required value={newSetData.computerId} onChange={e => setNewSetData({ ...newSetData, computerId: e.target.value })}>
                    <option value="">-- Chọn máy tính từ kho --</option>
                    {computers.filter(c => !c.isAssigned).map(c => (
                      <option key={c.id} value={c.id}>{c.type} ({c.os}) - Seri: {c.serial}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">4. Chọn Máy In QL700 *</label>
                  <select className="form-select" required value={newSetData.printerId} onChange={e => setNewSetData({ ...newSetData, printerId: e.target.value })}>
                    <option value="">-- Chọn máy in QL700 --</option>
                    {printers.filter(p => !p.isAssigned).map(p => (
                      <option key={p.id} value={p.id}>{p.model} - Cổng {p.connection} - Seri: {p.serial}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssembleModal(false)}>Hủy Bỏ</button>
                <button type="submit" className="btn btn-primary">Xác Nhận Tạo Bộ Combo</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
