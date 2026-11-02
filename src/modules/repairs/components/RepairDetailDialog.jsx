import { SERVICE_CHECKLIST, repairReturnLabel } from '../lib/repairClassification.js';
import { repairStringList } from '../lib/repairList.js';
import React from 'react';
import SafePortal from '../../../shared/components/SafePortal.jsx';
import { formatDateVN } from '../../../shared/utils/dateUtils.js';
export default function RepairDetailDialog({ EMPTY_SERVICE_CHECKLIST, qcUsers, selectedTicket, setSelectedTicket }) { return (<>{/* VIEW TICKET DETAIL MODAL */}
      {selectedTicket && (
        <SafePortal>
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
                <div className="repair-detail-grid">
                  <div><strong>Nhà Phân Phối:</strong> {selectedTicket.nppName}</div>
                  <div><strong>Sản Phẩm & Seri:</strong> {selectedTicket.machineModel} ({selectedTicket.serialNumber})</div>
                  <div><strong>Kỹ Thuật Viên:</strong> {selectedTicket.technician}</div>
                  <div hidden><strong>Người nhận công việc:</strong> {qcUsers.find(item => item.id === selectedTicket.assignedUserId)?.name || (selectedTicket.assignedUserId ? 'Tài khoản được giao' : 'Chưa gán tài khoản')}</div>
                  <div hidden><strong>Hạn xử lý:</strong> {selectedTicket.assignmentDueDate || 'Chưa đặt'}</div>
                  <div><strong>Cập nhật gần nhất:</strong> {selectedTicket.lastUpdatedAt ? new Date(selectedTicket.lastUpdatedAt).toLocaleString('vi-VN') : 'Chưa ghi nhận'} · {qcUsers.find(item => item.id === selectedTicket.lastUpdatedBy)?.name || 'Hệ thống'}</div>
                  <div><strong>Ngày Tạo:</strong> {formatDateVN(selectedTicket.date)}</div>
                  <div><strong>Diễn Giải Lỗi:</strong> {selectedTicket.errorDescription}</div>
                  <div><strong>Hướng Xử Lý:</strong> {selectedTicket.actionDirection}</div>
                  <div><strong>Tình Trạng Sửa:</strong> {selectedTicket.processingStatus}</div>
                  <div><strong>Bộ phận / linh kiện lỗi:</strong> {selectedTicket.errorCategory || 'Chưa phân loại'}</div><div><strong>Gửi Trả Khách:</strong> {repairReturnLabel(selectedTicket)}</div>
                  <div><strong>Mã QR / Mã QL:</strong> {selectedTicket.assetCode || 'Chưa cập nhật'}</div>
                  <div><strong>Trạng thái công tác:</strong> {selectedTicket.fieldVisitStatus || 'scheduled'}</div>

                  <div><strong>Checklist:</strong> {SERVICE_CHECKLIST.filter(([key]) => selectedTicket.serviceChecklist?.[key]).length}/{Object.keys(EMPTY_SERVICE_CHECKLIST).length} mục</div>
                  <div><strong>Vật tư:</strong> {repairStringList(selectedTicket.materialsUsed).join(', ') || 'Không sử dụng'}</div>
                  <div><strong>NPP xác nhận:</strong> {selectedTicket.nppConfirmation?.confirmed ? `Đã xác nhận${selectedTicket.nppConfirmation.confirmedBy ? ` - ${selectedTicket.nppConfirmation.confirmedBy}` : ''}` : 'Chưa xác nhận'}</div>
                </div>

                {selectedTicket.photos && selectedTicket.photos.length > 0 && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px' }}>📸 Ảnh Đính Kèm:</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                      {repairStringList(selectedTicket.photos).map((url, idx) => (
                        <a key={idx} href={url} target="_blank" rel="noreferrer" style={{ height: '90px', borderRadius: '6px', overflow: 'hidden', display: 'block', border: '1px solid var(--border-color)' }}>
                          <img src={url} alt="error photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {selectedTicket.afterPhotos && selectedTicket.afterPhotos.length > 0 && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px' }}>📸 Ảnh Sau Khi Hoàn Thành:</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                      {repairStringList(selectedTicket.afterPhotos).map((url, idx) => (
                        <a key={idx} href={url} target="_blank" rel="noreferrer" style={{ height: '90px', borderRadius: '6px', overflow: 'hidden', display: 'block', border: '1px solid var(--border-color)' }}>
                          <img src={url} alt="after service" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
        </SafePortal>
      )}

</>); }
