import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../shared/context/AuthContext.jsx';
import { supabase, isSupabaseConfigured } from '../../../shared/data-access/supabase.js';

const TABLE_LABELS = {
  profiles: 'Tài khoản', distributors: 'Nhà phân phối', system_sets: 'Bộ máy',
  dispensers: 'Máy chiết', mixers: 'Máy lắc', computers: 'Máy tính',
  printers: 'Máy in', repair_tickets: 'Phiếu sửa chữa',
  maintenance_schedules: 'Lịch bảo trì', maintenance_records: 'Biên bản bảo trì',
  formula_versions: 'Công thức'
};

const FIELD_LABELS = {
  full_name: 'Họ tên', role: 'Vai trò', managed_region: 'Khu vực', is_active: 'Trạng thái',
  technician: 'Kỹ thuật viên', processing_status: 'Trạng thái xử lý', error_description: 'Mô tả lỗi',
  error_category: 'Bộ phận lỗi', action_direction: 'Hướng xử lý', notes: 'Ghi chú',
  npp_name: 'Nhà phân phối', machine_model: 'Model máy', serial_number: 'Số serial',
  materials_used: 'Linh kiện sử dụng', field_visit_status: 'Trạng thái đi tuyến',
  product_category: 'Loại thiết bị', region: 'Khu vực', name: 'Tên', address: 'Địa chỉ',
  phone: 'Điện thoại', assigned_user_id: 'Người được giao', customer_return_status: 'Trạng thái trả khách'
};

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function AdminChangeHistory() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadChanges = useCallback(async () => {
    if (!isAdmin || !isSupabaseConfigured) return;
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('admin_change_audit')
      .select('id,actor_id,record_table,record_id,changes,created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (queryError) {
      setError(queryError.code === '42P01' || queryError.code === 'PGRST205'
        ? 'Chưa cài migration nhật ký chỉnh sửa trên Supabase.'
        : 'Không tải được lịch sử chỉnh sửa. Hãy kiểm tra quyền admin và kết nối.');
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(data || []);
    const actorIds = [...new Set((data || []).map(row => row.actor_id).filter(Boolean))];
    if (actorIds.length) {
      const { data: people } = await supabase.from('profiles').select('id,full_name').in('id', actorIds);
      setProfiles(Object.fromEntries((people || []).map(profile => [profile.id, profile.full_name || profile.id])));
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { void loadChanges(); }, [loadChanges]);

  if (!isAdmin) return null;

  return <section className="glass-panel" style={{ padding: 24 }}>
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
      <div><h2 style={{ margin: 0 }}>Lịch sử chỉnh sửa</h2><p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>Nhật ký thay đổi do kỹ thuật viên và tài khoản khác thực hiện. Chỉ admin được xem.</p></div>
      <button className="btn btn-secondary" type="button" onClick={() => void loadChanges()} disabled={loading}><RefreshCw size={16} /> Tải lại</button>
    </header>
    {error && <div className="alert alert-warning" role="alert"><AlertTriangle size={17} />{error}</div>}
    {!isSupabaseConfigured && <div className="alert alert-warning" role="alert">Lịch sử chỉnh sửa cần kết nối Supabase.</div>}
    {loading && <p role="status">Đang tải lịch sử…</p>}
    {!loading && !error && rows.length === 0 && <p>Chưa có thay đổi nào được ghi nhận kể từ khi bật nhật ký.</p>}
    <div style={{ display: 'grid', gap: 14 }}>
      {rows.map(row => <article key={row.id} style={{ border: '1px solid var(--border-color, rgba(148,163,184,.25))', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <ShieldCheck size={16} color="var(--accent-cyan)" />
          <strong>{profiles[row.actor_id] || `Tài khoản ${row.actor_id?.slice(0, 8) || ''}`}</strong>
          <span>đã sửa {TABLE_LABELS[row.record_table] || row.record_table} · {row.record_id}</span>
          <time style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{new Date(row.created_at).toLocaleString('vi-VN')}</time>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {Object.entries(row.changes || {}).map(([field, change]) => <div key={field} style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, .5fr) minmax(0, 1fr)', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'rgba(6,182,212,.08)', borderLeft: '3px solid var(--accent-cyan)' }}>
            <strong>{FIELD_LABELS[field] || field}</strong>
            <span><del style={{ opacity: .65 }}>{displayValue(change.before)}</del> <span aria-hidden="true">→</span> <mark style={{ background: 'rgba(16,185,129,.18)', color: 'inherit', borderRadius: 4, padding: '2px 5px' }}>{displayValue(change.after)}</mark></span>
          </div>)}
        </div>
      </article>)}
    </div>
  </section>;
}
