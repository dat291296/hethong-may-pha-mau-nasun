import React from 'react';
import { Cpu, Wrench, Building2, ScanLine, LayoutDashboard, Menu } from 'lucide-react';
import { triggerHaptic } from '../../shared/platform/haptics.js';
import { useAuth } from '../../shared/context/AuthContext.jsx';
import { hasPermission } from '../../shared/security/rbac.js';

export default function MobileBottomNav({ activeTab, setActiveTab, maintenanceCount = 0, pendingRepairCount = 0, onOpenQrScan, onOpenMobileSidebar, isMobileSidebarOpen = false }) {
  const { role } = useAuth();
  const canScan = hasPermission(role, 'qr:scan');
  const isTechnician = role === 'technician';
  const items = [
    { id: isTechnician ? 'technicianWork' : 'dashboard', label: isTechnician ? 'Việc hôm nay' : 'Tổng quan', icon: isTechnician ? Wrench : LayoutDashboard },
    { id: 'npp', label: 'NPP', icon: Building2 },
    canScan ? { id: 'qr', label: 'Quét QR', icon: ScanLine, action: onOpenQrScan } : { id: 'repairs', label: 'Sửa chữa', icon: Wrench, badge: pendingRepairCount },
    { id: 'assets', label: 'Thiết bị', icon: Cpu },
    { id: 'menu', label: 'Menu', icon: Menu, action: onOpenMobileSidebar, badge: maintenanceCount + (canScan ? pendingRepairCount : 0) },
  ];
  const secondaryActive = !items.some(item => item.id === activeTab);
  return (
    <nav className="mobile-bottom-nav mobile-primary-nav no-print" aria-label="Điều hướng nhanh">
      {items.map(item => {
        const Icon = item.icon;
        const active = item.id === activeTab || item.id === 'menu' && secondaryActive;
        return <button key={item.id} type="button"
          className={`mobile-primary-item${active ? ' is-active' : ''}${item.id === 'qr' ? ' is-scan' : ''}`}
          aria-current={item.id === activeTab ? 'page' : undefined}
          aria-label={item.id === 'qr' ? 'Quét QR tra cứu NPP' : item.label}
          aria-expanded={item.id === 'menu' ? isMobileSidebarOpen : undefined}
          aria-controls={item.id === 'menu' ? 'nasun-sidebar' : undefined}
          onClick={() => { triggerHaptic('light'); if (item.action) item.action(); else setActiveTab(item.id); }}>
          <span className="mobile-primary-icon"><Icon size={21} aria-hidden="true" />
            {item.badge > 0 && <span className="mobile-primary-badge" aria-label={`${item.badge} công việc cần xem`}>{item.badge > 99 ? '99+' : item.badge}</span>}
          </span>
          <span>{item.label}</span>
        </button>;
      })}
    </nav>
  );
}
