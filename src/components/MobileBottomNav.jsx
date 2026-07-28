import React from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  Cpu, 
  Wrench,
  ArrowLeftRight, 
  CalendarClock, 
  RefreshCw
} from 'lucide-react';

export default function MobileBottomNav({ activeTab, setActiveTab, maintenanceCount, pendingRepairCount }) {
  const items = [
    { id: 'dashboard', label: 'Tổng Quan', icon: LayoutDashboard },
    { id: 'npp', label: 'NPP', icon: Building2 },
    { id: 'assets', label: 'Bộ Máy', icon: Cpu },
    { id: 'repairs', label: 'Sửa Chữa', icon: Wrench, badge: pendingRepairCount },
    { id: 'workflows', label: 'Cấp Phát', icon: ArrowLeftRight },
    { id: 'maintenance', label: 'Bảo Trì', icon: CalendarClock, badge: maintenanceCount },
    { id: 'remoteFormula', label: 'Công Thức', icon: RefreshCw },
  ];

  return (
    <nav className="mobile-bottom-nav">
      {items.map(item => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <div style={{ position: 'relative' }}>
              <Icon size={20} color={isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
              {item.badge > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-6px',
                  background: '#f59e0b',
                  color: '#000',
                  fontSize: '0.6rem',
                  fontWeight: 'bold',
                  borderRadius: '50%',
                  width: '14px',
                  height: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {item.badge}
                </span>
              )}
            </div>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
