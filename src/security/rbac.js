/**
 * Role-Based Access Control (RBAC)
 * Paint Tinting & Stock Manager v2.0
 *
 * Roles:      ADMIN > MANAGER > TECHNICIAN / QC > VIEWER
 * Enforcement: Frontend guard (UI) + Supabase RLS (backend DB).
 *              Never rely on frontend alone for security.
 */

// ─── Role Constants ──────────────────────────────────────────────────────────
export const ROLES = Object.freeze({
  ADMIN:      'admin',
  MANAGER:    'manager',
  TECHNICIAN: 'technician',
  QC:         'qc',
  VIEWER:     'viewer',
});

export const ALL_ROLES = Object.freeze(Object.values(ROLES));
export const OPERATIONAL_ROLES = Object.freeze([
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.TECHNICIAN,
  ROLES.QC,
]);
export const REGIONAL_ROLES = Object.freeze([
  ROLES.MANAGER,
  ROLES.TECHNICIAN,
  ROLES.QC,
  ROLES.VIEWER,
]);

// ─── Permission Matrix ───────────────────────────────────────────────────────
// Maps action → minimum required role(s)
export const PERMISSIONS = Object.freeze({
  // NPP Management
  'npp:read':              ALL_ROLES,
  'npp:create':            [ROLES.QC, ROLES.MANAGER, ROLES.ADMIN],
  'npp:edit':              [ROLES.QC, ROLES.MANAGER, ROLES.ADMIN],
  'npp:delete':            [ROLES.ADMIN],
  'npp:import_excel':      [ROLES.QC, ROLES.MANAGER, ROLES.ADMIN],

  // Asset Management (Máy chiết, lắc, tính, in)
  'asset:read':            ALL_ROLES,
  'asset:create':          OPERATIONAL_ROLES,
  'asset:edit':            OPERATIONAL_ROLES,
  'asset:delete':          [ROLES.ADMIN],
  'asset:import_excel':    [ROLES.QC, ROLES.MANAGER, ROLES.ADMIN],

  // Workflow (Lắp đặt, Thu hồi, Điều chuyển)
  'workflow:install':      OPERATIONAL_ROLES,
  'workflow:withdraw':     OPERATIONAL_ROLES,
  'workflow:transfer':     OPERATIONAL_ROLES,

  // Repair / Xử lý máy
  'repair:read':           ALL_ROLES,
  'repair:create':         OPERATIONAL_ROLES,
  'repair:edit':           OPERATIONAL_ROLES,
  'repair:delete':         [ROLES.ADMIN],

  // Audit Logs
  'audit:read':            OPERATIONAL_ROLES,
  'audit:export':          [ROLES.QC, ROLES.MANAGER, ROLES.ADMIN],

  // System (Lock month, config)
  'system:lock_month':     [ROLES.ADMIN],
  'system:unlock_month':   [ROLES.ADMIN],
  'system:view_security':  [ROLES.ADMIN],
});

// ─── Permission Check ────────────────────────────────────────────────────────
/**
 * Check if a role has permission for an action.
 *
 * @param {string} role – user's role from ROLES
 * @param {string} action – permission key from PERMISSIONS map
 * @returns {boolean}
 */
export function hasPermission(role, action) {
  if (!role || !action) return false;
  const allowedRoles = PERMISSIONS[action];
  if (!allowedRoles) {
    console.warn(`[RBAC] Unknown permission action: "${action}"`);
    return false;
  }
  return allowedRoles.includes(role);
}

/**
 * Enforce permission – throws SecurityError if not allowed.
 * Use in data mutation handlers (not just UI guards).
 *
 * @param {string} role
 * @param {string} action
 * @throws {Error} if role lacks permission
 */
export function enforcePermission(role, action) {
  if (!hasPermission(role, action)) {
    const msg = `SECURITY VIOLATION: Role "${role}" không có quyền thực hiện action "${action}"!`;
    console.error(`[RBAC] ${msg}`);
    throw new Error(msg);
  }
}

// ─── Role Display Helpers ────────────────────────────────────────────────────
export const ROLE_LABELS = {
  [ROLES.ADMIN]:      '🛡️ Admin',
  [ROLES.MANAGER]:    '📊 Quản lý',
  [ROLES.TECHNICIAN]: '🔧 Kỹ thuật viên',
  [ROLES.QC]:         '🔬 QC',
  [ROLES.VIEWER]:     '👁️ Viewer',
};

export const ROLE_COLORS = {
  [ROLES.ADMIN]:      '#f43f5e',
  [ROLES.MANAGER]:    '#38bdf8',
  [ROLES.TECHNICIAN]: '#10b981',
  [ROLES.QC]:         '#f59e0b',
  [ROLES.VIEWER]:     '#6b7280',
};

/**
 * Get tooltip text for disabled actions.
 */
export function getPermissionDeniedMessage(action) {
  return `Không có quyền thực hiện thao tác này (${action}). Liên hệ Admin để được cấp quyền.`;
}
