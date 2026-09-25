import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { syncOfflineQueue } from '../lib/offlineSync.js';
import { clearOfflineStorage } from '../lib/offlineDb.js';
import { AUTH_REDIRECT_PURPOSES, createPrivateIdentifier, getAuthRedirectUrl } from '../security/authRuntime.js';

const isKeycloakEnabled = import.meta.env.VITE_ENABLE_KEYCLOAK === 'true';
const LOGIN_ATTEMPTS_KEY = 'nasun_login_attempts';
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

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

  useEffect(() => {
    if (emailVerifiedSuccess) {
      setMode('login');
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
      if (err.message?.startsWith('LOCAL_LOGIN_LOCKED:')) {
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
      setMode('login');
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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
      if (resetError) throw resetError;
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
    if (password.length < 12) {
      setError('Mật khẩu mới phải có ít nhất 12 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setPending(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
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
        <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'login' ? 6 : 12} required placeholder={mode === 'login' ? 'Nhập mật khẩu' : 'Tối thiểu 12 ký tự'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        <button type="button" className="auth-icon-button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
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
              <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>{pending ? 'Đang xử lý...' : 'Tạo tài khoản'}</button>
              <p className="auth-switch">Đã có tài khoản? <button type="button" className="auth-text-link" onClick={() => changeMode('login')}>Đăng nhập</button></p>
            </form>
          )}

          {mode === 'reset' && (
            <form className="auth-form" onSubmit={submitReset}>
              <p className="auth-help">Nhập email công việc. Hệ thống sẽ gửi liên kết đặt lại mật khẩu.</p>
              <label className="auth-field"><span>Email công việc</span><div className="auth-input-wrap"><Mail size={18} aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div></label>
              <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>{pending ? 'Đang xử lý...' : 'Gửi liên kết khôi phục'}</button>
              <button type="button" className="auth-back" onClick={() => changeMode('login')}><ArrowLeft size={16} />Quay lại đăng nhập</button>
            </form>
          )}

          {mode === 'new-password' && (
            <form className="auth-form" onSubmit={submitNewPassword}>
              <p className="auth-help">Tạo mật khẩu mới có ít nhất 12 ký tự cho tài khoản của bạn.</p>
              {renderPasswordInput()}
              <label className="auth-field">
                <span>Xác nhận mật khẩu mới</span>
                <div className="auth-input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength="12" required placeholder="Nhập lại mật khẩu mới" autoComplete="new-password" /></div>
              </label>
              <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>{pending ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</button>
            </form>
          )}

          {isDevMode && <div className="auth-dev-note">Chế độ phát triển đang bật. Nhập email chứa <strong>admin</strong> hoặc <strong>qc</strong> để mô phỏng quyền tương ứng.</div>}
        </div>
      </section>
    </main>
  );
}
