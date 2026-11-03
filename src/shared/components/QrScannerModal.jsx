import React, { useEffect, useState } from 'react';
import { Camera, Flashlight, FlashlightOff, X } from 'lucide-react';
import { cleanScanValue, useQrScanner } from '../hooks/useQrScanner.js';

export default function QrScannerModal({ onScanSuccess, onClose, title = 'Quét QR / barcode thiết bị', errorMessage = '' }) {
  const [manualValue, setManualValue] = useState('');
  const [manualError, setManualError] = useState('');
  const { videoRef, isScanning, cameraAvailable, cameraError, torchAvailable, torchEnabled, start, stop, toggleTorch } = useQrScanner({ onScanSuccess });

  useEffect(() => () => stop(), [stop]);

  const submitManualValue = event => {
    event.preventDefault();
    const value = cleanScanValue(manualValue);
    if (!value) {
      setManualError('Nhập serial hoặc mã bộ máy trước khi tra cứu.');
      return;
    }
    if (value.length > 160) {
      setManualError('Mã không được dài quá 160 ký tự.');
      return;
    }
    setManualError('');
    onScanSuccess?.(value);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section
        className="modal-content qr-scanner-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-scanner-title"
        style={{ maxWidth: '520px', width: 'min(94vw, 520px)', padding: '20px', borderRadius: '18px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <Camera size={22} color="var(--accent-cyan)" aria-hidden="true" />
            <h2 id="qr-scanner-title" style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>{title}</h2>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} aria-label="Đóng trình quét" style={{ minWidth: 48, minHeight: 48, padding: 0, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <X size={20} />
          </button>
        </header>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Camera chỉ đọc mã, không ghi hình. Cho phép quyền camera để quét QR hoặc barcode.
        </p>

        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, border: '1px solid var(--border-color)', background: '#050b12', minHeight: 220 }}>
          <video ref={videoRef} muted playsInline aria-label="Khung hình camera quét mã" style={{ display: isScanning ? 'block' : 'none', width: '100%', minHeight: 220, maxHeight: '55dvh', objectFit: 'cover' }} />
          {!isScanning && (
            <div style={{ minHeight: 220, display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div>
                <Camera size={34} color="var(--accent-cyan)" style={{ marginBottom: 8 }} />
                <div>{cameraAvailable ? 'Camera chưa bật' : 'Không thể dùng camera trên thiết bị này'}</div>
              </div>
            </div>
          )}
          {torchAvailable && isScanning && (
            <button type="button" className="btn btn-secondary" onClick={toggleTorch} aria-label={torchEnabled ? 'Tắt đèn pin' : 'Bật đèn pin'} aria-pressed={torchEnabled} style={{ position: 'absolute', right: 12, top: 12, minWidth: 48, minHeight: 48, display: 'grid', placeItems: 'center', padding: 0, background: 'rgba(2, 6, 23, 0.8)' }}>
              {torchEnabled ? <FlashlightOff size={19} /> : <Flashlight size={19} />}
            </button>
          )}
        </div>

        {cameraError && <p role="status" style={{ margin: '10px 0 0', color: 'var(--accent-amber)', fontSize: '0.85rem', lineHeight: 1.5 }}>{cameraError}</p>}
        {errorMessage && <p role="alert" style={{ margin: '10px 0 0', color: 'var(--accent-red, #ef4444)', fontSize: '0.85rem', lineHeight: 1.5 }}>{errorMessage}</p>}

        {cameraAvailable && !isScanning && (
          <button type="button" className="btn btn-primary" onClick={start} style={{ width: '100%', minHeight: 48, marginTop: 12 }}>
            <Camera size={18} /> Bật camera để quét
          </button>
        )}
        {isScanning && <button type="button" className="btn btn-secondary" onClick={stop} style={{ width: '100%', minHeight: 48, marginTop: 12 }}>Tắt camera</button>}

        <form onSubmit={submitManualValue} style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
          <label htmlFor="qr-manual-serial" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>Nhập serial thủ công</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <input
              id="qr-manual-serial"
              className="form-input"
              value={manualValue}
              maxLength={160}
              autoComplete="off"
              inputMode="text"
              onChange={event => { setManualValue(event.target.value); setManualError(''); }}
              placeholder="Serial thiết bị hoặc mã bộ máy"
              style={{ minWidth: 0, minHeight: 48, flex: 1, fontSize: 16 }}
            />
            <button type="submit" className="btn btn-primary" style={{ minHeight: 48, paddingInline: 16, flexShrink: 0 }}>Tra cứu</button>
          </div>
          {manualError && <p role="alert" style={{ color: 'var(--accent-red, #ef4444)', fontSize: '0.82rem', margin: '7px 0 0' }}>{manualError}</p>}
        </form>
      </section>
    </div>
  );
}
