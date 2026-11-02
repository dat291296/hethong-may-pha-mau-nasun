import { InputFeedback } from '../../../shared/components/DataState.jsx';
import { SERVICE_CHECKLIST, FAILURE_COMPONENTS, failureComponents, requiresRepairReturn } from '../lib/repairClassification.js';
import { repairStringList } from '../lib/repairList.js';
import { repairMissingFields } from '../lib/repairCompleteness.js';
import React from 'react';
import SafePortal from '../../../shared/components/SafePortal.jsx';
import { validateSerial } from '../../../shared/security/sanitize.js';
import DraftNotice from '../../../shared/components/DraftNotice';
export default function RepairEditorDialog({ PRODUCT_CATEGORIES, addErrorPhotos, closeForm, currentAssignedSet, draft, editingTicket, errorPhotoInput, filteredNpps, formData, handleCategoryChange, handleSelectNpp, handleSubmit, nppSearchTerm, npps, onReturnToProfile, photoBusy, qcUsers, saveError, saving, setFormData, setNppSearchTerm, setSaveError, showModal, user }) { return (<>{/* CREATE / EDIT TICKET MODAL */}
      {showModal && (
        <SafePortal>
          <div className="modal-overlay">
            <div className="modal-content repair-ticket-modal" style={{ maxWidth: '720px' }}>
              <div className="modal-header">
                <h3 style={{ fontWeight: '800' }}>
                  {editingTicket ? `Chỉnh Sửa Phiếu Xử Lý Máy [${editingTicket.ticketCode}]` : 'Tạo Phiếu Xử Lý Máy & Sửa Chữa Mới'}
                </h3>
                <button className="btn btn-secondary btn-sm" disabled={saving || photoBusy} onClick={closeForm}>✕</button>
              </div>
              <form onSubmit={handleSubmit} onInvalidCapture={() => setSaveError('Hãy bổ sung các ô bắt buộc đang được đánh dấu. Nội dung chưa được lưu.')}>
                <DraftNotice draft={draft} />
                {repairMissingFields(formData).length > 0 && <div className="repair-missing-fields" role="status"><strong>Cần bổ sung:</strong> {repairMissingFields(formData).join(' · ')}</div>}
                {saveError && <p className="resource-error" role="alert">{saveError}</p>}
                <div className="modal-body">
                <fieldset disabled={saving || photoBusy || Boolean(draft.existing)} className="form-fieldset">
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
                        👨‍🔧 Kỹ Thuật Viên Xử Lý / Ghi Phiếu *
                      </label>
                      <select
                        className="form-select"
                        required
                        value={formData.technician || ''}
                        onChange={e => setFormData({ ...formData, technician: e.target.value })}
                      >
                        {formData.technician && !qcUsers?.some(person => (person.name || person.full_name || person.id) === formData.technician) && <option value={formData.technician}>{formData.technician}</option>}
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
                          Mã: {npps.find(npp => npp.id === formData.nppId)?.code || formData.nppId}
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
                      className="form-select repair-npp-select"
                      required
                      value={formData.nppId}
                      onChange={e => handleSelectNpp(e.target.value)}
                    >
                      <option value="">-- Chọn NPP từ danh sách ({filteredNpps.length} NPP) --</option>
                      {filteredNpps.map(n => (
                        <option key={n.id} value={n.id}>[{n.code || n.id}] {n.name} - {n.region}</option>
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
                                  serialNumber: currentAssignedSet.dispenserSerial || '',
                                  assetCode: currentAssignedSet.dispenserId || ''
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
                                  serialNumber: currentAssignedSet.mixerSerial || '',
                                  assetCode: currentAssignedSet.mixerId || ''
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
                                  serialNumber: currentAssignedSet.pcSerial || '',
                                  assetCode: currentAssignedSet.computerId || ''
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
                                  serialNumber: currentAssignedSet.printerSerial || '',
                                  assetCode: currentAssignedSet.printerId || ''
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
                                serialNumber: '',
                                assetCode: ''
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
                        🏷️ 4. Số Seri Thiết Bị (không bắt buộc)
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        required={false}
                        placeholder="Có thể để trống; nhập khi có để đối chiếu"
                        value={formData.serialNumber} aria-describedby="repair-serial-feedback" aria-invalid={!!formData.serialNumber && !validateSerial(formData.serialNumber).valid}
                        onChange={e => setFormData({ ...formData, serialNumber: e.target.value })}
                      /><InputFeedback id="repair-serial-feedback" message={formData.serialNumber ? validateSerial(formData.serialNumber).error : null} />
                    </div>
                  </div>

                  <div className="responsive-form-grid">
                    <div className="form-group">
                      <label className="form-label">⚙️ Model Chi Tiết</label>
                      <input type="text" className="form-input" placeholder="Ví dụ: Satint A2, Mixer AI88, QL-700..." value={formData.machineModel} onChange={e => setFormData({ ...formData, machineModel: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">📦 Gửi trả thiết bị</label>
                      <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={requiresRepairReturn(formData)} disabled={formData.actionDirection === 'Xuất đổi'} onChange={event => setFormData(previous => ({...previous, serviceChecklist:{...previous.serviceChecklist,returnRequired:event.target.checked}}))}/>Có nhận thiết bị về / cần gửi trả NPP</label>
                      {!requiresRepairReturn(formData) && <p>Không cần gửi trả — xử lý tại NPP.</p>}
                      {requiresRepairReturn(formData) && <select className="form-select" value={formData.customerReturnStatus} onChange={e => setFormData({ ...formData, customerReturnStatus: e.target.value })}>
                        <option value="Chưa gửi trả">📦 Chưa Gửi Trả</option>
                        <option value="Đã gửi trả">✓ Đã Gửi Trả NPP</option>
                      </select>}
                    </div>
                  </div>

                  <fieldset className="repair-failure-classification"><legend>Bộ phận / linh kiện gây lỗi</legend><p>Chọn các linh kiện đã xác định. Chọn “Chưa xác định” khi đang kiểm tra; vật tư sử dụng được ghi riêng bên dưới.</p><div className="repair-component-options">{[...new Set([...FAILURE_COMPONENTS,...failureComponents(formData)])].map(component => <label key={component}><input type="checkbox" checked={failureComponents(formData).includes(component)} onChange={event => setFormData(previous => ({...previous,errorCategory:(event.target.checked?[...failureComponents(previous),component]:failureComponents(previous).filter(value => value !== component)).join('; ')}))}/>{component}</label>)}</div></fieldset>
                  <div className="form-group">
                    <label className="form-label">⚠️ 5. Diễn Giải Tình Trạng Lỗi *</label>
                    <textarea className={`form-input ${!formData.errorDescription ? 'field-missing' : ''}`} rows={2} placeholder="Mô tả chi tiết sự cố kỹ thuật..." value={formData.errorDescription} onChange={e => setFormData({ ...formData, errorDescription: e.target.value })} /><div className="error-photo-upload"><p>Ảnh minh họa lỗi (tối đa 6)</p><button type="button" className="btn btn-secondary btn-sm" disabled={photoBusy} onClick={() => errorPhotoInput.current?.click()}>Chọn ảnh lỗi</button><input ref={errorPhotoInput} style={{display:'none'}} aria-label="Thêm ảnh lỗi" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={photoBusy} onChange={addErrorPhotos}/></div><div className="repair-error-photos">{repairStringList(formData.photos).map((url,index)=><figure key={index}><img src={url} alt={`Ảnh lỗi ${index+1}`}/><button type="button" className="btn btn-secondary btn-sm" aria-label={`Bỏ ảnh lỗi ${index+1}`} onClick={()=>setFormData(previous=>({...previous,photos:previous.photos.filter((_,position)=>position!==index)}))}>Bỏ ảnh</button></figure>)}</div>{photoBusy && <p role="status">Đang xử lý ảnh...</p>}
                  </div>

                  {['Máy chiết', 'Máy lắc'].includes(formData.productCategory) && (
                    <div className="auth-alert auth-alert-success" role="status">
                      Máy chiết và máy lắc chỉ sửa chữa tại đại lý, không áp dụng đổi trả máy.
                    </div>
                  )}

                  <div className="responsive-form-grid">
                    <div className="form-group">
                      <label className="form-label">🛠️ Hướng Xử Lý Kỹ Thuật</label>
                      <select
                        className="form-select"
                        value={formData.actionDirection}
                        disabled={['Máy chiết', 'Máy lắc'].includes(formData.productCategory)}
                        onChange={e => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            serviceChecklist: {...prev.serviceChecklist, returnRequired: val === 'Xuất đổi'},
                            actionDirection: val,
                            exchangeType: val === 'Xuất đổi'
                              ? (prev.exchangeType === 'Không xuất đổi' ? 'Xuất đổi máy mới 100%' : prev.exchangeType)
                              : 'Không xuất đổi'
                          }));
                        }}
                      >
                        <option value="Sửa chữa">🛠️ Sửa Chữa Tại Đại Lý</option>
                        <option value="Xuất đổi">🔄 Xuất Đổi Máy Khác</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">📦 Xuất Đổi Máy Mới Hoặc Cũ</label>
                      <select
                        className="form-select"
                        value={formData.exchangeType || (formData.actionDirection === 'Xuất đổi' ? 'Xuất đổi máy mới 100%' : 'Không xuất đổi')}
                        disabled={['Máy chiết', 'Máy lắc'].includes(formData.productCategory)}
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

                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                    <h4 style={{ marginBottom: '12px', color: 'var(--accent-cyan)' }}>📋 Quy Trình Công Tác Hiện Trường</h4>
                    <div className="responsive-form-grid">
                      <div className="form-group">
                        <label className="form-label">Mã QR / Mã QL thiết bị</label>
                        <input
                          className="form-input"
                          value={formData.assetCode || ''}
                          maxLength={80}
                          placeholder="Quét QR hoặc nhập mã QL"
                          onChange={e => setFormData({ ...formData, assetCode: e.target.value })}
                        />
                      </div>

                    </div>
                    <div className="form-group">
                      <label className="form-label">Trạng thái công tác</label>
                      <select className="form-select" value={formData.fieldVisitStatus || 'scheduled'} onChange={e => setFormData({ ...formData, fieldVisitStatus: e.target.value })}>
                        <option value="scheduled">Đã lên lịch</option>
                        <option value="on_site">Đang tại NPP</option>
                        <option value="completed">Đã hoàn thành kỹ thuật</option>
                        <option value="customer_confirmed">NPP đã xác nhận</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Checklist bắt buộc</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
                        {SERVICE_CHECKLIST.map(([key, label]) => (
                          <label key={key} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                              type="checkbox"
                              checked={Boolean(formData.serviceChecklist?.[key])}
                              onChange={e => setFormData(prev => ({
                                ...prev,
                                serviceChecklist: { ...(prev.serviceChecklist || {}), [key]: e.target.checked }
                              }))}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Vật tư sử dụng (mỗi dòng một mục)</label>
                      <textarea
                        className="form-input"
                        rows={3}
                        placeholder="Ví dụ: Dây nguồn x1"
                        value={repairStringList(formData.materialsUsed).join('\n')}
                        onChange={e => setFormData({
                          ...formData,
                          materialsUsed: e.target.value.split('\n')
                        })}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '16px', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.nppConfirmation?.confirmed)}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          nppConfirmation: { ...(prev.nppConfirmation || {}), confirmed: e.target.checked }
                        }))}
                      />
                      Đại diện NPP xác nhận đã hoàn thành
                    </label>

                  </div>

                </fieldset>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" disabled={saving || photoBusy} onClick={closeForm}>Đóng · Giữ nháp</button>
                  {onReturnToProfile && <button type="button" className="btn btn-secondary" disabled={saving} onClick={async () => {
                    try { await draft.flush(); onReturnToProfile(); }
                    catch { setSaveError('Chưa lưu được bản nháp. Vui lòng thử lại trước khi quay lại hồ sơ.'); }
                  }}>← Quay lại hồ sơ máy</button>}
                  <button type="submit" className="btn btn-primary" disabled={saving || photoBusy || Boolean(draft.existing)}>{saving ? 'Đang xác nhận lưu...' : editingTicket ? 'Cập Nhật Phiếu' : 'Tạo Phiếu Mới'}</button>
                </div>
              </form>
            </div>
          </div>
        </SafePortal>
      )}

      </>); }
