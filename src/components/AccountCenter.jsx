import React, { useEffect, useState } from 'react';
import { Cpu, Building2, CalendarClock, ArrowLeftRight, BookOpen, MapPin, FileText, LogOut, ShieldCheck, LifeBuoy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../security/rbac';
import { supabase } from '../lib/supabase';
import { resourceError, validateContactPhone } from '../lib/technicalResources';
import './technicalResources.css';

export default function AccountCenter({ onNavigate }) {
  const { user, role, can, signOut } = useAuth();
  const [phone, setPhone] = useState(user?.phone || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (supabase && user?.id) supabase.rpc('get_my_contact_phone').then(({ data, error: loadError }) => {
      if (cancelled) return;
      if (loadError) setError(resourceError(loadError));
      else setPhone(data || '');
    }).catch(err => { if (!cancelled) setError(resourceError(err)); });
    return () => { cancelled = true; };
  }, [user?.id]);
  async function savePhone(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (!supabase) throw new Error('Cần kết nối Supabase để cập nhật liên hệ.');
      const { error: saveError } = await supabase.rpc('update_my_contact_phone', { contact_phone: validateContactPhone(phone) });
      if (saveError) throw saveError;
      setMessage('Đã lưu số điện thoại.');
    } catch (err) { setError(resourceError(err)); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try { await signOut(); } catch (err) { setError(resourceError(err)); } finally { setBusy(false); }
  }
  const items = [
    ['npp', 'Nhà phân phối', Building2], ['assets', 'Bộ máy & Kho thiết bị', Cpu],
    ['workflows', 'Cấp phát / Thu hồi', ArrowLeftRight], ['maintenance', 'Lịch bảo trì', CalendarClock],
    ['routeMap', 'Bản đồ tuyến đường', MapPin], ['techHandbook', 'Sổ tay kỹ thuật', BookOpen],
    ['documents', 'Tài liệu & Bản vẽ', FileText], ['support', 'Hỗ trợ kỹ thuật trực tuyến', LifeBuoy],
    ...(can('audit:read') ? [['auditLogs', 'Nhật ký tác nghiệp', FileText]] : []),
    ...(role === 'admin' ? [['users', 'Quản lý tài khoản', ShieldCheck]] : []),
  ];
  return <div className="technical-resources"><h2>Tài khoản & Trung tâm mở rộng</h2><section className="glass-panel resource-panel"><div className="resource-heading"><div className="resource-avatar">{user?.name?.slice(0, 1) || 'N'}</div><div className="resource-content"><h3>{user?.name || 'Tài khoản'}</h3><small>{ROLE_LABELS[role]} · {user?.managedRegion}</small></div></div><p className="resource-muted">Email đăng ký: {user?.email || 'Chưa có email'}</p><form className="resource-form" onSubmit={savePhone}><label>Số điện thoại liên hệ<input className="form-input" type="tel" autoComplete="tel" maxLength={25} value={phone} onChange={event => setPhone(event.target.value)} placeholder="Chưa có số điện thoại" /></label><button className="btn btn-primary" disabled={busy}>Lưu liên hệ</button></form>{message && <p role="status">{message}</p>}{error && <p className="resource-error" role="alert">{error}</p>}</section><section className="glass-panel resource-panel"><h3>Danh mục mở rộng</h3>{items.map(([id, label, Icon]) => <button className="resource-menu" key={id} onClick={() => onNavigate(id)}><Icon size={20} /><span>{label}</span><span aria-hidden="true">›</span></button>)}</section><button className="btn btn-secondary" disabled={busy} onClick={logout}><LogOut size={18} /> Đăng xuất</button></div>;
}
