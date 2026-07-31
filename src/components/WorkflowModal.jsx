import React, { useState } from 'react';
import { ArrowLeftRight, CheckCircle2, AlertTriangle, ShieldCheck, Printer, Calendar, Camera, X } from 'lucide-react';
import { compressImage } from '../utils/imageCompressor.js';

export default function WorkflowModal({
  mode, // 'INSTALL' | 'WITHDRAW' | 'TRANSFER'
  systemSets,
  npps,
  onClose,
  onSubmitInstall,
  onSubmitWithdraw,
  onSubmitTransfer,
  onPrintProtocol
}) {
  // Common states
  const [selectedSetCode, setSelectedSetCode] = useState('');
  const [targetNppId, setTargetNppId] = useState('');
  const [technician, setTechnician] = useState('Nguyễn Văn Hùng');
  const [handoverDate, setHandoverDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [stabilizerBrand, setStabilizerBrand] = useState('Lioa 2000VA');
  const [hasStabilizer, setHasStabilizer] = useState(true);

  // Photos captured/uploaded by technician during installation/withdrawal
  const [photos, setPhotos] = useState([]);

  // For withdrawal
  const [deviceCondition, setDeviceCondition] = useState('Bình thường - Đang chạy tốt');
  const [returnToStock, setReturnToStock] = useState(true);

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      try {
        const compressedBase64 = await compressImage(file);
        setPhotos(prev => [...prev, compressedBase64]);
      } catch (err) {
        console.error('Error compressing image:', err);
        const reader = new FileReader();
        reader.onloadend = () => {
          setPhotos(prev => [...prev, reader.result]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleRemovePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'INSTALL') {
      if (!selectedSetCode || !targetNppId) {
        alert('Vui lòng chọn đầy đủ Bộ máy và Nhà Phân Phối!');
        return;
      }
      const dateObj = new Date(handoverDate);
      dateObj.setFullYear(dateObj.getFullYear() + 1);
      const nextDue = dateObj.toISOString().split('T')[0];

      onSubmitInstall({
        setCode: selectedSetCode,
        nppId: targetNppId,
        technician,
        installedDate: handoverDate,
        nextMaintenanceDue: nextDue,
        stabilizer: hasStabilizer ? `${stabilizerBrand} (NPP tự mua)` : 'Chưa có ổn áp (Cảnh báo)',
        notes,
        installationPhotos: photos
      });
    } else if (mode === 'WITHDRAW') {
      if (!selectedSetCode || !reason) {
        alert('Vui lòng chọn Bộ máy cần thu hồi và nhập Lý do thu hồi!');
        return;
      }
      onSubmitWithdraw({
        setCode: selectedSetCode,
        reason,
        deviceCondition,
        returnToStock,
        technician,
        withdrawDate: handoverDate,
        notes,
        photos
      });
    } else if (mode === 'TRANSFER') {
      if (!selectedSetCode || !targetNppId) {
        alert('Vui lòng chọn Bộ máy và Nhà Phân Phối đích!');
        return;
      }
      onSubmitTransfer({
        setCode: selectedSetCode,
        newNppId: targetNppId,
        reason,
        technician,
        transferDate: handoverDate,
        notes,
        photos
      });
    }
    onClose();
  };

  const selectedSet = systemSets.find(s => s.setCode === selectedSetCode);
  const targetNpp = npps.find(n => n.id === targetNppId);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowLeftRight size={20} color="var(--accent-cyan)" />
            <h3 style={{ fontWeight: '800' }}>
              {mode === 'INSTALL' && 'Nghiệp Vụ Lắp Đặt / Cấp Phát Mới Cho NPP'}
              {mode === 'WITHDRAW' && 'Nghiệp Vụ Thu Hồi Thiết Bị Từ NPP'}
              {mode === 'TRANSFER' && 'Nghiệp Vụ Điều Chuyển Bộ Máy Giữa Các NPP'}
            </h3>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            
            {/* INSTALLATION FORM */}
            {mode === 'INSTALL' && (
              <>
                <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent-emerald)', borderRadius: '8px', marginBottom: '16px', fontSize: '0.825rem', color: '#34d399' }}>
                  📅 Lịch bảo trì tự động được thiết lập <strong>1 năm/lần</strong>. Hệ thống sẽ phát thông báo cảnh báo trước <strong>1 tháng</strong> đến ngày hạn.
                </div>

                <div className="form-group">
                  <label className="form-label">1. Chọn Bộ Máy Pha Màu (Đang Trong Kho) *</label>
                  <select className="form-select" required value={selectedSetCode} onChange={e => setSelectedSetCode(e.target.value)}>
                    <option value="">-- Chọn bộ máy từ kho --</option>
                    {systemSets.filter(s => s.status === 'TRONG_KHO' || s.status === 'DA_THU_HOI').map(s => (
                      <option key={s.id} value={s.setCode}>
                        [{s.setCode}] Chiết: {s.dispenserModel} | Lắc: {s.mixerModel} | PC: {s.pcType} | In: QL700
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">2. Chọn Nhà Phân Phối Nhận Bàn Giao *</label>
                  <select className="form-select" required value={targetNppId} onChange={e => setTargetNppId(e.target.value)}>
                    <option value="">-- Chọn NPP bàn giao --</option>
                    {npps.filter(n => n.status === 'Đang hợp tác').map(n => (
                      <option key={n.id} value={n.id}>[{n.id}] {n.name} - Khu vực: {n.region}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Ngày Bàn Giao Lắp Đặt *</label>
                    <input type="date" className="form-input" value={handoverDate} onChange={e => setHandoverDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Kỹ Thuật Viên Phụ Trách *</label>
                    <input type="text" className="form-input" required value={technician} onChange={e => setTechnician(e.target.value)} />
                  </div>
                </div>

                {/* Voltage Stabilizer Check */}
                <div style={{ padding: '14px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px', color: 'var(--accent-cyan)' }}>
                    ⚡ Kiểm Tra Ổn Áp Điện Tại NPP (Ổn áp NPP tự mua)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="radio" checked={hasStabilizer} onChange={() => setHasStabilizer(true)} />
                      NPP đã trang bị Ổn áp
                    </label>
                    <label style={{ fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="radio" checked={!hasStabilizer} onChange={() => setHasStabilizer(false)} />
                      NPP chưa có Ổn áp (Báo cảnh báo)
                    </label>
                  </div>
                  {hasStabilizer && (
                    <input type="text" className="form-input" placeholder="Tên thương hiệu & công suất VA (vd: Lioa 2000VA, Standa 3000VA...)" value={stabilizerBrand} onChange={e => setStabilizerBrand(e.target.value)} />
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Ghi Chú Bàn Giao / Tình Trạng Ban Đầu</label>
                  <textarea className="form-textarea" rows={2} placeholder="NPP đã ký biên bản bàn giao, máy chạy thử 20L mượt mà..." value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </>
            )}

            {/* WITHDRAWAL FORM */}
            {mode === 'WITHDRAW' && (
              <>
                <div style={{ padding: '12px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--accent-rose)', borderRadius: '8px', marginBottom: '16px', fontSize: '0.825rem', color: '#fb7185' }}>
                  ⚠️ Khi thu hồi, các thiết bị thuộc bộ máy sẽ được cập nhật trạng thái thu hồi/trả về kho tổng.
                </div>

                <div className="form-group">
                  <label className="form-label">1. Chọn Bộ Máy Cần Thu Hồi Từ NPP *</label>
                  <select className="form-select" required value={selectedSetCode} onChange={e => setSelectedSetCode(e.target.value)}>
                    <option value="">-- Chọn bộ máy đang lắp đặt tại NPP --</option>
                    {systemSets.filter(s => s.status === 'DA_LAP_DAT' || s.status === 'BAO_THUONG_BAO_TRI').map(s => (
                      <option key={s.id} value={s.setCode}>
                        [{s.setCode}] tại {s.nppName} (Chiết: {s.dispenserModel})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">2. Lý Do Thu Hồi *</label>
                  <select className="form-select" required value={reason} onChange={e => setReason(e.target.value)}>
                    <option value="">-- Chọn lý do thu hồi --</option>
                    <option value="NPP ngưng hợp tác phân phối">NPP ngưng hợp tác phân phối</option>
                    <option value="Hết thời hạn hợp đồng mượn máy">Hết thời hạn hợp đồng mượn máy</option>
                    <option value="NPP nợ cước / Không đạt sản lượng chỉ tiêu">NPP nợ cước / Không đạt chỉ tiêu</option>
                    <option value="Thu hồi về kho để sửa chữa nâng cấp lớn">Thu hồi về kho sửa chữa nâng cấp</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">3. Đánh Giá Tình Trạng Thiết Bị Khi Nhận Về *</label>
                  <input type="text" className="form-input" placeholder="Ví dụ: Máy chiết nghẹt 1 vòi, máy lắc hoạt động tốt..." value={deviceCondition} onChange={e => setDeviceCondition(e.target.value)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Ngày Thu Hồi *</label>
                    <input type="date" className="form-input" value={handoverDate} onChange={e => setHandoverDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Kỹ Thuật Viên Thu Hồi *</label>
                    <input type="text" className="form-input" required value={technician} onChange={e => setTechnician(e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Ghi Chú Biên Bản Thu Hồi</label>
                  <textarea className="form-textarea" rows={2} placeholder="NPP đã niêm phong máy và ký xác nhận thu hồi..." value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </>
            )}

            {/* TRANSFER FORM */}
            {mode === 'TRANSFER' && (
              <>
                <div className="form-group">
                  <label className="form-label">1. Chọn Bộ Máy Cần Điều Chuyển *</label>
                  <select className="form-select" required value={selectedSetCode} onChange={e => setSelectedSetCode(e.target.value)}>
                    <option value="">-- Chọn bộ máy cần điều chuyển --</option>
                    {systemSets.filter(s => s.status === 'DA_LAP_DAT').map(s => (
                      <option key={s.id} value={s.setCode}>
                        [{s.setCode}] Đang ở: {s.nppName} ({s.region})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">2. Chọn NPP Đích Nhận Điều Chuyển *</label>
                  <select className="form-select" required value={targetNppId} onChange={e => setTargetNppId(e.target.value)}>
                    <option value="">-- Chọn NPP nhận điều chuyển --</option>
                    {npps.filter(n => n.status === 'Đang hợp tác').map(n => (
                      <option key={n.id} value={n.id}>[{n.id}] {n.name} ({n.region})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">3. Lý Do Điều Chuyển</label>
                  <input type="text" className="form-input" placeholder="Tối ưu sản lượng khu vực, NPP A nhượng lại cho NPP B..." value={reason} onChange={e => setReason(e.target.value)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Ngày Thực Hiện *</label>
                    <input type="date" className="form-input" value={handoverDate} onChange={e => setHandoverDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Kỹ Thuật Viên Phụ Trách *</label>
                    <input type="text" className="form-input" required value={technician} onChange={e => setTechnician(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {/* Photo Capture Section for Technician */}
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <label className="form-label" style={{ marginBottom: '8px' }}>
                <span>📸 Kỹ Thuật Viên Chụp Hình Minh Họa Thực Tế Tại NPP</span>
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  <Camera size={16} />
                  <span>Chụp / Tải Ảnh Hiện Trường</span>
                  <input type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} />
                </label>
              </div>

              {photos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
                  {photos.map((url, idx) => (
                    <div key={idx} style={{ position: 'relative', width: '100%', height: '70px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                      <img src={url} alt="Installation photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
            {selectedSet && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => onPrintProtocol({ set: selectedSet, npp: targetNpp, mode, technician, date: handoverDate, notes, reason, photos })}
              >
                <Printer size={16} />
                <span>Xem & In Biên Bản</span>
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary">
              Xác Nhận Thực Hiện
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
