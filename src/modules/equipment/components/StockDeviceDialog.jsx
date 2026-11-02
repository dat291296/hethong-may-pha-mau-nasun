import DraftNotice from '../../../shared/components/DraftNotice.jsx';
import React from 'react';
import { Camera } from 'lucide-react';

export default function StockDeviceDialog({ addDeviceCategory, addFormData, closeStockEditor, handleAddDeviceSubmit, isSavingDevice, modelOptions, setAddFormData, setScanTargetField, setShowScanSerialModal, showAddDeviceModal, stockDraft }) {
  return (<>{/* ADD STOCK DEVICE MODAL */}
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
              <button className="btn btn-secondary btn-sm" onClick={closeStockEditor} disabled={isSavingDevice}>✕</button>
            </div>
            <form onSubmit={handleAddDeviceSubmit}>
              <div className="modal-body"><DraftNotice draft={stockDraft} />
                <div style={{ padding: '12px', marginBottom: '14px', borderRadius: '8px', background: 'rgba(56,189,248,0.10)', border: '1px solid rgba(56,189,248,0.35)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  💡 Gợi ý nhập kho: chọn model và tình trạng thiết bị. Mã QL tự tăng theo loại máy và tiếp tục từ mã lớn nhất đã có. Số seri là tùy chọn; thiết bị thiếu seri sẽ được cảnh báo khi ghép bộ (trừ máy tính).
                </div>

                {/* Mã QL (ID) */}
                <div className="form-group">
                  <label className="form-label">
                    Mã Quản Lý (Mã QL) <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(Tự động theo loại)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Tự động tạo"
                    value={addFormData.id || ''}
                    readOnly
                    aria-readonly="true"
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
                    <input className="form-input" aria-label="Model thiết bị mới" list={`stock-models-${addDeviceCategory}`} placeholder="Chọn hoặc nhập model mới" maxLength={120} required value={addFormData.model} onChange={e => setAddFormData({ ...addFormData, model: e.target.value })} />
                    <datalist id={`stock-models-${addDeviceCategory}`}>{modelOptions(addDeviceCategory).map(model => <option key={model} value={model} />)}</datalist>
                  </div>
                )}

                {/* Serial - Ẩn hoàn toàn đối với Máy tính */}
                {addDeviceCategory !== 'computer' && (
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>
                        Số Seri (Serial Number) <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>(Tùy chọn)</span>
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
                      placeholder="Có thể để trống hoặc bấm Quét mã vạch"
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
                <button type="button" className="btn btn-secondary" onClick={closeStockEditor} disabled={isSavingDevice}>Hủy Bỏ</button>
                <button type="submit" className="btn btn-primary" disabled={isSavingDevice || Boolean(stockDraft.existing)}>✅ Thêm Vào Kho</button>
              </div>
            </form>
          </div>
        </div>
      )}

      </>);
}
