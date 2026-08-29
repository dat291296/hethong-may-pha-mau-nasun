import React from 'react';
import { MapPin, AlertTriangle, ShieldAlert, Globe, ExternalLink, X, RefreshCw } from 'lucide-react';

/**
 * GpsPermissionModal - User guidance modal when Geolocation Permission is denied or blocked.
 */
export default function GpsPermissionModal({ isOpen, onClose, onRetryIpFallback, isNonSecureContext }) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="modal-container" 
        style={{ maxWidth: '560px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="badge badge-red" style={{ padding: '0.5rem', borderRadius: '50%' }}>
              <ShieldAlert size={24} style={{ color: '#ef4444' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                {isNonSecureContext ? 'Cảnh Báo Định Vị HTTPS' : 'Quyền Định Vị GPS Bị Từ Chối'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                {isNonSecureContext 
                  ? 'Trình duyệt chặn GPS trên kết nối HTTP không bảo mật' 
                  : 'Trình duyệt chưa được cấp quyền truy cập vị trí GPS'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="btn btn-ghost" 
            style={{ padding: '0.25rem', color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '1.25rem 0' }}>
          {isNonSecureContext ? (
            <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Kết nối HTTP chưa có chứng chỉ SSL (HTTPS):</strong>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
                  Hầu hết trình duyệt di động (Chrome, Safari) bắt buộc trang web phải truy cập qua <code>https://</code> mới cho phép sử dụng định vị phần cứng GPS.
                </p>
              </div>
            </div>
          ) : (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              <ShieldAlert size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Quyền định vị đã bị tắt hoặc chặn trên thiết bị:</strong>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
                  Để hệ thống tự động ghi nhận tọa độ GPS cửa hàng/đại lý, bạn cần cấp quyền cho phép trình duyệt truy cập vị trí.
                </p>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              💡 Hướng dẫn bật quyền định vị nhanh:
            </h4>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li>
                <strong>Trên điện thoại Android (Chrome):</strong> Nhấn vào biểu tượng 🔒 (hoặc ⚙️) trên thanh địa chỉ web ➔ Chọn <strong>Cài đặt trang web (Permissions)</strong> ➔ Chọn <strong>Vị trí (Location)</strong> ➔ Bật <strong>Cho phép (Allow)</strong>.
              </li>
              <li>
                <strong>Trên iPhone/iPad (Safari):</strong> Vào <strong>Cài đặt máy (Settings)</strong> ➔ <strong>Quyền riêng tư & Bảo mật</strong> ➔ <strong>Dịch vụ vị trí</strong> ➔ Chọn <strong>Trang web Safari</strong> ➔ Chọn <strong>Khi dùng ứng dụng</strong>.
              </li>
              <li>
                <strong>Trên Máy tính (Chrome/Edge):</strong> Nhấn vào icon ổ khóa 🔒 bên trái URL ➔ Bật công tắc <strong>Vị trí (Location)</strong> ➔ Tải lại trang (F5).
              </li>
            </ul>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            Bạn cũng có thể sử dụng chức năng <strong>Định vị dự phòng qua IP</strong> để tự động lấy tọa độ địa lý ước tính mà không cần cấp quyền GPS phần cứng.
          </p>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={onClose}
          >
            Đóng
          </button>
          
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={() => {
              onClose();
              if (onRetryIpFallback) onRetryIpFallback();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Globe size={16} />
            Thử Định Vị Bằng IP Dự Phòng
          </button>
        </div>
      </div>
    </div>
  );
}
