import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { syncOfflineQueue } from '../lib/offlineSync.js';
import { clearOfflineStorage } from '../lib/offlineDb.js';
import { AUTH_REDIRECT_PURPOSES, createPrivateIdentifier, getAuthRedirectUrl } from '../security/authRuntime.js';
import { completePasswordRecovery, requestPasswordRecovery, resendSignupVerification } from '../security/authEmailFlows.js';

const isKeycloakEnabled = import.meta.env.VITE_ENABLE_KEYCLOAK === 'true';
const LOGIN_ATTEMPTS_KEY = 'nasun_login_attempts';
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_SECONDS = 60;

function getPasswordRules(value) {
  return [
    { id: 'length', label: 'Ít nhất 12 ký tự', passed: value.length >= 12 },
    { id: 'uppercase', label: 'Có chữ hoa', passed: /[A-Z]/.test(value) },
    { id: 'lowercase', label: 'Có chữ thường', passed: /[a-z]/.test(value) },
    { id: 'number', label: 'Có chữ số', passed: /\d/.test(value) },
  ];
}

async function getLoginAttemptState(email) {
  try {
    const identifier = await createPrivateIdentifier(email);
    const attempts = JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY) || '{}');
    const state = attempts[identifier] || { count: 0, firstFailureAt: 0 };
    if (Date.now() - state.firstFailureAt >= LOGIN_LOCK_MS) return { count: 0, firstFailureAt: 0 };
    return state;
  } catch {
    return { count: 0, firstFailureAt: 0 };
  }
}

async function updateLoginAttemptState(email, succeeded) {
  try {
    const identifier = await createPrivateIdentifier(email);
    const attempts = JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY) || '{}');
    if (succeeded) delete attempts[identifier];
    else {
      const previous = await getLoginAttemptState(email);
      attempts[identifier] = {
        count: previous.count + 1,
        firstFailureAt: previous.firstFailureAt || Date.now(),
      };
    }
    localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch (storageError) {
    console.warn('[Login] Could not update local attempt state:', storageError.message);
  }
}

export default function LoginModal() {
  const { user, isDevMode, switchDevRole, loading, emailVerifiedSuccess, setEmailVerifiedSuccess, passwordRecovery, setPasswordRecovery, authRedirectError, setAuthRedirectError } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const passwordRules = getPasswordRules(password);
  const passwordIsStrong = passwordRules.every(rule => rule.passed);

  useEffect(() => {
    if (emailVerifiedSuccess) {
      setMode('login');
      setVerificationEmail('');
      setNotice('Email đã được xác thực. Bạn có thể đăng nhập.');
      setEmailVerifiedSuccess(false);
    }
  }, [emailVerifiedSuccess, setEmailVerifiedSuccess]);

  useEffect(() => {
    if (passwordRecovery) {
      setMode('new-password');
      setPassword('');
      setConfirmPassword('');
      resetFeedback();
    }
  }, [passwordRecovery]);

  useEffect(() => {
    if (authRedirectError) {
      setError(authRedirectError);
      setAuthRedirectError('');
    }
  }, [authRedirectError, setAuthRedirectError]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldown(value => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (resetCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResetCooldown(value => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resetCooldown]);

  if ((user && !passwordRecovery) || loading) return null;

  const resetFeedback = () => {
    setError('');
    setNotice('');
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    resetFeedback();
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    resetFeedback();
    setPending(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (isDevMode) {
        switchDevRole(email.toLowerCase().includes('qc') ? 'QC' : email.toLowerCase().includes('admin') ? 'ADMIN' : 'VIEWER');
        return;
      }
      if (!supabase) throw new Error('AUTH_CONFIGURATION_UNAVAILABLE');
      const attemptState = await getLoginAttemptState(normalizedEmail);
      if (attemptState.count >= MAX_LOGIN_FAILURES) {
        const remainingMinutes = Math.max(1, Math.ceil((LOGIN_LOCK_MS - (Date.now() - attemptState.firstFailureAt)) / 60000));
        throw new Error(`LOCAL_LOGIN_LOCKED:${remainingMinutes}`);
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (signInError) throw signInError;
      await updateLoginAttemptState(normalizedEmail, true);
      await syncOfflineQueue();
    } catch (err) {
      console.error('[Login] Password sign-in failed:', err.message);
      if (err.code === 'email_not_confirmed' || /email not confirmed/i.test(err.message || '')) {
        setVerificationEmail(normalizedEmail);
        setError('Email chưa được xác minh. Hãy kiểm tra hộp thư hoặc gửi lại liên kết xác nhận.');
      } else if (err.message === 'AUTH_CONFIGURATION_UNAVAILABLE') {
        setError('Hệ thống đăng nhập chưa được cấu hình. Vui lòng liên hệ quản trị viên.');
      } else if (err.message?.startsWith('LOCAL_LOGIN_LOCKED:')) {
        setError(`Đã tạm khóa đăng nhập trên thiết bị này. Thử lại sau ${err.message.split(':')[1]} phút.`);
      } else {
        await updateLoginAttemptState(normalizedEmail, false);
        setError('Không thể đăng nhập. Kiểm tra lại email và mật khẩu.');
      }
    } finally {
      setPending(false);
    }
  };

  const signInWithKeycloak = async () => {
    resetFeedback();
    setPending(true);
    try {
      const redirectTo = await getAuthRedirectUrl(AUTH_REDIRECT_PURPOSES.LOGIN);
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'keycloak',
        options: { scopes: 'openid', redirectTo },
      });
      if (signInError) throw signInError;
    } catch (err) {
      console.error('[Login] Keycloak sign-in failed:', err.message);
      setError('Keycloak chưa được cấu hình đúng trong Supabase hoặc không thể kết nối.');
      setPending(false);
    }
  };

  const submitSignup = async (event) => {
    event.preventDefault();
    resetFeedback();
    if (!passwordIsStrong) {
      setError('Mật khẩu chưa đáp ứng đầy đủ các yêu cầu bảo mật.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setPending(true);
    try {
      if (isDevMode) {
        setNotice('Tài khoản mô phỏng đã được tạo. Hãy đăng nhập để tiếp tục.');
        setMode('login');
        return;
      }
      const emailRedirectTo = await getAuthRedirectUrl(AUTH_REDIRECT_PURPOSES.VERIFIED);
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo, data: { full_name: fullName.trim() } },
      });
      if (signUpError) throw signUpError;
      const normalizedEmail = email.trim().toLowerCase();
      setMode('login');
      if (!signUpData.session) {
        setVerificationEmail(normalizedEmail);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        setVerificationEmail('');
      }
      setNotice(signUpData.session
        ? 'Tài khoản đã được tạo. Bạn có thể đăng nhập.'
        : 'Đã gửi email xác thực. Kiểm tra hộp thư đến hoặc thư rác để kích hoạt tài khoản.');
    } catch (err) {
      console.error('[Login] Sign-up failed:', err.message);
      setError(err.message || 'Không thể tạo tài khoản.');
    } finally {
      setPending(false);
    }
  };

  const resendVerificationEmail = async () => {
    if (!verificationEmail || resendCooldown > 0 || pending) return;
    resetFeedback();
    setPending(true);
    try {
      const emailRedirectTo = await getAuthRedirectUrl(AUTH_REDIRECT_PURPOSES.VERIFIED);
      await resendSignupVerification(supabase.auth, verificationEmail, emailRedirectTo);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice('Đã gửi lại email xác minh. Hãy kiểm tra hộp thư đến hoặc thư rác.');
    } catch (err) {
      console.error('[Login] Verification resend failed:', err.message);
      setError('Chưa thể gửi lại email xác minh. Vui lòng thử lại sau.');
    } finally {
      setPending(false);
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    resetFeedback();
    setPending(true);
    try {
      if (isDevMode) {
        setNotice('Mô phỏng: yêu cầu đặt lại mật khẩu đã được gửi.');
        return;
      }
      const redirectTo = await getAuthRedirectUrl(AUTH_REDIRECT_PURPOSES.RECOVERY);
      await requestPasswordRecovery(supabase.auth, email, redirectTo);
      setResetCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice('Nếu email đã đăng ký, liên kết đặt lại mật khẩu sẽ được gửi. Hãy kiểm tra hộp thư đến hoặc thư rác.');
    } catch (err) {
      console.error('[Login] Password reset failed:', err.message);
      setError('Không thể gửi yêu cầu đặt lại mật khẩu.');
    } finally {
      setPending(false);
    }
  };

  const submitNewPassword = async (event) => {
    event.preventDefault();
    resetFeedback();
    if (!passwordIsStrong) {
      setError('Mật khẩu mới chưa đáp ứng đầy đủ các yêu cầu bảo mật.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setPending(true);
    try {
      await completePasswordRecovery(supabase.auth, password);
      window.history.replaceState({}, document.title, `${window.location.origin}${window.location.pathname}`);
      setPasswordRecovery(false);
      await clearOfflineStorage();
      await supabase.auth.signOut({ scope: 'local' });
      setMode('login');
      setPassword('');
      setConfirmPassword('');
      setNotice('Mật khẩu đã được cập nhật. Bạn có thể đăng nhập bằng mật khẩu mới.');
    } catch (err) {
      console.error('[Login] Password update failed:', err.message);
      setError('Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu gửi lại liên kết đặt lại mật khẩu.');
    } finally {
      setPending(false);
    }
  };

  const renderPasswordInput = () => (
    <label className="auth-field">
      <span>Mật khẩu</span>
      <div className="auth-input-wrap">
        <LockKeyhole size={18} aria-hidden="true" />
        <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => setCapsLockOn(event.getModifierState('CapsLock'))} onKeyUp={(event) => setCapsLockOn(event.getModifierState('CapsLock'))} onBlur={() => setCapsLockOn(false)} minLength={mode === 'login' ? 6 : 12} required placeholder={mode === 'login' ? 'Nhập mật khẩu' : 'Tối thiểu 12 ký tự'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        <button type="button" className="auth-icon-button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {capsLockOn && <small className="auth-caps-warning">Caps Lock đang bật</small>}
      {mode !== 'login' && (
        <div className="auth-password-rules" aria-live="polite">
          {passwordRules.map(rule => (
            <span key={rule.id} className={rule.passed ? 'is-valid' : ''}>
              <CheckCircle2 size={13} aria-hidden="true" />{rule.label}
            </span>
          ))}
        </div>
      )}
    </label>
  );

  const renderConfirmPasswordInput = () => (
    <label className="auth-field">
      <span>Xác nhận mật khẩu</span>
      <div className="auth-input-wrap">
        <LockKeyhole size={18} aria-hidden="true" />
        <input
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          minLength="12"
          required
          placeholder="Nhập lại mật khẩu"
          autoComplete="new-password"
        />
      </div>
      {confirmPassword && (
        <small className={password === confirmPassword ? 'auth-password-match is-valid' : 'auth-password-match is-invalid'} aria-live="polite">
          {password === confirmPassword ? 'Mật khẩu đã khớp' : 'Mật khẩu chưa khớp'}
        </small>
      )}
    </label>
  );

  return (
    <main className="auth-page">
      <section className="auth-intro" aria-label="Giới thiệu hệ thống">
        <div className="auth-intro-content">
          <img src="/nasun_logo.png?v=3" alt="Nasun Paint" className="auth-brand-logo" />
          <p className="auth-eyebrow">NASUN PAINT · OPERATIONS</p>
          <h1>Quản lý máy pha màu, rõ việc tại hiện trường.</h1>
          <p className="auth-description">Theo dõi thiết bị, bảo trì, sửa chữa và dữ liệu pha màu trên một hệ thống an toàn.</p>
          <div className="auth-benefits">
            <span><CheckCircle2 size={16} /> Dữ liệu bảo vệ bằng phân quyền</span>
            <span><CheckCircle2 size={16} /> Dùng tốt trên điện thoại và máy tính</span>
            <span><CheckCircle2 size={16} /> Đồng bộ công việc kỹ thuật</span>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <img src="/nasun_logo.png?v=3" alt="Nasun Paint" />
            <span>NASUN PAINT</span>
          </div>
          <div className="auth-heading">
            <div>
              <h2>{mode === 'login' ? 'Đăng nhập hệ thống' : mode === 'signup' ? 'Tạo tài khoản mới' : mode === 'new-password' ? 'Đặt mật khẩu mới' : 'Khôi phục mật khẩu'}</h2>
            </div>
          </div>

          {notice && <div className="auth-alert auth-alert-success"><CheckCircle2 size={18} />{notice}</div>}
          {error && <div className="auth-alert auth-alert-error">{error}</div>}
          {mode === 'login' && verificationEmail && (
            <div className="auth-verification-panel">
              <span>Chưa nhận được email xác minh?</span>
              <button type="button" className="auth-text-link" onClick={resendVerificationEmail} disabled={pending || resendCooldown > 0}>
                {resendCooldown > 0 ? `Gửi lại sau ${resendCooldown}s` : 'Gửi lại email xác minh'}
              </button>
            </div>
          )}

          {mode === 'login' && (
            <form className="auth-form" onSubmit={submitLogin}>
              <label className="auth-field">
                <span>Email công việc</span>
                <div className="auth-input-wrap"><Mail size={18} aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div>
              </label>
              {renderPasswordInput()}
              <button type="button" className="auth-text-link auth-forgot" onClick={() => changeMode('reset')}>Quên mật khẩu?</button>
              <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>{pending ? 'Đang xử lý...' : 'Đăng nhập'}</button>
              {isKeycloakEnabled && !isDevMode && <><div className="auth-divider"><span>hoặc</span></div><button type="button" className="btn auth-keycloak-button" onClick={signInWithKeycloak} disabled={pending}><KeyRound size={18} />Đăng nhập qua Keycloak</button></>}
              <p className="auth-switch">Chưa có tài khoản? <button type="button" className="auth-text-link" onClick={() => changeMode('signup')}>Đăng ký</button></p>
            </form>
          )}

          {mode === 'signup' && (
            <form className="auth-form" onSubmit={submitSignup}>
              <label className="auth-field"><span>Họ và tên</span><div className="auth-input-wrap"><UserRound size={18} aria-hidden="true" /><input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength="100" placeholder="Họ tên của bạn" autoComplete="name" /></div></label>
              <label className="auth-field"><span>Email công việc</span><div className="auth-input-wrap"><Mail size={18} aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div></label>
              {renderPasswordInput()}
              {renderConfirmPasswordInput()}
              <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>{pending ? 'Đang xử lý...' : 'Tạo tài khoản'}</button>
              <p className="auth-privacy-note">Khi tạo tài khoản, bạn đồng ý với <button type="button" className="auth-text-link" onClick={() => setPrivacyOpen(true)}>chính sách quyền riêng tư</button>.</p>
              <button type="button" className="auth-back" onClick={() => changeMode('login')}><ArrowLeft size={16} />Quay lại đăng nhập</button>
            </form>
          )}

          {mode === 'reset' && (
            <form className="auth-form" onSubmit={submitReset}>
              <p className="auth-help">Nhập email công việc. Hệ thống sẽ gửi liên kết đặt lại mật khẩu.</p>
              <label className="auth-field"><span>Email công việc</span><div className="auth-input-wrap"><Mail size={18} aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div></label>
              <button className="btn btn-primary auth-submit" type="submit" disabled={pending || resetCooldown > 0}>{pending ? 'Đang xử lý...' : resetCooldown > 0 ? `Gửi lại sau ${resetCooldown}s` : 'Gửi liên kết khôi phục'}</button>
              <button type="button" className="auth-back" onClick={() => changeMode('login')}><ArrowLeft size={16} />Quay lại đăng nhập</button>
            </form>
          )}

          {mode === 'new-password' && (
            <form className="auth-form" onSubmit={submitNewPassword}>
              <p className="auth-help">Tạo mật khẩu mới có ít nhất 12 ký tự cho tài khoản của bạn.</p>
              {renderPasswordInput()}
              {renderConfirmPasswordInput()}
              <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>{pending ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</button>
            </form>
          )}

          {isDevMode && <div className="auth-dev-note">Chế độ phát triển đang bật. Nhập email chứa <strong>admin</strong> hoặc <strong>qc</strong> để mô phỏng quyền tương ứng.</div>}
        </div>
      </section>
      {privacyOpen && (
        <div className="auth-privacy-overlay" role="presentation" onMouseDown={() => setPrivacyOpen(false)}>
          <section className="auth-privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-privacy-title" onMouseDown={(event) => event.stopPropagation()}>
            <h3 id="auth-privacy-title">Chính sách quyền riêng tư</h3>
            <p>Hệ thống sử dụng email để xác thực tài khoản, gửi liên kết xác minh và khôi phục mật khẩu.</p>
            <p>Dữ liệu NPP, thiết bị và sửa chữa chỉ được sử dụng cho hoạt động quản lý kỹ thuật theo quyền tài khoản.</p>
            <p>Camera và vị trí chỉ được truy cập khi bạn chủ động dùng chức năng quét mã hoặc công tác hiện trường.</p>
            <p>Nếu bạn chủ động chọn định vị IP dự phòng, địa chỉ mạng sẽ được gửi đến BigDataCloud hoặc ipapi để ước tính vị trí.</p>
            <p>Camera không ghi hình. Ảnh kỹ thuật được loại bỏ metadata trước khi lưu cùng hồ sơ nghiệp vụ.</p>
            <p>Dữ liệu được lưu theo thời gian hoạt động của tài khoản hoặc hồ sơ nghiệp vụ. Bạn có thể liên hệ quản trị viên để kiểm tra, chỉnh sửa hoặc ngừng tài khoản; lịch sử nghiệp vụ được xử lý theo quy định lưu trữ của NASUN.</p>
            <button type="button" className="btn btn-primary" onClick={() => setPrivacyOpen(false)}>Đã hiểu</button>
          </section>
        </div>
      )}
    </main>
  );
}
