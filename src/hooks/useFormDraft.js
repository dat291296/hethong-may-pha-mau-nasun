import { recordOperationalError } from '../lib/operationalDiagnostics.js';
import { useEffect, useRef, useState } from 'react';
import { getCache, setCache } from '../lib/offlineDb';
import { isDraftExpired } from '../lib/teamWorkspace';

export function useFormDraft(key, value, enabled, onRestore) {
  const [existing, setExisting] = useState(null);
  const [status, setStatus] = useState('');
  const ready = useRef(false);
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  const latest = useRef(value);
  latest.current = value;
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;
  const persistRef = useRef(() => {});
  useEffect(() => () => { persistRef.current(); }, []);

  useEffect(() => {
    if (!enabled || !key) { ready.current = false; return; }
    let active = true;
    generation.current += 1;
    ready.current = false;
    setExisting(null);
    setStatus('Đang kiểm tra bản nháp...');
    getCache(`form-draft:${key}`, null).then(draft => {
      if (!active) return;
      if (draft && !isDraftExpired(draft)) { setExisting(draft); setStatus('Có bản nháp chưa gửi'); }
      else { ready.current = true; setStatus('Chưa gửi lên hệ thống'); }
    }).catch(error => {
      if (active) setStatus('Không đọc được bản nháp trên thiết bị');
      recordOperationalError('draft',error);
      console.warn('[FormDraft] Read failed without payload');
    });
    return () => { active = false; };
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled || !key) return;
    const persist = () => {
      if (!ready.current) return;
      const token = generation.current;
      const snapshot = latest.current;
      queue.current = queue.current.catch(() => {}).then(async () => {
        if (token !== generation.current) return;
        if (!await setCache(`form-draft:${key}`, { value: snapshot, savedAt: Date.now() })) throw new Error('DRAFT_WRITE_FAILED');
        if (token === generation.current) setStatus('Đã lưu nháp trên thiết bị · Chưa gửi');
      }).catch(error => { setStatus('Không lưu được nháp; giữ màn hình mở và thử lại'); recordOperationalError('draft',error); console.warn('[FormDraft] Write failed without payload'); });
    };
    persistRef.current = persist;
    const timer = window.setTimeout(persist, 350);
    const onHide = () => { if (document.visibilityState === 'hidden') persist(); };
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', onHide);
    return () => { window.clearTimeout(timer); window.removeEventListener('pagehide', persist); document.removeEventListener('visibilitychange', onHide); };
  }, [key, enabled, value, existing]);

  const resume = () => { if (existing) restoreRef.current(existing.value); setExisting(null); ready.current = true; setStatus('Đã khôi phục bản nháp · Chưa gửi'); };
  const discard = async () => {
    ready.current = false; generation.current += 1;
    await queue.current;
    if (!await setCache(`form-draft:${key}`, null)) throw new Error('DRAFT_CLEAR_FAILED');
    setExisting(null); ready.current = true; setStatus('Chưa gửi lên hệ thống');
  };
  const clear = async () => {
    ready.current = false; generation.current += 1;
    await queue.current;
    if (!await setCache(`form-draft:${key}`, null)) throw new Error('DRAFT_CLEAR_FAILED');
    setExisting(null); setStatus('Đã lưu lên hệ thống');
  };
  const flush = async () => { persistRef.current(); await queue.current; };
  return { existing, status, resume, discard, clear, flush };
}
