export const regionPrefix = region => ({ 'Miền Bắc': 'MB', 'Miền Trung': 'MT', 'Miền Nam': 'MN' }[region] || '');
export function nextNppCode(region, npps) {
  const prefix = `NPP-${regionPrefix(region)}-`;
  const numbers = npps.map(npp => String(npp.code || npp.id || '')).filter(code => code.startsWith(prefix)).map(code => code.slice(prefix.length)).filter(value => /^\d+$/.test(value)).map(Number);
  return `${prefix}${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
}
export function validateNppCode(code, region) {
  return new RegExp(`^NPP-${regionPrefix(region)}-[0-9]{3,}$`).test(code) && Number(code.split('-').at(-1)) > 0;
}
