import { SERVICE_CHECKLIST } from './repairClassification.js';
export function repairMissingFields(ticket) {
  const missing = [];
  for (const [key,label] of [['nppId','Nhà phân phối'],['date','Ngày xử lý'],['technician','Kỹ thuật viên'],['machineModel','Model thiết bị'],['errorDescription','Diễn giải lỗi']]) {
    if (!String(ticket[key] || '').trim()) missing.push(label);
  }
  if (['completed','customer_confirmed'].includes(ticket.fieldVisitStatus) && SERVICE_CHECKLIST.some(([key]) => !ticket.serviceChecklist?.[key])) missing.push('Checklist công tác');
  return missing;
}
