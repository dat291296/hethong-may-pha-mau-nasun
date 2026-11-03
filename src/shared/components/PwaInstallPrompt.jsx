import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

const USE_COUNT_KEY = 'nasun:pwa:use-count:v1';
const DISMISS_KEY = 'nasun:pwa:install-dismissed-until:v1';

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [useCount, setUseCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    let count = 0;
    try {
      count = Number(localStorage.getItem(USE_COUNT_KEY) || 0) + 1;
      localStorage.setItem(USE_COUNT_KEY, String(Math.min(count, 1000)));
      setDismissed(Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now());
    } catch { count = 0; }
    setUseCount(count);
    const capture = event => { event.preventDefault(); setInstallEvent(event); };
    const installed = () => { setInstallEvent(null); setDismissed(true); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', installed); };
  }, []);
  if (!installEvent || useCount < 3 || dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000)); } catch { /* Storage can be unavailable in private mode. */ }
  };
  const install = async () => {
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice?.outcome === 'accepted') setInstallEvent(null);
    else dismiss();
  };
  return <aside className="pwa-install-prompt" aria-label="Cài đặt NASUN"><div><Download size={20} /><span><strong>Thêm NASUN vào màn hình chính</strong><small>Mở nhanh khi đi lắp đặt hoặc bảo trì.</small></span></div><button type="button" className="btn btn-primary" onClick={install}>Cài đặt</button><button type="button" className="pwa-prompt-dismiss" aria-label="Đóng gợi ý cài đặt" onClick={dismiss}><X size={18} /></button></aside>;
}
