import React, { useEffect, useState } from 'react';
import { FileText, ExternalLink, Upload, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { DOCUMENT_BUCKET, resourceError, validateDocumentFile, validateDocumentUrl } from '../lib/technicalResources';
import './technicalResources.css';
const fields = 'id,title,category,machine_model,url,storage_path,file_name,file_size,created_at';
export default function TechnicalResources() {
  const { user, role } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!supabase || !user?.id) return;
    setLoading(true);
    supabase.from('technical_documents').select(fields).order('created_at', { ascending: false }).limit(500).then(({ data, error: loadError }) => {
      if (cancelled) return;
      if (loadError) setError(resourceError(loadError)); else setDocuments(data || []);
    }).catch(err => { if (!cancelled) setError(resourceError(err)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id]);
  async function save(event) {
    event.preventDefault();
    if (role !== 'admin' || busy) return;
    setBusy(true); setError('');
    let uploadedPath;
    try {
      if (!supabase) throw new Error('Cần kết nối Supabase để tải file.');
      if (!file) throw new Error('Vui lòng chọn file PDF hoặc ảnh.');
      const { extension, mime } = await validateDocumentFile(file);
      const title = form.title.trim();
      if (!title || title.length > 160) throw new Error('Tên tài liệu phải từ 1 đến 160 ký tự.');
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, { contentType: mime, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPath = path;
      const { data, error: saveError } = await supabase.from('technical_documents').insert({ title, category: form.category, machine_model: form.machine_model.trim(), storage_path: path, file_name: file.name.slice(0,255), file_size: file.size, mime_type: mime, created_by: user.id }).select(fields).single();
      if (saveError) throw saveError;
      uploadedPath = null;
      setDocuments(previous => [data, ...previous]); setForm(null); setFile(null);
    } catch (err) {
      if (uploadedPath) {
        try { const { error: cleanupError } = await supabase.storage.from(DOCUMENT_BUCKET).remove([uploadedPath]); if (cleanupError) console.error('[TechnicalResources] Upload cleanup failed', cleanupError.code); }
        catch { console.error('[TechnicalResources] Upload cleanup unavailable'); }
      }
      setError(resourceError(err));
    } finally { setBusy(false); }
  }
  async function open(document) {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      let url = document.url;
      if (document.storage_path) {
        const { data, error: linkError } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(document.storage_path, 60);
        if (linkError) throw linkError;
        url = data.signedUrl;
      }
      url = validateDocumentUrl(url);
      if (!tab) throw new Error('Cho phép popup để mở tài liệu.');
      tab.location.href = url;
    } catch (err) { tab?.close(); setError(resourceError(err)); }
  }
  async function remove(document) {
    if (role !== 'admin' || busy || !window.confirm(`Xóa "${document.title}" khỏi thư viện?`)) return;
    setBusy(true); setError('');
    try {
      const { error: deleteError, data } = await supabase.from('technical_documents').delete().eq('id', document.id).select('id');
      if (deleteError) throw deleteError;
      if (!data?.length) throw new Error('Không có quyền xóa tài liệu.');
      setDocuments(previous => previous.filter(item => item.id !== document.id));
      if (document.storage_path) {
        const { error: cleanupError } = await supabase.storage.from(DOCUMENT_BUCKET).remove([document.storage_path]);
        if (cleanupError) throw new Error('Đã xóa khỏi thư viện nhưng chưa dọn được file lưu trữ. Liên hệ admin.');
      }
    } catch (err) { setError(resourceError(err)); } finally { setBusy(false); }
  }
  return <section className="technical-resources glass-panel resource-panel" aria-label="Tài liệu và bản vẽ">
    <div className="resource-heading"><h3><FileText size={20} /> Tài liệu & Bản vẽ</h3>{role === 'admin' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => { setFile(null); setForm({ title: '', category: 'Tài liệu', machine_model: '' }); }}><Upload size={16} /> Tải file lên</button>}</div>
    <p className="resource-muted">PDF, PNG, JPG, WEBP, GIF, BMP, TIFF · Tối đa 20 MB/file.</p>
    {error && <p role="alert" className="resource-error">{error}</p>}
    {!supabase && <p className="resource-muted">Cần kết nối Supabase để tải và xem tài liệu thật.</p>}
    {loading && <p role="status">Đang tải tài liệu...</p>}
    <input className="form-input" aria-label="Tìm tài liệu" placeholder="Tìm tên tài liệu, dòng máy..." value={search} onChange={event => setSearch(event.target.value)} />
    {form && <form className="resource-form" onSubmit={save}>
      <label>Tên tài liệu<input className="form-input" required maxLength={160} disabled={busy} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
      <label>Phân loại<select className="form-select" disabled={busy} value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}><option>Tài liệu</option><option>Bản vẽ</option></select></label>
      <label>Dòng máy<input className="form-input" maxLength={120} disabled={busy} value={form.machine_model} onChange={event => setForm({ ...form, machine_model: event.target.value })} /></label>
      <label>File PDF hoặc ảnh<input type="file" required disabled={busy} accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff" onChange={event => setFile(event.target.files?.[0] || null)} /></label>
      <div className="resource-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Đang tải...' : 'Lưu tài liệu'}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setForm(null)}>Hủy</button></div>
    </form>}
    {!loading && !documents.length && <p className="resource-muted">Chưa có tài liệu. Admin có thể tải file PDF hoặc ảnh bản vẽ lên.</p>}
    {documents.filter(item => `${item.title} ${item.machine_model}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map(document => <div className="resource-row" key={document.id}><FileText size={22} /><div className="resource-content"><strong>{document.title}</strong><small>{document.category}{document.machine_model && ` · ${document.machine_model}`}</small>{document.file_name && <small>{document.file_name} · {(document.file_size / 1048576).toFixed(2)} MB</small>}</div><button className="btn btn-secondary btn-sm" onClick={() => open(document)}><ExternalLink size={16} /> Mở</button>{role === 'admin' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => remove(document)} aria-label={`Xóa ${document.title}`}><Trash2 size={16} /></button>}</div>)}
  </section>;
}
