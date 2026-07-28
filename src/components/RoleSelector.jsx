import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES, ROLE_LABELS, ROLE_COLORS } from '../security/rbac.js';

/**
 * RoleSelector – Development-only role switcher.
 * Shows as a small badge in the header.
 * Automatically hidden when Supabase is connected (production mode).
 */
export default function RoleSelector() {
  const { role, switchDevRole, isDevMode, ROLES: R } = useAuth();

  // Only show in dev mode (no Supabase configured)
  if (!isDevMode) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {/* DEV label */}
      <span style={{
        fontSize: '0.65rem',
        fontWeight: '800',
        padding: '2px 6px',
        borderRadius: '4px',
        background: 'rgba(245,158,11,0.15)',
        color: '#f59e0b',
        border: '1px solid rgba(245,158,11,0.3)',
        letterSpacing: '0.05em',
      }}>
        DEV
      </span>

      {/* Role buttons */}
      {[ROLES.ADMIN, ROLES.QC, ROLES.VIEWER].map(r => (
        <button
          key={r}
          onClick={() => switchDevRole(r)}
          title={`Chuyển sang vai trò: ${ROLE_LABELS[r]}`}
          style={{
            padding: '3px 10px',
            borderRadius: '20px',
            border: `1px solid ${role === r ? ROLE_COLORS[r] : 'transparent'}`,
            background: role === r
              ? `${ROLE_COLORS[r]}22`
              : 'rgba(255,255,255,0.05)',
            color: role === r ? ROLE_COLORS[r] : 'var(--text-muted)',
            fontSize: '0.75rem',
            fontWeight: role === r ? '700' : '400',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          {ROLE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}
