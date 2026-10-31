import { searchText } from '../utils/searchText.js';

export function normalizeRegion(value) {
  const region = searchText(value).replace(/^(mien|khu vuc)\s+/, '').trim();
  return { bac: 'Miền Bắc', trung: 'Miền Trung', nam: 'Miền Nam' }[region] || '';
}

export function inManagedRegion(item, user, npps = [], systemSets = []) {
  if (['admin', 'viewer'].includes(user?.role)) return true;
  const assignedRegion = normalizeRegion(user?.managedRegion);
  const machine = systemSets.find(set => (item.setCode && set.setCode === item.setCode) || (item.nppId && set.nppId === item.nppId));
  const region = normalizeRegion(npps.find(npp => npp.id === (item.nppId || machine?.nppId))?.region || machine?.region || item.region);
  return Boolean(assignedRegion && region === assignedRegion);
}
