import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { syncOfflineQueue } from '../lib/offlineSync.js';

const isKeycloakEnabled = import.meta.env.VITE_ENABLE_KEYCLOAK === 'true';

export default function LoginModal() {
  const { user, isDevMode, switchDevRole, loading, emailVerifiedSuccess, setEmailVerifiedSuccess, authRedirectError, setAuthRedirectError } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    if (authRedirectError) {
      setError(authRedirectError);
      setAuthRedirectError('');
    }
  }, [authRedirectError, setAuthRedirectError]);

  if (user || loading) return null;

  const resetFeedback = () => {
    setError('');
    setNotice('');
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setPassword('');
    resetFeedback();
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    resetFeedback();
    setPending(true);
    try {
      if (isDevMode) {
        switchDevRole(email.toLowerCase().includes('qc') ? 'QC' : email.toLowerCase().includes('admin') ? 'ADMIN' : 'VIEWER');
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError) throw signInError;
      await syncOfflineQueue();
    } catch (err) {
      console.error('[Login] Password sign-in failed:', err.message);
      setError('Không thể đăng nhập. Kiểm tra lại email và mật khẩu.');
    } finally {
      setPending(false);
    }
  };

  const signInWithKeycloak = async () => {
    resetFeedback();
    setPending(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'keycloak',
        options: { scopes: 'openid', redirectTo: window.location.origin },
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
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo: `${window.location.origin}?verified=true`, data: { full_name: fullName.trim() } },
      });
      if (signUpError) throw signUpError;
      setMode('login');
      setNotice('Đã gửi email xác thực. Kiểm tra hộp thư để kích hoạt tài khoản.');
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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin });
      if (resetError) throw resetError;
      setNotice('Đã gửi liên kết đặt lại mật khẩu. Kiểm tra hộp thư của bạn.');
    } catch (err) {
      console.error('[Login] Password reset failed:', err.message);
      setError('Không thể gửi yêu cầu đặt lại mật khẩu.');
    } finally {
      setPending(false);
    }
  };

  const renderPasswordInput = () => (
    <label className="auth-field">
      <span>Mật khẩu</span>
      <div className="auth-input-wrap">
        <LockKeyhole size={18} aria-hidden="true" />
        <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength="6" required placeholder="Tối thiểu 6 ký tự" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
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
            <div className="auth-heading-icon"><ShieldCheck size={23} /></div>
            <div>
              <p className="auth-eyebrow">KHU VỰC BẢO MẬT</p>
              <h2>{mode === 'login' ? 'Đăng nhập hệ thống' : mode === 'signup' ? 'Tạo tài khoản mới' : 'Khôi phục mật khẩu'}</h2>
            </div>
          </div>

          {notice && <div className="auth-alert auth-alert-success"><CheckCircle2 size={18} />{notice}</div>}
          {error && <div className="auth-alert auth-alert-error"><ShieldCheck size={18} />{error}</div>}

          {mode === 'login' && (
            <form className="auth-form" onSubmit={submitLogin}>
              <label className="auth-field">
                <span>Email công việc</span>
                <div className="auth-input-wrap"><Mail size={18} aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="ten@nasun.vn" autoComplete="email" /></div>
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
              <label className="auth-field"><span>Email công việc</span><div className="auth-input-wrap"><Mail size={18} aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="ten@nasun.vn" autoComplete="email" /></div></label>
              {renderPasswordInput()}
              <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>{pending ? 'Đang xử lý...' : 'Tạo tài khoản'}</button>
              <p className="auth-switch">Đã có tài khoản? <button type="button" className="auth-text-link" onClick={() => changeMode('login')}>Đăng nhập</button></p>
            </form>
          )}

          {mode === 'reset' && (
            <form className="auth-form" onSubmit={submitReset}>
              <p className="auth-help">Nhập email công việc. Hệ thống sẽ gửi liên kết đặt lại mật khẩu.</p>
              <label className="auth-field"><span>Email công việc</span><div className="auth-input-wrap"><Mail size={18} aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="ten@nasun.vn" autoComplete="email" /></div></label>
              <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>{pending ? 'Đang xử lý...' : 'Gửi liên kết khôi phục'}</button>
              <button type="button" className="auth-back" onClick={() => changeMode('login')}><ArrowLeft size={16} />Quay lại đăng nhập</button>
            </form>
          )}

          {isDevMode && <div className="auth-dev-note">Chế độ phát triển đang bật. Nhập email chứa <strong>admin</strong> hoặc <strong>qc</strong> để mô phỏng quyền tương ứng.</div>}
        </div>
      </section>
    </main>
  );
}
