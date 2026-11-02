import { matchesSearch, matchesDateRange } from '../../../shared/workspace/workspaceFilters.js';
import { isRepairAwaitingReturn } from '../../repairs/lib/repairClassification.js';

export function naturalAssetOrder(a, b, key = 'id') {
  return String(a?.[key] || a?.id || a?.setCode || '').localeCompare(
    String(b?.[key] || b?.id || b?.setCode || ''), undefined, { numeric: true, sensitivity: 'base' });
}

export function indexRepairStatuses(tickets) {
  const index = new Map();
  for (const ticket of tickets) {
    if (!ticket.serialNumber) continue;
    if (!index.has(ticket.nppId)) index.set(ticket.nppId, new Map());
    const regional = index.get(ticket.nppId);
    const status = regional.get(ticket.serialNumber) || { pending: false, returning: false };
    status.pending ||= ticket.processingStatus === 'Chưa xử lý';
    status.returning ||= ticket.processingStatus === 'Đã xử lý' && isRepairAwaitingReturn(ticket);
    regional.set(ticket.serialNumber, status);
  }
  return index;
}

export function filterAssetSets(sets, distributors, repairIndex, filters, today) {
  const npps = new Map(distributors.map(npp => [npp.id, npp]));
  return sets.filter(set => {
    const npp = npps.get(set.nppId);
    if (filters.model !== 'ALL' && set.dispenserModel !== filters.model) return false;
    if (filters.status !== 'ALL' && set.status !== filters.status) return false;
    if (filters.province !== 'ALL' && (set.province || npp?.province) !== filters.province) return false;
    if (filters.owner !== 'ALL' && set.technician !== filters.owner) return false;
    if (!matchesSearch(filters.search, [set.setCode, set.nppName, set.dispenserSerial, set.mixerSerial,
      set.computerSerial, set.printerSerial, set.province, set.region, npp?.phone])) return false;
    if (!matchesDateRange(set.installDate || set.installedDate, filters.from, filters.to)) return false;
    if (filters.quick === 'ALL') return true;
    if (filters.quick === 'STOCK') return set.status === 'TRONG_KHO';
    if (filters.quick === 'OVERDUE') return Boolean(set.nextMaintenanceDue && set.nextMaintenanceDue < today);
    const tickets = repairIndex.get(set.nppId);
    return [set.dispenserSerial, set.mixerSerial, set.computerSerial, set.printerSerial].filter(Boolean)
      .some(serial => filters.quick === 'PENDING' ? tickets?.get(serial)?.pending
        : filters.quick === 'RETURN' && tickets?.get(serial)?.returning);
  }).sort((a, b) => naturalAssetOrder(a, b, 'setCode'));
}

export function filterAssetDevices(list, search, status, sort) {
  return list.filter(item => {
    const flags = { ALL: true, NEW: Boolean(item.isNew || item.status === 'Mới 100%'),
      UPDATED: Boolean(item.isUpdated || item.updatedAt), ASSIGNED: Boolean(item.isAssigned || item.setCode),
      FREE: !item.isAssigned && !item.setCode, DOI_TRA_MOI: item.status === 'Đã đổi trả máy mới',
      DOI_TRA_CU: ['Đổi trả máy cũ', 'Đã đổi trả máy cũ'].includes(item.status) };
    return (Object.hasOwn(flags, status) ? flags[status] : item.status === status)
      && matchesSearch(search, [item.id, item.model, item.serial, item.type, item.specs, item.os, item.setCode]);
  }).sort((a, b) => {
    if (sort === 'NEWEST') {
      const difference = Date.parse(b.updatedAt || b.createdAt || '') - Date.parse(a.updatedAt || a.createdAt || '');
      if (Number.isFinite(difference) && difference !== 0) return difference;
    }
    return naturalAssetOrder(a, b);
  });
}
