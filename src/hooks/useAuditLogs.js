import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { INITIAL_AUDIT_LOGS } from '../data/mockData.js';
import { cacheOfflineData, getCachedOfflineData, enqueueOfflineAction } from '../lib/offlineSync.js';

const LOCAL_STORAGE_KEY = 'nasun_audit_logs';

function sanitizeAndRenumberAuditLogs(logs) {
  if (!Array.isArray(logs) || logs.length === 0) return INITIAL_AUDIT_LOGS;

  // 1. Remove legacy sample audits 001 to 004
  const legacyTimestamps = ['2025-08-15 10:00', '2025-08-01 14:30', '2025-02-10 16:00', '2026-05-20 09:15'];
  const filtered = logs.filter(log => {
    if (legacyTimestamps.includes(log.timestamp)) return false;
    if (log.setCode === 'SET-2024-001' && log.reason?.includes('NPP độc quyền Hà Nội')) return false;
    if (log.setCode === 'SET-2024-002' && log.reason?.includes('đại lý Cầu Giấy')) return false;
    if (log.setCode === 'SET-2023-005' && log.reason?.includes('NPP ngưng hợp tác')) return false;
    if (log.setCode === 'SET-2024-004' && log.reason?.includes('vệ sinh cụm pít-tông')) return false;
    return true;
  });

  const baseLogs = filtered.length > 0 ? filtered : INITIAL_AUDIT_LOGS;

  // 2. Sort by timestamp descending (hiển thị audit gần nhất trên đầu)
  baseLogs.sort((a, b) => {
    const timeA = a.timestamp || '';
    const timeB = b.timestamp || '';
    return timeB.localeCompare(timeA);
  });

  // 3. Renumber from AUDIT-001 sequentially to the end
  return baseLogs.map((log, index) => ({
    ...log,
    id: `AUDIT-${String(index + 1).padStart(3, '0')}`
  }));
}

function getInitialAuditLogs() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = sanitizeAndRenumberAuditLogs(parsed);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleaned));
        return cleaned;
      }
    }
  } catch (e) {
    console.warn('Failed to parse audit logs from localStorage', e);
  }
  return sanitizeAndRenumberAuditLogs(INITIAL_AUDIT_LOGS);
}

function persistAuditLogs(logs) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    console.warn('Failed to save audit logs to localStorage', e);
  }
  cacheOfflineData('audit_logs', logs);
}

export function useAuditLogs() {
  const [auditLogs, setAuditLogs] = useState(getInitialAuditLogs);
  const [loading, setLoading] = useState(false);

  // Hydrate cache from IndexedDB on mount if localStorage is empty
  useEffect(() => {
    async function loadCached() {
      const stored = getInitialAuditLogs();
      if (stored && stored.length > 0) {
        setAuditLogs(stored);
        return;
      }
      const cached = await getCachedOfflineData('audit_logs', null);
      if (cached && cached.length > 0) {
        const cleaned = sanitizeAndRenumberAuditLogs(cached);
        setAuditLogs(cleaned);
        persistAuditLogs(cleaned);
      } else {
        persistAuditLogs(INITIAL_AUDIT_LOGS);
      }
    }
    loadCached();
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error } = await safeQuery(
      sb => sb.from('audit_logs').select('*').order('timestamp', { ascending: false }),
      'fetchAuditLogs'
    );
    if (error) {
      const cached = await getCachedOfflineData('audit_logs', null);
      if (cached && cached.length > 0) {
        const cleaned = sanitizeAndRenumberAuditLogs(cached);
        setAuditLogs(cleaned);
      }
    } else if (data && data.length > 0) {
      const mapped = data.map(mapDbToAudit);
      const cleaned = sanitizeAndRenumberAuditLogs(mapped);
      setAuditLogs(cleaned);
      persistAuditLogs(cleaned);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Realtime subscription
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const channel = supabase
      .channel('audit-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => fetchAuditLogs())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchAuditLogs]);

  const addAuditLog = useCallback(async (logData) => {
    const timestamp = logData.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 16);
    let finalLog = null;

    // Update local state immediately, sort nearest on top, and renumber
    setAuditLogs(prev => {
      const newLog = {
        ...logData,
        id: 'TEMP',
        timestamp
      };
      const combined = [newLog, ...prev];
      combined.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      const renumbered = combined.map((item, idx) => ({
        ...item,
        id: `AUDIT-${String(idx + 1).padStart(3, '0')}`
      }));
      finalLog = renumbered[0];
      persistAuditLogs(renumbered);
      return renumbered;
    });

    const dbPayload = mapAuditToDb(finalLog || { ...logData, timestamp, id: `AUDIT-${Date.now()}` });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('audit_logs').insert(dbPayload),
          'addAuditLog'
        );
        if (error) throw error;
        await fetchAuditLogs();
      } catch (err) {
        console.warn('[Offline] Failed online addAuditLog. Queueing.', err);
        enqueueOfflineAction('ADD_AUDIT_LOG', dbPayload);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing addAuditLog.');
      enqueueOfflineAction('ADD_AUDIT_LOG', dbPayload);
    }

    return localLog;
  }, [fetchAuditLogs]);

  const editAuditLog = useCallback(async (id, updates) => {
    let currentItem = null;
    setAuditLogs(prev => {
      const updated = prev.map(item => {
        if (item.id === id) {
          currentItem = { ...item, ...updates };
          return currentItem;
        }
        return item;
      });
      persistAuditLogs(updated);
      return updated;
    });

    const dbPayload = mapAuditToDb({ id, ...(currentItem || updates) });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { data: updatedRows, error } = await safeQuery(
          sb => sb.from('audit_logs').update(dbPayload).eq('id', id).select(),
          'editAuditLog'
        );
        if (error) throw error;

        if (!updatedRows || updatedRows.length === 0) {
          await safeQuery(
            sb => sb.from('audit_logs').upsert(dbPayload),
            'upsertAuditLog'
          );
        }
      } catch (err) {
        console.warn('[Offline] Failed online editAuditLog. Queueing.', err);
        enqueueOfflineAction('UPDATE_AUDIT_LOG', { id, ...dbPayload });
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      enqueueOfflineAction('UPDATE_AUDIT_LOG', { id, ...dbPayload });
    }
  }, []);

  const deleteAuditLog = useCallback(async (id) => {
    setAuditLogs(prev => {
      const updated = prev.filter(item => item.id !== id);
      persistAuditLogs(updated);
      return updated;
    });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('audit_logs').delete().eq('id', id),
          'deleteAuditLog'
        );
        if (error) throw error;
      } catch (err) {
        console.warn('[Offline] Failed online deleteAuditLog. Queueing.', err);
        enqueueOfflineAction('DELETE_AUDIT_LOG', { id });
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      enqueueOfflineAction('DELETE_AUDIT_LOG', { id });
    }
  }, []);

  return {
    auditLogs,
    setAuditLogs,
    loading,
    addAuditLog,
    editAuditLog,
    deleteAuditLog,
    refetch: fetchAuditLogs
  };
}

function mapDbToAudit(row) {
  return {
    id:          row.id,
    type:        row.type,
    timestamp:   row.timestamp ? new Date(row.timestamp).toISOString().replace('T', ' ').substring(0, 16) : '',
    setCode:    row.set_code,
    nppId:      row.npp_id,
    nppName:    row.npp_name,
    serialList: row.serial_list,
    technician: row.technician,
    reason:      row.reason,
    notes:       row.notes,
    severity:    row.severity || 'INFO',
  };
}

function mapAuditToDb(log) {
  const payload = {
    type:        log.type,
    set_code:    log.setCode || '—',
    npp_id:      log.nppId || '—',
    npp_name:    log.nppName || '',
    serial_list: log.serialList || '',
    technician: log.technician || '',
    reason:      log.reason || '',
    notes:       log.notes || '',
    severity:    log.severity || 'INFO',
  };
  if (log.id) {
    payload.id = log.id;
  }
  return payload;
}
