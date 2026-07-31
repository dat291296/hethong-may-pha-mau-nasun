import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  Cpu, 
  Wrench,
  ArrowLeftRight, 
  CalendarClock, 
  RefreshCw,
  Search,
  FileText,
  Menu,
  X,
  ChevronRight
} from 'lucide-react';

export default function MobileBottomNav({ activeTab, setActiveTab, maintenanceCount, pendingRepairCount }) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Core navigation items on the main bottom bar
  const mainItems = [
    { id: 'dashboard', label: 'Tổng Quan', icon: LayoutDashboard },
    { id: 'npp', label: 'NPP', icon: Building2 },
    { id: 'assets', label: 'Bộ Máy', icon: Cpu },
    { id: 'repairs', label: 'Sửa Chữa', icon: Wrench, badge: pendingRepairCount },
  ];

  // Secondary items placed inside the "More" bottom sheet
  const moreItems = [
    { id: 'workflows', label: 'Cấp Phát / Thu Hồi', description: 'Bàn giao, thu hồi, điều chuyển bộ máy', icon: ArrowLeftRight },
    { id: 'maintenance', label: 'Lịch Bảo Trì', description: 'Theo dõi hạn bảo trì định kỳ 1 năm', icon: CalendarClock, badge: maintenanceCount },
    { id: 'remoteFormula', label: 'Công Thức Màu', description: 'Cập nhật công thức sơn từ xa', icon: RefreshCw },
    { id: 'serialLookup', label: 'Tra Cứu Seri', description: 'Xem vòng đời & lịch sử thiết bị', icon: Search },
    { id: 'auditLogs', label: 'Nhật Ký Tác Nghiệp', description: 'Nhật ký vận hành hệ thống', icon: FileText },
  ];

  const handleTabSelect = (tabId) => {
    setActiveTab(tabId);
    setShowMoreMenu(false);
  };

  const isMoreActive = moreItems.some(item => item.id === activeTab);

  return (
    <>
      <nav className="mobile-bottom-nav" style={{ zIndex: 999 }}>
        {mainItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id && !showMoreMenu;
          return (
            <button
              key={item.id}
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(item.id);
                setShowMoreMenu(false);
              }}
            >
              <div style={{ position: 'relative' }}>
                <Icon size={20} color={isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
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
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* More Menu Trigger */}
        <button
          className={`mobile-nav-item ${isMoreActive || showMoreMenu ? 'active' : ''}`}
          onClick={() => setShowMoreMenu(!showMoreMenu)}
        >
          <Menu size={20} color={isMoreActive || showMoreMenu ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
          <span>Thêm...</span>
        </button>
      </nav>

      {/* Bottom Menu Sheet Drawer */}
      {showMoreMenu && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            zIndex: 998,
            display: 'flex',
            alignItems: 'flex-end',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={() => setShowMoreMenu(false)}
        >
          <div 
            style={{
              width: '100%',
              background: '#0f172a',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              padding: '24px 20px 40px 20px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '1rem', fontWeight: '800', color: '#fff' }}>Menu Tác Nghiệp</span>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Các mục quản lý kỹ thuật khác của NASUN</span>
              </div>
              <button 
                onClick={() => setShowMoreMenu(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Drawer Menu List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {moreItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabSelect(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: isActive ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255,255,255,0.02)',
                      border: isActive ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid rgba(255,255,255,0.04)',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: isActive ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'
                      }}>
                        <Icon size={18} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: '700', color: isActive ? 'var(--accent-cyan)' : '#f8fafc' }}>
                          {item.label}
                          {item.badge > 0 && (
                            <span style={{
                              marginLeft: '8px',
                              background: '#ef4444',
                              color: '#fff',
                              fontSize: '0.65rem',
                              fontWeight: 'bold',
                              borderRadius: '10px',
                              padding: '1px 6px'
                            }}>
                              {item.badge}
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>{item.description}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} color="var(--text-muted)" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
