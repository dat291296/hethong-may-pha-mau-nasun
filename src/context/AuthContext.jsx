import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ROLES, ROLE_LABELS, hasPermission } from '../security/rbac.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { clearOfflineStorage, getCache, getQueue, initializeOfflineStorage, setCache } from '../lib/offlineDb.js';
import { syncOfflineQueue } from '../lib/offlineSync.js';

// ─── Auth Context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);
const OFFLINE_USER_KEY = 'nasun_offline_user';
const SESSION_VALIDATION_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_WINDOW_SECONDS = 5 * 60;

async function getOfflineUser(authUser) {
  const cached = await getCache(OFFLINE_USER_KEY, null);
  return cached?.id === authUser?.id ? cached : null;
}

async function persistOfflineUser(user) {
  if (user) await setCache(OFFLINE_USER_KEY, user);
}

// Default dev user (used when Supabase not configured)
const DEV_USERS = {
  [ROLES.ADMIN]:  { id: 'dev-admin',  email: 'dat291219962.hust@gmail.com',  name: 'Admin Nasun',  role: ROLES.ADMIN,  managedRegion: 'Toàn Quốc'  },
  [ROLES.QC]:     { id: 'dev-qc',     email: 'qc@dev.local',     name: 'QC Dev',     role: ROLES.QC,     managedRegion: 'Miền Bắc'  },
  [ROLES.VIEWER]: { id: 'dev-viewer', email: 'viewer@dev.local',  name: 'Viewer Dev', role: ROLES.VIEWER, managedRegion: 'Miền Nam'  },
};

// ─── Auth Provider ────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(ROLES.ADMIN); // Default to Admin in dev
  const [loading, setLoading] = useState(true);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [emailVerifiedSuccess, setEmailVerifiedSuccess] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [authRedirectError, setAuthRedirectError] = useState('');
  const sessionValidationRunning = useRef(false);

  // ── Initialize auth ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      
      const isVerified = urlParams.get('verified') === 'true';
      const isRecovery = urlParams.get('recovery') === 'true' || hashParams.get('type') === 'recovery';
      const hasErrorSearch = urlParams.has('error') || urlParams.has('error_description');
      const hasErrorHash = hashParams.has('error') || hashParams.has('error_description');

      let errorMsg = '';
      if (hasErrorSearch) {
        errorMsg = urlParams.get('error_description') || urlParams.get('error') || 'Xác thực email thất bại.';
      } else if (hasErrorHash) {
        errorMsg = hashParams.get('error_description') || hashParams.get('error') || 'Xác thực email thất bại.';
      }

      if (errorMsg) {
        const cleanMsg = decodeURIComponent(errorMsg.replace(/\+/g, ' '));
        setPasswordRecovery(false);
        setAuthRedirectError(cleanMsg);

        clearOfflineStorage().then(() => supabase.auth.signOut()).then(() => {
          const newUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        });
      } else if (isRecovery) {
        setPasswordRecovery(true);
      } else if (isVerified) {
        setEmailVerifiedSuccess(true);
        // Force logout to let user log in manually
        clearOfflineStorage().then(() => supabase.auth.signOut()).then(() => {
          // Clear query params so refreshing does not trigger this again
          const newUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        });
      }

      // Production: Use Supabase Auth
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        const currentUrlParams = new URLSearchParams(window.location.search);
        const currentIsVerified = currentUrlParams.get('verified') === 'true';
        const currentIsRecovery = currentUrlParams.get('recovery') === 'true';

        if (currentIsRecovery) {
          setPasswordRecovery(true);
          setLoading(false);
        } else if (session && !currentIsVerified) {
          await initializeOfflineStorage(session.user.id);
          if (!navigator.onLine) {
            const cachedUser = await getOfflineUser(session.user);
            const fallbackUser = cachedUser || {
              id: session.user.id,
              email: session.user.email,
              name: session.user.email,
              role: ROLES.VIEWER,
              managedRegion: 'Miền Bắc'
            };
            setUser(fallbackUser);
            setRole(fallbackUser.role || ROLES.VIEWER);
            setLoading(false);
          } else {
            loadUserProfile(session.user);
          }
        } else {
          setLoading(false);
        }
      }).catch(error => {
        console.warn('[Auth] Session restore failed:', error.message);
        setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          const currentUrlParams = new URLSearchParams(window.location.search);
          const currentIsVerified = currentUrlParams.get('verified') === 'true';
          const currentIsRecovery = currentUrlParams.get('recovery') === 'true';

          if (event === 'PASSWORD_RECOVERY' || currentIsRecovery) {
            setPasswordRecovery(true);
            setUser(null);
            setRole(ROLES.VIEWER);
            setLoading(false);
          } else if (session && !currentIsVerified) {
            await initializeOfflineStorage(session.user.id);
            if (!navigator.onLine) {
              const cachedUser = await getOfflineUser(session.user);
              const fallbackUser = cachedUser || {
                id: session.user.id,
                email: session.user.email,
                name: session.user.email,
                role: ROLES.VIEWER,
                managedRegion: 'Miền Bắc'
              };
              setUser(fallbackUser);
              setRole(fallbackUser.role || ROLES.VIEWER);
              setLoading(false);
            } else {
              await loadUserProfile(session.user);
            }
          } else {
            if (event === 'SIGNED_OUT') await clearOfflineStorage();
            setUser(null);
            setRole(ROLES.VIEWER);
            setLoading(false);
          }
        }
      );
      return () => subscription.unsubscribe();
    } else {
      // Development: use mock user (dropdown role selector in Header)
      initializeOfflineStorage(DEV_USERS[ROLES.ADMIN].id).finally(() => {
        setUser(DEV_USERS[ROLES.ADMIN]);
        setRole(ROLES.ADMIN);
        setLoading(false);
      });
    }
  }, []);

  // ── Load user profile + role from Supabase ──────────────────────────────────
  const loadUserProfile = async (authUser) => {
    try {
      await initializeOfflineStorage(authUser.id);
      const isMasterAdmin = authUser.email?.toLowerCase() === 'dat291219962.hust@gmail.com';

      // For master admin: first ensure their role is set in DB via SECURITY DEFINER RPC
      // This bypasses RLS so it always works regardless of current DB role
      if (isMasterAdmin) {
        const { error: rpcErr } = await supabase.rpc('bootstrap_admin_role');
        if (rpcErr) {
          console.warn('[Auth] bootstrap_admin_role RPC warning:', rpcErr.message);
        }
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, avatar_url, managed_region, is_active')
        .eq('id', authUser.id)
        .single();

      if (profile?.is_active === false) {
        await clearOfflineStorage(authUser.id);
        await supabase.auth.signOut();
        const disabledError = new Error('ACCOUNT_DISABLED');
        disabledError.code = 'ACCOUNT_DISABLED';
        throw disabledError;
      }

      let finalRole = profile?.role || ROLES.VIEWER;
      let finalRegion = profile?.managed_region || 'Miền Bắc';
      
      // Always force admin role for the master admin email in the UI
      if (isMasterAdmin) {
        finalRole = ROLES.ADMIN;
        finalRegion = 'Toàn Quốc';
      } else if (error) {
        throw error;
      }

      const resolvedUser = {
        id: authUser.id,
        email: authUser.email,
        name: profile?.full_name || authUser.email,
        role: finalRole,
        avatarUrl: profile?.avatar_url || null,
        managedRegion: finalRegion,
      };
      setUser(resolvedUser);
      await persistOfflineUser(resolvedUser);
      setRole(finalRole);
    } catch (err) {
      console.error('[Auth] Failed to load user profile:', err.message);
      if (err?.code === 'ACCOUNT_DISABLED' || err?.message === 'ACCOUNT_DISABLED') {
        setUser(null);
        setRole(ROLES.VIEWER);
        await clearOfflineStorage(authUser.id);
        return;
      }
      const isSpecificAdmin = authUser.email?.toLowerCase() === 'dat291219962.hust@gmail.com';
      const fallbackUser = await getOfflineUser(authUser) || {
        id: authUser.id, 
        email: authUser.email, 
        name: authUser.email, 
        role: isSpecificAdmin ? ROLES.ADMIN : ROLES.VIEWER,
        managedRegion: isSpecificAdmin ? 'Toàn Quốc' : 'Miền Bắc'
      };
      setUser(fallbackUser);
      await persistOfflineUser(fallbackUser);
      setRole(fallbackUser.role || (isSpecificAdmin ? ROLES.ADMIN : ROLES.VIEWER));
    } finally {
      setLoading(false);
    }
  };

  // ── Dev-only: switch role via dropdown ─────────────────────────────────────
  const switchDevRole = useCallback((newRole) => {
    if (isSupabaseConfigured) return; // Ignore in production
    setRole(newRole);
    setUser(DEV_USERS[newRole] || DEV_USERS[ROLES.VIEWER]);
  }, []);

  // ── Permission check ───────────────────────────────────────────────────────
  const can = useCallback(
    (action) => hasPermission(role, action),
    [role]
  );

  // ── Security event logging ────────────────────────────────────────────────
  const reportSecurityEvent = useCallback((type, details) => {
    const event = {
      id: `SEC-${Date.now()}`,
      type,
      details,
      timestamp: new Date().toISOString(),
      userId: user?.id || 'unknown',
      userEmail: user?.email || 'unknown',
      severity: type.includes('VIOLATION') ? 'CRITICAL' : 'WARNING',
    };
    console.error(`[SECURITY][${event.severity}] ${type}:`, details);
    setSecurityEvents(prev => [event, ...prev].slice(0, 50)); // Keep last 50 events

    // Security events are stored separately from editable operational audit logs.
    if (isSupabaseConfigured && supabase) {
      supabase.rpc('record_security_event', {
        p_event_type: type,
        p_details: details || {},
      }).then(({ error }) => {
        if (error) console.error('[Auth] Failed to log security event:', error.message);
      });
    }
  }, [user]);

  // ── Sign out ───────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    let pendingItems = await getQueue();
    if (pendingItems.length > 0 && navigator.onLine) {
      await syncOfflineQueue();
      pendingItems = await getQueue();
    }
    if (pendingItems.length > 0) {
      window.alert(`Không thể đăng xuất khi còn ${pendingItems.length} thay đổi chưa đồng bộ. Hãy kết nối mạng và đồng bộ trước để tránh mất dữ liệu.`);
      return false;
    }
    const signedOutUserId = user?.id;
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    await clearOfflineStorage(signedOutUserId);
    setUser(null);
    setRole(ROLES.VIEWER);
    return true;
  }, [user]);

  const value = {
    user,
    role,
    loading,
    can,
    switchDevRole,
    signOut,
    securityEvents,
    reportSecurityEvent,
    isDevMode: !isSupabaseConfigured,
    ROLES,
    ROLE_LABELS,
    emailVerifiedSuccess,
    setEmailVerifiedSuccess,
    passwordRecovery,
    setPasswordRecovery,
    authRedirectError,
    setAuthRedirectError,
  };

  // Revalidate the server-side account state after reconnects and while the app is open.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user?.id) return undefined;

    let cancelled = false;

    const clearInvalidSession = async (reason) => {
      console.warn(`[Auth] Session invalidated: ${reason}`);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (error) {
        console.warn('[Auth] Local session cleanup failed:', error.message);
      }
      if (cancelled) return;
      setUser(null);
      setRole(ROLES.VIEWER);
      await clearOfflineStorage(user.id);
    };

    const validateSession = async () => {
      if (cancelled || !navigator.onLine || sessionValidationRunning.current) return;
      sessionValidationRunning.current = true;
      try {
        const { data: state, error } = await supabase.rpc('get_session_security_state');
        if (error) {
          if ([401, 403].includes(error.status) || ['PGRST301', '28000'].includes(error.code)) {
            await clearInvalidSession(error.code || 'AUTH_REJECTED');
          } else {
            console.warn('[Auth] Session validation deferred:', error.message);
          }
          return;
        }

        if (!state?.profile_found || !state?.is_active) {
          await clearInvalidSession('ACCOUNT_DISABLED_OR_MISSING');
          return;
        }

        const expiresIn = Number(state.token_expires_at || 0) - Math.floor(Date.now() / 1000);
        if (expiresIn <= TOKEN_REFRESH_WINDOW_SECONDS) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            await clearInvalidSession('TOKEN_REFRESH_FAILED');
            return;
          }
        }

        if (state.role !== user.role || state.managed_region !== user.managedRegion) {
          const { data: authData, error: userError } = await supabase.auth.getUser();
          if (userError || !authData.user) {
            await clearInvalidSession('USER_VALIDATION_FAILED');
            return;
          }
          await loadUserProfile(authData.user);
        }
      } catch (error) {
        console.warn('[Auth] Session validation deferred:', error.message);
      } finally {
        sessionValidationRunning.current = false;
      }
    };

    const validateWhenVisible = () => {
      if (document.visibilityState === 'visible') validateSession();
    };

    validateSession();
    const timer = window.setInterval(validateSession, SESSION_VALIDATION_MS);
    window.addEventListener('online', validateSession);
    window.addEventListener('focus', validateSession);
    document.addEventListener('visibilitychange', validateWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('online', validateSession);
      window.removeEventListener('focus', validateSession);
      document.removeEventListener('visibilitychange', validateWhenVisible);
    };
  }, [user?.id, user?.role, user?.managedRegion]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── useAuth Hook ─────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

export default AuthContext;
