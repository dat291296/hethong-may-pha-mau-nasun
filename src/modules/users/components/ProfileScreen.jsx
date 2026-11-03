import React from 'react';
import { useAuth } from '../../../shared/context/AuthContext.jsx';
import { BellRing, FileClock, LogOut, ShieldCheck } from 'lucide-react';

export default function ProfileScreen({ onOpenSyncLog, onOpenNotificationSettings, onSignOut }) {
  const { user, signOut } = useAuth();
  const name = user?.name || user?.full_name || 'Người dùng NASUN';
  return (
    <section className="profile-screen">
      <header><p className="eyebrow">TÀI KHOẢN NASUN</p><h1>{name}</h1><p>{user?.email || user?.id}</p></header>
      <div className="profile-info-grid">
        <article><ShieldCheck size={20} /><span>Vai trò</span><strong>{user?.role || 'viewer'}</strong></article>
        <article><span>Khu vực</span><strong>{user?.managedRegion || 'Chưa phân vùng'}</strong></article>
      </div>
      <div className="profile-actions">
        <button type="button" className="btn btn-secondary" onClick={onOpenSyncLog}><FileClock size={18} />Lịch sử đồng bộ</button>
        <button type="button" className="btn btn-secondary" onClick={onOpenNotificationSettings}><BellRing size={18} />Thông báo</button>
        <button type="button" className="btn btn-danger" onClick={() => void (onSignOut ? onSignOut() : signOut())}><LogOut size={18} />Đăng xuất</button>
      </div>
    </section>
  );
}
