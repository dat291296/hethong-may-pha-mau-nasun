import { matchesSearch } from '../../../shared/workspace/workspaceFilters.js';
import DraftNotice from '../../../shared/components/DraftNotice.jsx';
import React from 'react';
import SafePortal from '../../../shared/components/SafePortal.jsx';
import { PlusCircle, Camera } from 'lucide-react';

export default function SystemSetEditDialog({ closeSetEditor, editNppSearchTerm, editSetFormData, editingSet, handleEditSetSubmit, handleRemoveEditSetPhoto, handleUploadEditSetPhotos, isSavingDevice, npps, qcUsers, selectedSetDetails, setDraft, setEditNppSearchTerm, setEditSetFormData, setSaving, setSelectedPhotoViewer }) {
  return (<>{/* EDIT SYSTEM SET MODAL */}
      {editingSet && (
        <SafePortal>
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '600px' }}>
              <div className="modal-header">
                <h3 style={{ fontWeight: '800' }}>Chỉnh Sửa Thông Tin Bộ Máy [{editingSet.setCode}]</h3>
                <button className="btn btn-secondary btn-sm" onClick={closeSetEditor}>✕</button>
              </div>
              <form onSubmit={handleEditSetSubmit} aria-busy={setSaving}>
                <div className="modal-body" ref={el => { if (el) el.scrollTop = 0; }}><DraftNotice draft={setDraft} />
                  <div className="responsive-form-grid">{[['computerSerial','Seri máy tính'],['tintingSoftware','Phần mềm pha màu'],['softwareVersion','Phiên bản phần mềm']].map(([key,label]) => <label key={key}>{label}<input className="form-input" maxLength={120} value={editSetFormData[key] || ''} onChange={event => setEditSetFormData(previous => ({ ...previous, [key]: event.target.value.trimStart() }))} /></label>)}</div>

                  {/* PRIMARY EDIT FIELDS - TOP OF FORM */}
                  <div className="responsive-form-grid" style={{ marginBottom: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">🏷️ Mã Bộ Máy *</label>
                      <input
                        type="text"
                        className="form-input"
                        required
                        placeholder="VD: SET-2026-002"
                        value={editSetFormData.setCode || ''} readOnly title="Mã bộ máy được giữ cố định để bảo toàn lịch sử"
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
                            return matchesSearch(editNppSearchTerm,[npp.name,npp.code,npp.id,npp.province,npp.salesperson,npp.phone]);
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
                  </div>

                  {/* Attached Photos in Edit Modal */}
                  <div className="form-group" style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label className="form-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Camera size={16} color="var(--accent-cyan)" />
                        <span style={{ fontWeight: '700' }}>Hình Ảnh Hiện Trường Lắp Đặt ({editSetFormData.installationPhotos?.length || 0})</span>
                      </label>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <PlusCircle size={14} color="var(--accent-cyan)" />
                        <span>Tải thêm ảnh</span>
                        <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUploadEditSetPhotos} />
                      </label>
                    </div>
                    {editSetFormData.installationPhotos && editSetFormData.installationPhotos.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(85px, 1fr))', gap: '8px', marginTop: '6px' }}>
                        {editSetFormData.installationPhotos.map((url, idx) => (
                          <div key={idx} style={{ position: 'relative', width: '100%', height: '75px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                            <img
                              src={url}
                              alt={`Ảnh ${idx + 1}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                              onClick={() => setSelectedPhotoViewer({
                                isOpen: true,
                                photos: editSetFormData.installationPhotos,
                                activeIndex: idx,
                                title: `Ảnh ${idx + 1} - Bộ [${editSetFormData.setCode}]`
                              })}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveEditSetPhoto(idx)}
                              style={{
                                position: 'absolute',
                                top: '3px',
                                right: '3px',
                                background: 'rgba(239, 68, 68, 0.9)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '50%',
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                              }}
                              title="Xóa ảnh này"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        Chưa có ảnh hiện trường nào cho bộ máy này.
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeSetEditor}>{selectedSetDetails ? '← Quay lại hồ sơ máy' : 'Hủy Bỏ'}</button>
                  <button type="submit" className="btn btn-primary" disabled={isSavingDevice}>{isSavingDevice ? 'Đang lưu…' : 'Lưu Thay Đổi'}</button>
                </div>
              </form>
            </div>
          </div>
        </SafePortal>
      )}

      </>);
}
