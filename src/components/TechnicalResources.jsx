import React, { useEffect, useState } from 'react';
import { FileText, ExternalLink, Plus, Trash2, Phone, Mail, RefreshCw, LifeBuoy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { contactLinks, resourceError, validateDocumentUrl } from '../lib/technicalResources';
import { ROLE_LABELS } from '../security/rbac';
import './technicalResources.css';

export default function TechnicalResources({ section = 'all' }) {
  const { user, role } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const showDocuments = section !== 'support';
  const showSupport = section !== 'documents';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isSupabaseConfigured || !user?.id) return;
      setLoading(true); setError('');
      try {
        const requests = [];
        if (showDocuments) requests.push(supabase.from('technical_documents').select('id,title,category,machine_model,url,created_at').order('created_at', { ascending: false }).limit(500));
        if (showSupport) requests.push(supabase.rpc('get_technical_support_contacts'));
        const results = await Promise.allSettled(requests);
        let index = 0;
        if (cancelled) return;
        for (const target of [showDocuments ? setDocuments : null, showSupport ? setContacts : null].filter(Boolean)) {
          const result = results[index++];
          if (result.status === 'rejected') throw result.reason;
          if (result.value.error) throw result.value.error;
          target(result.value.data || []);
        }
      } catch (err) { if (!cancelled) setError(resourceError(err)); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id, section, showDocuments, showSupport]);

  async function save(event) {
    event.preventDefault();
    if (role !== 'admin' || busy) return;
    setBusy(true); setError('');
    try {
      if (!supabase) throw new Error('Cần kết nối Supabase để lưu tài liệu.');
      const record = { title: form.title.trim(), category: form.category, machine_model: form.machine_model.trim(), url: validateDocumentUrl(form.url), created_by: user.id };
      if (!record.title || record.title.length > 160) throw new Error('Tên tài liệu phải từ 1 đến 160 ký tự.');
      const { data, error: saveError } = await supabase.from('technical_documents').insert(record).select('id,title,category,machine_model,url,created_at').single();
      if (saveError) throw saveError;
      setDocuments(previous => [data, ...previous]); setForm(null);
    } catch (err) { setError(resourceError(err)); }
    finally { setBusy(false); }
  }

  async function remove(document) {
    if (role !== 'admin' || busy || !window.confirm(`Xóa đường dẫn "${document.title}" khỏi thư viện? File gốc vẫn được giữ nguyên.`)) return;
    setBusy(true); setError('');
    try {
      const { error: deleteError, data } = await supabase.from('technical_documents').delete().eq('id', document.id).select('id');
      if (deleteError) throw deleteError;
      if (!data?.length) throw new Error('Không có quyền xóa tài liệu này.');
      setDocuments(previous => previous.filter(item => item.id !== document.id));
    } catch (err) { setError(resourceError(err)); }
    finally { setBusy(false); }
  }

  return <div className="technical-resources">
    {error && <p role="alert" className="resource-error">{error}</p>}
    {loading && <p role="status"><RefreshCw size={16} /> Đang tải dữ liệu...</p>}
    {!isSupabaseConfigured && <p className="resource-muted">Cần kết nối Supabase để sử dụng tài liệu và danh bạ hỗ trợ thật.</p>}
    {showDocuments && <section className="glass-panel resource-panel" aria-label="Tài liệu và bản vẽ">
      <div className="resource-heading"><h3><FileText size={20} /> Tài liệu & Bản vẽ</h3>{role === 'admin' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setForm({ title: '', category: 'Tài liệu', machine_model: '', url: '' })}><Plus size={16} /> Thêm đường dẫn</button>}</div>
      <input className="form-input" aria-label="Tìm tài liệu" placeholder="Tìm tên tài liệu, dòng máy..." value={search} onChange={event => setSearch(event.target.value)} />
      {form && <form className="resource-form" onSubmit={save}>
        <label>Tên tài liệu<input className="form-input" required maxLength={160} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label>Phân loại<select className="form-select" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}><option>Tài liệu</option><option>Bản vẽ</option></select></label>
        <label>Dòng máy<input className="form-input" maxLength={120} value={form.machine_model} onChange={event => setForm({ ...form, machine_model: event.target.value })} /></label>
        <label>Đường dẫn HTTPS<input className="form-input" type="url" required maxLength={2048} placeholder="https://..." value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} /></label>
        <div className="resource-actions"><button className="btn btn-primary" disabled={busy}>Lưu đường dẫn</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setForm(null)}>Hủy</button></div>
      </form>}
      {!loading && !documents.length && <p className="resource-muted">Chưa có tài liệu. Admin có thể thêm đường dẫn PDF hoặc bản vẽ của hãng.</p>}
      {documents.filter(item => `${item.title} ${item.machine_model}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map(document => {
        let url; try { url = validateDocumentUrl(document.url); } catch { url = null; }
        return <div className="resource-row" key={document.id}><FileText size={22} /><div className="resource-content"><strong>{document.title}</strong><small>{document.category}{document.machine_model && ` · ${document.machine_model}`}</small></div>{url && <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Mở ${document.title}`}><ExternalLink size={16} /> Mở</a>}{role === 'admin' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => remove(document)} aria-label={`Xóa ${document.title}`}><Trash2 size={16} /></button>}</div>;
      })}
    </section>}
    {showSupport && <section className="glass-panel resource-panel" aria-label="Hỗ trợ kỹ thuật trực tuyến"><div className="resource-heading"><h3><LifeBuoy size={20} /> Hỗ trợ kỹ thuật trực tuyến</h3></div><p className="resource-muted">Kỹ thuật viên cùng khu vực; admin và quản lý hỗ trợ toàn quốc. Liên hệ qua điện thoại hoặc email đã đăng ký.</p>
      {!loading && !contacts.length && <p className="resource-muted">Chưa có tài khoản hỗ trợ đang hoạt động trong khu vực của bạn.</p>}
      {contacts.map(contact => { const links = contactLinks(contact); return <div className="resource-row" key={contact.id}><div className="resource-avatar">{contact.full_name?.slice(0, 1) || 'N'}</div><div className="resource-content"><strong>{contact.full_name}</strong><small>{ROLE_LABELS[contact.role]} · {contact.managed_region}</small>{contact.email && <small>{contact.email}</small>}{contact.phone && <small>{contact.phone}</small>}</div><div className="resource-actions">{links.phone && <a className="btn btn-secondary btn-sm" href={links.phone} aria-label={`Gọi ${contact.full_name}`}><Phone size={16} /> Gọi</a>}{links.email && <a className="btn btn-primary btn-sm" href={links.email} aria-label={`Email ${contact.full_name}`}><Mail size={16} /> Email</a>}</div></div>; })}
    </section>}
  </div>;
}
