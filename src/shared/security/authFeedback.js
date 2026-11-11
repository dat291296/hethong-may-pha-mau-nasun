export function shouldCountLoginFailure(error) {
  return error?.code === 'invalid_credentials' || (!error?.code && /invalid login credentials/i.test(error?.message || ''));
}

export function getAuthErrorMessage(error, action = 'signup') {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  if (['pkce_verifier_missing', 'bad_code_verifier'].includes(code) || error?.name === 'AuthPKCECodeVerifierMissingError') return 'Không xác minh được liên kết trên trình duyệt này. Hãy yêu cầu liên kết mới và mở bằng đúng trình duyệt, thiết bị đã gửi yêu cầu; không dùng cửa sổ ẩn danh khác.';
  if (['session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'invalid_refresh_token', 'invalid_grant'].includes(code) || error?.name === 'AuthSessionMissingError') return 'Phiên khôi phục không còn hợp lệ. Hãy yêu cầu liên kết mới và mở bằng đúng trình duyệt đã gửi yêu cầu.';
  if (action === 'update-password' && (error?.status >= 500 || code === 'unexpected_failure')) return 'Máy chủ chưa xác nhận được việc đổi mật khẩu. Hãy thử đăng nhập bằng mật khẩu mới; nếu chưa được, yêu cầu liên kết khôi phục mới.';
  if (['insufficient_aal', 'RECOVERY_MFA_REQUIRED'].includes(code)) return 'Tài khoản đã bật xác thực hai lớp. Nhập mã 6 số từ ứng dụng xác thực để cập nhật mật khẩu.';
  if (code === 'RECOVERY_UPDATE_UNCONFIRMED') return 'Máy chủ chưa xác nhận việc đổi mật khẩu. Hãy thử đăng nhập bằng mật khẩu mới; nếu chưa được, yêu cầu mã khôi phục email mới.';\n  if (code === 'RECOVERY_EMAIL_CODE_REQUIRED') return 'Yêu cầu mã xác nhận email trước khi cập nhật mật khẩu.';
  if (['email_otp_invalid', 'otp_expired'].includes(code) && action === 'update-password') return 'Mã email không đúng hoặc đã hết hạn. Gửi mã mới rồi thử lại.';
  if (code === 'RECOVERY_MFA_UNAVAILABLE') return 'Tài khoản yêu cầu xác thực hai lớp nhưng không có ứng dụng xác thực khả dụng. Liên hệ quản trị viên để được hỗ trợ khôi phục quyền truy cập.';
  if (['mfa_verification_failed', 'mfa_challenge_expired'].includes(code)) return 'Mã xác thực không đúng hoặc đã hết hạn. Nhập mã mới nhất trong ứng dụng xác thực.';
  if (code === 'same_password') return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  if (['otp_expired', 'flow_state_expired', 'flow_state_not_found'].includes(code)) return 'Liên kết đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu liên kết mới.';
  if (code === 'AUTH_RESPONSE_TIMEOUT' || code === 'request_timeout' || error?.status === 504 || error?.status === 408) {
    if (action === 'login') return 'Đăng nhập đang mất nhiều thời gian. Kiểm tra kết nối và thử lại; lỗi này không tính là sai mật khẩu.';
    if (action === 'update-password') return 'Chưa xác nhận được việc đổi mật khẩu. Hãy thử đăng nhập bằng mật khẩu mới trước khi yêu cầu liên kết khôi phục khác.';
    if (action !== 'signup') return 'Máy chủ chưa xác nhận việc gửi email. Hãy kiểm tra hộp thư và thư rác, chờ 60 giây rồi thử lại.';
    return 'Máy chủ chưa xác nhận xong yêu cầu. Hãy kiểm tra email xác minh (kể cả thư rác). Nếu chưa nhận được, chờ 60 giây rồi gửi lại email xác minh; không bấm đăng ký liên tục.';
  }
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
  if (action === 'login' && shouldCountLoginFailure(error)) return 'Không thể đăng nhập. Kiểm tra lại email và mật khẩu.';
  if (action === 'login' && error?.status >= 500) return 'Máy chủ đăng nhập đang gặp sự cố. Vui lòng thử lại sau.';
  if (error?.status >= 500 || code === 'unexpected_failure' || /smtp|sending.*email/i.test(message)) {
    return 'Hệ thống chưa gửi được email xác minh hoặc khôi phục. Vui lòng liên hệ quản trị viên NASUN kiểm tra cấu hình gửi email, sau đó thử lại.';
  }
  if (error instanceof TypeError || error?.name === 'AuthRetryableFetchError' || /fetch|network|timeout/i.test(message)) {
    if (action === 'signup') return 'Chưa nhận được phản hồi đăng ký từ máy chủ. Kiểm tra kết nối và hộp thư; nếu chưa có email, chờ 60 giây rồi gửi lại email xác minh.';
    return 'Không kết nối được hệ thống. Kiểm tra mạng rồi thử lại.';
  }
  if (action === 'login') return 'Chưa thể đăng nhập. Vui lòng thử lại hoặc liên hệ quản trị viên NASUN.';
  if (action === 'update-password') return 'Chưa cập nhật được mật khẩu. Vui lòng thử lại hoặc yêu cầu liên kết khôi phục mới.';
  return action === 'signup' ? 'Chưa thể tạo tài khoản. Vui lòng thử lại hoặc liên hệ quản trị viên NASUN.' : 'Chưa gửi được email. Vui lòng thử lại hoặc liên hệ quản trị viên NASUN.';
}

export function getPasswordRuleState(value) {
  return { length: value.length >= 12, uppercase: /[A-Z]/.test(value), lowercase: /[a-z]/.test(value), number: /\d/.test(value) };
}
