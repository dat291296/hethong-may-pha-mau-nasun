import { userErrorMessage } from '../../../shared/security/userError.js';
import { matchesSearch } from '../../../shared/workspace/workspaceFilters.js';
import DraftNotice from '../../../shared/components/DraftNotice.jsx';
import React from 'react';
import SafePortal from '../../../shared/components/SafePortal.jsx';
import { PlusCircle, Camera } from 'lucide-react';

export default function AssemblyDialog({ assembling, assemblyDraft, assemblyError, closeAssembly, computers, dispensers, existingNppSets, handleAssembleSubmit, handleOpenAddDevice, handleRemoveNewSetPhoto, handleUploadNewSetPhotos, isMissingSerial, mixers, naturalSortCode, newSetData, nppSearchTerm, npps, printers, qcUsers, setNewSetData, setNppSearchTerm, setSelectedPhotoViewer, setShowAssembleModal, showAssembleModal }) {
  return (<>{/* Assemble Combo Modal */}
      {showAssembleModal && (
        <SafePortal>
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h3 style={{ fontWeight: '800' }}>Ghép Bộ Máy Pha Màu Mới (Combo Set)</h3>
                <button className="btn btn-secondary btn-sm" onClick={closeAssembly} disabled={assembling}>✕</button>
              </div>
              <form onSubmit={handleAssembleSubmit}>
                <div className="modal-body" ref={el => { if (el) el.scrollTop = 0; }}><DraftNotice draft={assemblyDraft}/>
                  <div style={{ padding: '12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid var(--accent-blue)', borderRadius: '8px', marginBottom: '16px', fontSize: '0.825rem' }}>
                    💡 Quy chuẩn 1 Bộ Máy Pha Màu bao gồm: 1 Máy Chiết + 1 Máy Lắc + 1 Máy Tính + 1 Máy In QL700. (Ổn áp sẽ ghi nhận thêm khi lắp đặt tại NPP).
                  </div>

                  {assemblyError && <p className="resource-error" role="alert">{assemblyError}</p>}
                  {existingNppSets.length > 0 && <div className="repair-missing-fields" role="alert">
                    <strong>{newSetData.nppName} đã có {existingNppSets.length} bộ máy: {existingNppSets.map(item => item.setCode || item.set_code).join(', ')}</strong>
                    <p>Kiểm tra bộ máy đang sử dụng trước khi ghép thêm để tránh cấp phát nhầm.</p>
                    <label><input type="checkbox" checked={newSetData.confirmAdditionalSet === true} onChange={event => setNewSetData(previous => ({ ...previous, confirmAdditionalSet: event.target.checked }))} /> Tôi xác nhận cần ghép thêm một bộ máy mới cho NPP này</label>
                  </div>}
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
                            confirmAdditionalSet: false,
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
                            return matchesSearch(nppSearchTerm,[npp.name,npp.code,npp.id,npp.province,npp.salesperson,npp.phone]);
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
                              onClick={async () => { try { await assemblyDraft.flush(); setShowAssembleModal(false); handleOpenAddDevice('dispenser'); } catch(error) { window.alert(userErrorMessage(error)); } }}
                            >
                              + Thêm máy chiết mới vào kho
                            </button>
                          </div>
                          <select className="form-select" required value={newSetData.dispenserId} onChange={e => setNewSetData({ ...newSetData, dispenserId: e.target.value })}>
                            <option value="">-- Chọn máy chiết ({availDisp.length} máy) --</option>
                            {availDisp.map(d => (
                              <option key={d.id} value={d.id}>
                                [{d.id}] {d.model} — Seri: {isMissingSerial(d) ? '⚠️ CHƯA CÓ' : d.serial} {isDeviceFree(d) ? '🟢 (Tự do trong kho)' : `🟡 (Đang gán bộ ${d.setCode || d.set_code || ''})`}
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
                              onClick={async () => { try { await assemblyDraft.flush(); setShowAssembleModal(false); handleOpenAddDevice('mixer'); } catch(error) { window.alert(userErrorMessage(error)); } }}
                            >
                              + Thêm máy lắc mới vào kho
                            </button>
                          </div>
                          <select className="form-select" required value={newSetData.mixerId} onChange={e => setNewSetData({ ...newSetData, mixerId: e.target.value })}>
                            <option value="">-- Chọn máy lắc ({availMix.length} máy) --</option>
                            {availMix.map(m => (
                              <option key={m.id} value={m.id}>
                                [{m.id}] {m.model} ({m.type || 'Lắc xoay'}) — Seri: {isMissingSerial(m) ? '⚠️ CHƯA CÓ' : m.serial} {isDeviceFree(m) ? '🟢 (Tự do trong kho)' : `🟡 (Đang gán bộ ${m.setCode || m.set_code || ''})`}
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
                              onClick={async () => { try { await assemblyDraft.flush(); setShowAssembleModal(false); handleOpenAddDevice('computer'); } catch(error) { window.alert(userErrorMessage(error)); } }}
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
                              onClick={async () => { try { await assemblyDraft.flush(); setShowAssembleModal(false); handleOpenAddDevice('printer'); } catch(error) { window.alert(userErrorMessage(error)); } }}
                            >
                              + Thêm máy in mới vào kho
                            </button>
                          </div>
                          <select className="form-select" required value={newSetData.printerId} onChange={e => setNewSetData({ ...newSetData, printerId: e.target.value })}>
                            <option value="">-- Chọn máy in QL700 ({availPrn.length} máy) --</option>
                            {availPrn.map(p => (
                              <option key={p.id} value={p.id}>
                                [{p.id}] {p.model} — Seri: {isMissingSerial(p) ? '⚠️ CHƯA CÓ' : p.serial} {isDeviceFree(p) ? '🟢 (Tự do trong kho)' : `🟡 (Đang gán bộ ${p.setCode || p.set_code || ''})`}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Attached Photos in Assemble Modal */}
                        <div className="form-group" style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label className="form-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Camera size={16} color="var(--accent-cyan)" />
                              <span>Ảnh Lắp Đặt / Hiện Trường ({newSetData.installationPhotos?.length || 0})</span>
                            </label>
                            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <PlusCircle size={13} color="var(--accent-cyan)" />
                              <span>Chọn ảnh</span>
                              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUploadNewSetPhotos} />
                            </label>
                          </div>
                          {newSetData.installationPhotos && newSetData.installationPhotos.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(75px, 1fr))', gap: '8px', marginTop: '6px' }}>
                              {newSetData.installationPhotos.map((url, idx) => (
                                <div key={idx} style={{ position: 'relative', width: '100%', height: '65px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                                  <img
                                    src={url}
                                    alt={`Ảnh ${idx + 1}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                    onClick={() => setSelectedPhotoViewer({
                                      isOpen: true,
                                      photos: newSetData.installationPhotos,
                                      activeIndex: idx,
                                      title: `Ảnh lắp đặt ${idx + 1}`
                                    })}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveNewSetPhoto(idx)}
                                    style={{
                                      position: 'absolute',
                                      top: '2px',
                                      right: '2px',
                                      background: 'rgba(239, 68, 68, 0.9)',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: '50%',
                                      width: '18px',
                                      height: '18px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '10px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeAssembly} disabled={assembling}>Hủy Bỏ</button>
                  <button type="submit" className="btn btn-primary" disabled={assembling || Boolean(assemblyDraft.existing) || (existingNppSets.length>0 && newSetData.confirmAdditionalSet!==true)}>Xác Nhận Tạo Bộ Combo</button>
                </div>
              </form>
            </div>
          </div>
        </SafePortal>
      )}

      </>);
}
