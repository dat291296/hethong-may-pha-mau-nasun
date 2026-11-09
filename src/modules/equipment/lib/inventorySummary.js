
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
  const legacyPrefixes = { dispenser: ['DISP'], mixer: ['MIXE', 'MIX'], computer: ['COMP', 'PC'], printer: ['PRIN', 'PRN'] }[category];
  const acceptedPrefixes = new Set(legacyPrefixes.map(value => value.toUpperCase()));
  const used = new Set(devices.reduce((numbers, device) => {
    const id = String(device.id || '').trim().toUpperCase();
    const match = id.match(/^([A-Z]+)-(\d+)$/);
    const number = match
      ? (acceptedPrefixes.has(match[1]) ? Number(match[2]) : 0)
      : (/^\d+$/.test(id) ? Number(id) : 0);
    if (Number.isSafeInteger(number) && number >= 1 && number <= 999) numbers.push(number);
    return numbers;
  }, []));
  for (let number = 1; number <= 999; number += 1) {
    if (!used.has(number)) return `${prefix}-${String(number).padStart(3, '0')}`;
  }
  throw new Error('Device numbering limit reached');
}

export function inventoryLinkIssues({ systemSets = [], ...devices }) {
  const issues = [];
  const parents = new Map(systemSets.map(set => [set.setCode, set]));
  for (const [table, category] of Object.entries(categories)) {
    const rows = devices[table] || [];
    const deviceIds = new Set(rows.map(device => device.id));
    const references = new Map();
    for (const set of systemSets) {
      const id = set[`${category}Id`];
      if (!references.has(id)) references.set(id, []);
      references.get(id).push(set);
    }
    for (const device of rows) {
      const owners = references.get(device.id) || [];
      if (owners.length && (!device.isAssigned || owners.some(set => set.setCode !== device.setCode))) {
        issues.push(`${device.id}: bộ máy ${owners.map(set => set.setCode).join(', ')} tham chiếu nhưng trạng thái hoặc mã bộ trên thiết bị chưa khớp.`);
      }
      if (device.setCode) {
        const parent = parents.get(device.setCode);
        if (!parent || parent[`${category}Id`] !== device.id) {
          issues.push(`${device.id}: khai báo thuộc bộ ${device.setCode}, bộ máy đang liên kết ${parent?.[`${category}Id`] || 'chưa có thiết bị tương ứng'}.`);
        }
      }
    }
    for (const set of systemSets) {
      const id = set[`${category}Id`];
      if (id && !deviceIds.has(id)) issues.push(`${set.setCode}: không tìm thấy thiết bị ${id} trong dữ liệu đã tải.`);
    }
  }
  return issues;
}
