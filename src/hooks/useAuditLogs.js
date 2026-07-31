import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { INITIAL_AUDIT_LOGS } from '../data/mockData.js';
import { cacheOfflineData, getCachedOfflineData, enqueueOfflineAction } from '../lib/offlineSync.js';

export function useAuditLogs() {
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);
  const [loading, setLoading] = useState(false);

  // Hydrate cache from IndexedDB on mount
  useEffect(() => {
    async function loadCached() {
      const cached = await getCachedOfflineData('audit_logs', null);
      if (cached && cached.length > 0) {
        setAuditLogs(cached);
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
      if (cached) setAuditLogs(cached);
    } else if (data && data.length > 0) {
      const mapped = data.map(mapDbToAudit);
      setAuditLogs(mapped);
      cacheOfflineData('audit_logs', mapped);
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, () => fetchAuditLogs())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchAuditLogs]);

  const addAuditLog = useCallback(async (logData) => {
    const tempId = logData.id || `AUDIT-TEMP-${Date.now()}`;
    const localLog = {
      ...logData,
      id: tempId,
      timestamp: logData.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 16)
    };
    const dbPayload = mapAuditToDb(localLog);

    // Update local state immediately
    setAuditLogs(prev => {
      const updated = [localLog, ...prev];
      cacheOfflineData('audit_logs', updated);
      return updated;
    });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { data, error } = await safeQuery(
          sb => sb.from('audit_logs').insert(dbPayload).select().single(),
          'addAuditLog'
        );
        if (error) throw error;
        if (data) {
          setAuditLogs(prev => {
            const updated = prev.map(item => item.id === tempId ? mapDbToAudit(data) : item);
            cacheOfflineData('audit_logs', updated);
            return updated;
          });
        }
      } catch (err) {
        console.warn('[Offline] Failed online addAuditLog. Queueing.', err);
        enqueueOfflineAction('ADD_AUDIT_LOG', dbPayload);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing addAuditLog.');
      enqueueOfflineAction('ADD_AUDIT_LOG', dbPayload);
    }

    return localLog;
  }, []);

  return {
    auditLogs,
    setAuditLogs,
    loading,
    addAuditLog,
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
  return {
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
}
