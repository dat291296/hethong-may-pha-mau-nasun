import { createRefreshScheduler } from '../../../shared/data-access/refreshScheduler.js';
import { getOfflineOwner } from '../../../shared/sync/offlineDb.js';
import { fetchAllRows } from '../../../shared/data-access/paginatedQuery.js';
import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../../../shared/data-access/supabase.js';
import { INITIAL_AUDIT_LOGS } from '../../../shared/data/mockData.js';
import { cacheOfflineData, getCachedOfflineData, enqueueOfflineAction } from '../../../shared/sync/offlineSync.js';

function canRetryOffline(error) {
  return !error?.code || error.code === 'QUERY_TIMEOUT';
}

function createPersistenceError(message) {
  const error = new Error(message);
  error.code = 'PERSISTENCE_DENIED';
  return error;
}

async function createAuditLogRpc(payload) {
  const { data, error } = await supabase.rpc('create_audit_log', { p_payload: payload });
  if (error) throw error;
  return data;
}

function sanitizeAndRenumberAuditLogs(logs) {
  if (!Array.isArray(logs)) return [];
  if (logs.length === 0) return [];

  // Preserve every stored business record, including historical timestamps.
  const baseLogs = [...logs];

  // Sort by timestamp descending without changing persistent identifiers.
  baseLogs.sort((a, b) => {
    const timeA = a.timestamp || '';
    const timeB = b.timestamp || '';
    return timeB.localeCompare(timeA);
  });

  // IDs are persistent database keys and must never be renumbered after reload.
  return baseLogs;
}

function getInitialAuditLogs() {
  return sanitizeAndRenumberAuditLogs(INITIAL_AUDIT_LOGS);
}

function persistAuditLogs(logs) {
  cacheOfflineData('audit_logs', logs);
}

export function useAuditLogs() {
  const [auditLogs, setAuditLogs] = useState(getInitialAuditLogs);
  const [loading, setLoading] = useState(false);

  // Hydrate cache from IndexedDB on mount if localStorage is empty
  useEffect(() => {
    async function loadCached() {
      if (navigator.onLine) return;
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
    const requestOwner = getOfflineOwner();
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error } = await fetchAllRows(
      sb => sb.from('audit_logs').select('id,type,timestamp,set_code,npp_id,npp_name,serial_list,technician,reason,notes,severity', { count: 'exact' }).order('timestamp', { ascending: false }).order('id'),
      safeQuery, 'fetchAuditLogs', { key: 'id' }
    );
    if (requestOwner !== getOfflineOwner()) return false;
    let cacheSaved = false;
    if (error) {
      const cached = await getCachedOfflineData('audit_logs', null);
      if (cached && cached.length > 0) {
        const cleaned = sanitizeAndRenumberAuditLogs(cached);
        setAuditLogs(cleaned);
      }
    } else if (Array.isArray(data)) {
      const mapped = data.map(mapDbToAudit);
      const cleaned = sanitizeAndRenumberAuditLogs(mapped);
      setAuditLogs(cleaned);
      cacheSaved = await cacheOfflineData('audit_logs', cleaned);
    }
    setLoading(false);
    return cacheSaved;
  }, []);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Coalesce bursts and keep at most one realtime refresh in flight.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const scheduler = createRefreshScheduler(fetchAuditLogs);
    const channel = supabase.channel('audit_logs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, scheduler.schedule)
      .subscribe();
    return () => { scheduler.dispose(); supabase.removeChannel(channel); };
  }, [fetchAuditLogs]);

  const addAuditLog = useCallback(async (logData) => {
    const timestamp = logData.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 16);
    const stableId = logData.id || `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    let finalLog = null;

    // Update local state immediately while preserving a stable database ID.
    setAuditLogs(prev => {
      const newLog = {
        ...logData,
        id: stableId,
        timestamp
      };
      const combined = [newLog, ...prev];
      combined.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      finalLog = newLog;
      persistAuditLogs(combined);
      return combined;
    });

    const dbPayload = mapAuditToDb(finalLog || { ...logData, timestamp, id: stableId });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        await createAuditLogRpc(dbPayload);
        await fetchAuditLogs();
      } catch (err) {
        console.warn('[Offline] Failed online addAuditLog. Queueing.', err);
        enqueueOfflineAction('ADD_AUDIT_LOG', dbPayload);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing addAuditLog.');
      enqueueOfflineAction('ADD_AUDIT_LOG', dbPayload);
    }

    return finalLog || { ...logData, timestamp };
  }, [fetchAuditLogs]);

  const editAuditLog = useCallback(async () => { throw new Error('Nhật ký tác nghiệp chỉ đọc, không được sửa.'); }, []);
  const deleteAuditLog = useCallback(async () => { throw new Error('Nhật ký tác nghiệp chỉ đọc, không được xóa.'); }, []);

  const importAuditLogs = useCallback(async (items) => {
    const dbItems = items.map(mapAuditToDb).filter(item => item.id && item.type);
    if (dbItems.length !== items.length) throw new Error('Every imported audit log must include an ID and type');

    setAuditLogs(prev => {
      const merged = new Map(prev.map(item => [item.id, item]));
      items.forEach(item => { if (!merged.has(item.id)) merged.set(item.id, item); });
      const updated = sanitizeAndRenumberAuditLogs(Array.from(merged.values()));
      persistAuditLogs(updated);
      return updated;
    });

    if (!isSupabaseConfigured || !navigator.onLine) return;
    await Promise.all(dbItems.map(createAuditLogRpc));
    await fetchAuditLogs();
  }, [fetchAuditLogs]);

  return {
    auditLogs,
    setAuditLogs,
    loading,
    addAuditLog,
    editAuditLog,
    deleteAuditLog,
    importAuditLogs,
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
  if (log.timestamp) {
    const parsedTimestamp = new Date(log.timestamp);
    if (!Number.isNaN(parsedTimestamp.getTime())) payload.timestamp = parsedTimestamp.toISOString();
  }
  if (log.id) {
    payload.id = log.id;
  }
  return payload;
}
