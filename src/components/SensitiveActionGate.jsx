import React, { useEffect, useRef, useState } from 'react';
import { supabase, isDevelopmentFallback } from '../lib/supabase.js';
import { authorizeSensitiveAction, reauthenticateSensitiveAction } from '../security/sensitiveAction.js';

export function useSensitiveActionGate() {
  const pending = useRef(null);
  const dialogRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requireAuthentication = async () => {
    if (!isDevelopmentFallback) {
      try { await authorizeSensitiveAction(supabase); return; }
      catch (failure) { if (failure.code !== 'REAUTHENTICATION_REQUIRED') throw failure; }
    }
    if (pending.current) throw new Error('Đang chờ xác thực thao tác khác.');
    setError(''); setPassword(''); setOpen(true);
    return new Promise((resolve, reject) => { pending.current = { resolve, reject }; });
  };
  const cancel = () => {
    pending.current?.reject(new Error('Đã hủy xác thực.'));
    pending.current = null; setPassword(''); setOpen(false);
  };
  useEffect(() => () => {
    pending.current?.reject(new Error('Màn hình xác thực đã đóng.'));
    pending.current = null;
  }, []);
  const submit = async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      if (isDevelopmentFallback) {
        if (password !== 'DEMO-NASUN') throw new Error('Dùng mã DEMO-NASUN để thử giao diện. Không nhập mật khẩu thật.');
      } else {
        await reauthenticateSensitiveAction(supabase, password);
      }
      pending.current?.resolve(); pending.current = null; setOpen(false);
    } catch (failure) { setError(failure.message); }
    finally { setPassword(''); setBusy(false); }
  };
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const handleKey = event => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        pending.current?.reject(new Error('Đã hủy xác thực.'));
        pending.current = null; setPassword(''); setOpen(false);
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialogRef.current.querySelectorAll('input:not(:disabled), button:not(:disabled)')];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); if (!busy) previousFocus?.focus(); };
  }, [open, busy]);
  const dialog = open ? <div className="modal-overlay" style={{ zIndex: 3000 }}><section ref={dialogRef} className="modal-content" role="dialog" aria-modal="true" aria-labelledby="sensitive-action-title" style={{ maxWidth: 420, padding: 24, overflowY: 'auto' }}>
    <h2 id="sensitive-action-title">Xác thực thao tác quan trọng</h2>
    <p>{isDevelopmentFallback ? 'Bản demo: nhập DEMO-NASUN để thử thao tác. Không nhập mật khẩu thật; không kết nối Supabase.' : 'Nhập mật khẩu tài khoản đang đăng nhập. Máy chủ sẽ kiểm tra lại trước khi thực hiện.'}</p>
    <form onSubmit={submit}><label htmlFor="sensitive-password">Mật khẩu</label>
      <input id="sensitive-password" className="form-input" type="password" autoComplete="current-password" autoFocus required value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
      {error && <p role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}><button type="button" className="btn btn-secondary" disabled={busy} onClick={cancel}>Hủy</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Đang xác thực…' : 'Xác thực'}</button></div>
    </form></section></div> : null;
  return { requireAuthentication, dialog };
}
