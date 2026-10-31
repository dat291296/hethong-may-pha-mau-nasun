export const OFFLINE_GRANT_KEY = 'offline_access_grant_v1';
export const MAX_OFFLINE_READ_MS = 8 * 60 * 60 * 1000;
const roles = new Set(['admin','manager','technician','qc','viewer']);
const regions = new Set(['Miền Bắc','Miền Trung','Miền Nam']);
export function createOfflineAccessGrant(user, now = Date.now(), limits = {}) {
  if (!user?.id || !roles.has(user.role) || (!regions.has(user.managedRegion) && !(user.role === 'admin' && user.managedRegion === 'Toàn Quốc')) || !Number.isSafeInteger(now)) {
    throw Object.assign(new Error('OFFLINE_SCOPE_INVALID'), { code:'OFFLINE_SCOPE_INVALID' });
  }
  const deadlines=['trusted_until','session_expires_at','expires_at','idle_expires_at'].filter(key=>limits[key]!=null).map(key=>Date.parse(limits[key]));
  if(deadlines.some(value=>!Number.isFinite(value)||value<=now))throw Object.assign(new Error('OFFLINE_ACCESS_EXPIRED'),{code:'OFFLINE_ACCESS_EXPIRED'});
  return { version:1, owner:user.id, role:user.role, region:user.managedRegion,
    verifiedAt:now, expiresAt:Math.min(now+MAX_OFFLINE_READ_MS,...deadlines) };
}
export function offlineAccessDecision(grant, user, now = Date.now()) {
  if (!grant || grant.version!==1 || !user?.id || grant.owner!==user.id) return {allowed:false,reason:'UNVERIFIED_OFFLINE_ACCOUNT'};
  if (!roles.has(user.role) || grant.role!==user.role || grant.region!==user.managedRegion) return {allowed:false,reason:'OFFLINE_SCOPE_CHANGED'};
  if (!Number.isSafeInteger(grant.verifiedAt) || !Number.isSafeInteger(grant.expiresAt)
    || grant.expiresAt-grant.verifiedAt>MAX_OFFLINE_READ_MS || grant.expiresAt<=grant.verifiedAt
    || !Number.isSafeInteger(now) || now<grant.verifiedAt || now>=grant.expiresAt) return {allowed:false,reason:'OFFLINE_ACCESS_EXPIRED'};
  return {allowed:true,readOnlyAuthority:true,expiresAt:grant.expiresAt};
}

// A cached grant only bounds offline reads. Every replay still needs fresh server authorization.
export function requireCurrentReplayScope(state, ownerId) {
  if (state?.user_id!==ownerId || state.profile_found!==true || state.is_active!==true || !roles.has(state.role)) {
    throw Object.assign(new Error('SESSION_REJECTED'),{code:'SESSION_REJECTED'});
  }
  if (state.role!=='admin' && !regions.has(state.managed_region)) throw Object.assign(new Error('OFFLINE_SCOPE_INVALID'),{code:'OFFLINE_SCOPE_INVALID'});
  return {id:ownerId,role:state.role,managedRegion:state.managed_region};
}
