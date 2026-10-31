export const PERMISSION_PURPOSES = Object.freeze({
  QR_SCAN: 'qr-scan',
  NPP_LOCATION: 'npp-location',
  FIELD_CHECK_IN: 'field-check-in',
  ROUTE_ORIGIN: 'route-origin',
  BACKUP_CLIPBOARD: 'backup-clipboard',
});

export const IMAGE_FILE_POLICY = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  allowedTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
  allowedExtensions: Object.freeze(['jpg', 'jpeg', 'png', 'webp']),
});

function permissionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requirePurpose(purpose) {
  if (!Object.values(PERMISSION_PURPOSES).includes(purpose)) {
    throw permissionError('INVALID_PERMISSION_PURPOSE', 'Permission purpose is not approved');
  }
}

export function validateSelectedFile(file, policy) {
  if (!file || typeof file.name !== 'string' || typeof file.size !== 'number') {
    throw permissionError('INVALID_FILE', 'Tệp không hợp lệ.');
  }
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (file.size <= 0 || file.size > policy.maxBytes) {
    throw permissionError('FILE_SIZE_BLOCKED', `Tệp vượt quá giới hạn ${Math.round(policy.maxBytes / 1024 / 1024)} MB.`);
  }
  if (!policy.allowedTypes.includes(file.type) || !policy.allowedExtensions.includes(extension)) {
    throw permissionError('FILE_TYPE_BLOCKED', 'Định dạng tệp không được phép.');
  }
  return file;
}

export function requestGeolocationPosition(purpose, positionOptions) {
  requirePurpose(purpose);
  if (!globalThis.isSecureContext && !['localhost', '127.0.0.1'].includes(globalThis.location?.hostname)) {
    return Promise.reject(permissionError('INSECURE_GEOLOCATION_CONTEXT', 'GPS chỉ hoạt động qua HTTPS.'));
  }
  if (!globalThis.navigator?.geolocation) {
    return Promise.reject(permissionError('GEOLOCATION_UNAVAILABLE', 'Thiết bị không hỗ trợ GPS.'));
  }
  return new Promise((resolve, reject) => {
    globalThis.navigator.geolocation.getCurrentPosition(resolve, reject, positionOptions);
  });
}

export async function writeSensitiveClipboard(text, purpose) {
  requirePurpose(purpose);
  if (purpose !== PERMISSION_PURPOSES.BACKUP_CLIPBOARD) {
    throw permissionError('CLIPBOARD_PURPOSE_BLOCKED', 'Clipboard purpose is not approved');
  }
  if (!globalThis.isSecureContext || !globalThis.navigator?.clipboard?.writeText) {
    throw permissionError('CLIPBOARD_UNAVAILABLE', 'Clipboard bảo mật không khả dụng.');
  }
  const value = String(text ?? '');
  if (!value || new TextEncoder().encode(value).byteLength > 10 * 1024 * 1024) {
    throw permissionError('CLIPBOARD_SIZE_BLOCKED', 'Dữ liệu clipboard không hợp lệ hoặc vượt quá 10 MB.');
  }
  await globalThis.navigator.clipboard.writeText(value);
}
