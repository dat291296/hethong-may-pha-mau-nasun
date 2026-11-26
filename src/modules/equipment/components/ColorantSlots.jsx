import React, { useState } from 'react';
import { COLORANTS, SLOT_STATES, displayColorantSlots, colorantDevice, supportsColorantSlots, validColorantSlots } from '../lib/colorantSlots.js';

export default function ColorantSlots({ machine, dispensers, editable, onSave }) {
  const device = colorantDevice(machine, dispensers);
  if (!device) return supportsColorantSlots(machine.dispenserModel)
    ? <p>Vị trí ống màu CCA · Cần đối chiếu số seri máy chiết.</p> : null;
  if (!supportsColorantSlots(device.model)) return null;
  return <SerialLayout key={JSON.stringify([device.id, device.serial])} device={device} editable={editable} onSave={onSave} />;
}

function SerialLayout({ device, editable, onSave }) {
  const [draft, setDraft] = useState(null);
  const [original, setOriginal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const slots = draft || displayColorantSlots(device.colorantSlots);
  const broken = slots.filter(code => code === 'BROKEN').length;
  const unused = slots.filter(code => code === 'UNUSED').length;
  async function save() {
    setBusy(true);
    try {
      await onSave(original, draft);
      setDraft(null);
      setMessage('Đã lưu sơ đồ ống màu.');
    } catch (error) {
      setMessage(error.message || 'Chưa lưu được sơ đồ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return <details className="colorant-panel">
    <summary><strong>Vị trí ống màu CCA</strong><small>16 ống{broken > 0 ? ' · ⚠ ' + broken + ' ống hỏng' : ''}{unused > 0 ? ' · ' + unused + ' không sử dụng' : ''}</small></summary>
    <p>{device.model} · Seri <strong>{device.serial}</strong> · Màu hiển thị tham khảo</p>
    {broken > 0 && <p role="alert" className="colorant-warning">⚠ Có {broken} ống hỏng cần kiểm tra trước khi sử dụng máy.</p>}
    {draft && <p>Chọn mã màu hoặc trạng thái cho từng ống. Bạn có thể lưu sau khi sửa một ống.</p>}
    <div className="colorant-grid">{slots.map((code, index) => {
      const [name, color] = COLORANTS[code] || [SLOT_STATES[code] || 'Chưa ghi nhận', null];
      const label = 'Ống ' + String(index + 1).padStart(2, '0');
      return <div className={'colorant-cell' + (code === 'BROKEN' ? ' is-broken' : code === 'UNUSED' ? ' is-unused' : '')} key={index}>
        <small>{label}</small><span className="colorant-swatch" style={{ backgroundColor: color }} />
        {draft ? <select aria-label={label} value={code} disabled={busy} onChange={event => {
          const next = [...draft];
          const selected = event.target.value;
          next[index] = selected;
          setDraft(next);
          setMessage('');
        }}><option value="">Chưa ghi nhận</option><option value="UNUSED">Không sử dụng</option><option value="BROKEN">⚠ Hỏng</option>{Object.keys(COLORANTS).map(value =>
          <option key={value}>{value}</option>)}</select> : <strong>{code === 'BROKEN' ? '⚠ Hỏng' : SLOT_STATES[code] || code || '—'}</strong>}
        <small>{name}</small>
      </div>;
    })}</div>
    {editable && <div className="workspace-actions">{draft ? <>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || !validColorantSlots(draft)} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu thứ tự'}</button>
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setDraft(null); setMessage(''); }}>Hủy</button>
    </> : <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOriginal(device); setDraft([...slots]); setMessage(''); }}>Nhập / sửa thứ tự</button>}</div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
