import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import {
  INITIAL_DISPENSERS,
  INITIAL_MIXERS,
  INITIAL_COMPUTERS,
  INITIAL_PRINTERS,
  INITIAL_SYSTEM_SETS,
} from '../data/mockData.js';
import { cacheOfflineData, getCachedOfflineData, enqueueOfflineAction } from '../lib/offlineSync.js';

/**
 * useAssets – unified hook for all physical equipment:
 * Dispensers, Mixers, Computers, Printers, System Sets.
 * Integrated with offline support, local persistence & action queuing.
 */
export function useAssets() {
  const [dispensers,  setDispensers]  = useState(INITIAL_DISPENSERS);
  const [mixers,      setMixers]      = useState(INITIAL_MIXERS);
  const [computers,   setComputers]   = useState(INITIAL_COMPUTERS);
  const [printers,    setPrinters]    = useState(INITIAL_PRINTERS);
  const [systemSets,  setSystemSets]  = useState(INITIAL_SYSTEM_SETS);
  const [loading, setLoading] = useState(false);

  // Hydrate from IndexedDB cache on mount
  useEffect(() => {
    async function loadCached() {
      const [d, m, c, p, s] = await Promise.all([
        getCachedOfflineData('dispensers', null),
        getCachedOfflineData('mixers', null),
        getCachedOfflineData('computers', null),
        getCachedOfflineData('printers', null),
        getCachedOfflineData('system_sets', null),
      ]);
      if (d && d.length > 0) setDispensers(d);
      if (m && m.length > 0) setMixers(m);
      if (c && c.length > 0) setComputers(c);
      if (p && p.length > 0) setPrinters(p);
      if (s && s.length > 0) setSystemSets(s);
    }
    loadCached();
  }, []);

  // ── Fetch all asset tables ────────────────────────────────────────────────
  const fetchAssets = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const [dRes, mRes, cRes, pRes, sRes] = await Promise.all([
      safeQuery(sb => sb.from('dispensers').select('*').order('created_at', { ascending: false }), 'fetchDispensers'),
      safeQuery(sb => sb.from('mixers').select('*').order('created_at', { ascending: false }), 'fetchMixers'),
      safeQuery(sb => sb.from('computers').select('*').order('created_at', { ascending: false }), 'fetchComputers'),
      safeQuery(sb => sb.from('printers').select('*').order('created_at', { ascending: false }), 'fetchPrinters'),
      safeQuery(sb => sb.from('system_sets').select('*').order('created_at', { ascending: false }), 'fetchSystemSets'),
    ]);
    if (dRes.data && dRes.data.length > 0) {
      const mapped = dRes.data.map(mapDbToDispenser);
      setDispensers(mapped);
      cacheOfflineData('dispensers', mapped);
    }
    if (mRes.data && mRes.data.length > 0) {
      const mapped = mRes.data.map(mapDbToMixer);
      setMixers(mapped);
      cacheOfflineData('mixers', mapped);
    }
    if (cRes.data && cRes.data.length > 0) {
      const mapped = cRes.data.map(mapDbToComputer);
      setComputers(mapped);
      cacheOfflineData('computers', mapped);
    }
    if (pRes.data && pRes.data.length > 0) {
      const mapped = pRes.data.map(mapDbToPrinter);
      setPrinters(mapped);
      cacheOfflineData('printers', mapped);
    }
    if (sRes.data && sRes.data.length > 0) {
      const mapped = sRes.data.map(mapDbToSystemSet);
      setSystemSets(mapped);
      cacheOfflineData('system_sets', mapped);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  // ── Realtime subscriptions for all asset tables ───────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const tables = ['dispensers', 'mixers', 'computers', 'printers', 'system_sets'];
    const channels = tables.map(table =>
      supabase.channel(`${table}-changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => fetchAssets())
        .subscribe()
    );
    return () => channels.forEach(ch => supabase.removeChannel(ch));
  }, [fetchAssets]);

  // ── Generic add stock device ────────────────────────────────────────────────
  const addStockDevice = useCallback(async (category, deviceData) => {
    const tableMap = {
      dispenser: { table: 'dispensers', setter: setDispensers, mapper: mapDbToDispenser, cacheKey: 'dispensers' },
      mixer:     { table: 'mixers',     setter: setMixers,     mapper: mapDbToMixer,     cacheKey: 'mixers' },
      computer:  { table: 'computers',  setter: setComputers,  mapper: mapDbToComputer,  cacheKey: 'computers' },
      printer:   { table: 'printers',   setter: setPrinters,   mapper: mapDbToPrinter,   cacheKey: 'printers' },
    };
    const cfg = tableMap[category];
    if (!cfg) throw new Error(`Unknown category: ${category}`);

    const tempId = deviceData.id || `${category.toUpperCase()}-${Date.now()}`;
    const localDevice = { ...deviceData, id: tempId, isAssigned: false, setCode: null };

    // Update local state immediately for instant feedback
    cfg.setter(prev => {
      const updated = [localDevice, ...prev];
      cacheOfflineData(cfg.cacheKey, updated);
      return updated;
    });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { data, error } = await safeQuery(
          sb => sb.from(cfg.table).insert(deviceData).select().single(),
          `addStockDevice:${category}`
        );
        if (error) throw error;
        if (data) {
          cfg.setter(prev => {
            const updated = prev.map(item => item.id === tempId ? cfg.mapper(data) : item);
            cacheOfflineData(cfg.cacheKey, updated);
            return updated;
          });
        }
      } catch (err) {
        console.warn(`[Offline] Failed online addStockDevice for ${category}. Queueing action.`, err);
        enqueueOfflineAction('ADD_DEVICE', deviceData, cfg.table);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log(`[Offline] Network down. Enqueueing addStockDevice for ${category}.`);
      enqueueOfflineAction('ADD_DEVICE', deviceData, cfg.table);
    }
  }, []);

  // ── Generic edit device ────────────────────────────────────────────────────
  const editDevice = useCallback(async (category, id, updates) => {
    const tableMap = {
      dispensers: { setter: setDispensers, cacheKey: 'dispensers' },
      mixers:     { setter: setMixers,     cacheKey: 'mixers' },
      computers:  { setter: setComputers,  cacheKey: 'computers' },
      printers:   { setter: setPrinters,   cacheKey: 'printers' },
    };

    // Normalize property names for DB (snake_case) vs App (camelCase)
    const dbUpdates = { ...updates, id };
    const appUpdates = { ...updates };

    if ('isAssigned' in updates) dbUpdates.is_assigned = updates.isAssigned;
    if ('setCode' in updates) dbUpdates.set_code = updates.setCode;
    if ('is_assigned' in updates) appUpdates.isAssigned = updates.is_assigned;
    if ('set_code' in updates) appUpdates.setCode = updates.set_code;

    // Update local state immediately
    const cfg = tableMap[category];
    if (cfg) {
      cfg.setter(prev => {
        const updated = prev.map(d => d.id === id ? { ...d, ...appUpdates } : d);
        cacheOfflineData(cfg.cacheKey, updated);
        return updated;
      });
    }

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from(category).update(dbUpdates).eq('id', id),
          `editDevice:${category}`
        );
        if (error) throw error;
      } catch (err) {
        console.warn(`[Offline] Failed online editDevice for ${category}. Queueing action.`, err);
        enqueueOfflineAction('EDIT_DEVICE', dbUpdates, category);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log(`[Offline] Network down. Enqueueing editDevice for ${category}.`);
      enqueueOfflineAction('EDIT_DEVICE', dbUpdates, category);
    }
  }, []);

  // ── Generic delete device ──────────────────────────────────────────────────
  const deleteDevice = useCallback(async (category, id) => {
    const tableMap = {
      dispensers: { setter: setDispensers, cacheKey: 'dispensers' },
      mixers:     { setter: setMixers,     cacheKey: 'mixers' },
      computers:  { setter: setComputers,  cacheKey: 'computers' },
      printers:   { setter: setPrinters,   cacheKey: 'printers' },
    };

    const cfg = tableMap[category];
    if (cfg) {
      cfg.setter(prev => {
        const updated = prev.filter(d => d.id !== id);
        cacheOfflineData(cfg.cacheKey, updated);
        return updated;
      });
    }

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from(category).delete().eq('id', id),
          `deleteDevice:${category}`
        );
        if (error) throw error;
      } catch (err) {
        console.warn(`[Offline] Failed online deleteDevice for ${category}. Queueing.`, err);
        enqueueOfflineAction('DELETE_DEVICE', { id }, category);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log(`[Offline] Network down. Enqueueing deleteDevice for ${category}.`);
      enqueueOfflineAction('DELETE_DEVICE', { id }, category);
    }
  }, []);

  // ── Import bulk devices ─────────────────────────────────────────────────────
  const importDevices = useCallback(async (type, items) => {
    const tableMap = {
      dispenser: { table: 'dispensers', setter: setDispensers, mapper: mapDbToDispenser, cacheKey: 'dispensers' },
      mixer:     { table: 'mixers',     setter: setMixers,     mapper: mapDbToMixer,     cacheKey: 'mixers' },
      computer:  { table: 'computers',  setter: setComputers,  mapper: mapDbToComputer,  cacheKey: 'computers' },
      printer:   { table: 'printers',   setter: setPrinters,   mapper: mapDbToPrinter,   cacheKey: 'printers' },
    };
    const cfg = tableMap[type];
    if (!cfg) throw new Error(`Unknown import type: ${type}`);

    cfg.setter(prev => {
      const updated = [...items, ...prev];
      cacheOfflineData(cfg.cacheKey, updated);
      return updated;
    });

    if (isSupabaseConfigured) {
      if (navigator.onLine) {
        try {
          const { error } = await safeQuery(
            sb => sb.from(cfg.table).insert(items),
            `importDevices:${type}`
          );
          if (error) throw error;
          await fetchAssets();
        } catch (err) {
          items.forEach(item => enqueueOfflineAction('ADD_DEVICE', item, cfg.table));
        }
      } else {
        items.forEach(item => enqueueOfflineAction('ADD_DEVICE', item, cfg.table));
      }
    }
  }, [fetchAssets]);

  // ── Assemble set (Lắp đặt bộ máy) ─────────────────────────────────────────
  const assembleSet = useCallback(async (setData) => {
    setSystemSets(prev => {
      const updated = [setData, ...prev];
      cacheOfflineData('system_sets', updated);
      return updated;
    });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('system_sets').insert(setData),
          'assembleSet'
        );
        if (error) throw error;
        await fetchAssets();
      } catch (err) {
        console.warn('[Offline] Failed online assembleSet. Queueing action.', err);
        enqueueOfflineAction('ASSEMBLE_SET', setData);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing assembleSet.');
      enqueueOfflineAction('ASSEMBLE_SET', setData);
    }
  }, [fetchAssets]);

  // ── Update system set ──────────────────────────────────────────────────────
  const updateSystemSet = useCallback(async (setCode, updates) => {
    setSystemSets(prev => {
      const updated = prev.map(s => s.setCode === setCode ? { ...s, ...updates } : s);
      cacheOfflineData('system_sets', updated);
      return updated;
    });

    const dbUpdates = { ...updates, set_code: setCode };

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('system_sets').update(updates).eq('set_code', setCode),
          'updateSystemSet'
        );
        if (error) throw error;
      } catch (err) {
        console.warn('[Offline] Failed online updateSystemSet. Queueing action.', err);
        enqueueOfflineAction('UPDATE_SYSTEM_SET', dbUpdates);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing updateSystemSet.');
      enqueueOfflineAction('UPDATE_SYSTEM_SET', dbUpdates);
    }
  }, []);

  return {
    dispensers, setDispensers,
    mixers,     setMixers,
    computers,  setComputers,
    printers,   setPrinters,
    systemSets, setSystemSets,
    loading,
    addStockDevice,
    editDevice,
    deleteDevice,
    importDevices,
    assembleSet,
    updateSystemSet,
    refetch: fetchAssets,
  };
}

// ─── Field Mappers (DB → App format) ──────────────────────────────────────────
function mapDbToDispenser(row) {
  return { id: row.id, model: row.model, serial: row.serial, status: row.status, isAssigned: row.is_assigned, setCode: row.set_code };
}
function mapDbToMixer(row) {
  return { id: row.id, model: row.model, type: row.type, serial: row.serial, status: row.status, isAssigned: row.is_assigned, setCode: row.set_code };
}
function mapDbToComputer(row) {
  return { id: row.id, type: row.type, os: row.os, specs: row.specs, serial: row.serial, network: row.network, isAssigned: row.is_assigned, setCode: row.set_code, stabilizer: row.stabilizer || { hasStabilizer: false } };
}
function mapDbToPrinter(row) {
  return { id: row.id, model: row.model, serial: row.serial, connection: row.connection, status: row.status, isAssigned: row.is_assigned, setCode: row.set_code };
}
function mapDbToSystemSet(row) {
  return {
    setCode: row.set_code, nppId: row.npp_id, nppName: row.npp_name, region: row.region, province: row.province,
    status: row.status, dispenserId: row.dispenser_id, dispenserModel: row.dispenser_model, dispenserSerial: row.dispenser_serial,
    mixerId: row.mixer_id, mixerModel: row.mixer_model, mixerSerial: row.mixer_serial,
    computerId: row.computer_id, computerType: row.computer_type, computerSerial: row.computer_serial,
    printerId: row.printer_id, printerSerial: row.printer_serial,
    installDate: row.install_date, lastMaintenanceDate: row.last_maintenance_date, nextMaintenanceDue: row.next_maintenance_due,
    technician: row.technician, notes: row.notes,
  };
}
