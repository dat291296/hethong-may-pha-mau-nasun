export const STABILIZER_NPP = 'NPP tự trang bị ổn áp';
export const STABILIZER_MISSING = 'Chưa có ổn áp';

export function isStabilizerMissing(value) {
  const text = String(value ?? '').trim();
  return !text || /^(?:chưa|không|n\/a|—|-)/i.test(text);
}

export function normalizeStabilizerChoice(value) {
  return isStabilizerMissing(value) ? STABILIZER_MISSING : STABILIZER_NPP;
}
