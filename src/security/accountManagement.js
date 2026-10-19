export async function authorizeAccountManagement(client) {
  if (!client) throw new Error('Cần kết nối máy chủ để cập nhật tài khoản.');
  const { data, error } = await client.rpc('require_account_admin_session');
  if (error || data !== true) {
    throw new Error('Chưa xác nhận được phiên admin đang hoạt động. Quyền tài khoản chưa được thay đổi; hãy tải lại trang để kiểm tra phiên.');
  }
}

export function confirmAccountUpdate(result, targetId, expected) {
  if (result?.error === 'RATE_LIMIT_EXCEEDED') throw new Error(`Thao tác quá nhanh. Thử lại sau ${result.retry_after_seconds} giây.`);
  if (result?.id !== targetId || Object.entries(expected).some(([key, value]) => result[key] !== value)) {
    throw new Error('Máy chủ chưa xác nhận đầy đủ thay đổi. Hãy tải lại danh sách để đối chiếu.');
  }
}
