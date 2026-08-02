import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  Cpu, 
  ArrowLeftRight, 
  CalendarClock, 
  RefreshCw, 
  BarChart3, 
  Search, 
  FileText,
  Wrench,
  X,
  UserCheck,
  LogOut,
  BookOpen,
  MapPin,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';

export default function Sidebar({ activeTab, setActiveTab, maintenanceCount, pendingRepairCount, isOpen, onClose }) {
  const { role, signOut } = useAuth();

  const [expandedGroups, setExpandedGroups] = useState({
    partner_assets: true,
    tech_maint: true,
    data_formula: false,
    system_settings: false
  });

  const menuGroups = [
    {
      id: 'partner_assets',
      label: 'Đối Tác & Thiết Bị',
      icon: Building2,
      items: [
        { id: 'npp', label: 'Nhà Phân Phối (NPP)', icon: Building2 },
        { id: 'assets', label: 'Bộ Máy & Kho Thiết Bị', icon: Cpu },
        { id: 'workflows', label: 'Cấp Phát / Thu Hồi', icon: ArrowLeftRight },
      ]
    },
    {
      id: 'tech_maint',
      label: 'Kỹ Thuật & Bảo Trì',
      icon: Wrench,
      items: [
        { id: 'repairs', label: 'Xử Lý & Sửa Chữa Máy', icon: Wrench, badge: pendingRepairCount },
        { id: 'maintenance', label: 'Lịch Bảo Trì 1 Năm', icon: CalendarClock, badge: maintenanceCount },
        { id: 'techHandbook', label: 'Sổ Tay Kỹ Thuật (SOP)', icon: BookOpen, badgeText: 'SOPs' },
        { id: 'routeMap', label: 'Bản Đồ Tuyến Đường', icon: MapPin, badgeText: 'GPS' },
      ]
    },
    {
      id: 'data_formula',
      label: 'Dữ Liệu & Công Thức',
      icon: RefreshCw,
      items: [
        { id: 'tintingLogs', label: 'Lịch Sử Pha Màu', icon: BarChart3 },
        { id: 'remoteFormula', label: 'Cập Nhật Công Thức', icon: RefreshCw, badgeText: '3 SW' },
        { id: 'serialLookup', label: 'Tra Cứu Seri Thiết Bị', icon: Search },
      ]
    },
    {
      id: 'system_settings',
      label: 'Hệ Thống & Nhật Ký',
      icon: FileText,
      items: [
        { id: 'auditLogs', label: 'Nhật Ký Tác Nghiệp', icon: FileText },
        ...(role === 'admin' ? [{ id: 'users', label: 'Quản Lý Tài Khoản', icon: UserCheck }] : [])
      ]
    }
  ];

  // Auto expand group containing active tab on tab change
  useEffect(() => {
    const activeGroup = menuGroups.find(group => 
      group.items.some(item => item.id === activeTab)
    );
    if (activeGroup) {
      setExpandedGroups(prev => ({
        ...prev,
        [activeGroup.id]: true
      }));
    }
  }, [activeTab]);

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const getGroupBadgeCount = (groupId) => {
    if (groupId === 'tech_maint') {
      return (pendingRepairCount || 0) + (maintenanceCount || 0);
    }
    return 0;
  };

  return (
    <aside 
      className={`desktop-sidebar no-print ${isOpen ? 'mobile-open' : ''}`}
      style={{
        width: isOpen ? '285px' : '260px',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: isOpen ? 'fixed' : 'sticky',
        top: 0,
        zIndex: isOpen ? 1000 : 100
      }} 
    >
      {/* Brand Logo */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(30, 41, 59, 0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img 
            src="/nasun_logo.png?v=3" 
            alt="Nasun Paint Logo" 
            style={{
              width: '40px',
              height: '40px',
              objectFit: 'contain'
            }}
          />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <h2 style={{ 
              fontSize: '1rem', 
              fontWeight: '900', 
              color: 'var(--text-main)', 
              letterSpacing: '-0.02em', 
              lineHeight: 1.1,
              background: 'linear-gradient(90deg, #fff 0%, #cbd5e1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              NASUN PAINT
            </h2>
            <span style={{ 
              fontSize: '0.65rem', 
              color: 'var(--accent-cyan)', 
              fontWeight: '700', 
              textTransform: 'uppercase', 
              letterSpacing: '0.08em',
              opacity: 0.9 
            }}>
              Hệ Thống Pha Màu
            </span>
          </div>
        </div>

        {isOpen && (
          <button 
            onClick={onClose}
            className="sidebar-close-btn"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)'
            }}
          >
            <X size={18} color="#fff" />
          </button>
        )}
      </div>

      {/* Custom styles for interactive animations */}
      <style>{`
        .sidebar-menu-btn {
          transition: all 0.2s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .sidebar-menu-btn:active {
          transform: scale(0.98);
        }
        .sidebar-menu-btn:hover {
          background: rgba(255, 255, 255, 0.04) !important;
          color: var(--accent-cyan) !important;
        }
        .sidebar-group-header {
          transition: all 0.2s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .sidebar-group-header:active {
          transform: scale(0.98);
        }
        .sidebar-group-header:hover {
          background-color: rgba(255, 255, 255, 0.03) !important;
          color: var(--text-main) !important;
        }
        .sidebar-sub-item {
          transition: all 0.2s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .sidebar-sub-item:active {
          transform: scale(0.98);
        }
        .sidebar-sub-item:hover {
          background: rgba(255, 255, 255, 0.04) !important;
          color: var(--text-main) !important;
        }
      `}</style>

      {/* Navigation Links */}
      <nav style={{ padding: '16px 12px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 12px 10px 12px' }}>
          Quản Lý Hệ Thống
        </div>

        {/* Dashboard Standalone Item */}
        <button
          onClick={() => {
            setActiveTab('dashboard');
            if (onClose) onClose();
          }}
          className="sidebar-menu-btn"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            marginBottom: '12px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'dashboard' ? 'linear-gradient(90deg, rgba(6,182,212,0.15) 0%, rgba(2,132,199,0.05) 100%)' : 'transparent',
            color: activeTab === 'dashboard' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            fontWeight: activeTab === 'dashboard' ? '700' : '500',
            fontSize: '0.875rem',
            cursor: 'pointer',
            borderLeft: activeTab === 'dashboard' ? '3px solid var(--accent-cyan)' : '3px solid transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LayoutDashboard size={18} color={activeTab === 'dashboard' ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
            <span>Dashboard Tổng Quan</span>
          </div>
        </button>

        {/* Collapsible Groups */}
        {menuGroups.map((group) => {
          const GroupIcon = group.icon;
          const isExpanded = !!expandedGroups[group.id];
          const hasActiveChild = group.items.some(item => item.id === activeTab);
          const badgeCount = getGroupBadgeCount(group.id);
          
          return (
            <div key={group.id} style={{ marginBottom: '6px' }}>
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className="sidebar-group-header"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: hasActiveChild ? 'var(--text-main)' : 'var(--text-muted)',
                  fontWeight: '700',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <GroupIcon size={16} color={hasActiveChild ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
                  <span>{group.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {/* Show summary badge if collapsed */}
                  {!isExpanded && badgeCount > 0 && (
                    <span className="badge badge-warning" style={{ fontSize: '0.65rem', padding: '1px 5px', height: '16px', display: 'flex', alignItems: 'center', borderRadius: '4px' }}>
                      {badgeCount}
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronDown size={14} color="var(--text-muted)" style={{ transition: 'transform 0.2s' }} />
                  ) : (
                    <ChevronRight size={14} color="var(--text-muted)" style={{ transition: 'transform 0.2s' }} />
                  )}
                </div>
              </button>

              {/* Sub-items list */}
              {isExpanded && (
                <div style={{ 
                  marginLeft: '20px', 
                  borderLeft: '1px solid var(--border-color)', 
                  paddingLeft: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  marginTop: '4px',
                  marginBottom: '6px'
                }}>
                  {group.items.map((item) => {
                    const ChildIcon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          if (onClose) onClose();
                        }}
                        className="sidebar-sub-item"
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: isActive ? 'linear-gradient(90deg, rgba(6,182,212,0.1) 0%, rgba(2,132,199,0.02) 100%)' : 'transparent',
                          color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
                          fontWeight: isActive ? '700' : '500',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          borderLeft: isActive ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                          marginLeft: '-1px' // Align precisely with vertical line
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <ChildIcon size={16} color={isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge > 0 && (
                          <span className="badge badge-warning" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                            {item.badge}
                          </span>
                        )}
                        {item.badgeText && (
                          <span className="badge badge-purple" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                            {item.badgeText}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Logout button */}
      <div style={{ padding: '0 12px 12px 12px' }}>
        <button
          onClick={() => {
            if (window.confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?')) {
              signOut();
              if (onClose) onClose();
            }
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '8px',
            border: 'none',
            background: 'rgba(239, 68, 68, 0.08)',
            color: '#ef4444',
            fontWeight: '600',
            fontSize: '0.875rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          className="sidebar-logout-btn"
        >
          <LogOut size={16} color="#ef4444" />
          <span>Đăng Xuất</span>
        </button>
      </div>

      {/* Footer Info */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid var(--border-color)',
        background: 'rgba(15, 23, 42, 0.4)',
        fontSize: '0.775rem',
        color: 'var(--text-muted)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span>Kết Nối Server:</span>
          <span className="badge badge-success" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>🟢 Online PWA</span>
        </div>
        <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
          Mobile & Cloud Ready • Vercel Ready
        </div>
      </div>
    </aside>
  );
}
