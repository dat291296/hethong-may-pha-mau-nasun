import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { cacheOfflineData, getCachedOfflineData } from '../lib/offlineSync.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * useLockedMonths – Custom hook for monthly closing logic (locked_months table).
 * Allows checking, locking, and unlocking months, with offline cache support.
 */
export function useLockedMonths() {
  const { user } = useAuth();
  const [lockedMonths, setLockedMonths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load cache on mount
  useEffect(() => {
    async function loadCached() {
      const cached = await getCachedOfflineData('locked_months', null);
      if (cached && cached.length > 0) {
        setLockedMonths(cached);
      }
    }
    loadCached();
  }, []);

  // Fetch locked months from Supabase
  const fetchLockedMonths = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await safeQuery(
      sb => sb.from('locked_months').select('*').order('month_key', { ascending: false }),
      'fetchLockedMonths'
    );
    if (err) {
      setError(err.message);
      const cached = await getCachedOfflineData('locked_months', null);
      if (cached) setLockedMonths(cached);
    } else if (data) {
      setLockedMonths(data);
      cacheOfflineData('locked_months', data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLockedMonths();
  }, [fetchLockedMonths]);

  // Real-time updates subscription
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const channel = supabase
      .channel('locked-months-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locked_months' }, () => fetchLockedMonths())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchLockedMonths]);

  // Lock a month
  const lockMonth = useCallback(async (monthKey, reason = '') => {
    if (!monthKey) return;
    setError(null);

    const newLock = {
      month_key: monthKey,
      locked_by: user?.id || null,
      locked_at: new Date().toISOString(),
      reason: reason
    };

    // Optimistic local update
    setLockedMonths(prev => {
      const updated = [newLock, ...prev].sort((a, b) => b.month_key.localeCompare(a.month_key));
      cacheOfflineData('locked_months', updated);
      return updated;
    });

    if (isSupabaseConfigured) {
      const { error: err } = await safeQuery(
        sb => sb.from('locked_months').insert(newLock),
        'lockMonth'
      );
      if (err) {
        setError(err.message);
        fetchLockedMonths(); // rollback
        throw err;
      }
    }
  }, [user, fetchLockedMonths]);

  // Unlock a month
  const unlockMonth = useCallback(async (monthKey) => {
    if (!monthKey) return;
    setError(null);

    // Optimistic local update
    setLockedMonths(prev => {
      const updated = prev.filter(m => m.month_key !== monthKey);
      cacheOfflineData('locked_months', updated);
      return updated;
    });

    if (isSupabaseConfigured) {
      const { error: err } = await safeQuery(
        sb => sb.from('locked_months').delete().eq('month_key', monthKey),
        'unlockMonth'
      );
      if (err) {
        setError(err.message);
        fetchLockedMonths(); // rollback
        throw err;
      }
    }
  }, [fetchLockedMonths]);

  // Client-side helper: Check if date belongs to a locked month
  const isDateLocked = useCallback((dateStr) => {
    if (!dateStr) return false;
    // Extract YYYY-MM directly from string if format is YYYY-MM-DD
    let monthKey = '';
    if (/^\d{4}-\d{2}/.test(dateStr)) {
      monthKey = dateStr.substring(0, 7);
    } else {
      const dateObj = new Date(dateStr);
      if (isNaN(dateObj.getTime())) return false;
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      monthKey = `${year}-${month}`;
    }
    
    return lockedMonths.some(m => m.month_key === monthKey);
  }, [lockedMonths]);

  return {
    lockedMonths,
    loading,
    error,
    lockMonth,
    unlockMonth,
    isDateLocked,
    refetch: fetchLockedMonths
  };
}
