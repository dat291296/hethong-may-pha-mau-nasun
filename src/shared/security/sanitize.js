/**
 * Security Sanitization Utilities
 * OWASP Top 10 – Injection Defense Layer
 * Paint Tinting & Stock Manager v2.0
 */

// ─── 1. FORMULA / CSV INJECTION DEFENSE ─────────────────────────────────────
/**
 * Prevents Spreadsheet Formula Injection / CSV Injection.
 * Prepends single-quote to neutralise any formula trigger character.
 * Must be applied before writing to Google Sheets / Excel export.
 *
 * @param {*} val – raw cell value
 * @returns {string|*} sanitized value
 */
export function sanitizeForSheet(val) {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (
      trimmed.startsWith('=') ||
      trimmed.startsWith('+') ||
      trimmed.startsWith('-') ||
      trimmed.startsWith('@') ||
      trimmed.startsWith('\t') ||
      trimmed.startsWith('\r') ||
      trimmed.toLowerCase().startsWith('cmd|') ||
      trimmed.toLowerCase().startsWith('dde(')
    ) {
      return "'" + trimmed; // Neutralise formula execution
    }
    return trimmed;
  }
  return val;
}

// ─── 2. XSS DEFENSE ─────────────────────────────────────────────────────────
/**
 * Escapes HTML special characters to prevent XSS via DOM injection.
 * Use on any user-controlled string rendered into HTML.
 *
 * @param {*} str – raw user string
 * @returns {string} escaped string
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g, '&#x60;')
    .replace(/=/g, '&#x3D;');
}

/**
 * Escapes string for safe inclusion inside JS event handlers / JSON.
 *
 * @param {string} str – raw string
 * @returns {string} JS-escaped string
 */
export function escapeJs(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/<\/script>/gi, '<\\/script>');
}

// ─── 3. GENERAL TEXT SANITIZATION ───────────────────────────────────────────
/**
 * Trims, limits length, strips null bytes and control characters.
 * Use on every text input before storing to DB or state.
 *
 * @param {*} str – raw input
 * @param {number} maxLen – maximum allowed length (default 500)
 * @returns {string} sanitized string
 */
export function sanitizeText(str, maxLen = 500) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/\0/g, '')                          // strip null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // strip non-printable control chars
    .trim()
    .slice(0, maxLen);
}

// ─── 4. FIELD-SPECIFIC VALIDATORS ────────────────────────────────────────────
/**
 * Validates Serial Number – alphanumeric + dash only (3–50 chars).
 * Returns { valid: bool, error: string|null }
 */
export function validateSerial(serial) {
  const s = sanitizeText(serial, 50);
  if (!s) return { valid: false, error: 'Số Seri không được để trống' };
  if (!/^[A-Z0-9\-]{3,50}$/i.test(s))
    return { valid: false, error: 'Số Seri chỉ được chứa chữ cái, số và dấu gạch ngang (3-50 ký tự)' };
  return { valid: true, error: null };
}

/**
 * Validates Vietnamese phone number.
 * Accepts formats: 0xxx, +84xxx, 84xxx with 9-11 digits.
 */
export function validatePhone(phone) {
  const p = sanitizeText(phone, 20).replace(/[\s\.\-]/g, '');
  if (!p) return { valid: false, error: 'Số điện thoại không được để trống' };
  if (!/^(\+84|84|0)(3|5|7|8|9)[0-9]{8}$/.test(p))
    return { valid: false, error: 'Số điện thoại không đúng định dạng Việt Nam' };
  return { valid: true, error: null };
}

/**
 * Validates GPS coordinates (lat, lng).
 * Accepts: "21.0024, 105.8412" or "21.0024,105.8412"
 */
export function validateGps(coords) {
  if (!coords) return { valid: true, error: null }; // GPS is optional
  const trimmed = sanitizeText(coords, 50);
  if (!/^-?\d{1,3}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/.test(trimmed))
    return { valid: false, error: 'Tọa độ GPS không hợp lệ. Định dạng: lat, lng (vd: 21.0024, 105.8412)' };
  const [lat, lng] = trimmed.split(',').map(Number);
  if (lat < -90 || lat > 90) return { valid: false, error: 'Vĩ độ phải nằm trong khoảng -90 đến 90' };
  if (lng < -180 || lng > 180) return { valid: false, error: 'Kinh độ phải nằm trong khoảng -180 đến 180' };
  return { valid: true, error: null };
}

/**
 * Sanitize an entire form data object – applies sanitizeText to all string fields.
 *
 * @param {Object} formData – raw form object
 * @param {number} maxLen – max length per field
 * @returns {Object} sanitized form object
 */
export function sanitizeFormData(formData, maxLen = 500) {
  const result = {};
  for (const [key, value] of Object.entries(formData)) {
    if (typeof value === 'string') {
      result[key] = sanitizeText(value, maxLen);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        typeof item === 'string' ? sanitizeText(item, maxLen) : item
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
