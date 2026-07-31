import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { Lock, Mail, ShieldAlert, Cpu, User, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function LoginModal() {
  const { user, isDevMode, switchDevRole, loading } = useAuth();
  
  // activeForm: 'login' | 'signup' | 'forgot'
  const [activeForm, setActiveForm] = useState('login');
  
  // Input states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  // UI states
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // If already authenticated or app is initializing, don't show the login screen
  if (user || loading) return null;

  // Reset messages when switching forms
  const handleFormSwitch = (formType) => {
    setActiveForm(formType);
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
        setSuccessMessage('Đăng ký tài khoản thử nghiệm thành công! Bạn có thể sử dụng email này để đăng nhập.');
        setAuthLoading(false);
      }, 1000);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim()
          }
        }
      });
      if (error) throw error;
      
      setSuccessMessage('Đăng ký thành công! Hãy kiểm tra hộp thư email để xác minh tài khoản trước khi đăng nhập.');
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
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(6, 182, 212, 0.3)'
          }}>
            <Cpu size={30} color="#fff" />
          </div>
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#fff', marginBottom: '4px', letterSpacing: '-0.02em' }}>
          NASUN COLOR
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
          {activeForm === 'login' && 'Hệ Thống Quản Lý & Giám Sát Máy Pha Màu Tự Động'}
          {activeForm === 'signup' && 'Đăng Ký Tài Khoản Kỹ Thuật Viên Mới'}
          {activeForm === 'forgot' && 'Khôi Phục Mật Khẩu Truy Cập Hệ Thống'}
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
                  type="password" 
                  required 
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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
                  type="password" 
                  required 
                  placeholder="Tối thiểu 6 ký tự"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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
