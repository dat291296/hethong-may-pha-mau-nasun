export function completedSyncState(success, remaining, reportedError = '') {
  if (success && remaining === 0) return { state: 'idle', message: '' };
  return { state: 'error', message: reportedError || (remaining > 0
    ? `${remaining} mục chưa gửi xong, đang chờ thử lại hoặc cần kiểm tra. Dữ liệu vẫn được giữ trên điện thoại.`
    : 'Chưa xác minh được phiên đồng bộ. Kiểm tra kết nối hoặc đăng nhập lại.') };
}
