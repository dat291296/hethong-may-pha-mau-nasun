import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { INITIAL_TINTING_LOGS } from '../data/mockData.js';
import { cacheOfflineData, getCachedOfflineData } from '../lib/offlineSync.js';

export function useTintingLogs() {
  const [tintingLogs, setTintingLogs] = useState(INITIAL_TINTING_LOGS);
  const [loading, setLoading] = useState(false);

  // Hydrate cache from IndexedDB on mount
  useEffect(() => {
    async function loadCached() {
      const cached = await getCachedOfflineData('tinting_logs', null);
      if (cached && cached.length > 0) {
        setTintingLogs(cached);
      }
    }
    loadCached();
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error } = await safeQuery(
      sb => sb.from('tinting_logs').select('*').order('timestamp', { ascending: false }),
      'fetchLogs'
    );
    if (error) {
      const cached = await getCachedOfflineData('tinting_logs', null);
      if (cached) setTintingLogs(cached);
    } else if (data && data.length > 0) {
      const mapped = data.map(mapDbToLog);
      setTintingLogs(mapped);
      cacheOfflineData('tinting_logs', mapped);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Realtime subscription
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const channel = supabase
      .channel('tinting-log-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tinting_logs' }, () => fetchLogs())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchLogs]);

  const addLog = useCallback(async (logData) => {
    const tempId = logData.id || `LOG-TEMP-${Date.now()}`;
    const localLog = { ...logData, id: tempId };
    const dbPayload = mapLogToDb(localLog);

    // Update local state immediately
    setTintingLogs(prev => {
      const updated = [localLog, ...prev];
      cacheOfflineData('tinting_logs', updated);
      return updated;
    });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await supabase.from('tinting_logs').insert(dbPayload);
        if (error) throw error;
      } catch (err) {
        console.warn('[Offline] Failed online addLog.', err);
      }
    }

    return localLog;
  }, []);

  return {
    tintingLogs,
    setTintingLogs,
    loading,
    addLog,
    refetch: fetchLogs
  };
}

function mapDbToLog(row) {
  return {
    id:                 row.id,
    timestamp:          row.timestamp,
    nppId:              row.npp_id,
    nppName:            row.npp_name,
    setCode:            row.set_code,
    dispenserSerial:    row.dispenser_serial,
    colorCode:          row.color_code,
    productLine:        row.product_line,
    base:               row.base,
    containerSize:      row.container_size,
    quantity:           row.quantity,
    totalVolumeLiters:  parseFloat(row.total_volume_liters) || 0,
    pigmentUsedMl:      parseFloat(row.pigment_used_ml) || 0,
    operator:           row.operator,
    status:             row.status || 'HOÀN THÀNH'
  };
}

function mapLogToDb(l) {
  return {
    id:                 l.id,
    timestamp:          l.timestamp,
    npp_id:             l.nppId,
    npp_name:           l.nppName || '',
    set_code:           l.setCode || '',
    dispenser_serial:   l.dispenserSerial || '',
    color_code:         l.colorCode,
    product_line:       l.productLine || '',
    base:               l.base || '',
    container_size:     l.containerSize || '',
    quantity:           l.quantity || 1,
    total_volume_liters: l.totalVolumeLiters || 0,
    pigment_used_ml:     l.pigmentUsedMl || 0,
    operator:           l.operator || 'KTV',
    status:             l.status || 'HOÀN THÀNH'
  };
}
