const categories = { dispensers: 'dispenser', mixers: 'mixer', computers: 'computer', printers: 'printer' };

export function summarizeInventory({ systemSets = [], ...devices }) {
  const stock = {};
  const loose = {};
  for (const [table, category] of Object.entries(categories)) {
    const referenced = new Set(systemSets.map(set => set[`${category}Id`]).filter(Boolean));
    stock[table] = (devices[table] || []).filter(device => !device.isAssigned && !device.setCode && !referenced.has(device.id));
  }
  const completeFromLooseDevices = Math.min(...Object.values(stock).map(rows => rows.length));
  const stockSets = systemSets.filter(set => set.status === 'TRONG_KHO');
  for (const table of Object.keys(categories)) loose[table] = stock[table].slice(completeFromLooseDevices);
  return { stock, stockSets, loose, completeFromLooseDevices,
    totalReadySets: stockSets.length + completeFromLooseDevices,
    totalSets: systemSets.length + completeFromLooseDevices };
}

export function nextWarehouseId(category, devices = []) {
  const prefix = { dispenser: 'DISP', mixer: 'MIXE', computer: 'COMP', printer: 'PRIN' }[category];
  if (!prefix) throw new Error('Unknown device category');
  // Legacy imports used another category prefix. Keep existing IDs intact.
  const highest = devices.reduce((max, device) => {
    const match = String(device.id || '').trim().match(/^(?:(?:DISP|MIXE|COMP|PRIN)-)?(\d+)$/i);
    const number = match ? Number(match[1]) : 0;
    return Number.isSafeInteger(number) ? Math.max(max, number) : max;
  }, 0);
  if (!Number.isSafeInteger(highest + 1)) throw new Error('Device numbering limit reached');
  return `${prefix}-${String(highest + 1).padStart(3, '0')}`;
}

export function inventoryLinkIssues({ systemSets = [], ...devices }) {
  const issues = [];
  for (const [table, category] of Object.entries(categories)) {
    const rows = devices[table] || [];
    for (const device of rows) {
      const owners = systemSets.filter(set => set[`${category}Id`] === device.id);
      if (owners.length && (!device.isAssigned || owners.some(set => set.setCode !== device.setCode))) {
        issues.push(`${device.id}: bộ máy ${owners.map(set => set.setCode).join(', ')} tham chiếu nhưng trạng thái hoặc mã bộ trên thiết bị chưa khớp.`);
      }
      if (device.setCode) {
        const parent = systemSets.find(set => set.setCode === device.setCode);
        if (!parent || parent[`${category}Id`] !== device.id) {
          issues.push(`${device.id}: khai báo thuộc bộ ${device.setCode}, bộ máy đang liên kết ${parent?.[`${category}Id`] || 'chưa có thiết bị tương ứng'}.`);
        }
      }
    }
    for (const set of systemSets) {
      const id = set[`${category}Id`];
      if (id && !rows.some(device => device.id === id)) issues.push(`${set.setCode}: không tìm thấy thiết bị ${id} trong dữ liệu đã tải.`);
    }
  }
  return issues;
}
