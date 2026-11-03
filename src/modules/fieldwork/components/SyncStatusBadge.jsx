import React from 'react';

export default function SyncStatusBadge({ online, pending = 0, error = false, busy = false }) {
  const state = error ? 'error' : busy ? 'syncing' : pending > 0 ? 'pending' : online ? 'synced' : 'offline';
  const label = error ? '⚠ Lỗi sync' : busy ? '⏳ Đang đồng bộ' : pending > 0 ? `⏳ ${pending} thay đổi chờ sync` : online ? '● Đã đồng bộ' : '● Offline · đang dùng cache';
  return <span className={`sync-status-badge ${state}`} role="status" aria-live="polite">{label}</span>;
}
