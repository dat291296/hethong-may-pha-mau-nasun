/**
 * Tiện ích Định dạng Ngày tháng theo Tiêu chuẩn Việt Nam (DD/MM/YYYY)
 * Phục vụ toàn bộ hệ thống quản lý máy pha màu Nasun
 */

export function formatDateVN(dateInput, includeTime = false) {
  if (!dateInput) return '—';

  try {
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const [year, month, day] = dateInput.split('-');
      return `${day}/${month}/${year}`;
    }

    if (typeof dateInput === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) {
      return dateInput;
    }

    const date = new Date(dateInput);
    if (isNaN(date.getTime())) {
      return String(dateInput);
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    if (includeTime) {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    return `${day}/${month}/${year}`;
  } catch {
    return String(dateInput || '—');
  }
}

export function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
