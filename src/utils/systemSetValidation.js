const EMPTY_VALUES = new Set(['', 'N/A', '—', '-']);

function isEmpty(value) {
  return EMPTY_VALUES.has(String(value ?? '').trim().toUpperCase());
}

export function getSystemSetMissingFields(set = {}) {
  const missing = [];

  if (isEmpty(set.dispenserModel)) missing.push('Model máy chiết');
  if (isEmpty(set.dispenserSerial)) missing.push('Seri máy chiết');
  if (isEmpty(set.mixerModel)) missing.push('Model máy lắc');
  if (isEmpty(set.mixerSerial)) missing.push('Seri máy lắc');
  if (isEmpty(set.computerType) && isEmpty(set.computerId)) missing.push('Thông tin máy tính');
  if (isEmpty(set.printerSerial)) missing.push('Seri máy in');

  if (set.status === 'DA_LAP_DAT') {
    if (isEmpty(set.nppName) || String(set.nppName).includes('Kho Tổng')) missing.push('Nhà phân phối');
    if (isEmpty(set.installDate)) missing.push('Ngày lắp đặt');
  }

  if (isEmpty(set.technician)) missing.push('Kỹ thuật viên phụ trách');
  return missing;
}
