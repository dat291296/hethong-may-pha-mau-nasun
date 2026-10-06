export function isAssignedTo(item, user) {
  if (!user) return false;
  if (item.assignedUserId) return item.assignedUserId === user.id;
  const name = String(user.name || user.full_name || '').trim().toLocaleLowerCase('vi');
  return Boolean(name && String(item.technician || '').trim().toLocaleLowerCase('vi') === name);
}

export function repairNeedsAction(ticket) {
  return ticket.processingStatus !== 'Đã xử lý' || ticket.customerReturnStatus === 'Chưa gửi trả';
}

export function missingMachineFields(machine) {
  if (machine.status !== 'DA_LAP_DAT' && machine.status !== 'BAO_THUONG_BAO_TRI') return [];
  return [
    ['dispenserSerial', 'Seri máy chiết'], ['mixerSerial', 'Seri máy lắc'],
    ['computerSerial', 'Seri máy tính'], ['printerSerial', 'Seri máy in'],
    ['nextMaintenanceDue', 'Hạn bảo trì'],
  ].filter(([key]) => !String(machine[key] || '').trim() || /^(n\/a|không có seri)$/i.test(String(machine[key]).trim())).map(([, label]) => label);
}

export function isDraftExpired(draft, now = Date.now()) {
  return !draft?.savedAt || now - draft.savedAt > 30 * 86400000;
}

export function searchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function matchesSavedRepair(row, payload) {
  return Boolean(row && Object.entries(payload).every(([key, value]) => value === undefined || JSON.stringify(canonical(row[key])) === JSON.stringify(canonical(value))));
}
