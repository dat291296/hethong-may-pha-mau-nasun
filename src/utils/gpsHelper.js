/**
 * gpsHelper.js - Robust Geolocation Utility
 * Handles GPS retrieval with 3-stage fallback:
 * 1. High Accuracy GPS (Satellite/Device GPS)
 * 2. Low Accuracy GPS (Cell Tower / Wi-Fi)
 * 3. IP Geolocation Fallback (Public IP API)
 *
 * Also checks window.isSecureContext and handles PERMISSION_DENIED.
 */

/**
 * Get user location with multi-stage fallback
 * @param {Object} options - Config options { timeoutMs: 6000, allowIpFallback: true }
 * @returns {Promise<{
 *   success: boolean,
 *   coords: [number, number] | null,
 *   lat: number | null,
 *   lng: number | null,
 *   source: 'GPS_HIGH' | 'GPS_LOW' | 'IP_FALLBACK' | null,
 *   errorMessage: string | null,
 *   isPermissionDenied: boolean,
 *   isNonSecureContext: boolean
 * }>}
 */
export async function getRobustUserLocation(options = {}) {
  const { timeoutMs = 6000, allowIpFallback = true } = options;

  const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // 1. Check if browser supports Geolocation API
  if (!navigator.geolocation) {
    if (allowIpFallback) {
      return fetchIpLocation('Trình duyệt không hỗ trợ Geolocation API.');
    }
    return {
      success: false,
      coords: null,
      lat: null,
      lng: null,
      source: null,
      errorMessage: 'Trình duyệt không hỗ trợ lấy định vị vị trí.',
      isPermissionDenied: false,
      isNonSecureContext: !isSecure
    };
  }

  // If HTTP non-secure context, browser will block geolocation API
  if (!isSecure && allowIpFallback) {
    console.warn('[GPS] Non-secure HTTP context detected. Falling back to IP Geolocation.');
    const ipRes = await fetchIpLocation('Kết nối HTTP không bảo mật (không có HTTPS). Trình duyệt chặn GPS.');
    return {
      ...ipRes,
      isNonSecureContext: true
    };
  }

  // Stage 1: Try High Accuracy GPS
  try {
    const highResult = await requestPosition({ enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 });
    const lat = parseFloat(highResult.coords.latitude.toFixed(6));
    const lng = parseFloat(highResult.coords.longitude.toFixed(6));
    return {
      success: true,
      coords: [lat, lng],
      lat,
      lng,
      source: 'GPS_HIGH',
      errorMessage: null,
      isPermissionDenied: false,
      isNonSecureContext: !isSecure
    };
  } catch (err1) {
    console.warn('[GPS] High accuracy GPS failed/timed out:', err1.message);

    // If permission explicit denied by user, attempt low accuracy or IP fallback
    const isPermissionDenied = err1.code === 1; // PERMISSION_DENIED

    if (isPermissionDenied) {
      if (allowIpFallback) {
        const ipRes = await fetchIpLocation('Quyền định vị GPS bị từ chối.');
        return {
          ...ipRes,
          isPermissionDenied: true,
          isNonSecureContext: !isSecure
        };
      }
      return {
        success: false,
        coords: null,
        lat: null,
        lng: null,
        source: null,
        errorMessage: 'Quyền định vị bị từ chối. Vui lòng cho phép truy cập vị trí trên trình duyệt.',
        isPermissionDenied: true,
        isNonSecureContext: !isSecure
      };
    }

    // Stage 2: Try Low Accuracy GPS (cellular/WiFi)
    try {
      const lowResult = await requestPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
      const lat = parseFloat(lowResult.coords.latitude.toFixed(6));
      const lng = parseFloat(lowResult.coords.longitude.toFixed(6));
      return {
        success: true,
        coords: [lat, lng],
        lat,
        lng,
        source: 'GPS_LOW',
        errorMessage: null,
        isPermissionDenied: false,
        isNonSecureContext: !isSecure
      };
    } catch (err2) {
      console.warn('[GPS] Low accuracy GPS also failed:', err2.message);

      // Stage 3: IP Fallback
      if (allowIpFallback) {
        return fetchIpLocation(`Không lấy được định vị phần cứng (${err2.message}).`);
      }

      return {
        success: false,
        coords: null,
        lat: null,
        lng: null,
        source: null,
        errorMessage: `Không thể định vị GPS: ${err2.message}`,
        isPermissionDenied: err2.code === 1,
        isNonSecureContext: !isSecure
      };
    }
  }
}

/**
 * Wrap navigator.geolocation.getCurrentPosition in a Promise
 */
function requestPosition(positionOptions) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, positionOptions);
  });
}

/**
 * Stage 3: IP-Based Geolocation Fallback
 */
export async function fetchIpLocation(reason = '') {
  try {
    console.log('[GPS] Attempting IP Geolocation fallback...');
    // Primary IP Geolocation API (free, CORS enabled, no key required)
    const resp = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client', {
      signal: AbortSignal.timeout(5000)
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.latitude && data.longitude) {
        const lat = parseFloat(data.latitude.toFixed(6));
        const lng = parseFloat(data.longitude.toFixed(6));
        return {
          success: true,
          coords: [lat, lng],
          lat,
          lng,
          source: 'IP_FALLBACK',
          errorMessage: reason ? `${reason} Đã tự động sử dụng tọa độ ước tính qua IP.` : null,
          isPermissionDenied: false,
          isNonSecureContext: false
        };
      }
    }
  } catch (err) {
    console.warn('[GPS] Primary IP Geolocation failed:', err.message);
  }

  // Backup IP Geolocation API
  try {
    const resp2 = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
    if (resp2.ok) {
      const data2 = await resp2.json();
      if (data2.latitude && data2.longitude) {
        const lat = parseFloat(data2.latitude.toFixed(6));
        const lng = parseFloat(data2.longitude.toFixed(6));
        return {
          success: true,
          coords: [lat, lng],
          lat,
          lng,
          source: 'IP_FALLBACK',
          errorMessage: reason ? `${reason} Đã sử dụng tọa độ ước tính qua IP.` : null,
          isPermissionDenied: false,
          isNonSecureContext: false
        };
      }
    }
  } catch (err2) {
    console.warn('[GPS] Backup IP Geolocation failed:', err2.message);
  }

  return {
    success: false,
    coords: null,
    lat: null,
    lng: null,
    source: null,
    errorMessage: `${reason} Không thể xác định tọa độ IP dự phòng.`,
    isPermissionDenied: false,
    isNonSecureContext: false
  };
}
