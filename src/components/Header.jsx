import React, { useState, useEffect } from 'react';
import { Bell, Search, PlusCircle, AlertTriangle, ShieldAlert, CheckCircle2, UserCheck, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import RoleSelector from './RoleSelector.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABELS, ROLE_COLORS } from '../security/rbac.js';
import { getOfflineQueue, syncOfflineQueue } from '../lib/offlineSync.js';

export default function Header({ 
  activeTab, 
  globalSearch, 
  setGlobalSearch, 
  onOpenNewInstallation,
  maintenanceAlerts,
  unstabilizedAlerts
}) {
  const [showNotifications, setShowNotifications] = useState(false);
  const { role, user, isDevMode } = useAuth();
  
  // Connection and sync states
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [syncState, setSyncState] = useState('idle'); // idle | syncing | error
  const [syncErrorMessage, setSyncErrorMessage] = useState('');

  // Update states on mount and set listeners
  useEffect(() => {
    const updateStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) {
        // Auto trigger sync when back online
        handleSync();
      }
    };

    const updateQueueCount = () => {
      setQueueCount(getOfflineQueue().length);
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    window.addEventListener('offline-queue-updated', updateQueueCount);
    
    // Initial fetch
    updateQueueCount();

    // Try auto-sync on mount if online
    if (navigator.onLine) {
      handleSync();
    }

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      window.removeEventListener('offline-queue-updated', updateQueueCount);
    };
  }, []);

  const handleSync = async () => {
    if (syncState === 'syncing' || !navigator.onLine) return;
    
    setSyncState('syncing');
    setSyncErrorMessage('');
    
    const success = await syncOfflineQueue((status, remaining, err) => {
      if (status === 'error') {
        setSyncState('error');
        setSyncErrorMessage(err || 'Đồng bộ thất bại');
      }
    });

    if (success) {
      setSyncState('idle');
      setQueueCount(0);
    }
  };

  const getTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Dashboard Quản Trị Hệ Thống Máy Pha Màu';
      case 'npp': return 'Danh Sách Quản Lý Nhà Phân Phối (NPP)';
      case 'assets': return 'Quản Lý Bộ Máy Pha Màu & Kho Thiết Bị Lẻ';
      case 'workflows': return 'Nghiệp Vụ Lắp Đặt, Thu Hồi & Điều Chuyển';
      case 'maintenance': return 'Lịch Bảo Trì Định Kỳ 1 Năm / Lần (Cảnh báo trước 1 tháng)';
      case 'remoteFormula': return 'Cập Nhật Công Thức Màu Từ Xa (ColorExpert 2 / 3 & CorobTINT)';
      case 'tintingLogs': return 'Nhật Ký Pha Màu & Giám Sát Năng Suất NPP';
      case 'serialLookup': return 'Tra Cứu Lịch Sử Theo Số Seri Thiết Bị';
      case 'auditLogs': return 'Nhật Ký Tác Nghiệp & Lịch Sử Giao Dịch';
      default: return 'Hệ Thống Quản Lý Máy Pha Màu';
    }
  };

  const totalAlertsCount = maintenanceAlerts.length + unstabilizedAlerts.length;

  return (
    <header style={{
      height: '70px',
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      position: 'sticky',
      top: 0,
      zIndex: 90
    }} className="no-print">
      {/* Title */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.01em', margin: 0 }}>
            {getTitle()}
          </h1>
          
          {/* Connection Status & Offline Sync UI */}
          {!isOnline ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '0.7rem',
              fontWeight: 'bold'
            }}>
              <WifiOff size={12} />
              <span>Ngoại Tuyến (Offline)</span>
            </div>
          ) : queueCount > 0 ? (
            <button 
              onClick={handleSync}
              title={syncErrorMessage ? `Lỗi: ${syncErrorMessage}. Click để thử lại.` : 'Click để đồng bộ ngay'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: syncState === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                border: syncState === 'error' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                color: syncState === 'error' ? '#ef4444' : '#f59e0b',
                fontSize: '0.7rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                animation: syncState === 'syncing' ? 'pulse 1.5s infinite' : 'none'
              }}
            >
              <RefreshCw size={12} className={syncState === 'syncing' ? 'spin' : ''} />
              <span>Đang có {queueCount} dữ liệu cần đồng bộ</span>
            </button>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              fontSize: '0.7rem',
              fontWeight: 'bold'
            }}>
              <Wifi size={12} />
              <span>Đã Đồng Bộ (Online)</span>
            </div>
          )}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Cập nhật thời gian thực: {new Date().toLocaleDateString('vi-VN')} • Trạng thái hoạt động bình thường
        </div>
      </div>

      {/* Header Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Global Search Bar */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Tìm Seri máy, NPP, Mã bộ máy..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '36px', height: '38px', fontSize: '0.825rem', width: '100%' }}
          />
        </div>

        {/* Quick New Installation Button */}
        <button className="btn btn-primary btn-sm" onClick={onOpenNewInstallation} style={{ height: '38px', padding: '0 16px' }}>
          <PlusCircle size={16} />
          <span>Lắp Đặt Cho NPP</span>
        </button>

        {/* Role Selector (dev mode only) */}
        <RoleSelector />

        {/* Current User Role Badge (production) */}
        {!isDevMode && role && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '20px',
            border: `1px solid ${ROLE_COLORS[role]}44`,
            background: `${ROLE_COLORS[role]}11`,
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: ROLE_COLORS[role] }}>
              {ROLE_LABELS[role]}
            </span>
            {user?.name && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {user.name.split(' ').slice(-1)[0]}
              </span>
            )}
          </div>
        )}

        {/* Notifications Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            <Bell size={18} />
            {totalAlertsCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: '#f43f5e',
                color: '#fff',
                fontSize: '0.65rem',
                fontWeight: 'bold',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {totalAlertsCount}
              </span>
            )}
          </button>

          {/* Notifications Popover */}
          {showNotifications && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '48px',
              width: '340px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
              zIndex: 1000,
              padding: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>Thông Báo Hệ Thống ({totalAlertsCount})</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', cursor: 'pointer' }} onClick={() => setShowNotifications(false)}>Đóng</span>
              </div>

              {totalAlertsCount === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <CheckCircle2 size={32} color="var(--accent-emerald)" style={{ margin: '0 auto 8px' }} />
                  Không có cảnh báo mới
                </div>
              ) : (
                <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {maintenanceAlerts.map(item => (
                    <div key={item.id} style={{ padding: '10px', background: 'rgba(245, 158, 11, 0.1)', borderLeft: '3px solid #f59e0b', borderRadius: '4px', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: '#fbbf24' }}>
                        <AlertTriangle size={14} />
                        <span>Sắp đến hạn bảo trì 1 năm!</span>
                      </div>
                      <div style={{ color: 'var(--text-main)', marginTop: '2px' }}>{item.nppName} ({item.setCode})</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.725rem' }}>Hạn bảo trì: {item.nextMaintenanceDue}</div>
                    </div>
                  ))}

                  {unstabilizedAlerts.map(item => (
                    <div key={item.id} style={{ padding: '10px', background: 'rgba(244, 63, 94, 0.1)', borderLeft: '3px solid #f43f5e', borderRadius: '4px', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: '#fb7185' }}>
                        <ShieldAlert size={14} />
                        <span>Máy tính chưa trang bị Ổn áp</span>
                      </div>
                      <div style={{ color: 'var(--text-main)', marginTop: '2px' }}>{item.nppName} ({item.setCode})</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.725rem' }}>Khuyến nghị NPP tự mua Ổn áp (Lioa/Standa)</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderLeft: '1px solid var(--border-color)', paddingLeft: '16px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'var(--bg-card-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-cyan)'
          }}>
            <UserCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.825rem', fontWeight: '700', lineHeight: 1.2 }}>Quản Lý Kỹ Thuật</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)' }}>● Admin System</div>
          </div>
        </div>
      </div>
    </header>
  );
}
