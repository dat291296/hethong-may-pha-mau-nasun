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

// Form blanks are SQL NULL; malformed values must never reach a write request.
export function normalizeCalendarDate(value, label = 'Ngày', required = false) {
  if (value == null || String(value).trim() === '') {
    if (required) throw Object.assign(new Error(`${label} không được để trống.`), {code:'INVALID_DATE'});
    return null;
  }
  let text = String(value).trim();
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (local) text = `${local[3]}-${local[2]}-${local[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new Date(text + 'T00:00:00Z');
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === text) return text;
  }
  throw Object.assign(new Error(`${label} không hợp lệ. Chọn lại ngày theo định dạng ngày/tháng/năm; nội dung đang sửa được giữ nguyên.`), {code:'INVALID_DATE'});
}
export function normalizeDateFields(payload, fields) {
  const result = {...payload};
  for (const [key,label] of Object.entries(fields)) {
    if (Object.hasOwn(result,key)) result[key] = normalizeCalendarDate(result[key],label);
  }
  return result;
}
export function normalizeOptionalTimestamp(value, label = 'Thời gian') {
  if (value == null || String(value).trim() === '') return null;
  const text = String(value).trim();
  const day = text.slice(0,10);
  normalizeCalendarDate(day,label);
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  throw Object.assign(new Error(`${label} không hợp lệ. Chọn lại thời gian trước khi lưu.`), {code:'INVALID_DATE'});
}
