import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SCAN_LENGTH = 160;
const DUPLICATE_WINDOW_MS = 800;

function cleanScanValue(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_SCAN_LENGTH);
}

function cameraErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    return 'Quyền camera đang bị chặn. Hãy cho phép camera trong cài đặt trình duyệt hoặc nhập serial thủ công.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'Không tìm thấy camera. Bạn có thể nhập serial thủ công.';
  }
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó hoặc nhập serial thủ công.';
  }
  if (error?.name === 'SecurityError') {
    return 'Camera chỉ hoạt động trên HTTPS hoặc localhost. Bạn có thể nhập serial thủ công.';
  }
  return 'Không mở được camera. Hãy thử lại hoặc nhập serial thủ công.';
}

export function useQrScanner({ onScanSuccess }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const startingRef = useRef(false);
  const onScanSuccessRef = useRef(onScanSuccess);
  const lastScanRef = useRef({ value: '', at: 0 });
  const stopRequestedRef = useRef(false);
  const barcodeTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [cameraError, setCameraError] = useState('');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    if (barcodeTimerRef.current !== null) window.clearTimeout(barcodeTimerRef.current);
    barcodeTimerRef.current = null;
    try {
      controlsRef.current?.stop();
    } catch (error) {
      console.warn('[QrScanner] Camera stop failed.');
    }
    controlsRef.current = null;
    if (mountedRef.current) {
      setIsScanning(false);
      setTorchAvailable(false);
      setTorchEnabled(false);
    }
  }, []);

  const handleDecodedValue = useCallback(rawValue => {
    const value = cleanScanValue(rawValue);
    if (!value) return;
    const now = Date.now();
    if (lastScanRef.current.value === value && now - lastScanRef.current.at < DUPLICATE_WINDOW_MS) return;
    lastScanRef.current = { value, at: now };
    try {
      try {
        if (typeof navigator.vibrate === 'function') navigator.vibrate(100);
      } catch (error) {
        // Continue lookup when vibration is blocked by the browser.
      }
      onScanSuccessRef.current?.(value);
    } catch (error) {
      console.error('[QrScanner] Scan callback failed.');
    } finally {
      stop();
    }
  }, [stop]);

  const start = useCallback(async () => {
    if (isScanning || startingRef.current) return;
    setCameraError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      setCameraAvailable(false);
      setCameraError(cameraErrorMessage({ name: window.isSecureContext ? 'NotFoundError' : 'SecurityError' }));
      return;
    }

    setCameraAvailable(true);
    stopRequestedRef.current = false;
    startingRef.current = true;
    setIsScanning(true);
    try {
      const { default: QrScanner } = await import('qr-scanner');
      const scanner = new QrScanner(videoRef.current, result => handleDecodedValue(result?.data || result), {
        preferredCamera: 'environment', maxScansPerSecond: 8, highlightScanRegion: true, returnDetailedScanResult: true,
      });
      controlsRef.current = scanner;
      await scanner.start();

      if (!mountedRef.current || stopRequestedRef.current) {
        scanner.stop();
        return;
      }
      setTorchAvailable(await scanner.hasFlash());
      if (window.BarcodeDetector?.getSupportedFormats) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          const linearFormats = formats.filter(format => format !== 'qr_code');
          if (linearFormats.length) {
            const detector = new window.BarcodeDetector({ formats: linearFormats });
            const scanLinearBarcode = async () => {
              const video = videoRef.current;
              if (stopRequestedRef.current || !mountedRef.current || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
              try {
                const results = await detector.detect(video);
                if (stopRequestedRef.current) return;
                const match = results.find(result => result.format !== 'qr_code' && result.rawValue);
                if (match) { handleDecodedValue(match.rawValue); return; }
              } catch (error) {
                // Native barcode detection is optional; QR scanning remains active.
              }
              if (!stopRequestedRef.current) barcodeTimerRef.current = window.setTimeout(scanLinearBarcode, 350);
            };
            void scanLinearBarcode();
          }
        } catch (error) {
          console.info('[QrScanner] Native linear barcode detection is unavailable.');
        }
      }
    } catch (error) {
      controlsRef.current?.destroy();
      controlsRef.current = null;
      if (mountedRef.current) {
        setIsScanning(false);
        setCameraAvailable(false);
        setCameraError(cameraErrorMessage(error));
      }
    } finally {
      startingRef.current = false;
    }
  }, [handleDecodedValue, isScanning, stop]);

  const toggleTorch = useCallback(async () => {
    const scanner = controlsRef.current;
    if (!scanner) return false;
    try {
      const nextValue = !torchEnabled;
      if (nextValue) await scanner.turnFlashOn();
      else await scanner.turnFlashOff();
      setTorchEnabled(nextValue);
      return true;
    } catch (error) {
      setTorchAvailable(false);
      setCameraError('Camera trên thiết bị này không hỗ trợ bật đèn pin.');
      return false;
    }
  }, [torchEnabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (barcodeTimerRef.current !== null) window.clearTimeout(barcodeTimerRef.current);
      barcodeTimerRef.current = null;
      try {
        controlsRef.current?.destroy();
      } catch (error) {
        console.warn('[QrScanner] Camera cleanup failed.');
      }
      controlsRef.current = null;
    };
  }, []);

  return { videoRef, isScanning, cameraAvailable, cameraError, torchAvailable, torchEnabled, start, stop, toggleTorch };
}

export { cleanScanValue };
