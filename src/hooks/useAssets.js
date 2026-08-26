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
      safeQuery(sb => sb.from('dispensers').select('*'), 'fetchDispensers'),
      safeQuery(sb => sb.from('mixers').select('*'), 'fetchMixers'),
      safeQuery(sb => sb.from('computers').select('*'), 'fetchComputers'),
      safeQuery(sb => sb.from('printers').select('*'), 'fetchPrinters'),
      safeQuery(sb => sb.from('system_sets').select('*'), 'fetchSystemSets'),
    ]);

    if (dRes.data && dRes.data.length > 0) {
      const mapped = dRes.data.map(mapDbToDispenser);
      setDispensers(mapped);
      cacheOfflineData('dispensers', mapped);
    } else if (dRes.error) {
      const cached = await getCachedOfflineData('dispensers', null);
      if (cached && cached.length > 0) setDispensers(cached);
    }

    if (mRes.data && mRes.data.length > 0) {
      const mapped = mRes.data.map(mapDbToMixer);
      setMixers(mapped);
      cacheOfflineData('mixers', mapped);
    } else if (mRes.error) {
      const cached = await getCachedOfflineData('mixers', null);
      if (cached && cached.length > 0) setMixers(cached);
    }

    if (cRes.data && cRes.data.length > 0) {
      const mapped = cRes.data.map(mapDbToComputer);
      setComputers(mapped);
      cacheOfflineData('computers', mapped);
    } else if (cRes.error) {
      const cached = await getCachedOfflineData('computers', null);
      if (cached && cached.length > 0) setComputers(cached);
    }

    if (pRes.data && pRes.data.length > 0) {
      const mapped = pRes.data.map(mapDbToPrinter);
      setPrinters(mapped);
      cacheOfflineData('printers', mapped);
    } else if (pRes.error) {
      const cached = await getCachedOfflineData('printers', null);
      if (cached && cached.length > 0) setPrinters(cached);
    }

    if (sRes.data && sRes.data.length > 0) {
      const mapped = sRes.data.map(mapDbToSystemSet);
      setSystemSets(mapped);
      cacheOfflineData('system_sets', mapped);
    } else if (sRes.error) {
      const cached = await getCachedOfflineData('system_sets', null);
      if (cached && cached.length > 0) setSystemSets(cached);
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
    const dbPayload = sanitizeDeviceForDb(category, deviceData, tempId);
    const localDevice = cfg.mapper(dbPayload);

    // Update local state immediately for instant feedback
    cfg.setter(prev => {
      const updated = [localDevice, ...prev];
      cacheOfflineData(cfg.cacheKey, updated);
      return updated;
    });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from(cfg.table).insert(dbPayload),
          `addStockDevice:${category}`
        );
        if (error) throw error;
        await fetchAssets();
      } catch (err) {
        console.warn(`[Offline] Failed online addStockDevice for ${category}. Queueing action.`, err);
        enqueueOfflineAction('ADD_DEVICE', dbPayload, cfg.table);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log(`[Offline] Network down. Enqueueing addStockDevice for ${category}.`);
      enqueueOfflineAction('ADD_DEVICE', dbPayload, cfg.table);
    }
  }, [fetchAssets]);

  // ── Generic edit device ────────────────────────────────────────────────────
  const editDevice = useCallback(async (category, id, updates) => {
    const tableMap = {
      dispensers: { setter: setDispensers, cacheKey: 'dispensers' },
      mixers:     { setter: setMixers,     cacheKey: 'mixers' },
      computers:  { setter: setComputers,  cacheKey: 'computers' },
      printers:   { setter: setPrinters,   cacheKey: 'printers' },
    };

    const dbUpdates = mapDeviceToDb({ ...updates, id });
    const appUpdates = { ...updates };

    if ('is_assigned' in updates) appUpdates.isAssigned = updates.is_assigned;
    if ('set_code' in updates) appUpdates.setCode = updates.set_code;

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
      const dbItems = items.map(mapDeviceToDb);
      if (navigator.onLine) {
        try {
          const { error } = await safeQuery(
            sb => sb.from(cfg.table).insert(dbItems),
            `importDevices:${type}`
          );
          if (error) throw error;
          await fetchAssets();
        } catch (err) {
          dbItems.forEach(item => enqueueOfflineAction('ADD_DEVICE', item, cfg.table));
        }
      } else {
        dbItems.forEach(item => enqueueOfflineAction('ADD_DEVICE', item, cfg.table));
      }
    }
  }, [fetchAssets]);

  // ── Assemble new system set ────────────────────────────────────────────────
  const assembleSet = useCallback(async (newSet) => {
    const setCode = newSet.setCode || newSet.set_code;
    const dbPayload = mapSystemSetToDb({ ...newSet, setCode });
    const appSetData = mapDbToSystemSet(dbPayload);

    setSystemSets(prev => {
      const updated = [appSetData, ...prev];
      cacheOfflineData('system_sets', updated);
      return updated;
    });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('system_sets').insert(dbPayload),
          'assembleSet'
        );
        if (error) throw error;
        await fetchAssets();
      } catch (err) {
        console.warn('[Offline] Failed online assembleSet. Queueing action.', err);
        enqueueOfflineAction('ASSEMBLE_SET', dbPayload);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing assembleSet.');
      enqueueOfflineAction('ASSEMBLE_SET', dbPayload);
    }
  }, [fetchAssets]);

  // ── Update system set ──────────────────────────────────────────────────────
  const updateSystemSet = useCallback(async (setCode, updates) => {
    setSystemSets(prev => {
      const updated = prev.map(s => s.setCode === setCode ? { ...s, ...updates } : s);
      cacheOfflineData('system_sets', updated);
      return updated;
    });

    const dbPayload = mapSystemSetToDb({ ...updates, setCode });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('system_sets').update(dbPayload).eq('set_code', setCode),
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

  // ── Delete system set ──────────────────────────────────────────────────────
  const deleteSystemSet = useCallback(async (setCode) => {
    let setObj = null;
    setSystemSets(prev => {
      setObj = prev.find(s => s.setCode === setCode);
      const filtered = prev.filter(s => s.setCode !== setCode);
      cacheOfflineData('system_sets', filtered);
      return filtered;
    });

    if (setObj) {
      if (setObj.dispenserId) {
        editDevice('dispensers', setObj.dispenserId, { is_assigned: false, set_code: null });
      }
      if (setObj.mixerId) {
        editDevice('mixers', setObj.mixerId, { is_assigned: false, set_code: null });
      }
      if (setObj.computerId) {
        editDevice('computers', setObj.computerId, { is_assigned: false, set_code: null });
      }
      if (setObj.printerId) {
        editDevice('printers', setObj.printerId, { is_assigned: false, set_code: null });
      }
    }

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('system_sets').delete().eq('set_code', setCode),
          'deleteSystemSet'
        );
        if (error) throw error;
      } catch (err) {
        console.warn('[Offline] Failed online deleteSystemSet. Queueing action.', err);
        enqueueOfflineAction('DELETE_SYSTEM_SET', { set_code: setCode });
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      enqueueOfflineAction('DELETE_SYSTEM_SET', { set_code: setCode });
    }
  }, [editDevice]);

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
    deleteSystemSet,
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
    computerId: row.computer_id, computerType: row.computer_type, computerSerial: row.computer_serial, pcType: row.computer_type, pcSerial: row.computer_serial,
    printerId: row.printer_id, printerSerial: row.printer_serial, printerModel: 'QL700',
    installDate: row.install_date, lastMaintenanceDate: row.last_maintenance_date, nextMaintenanceDue: row.next_maintenance_due,
    technician: row.technician, salesperson: row.salesperson || row.sales_person || '', notes: row.notes,
  };
}

// ─── App → DB Field Mappers (Clean snake_case for Supabase) ────────────────────
function mapDeviceToDb(obj) {
  const dbObj = {};
  const mapping = {
    isAssigned: 'is_assigned',
    setCode: 'set_code',
    hasStabilizer: 'has_stabilizer',
    stabilizerBrand: 'stabilizer_brand',
    is_assigned: 'is_assigned',
    set_code: 'set_code'
  };
  for (const k in obj) {
    if (mapping[k]) {
      dbObj[mapping[k]] = obj[k];
    } else {
      dbObj[k] = obj[k];
    }
  }
  delete dbObj.isAssigned;
  delete dbObj.setCode;
  delete dbObj.hasStabilizer;
  delete dbObj.stabilizerBrand;
  return dbObj;
}

function sanitizeDeviceForDb(category, data, tempId) {
  const base = {
    id: data.id || tempId,
    serial: data.serial || 'N/A',
    status: data.status || 'Mới 100%',
    is_assigned: Boolean(data.isAssigned || data.is_assigned),
    set_code: data.setCode || data.set_code || null
  };

  if (category === 'dispenser') {
    return {
      ...base,
      model: data.model || 'Satint'
    };
  }

  if (category === 'mixer') {
    return {
      ...base,
      model: data.model || 'Satint ST-50',
      type: data.type || 'Lắc xoay khép kín'
    };
  }

  if (category === 'computer') {
    return {
      ...base,
      type: data.type || 'AIO',
      os: data.os || 'Windows 11 Pro',
      specs: data.specs || 'Core i5',
      network: data.network || 'Có mạng LAN'
    };
  }

  if (category === 'printer') {
    return {
      ...base,
      model: data.model || 'QL700',
      connection: data.connection || 'USB'
    };
  }

  return base;
}

function mapSystemSetToDb(obj) {
  const dbObj = {};
  const mapping = {
    setCode: 'set_code',
    set_code: 'set_code',
    nppId: 'npp_id',
    npp_id: 'npp_id',
    nppName: 'npp_name',
    npp_name: 'npp_name',
    region: 'region',
    province: 'province',
    status: 'status',
    dispenserId: 'dispenser_id',
    dispenser_id: 'dispenser_id',
    dispenserModel: 'dispenser_model',
    dispenser_model: 'dispenser_model',
    dispenserSerial: 'dispenser_serial',
    dispenser_serial: 'dispenser_serial',
    mixerId: 'mixer_id',
    mixer_id: 'mixer_id',
    mixerModel: 'mixer_model',
    mixer_model: 'mixer_model',
    mixerSerial: 'mixer_serial',
    mixer_serial: 'mixer_serial',
    computerId: 'computer_id',
    computer_id: 'computer_id',
    computerType: 'computer_type',
    computer_type: 'computer_type',
    computerSerial: 'computer_serial',
    computer_serial: 'computer_serial',
    printerId: 'printer_id',
    printer_id: 'printer_id',
    printerSerial: 'printer_serial',
    printer_serial: 'printer_serial',
    printerModel: 'printer_model',
    printer_model: 'printer_model',
    stabilizer: 'stabilizer',
    installDate: 'install_date',
    installedDate: 'install_date',
    install_date: 'install_date',
    lastMaintenanceDate: 'last_maintenance_date',
    last_maintenance_date: 'last_maintenance_date',
    nextMaintenanceDue: 'next_maintenance_due',
    next_maintenance_due: 'next_maintenance_due',
    technician: 'technician',
    salesperson: 'salesperson',
    sales_person: 'salesperson',
    notes: 'notes',
    tintingSoftware: 'tinting_software',
    tinting_software: 'tinting_software',
    softwareVersion: 'software_version',
    software_version: 'software_version',
    agentStatus: 'agent_status',
    agent_status: 'agent_status',
    installationPhotos: 'installation_photos',
    installation_photos: 'installation_photos'
  };

  for (const k in obj) {
    if (mapping[k]) {
      dbObj[mapping[k]] = obj[k];
    } else {
      dbObj[k] = obj[k];
    }
  }

  delete dbObj.setCode;
  delete dbObj.nppId;
  delete dbObj.nppName;
  delete dbObj.dispenserId;
  delete dbObj.dispenserModel;
  delete dbObj.dispenserSerial;
  delete dbObj.mixerId;
  delete dbObj.mixerModel;
  delete dbObj.mixerSerial;
  delete dbObj.computerId;
  delete dbObj.computerType;
  delete dbObj.computerSerial;
  delete dbObj.printerId;
  delete dbObj.printerModel;
  delete dbObj.printer_model;
  delete dbObj.printerSerial;
  delete dbObj.installDate;
  delete dbObj.installedDate;
  delete dbObj.lastMaintenanceDate;
  delete dbObj.nextMaintenanceDue;
  delete dbObj.tintingSoftware;
  delete dbObj.softwareVersion;
  delete dbObj.agentStatus;
  delete dbObj.installationPhotos;

  return dbObj;
}
