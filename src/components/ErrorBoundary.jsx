import React from 'react';
import { AlertTriangle, RefreshCw, HardDrive } from 'lucide-react';

/**
 * ErrorBoundary - Catches unhandled React crashes & Service Worker stale cache errors.
 * Prevents blank dark screen and provides one-click recovery.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught runtime error:', error, errorInfo);
  }

  handleClearCacheAndReload = async () => {
    try {
      // 1. Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      // 2. Clear caches API
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      }
    } catch (e) {
      console.warn('[ErrorBoundary] Failed to clear SW cache:', e);
    } finally {
      // 3. Force reload ignoring cache
      window.location.reload(true);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#0f172a',
          color: '#f8fafc',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '50%',
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <AlertTriangle size={48} style={{ color: '#ef4444' }} />
          </div>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem 0' }}>
            Hệ Thống Đang Cập Nhật Hoặc Gặp Lỗi Tải Trang
          </h2>

          <p style={{ maxWidth: '480px', color: '#94a3b8', fontSize: '0.925rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Phiên bản ứng dụng mới vừa được triển khai hoặc trình duyệt đang giữ bộ nhớ tạm (Cache) cũ. Bạn hãy nhấn nút bên dưới để làm mới bộ nhớ tạm.
          </p>

          {this.state.error?.message && (
            <pre style={{
              background: '#1e293b',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              color: '#f87171',
              fontSize: '0.8rem',
              maxWidth: '540px',
              overflowX: 'auto',
              marginBottom: '1.5rem',
              textAlign: 'left'
            }}>
              {this.state.error.message}
            </pre>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleClearCacheAndReload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
              }}
            >
              <RefreshCw size={18} />
              Xóa Cache & Tải Lại Trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
