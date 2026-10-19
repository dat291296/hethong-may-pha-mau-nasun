export function isUnknownSerial(value) {
  const text = String(value || '').trim();
  return !text || /^(?:n\/a|—|-|null|undefined|không có seri)$/i.test(text) || /^AUTO-/i.test(text);
}
export function normalizeOptionalSerial(value) {
  return isUnknownSerial(value) ? null : String(value).trim();
}
