import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';

/**
 * QrScannerModal Component
 * Full-screen responsive modal that activates device camera to scan QR & Barcodes (1D/2D)
 *
 * @param {Function} onScanSuccess - Callback function returning decoded text (e.g. Serial Number)
 * @param {Function} onClose - Callback function to close the modal
 */
export default function QrScannerModal({ onScanSuccess, onClose }) {
  const scannerRef = useRef(null);

  useEffect(() => {
    const scannerId = 'html5qr-code-full-region';

    // Configure formats to support standard barcodes (Code 128, Code 39, EAN) & QR codes
    const formatsToSupport = [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.UPC_A
    ];

    const html5QrcodeScanner = new Html5QrcodeScanner(
      scannerId,
      {
        fps: 10,
        qrbox: { width: 250, height: 180 },
        aspectRatio: 1.0,
        formatsToSupport: formatsToSupport,
        rememberLastUsedCamera: true,
        showTorchButtonIfSupported: true
      },
      /* verbose= */ false
    );

    scannerRef.current = html5QrcodeScanner;

    html5QrcodeScanner.render(
      (decodedText) => {
        // Clean and sanitize scanned text
        const cleanedText = decodedText.trim().replace(/[\r\n]/g, '');
        if (cleanedText) {
          // Play a subtle success beep audio if possible
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = 880; // A5 pitch
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
          } catch (e) {
            // Audio context failed or not allowed, ignore
          }

          onScanSuccess(cleanedText);
          html5QrcodeScanner.clear().catch(() => {});
          onClose();
        }
      },
      (errorMessage) => {
        // Ignore scan frame errors (normal while searching for barcode)
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
    };
  }, [onScanSuccess, onClose]);

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '480px', 
          width: '92%', 
          padding: '20px', 
          borderRadius: '16px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)'
        }}
      >
        <div 
          className="modal-header" 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '16px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={20} color="var(--accent-cyan)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', margin: 0 }}>
              Quét Mã Vạch / QR Seri Thiết Bị
            </h3>
          </div>
          <button 
            type="button" 
            className="btn btn-secondary btn-sm" 
            onClick={onClose}
            style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px', textAlign: 'center' }}>
          Hướng camera về phía tem mã vạch hoặc mã QR dán trên thân máy chiết, máy lắc, máy in hoặc máy tính.
        </div>

        {/* Scanner Container */}
        <div 
          id="html5qr-code-full-region" 
          style={{ 
            width: '100%', 
            borderRadius: '12px', 
            overflow: 'hidden',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            background: '#000'
          }}
        />

        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={onClose}
            style={{ width: '100%' }}
          >
            Đóng Camera
          </button>
        </div>
      </div>
    </div>
  );
}
