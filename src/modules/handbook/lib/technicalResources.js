export function validateDocumentUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('Đường dẫn tài liệu không hợp lệ.'); }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) {
    throw new Error('Chỉ chấp nhận đường dẫn HTTPS công khai, không chứa thông tin đăng nhập.');
  }
  if (url.href.length > 2048) throw new Error('Đường dẫn quá dài.');
  return url.href;
}

export function validateContactPhone(value) {
  const phone = String(value || '').trim();
  if (phone && !/^\+?[0-9 ()-]{7,25}$/.test(phone)) throw new Error('Số điện thoại không hợp lệ.');
  return phone;
}

export function contactLinks(contact) {
  const email = String(contact.email || '');
  const phone = String(contact.phone || '').replace(/[ ()-]/g, '');
  return {
    email: /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email) ? `mailto:${encodeURIComponent(email)}` : null,
    phone: /^\+?\d{7,15}$/.test(phone) ? `tel:${phone}` : null,
  };
}

export function resourceError(error) {
  console.error('[TechnicalResources]', error?.code || 'REQUEST_FAILED');
  if (['42P01', '42703', 'PGRST202', 'PGRST205'].includes(error?.code)) return 'Admin cần chạy technical_resources_migration.sql và technical_document_uploads_migration.sql trong Supabase để bật tải file.';
  if (error?.code === '42501') return 'Không có quyền thực hiện. Thêm/xóa tài liệu yêu cầu tài khoản admin đã xác thực MFA.';
  return error?.message || 'Không thể kết nối. Vui lòng thử lại.';
}

export const DOCUMENT_BUCKET = 'technical-documents';
export const DOCUMENT_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff' };
export async function validateDocumentFile(file) {
  const extension = file?.name?.split('.').pop().toLowerCase();
  const mime = DOCUMENT_TYPES[extension];
  if (!mime) throw new Error('Chỉ hỗ trợ PDF, PNG, JPG, WEBP, GIF, BMP và TIFF.');
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Dung lượng file phải từ 1 byte đến 20 MB.');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const matches = (...values) => values.every((value, index) => bytes[index] === value);
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  const valid = mime === 'application/pdf' ? ascii(0,5) === '%PDF-'
    : mime === 'image/png' ? matches(137,80,78,71,13,10,26,10)
    : mime === 'image/jpeg' ? matches(255,216,255)
    : mime === 'image/webp' ? ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP'
    : mime === 'image/gif' ? ['GIF87a','GIF89a'].includes(ascii(0,6))
    : mime === 'image/bmp' ? ascii(0,2) === 'BM'
    : matches(73,73,42,0) || matches(77,77,0,42);
  if (!valid) throw new Error('Nội dung file không khớp định dạng PDF/ảnh.');
  return { extension, mime };
}
