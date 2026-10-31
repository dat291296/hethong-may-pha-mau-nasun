import { normalizeRegion } from '../../fieldwork/lib/teamWorkspace.js';

export function summarizeDashboard(systemSets, npps, today) {
  const distributors = new Map(npps.map(npp => [npp.id, npp]));
  const regions = new Map(['Miền Bắc', 'Miền Trung', 'Miền Nam'].map(name => [name, { name, count: 0, installed: 0 }]));
  const models = new Map();
  const stats = { installed: 0, stock: 0, revoked: 0, maintenance: 0, warehouse: 0, overdue: 0 };
  for (const set of systemSets) {
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
