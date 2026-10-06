import React, { useRef, useState } from 'react';
import SafePortal from './SafePortal';
import { maintenanceNotes, maintenanceSteps } from '../lib/machineWorkspace';
import { compressImage } from '../utils/imageCompressor';
import { validateDocumentFile } from '../lib/technicalResources';

export default function MaintenanceChecklist({ machine, onSave, onClose }) {
  const operationId = useRef(crypto.randomUUID());
  const steps = maintenanceSteps(machine.dispenserModel);
  const [results, setResults] = useState(steps.map(() => ''));
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [parts, setParts] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState({ before: [], after: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function selectPhotos(event, phase) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    setError(''); setBusy(true);
    try {
      if (files.length > 3) throw new Error('Tối đa 3 ảnh cho mỗi giai đoạn.');
      const images = [];
      for (const file of files) { await validateDocumentFile(file); images.push(await compressImage(file)); }
      setPhotos(previous => ({ ...previous, [phase]: images }));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); if (busy) return;
    setError(''); setBusy(true);
    try {
      const next = new Date(`${date}T12:00:00`);
      if (!date || Number.isNaN(next.getTime()) || date > new Date().toLocaleDateString('en-CA')) throw new Error('Ngày bảo trì không hợp lệ hoặc nằm trong tương lai.');
      next.setFullYear(next.getFullYear() + 1);
      const offset = (machine.installationPhotos || []).length;
      const indexes = (start, count) => Array.from({ length: count }, (_, index) => `#${start + index + 1}`).join(', ');
      const summary = `Ảnh trong hồ sơ: trước ${indexes(offset, photos.before.length) || 'chưa có'}; sau ${indexes(offset + photos.before.length, photos.after.length) || 'chưa có'}.`;
      await onSave({ operationId: operationId.current, setCode: machine.setCode, lastMaintenanceDate: date, nextMaintenanceDue: next.toLocaleDateString('en-CA'), notes: maintenanceNotes(machine.dispenserModel, results, parts, notes, summary), photos: [...photos.before, ...photos.after], hasIssues: results.includes('ISSUE') });
      onClose();
    } catch (err) { console.error('[MaintenanceChecklist] Save failed', err.code || err.name); setError(err.message || 'Không lưu được bảo trì.'); } finally { setBusy(false); }
  }
  return <SafePortal><div className="modal-overlay"><div className="modal-content machine-checklist"><div className="modal-header"><h3>Bảo trì · {machine.setCode}</h3><button className="btn btn-secondary" disabled={busy} onClick={onClose}>Đóng</button></div><form onSubmit={save}><div className="modal-body"><p>{machine.nppName} · {machine.dispenserModel} · {machine.dispenserSerial}</p><p className="resource-muted">Đối chiếu hướng dẫn hãng trước khi thao tác. Có lỗi sẽ giữ trạng thái cần bảo trì.</p>{error && <p role="alert" className="resource-error">{error}</p>}<label>Ngày bảo trì<input type="date" className="form-input" required value={date} disabled={busy} onChange={event => setDate(event.target.value)} /></label>{steps.map((step, index) => <label className="checklist-row" key={step}><span>{index + 1}. {step}</span><select aria-label={step} className="form-select" required disabled={busy} value={results[index]} onChange={event => setResults(previous => previous.map((value, position) => position === index ? event.target.value : value))}><option value="">Chưa đánh giá</option><option value="PASS">Đạt</option><option value="ISSUE">Có lỗi</option><option value="NA">Không áp dụng</option></select></label>)}<label>Vật tư sử dụng<input className="form-input" maxLength={500} disabled={busy} value={parts} onChange={event => setParts(event.target.value)} /></label><label>Ghi chú<textarea className="form-textarea" maxLength={1500} disabled={busy} value={notes} onChange={event => setNotes(event.target.value)} /></label>{['before', 'after'].map(phase => <label className="checklist-row" key={phase}><span>Ảnh {phase === 'before' ? 'trước' : 'sau'} bảo trì ({photos[phase].length}/3)</span><input type="file" accept=".jpg,.jpeg,.png,.webp" multiple disabled={busy} onChange={event => selectPhotos(event, phase)} /><div className="checklist-photos">{photos[phase].map((url, index) => <img key={index} src={url} alt={`${phase === 'before' ? 'Trước' : 'Sau'} bảo trì ${index + 1}`} />)}</div></label>)}</div><div className="modal-footer"><button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu checklist bảo trì'}</button></div></form></div></div></SafePortal>;
}
