import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { UserCheck, ShieldAlert, Trash2, Key, RefreshCw, Award } from 'lucide-react';

const MOCK_PROFILES = [
  { id: 'dev-admin', email: 'dat291219962.hust@gmail.com', full_name: 'Nguyễn Tiến Đạt (Admin)', role: 'admin', created_at: '2026-07-28' },
  { id: 'dev-qc', email: 'qc@dev.local', full_name: 'Trần Minh Hoàng (QC)', role: 'qc', created_at: '2026-07-30' },
  { id: 'dev-viewer', email: 'viewer@dev.local', full_name: 'Đại Lý Sơn Nasun Hải Phòng', role: 'viewer', created_at: '2026-07-31' }
];

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [profiles, setProfiles] = useState(MOCK_PROFILES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');

  const fetchProfiles = async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('*')
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

  useEffect(() => {
    fetchProfiles();
  }, []);

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
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', profileId);

      if (updateErr) throw updateErr;
      
      setSuccess('Đã cập nhật quyền tài khoản thành công!');
      fetchProfiles();
    } catch (err) {
      console.error(err);
      setError('Lỗi cập nhật vai trò: ' + err.message);
    }
  };

  const handleDeleteProfile = async (profileId) => {
    if (profileId === currentUser.id) {
      alert('Bạn không thể tự xóa tài khoản của chính mình!');
      return;
    }

    if (!window.confirm('Bạn có chắc chắn muốn xóa tài khoản này khỏi danh sách quản lý?')) {
      return;
    }

    setSuccess('');
    setError(null);

    if (!isSupabaseConfigured) {
      setProfiles(prev => prev.filter(p => p.id !== profileId));
      setSuccess('Đã xóa tài khoản thành công (Mô phỏng)!');
      return;
    }

    try {
      // Delete from profiles table
      const { error: delErr } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profileId);

      if (delErr) throw delErr;
      
      setSuccess('Đã gỡ tài khoản khỏi danh sách!');
      fetchProfiles();
    } catch (err) {
      console.error(err);
      setError('Lỗi gỡ tài khoản: ' + err.message);
    }
  };

  return (
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
                <th style={{ textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => {
                const isSelf = p.id === currentUser.id;
                return (
                  <tr key={p.id} style={{ background: isSelf ? 'rgba(6, 182, 212, 0.03)' : 'transparent' }}>
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
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => handleDeleteProfile(p.id)}
                        disabled={isSelf}
                        className="btn btn-secondary btn-sm"
                        style={{
                          borderColor: 'transparent',
                          color: isSelf ? 'var(--text-muted)' : '#ef4444',
                          opacity: isSelf ? 0.4 : 1,
                          padding: '6px'
                        }}
                        title="Xóa tài khoản"
                      >
                        <Trash2 size={16} />
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
  );
}
