import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { Lock, Mail, ShieldAlert, Cpu } from 'lucide-react';

export default function LoginModal() {
  const { user, isDevMode, switchDevRole, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // If already authenticated or app is initializing, don't show the login screen
  if (user || loading) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setErrorMessage('');

    if (isDevMode) {
      // Dev mode mockup login based on email prefix
      const lowerEmail = email.toLowerCase().trim();
      if (lowerEmail.includes('admin')) {
        switchDevRole('ADMIN');
      } else if (lowerEmail.includes('qc')) {
        switchDevRole('QC');
      } else {
        switchDevRole('VIEWER');
      }
      setAuthLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
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

  const handleDevQuickLogin = (role) => {
    switchDevRole(role);
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
          padding: '40px 32px',
          boxSizing: 'border-box',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(20px)',
          borderRadius: '16px',
          textAlign: 'center'
        }}
      >
        {/* Brand Logo & Header */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(6, 182, 212, 0.3)'
          }}>
            <Cpu size={32} color="#fff" />
          </div>
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#fff', marginBottom: '6px', letterSpacing: '-0.02em' }}>
          NASUN COLOR
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '32px' }}>
          Hệ Thống Quản Lý & Giám Sát Máy Pha Màu Tự Động
        </p>

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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Email input */}
          <div className="form-group" style={{ textAlign: 'left', marginBottom: 0 }}>
            <label className="form-label">Tài Khoản Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="email" 
                required 
                placeholder="VD: admin@nasun.vn"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input" 
                style={{ paddingLeft: '40px', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Password input */}
          <div className="form-group" style={{ textAlign: 'left', marginBottom: 0 }}>
            <label className="form-label">Mật Khẩu</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="password" 
                required 
                placeholder="Nhập mật khẩu truy cập"
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
            {authLoading ? 'Đang xác thực...' : '🔒 Đăng Nhập Hệ Thống'}
          </button>
        </form>

        {/* Development Helper Quick Login buttons */}
        {isDevMode && (
          <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'block', marginBottom: '12px' }}>
              🛠️ CHẾ ĐỘ MÔ PHỎNG (DEVELOPMENT MODE) - ĐĂNG NHẬP NHANH:
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <button 
                onClick={() => handleDevQuickLogin('ADMIN')}
                className="btn btn-secondary btn-sm"
                style={{ borderColor: 'rgba(6, 182, 212, 0.4)', color: 'var(--accent-cyan)', fontSize: '0.7rem' }}
              >
                Admin
              </button>
              <button 
                onClick={() => handleDevQuickLogin('QC')}
                className="btn btn-secondary btn-sm"
                style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: 'var(--accent-emerald)', fontSize: '0.7rem' }}
              >
                QC Staff
              </button>
              <button 
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
