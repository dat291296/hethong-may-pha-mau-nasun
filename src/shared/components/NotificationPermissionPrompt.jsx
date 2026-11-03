import React, { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { hasPushNotificationConfig, subscribeToPushNotifications } from '../platform/pushNotification.js';

const PROMPTED_KEY = 'nasun:notifications:prompted:v1';

export default function NotificationPermissionPrompt() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default' || !hasPushNotificationConfig()) return undefined;
    const onSynced = event => {
      if (Number(event.detail?.synced || 0) < 1) return;
      try { if (localStorage.getItem(PROMPTED_KEY)) return; localStorage.setItem(PROMPTED_KEY, '1'); } catch { /* Continue without local preference storage. */ }
      setVisible(true);
    };
    window.addEventListener('nasun-sync-completed', onSynced);
    return () => window.removeEventListener('nasun-sync-completed', onSynced);
  }, []);
  if (!visible) return null;
  const enable = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setVisible(false); return; }
      await subscribeToPushNotifications();
      setMessage('Đã bật thông báo cho thiết bị này.');
      setTimeout(() => setVisible(false), 3500);
    } catch {
      setMessage('Chưa đăng ký được thông báo. Kiểm tra cấu hình máy chủ rồi thử lại trong Tài Khoản.');
    }
  };
  return <aside className="notification-permission-prompt" role="status"><BellRing size={20} /><div><strong>Nhận thông báo công việc</strong><span>{message || 'Bật thông báo khi có phiếu được giao hoặc bảo trì đến hạn.'}</span></div><button type="button" className="btn btn-primary" onClick={enable}>Bật</button><button type="button" aria-label="Đóng lời nhắc" className="pwa-prompt-dismiss" onClick={() => setVisible(false)}><X size={18} /></button></aside>;
}
