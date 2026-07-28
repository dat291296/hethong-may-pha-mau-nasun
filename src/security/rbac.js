/**
 * Role-Based Access Control (RBAC)
 * Paint Tinting & Stock Manager v2.0
 *
 * Roles:      ADMIN > QC > VIEWER
 * Enforcement: Frontend guard (UI) + Supabase RLS (backend DB).
 *              Never rely on frontend alone for security.
 */

// ─── Role Constants ──────────────────────────────────────────────────────────
export const ROLES = Object.freeze({
  ADMIN:  'admin',
  QC:     'qc',
  VIEWER: 'viewer',
});

// ─── Permission Matrix ───────────────────────────────────────────────────────
// Maps action → minimum required role(s)
export const PERMISSIONS = Object.freeze({
  // NPP Management
  'npp:read':              [ROLES.VIEWER, ROLES.QC, ROLES.ADMIN],
  'npp:create':            [ROLES.QC,     ROLES.ADMIN],
  'npp:edit':              [ROLES.QC,     ROLES.ADMIN],
  'npp:delete':            [ROLES.ADMIN],
  'npp:import_excel':      [ROLES.QC,     ROLES.ADMIN],

  // Asset Management (Máy chiết, lắc, tính, in)
  'asset:read':            [ROLES.VIEWER, ROLES.QC, ROLES.ADMIN],
  'asset:create':          [ROLES.QC,     ROLES.ADMIN],
  'asset:edit':            [ROLES.QC,     ROLES.ADMIN],
  'asset:delete':          [ROLES.ADMIN],
  'asset:import_excel':    [ROLES.QC,     ROLES.ADMIN],

  // Workflow (Lắp đặt, Thu hồi, Điều chuyển)
  'workflow:install':      [ROLES.QC,     ROLES.ADMIN],
  'workflow:withdraw':     [ROLES.QC,     ROLES.ADMIN],
  'workflow:transfer':     [ROLES.QC,     ROLES.ADMIN],

  // Repair / Xử lý máy
  'repair:read':           [ROLES.VIEWER, ROLES.QC, ROLES.ADMIN],
  'repair:create':         [ROLES.QC,     ROLES.ADMIN],
  'repair:edit':           [ROLES.QC,     ROLES.ADMIN],
  'repair:delete':         [ROLES.ADMIN],

  // Audit Logs
  'audit:read':            [ROLES.QC,     ROLES.ADMIN],
  'audit:export':          [ROLES.ADMIN],

  // System (Lock month, config)
  'system:lock_month':     [ROLES.ADMIN],
  'system:unlock_month':   [ROLES.ADMIN],
  'system:view_security':  [ROLES.ADMIN],
});

// ─── Permission Check ────────────────────────────────────────────────────────
/**
 * Check if a role has permission for an action.
 *
 * @param {string} role – user's role (ROLES.ADMIN | ROLES.QC | ROLES.VIEWER)
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
  [ROLES.ADMIN]:  '🛡️ Admin',
  [ROLES.QC]:     '🔬 QC / Kỹ Thuật',
  [ROLES.VIEWER]: '👁️ Viewer',
};

export const ROLE_COLORS = {
  [ROLES.ADMIN]:  '#f43f5e',
  [ROLES.QC]:     '#f59e0b',
  [ROLES.VIEWER]: '#6b7280',
};

/**
 * Get tooltip text for disabled actions.
 */
export function getPermissionDeniedMessage(action) {
  return `Không có quyền thực hiện thao tác này (${action}). Liên hệ Admin để được cấp quyền.`;
}
