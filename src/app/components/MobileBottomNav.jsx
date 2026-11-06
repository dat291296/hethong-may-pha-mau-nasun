import React from 'react';
import { Cpu, Wrench, CalendarClock, Building2, UserCircle } from 'lucide-react';
import { triggerHaptic } from '../../shared/platform/haptics.js';
import { Camera } from 'lucide-react';
import { useAuth } from '../../shared/context/AuthContext.jsx';
import { hasPermission } from '../../shared/security/rbac.js';

export default function MobileBottomNav({ activeTab, setActiveTab, maintenanceCount, pendingRepairCount, onOpenQrScan }) {
  const { role } = useAuth();
  const mainItems = [
    { id: 'assets', label: 'Thiết Bị', icon: Cpu },
    { id: 'repairs', label: 'Sửa Chữa', icon: Wrench, badge: pendingRepairCount },
    { id: 'maintenance', label: 'Bảo Trì', icon: CalendarClock, badge: maintenanceCount },
    { id: 'npp', label: 'NPP', icon: Building2 },
    { id: 'profile', label: 'Tài Khoản', icon: UserCircle },
  ];

  return (
    <>
      <style>{`
        .mnav-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0;
          background: transparent;
          border: none;
          padding: 6px 0 4px;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          outline: none;
          position: relative;
          transition: opacity 0.1s ease;
        }
        .mnav-btn:active {
          opacity: 0.55;
          transition: opacity 0.05s ease;
        }
        .mnav-icon-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 8px;
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                      background 0.2s ease;
        }
        .mnav-btn.is-active .mnav-icon-wrap {
          transform: scale(1.2) translateY(-2px);
          background: rgba(6, 182, 212, 0.12);
        }
        /* Dot — always in DOM, animated via opacity + scale */
        .mnav-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--accent-cyan);
          box-shadow: 0 0 5px var(--accent-cyan);
          margin-top: 2px;
          opacity: 0;
          transform: scale(0);
          transition: opacity 0.2s ease,
                      transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .mnav-btn.is-active .mnav-dot {
          opacity: 1;
          transform: scale(1);
        }
        .mnav-label {
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          margin-top: 2px;
          line-height: 1.3;
          white-space: nowrap;
          transition: color 0.2s ease;
        }
        .mnav-badge {
          position: absolute;
          top: -3px;
          right: -4px;
          background: #ef4444;
          color: #fff;
          font-size: 0.55rem;
          font-weight: 700;
          border-radius: 50%;
          width: 14px;
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.5px solid var(--bg-main);
          pointer-events: none;
        }
      `}</style>

      <nav className="mobile-bottom-nav no-print" style={{ zIndex: 999 }}>
        {mainItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`mnav-btn${isActive ? ' is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => { triggerHaptic('light'); setActiveTab(item.id); }}
            >
              <div className="mnav-icon-wrap">
                <Icon
                  size={20}
                  color={isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'}
                  style={{ transition: 'color 0.2s ease' }}
                />
                {item.badge > 0 && (
                  <span className="mnav-badge">{item.badge}</span>
                )}
              </div>
              <span className="mnav-dot" />
              <span
                className="mnav-label"
                style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
        {hasPermission(role, 'qr:scan') && <button type="button" className="mnav-btn" aria-label="Quét QR tra cứu NPP" onClick={() => { triggerHaptic('light'); onOpenQrScan?.(); }} style={{ minHeight: 48 }}><span className="mnav-icon-wrap"><Camera size={20}/></span><span className="mnav-label">Quét QR</span></button>}

      </nav>
    </>
  );
}


