import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

export default function MfaGate() {
  const { user, mfaSatisfied, refreshMfaStatus, markMfaVerified, signOut } = useAuth();
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');

  const prepareFactor = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      if (await refreshMfaStatus(user)) return;

      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const verifiedFactor = factors?.totp?.find(item => item.status === 'verified');
      if (verifiedFactor) {
        setFactorId(verifiedFactor.id);
        return;
      }

      for (const staleFactor of factors?.totp || []) {
        if (staleFactor.status !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: staleFactor.id });
        }
      }

      const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `NASUN ${user?.email || 'Account'}`,
      });
      if (enrollError) throw enrollError;
      setFactorId(enrollment.id);
      setQrCode(enrollment.totp.qr_code);
      setSecret(enrollment.totp.secret);
    } catch (err) {
      console.error('[MFA] Setup failed:', err.message);
      setError('Không thể thiết lập xác thực hai lớp. Hãy tải lại trang hoặc liên hệ quản trị viên.');
    } finally {
      setPending(false);
    }
  }, [refreshMfaStatus, user]);

  useEffect(() => {
    if (user?.mfaRequired && !mfaSatisfied && navigator.onLine) prepareFactor();
    else setPending(false);
  }, [mfaSatisfied, prepareFactor, user?.mfaRequired]);

  if (!user?.mfaRequired || mfaSatisfied) return null;

  const verifyCode = async event => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Mã xác thực phải gồm đúng 6 chữ số.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
      markMfaVerified();
      window.location.reload();
    } catch (err) {
      console.error('[MFA] Verification failed:', err.message);
      setError('Mã xác thực không đúng hoặc đã hết hạn.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000, padding: 16 }}>
      <section className="glass-panel" role="dialog" aria-modal="true" aria-labelledby="mfa-title" style={{ width: 'min(460px, 100%)', padding: 24, textAlign: 'center' }}>
        <ShieldCheck size={44} color="var(--accent-cyan)" style={{ margin: '0 auto 12px' }} />
        <h2 id="mfa-title" style={{ margin: 0 }}>Xác thực hai lớp bắt buộc</h2>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Tài khoản Admin và Kỹ thuật viên phải xác thực bằng ứng dụng Authenticator trước khi truy cập dữ liệu.
        </p>

        {!navigator.onLine && (
          <div className="alert alert-warning">Hãy kết nối Internet để xác thực lại phiên đặc quyền.</div>
        )}

        {pending && <LoaderCircle className="spin" size={28} style={{ margin: 16 }} />}

        {!pending && qrCode && (
          <div>
            <img src={qrCode} alt="Mã QR thiết lập ứng dụng Authenticator" style={{ width: 210, maxWidth: '100%', background: '#fff', padding: 10, borderRadius: 12 }} />
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Quét QR bằng Google Authenticator, Microsoft Authenticator hoặc ứng dụng TOTP tương thích.</p>
            <details style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
              <summary>Không quét được QR</summary>
              <code>{secret}</code>
            </details>
          </div>
        )}

        {!pending && navigator.onLine && factorId && (
          <form onSubmit={verifyCode} style={{ display: 'grid', gap: 12, marginTop: 18 }}>
            <label className="auth-field" style={{ textAlign: 'left' }}>
              <span>Mã xác thực 6 chữ số</span>
              <div className="auth-input-wrap">
                <KeyRound size={18} />
                <input
                  value={code}
                  onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  required
                  autoFocus
                />
              </div>
            </label>
            <button type="submit" className="btn btn-primary" disabled={pending}>Xác minh và tiếp tục</button>
          </form>
        )}

        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

        <button type="button" className="btn btn-secondary" onClick={signOut} style={{ marginTop: 16 }}>
          <LogOut size={16} /> Đăng xuất
        </button>
      </section>
    </div>
  );
}
