import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ROLES, ROLE_LABELS, hasPermission } from '../security/rbac.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

// ─── Auth Context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// Default dev user (used when Supabase not configured)
const DEV_USERS = {
  [ROLES.ADMIN]:  { id: 'dev-admin',  email: 'dat291219962.hust@gmail.com',  name: 'Admin Nasun',  role: ROLES.ADMIN  },
  [ROLES.QC]:     { id: 'dev-qc',     email: 'qc@dev.local',     name: 'QC Dev',     role: ROLES.QC     },
  [ROLES.VIEWER]: { id: 'dev-viewer', email: 'viewer@dev.local',  name: 'Viewer Dev', role: ROLES.VIEWER },
};

// ─── Auth Provider ────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(ROLES.ADMIN); // Default to Admin in dev
  const [loading, setLoading] = useState(true);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [emailVerifiedSuccess, setEmailVerifiedSuccess] = useState(false);
  const [authRedirectError, setAuthRedirectError] = useState('');

  // ── Initialize auth ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      
      const isVerified = urlParams.get('verified') === 'true';
      const hasErrorSearch = urlParams.has('error') || urlParams.has('error_description');
      const hasErrorHash = hashParams.has('error') || hashParams.has('error_description');

      let errorMsg = '';
      if (hasErrorSearch) {
        errorMsg = urlParams.get('error_description') || urlParams.get('error') || 'Xác thực email thất bại.';
      } else if (hasErrorHash) {
        errorMsg = hashParams.get('error_description') || hashParams.get('error') || 'Xác thực email thất bại.';
      }

      if (isVerified) {
        setEmailVerifiedSuccess(true);
        // Force logout to let user log in manually
        supabase.auth.signOut().then(() => {
          // Clear query params so refreshing does not trigger this again
          const newUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        });
      } else if (errorMsg) {
        const cleanMsg = decodeURIComponent(errorMsg.replace(/\+/g, ' '));
        setAuthRedirectError(cleanMsg);
        
        // Force logout and clear parameters
        supabase.auth.signOut().then(() => {
          const newUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        });
      }

      // Production: Use Supabase Auth
      supabase.auth.getSession().then(({ data: { session } }) => {
        const currentUrlParams = new URLSearchParams(window.location.search);
        const currentIsVerified = currentUrlParams.get('verified') === 'true';

        if (session && !currentIsVerified) {
          loadUserProfile(session.user);
        } else {
          setLoading(false);
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          const currentUrlParams = new URLSearchParams(window.location.search);
          const currentIsVerified = currentUrlParams.get('verified') === 'true';

          if (session && !currentIsVerified) {
            await loadUserProfile(session.user);
          } else {
            setUser(null);
            setRole(ROLES.VIEWER);
            setLoading(false);
          }
        }
      );
      return () => subscription.unsubscribe();
    } else {
      // Development: use mock user (dropdown role selector in Header)
      setUser(DEV_USERS[ROLES.ADMIN]);
      setRole(ROLES.ADMIN);
      setLoading(false);
    }
  }, []);

  // ── Load user profile + role from Supabase ──────────────────────────────────
  const loadUserProfile = async (authUser) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, avatar_url')
        .eq('id', authUser.id)
        .single();

      let finalRole = profile?.role || ROLES.VIEWER;
      
      // Auto bootstrap admin role for specific user email
      if (authUser.email === 'dat291219962.hust@gmail.com') {
        finalRole = ROLES.ADMIN;
        // Attempt database updates if role in DB is different
        if (!profile || profile.role !== ROLES.ADMIN) {
          try {
            await supabase.from('profiles').upsert({
              id: authUser.id,
              role: ROLES.ADMIN,
              full_name: profile?.full_name || 'Admin Nasun'
            });
          } catch (upsertErr) {
            console.error('[Auth] Failed to update admin profile row:', upsertErr.message);
          }
        }
      } else if (error) {
        throw error;
      }

      setUser({
        id: authUser.id,
        email: authUser.email,
        name: profile?.full_name || authUser.email,
        role: finalRole,
        avatarUrl: profile?.avatar_url || null,
      });
      setRole(finalRole);
    } catch (err) {
      console.error('[Auth] Failed to load user profile:', err.message);
      const isSpecificAdmin = authUser.email === 'dat291219962.hust@gmail.com';
      setUser({ 
        id: authUser.id, 
        email: authUser.email, 
        name: authUser.email, 
        role: isSpecificAdmin ? ROLES.ADMIN : ROLES.VIEWER 
      });
      setRole(isSpecificAdmin ? ROLES.ADMIN : ROLES.VIEWER);
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

    // Also write to Supabase audit_logs if configured
    if (isSupabaseConfigured && supabase) {
      supabase.from('audit_logs').insert({
        type: `SECURITY: ${type}`,
        user_id: user?.id,
        target_id: details?.targetId || null,
        notes: JSON.stringify(details),
        severity: event.severity,
      }).then(({ error }) => {
        if (error) console.error('[Auth] Failed to log security event:', error.message);
      });
    }
  }, [user]);

  // ── Sign out ───────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setRole(ROLES.VIEWER);
  }, []);

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
    authRedirectError,
    setAuthRedirectError,
  };

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
