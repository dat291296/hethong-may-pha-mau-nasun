import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import {
  INITIAL_DISPENSERS,
  INITIAL_MIXERS,
  INITIAL_COMPUTERS,
  INITIAL_PRINTERS,
  INITIAL_SYSTEM_SETS,
} from '../data/mockData.js';

/**
 * useAssets – unified hook for all physical equipment:
 * Dispensers, Mixers, Computers, Printers, System Sets.
 */
export function useAssets() {
  const [dispensers,  setDispensers]  = useState(INITIAL_DISPENSERS);
  const [mixers,      setMixers]      = useState(INITIAL_MIXERS);
  const [computers,   setComputers]   = useState(INITIAL_COMPUTERS);
  const [printers,    setPrinters]    = useState(INITIAL_PRINTERS);
  const [systemSets,  setSystemSets]  = useState(INITIAL_SYSTEM_SETS);
  const [loading, setLoading] = useState(false);

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
    if (dRes.data) setDispensers(dRes.data.map(mapDbToDispenser));
    if (mRes.data) setMixers(mRes.data.map(mapDbToMixer));
    if (cRes.data) setComputers(cRes.data.map(mapDbToComputer));
    if (pRes.data) setPrinters(pRes.data.map(mapDbToPrinter));
    if (sRes.data) setSystemSets(sRes.data.map(mapDbToSystemSet));
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
      dispenser: { table: 'dispensers', setter: setDispensers, mapper: mapDbToDispenser },
      mixer:     { table: 'mixers',     setter: setMixers,     mapper: mapDbToMixer     },
      computer:  { table: 'computers',  setter: setComputers,  mapper: mapDbToComputer  },
      printer:   { table: 'printers',   setter: setPrinters,   mapper: mapDbToPrinter   },
    };
    const cfg = tableMap[category];
    if (!cfg) throw new Error(`Unknown category: ${category}`);

    if (isSupabaseConfigured) {
      const { data, error } = await safeQuery(
        sb => sb.from(cfg.table).insert(deviceData).select().single(),
        `addStockDevice:${category}`
      );
      if (error) throw new Error(error.message);
      cfg.setter(prev => [cfg.mapper(data), ...prev]);
    } else {
      const newDevice = { ...deviceData, id: `${category.toUpperCase()}-${Date.now()}`, isAssigned: false, setCode: null };
      cfg.setter(prev => [newDevice, ...prev]);
    }
  }, []);

  // ── Generic edit device ────────────────────────────────────────────────────
  const editDevice = useCallback(async (category, id, updates) => {
    const tableMap = {
      dispensers: setDispensers,
      mixers:     setMixers,
      computers:  setComputers,
      printers:   setPrinters,
    };
    if (isSupabaseConfigured) {
      const { error } = await safeQuery(
        sb => sb.from(category).update(updates).eq('id', id),
        `editDevice:${category}`
      );
      if (error) throw new Error(error.message);
    }
    const setter = tableMap[category];
    if (setter) setter(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  // ── Generic delete device ──────────────────────────────────────────────────
  const deleteDevice = useCallback(async (category, id) => {
    const tableMap = {
      dispensers: setDispensers,
      mixers:     setMixers,
      computers:  setComputers,
      printers:   setPrinters,
    };
    if (isSupabaseConfigured) {
      const { error } = await safeQuery(
        sb => sb.from(category).delete().eq('id', id),
        `deleteDevice:${category}`
      );
      if (error) throw new Error(error.message);
    }
    const setter = tableMap[category];
    if (setter) setter(prev => prev.filter(d => d.id !== id));
  }, []);

  // ── Import bulk devices ─────────────────────────────────────────────────────
  const importDevices = useCallback(async (type, items) => {
    const tableMap = {
      dispenser: { table: 'dispensers', setter: setDispensers, mapper: mapDbToDispenser },
      mixer:     { table: 'mixers',     setter: setMixers,     mapper: mapDbToMixer     },
      computer:  { table: 'computers',  setter: setComputers,  mapper: mapDbToComputer  },
      printer:   { table: 'printers',   setter: setPrinters,   mapper: mapDbToPrinter   },
    };
    const cfg = tableMap[type];
    if (!cfg) throw new Error(`Unknown import type: ${type}`);

    if (isSupabaseConfigured) {
      const { error } = await safeQuery(
        sb => sb.from(cfg.table).insert(items),
        `importDevices:${type}`
      );
      if (error) throw new Error(error.message);
      await fetchAssets();
    } else {
      cfg.setter(prev => [...items, ...prev]);
    }
  }, [fetchAssets]);

  // ── Assemble set (Lắp đặt bộ máy) ─────────────────────────────────────────
  const assembleSet = useCallback(async (setData) => {
    if (isSupabaseConfigured) {
      const { error } = await safeQuery(
        sb => sb.from('system_sets').insert(setData),
        'assembleSet'
      );
      if (error) throw new Error(error.message);
      await fetchAssets();
    } else {
      setSystemSets(prev => [setData, ...prev]);
    }
  }, [fetchAssets]);

  // ── Update system set ──────────────────────────────────────────────────────
  const updateSystemSet = useCallback(async (setCode, updates) => {
    if (isSupabaseConfigured) {
      const { error } = await safeQuery(
        sb => sb.from('system_sets').update(updates).eq('set_code', setCode),
        'updateSystemSet'
      );
      if (error) throw new Error(error.message);
    }
    setSystemSets(prev => prev.map(s => s.setCode === setCode ? { ...s, ...updates } : s));
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
