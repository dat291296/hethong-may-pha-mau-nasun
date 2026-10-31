export function assertAuditAppendOnly(action) {
  if (['UPDATE_AUDIT_LOG', 'DELETE_AUDIT_LOG'].includes(action)) {
    throw Object.assign(new Error('Nhật ký chỉ đọc. Yêu cầu sửa/xóa cũ được giữ để đối chiếu và không gửi lên server.'), { code:'AUDIT_IMMUTABLE' });
  }
}
