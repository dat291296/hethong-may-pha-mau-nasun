export const SERVICE_CHECKLIST = [['inspection', 'Kiểm tra tổng thể'], ['functionalTest', 'Chạy thử chức năng']];
export const FAILURE_COMPONENTS = ['Main', 'SSD', 'HDD', 'RAM', 'CPU', 'Nguồn', 'Màn hình', 'Cao su', 'Motor', 'Dây curoa', 'Vòng bi', 'Bơm', 'Van', 'Cảm biến', 'Bo điều khiển', 'Đầu in', 'Cáp / dây điện', 'Phần mềm', 'Khác', 'Chưa xác định'];
export function failureComponents(ticket) {
  return [...new Set(String(ticket.errorCategory || '').split(';').map(value => value.trim()).filter(Boolean))];
}
export function summarizeFailureComponents(tickets) {
  const groups = new Map();
  for (const ticket of tickets) {
    for (const component of failureComponents(ticket)) {
      const category = ticket.productCategory || 'Chưa rõ thiết bị';
      const key = `${category}:${component}`;
      const row = groups.get(key) || { key, category, component, count: 0 };
      row.count++;
      groups.set(key, row);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'vi'));
}
export function requiresRepairReturn(ticket) {
  if (ticket.actionDirection === 'Xuất đổi') return true;
  if (typeof ticket.serviceChecklist?.returnRequired === 'boolean') return ticket.serviceChecklist.returnRequired;
  return ticket.customerReturnStatus === 'Đã gửi trả' || !ticket.actionDirection;
}
export function isRepairAwaitingReturn(ticket) {
  return requiresRepairReturn(ticket) && ticket.customerReturnStatus !== 'Đã gửi trả';
}
export function repairReturnLabel(ticket) {
  return requiresRepairReturn(ticket) ? (ticket.customerReturnStatus === 'Đã gửi trả' ? 'Đã gửi trả' : 'Chưa gửi trả') : 'Không cần gửi trả';
}
