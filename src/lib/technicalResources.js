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
  if (['42P01', '42703', 'PGRST202', 'PGRST205'].includes(error?.code)) return 'Chưa cài đặt dữ liệu cho tính năng này. Admin cần chạy migration technical_resources_migration.sql trong Supabase.';
  if (error?.code === '42501') return 'Không có quyền thực hiện. Thêm/xóa tài liệu yêu cầu tài khoản admin đã xác thực MFA.';
  return error?.message || 'Không thể kết nối. Vui lòng thử lại.';
}
