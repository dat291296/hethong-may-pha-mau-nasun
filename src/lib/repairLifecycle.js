export function validateRepairReturn(ticket) {
  if (ticket.customerReturnStatus === 'Đã gửi trả' && ticket.processingStatus !== 'Đã xử lý') {
    throw Object.assign(new Error('Chỉ được xác nhận gửi trả khi phiếu đã xử lý xong.'), {code:'INVALID_REPAIR_RETURN'});
  }
}
