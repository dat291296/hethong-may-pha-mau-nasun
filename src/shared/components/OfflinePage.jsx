import React from 'react';
import { CloudOff, Cpu, Wrench, Building2, CalendarClock } from 'lucide-react';

export default function OfflinePage({ systemSets = [], repairTickets = [], npps = [], onNavigate }) {
  const shortcuts = [
    { tab: 'assets', label: 'Thiết bị đã lưu', count: systemSets.length, icon: Cpu },
    { tab: 'repairs', label: 'Phiếu sửa chữa đã lưu', count: repairTickets.length, icon: Wrench },
    { tab: 'npp', label: 'NPP đã lưu', count: npps.length, icon: Building2 },
    { tab: 'maintenance', label: 'Lịch bảo trì', count: systemSets.length, icon: CalendarClock },
  ];
  return <section className="offline-page"><div className="offline-page-banner"><CloudOff size={22} /><div><strong>Bạn đang offline</strong><span>Dữ liệu bên dưới lấy từ cache trên thiết bị và có thể chưa cập nhật.</span></div></div><h1>Hồ sơ hiện có trên thiết bị</h1><div className="offline-page-grid">{shortcuts.map(item => { const Icon = item.icon; return <button type="button" key={item.tab} className="offline-page-card" onClick={() => onNavigate?.(item.tab)}><Icon size={21} /><span>{item.label}</span><strong>{item.count}</strong></button>; })}</div><p>Thay đổi đang chờ đồng bộ được giữ mã hóa trên thiết bị. Kết nối mạng để tải dữ liệu mới và gửi các thao tác đủ điều kiện.</p></section>;
}
