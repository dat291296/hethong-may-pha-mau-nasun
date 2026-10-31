import { searchText } from '../../../shared/utils/searchText.js';
import { normalizeRegion } from '../../../shared/workspace/regions.js';
export { searchText } from '../../../shared/utils/searchText.js';
export { isDraftExpired } from '../../../shared/utils/draftExpiry.js';
export { normalizeRegion, inManagedRegion } from '../../../shared/workspace/regions.js';
import { isRepairAwaitingReturn } from '../../repairs/lib/repairClassification.js';
import { isUnknownSerial } from '../../equipment/lib/deviceSerial.js';
export function isAssignedTo(item, user) {
  if (!user) return false;
  if (item.assignedUserId) return item.assignedUserId === user.id;
  const name = String(user.name || user.full_name || '').trim().toLocaleLowerCase('vi');
  return Boolean(name && String(item.technician || '').trim().toLocaleLowerCase('vi') === name);
}

export function repairNeedsAction(ticket) {
  return ticket.processingStatus !== 'Đã xử lý' || isRepairAwaitingReturn(ticket);
}

export function missingMachineFields(machine) {
  if (machine.status !== 'DA_LAP_DAT' && machine.status !== 'BAO_THUONG_BAO_TRI') return [];
  return [
    ['dispenserSerial', 'Seri máy chiết'], ['mixerSerial', 'Seri máy lắc'],
    ['computerSerial', 'Seri máy tính'], ['printerSerial', 'Seri máy in'],
    ['nextMaintenanceDue', 'Hạn bảo trì'],
  ].filter(([key]) => isUnknownSerial(machine[key])).map(([, label]) => label);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function matchesSavedRepair(row, payload) {
  return Boolean(row && Object.entries(payload).every(([key, value]) => value === undefined || JSON.stringify(canonical(row[key])) === JSON.stringify(canonical(value))));
}

export function regionalMachineCounts(systemSets, npps = []) {
  return ['Miền Bắc', 'Miền Trung', 'Miền Nam'].map(region => {
    const machines = systemSets.filter(machine => normalizeRegion(machine.region || npps.find(npp => npp.id === machine.nppId)?.region) === region);
    return { name: region, count: machines.length, installed: machines.filter(machine => machine.status === 'DA_LAP_DAT').length };
  });
}

export function taskPriority(task, today) {
  if (task.due && task.due < today) return 0;
  if (task.tab === 'repairs' && task.label === 'Sửa chữa') return 1;
  if (task.due === today) return 2;
  if (task.label === 'Chờ gửi trả') return 3;
  return 4;
}
