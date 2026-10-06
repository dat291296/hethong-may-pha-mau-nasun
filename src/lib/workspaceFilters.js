import { searchText } from './teamWorkspace.js';

export const REGIONS = ['Miền Bắc', 'Miền Trung', 'Miền Nam'];
export function matchesSearch(query, values) {
  return searchText(values.filter(value => value != null).join(' ')).includes(searchText(query || ''));
}
export function matchesDateRange(value, from = '', to = '') {
  if (!from && !to) return true;
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && (!from || date >= from) && (!to || date <= to);
}
export function uniqueOptions(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')).map(value => ({ value, label: value }));
}
export function canEditRegion(user, region) {
  if (!user || !['admin', 'manager', 'technician', 'qc'].includes(user.role)) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'technician') return REGIONS.includes(user.managedRegion) && user.managedRegion === region;
  return user.managedRegion === 'Toàn Quốc' || (REGIONS.includes(region) && user.managedRegion === region);
}
export function requireRegionEdit(user, region) {
  if (!canEditRegion(user, region)) throw new Error('Bạn chỉ được sửa dữ liệu trong khu vực được phân công. Dữ liệu chưa có khu vực cần quản trị viên xử lý.');
}
