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

export function useAuditLogs({ enabled = true } = {}) {
  const [auditLogs, setAuditLogs] = useState(getInitialAuditLogs);
  const [loading, setLoading] = useState(false);
  const [cacheHydrated, setCacheHydrated] = useState(false);

  // Hydrate cache from IndexedDB on mount if localStorage is empty
  useEffect(() => {
    let disposed = false;
    const owner = getOfflineOwner();
    async function loadCached() {
      try {
        const cached = await getCachedOfflineData('audit_logs', null);
        if (!disposed && owner === getOfflineOwner() && Array.isArray(cached)) setAuditLogs(sanitizeAndRenumberAuditLogs(cached));
      } catch {
        console.warn('[fetchAuditLogs] Local snapshot unavailable.');
      } finally {
        if (!disposed && owner === getOfflineOwner()) setCacheHydrated(true);
      }
    }
    void loadCached();
    return () => { disposed = true; };
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    const requestOwner = getOfflineOwner();
    if (!isSupabaseConfigured || !navigator.onLine) return false;
    setLoading(true);
    const { data, error } = await fetchAllRows(
      sb => sb.from('audit_logs').select('id,type,timestamp,set_code,npp_id,npp_name,serial_list,technician,reason,notes,severity').order('timestamp', { ascending: false }).order('id'),
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
    if (cacheHydrated && enabled) fetchAuditLogs();
  }, [cacheHydrated, enabled, fetchAuditLogs]);

  const addAuditLog = useCallback(async (logData) => {
    const owner = getOfflineOwner();
    const timestamp = logData.timestamp || new Date().toISOString();
    const stableId = logData.id || 'AUDIT-' + crypto.randomUUID();
    const entry = { ...logData, id: stableId, timestamp };
    // A check-in is acknowledged locally only after its durable outbox commit.
    if (isSupabaseConfigured) await enqueueOfflineAction('ADD_AUDIT_LOG', mapAuditToDb(entry));
    if (owner !== getOfflineOwner()) throw Object.assign(new Error('OFFLINE_OWNER_CHANGED'), { code: 'OFFLINE_OWNER_CHANGED' });
    setAuditLogs(previous => {
      const next = sanitizeAndRenumberAuditLogs([entry, ...previous.filter(item => item.id !== stableId)]);
      persistAuditLogs(next);
      return next;
    });
    return { ...entry, queued: isSupabaseConfigured };
  }, []);

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
