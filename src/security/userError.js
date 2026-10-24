const MESSAGES = Object.freeze({
  '42501': 'Phiên đăng nhập hết hạn hoặc bạn không có quyền thực hiện. Hãy đăng nhập lại và kiểm tra quyền.',
  '23514': 'Dữ liệu chưa hợp lệ. Kiểm tra ảnh, ngày và các trường bắt buộc.',
  '23505': 'Mã dữ liệu đã tồn tại. Kiểm tra lại trước khi lưu.',
  '23503': 'Dữ liệu đang được liên kết. Tải lại thông tin trước khi thao tác.',
  '22P02': 'Dữ liệu không đúng định dạng. Kiểm tra lại trước khi lưu.',
  'QUERY_TIMEOUT': 'Yêu cầu quá thời gian. Kiểm tra kết nối và thử lại.',
  'PGRST202': 'Hệ thống chưa sẵn sàng cho thao tác này. Liên hệ quản trị viên.',
});
export function userErrorMessage(error, fallback = 'Chưa thực hiện được thao tác. Nội dung đang nhập được giữ; kiểm tra lại và thử lại.') {
  if (MESSAGES[error?.code]) return MESSAGES[error.code];
  // Provider errors can contain SQL, identifiers and submitted values.
  if (error?.code || error?.details || error?.hint || error?.status) return fallback;
  // Local validation messages are useful; technical diagnostics are never shown.
  const message = typeof error?.message === 'string' ? error.message : '';
  if (message.length <= 240 && /[ăâđêôơưĂÂĐÊÔƠƯàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/u.test(message)
      && !/SQL|Postgres|supabase|schema|constraint|column|relation|token|password|https?:|\bselect\b|\binsert\b|\bupdate\b/i.test(message)) return message;
  return fallback;
}
