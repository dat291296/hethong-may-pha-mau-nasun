import React from 'react';
import SafePortal from '../../../shared/components/SafePortal.jsx';
import { X, Cpu, Printer, Wrench, Monitor } from 'lucide-react';

const DEVICE_LABELS = {
  dispenser: { label: 'Máy chiết', icon: Wrench },
  mixer: { label: 'Máy lắc', icon: Wrench },
  computer: { label: 'Máy tính', icon: Monitor },
  printer: { label: 'Máy in', icon: Printer },
};

export default function DeviceLookupDialog({ category, device, assignedSet, onClose, onOpenMachine }) {
  if (!device) return null;
  const metadata = DEVICE_LABELS[category] || { label: 'Thiết bị', icon: Cpu };
  const Icon = metadata.icon;
  const details = [
    ['Mã quản lý', device.id],
    ['Model', device.model || device.type],
    ['Serial', device.serial],
    ['Trạng thái', device.status],
    ['Kết nối', device.connection || device.network],
    ['Bộ máy', assignedSet?.setCode || device.setCode || 'Thiết bị trong kho'],
    ['Nhà phân phối', assignedSet?.nppName || 'Kho tổng / chưa gán'],
    ['Tỉnh / thành', assignedSet?.province || assignedSet?.region],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim());

  return (
    <SafePortal>
      <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
        <section className="modal-content" role="dialog" aria-modal="true" aria-labelledby="device-lookup-title" style={{ maxWidth: 560, width: 'min(94vw, 560px)' }}>
          <header className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon size={22} color="var(--accent-cyan)" aria-hidden="true" />
              <div>
                <h2 id="device-lookup-title" style={{ margin: 0, fontWeight: 800 }}>Chi tiết {metadata.label.toLocaleLowerCase('vi')}</h2>
                <small style={{ color: 'var(--text-muted)' }}>Tra cứu từ serial đã quét</small>
              </div>
            </div>
            <button type="button" className="btn btn-secondary" aria-label="Đóng chi tiết thiết bị" onClick={onClose} style={{ minWidth: 48, minHeight: 48, display: 'grid', placeItems: 'center', padding: 0 }}>
              <X size={18} />
            </button>
          </header>

          <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            {details.map(([label, value]) => (
              <div key={label} style={{ padding: '11px 12px', border: '1px solid var(--border-color)', borderRadius: 10, minWidth: 0 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 4 }}>{label}</div>
                <strong style={{ overflowWrap: 'anywhere' }}>{value}</strong>
              </div>
            ))}
          </div>

          {assignedSet && (
            <footer className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" style={{ minHeight: 48 }} onClick={() => onOpenMachine?.(assignedSet)}>Mở hồ sơ bộ máy</button>
            </footer>
          )}
        </section>
      </div>
    </SafePortal>
  );
}
