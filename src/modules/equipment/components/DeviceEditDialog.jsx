import DraftNotice from '../../../shared/components/DraftNotice.jsx';
import React from 'react';
import SafePortal from '../../../shared/components/SafePortal.jsx';
import { Camera } from 'lucide-react';

export default function DeviceEditDialog({ closeDeviceEditor, deviceDraft, editFormData, editingDevice, handleEditSubmit, isSavingDevice, modelOptions, selectedSetDetails, setEditFormData, setScanTargetField, setShowScanSerialModal, systemSets }) {
  return (<>{/* EDIT DEVICE MODAL */}
      {editingDevice && (
        <SafePortal>
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '580px' }}>
              <div className="modal-header">
                <h3 style={{ fontWeight: '800' }}>
                  Chỉnh Sửa Thông Tin {editingDevice.category === 'computer' ? `Máy Tính [Mã: ${editFormData.id}]` : `Thiết Bị [${editFormData.serial || 'Không seri'}]`}
                </h3>
                <button className="btn btn-secondary btn-sm" disabled={isSavingDevice} onClick={closeDeviceEditor}>✕</button>
              </div>
              <form onSubmit={handleEditSubmit}>
                <div className="modal-body" ref={el => { if (el) el.scrollTop = 0; }}><DraftNotice draft={deviceDraft} />

                  {/* ROW 1: SERIAL NUMBER & MODEL - TOP OF FORM */}
                  <div className="responsive-form-grid">
                    {editingDevice?.category !== 'computer' && (
                      <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label className="form-label" style={{ marginBottom: 0 }}>
                            🏷️ Số Seri (Serial) <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>{editingDevice.category === 'computer' ? '(giữ nguyên nếu để trống)' : '(có thể để trống)'}</span>
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
                          placeholder="Nhập seri hoặc bấm Quét mã"
                          aria-label="Số serial thiết bị"
                          required={false}
                          value={editFormData.serial || ''}
                          onChange={e => setEditFormData({ ...editFormData, serial: e.target.value })}
                        />
                      </div>
                    )}

                    {editingDevice.category !== 'computer' && (
                      <div className="form-group">
                        <label className="form-label">⚙️ Model / Hệ Máy *</label>
                        <input className="form-input" aria-label="Model thiết bị" list={`edit-models-${editingDevice.category}`} placeholder="Chọn hoặc nhập model mới" maxLength={120} required value={editFormData.model || ''} onChange={e => setEditFormData({ ...editFormData, model: e.target.value })} />
                        <datalist id={`edit-models-${editingDevice.category}`}>{[...new Set([...modelOptions(editingDevice.category), editFormData.model].filter(Boolean))].map(model => <option key={model} value={model} />)}</datalist>
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
                        readOnly
                        aria-readonly="true"
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
                      { [['tintingSoftware', 'Phần mềm pha màu'], ['softwareVersion', 'Phiên bản phần mềm']].map(([key, label]) => (
                        <div className="form-group" key={key}>
                          <label className="form-label" htmlFor={`edit-computer-${key}`}>{label}</label>
                          <input id={`edit-computer-${key}`} className="form-input" maxLength={120} value={editFormData[key] || ''} onChange={event => setEditFormData(previous => ({ ...previous, [key]: event.target.value }))} />
                        </div>
                      ))}
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
                  {selectedSetDetails && <p className="resource-muted">Sửa thông tin giữ nguyên bộ máy đang gán. Dùng nút Thay thiết bị trong hồ sơ để chọn máy khác từ kho.</p>}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border-color)' }}>
                    <div className="responsive-form-grid">
                      <div className="form-group">
                        <label className="form-label">📌 Trạng Thái Cấp Phát</label>
                        <select
                          className="form-select"
                          disabled={Boolean(selectedSetDetails)}
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
                            disabled={Boolean(selectedSetDetails)}
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
                  <button type="button" className="btn btn-secondary" disabled={isSavingDevice} onClick={closeDeviceEditor}>{selectedSetDetails ? '← Quay lại hồ sơ máy' : 'Hủy Bỏ'}</button>
                  <button type="submit" className="btn btn-primary" disabled={isSavingDevice}>{isSavingDevice ? 'Đang lưu…' : 'Lưu Thay Đổi'}</button>
                </div>
              </form>
            </div>
          </div>
        </SafePortal>
      )}

      </>);
}
