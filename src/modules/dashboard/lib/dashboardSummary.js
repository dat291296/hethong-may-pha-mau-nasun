import { normalizeRegion } from '../../fieldwork/lib/teamWorkspace.js';

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

export function countOperationalDevices(devices = [], systemSets = [], npps = []) {
  const distributors = new Map(npps.map(npp => [npp.id, npp]));
  const sets = new Map(systemSets.map(set => [set.setCode, set]));
  return devices.filter(device => {
    if (device.status !== 'Đang chạy tốt' && device.status !== 'Đang hoạt động') return false;
    if (!device.setCode) return true;
    const set = sets.get(device.setCode);
    if (!set) return false;
    return !set.nppId || distributors.get(set.nppId)?.status === 'Đang hợp tác';
  }).length;
}
