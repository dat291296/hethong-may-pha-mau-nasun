import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { UserCheck, ShieldAlert, Trash2, Key, RefreshCw, Award, Lock, Unlock, Calendar, ExternalLink } from 'lucide-react';

const keycloakAccountUrl = import.meta.env.VITE_KEYCLOAK_ACCOUNT_URL;

export default function UserManagement({
  lockedMonths = [],
  lockMonth,
  unlockMonth,
  lockLoading = false,
  lockError = null
}) {
  const { user: currentUser } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [securityEvents, setSecurityEvents] = useState([]);
  const [securityLoading, setSecurityLoading] = useState(false);

  // Sub-tab selection state
  const [activeSubTab, setActiveSubTab] = useState('users');

  const [newLockMonth, setNewLockMonth] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [lockSuccess, setLockSuccess] = useState('');

  const handleLockSubmit = async (e) => {
    e.preventDefault();
    if (!newLockMonth) {
      alert('Vui lòng chọn tháng để khóa!');
      return;
    }
    setLockSuccess('');
    try {
      await lockMonth(newLockMonth, lockReason);
      setLockSuccess(`Đã khóa sổ tháng ${newLockMonth} thành công!`);
      setLockReason('');
      setNewLockMonth('');
    } catch (err) {
      alert('Lỗi khóa sổ tháng: ' + err.message);
    }
  };

  const handleUnlockClick = async (monthKey) => {
    if (!window.confirm(`Bạn có chắc chắn muốn mở khóa sổ cho tháng ${monthKey}?`)) {
      return;
    }
    setLockSuccess('');
    try {
      await unlockMonth(monthKey);
      setLockSuccess(`Đã mở khóa sổ tháng ${monthKey} thành công!`);
    } catch (err) {
      alert('Lỗi mở khóa sổ tháng: ' + err.message);
    }
  };

  const fetchProfiles = async () => {
    if (!isSupabaseConfigured) {
      setProfiles(currentUser ? [{
        id: currentUser.id,
        email: currentUser.email,
        full_name: currentUser.name,
        role: currentUser.role,
        managed_region: currentUser.managedRegion,
        created_at: null,
      }] : []);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('id, full_name, role, managed_region, is_active, created_at')
        .order('created_at', { ascending: false });
      
      if (fetchErr) throw fetchErr;
      
      // Since supabase profiles table might not contain emails (email is in auth.users),
      // in production, we can mock or map emails if needed, or just show the ID / Full Name.
      // But we can try to fetch auth user emails via a secure view or just display their Full Name & ID.
      // In this case, we display full_name and use default fallback emails.
      const mappedProfiles = data.map(p => ({
        ...p,
        email: p.email || (p.id === currentUser.id ? currentUser.email : `${p.full_name.toLowerCase().replace(/\s+/g, '')}@nasun.vn`)
      }));
      
      setProfiles(mappedProfiles);
    } catch (err) {
      console.error('[UserManagement] Error loading profiles:', err.message);
      setError('Lỗi tải danh sách tài khoản: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSecurityEvents = async () => {
    if (!isSupabaseConfigured) return;
    setSecurityLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('security_events')
        .select('id, occurred_at, event_type, severity, actor_id, target_user_id, source, details')
        .order('occurred_at', { ascending: false })
        .limit(200);
      if (fetchErr) throw fetchErr;
      setSecurityEvents(data || []);
    } catch (err) {
      console.error('[UserManagement] Error loading security events:', err.message);
      setError('Lỗi tải nhật ký bảo mật: ' + err.message);
    } finally {
      setSecurityLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  if (!currentUser) return null;

  const handleRoleChange = async (profileId, newRole) => {
    // Prevent admin from demoting themselves
    if (profileId === currentUser.id) {
      alert('Bạn không thể tự hạ quyền của chính mình!');
      return;
    }

    setSuccess('');
    setError(null);

    if (!isSupabaseConfigured) {
      // Dev mode update
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole } : p));
      setSuccess('Đã cập nhật vai trò tài khoản thành công (Mô phỏng)!');
      return;
    }

    try {
      const profile = profiles.find(item => item.id === profileId);
      const nextRegion = newRole === 'admin'
        ? 'Toàn Quốc'
        : (profile?.managed_region === 'Toàn Quốc' ? 'Miền Bắc' : profile?.managed_region || 'Miền Bắc');
      const { data: updateResult, error: updateErr } = await supabase.rpc('update_user_access', {
        target_user_id: profileId,
        target_role: newRole,
        target_region: nextRegion,
      });

      if (updateErr) throw updateErr;
      if (updateResult?.error === 'RATE_LIMIT_EXCEEDED') {
        throw new Error(`Thao tác quá nhanh. Vui lòng thử lại sau ${updateResult.retry_after_seconds} giây.`);
      }
      
      setSuccess('Đã cập nhật quyền tài khoản thành công!');
      fetchProfiles();
    } catch (err) {
      console.error(err);
      setError('Lỗi cập nhật vai trò: ' + err.message);
    }
  };

  const handleRegionChange = async (profileId, newRegion) => {
    setSuccess('');
    setError(null);

    if (!isSupabaseConfigured) {
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, managed_region: newRegion } : p));
      setSuccess('Đã cập nhật vùng quản lý thành công (Mô phỏng)!');
      return;
    }

    try {
      const profile = profiles.find(item => item.id === profileId);
      if (!profile) throw new Error('Không tìm thấy tài khoản cần cập nhật.');
      const { data: updateResult, error: updateErr } = await supabase.rpc('update_user_access', {
        target_user_id: profileId,
        target_role: profile.role,
        target_region: newRegion,
      });

      if (updateErr) throw updateErr;
      if (updateResult?.error === 'RATE_LIMIT_EXCEEDED') {
        throw new Error(`Thao tác quá nhanh. Vui lòng thử lại sau ${updateResult.retry_after_seconds} giây.`);
      }
      
      setSuccess('Đã cập nhật vùng quản lý tài khoản thành công!');
      fetchProfiles();
    } catch (err) {
      console.error(err);
      setError('Lỗi cập nhật vùng quản lý: ' + err.message);
    }
  };

  const handleAccountStatusChange = async (profileId, isActive) => {
    if (profileId === currentUser.id) {
      alert('Bạn không thể tự khóa tài khoản của chính mình!');
      return;
    }

    const nextActive = !isActive;
    const confirmation = nextActive
      ? 'Bạn có chắc chắn muốn kích hoạt lại tài khoản này?'
      : 'Bạn có chắc chắn muốn khóa tài khoản này? Dữ liệu liên quan vẫn được giữ nguyên.';
    if (!window.confirm(confirmation)) {
      return;
    }

    setSuccess('');
    setError(null);

    if (!isSupabaseConfigured) {
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, is_active: nextActive } : p));
      setSuccess(nextActive ? 'Đã kích hoạt lại tài khoản (Mô phỏng)!' : 'Đã khóa tài khoản (Mô phỏng)!');
      return;
    }

    try {
      const { data: statusResult, error: delErr } = await supabase.rpc('set_user_account_active', {
        target_user_id: profileId,
        target_active: nextActive,
      });

      if (delErr) throw delErr;
      if (statusResult?.error === 'RATE_LIMIT_EXCEEDED') {
        throw new Error(`Thao tác quá nhanh. Vui lòng thử lại sau ${statusResult.retry_after_seconds} giây.`);
      }
      
      setSuccess(nextActive ? 'Đã kích hoạt lại tài khoản!' : 'Đã khóa tài khoản; toàn bộ dữ liệu được giữ nguyên!');
      fetchProfiles();
    } catch (err) {
      console.error(err);
      setError('Lỗi cập nhật trạng thái tài khoản: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {keycloakAccountUrl && (
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', borderColor: 'rgba(6, 182, 212, 0.3)' }}>
          <div>
            <div style={{ color: 'var(--accent-cyan)', fontWeight: 800, fontSize: '0.9rem' }}>Tài khoản đăng nhập được quản lý bởi Keycloak</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '3px' }}>Đổi mật khẩu, cập nhật hồ sơ hoặc thiết lập xác thực hai lớp trong cổng tài khoản.</div>
          </div>
          <a href={keycloakAccountUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}>
            <Key size={16} /> Quản lý tài khoản <ExternalLink size={14} />
          </a>
        </div>
      )}
      
      {/* Administrative sub-tabs */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveSubTab('users')}
          className={`btn ${activeSubTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '0.85rem' }}
        >
          <UserCheck size={16} />
          Thành Viên & Phân Quyền
        </button>
        <button
          onClick={() => setActiveSubTab('locked_months')}
          className={`btn ${activeSubTab === 'locked_months' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '0.85rem' }}
        >
          <Lock size={16} />
          Khóa Sổ Tháng (Locked Months)
        </button>
        <button
          onClick={() => { setActiveSubTab('security_events'); fetchSecurityEvents(); }}
          className={`btn ${activeSubTab === 'security_events' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '0.85rem' }}
        >
          <ShieldAlert size={16} />
          Nhật Ký Bảo Mật
        </button>
      </div>

      {activeSubTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Overview stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(6, 182, 212, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-cyan)'
              }}>
                <UserCheck size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tổng Số Người Dùng</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', marginTop: '2px' }}>{profiles.length}</div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b'
              }}>
                <Award size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Quản Trị Viên (Admin)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', marginTop: '2px' }}>
                  {profiles.filter(p => p.role === 'admin').length}
                </div>
              </div>
            </div>
          </div>

          {/* Message alerts */}
          {success && (
            <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: 'var(--accent-emerald)', fontSize: '0.825rem' }}>
              ✓ {success}
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '0.825rem' }}>
              ✕ {error}
            </div>
          )}

          {/* Main accounts table */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', margin: 0 }}>Quản Lý Phân Quyền Tài Khoản Thành Viên</h3>
              
              {isSupabaseConfigured && (
                <button 
                  onClick={fetchProfiles} 
                  disabled={loading}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <RefreshCw size={14} className={loading ? 'spin' : ''} />
                  Tải lại
                </button>
              )}
            </div>

            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Họ Tên Thành Viên</th>
                    <th>Tài Khoản Email</th>
                    <th>Mã User ID</th>
                    <th>Ngày Tạo</th>
                    <th>Vai Trò (Role)</th>
                    <th>Vùng Quản Lý</th>
                    <th style={{ textAlign: 'center' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map(p => {
                    const isSelf = p.id === currentUser.id;
                    return (
                      <tr key={p.id} style={{ background: p.is_active === false ? 'rgba(239,68,68,0.06)' : (isSelf ? 'rgba(6, 182, 212, 0.03)' : 'transparent'), opacity: p.is_active === false ? 0.72 : 1 }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: p.role === 'admin' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                              color: p.role === 'admin' ? '#f59e0b' : 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold',
                              fontSize: '0.8rem'
                            }}>
                              {p.full_name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div>
                              <div style={{ fontWeight: '700' }}>
                                {p.full_name} {isSelf && <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>(Bạn)</span>}
                                {p.is_active === false && <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#ef4444' }}>(Đã khóa)</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{p.email}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.id}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {p.created_at ? new Date(p.created_at).toLocaleDateString('vi-VN') : '---'}
                        </td>
                        <td>
                          <select 
                            value={p.role} 
                            disabled={isSelf}
                            onChange={e => handleRoleChange(p.id, e.target.value)}
                            className="form-input"
                            style={{
                              height: '32px',
                              fontSize: '0.8rem',
                              padding: '0 8px',
                              borderColor: p.role === 'admin' ? '#f59e0b' : p.role === 'qc' ? 'var(--accent-emerald)' : 'var(--border-color)',
                              color: p.role === 'admin' ? '#f59e0b' : p.role === 'qc' ? 'var(--accent-emerald)' : 'var(--text-main)',
                              fontWeight: '700'
                            }}
                          >
                            <option value="admin">Quản Trị Viên (Admin)</option>
                            <option value="qc">Kỹ Thuật Viên (QC)</option>
                            <option value="viewer">Đại Lý / NPP (Viewer)</option>
                          </select>
                        </td>
                        <td>
                          {p.role === 'admin' ? (
                            <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'bold' }}>Toàn Quốc</span>
                          ) : p.role === 'qc' ? (
                            <select 
                              value={p.managed_region || 'Miền Bắc'} 
                              onChange={e => handleRegionChange(p.id, e.target.value)}
                              className="form-input"
                              style={{
                                height: '32px',
                                fontSize: '0.8rem',
                                padding: '0 8px',
                                fontWeight: '700',
                                color: 'var(--accent-cyan)',
                                borderColor: 'var(--border-color)'
                              }}
                            >
                              <option value="Miền Bắc">Miền Bắc</option>
                              <option value="Miền Trung">Miền Trung</option>
                              <option value="Miền Nam">Miền Nam</option>
                              <option value="Toàn Quốc">Toàn Quốc</option>
                            </select>
                          ) : (
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Mặc định theo NPP</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleAccountStatusChange(p.id, p.is_active !== false)}
                            disabled={isSelf}
                            className="btn btn-secondary btn-sm"
                            style={{
                              borderColor: 'transparent',
                              color: isSelf ? 'var(--text-muted)' : (p.is_active === false ? '#22c55e' : '#ef4444'),
                              opacity: isSelf ? 0.4 : 1,
                              padding: '6px'
                            }}
                            title={p.is_active === false ? 'Kích hoạt lại tài khoản' : 'Khóa tài khoản'}
                          >
                            {p.is_active === false ? <RefreshCw size={16} /> : <Trash2 size={16} />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'locked_months' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {lockSuccess && (
            <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: 'var(--accent-emerald)', fontSize: '0.825rem' }}>
              ✓ {lockSuccess}
            </div>
          )}

          {lockError && (
            <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '0.825rem' }}>
              ✕ {lockError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Form to Lock Month */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={18} color="var(--accent-cyan)" />
                Khóa Sổ Kế Toán Tháng Mới
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                Khi tháng bị khóa, nhân viên kỹ thuật và đại lý sẽ không thể thêm mới, sửa đổi hoặc xóa bất kỳ phiếu sửa chữa hoặc di chuyển thiết bị nào trong tháng đó (kiểm tra chốt ở cả DB và UI).
              </p>

              <form onSubmit={handleLockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                    Chọn Tháng/Năm để Khóa
                  </label>
                  <input
                    type="month"
                    value={newLockMonth}
                    onChange={e => setNewLockMonth(e.target.value)}
                    className="form-input"
                    required
                    style={{ width: '100%', height: '40px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                    Lý do Khóa Sổ / Ghi chú
                  </label>
                  <textarea
                    value={lockReason}
                    onChange={e => setLockReason(e.target.value)}
                    placeholder="Nhập lý do chốt số liệu hoặc ghi chú..."
                    className="form-input"
                    rows={3}
                    style={{ width: '100%', resize: 'none', padding: '10px' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={lockLoading}
                  className="btn btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '40px', marginTop: '6px' }}
                >
                  <Lock size={16} />
                  Thực Hiện Khóa Sổ
                </button>
              </form>
            </div>

            {/* List of Locked Months */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="var(--accent-cyan)" />
                Lịch Sử Khóa Sổ Tháng
              </h3>

              <div className="data-table-container" style={{ flex: 1, maxHeight: '350px', overflowY: 'auto' }}>
                {lockedMonths.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Hiện chưa có tháng nào bị khóa sổ kế toán.
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tháng Khóa</th>
                        <th>Ghi Chú / Lý Do</th>
                        <th>Người Khóa</th>
                        <th style={{ textAlign: 'center' }}>Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lockedMonths.map(m => {
                        const lockerName = profiles.find(p => p.id === m.locked_by)?.full_name || 'Hệ thống';
                        return (
                          <tr key={m.month_key}>
                            <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>
                              {m.month_key}
                            </td>
                            <td style={{ fontSize: '0.8rem' }}>{m.reason || '—'}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {lockerName}
                              <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>
                                {m.locked_at ? new Date(m.locked_at).toLocaleDateString('vi-VN') : ''}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                onClick={() => handleUnlockClick(m.month_key)}
                                className="btn btn-secondary btn-sm"
                                style={{
                                  borderColor: 'rgba(239, 68, 68, 0.2)',
                                  color: '#ef4444',
                                  background: 'rgba(239, 68, 68, 0.05)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px'
                                }}
                              >
                                <Unlock size={12} />
                                Mở Khóa
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'security_events' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Nhật Ký Sự Kiện Bảo Mật</h3>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '4px' }}>
                Nhật ký bất biến, chỉ Admin được xem. Hiển thị tối đa 200 sự kiện gần nhất.
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={fetchSecurityEvents} disabled={securityLoading}>
              <RefreshCw size={14} className={securityLoading ? 'spin' : ''} /> Tải lại
            </button>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Thời gian</th><th>Mức độ</th><th>Sự kiện</th><th>Nguồn</th><th>Tài khoản đích</th><th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {securityEvents.map((event) => (
                  <tr key={event.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{new Date(event.occurred_at).toLocaleString('vi-VN')}</td>
                    <td><span className={`badge ${event.severity === 'CRITICAL' ? 'badge-danger' : event.severity === 'WARNING' ? 'badge-warning' : 'badge-info'}`}>{event.severity}</span></td>
                    <td style={{ fontWeight: 700 }}>{event.event_type}</td>
                    <td>{event.source === 'database' ? 'Cơ sở dữ liệu' : 'Ứng dụng'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{event.target_user_id || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', maxWidth: '360px', overflowWrap: 'anywhere' }}>{JSON.stringify(event.details || {})}</td>
                  </tr>
                ))}
                {!securityLoading && securityEvents.length === 0 && (
                  <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>Chưa có sự kiện bảo mật.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
