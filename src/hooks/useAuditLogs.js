import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { INITIAL_AUDIT_LOGS } from '../data/mockData.js';

export function useAuditLogs() {
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);
  const [loading, setLoading] = useState(false);

  const fetchAuditLogs = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error } = await safeQuery(
      sb => sb.from('audit_logs').select('*').order('timestamp', { ascending: false }),
      'fetchAuditLogs'
    );
    if (data) {
      setAuditLogs(data.map(mapDbToAudit));
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
    if (isSupabaseConfigured) {
      const { data, error } = await safeQuery(
        sb => sb.from('audit_logs').insert(mapAuditToDb(logData)).select().single(),
        'addAuditLog'
      );
      if (error) throw new Error(error.message);
      setAuditLogs(prev => [mapDbToAudit(data), ...prev]);
      return mapDbToAudit(data);
    } else {
      const newLog = {
        ...logData,
        id: logData.id || `AUDIT-00${auditLogs.length + 1}`,
        timestamp: logData.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 16)
      };
      setAuditLogs(prev => [newLog, ...prev]);
      return newLog;
    }
  }, [auditLogs.length]);

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
