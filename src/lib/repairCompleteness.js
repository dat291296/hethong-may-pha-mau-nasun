import { isUnknownSerial } from './deviceSerial.js';
export function repairMissingFields(ticket) {
  const missing = [];
  for (const [key,label] of [['nppId','Nhà phân phối'],['date','Ngày xử lý'],['technician','Kỹ thuật viên'],['machineModel','Model thiết bị'],['errorDescription','Diễn giải lỗi']]) {
    if (!String(ticket[key] || '').trim()) missing.push(label);
  }
  if (!['Màn hình','Khác / Linh kiện','Phụ kiện','Linh kiện'].includes(ticket.productCategory) && isUnknownSerial(ticket.serialNumber)) missing.push('Số seri thiết bị');
  if (['completed','customer_confirmed'].includes(ticket.fieldVisitStatus) && ['inspection','cleaning','functionalTest','safetyCheck','dataBackup'].some(key => !ticket.serviceChecklist?.[key])) missing.push('Checklist công tác');
  return missing;
}
