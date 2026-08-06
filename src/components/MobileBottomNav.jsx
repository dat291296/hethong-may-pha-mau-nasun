import React from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  Cpu, 
  Wrench,
  Menu
} from 'lucide-react';

export default function MobileBottomNav({ activeTab, setActiveTab, maintenanceCount, pendingRepairCount, onOpenMobileSidebar }) {
  const mainItems = [
    { id: 'dashboard', label: 'Tổng Quan', icon: LayoutDashboard },
    { id: 'npp', label: 'NPP', icon: Building2 },
    { id: 'assets', label: 'Bộ Máy', icon: Cpu },
    { id: 'repairs', label: 'Sửa Chữa', icon: Wrench, badge: pendingRepairCount },
  ];

  return (
    <nav className="mobile-bottom-nav" style={{ zIndex: 999 }}>
      {mainItems.map(item => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
            style={{
              padding: '6px 0',
              position: 'relative'
            }}
          >
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <Icon size={20} color={isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'} style={{ transition: 'color 0.2s ease' }} />
              {isActive && (
                <span style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: 'var(--accent-cyan)',
                  boxShadow: '0 0 6px var(--accent-cyan)',
                  marginTop: '1px'
                }} />
              )}
              {item.badge > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-6px',
                  background: '#ef4444',
                  color: '#fff',
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
            <span style={{ fontSize: '0.625rem', marginTop: isActive ? '1px' : '5px', transition: 'all 0.2s ease' }}>{item.label}</span>
          </button>
        );
      })}

      {/* Menu button directly opens the mobile navigation sidebar */}
      <button
        className="mobile-nav-item"
        onClick={onOpenMobileSidebar}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <Menu size={20} color="var(--text-muted)" />
        </div>
        <span style={{ fontSize: '0.625rem', marginTop: '1px' }}>Danh Mục</span>
      </button>
    </nav>
  );
}
