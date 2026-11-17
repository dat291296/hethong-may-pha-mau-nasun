import { normalizeRegion } from '../../fieldwork/lib/teamWorkspace.js';
import { getVietnamDate, normalizeCalendarDate } from '../../../shared/utils/dateUtils.js';

export function summarizeDashboard(systemSets, npps, today) {
  const distributors = new Map(npps.map(npp => [npp.id, npp]));
  const activeNpps = npps.filter(npp => npp.status === 'Đang hợp tác');
  const visibleSets = systemSets.filter(set => {
    if (!set.nppId) return set.status !== 'DA_LAP_DAT';
    return distributors.get(set.nppId)?.status === 'Đang hợp tác';
  });
  const regions = new Map(['Miền Bắc', 'Miền Trung', 'Miền Nam'].map(name => [name, { name, count: 0, installed: 0 }]));
  const models = new Map();
  const stats = { installed: 0, stock: 0, revoked: 0, maintenance: 0, warehouse: 0, overdue: 0, activeNppCount: activeNpps.length, dashboardSetCount: visibleSets.length };
  for (const set of visibleSets) {
    if (set.status === 'DA_LAP_DAT') stats.installed++;
    else if (set.status === 'TRONG_KHO') stats.stock++;
    else if (set.status === 'DA_THU_HOI') stats.revoked++;
    else if (set.status === 'BAO_THUONG_BAO_TRI') stats.maintenance++;
    if (set.region === 'Kho Tổng') stats.warehouse++;
    if (set.nextMaintenanceDue && set.nextMaintenanceDue < today) stats.overdue++;
    const region = regions.get(normalizeRegion(set.region || distributors.get(set.nppId)?.region));
    if (region) { region.count++; if (set.status === 'DA_LAP_DAT') region.installed++; }
    const model = set.dispenserModel || 'Khác';
    models.set(model, (models.get(model) || 0) + 1);
  }
  return { ...stats, regionalCounts: [...regions.values()], modelChartData: Array.from(models, ([name, value]) => ({ name, value })) };
}

export function listOperationalDevices(devices = [], systemSets = [], npps = []) {
  const distributors = new Map(npps.map(npp => [npp.id, npp]));
  const sets = new Map(systemSets.map(set => [set.setCode, set]));
  return devices.filter(device => {
    if (device.status !== 'Đang chạy tốt' && device.status !== 'Đang hoạt động') return false;
    if (!device.setCode) return true;
    const set = sets.get(device.setCode);
    if (!set) return false;
    return !set.nppId || distributors.get(set.nppId)?.status === 'Đang hợp tác';
  });
}

export function countOperationalDevices(devices, systemSets, npps) {
  return listOperationalDevices(devices, systemSets, npps).length;
}

export function dashboardRecordDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  try {
    if (/^\d{4}-\d{2}-\d{2}[T ]/.test(text)) {
      normalizeCalendarDate(text.slice(0, 10));
      if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
        const instant = new Date(text);
        return Number.isFinite(instant.getTime()) ? getVietnamDate(instant) : null;
      }
      return text.slice(0, 10);
    }
    return normalizeCalendarDate(text);
  } catch { return null; }
}

export function dashboardPeriod(mode, value) {
  if (mode === 'ALL') return { valid: true, active: false, label: 'Tất cả thời gian' };
  const invalid = { valid: false, active: true, label: 'Chọn thời gian hợp lệ' };
  const text = String(value || '');
  if (mode === 'DAY') {
    const day = dashboardRecordDate(text);
    return day && /^\d{4}-\d{2}-\d{2}$/.test(text) ? { valid: true, active: true, start: day, end: day, label: 'Ngày ' + day.split('-').reverse().join('/') } : invalid;
  }
  if (mode === 'MONTH' && /^\d{4}-(0[1-9]|1[0-2])$/.test(text)) {
    const start = text + '-01';
    if (!dashboardRecordDate(start)) return invalid;
    const [year, month] = text.split('-').map(Number);
    const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { valid: true, active: true, start, end: text + '-' + endDay, label: 'Tháng ' + text.slice(5) + '/' + text.slice(0, 4) };
  }
  if (mode === 'YEAR' && /^[1-9]\d{3}$/.test(text)) return { valid: true, active: true, start: text + '-01-01', end: text + '-12-31', label: 'Năm ' + text };
  return invalid;
}

export function filterDashboardRecords(rows, fields, period) {
  if (!period.active) return rows;
  if (!period.valid) return [];
  return rows.filter(row => {
    const value = fields.map(field => row[field]).find(value => value != null && String(value).trim() !== '');
    const day = dashboardRecordDate(value);
    return day && day >= period.start && day <= period.end;
  });
}

export function devicesForDashboardPeriod(devices, sets, category) {
  const codes = new Set(sets.map(set => set.setCode).filter(Boolean));
  const ids = new Set(sets.map(set => set[category + 'Id']).filter(Boolean));
  return devices.filter(device => ids.has(device.id) || codes.has(device.setCode));
}
