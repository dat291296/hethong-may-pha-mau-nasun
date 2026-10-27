const MESSAGES = Object.freeze({
  'OFFLINE_DOCUMENT_FULL':'Hàng chờ đã đạt giới hạn dung lượng hoặc số thao tác. Giữ nháp đang mở; đồng bộ hoặc đối chiếu các mục cũ trước khi lưu thêm.',
  'FIELD_PENDING_EDIT':'Phiếu hoặc bộ máy này còn thay đổi đang chờ xác nhận. Đồng bộ và đối chiếu trước khi sửa tiếp.',
  'PT409':'Dữ liệu đã được người khác thay đổi. Bản sửa được giữ trong hàng chờ cần duyệt; tải lại và đối chiếu, không ghi đè.',
  'FIELD_INTENT_CONFLICT':'Mã thao tác đã gắn với nội dung khác. Giữ bản gốc và đối chiếu hàng chờ trước khi tạo bản sửa mới.',
  'SCHEMA_MIGRATION_REQUIRED':'Máy chủ chưa có phiên bản nghiệp vụ mới. Dữ liệu trên thiết bị được giữ; liên hệ quản trị viên.',
  'REVISION_REQUIRED':'Bản nháp thiếu phiên bản dữ liệu gốc. Giữ lại nội dung, tải lại hồ sơ và đối chiếu trước khi gửi.',
  'FIELD_RECEIPT_INVALID':'Chưa nhận đủ xác nhận từ máy chủ. Hàng chờ được giữ, không tạo lại phiếu mới.',
  'FIELD_RECEIPT_WRITE_FAILED':'Máy chủ có thể đã lưu nhưng thiết bị chưa lưu được xác nhận. Giữ hàng chờ và thử lại khi đủ dung lượng.',
  'ONLINE_CONFIRMATION_REQUIRED':'Kết nối mạng, kiểm tra bộ máy/NPP và xác nhận lại trước khi thực hiện.',
  'INVALID_CHECKLIST':'Checklist chưa đủ hoặc không khớp máy. Giữ bản nháp và đối chiếu lại từng bước.',
  'INVALID_OFFLINE_DATA': 'Dữ liệu chờ gửi cần kiểm tra. Bản gốc được giữ nguyên, không tự động gửi.',
  'OFFLINE_SCOPE_INVALID': 'Chưa xác minh được quyền hoặc miền phụ trách. Đăng nhập lại và kiểm tra phân quyền.',
  'OFFLINE_APP_UPDATE_REQUIRED': 'Thao tác cần phiên bản ứng dụng mới hơn. Cập nhật app; không xóa dữ liệu trình duyệt.',
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
