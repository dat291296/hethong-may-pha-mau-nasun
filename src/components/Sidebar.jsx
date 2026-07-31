import React, { useState } from 'react';
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
  ShieldCheck,
  Wrench,
  X,
  UserCheck,
  LogOut
} from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';

export default function Sidebar({ activeTab, setActiveTab, maintenanceCount, pendingRepairCount, isOpen, onClose }) {
  const [logoSrc, setLogoSrc] = useState('/nasun_logo.png.png');
  const [showFallback, setShowFallback] = useState(false);

  const handleLogoError = () => {
    if (logoSrc === '/nasun_logo.png.png') {
      setLogoSrc('/nasun_logo.png.webp');
    } else if (logoSrc === '/nasun_logo.png.webp') {
      setLogoSrc('/nasun_logo.png');
    } else if (logoSrc === '/nasun_logo.png') {
      setLogoSrc('/nasun_logo.jpg');
    } else {
      setShowFallback(true);
    }
  };
  const { role, signOut } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard Tổng Quan', icon: LayoutDashboard },
    { id: 'npp', label: 'Nhà Phân Phối (NPP)', icon: Building2 },
    { id: 'assets', label: 'Bộ Máy & Kho Thiết Bị', icon: Cpu },
    { id: 'repairs', label: 'Xử Lý & Sửa Chữa Máy', icon: Wrench, badge: pendingRepairCount },
    { id: 'workflows', label: 'Cấp Phát / Thu Hồi', icon: ArrowLeftRight },
    { id: 'maintenance', label: 'Lịch Bảo Trì 1 Năm', icon: CalendarClock, badge: maintenanceCount },
    { id: 'remoteFormula', label: 'Cập Nhật Công Thức Màu', icon: RefreshCw, badgeText: '3 SW' },
    { id: 'tintingLogs', label: 'Lịch Sử Pha Màu & Năng Suất', icon: BarChart3 },
    { id: 'serialLookup', label: 'Tra Cứu Seri Thiết Bị', icon: Search },
    { id: 'auditLogs', label: 'Nhật Ký Tác Nghiệp', icon: FileText },
  ];

  if (role === 'admin') {
    menuItems.push({ id: 'users', label: 'Quản Lý Tài Khoản', icon: UserCheck });
  }

  return (
    <aside 
      className={`desktop-sidebar no-print ${isOpen ? 'mobile-open' : ''}`}
      style={{
        width: '260px',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        zIndex: 100
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
          {/* Attempt to load public/nasun_logo with error handling fallback */}
          <div style={{ 
            position: 'relative', 
            width: '40px', 
            height: '40px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '3px',
            boxSizing: 'border-box',
            overflow: 'hidden'
          }}>
            {!showFallback ? (
              <img 
                src={logoSrc} 
                alt="Nasun Logo" 
                onError={handleLogoError}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: '6px',
                  transition: 'transform 0.2s ease'
                }}
              />
            ) : (
              <div 
                className="logo-fallback"
                style={{
                  display: 'flex',
                  width: '100%',
                  height: '100%',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 12px rgba(6, 182, 212, 0.4)'
                }}
              >
                <ShieldCheck size={20} />
              </div>
            )}
          </div>
          
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
              NASUN COLOR
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

      {/* Navigation Links */}
      <nav style={{ padding: '16px 12px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 12px 10px 12px' }}>
          Quản Lý Hệ Thống
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (onClose) onClose();
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                marginBottom: '4px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? 'linear-gradient(90deg, rgba(6,182,212,0.15) 0%, rgba(2,132,199,0.05) 100%)' : 'transparent',
                color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
                fontWeight: isActive ? '700' : '500',
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                borderLeft: isActive ? '3px solid var(--accent-cyan)' : '3px solid transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon size={18} color={isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
                <span>{item.label}</span>
              </div>
              {item.badge > 0 && (
                <span className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                  {item.badge}
                </span>
              )}
              {item.badgeText && (
                <span className="badge badge-purple" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                  {item.badgeText}
                </span>
              )}
            </button>
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
