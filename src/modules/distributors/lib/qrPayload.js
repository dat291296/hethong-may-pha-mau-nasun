import { cleanScanValue } from '../../../shared/hooks/useQrScanner.js';

const TOKEN_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/;
const NPP_PATTERN = /^NPP-(?:MB|MT|MN)-\d{3,}$/i;
const TOKEN_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PUBLIC_URL = import.meta.env?.VITE_APP_PUBLIC_URL || '';

export function generateQrToken() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => TOKEN_ALPHABET[value & 31]).join('');
}

export function isValidQrToken(token) {
  return TOKEN_PATTERN.test(String(token || ''));
}

export function buildNppQrPayload(token, publicUrl = PUBLIC_URL || (typeof window !== 'undefined' ? window.location.origin : '')) {
  if (!isValidQrToken(token)) throw new Error('Mã QR không hợp lệ.');
  const base = publicUrl;
  if (!base) throw new Error('Chưa cấu hình địa chỉ ứng dụng để tạo mã QR.');
  const url = new URL(base);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('Địa chỉ ứng dụng phải dùng HTTPS.');
  url.pathname = `/n/${token}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function parseScannedPayload(text, publicUrl = PUBLIC_URL || (typeof window !== 'undefined' ? window.location.origin : '')) {
  const value = cleanScanValue(text);
  if (!value) throw new Error('Mã quét đang trống.');
  if (String(text || '').length > 160) throw new Error('Mã quét không được dài quá 160 ký tự.');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(String(text || ''))) throw new Error('Mã quét chứa ký tự không hợp lệ.');

  if (/^https?:\/\//i.test(value)) {
    let scanned;
    try { scanned = new URL(value); } catch { throw new Error('Đường dẫn QR không hợp lệ.'); }
    const configured = publicUrl ? new URL(publicUrl) : null;
    if (!configured || scanned.origin !== configured.origin) throw new Error('QR không thuộc hệ thống Nasun.');
    if (scanned.search || scanned.hash) throw new Error('Đường dẫn QR có tham số không hợp lệ.');
    const match = scanned.pathname.match(/^\/n\/([0-9A-HJKMNP-TV-Z]{10})\/?$/);
    if (!match) throw new Error('Đường dẫn QR không đúng định dạng.');
    return { kind: 'token', value: match[1] };
  }

  if (isValidQrToken(value)) return { kind: 'token', value };
  if (NPP_PATTERN.test(value)) return { kind: 'npp', value: value.toUpperCase() };
  if (/^[A-Z0-9][A-Z0-9._-]{2,63}$/i.test(value)) {
    return { kind: /^SET[-_]/i.test(value) ? 'set' : 'device', value };
  }
  throw new Error('Mã QR không đúng định dạng NPP, bộ máy hoặc thiết bị.');
}
