export function getAuthErrorMessage(error, action = 'signup') {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  if (['weak_password', 'password_too_short'].includes(code) || /weak password|password.*(at least|characters)/i.test(message)) {
    return 'Mật khẩu cần ít nhất 12 ký tự, gồm chữ hoa, chữ thường và chữ số. Nếu vẫn bị từ chối, hãy chọn mật khẩu khác mạnh hơn.';
  }
  if (['over_email_send_rate_limit', 'over_request_rate_limit'].includes(code) || error?.status === 429) {
    return 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ vài phút rồi thử lại.';
  }
  if (code === 'email_address_invalid' || /invalid email/i.test(message)) return 'Địa chỉ email không hợp lệ. Vui lòng kiểm tra lại.';
  if (code === 'signup_disabled') return 'Hệ thống đang tạm dừng đăng ký. Vui lòng liên hệ quản trị viên NASUN.';
  if (code === 'captcha_failed') return 'Chưa xác minh được yêu cầu đăng ký. Vui lòng tải lại trang và thử lại.';
  if (code === 'user_already_exists' || /already registered/i.test(message)) return 'Không thể đăng ký với email này. Hãy đăng nhập hoặc dùng chức năng quên mật khẩu.';
  if (error?.status >= 500 || code === 'unexpected_failure' || /smtp|sending.*email/i.test(message)) {
    return 'Hệ thống chưa gửi được email xác minh hoặc khôi phục. Vui lòng liên hệ quản trị viên NASUN kiểm tra cấu hình gửi email, sau đó thử lại.';
  }
  if (error instanceof TypeError || error?.name === 'AuthRetryableFetchError' || /fetch|network|timeout/i.test(message)) {
    return 'Không kết nối được hệ thống. Kiểm tra mạng rồi thử lại.';
  }
  return action === 'signup' ? 'Chưa thể tạo tài khoản. Vui lòng thử lại hoặc liên hệ quản trị viên NASUN.' : 'Chưa gửi được email. Vui lòng thử lại hoặc liên hệ quản trị viên NASUN.';
}

export function getPasswordRuleState(value) {
  return { length: value.length >= 12, uppercase: /[A-Z]/.test(value), lowercase: /[a-z]/.test(value), number: /\d/.test(value) };
}
