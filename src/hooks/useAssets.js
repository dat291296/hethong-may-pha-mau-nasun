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
function getInitialAssets(key, fallback) {
  try {
    const raw = localStorage.getItem(`nasun_${key}`) || localStorage.getItem(`cached_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (key === 'computers') {
          return parsed.map(c => {
            let cleanType = c.type;
            if (!cleanType || cleanType === 'AIO' || String(cleanType).includes('Lắc') || cleanType !== 'Case') {
              cleanType = 'All In One';
            }
            return { ...c, type: cleanType };
          });
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn(`Failed to parse ${key} from storage`, e);
  }
  return fallback;
}

function persistAssetsLocal(key, data) {
  try {
    localStorage.setItem(`nasun_${key}`, JSON.stringify(data));
  } catch (e) {
    console.warn(`Failed to save nasun_${key} to localStorage`, e);
  }
  cacheOfflineData(key, data);
}

/**
 * useAssets – unified hook for all physical equipment:
 * Dispensers, Mixers, Computers, Printers, System Sets.
 * Integrated with offline support, local persistence & action queuing.
 */
export function useAssets() {
  const [dispensers,  setDispensers]  = useState(() => getInitialAssets('dispensers', INITIAL_DISPENSERS));
  const [mixers,      setMixers]      = useState(() => getInitialAssets('mixers', INITIAL_MIXERS));
  const [computers,   setComputers]   = useState(() => getInitialAssets('computers', INITIAL_COMPUTERS));
  const [printers,    setPrinters]    = useState(() => getInitialAssets('printers', INITIAL_PRINTERS));
  const [systemSets,  setSystemSets]  = useState(() => getInitialAssets('system_sets', INITIAL_SYSTEM_SETS));
  const [loading, setLoading] = useState(false);

  // Hydrate from IndexedDB cache on mount if available
  useEffect(() => {
    async function loadCached() {
      const [d, m, c, p, s] = await Promise.all([
        getCachedOfflineData('dispensers', null),
        getCachedOfflineData('mixers', null),
        getCachedOfflineData('computers', null),
        getCachedOfflineData('printers', null),
        getCachedOfflineData('system_sets', null),
      ]);
      if (d && d.length > 0) { setDispensers(d); persistAssetsLocal('dispensers', d); }
      if (m && m.length > 0) { setMixers(m); persistAssetsLocal('mixers', m); }
      if (c && c.length > 0) { setComputers(c); persistAssetsLocal('computers', c); }
      if (p && p.length > 0) { setPrinters(p); persistAssetsLocal('printers', p); }
      if (s && s.length > 0) { setSystemSets(s); persistAssetsLocal('system_sets', s); }
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
      dispensers: { setter: setDispensers, cacheKey: 'dispensers', table: 'dispensers', singular: 'dispenser' },
      mixers:     { setter: setMixers,     cacheKey: 'mixers',     table: 'mixers',     singular: 'mixer' },
      computers:  { setter: setComputers,  cacheKey: 'computers',  table: 'computers',  singular: 'computer' },
      printers:   { setter: setPrinters,   cacheKey: 'printers',   table: 'printers',   singular: 'printer' },
      dispenser:  { setter: setDispensers, cacheKey: 'dispensers', table: 'dispensers', singular: 'dispenser' },
      mixer:      { setter: setMixers,     cacheKey: 'mixers',     table: 'mixers',     singular: 'mixer' },
      computer:   { setter: setComputers,  cacheKey: 'computers',  table: 'computers',  singular: 'computer' },
      printer:    { setter: setPrinters,   cacheKey: 'printers',   table: 'printers',   singular: 'printer' },
    };

    const cfg = tableMap[category];
    const targetTable = cfg ? cfg.table : category;
    const singularCat = cfg ? cfg.singular : category;

    const dbUpdates = mapDeviceToDb({ ...updates, id }, singularCat);
    const appUpdates = { ...updates };

    if ('is_assigned' in updates) appUpdates.isAssigned = updates.is_assigned;
    if ('set_code' in updates) appUpdates.setCode = updates.set_code;

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
          sb => sb.from(targetTable).update(dbUpdates).eq('id', id),
          `editDevice:${targetTable}`
        );
        if (error) throw error;
      } catch (err) {
        console.warn(`[Offline] Failed online editDevice for ${targetTable}. Queueing action.`, err);
        enqueueOfflineAction('EDIT_DEVICE', dbUpdates, targetTable);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log(`[Offline] Network down. Enqueueing editDevice for ${targetTable}.`);
      enqueueOfflineAction('EDIT_DEVICE', dbUpdates, targetTable);
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
        console.warn(`[Offline] Failed online deleteDevice for ${category}. Queueing action.`, err);
        enqueueOfflineAction('DELETE_DEVICE', { id }, category);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log(`[Offline] Network down. Enqueueing deleteDevice for ${category}.`);
      enqueueOfflineAction('DELETE_DEVICE', { id }, category);
    }
  }, []);

  // ── Batch Import Devices from Excel ────────────────────────────────────────
  const importDevices = useCallback(async (type, items) => {
    const tableMap = {
      dispensers: { table: 'dispensers', setter: setDispensers, mapper: mapDbToDispenser, cacheKey: 'dispensers' },
      mixers:     { table: 'mixers',     setter: setMixers,     mapper: mapDbToMixer,     cacheKey: 'mixers' },
      computers:  { table: 'computers',  setter: setComputers,  mapper: mapDbToComputer,  cacheKey: 'computers' },
      printers:   { table: 'printers',   setter: setPrinters,   mapper: mapDbToPrinter,   cacheKey: 'printers' },
      dispenser:  { table: 'dispensers', setter: setDispensers, mapper: mapDbToDispenser, cacheKey: 'dispensers' },
      mixer:      { table: 'mixers',     setter: setMixers,     mapper: mapDbToMixer,     cacheKey: 'mixers' },
      computer:   { table: 'computers',  setter: setComputers,  mapper: mapDbToComputer,  cacheKey: 'computers' },
      printer:    { table: 'printers',   setter: setPrinters,   mapper: mapDbToPrinter,   cacheKey: 'printers' },
    };
    const cfg = tableMap[type];
    if (!cfg) throw new Error(`Unknown import type: ${type}`);

    const nowIso = new Date().toISOString();
    const markedItems = items.map(item => ({ ...item, createdAt: nowIso, isNew: true }));

    cfg.setter(prev => {
      const updated = [...markedItems, ...prev];
      persistAssetsLocal(cfg.cacheKey, updated);
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
      persistAssetsLocal('system_sets', updated);
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
  const updateSystemSet = useCallback(async (oldSetCode, updates) => {
    const newSetCode = (updates.setCode || updates.set_code || oldSetCode).trim();
    const isCodeChanged = newSetCode !== oldSetCode;

    setSystemSets(prev => {
      const updated = prev.map(s => (s.setCode === oldSetCode || s.set_code === oldSetCode) ? { ...s, ...updates, setCode: newSetCode, set_code: newSetCode } : s);
      persistAssetsLocal('system_sets', updated);
      return updated;
    });

    if (isCodeChanged) {
      const syncDeviceSetCode = (setter, key) => {
        setter(prev => {
          const updated = prev.map(d => (d.setCode === oldSetCode || d.set_code === oldSetCode) ? { ...d, setCode: newSetCode, set_code: newSetCode } : d);
          persistAssetsLocal(key, updated);
          return updated;
        });
      };
      syncDeviceSetCode(setDispensers, 'dispensers');
      syncDeviceSetCode(setMixers, 'mixers');
      syncDeviceSetCode(setComputers, 'computers');
      syncDeviceSetCode(setPrinters, 'printers');
    }

    const dbPayload = mapSystemSetToDb({ ...updates, set_code: newSetCode, setCode: newSetCode });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('system_sets').update(dbPayload).eq('set_code', oldSetCode),
          'updateSystemSet'
        );
        if (error) throw error;

        if (isCodeChanged) {
          await safeQuery(sb => sb.from('dispensers').update({ set_code: newSetCode }).eq('set_code', oldSetCode), 'updateDeviceSetCode');
          await safeQuery(sb => sb.from('mixers').update({ set_code: newSetCode }).eq('set_code', oldSetCode), 'updateDeviceSetCode');
          await safeQuery(sb => sb.from('computers').update({ set_code: newSetCode }).eq('set_code', oldSetCode), 'updateDeviceSetCode');
          await safeQuery(sb => sb.from('printers').update({ set_code: newSetCode }).eq('set_code', oldSetCode), 'updateDeviceSetCode');
        }
        await fetchAssets();
      } catch (err) {
        console.warn('[Offline] Failed online updateSystemSet. Queueing action.', err);
        enqueueOfflineAction('UPDATE_SYSTEM_SET', { oldSetCode, newSetCode, dbPayload });
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing updateSystemSet.');
      enqueueOfflineAction('UPDATE_SYSTEM_SET', { oldSetCode, newSetCode, dbPayload });
    }
  }, [fetchAssets]);

  // ── Delete system set ──────────────────────────────────────────────────────
  const deleteSystemSet = useCallback(async (setCode) => {
    let setObj = null;
    setSystemSets(prev => {
      setObj = prev.find(s => s.setCode === setCode);
      const filtered = prev.filter(s => s.setCode !== setCode);
      persistAssetsLocal('system_sets', filtered);
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
  return { 
    id: row.id, 
    model: row.model, 
    serial: row.serial, 
    status: row.status, 
    isAssigned: row.is_assigned, 
    setCode: row.set_code,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    isNew: row.isNew,
    isUpdated: row.isUpdated
  };
}
function mapDbToMixer(row) {
  return { 
    id: row.id, 
    model: row.model, 
    type: row.type, 
    serial: row.serial, 
    status: row.status, 
    isAssigned: row.is_assigned, 
    setCode: row.set_code,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    isNew: row.isNew,
    isUpdated: row.isUpdated
  };
}
function mapDbToComputer(row) {
  let cleanType = row.type;
  if (!cleanType || cleanType === 'AIO' || String(cleanType).includes('Lắc') || cleanType !== 'Case') {
    cleanType = 'All In One';
  }
  return { 
    id: row.id, 
    type: cleanType, 
    os: row.os, 
    specs: row.specs, 
    serial: row.serial || '—', 
    status: row.status || 'Mới 100%',
    network: row.network, 
    isAssigned: row.is_assigned, 
    setCode: row.set_code, 
    stabilizer: row.stabilizer || { hasStabilizer: false },
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    isNew: row.isNew,
    isUpdated: row.isUpdated
  };
}
function mapDbToPrinter(row) {
  return { 
    id: row.id, 
    model: row.model, 
    serial: row.serial, 
    connection: row.connection, 
    status: row.status, 
    isAssigned: row.is_assigned, 
    setCode: row.set_code,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    isNew: row.isNew,
    isUpdated: row.isUpdated
  };
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
function mapDeviceToDb(obj, category) {
  const dbObj = {};
  const cat = (category || '').toLowerCase();

  // Basic identification & PK
  if (obj.id !== undefined) dbObj.id = obj.id;
  if (obj.serial !== undefined && obj.serial !== '') dbObj.serial = obj.serial;

  // Assignment status & system set link
  if (obj.isAssigned !== undefined || obj.is_assigned !== undefined) {
    dbObj.is_assigned = Boolean(obj.isAssigned ?? obj.is_assigned);
  }
  if (obj.setCode !== undefined || obj.set_code !== undefined) {
    dbObj.set_code = obj.setCode ?? obj.set_code ?? null;
  }

  // Category specific allowed fields (STRICT SCHEMA SANITIZATION)
  if (cat === 'computer' || cat === 'computers') {
    if (obj.type !== undefined) dbObj.type = obj.type;
    if (obj.os !== undefined) dbObj.os = obj.os;
    if (obj.specs !== undefined) dbObj.specs = obj.specs;
    if (obj.network !== undefined) dbObj.network = obj.network;
    if (obj.status !== undefined) dbObj.status = obj.status;
    if (obj.stabilizer !== undefined) dbObj.stabilizer = obj.stabilizer;
  } else if (cat === 'dispenser' || cat === 'dispensers') {
    if (obj.model !== undefined) dbObj.model = obj.model;
    if (obj.status !== undefined) dbObj.status = obj.status;
  } else if (cat === 'mixer' || cat === 'mixers') {
    if (obj.model !== undefined) dbObj.model = obj.model;
    if (obj.type !== undefined) dbObj.type = obj.type;
    if (obj.status !== undefined) dbObj.status = obj.status;
  } else if (cat === 'printer' || cat === 'printers') {
    if (obj.model !== undefined) dbObj.model = obj.model;
    if (obj.connection !== undefined) dbObj.connection = obj.connection;
    if (obj.status !== undefined) dbObj.status = obj.status;
  } else {
    // Fallback if category not specified: copy valid properties, delete camelCase
    for (const k in obj) {
      dbObj[k] = obj[k];
    }
    if (obj.isAssigned !== undefined) dbObj.is_assigned = obj.isAssigned;
    if (obj.setCode !== undefined) dbObj.set_code = obj.setCode;
    delete dbObj.isAssigned;
    delete dbObj.setCode;
    delete dbObj.hasStabilizer;
    delete dbObj.stabilizerBrand;
  }

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

  if (obj.setCode || obj.set_code) dbObj.set_code = obj.setCode || obj.set_code;
  if ('nppId' in obj || 'npp_id' in obj) dbObj.npp_id = obj.nppId ?? obj.npp_id ?? null;
  if ('nppName' in obj || 'npp_name' in obj) dbObj.npp_name = obj.nppName ?? obj.npp_name ?? '';
  if ('region' in obj) dbObj.region = obj.region ?? '';
  if ('province' in obj) dbObj.province = obj.province ?? '';
  if ('status' in obj) dbObj.status = obj.status;

  if ('dispenserId' in obj || 'dispenser_id' in obj) dbObj.dispenser_id = obj.dispenserId ?? obj.dispenser_id ?? null;
  if ('dispenserModel' in obj || 'dispenser_model' in obj) dbObj.dispenser_model = obj.dispenserModel ?? obj.dispenser_model ?? '';
  if ('dispenserSerial' in obj || 'dispenser_serial' in obj) dbObj.dispenser_serial = obj.dispenserSerial ?? obj.dispenser_serial ?? '';

  if ('mixerId' in obj || 'mixer_id' in obj) dbObj.mixer_id = obj.mixerId ?? obj.mixer_id ?? null;
  if ('mixerModel' in obj || 'mixer_model' in obj) dbObj.mixer_model = obj.mixerModel ?? obj.mixer_model ?? '';
  if ('mixerSerial' in obj || 'mixer_serial' in obj) dbObj.mixer_serial = obj.mixerSerial ?? obj.mixer_serial ?? '';

  if ('computerId' in obj || 'computer_id' in obj) dbObj.computer_id = obj.computerId ?? obj.computer_id ?? null;
  if ('computerType' in obj || 'computer_type' in obj || 'pcType' in obj) dbObj.computer_type = obj.computerType ?? obj.computer_type ?? obj.pcType ?? '';
  if ('computerSerial' in obj || 'computer_serial' in obj || 'pcSerial' in obj) dbObj.computer_serial = obj.computerSerial ?? obj.computer_serial ?? obj.pcSerial ?? '';

  if ('printerId' in obj || 'printer_id' in obj) dbObj.printer_id = obj.printerId ?? obj.printer_id ?? null;
  if ('printerSerial' in obj || 'printer_serial' in obj) dbObj.printer_serial = obj.printerSerial ?? obj.printer_serial ?? '';

  if ('tintingSoftware' in obj || 'tinting_software' in obj) dbObj.tinting_software = obj.tintingSoftware ?? obj.tinting_software ?? '';
  if ('softwareVersion' in obj || 'software_version' in obj) dbObj.software_version = obj.softwareVersion ?? obj.software_version ?? '';
  if ('agentStatus' in obj || 'agent_status' in obj) dbObj.agent_status = obj.agentStatus ?? obj.agent_status ?? 'Offline';

  if ('installDate' in obj || 'installedDate' in obj || 'install_date' in obj) dbObj.install_date = obj.installDate ?? obj.installedDate ?? obj.install_date ?? null;
  if ('lastMaintenanceDate' in obj || 'last_maintenance_date' in obj) dbObj.last_maintenance_date = obj.lastMaintenanceDate ?? obj.last_maintenance_date ?? null;
  if ('nextMaintenanceDue' in obj || 'next_maintenance_due' in obj) dbObj.next_maintenance_due = obj.nextMaintenanceDue ?? obj.next_maintenance_due ?? null;

  if ('technician' in obj) dbObj.technician = obj.technician ?? '';
  if ('salesperson' in obj || 'sales_person' in obj) dbObj.salesperson = obj.salesperson ?? obj.sales_person ?? '';
  if ('stabilizer' in obj) dbObj.stabilizer = obj.stabilizer ?? '';
  if ('notes' in obj) dbObj.notes = obj.notes ?? '';
  if ('installationPhotos' in obj || 'installation_photos' in obj) dbObj.installation_photos = obj.installationPhotos ?? obj.installation_photos ?? [];

  return dbObj;
}

export function generateNextSetCode(systemSets = []) {
  const currentYear = new Date().getFullYear();
  let maxSeq = 0;

  systemSets.forEach(s => {
    const code = s.setCode || s.set_code || '';
    const match = code.match(/SET(?:-\d+)?-(\d+)/i) || code.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });

  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `SET-${currentYear}-${nextSeq}`;
}
