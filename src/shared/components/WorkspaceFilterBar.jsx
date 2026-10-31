import { useEffect, useId, useRef, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import SafePortal from './SafePortal.jsx';
import { useModalScrollLock } from '../hooks/useModalScrollLock.js';

export default function WorkspaceFilterBar({ search, onSearch, placeholder, fields = [], quick = [], quickValue, onQuick, count, onReset, actions }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState('');
  const id = useId();
  const trigger = useRef(null);
  const closeButton = useRef(null);
  const active = fields.filter(field => field.value && field.value !== (field.defaultValue ?? 'ALL'));
  useModalScrollLock(open);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const escape = event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  const openFilters = () => { setDraft(Object.fromEntries(fields.map(field => [field.key, field.value]))); setError(''); setOpen(true); };
  const apply = event => {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) { setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.'); return; }
    fields.forEach(field => field.onChange(draft[field.key] ?? field.defaultValue ?? 'ALL'));
    close();
  };
  return <section className="workspace-filter-bar" aria-label="Tìm kiếm và bộ lọc">
    <div className="filter-search-row"><label className="filter-search"><Search size={18}/><input aria-label={placeholder} className="form-input" placeholder={placeholder} value={search} onChange={event => onSearch(event.target.value)}/>{search && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => onSearch('')}><X size={16}/></button>}</label>{actions && <div className="filter-actions">{actions}</div>}</div>
    <div className="filter-options-row"><div className="filter-quick" aria-label="Lọc trạng thái">{quick.map(item => <button type="button" key={item.value} aria-pressed={quickValue === item.value} onClick={() => onQuick(item.value)}>{item.label}{item.count != null && <span>{item.count}</span>}</button>)}</div><button ref={trigger} type="button" className="btn btn-secondary" aria-haspopup="dialog" onClick={openFilters}><SlidersHorizontal size={17}/>Bộ lọc{active.length ? ` · ${active.length}` : ''}</button><span className="filter-result-count" role="status">{count} kết quả</span></div>
    {(search || active.length > 0 || (quickValue && quickValue !== 'ALL')) && <div className="filter-selected">{search && <button onClick={() => onSearch('')}>Tìm: {search}<X size={14}/></button>}{active.map(field => <button key={field.key} onClick={() => field.onChange(field.defaultValue ?? 'ALL')}>{field.label}: {field.options?.find(option => option.value === field.value)?.label || field.value}<X size={14}/></button>)}{quickValue && quickValue !== 'ALL' && <button onClick={() => onQuick('ALL')}>{quick.find(item => item.value === quickValue)?.label}<X size={14}/></button>}<button className="filter-reset" onClick={onReset}>Xóa tất cả</button></div>}
    {count === 0 && <div className="filter-empty"><span>Không có kết quả phù hợp.</span><button className="btn btn-secondary" onClick={onReset}>Xóa bộ lọc</button></div>}
    {open && <SafePortal><div className="filter-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}><section className="filter-sheet" role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={event => { if (event.key !== 'Tab') return; const nodes = [...event.currentTarget.querySelectorAll('button,input,select')].filter(node => !node.disabled); const first = nodes[0], last = nodes[nodes.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }}><header><h3 id={id}>Bộ lọc</h3><button ref={closeButton} autoFocus aria-label="Đóng bộ lọc" onClick={close}><X size={20}/></button></header><form onSubmit={apply}><div className="filter-sheet-fields">{fields.map(field => <label key={field.key}>{field.label}{field.type === 'date' ? <input type="date" className="form-input" onInput={event => setDraft(value => ({ ...value, [field.key]: event.target.value }))} value={draft[field.key] || ''} onChange={event => setDraft(value => ({ ...value, [field.key]: event.target.value }))}/> : <select className="form-select" value={draft[field.key] ?? 'ALL'} onChange={event => setDraft(value => ({ ...value, [field.key]: event.target.value }))}><option value={field.defaultValue ?? 'ALL'}>{field.allLabel || 'Tất cả'}</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</label>)}</div>{error && <p role="alert" className="filter-error">{error}</p>}<footer><button type="button" className="btn btn-secondary" onClick={() => { setDraft(Object.fromEntries(fields.map(field => [field.key, field.defaultValue ?? 'ALL']))); setError(''); }}>Đặt lại</button><button type="submit" className="btn btn-primary">Áp dụng</button></footer></form></section></div></SafePortal>}
  </section>;
}
