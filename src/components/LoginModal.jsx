import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { Lock, Mail, ShieldAlert, Cpu, User, ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react';

export default function LoginModal() {
  const { 
    user, 
    isDevMode, 
    switchDevRole, 
    loading,
    emailVerifiedSuccess,
    setEmailVerifiedSuccess,
    authRedirectError,
    setAuthRedirectError
  } = useAuth();
  
  // activeForm: 'login' | 'signup' | 'forgot'
  const [activeForm, setActiveForm] = useState('login');
  
  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  
  // Input states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  // UI states
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isVerificationPending, setIsVerificationPending] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Catch redirect messages on mount/update
  React.useEffect(() => {
    if (emailVerifiedSuccess) {
      setSuccessMessage('Xác thực email thành công! Tài khoản của bạn đã được kích hoạt. Hãy đăng nhập để tiếp tục.');
      setActiveForm('login');
      setIsVerificationPending(false);
      setEmailVerifiedSuccess(false);
    }
  }, [emailVerifiedSuccess, setEmailVerifiedSuccess]);

  React.useEffect(() => {
    if (authRedirectError) {
      setErrorMessage(`Xác thực email thất bại: ${authRedirectError}`);
      setActiveForm('login');
      setIsVerificationPending(false);
      setAuthRedirectError('');
    }
  }, [authRedirectError, setAuthRedirectError]);

  // If already authenticated or app is initializing, don't show the login screen
  if (user || loading) return null;

  // Reset messages when switching forms
  const handleFormSwitch = (formType) => {
    setActiveForm(formType);
    setIsVerificationPending(false);
    setErrorMessage('');
    setSuccessMessage('');
    setEmail('');
    setPassword('');
    setFullName('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    const trimmedEmail = email.toLowerCase().trim();

    if (isDevMode) {
      // Dev mode: Special admin credentials bypass
      if (trimmedEmail === 'dat291219962.hust@gmail.com' && password === 'nasunnatos') {
        switchDevRole('ADMIN');
        setAuthLoading(false);
        return;
      }
      
      // Fallback for general mock login
      if (trimmedEmail.includes('admin')) {
        switchDevRole('ADMIN');
      } else if (trimmedEmail.includes('qc')) {
        switchDevRole('QC');
      } else {
        switchDevRole('VIEWER');
      }
      setAuthLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: password
      });
      if (error) throw error;
    } catch (err) {
      console.error('[Login] Authentication error:', err.message);
      setErrorMessage(err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    if (isDevMode) {
      // Dev mode mock signup
      setTimeout(() => {
        setRegisteredEmail(email.trim());
        setIsVerificationPending(true);
        setAuthLoading(false);
      }, 800);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}?verified=true`,
          data: {
            full_name: fullName.trim()
          }
        }
      });
      if (error) throw error;
      
      setRegisteredEmail(email.trim());
      setIsVerificationPending(true);
    } catch (err) {
      console.error('[Signup] Registration error:', err.message);
      setErrorMessage(err.message || 'Đăng ký thất bại. Email có thể đã tồn tại.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    if (isDevMode) {
      // Dev mode mock forgot password
      setTimeout(() => {
        setSuccessMessage('Mô phỏng: Đã gửi mã khôi phục mật khẩu đến email ' + email);
        setAuthLoading(false);
      }, 1000);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin
      });
      if (error) throw error;
      setSuccessMessage('Đã gửi link khôi phục mật khẩu. Vui lòng kiểm tra hộp thư email.');
    } catch (err) {
      console.error('[Forgot] Password reset error:', err.message);
      setErrorMessage(err.message || 'Không thể gửi yêu cầu đặt lại mật khẩu.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDevQuickLogin = (role) => {
    if (role === 'ADMIN') {
      setEmail('dat291219962.hust@gmail.com');
      setPassword('nasunnatos');
      switchDevRole('ADMIN');
    } else if (role === 'QC') {
      setEmail('qc@dev.local');
      setPassword('123456');
      switchDevRole('QC');
    } else {
      setEmail('viewer@dev.local');
      setPassword('123456');
      switchDevRole('VIEWER');
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(circle at center, #0f172a 0%, #020617 100%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div 
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '36px 28px',
          boxSizing: 'border-box',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(20px)',
          borderRadius: '16px',
          textAlign: 'center'
        }}
      >
        {/* Brand Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <img 
            src="/nasun_logo.png?v=3" 
            alt="Nasun Paint Logo" 
            style={{
              width: '80px',
              height: '80px',
              objectFit: 'contain'
            }}
          />
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#fff', marginBottom: '4px', letterSpacing: '-0.02em' }}>
          NASUN PAINT
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
          {isVerificationPending && 'Xác Thực Tài Khoản Đăng Ký'}
          {!isVerificationPending && activeForm === 'login' && 'Hệ Thống Quản Lý & Giám Sát Máy Pha Màu Tự Động'}
          {!isVerificationPending && activeForm === 'signup' && 'Đăng Ký Tài Khoản Kỹ Thuật Viên Mới'}
          {!isVerificationPending && activeForm === 'forgot' && 'Khôi Phục Mật Khẩu Truy Cập Hệ Thống'}
        </p>

        {/* Success message banner */}
        {successMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            color: 'var(--accent-emerald)',
            fontSize: '0.8rem',
            textAlign: 'left',
            marginBottom: '20px'
          }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error message banner */}
        {errorMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '0.8rem',
            textAlign: 'left',
            marginBottom: '20px'
          }}>
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Info banner for Production mode initial sign up - Hidden as requested */}
        {/*
        {!isDevMode && activeForm === 'login' && (
          <div style={{
            background: 'rgba(6, 182, 212, 0.05)',
            border: '1px solid rgba(6, 182, 212, 0.25)',
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '18px',
            textAlign: 'left',
            fontSize: '0.75rem',
            lineHeight: 1.4,
            color: 'var(--text-main)'
          }}>
            🔑 <strong>Kích hoạt Admin:</strong> Nếu đăng nhập lần đầu tiên với tài khoản <strong style={{ color: 'var(--accent-cyan)' }}>dat291219962.hust@gmail.com</strong>, vui lòng nhấn <strong>Đăng ký ngay</strong> bên dưới trước để khởi tạo tài khoản, hệ thống sẽ tự động cấp quyền Admin Nasun.
          </div>
        )}
        */}

        {isVerificationPending ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              background: 'rgba(56, 189, 248, 0.03)',
              border: '1px dashed rgba(56, 189, 248, 0.2)',
              borderRadius: '12px',
              textAlign: 'center',
              gap: '12px'
            }}>
              <div className="pulse-animation" style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(56, 189, 248, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-blue)',
                boxShadow: '0 0 15px rgba(56, 189, 248, 0.2)',
                animation: 'pulse 2s infinite'
              }}>
                <Mail size={28} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#fff', marginBottom: '6px' }}>
                  Kiểm tra hộp thư Gmail
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Hệ thống đã gửi liên kết xác thực tài khoản kỹ thuật viên đến địa chỉ email:
                </p>
                <div style={{
                  margin: '8px 0',
                  padding: '6px 12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  color: 'var(--accent-blue)',
                  wordBreak: 'break-all'
                }}>
                  {registeredEmail}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <strong style={{ color: '#fff' }}>Hướng dẫn kích hoạt:</strong>
              <ol style={{ paddingLeft: '16px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>Mở Gmail của bạn và tìm email từ <strong>Nasun Paint / Supabase</strong>.</li>
                <li>Nhấn vào nút hoặc liên kết <strong>Confirm your mail</strong> trong thư.</li>
                <li>Sau khi xác nhận thành công, bạn sẽ được tự động chuyển hướng quay lại màn hình đăng nhập này để tiếp tục truy cập hệ thống.</li>
              </ol>
              <div style={{ marginTop: '8px', fontStyle: 'italic', fontSize: '0.725rem' }}>
                * Lưu ý: Hãy kiểm tra hòm thư Rác (Spam) hoặc Quảng cáo nếu không tìm thấy trong Hộp thư đến chính.
              </div>
            </div>

            {/* Dev Mode Simulation Panel */}
            {isDevMode && (
              <div style={{
                marginTop: '10px',
                padding: '14px',
                background: 'rgba(245, 158, 11, 0.05)',
                border: '1px solid rgba(245, 158, 11, 0.15)',
                borderRadius: '8px',
                fontSize: '0.725rem',
                textAlign: 'center'
              }}>
                <div style={{ color: 'var(--accent-amber)', fontWeight: '700', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <span>🛠️ MÔ PHỎNG (DEV MODE)</span>
                </div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.3 }}>
                  Trong môi trường local, bạn có thể click nút dưới để giả lập việc người dùng mở Gmail và nhấn link xác thực.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsVerificationPending(false);
                    setSuccessMessage('Xác thực email thành công! Tài khoản thử nghiệm đã hoạt động. Vui lòng đăng nhập.');
                    handleFormSwitch('login');
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{
                    borderColor: 'rgba(245, 158, 11, 0.4)',
                    color: 'var(--accent-amber)',
                    width: '100%',
                    fontSize: '0.75rem',
                    fontWeight: '700'
                  }}
                >
                  ⚡ Giả lập click Xác nhận Gmail
                </button>
              </div>
            )}

            <button 
              type="button"
              onClick={() => handleFormSwitch('login')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                margin: '10px auto 0 auto'
              }}
            >
              <ArrowLeft size={14} />
              Quay lại Đăng nhập
            </button>
          </div>
        ) : (
          <>
            {/* ── FORM 1: LOGIN ───────────────────────────────────────────────────── */}
            {activeForm === 'login' && (
              <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ textAlign: 'left', marginBottom: 0 }}>
              <label className="form-label">Tài Khoản Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type="email" 
                  required 
                  placeholder="admin@nasun.vn hoặc email của bạn"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input" 
                  style={{ paddingLeft: '40px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div className="form-group" style={{ textAlign: 'left', marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Mật Khẩu</label>
                <button 
                  type="button"
                  onClick={() => handleFormSwitch('forgot')}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.725rem', cursor: 'pointer', fontWeight: '600' }}
                >
                  Quên mật khẩu?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  required 
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input" 
                  style={{ paddingLeft: '40px', paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={authLoading}
              className="btn btn-primary"
              style={{ width: '100%', height: '42px', marginTop: '10px', fontSize: '0.9rem', fontWeight: '700' }}
            >
              {authLoading ? 'Đang đăng nhập...' : '🔒 Đăng Nhập Hệ Thống'}
            </button>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '10px' }}>
              Chưa có tài khoản?{' '}
              <button 
                type="button" 
                onClick={() => handleFormSwitch('signup')}
                style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontWeight: '700', cursor: 'pointer' }}
              >
                Đăng ký ngay
              </button>
            </div>
          </form>
        )}

        {/* ── FORM 2: SIGNUP ──────────────────────────────────────────────────── */}
        {activeForm === 'signup' && (
          <form onSubmit={handleSignupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ textAlign: 'left', marginBottom: 0 }}>
              <label className="form-label">Họ Và Tên</label>
              <div style={{ position: 'relative' }}>
                <User size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type="text" 
                  required 
                  placeholder="Họ tên kỹ thuật viên"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="form-input" 
                  style={{ paddingLeft: '40px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div className="form-group" style={{ textAlign: 'left', marginBottom: 0 }}>
              <label className="form-label">Tài Khoản Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type="email" 
                  required 
                  placeholder="VD: user@hust.edu.vn"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input" 
                  style={{ paddingLeft: '40px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div className="form-group" style={{ textAlign: 'left', marginBottom: 0 }}>
              <label className="form-label">Mật Khẩu</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  required 
                  placeholder="Tối thiểu 6 ký tự"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input" 
                  style={{ paddingLeft: '40px', paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={authLoading}
              className="btn btn-primary"
              style={{ width: '100%', height: '42px', marginTop: '10px', fontSize: '0.9rem', fontWeight: '700' }}
            >
              {authLoading ? 'Đang đăng ký...' : '📝 Đăng Ký Tài Khoản'}
            </button>

            <button 
              type="button"
              onClick={() => handleFormSwitch('login')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                margin: '10px auto 0 auto'
              }}
            >
              <ArrowLeft size={14} />
              Quay lại Đăng nhập
            </button>
          </form>
        )}

        {/* ── FORM 3: FORGOT PASSWORD ─────────────────────────────────────────── */}
        {activeForm === 'forgot' && (
          <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'left', margin: '0 0 10px 0', lineHeight: 1.4 }}>
              Nhập email liên kết với tài khoản của bạn. Chúng tôi sẽ gửi hướng dẫn khôi phục mật khẩu qua hộp thư.
            </p>

            <div className="form-group" style={{ textAlign: 'left', marginBottom: 0 }}>
              <label className="form-label">Tài Khoản Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type="email" 
                  required 
                  placeholder="Nhập email cần khôi phục"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input" 
                  style={{ paddingLeft: '40px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={authLoading}
              className="btn btn-primary"
              style={{ width: '100%', height: '42px', marginTop: '10px', fontSize: '0.9rem', fontWeight: '700' }}
            >
              {authLoading ? 'Đang gửi...' : '✉️ Gửi Yêu Cầu Khôi Phục'}
            </button>

            <button 
              type="button"
              onClick={() => handleFormSwitch('login')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                margin: '10px auto 0 auto'
              }}
            >
              <ArrowLeft size={14} />
              Quay lại Đăng nhập
            </button>
          </form>
        )}
          </>
        )}

        {/* Development Helper Quick Login buttons */}
        {isDevMode && activeForm === 'login' && (
          <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'block', marginBottom: '10px', fontWeight: '600' }}>
              🛠️ TÀI KHOẢN ADMIN MÔ PHỎNG (DEVELOPMENT MODE):
            </span>
            
            {/* Special display of requested credentials */}
            <div style={{
              background: 'rgba(6, 182, 212, 0.05)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              borderRadius: '8px',
              padding: '10px',
              marginBottom: '14px',
              textAlign: 'left',
              fontSize: '0.725rem'
            }}>
              <div><strong>Email:</strong> <span style={{ color: 'var(--accent-cyan)' }}>dat291219962.hust@gmail.com</span></div>
              <div style={{ marginTop: '2px' }}><strong>Mật khẩu:</strong> <span style={{ color: 'var(--accent-cyan)' }}>nasunnatos</span></div>
              <div style={{ marginTop: '4px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>* Ghi chú: Nhập đúng thông tin này để trải nghiệm quyền Admin.</div>
            </div>

            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              HOẶC ĐĂNG NHẬP NHANH:
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <button 
                type="button"
                onClick={() => handleDevQuickLogin('ADMIN')}
                className="btn btn-secondary btn-sm"
                style={{ borderColor: 'rgba(6, 182, 212, 0.4)', color: 'var(--accent-cyan)', fontSize: '0.7rem' }}
              >
                Admin
              </button>
              <button 
                type="button"
                onClick={() => handleDevQuickLogin('QC')}
                className="btn btn-secondary btn-sm"
                style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: 'var(--accent-emerald)', fontSize: '0.7rem' }}
              >
                QC Staff
              </button>
              <button 
                type="button"
                onClick={() => handleDevQuickLogin('VIEWER')}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.7rem' }}
              >
                Viewer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
