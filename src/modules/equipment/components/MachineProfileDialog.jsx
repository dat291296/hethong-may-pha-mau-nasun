import { EQUIPMENT_SLOTS, resolveEquipmentSlot } from '../lib/equipmentReplacement.js';
import EquipmentReplacementDialog from './EquipmentReplacementDialog.jsx';
import { missingSystemSetFields } from '../lib/dataCompleteness.js';
import TechnicalResources from '../../handbook/components/TechnicalResources';
import { MachineProfileSummary, MachineProfileHistory } from './MachineProfileSummary.jsx';
import React from 'react';
import SafePortal from '../../../shared/components/SafePortal.jsx';
import { Camera, ZoomIn, Upload } from 'lucide-react';

export default function MachineProfileDialog({ can, computers, dispensers, editingDevice, editingSet, getSetPhotos, handleOpenEditDevice, handleOpenEditSet, machineProfile, mixers, onReplaceEquipment, onRequestMaintenance, onRequestRepair, printers, profileTab, replacement, replacementEvents, replacementHistoryError, selectedSetDetails, setProfileTab, setReplacement, setSelectedPhotoViewer, setSelectedSetDetails, systemSets, user }) {
  return (<>{/* COMBO SET DETAIL & FULL PHOTO GALLERY MODAL */}
      {selectedSetDetails && !editingDevice && !editingSet && !replacement && (
        <SafePortal>
          <div className="modal-overlay">
            <div className="modal-content machine-profile-modal" style={{ maxWidth: '820px', width: '95%' }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Camera size={22} color="var(--accent-cyan)" />
                  <div>
                    <h3 style={{ fontWeight: '800', margin: 0 }}>
                      Hồ Sơ Máy · {selectedSetDetails.setCode}
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      🏢 {selectedSetDetails.nppName || 'Kho Tổng Trung Tâm'} ({selectedSetDetails.province || selectedSetDetails.region || 'Toàn Quốc'})
                    </div>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" aria-label="Đóng hồ sơ máy" onClick={() => setSelectedSetDetails(null)}>✕</button>
              </div>

              <div className="modal-body machine-profile-body">{profileTab!=='equipment' && <button className="btn btn-secondary btn-sm" onClick={()=>setProfileTab('equipment')}>← Quay lại hồ sơ máy</button>}
<div className="workspace-tabs">{[['equipment','Thiết bị'],['history','Lịch sử'],['documents','Tài liệu & Ảnh']].map(([key,label]) => <button key={key} aria-pressed={profileTab === key} onClick={() => setProfileTab(key)}>{label}</button>)}<button disabled={!can('repair:create') || !onRequestRepair} onClick={() => { onRequestRepair(selectedSetDetails,profileTab); }}>Tạo phiếu sửa chữa</button><button disabled={!can('asset:edit') || !onRequestMaintenance} onClick={() => { onRequestMaintenance(selectedSetDetails,profileTab); }}>Bảo trì</button></div>
                {profileTab === 'history' && <>{replacementHistoryError&&<p role="alert" className="resource-error">{replacementHistoryError}</p>}<MachineProfileHistory items={[...machineProfile.history.filter(item=>!replacementEvents.some(event=>item.key==='audit:AUDIT-'+event.operation_id)),...replacementEvents.filter(event=>event.set_code===selectedSetDetails.setCode).map(event=>({key:'replacement:'+event.operation_id,title:event.action==='relink'?'Đối chiếu liên kết':'Lắp / tháo thiết bị',at:event.changed_at,detail:`${event.category}: ${event.old_device_id||'Chưa gán'} → ${event.new_device_id}. ${event.reason}`,status:event.old_condition}))].sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0))}/></>}
                {profileTab === 'documents' && <TechnicalResources machineModel={selectedSetDetails.dispenserModel} modelOptions={[...new Set(systemSets.map(machine => machine.dispenserModel).filter(Boolean))]} />}
                <div hidden={profileTab !== 'equipment'}>
                <p className="resource-muted">Cần bổ sung: {missingSystemSetFields(selectedSetDetails).join(' · ') || 'Đã có các trường thông tin chính'}</p>
                <div className="equipment-slot-grid">{EQUIPMENT_SLOTS.map(spec=>{const devices={computer:computers,dispenser:dispensers,mixer:mixers,printer:printers}[spec.category];const slot={...spec,...resolveEquipmentSlot(selectedSetDetails,spec.category,devices)};return <article className="equipment-slot" key={slot.category}><h4>{slot.label}</h4>{slot.device?<><strong>{slot.device.model||slot.device.type}</strong><code>{slot.device.id} · {slot.device.serial||'Chưa có seri'}</code><small>{slot.device.status}</small></>:<p role="status" className="repair-missing-fields">{slot.state==='empty'?'Chưa gán thiết bị':'Liên kết chưa khớp — cần đối chiếu'}{slot.pointer&&<small> Mã đang ghi nhận: {slot.pointer}</small>}</p>}<div className="workspace-actions"><button className="btn btn-secondary btn-sm" disabled={!can('asset:edit')||!slot.device} onClick={()=>handleOpenEditDevice(slot.category,slot.device)}>Chỉnh sửa {slot.label.toLocaleLowerCase('vi')}</button><button className="btn btn-primary btn-sm" disabled={!can('asset:edit')||!onReplaceEquipment||(slot.state==='conflict'&&user?.role!=='admin')} onClick={()=>setReplacement({machine:selectedSetDetails,slot,devices})}>{slot.state==='conflict'?'Đối chiếu liên kết':slot.device?'Thay thiết bị':'Chọn từ kho'}</button></div></article>;})}</div>
                <MachineProfileSummary machine={selectedSetDetails} profile={machineProfile} showEquipment={false} />

                <div className="machine-profile-extra">{[['computerSerial','Seri máy tính'],['tintingSoftware','Phần mềm pha màu'],['softwareVersion','Phiên bản'],['agentStatus','Trạng thái kết nối'],['lastMaintenanceDate','Bảo trì gần nhất'],['province','Tỉnh / Thành'],['region','Khu vực'],['notes','Ghi chú']].map(([key,label]) => <div key={key}><strong>{label}:</strong> {selectedSetDetails[key] || 'Chưa ghi nhận'}</div>)}</div>
                {/* Additional details bar */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '18px', fontSize: '0.825rem' }}>
                  <div><strong>Trạng thái:</strong> {selectedSetDetails.status === 'DA_LAP_DAT' ? '🟢 Đã Lắp Đặt' : (selectedSetDetails.status === 'TRONG_KHO' ? '⚪ Trong Kho' : selectedSetDetails.status)}</div>
                  <div><strong>Ổn áp:</strong> {selectedSetDetails.stabilizer || 'N/A'}</div>
                  <div><strong>Kỹ thuật viên:</strong> {selectedSetDetails.technician || 'Chưa phân công'}</div>
                  <div><strong>Kinh doanh:</strong> {selectedSetDetails.salesperson || 'N/A'}</div>
                  <div><strong>Ngày lắp đặt:</strong> {selectedSetDetails.installDate || selectedSetDetails.installedDate || 'Chưa ghi nhận'}</div>
                  <div><strong>Hạn bảo trì:</strong> {selectedSetDetails.nextMaintenanceDue || 'Chưa ghi nhận'}</div>
                </div>

                </div>
                <div hidden={profileTab !== 'documents'}>
                {/* Full Photos Gallery */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontWeight: '800', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Camera size={18} color="var(--accent-cyan)" />
                      <span>Thư Viện Ảnh Hiện Trường Lắp Đặt ({getSetPhotos(selectedSetDetails).length} ảnh)</span>
                    </h4>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => {
                        const set = selectedSetDetails;
                        handleOpenEditSet(set);
                      }}
                    >
                      <Upload size={14} />
                      <span>Quản lý / Tải thêm ảnh</span>
                    </button>
                  </div>

                  {getSetPhotos(selectedSetDetails).length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px' }}>
                      {getSetPhotos(selectedSetDetails).map((url, idx) => (
                        <div
                          key={idx}
                          onClick={() => setSelectedPhotoViewer({
                            isOpen: true,
                            photos: getSetPhotos(selectedSetDetails),
                            activeIndex: idx,
                            title: `Ảnh ${idx + 1}/${getSetPhotos(selectedSetDetails).length} - [${selectedSetDetails.setCode}]`
                          })}
                          style={{
                            height: '130px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            position: 'relative',
                            cursor: 'pointer',
                            border: '1.5px solid var(--border-color)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                            transition: 'transform 0.2s ease, border-color 0.2s ease'
                          }}
                          title="Bấm để phóng to xem đầy đủ ảnh"
                        >
                          <img
                            src={url}
                            alt={`Ảnh hiện trường ${idx + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            loading="lazy"
                          />
                          <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                            color: '#fff',
                            fontSize: '0.7rem',
                            padding: '6px 8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <span>Ảnh #{idx + 1}</span>
                            <ZoomIn size={12} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '32px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                      <Camera size={36} style={{ opacity: 0.4, marginBottom: '8px' }} />
                      <div>Bộ máy này hiện chưa có ảnh hiện trường lắp đặt.</div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: '12px', fontSize: '0.75rem' }}
                        onClick={() => {
                          const set = selectedSetDetails;
                          handleOpenEditSet(set);
                        }}
                      >
                        + Tải lên ảnh ngay
                      </button>
                    </div>
                  )}
                </div>
              </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setSelectedSetDetails(null)}>Đóng</button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const set = selectedSetDetails;
                    handleOpenEditSet(set);
                  }}
                >
                  Chỉnh Sửa Bộ Máy
                </button>
              </div>
            </div>
          </div>
        </SafePortal>
      )}

      {replacement && <EquipmentReplacementDialog machine={replacement.machine} slot={replacement.slot} devices={replacement.devices} onSave={onReplaceEquipment} onClose={()=>setReplacement(null)}/>}
      </>);
}
