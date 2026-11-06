import { optimisticRemoval } from '../../../shared/data-access/optimisticRemoval.js';
import { recordDataLoadMetric } from '../../../shared/diagnostics/performanceMetrics.js';
import { getOfflineOwner } from '../../../shared/sync/offlineDb.js';
import {normalizeDateFields} from '../../../shared/utils/dateUtils.js';
import {saveEquipmentReplacement,resolveEquipmentSlot,replacementCandidates,equipmentFields,EQUIPMENT_SLOTS} from '../lib/equipmentReplacement.js';
import {normalizeDeviceType} from '../lib/deviceType.js';
import {saveSystemSetEdit} from '../lib/systemSetEdit.js';
import { recordOperationalError } from '../../../shared/diagnostics/operationalDiagnostics.js';
import { userErrorMessage } from '../../../shared/security/userError.js';
import { saveDeviceEdit } from '../lib/deviceEdit.js';
import { requireCompleteWrite } from '../../../shared/data-access/guardedWrite.js';
import { ASSET_TABLES, DEVICE_TABLES, assetColumns, assetCacheKey, cachedAssetSnapshot, createAssetRefreshQueue, createAssetReadBarrier } from '../lib/assetQuery.js';
import { fetchAllRows } from '../../../shared/data-access/paginatedQuery.js';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { persistMutation, persistBatchMutation } from '../../../shared/data-access/durableMutation.js';
import { createOperationId } from '../../../shared/sync/syncQueue.js';
import { supabase, isSupabaseConfigured, safeQuery } from '../../../shared/data-access/supabase.js';
import {
  INITIAL_DISPENSERS,
  INITIAL_MIXERS,
  INITIAL_COMPUTERS,
  INITIAL_PRINTERS,
  INITIAL_SYSTEM_SETS,
} from '../../../shared/data/mockData.js';
import { cacheOfflineData, getCachedOfflineData, enqueueOfflineAction, getOfflineQueue } from '../../../shared/sync/offlineSync.js';

/**
 * useAssets – unified hook for all physical equipment:
 * Dispensers, Mixers, Computers, Printers, System Sets.
 * Integrated with offline support, local persistence & action queuing.
 */
function getInitialAssets(key, fallback) {
  return isSupabaseConfigured ? [] : fallback;
}

function persistAssetsLocal(key, data) {
  return cacheOfflineData(key, data);
}

function isPendingAssetAction(item) {
  return ['ADD_DEVICE', 'EDIT_DEVICE', 'DELETE_DEVICE', 'ASSEMBLE_SET', 'UPDATE_SYSTEM_SET', 'DELETE_SYSTEM_SET', 'EXECUTE_WORKFLOW'].includes(item.action);
}

function canRetryOffline(error) {
  return !error?.code || error.code === 'QUERY_TIMEOUT';
}

function createPersistenceError(message) {
  const error = new Error(message);
  error.code = 'PERSISTENCE_DENIED';
  return error;
}

async function writeDeviceStrict(table, payload, mode = 'insert') {
  const result = await safeQuery(
    sb => mode === 'upsert'
      ? sb.from(table).upsert(payload, { onConflict: 'id' }).select('id')
      : sb.from(table).insert(payload).select('id'),
    `${mode}Device:${table}`
  );
  requireCompleteWrite(result);
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
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState('');
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [detailsReady, setDetailsReady] = useState(!isSupabaseConfigured);
  const [summaryReady, setSummaryReady] = useState(!isSupabaseConfigured);
  const [systemSetsReady, setSystemSetsReady] = useState(!isSupabaseConfigured);
  const detailsRequestedRef = useRef(false);
  const fullTablesRef = useRef(new Set());
  const loadErrorsRef = useRef(new Map());
  const readyTablesRef = useRef(new Set());
  const refreshQueueRef = useRef(null);
  const hydrationRef = useRef(null);
  if (!hydrationRef.current) {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    hydrationRef.current = { promise, resolve };
  }

  const deviceConfigs = useMemo(() => {
    const definitions = [
      ['dispenser', 'dispensers', setDispensers, mapDbToDispenser],
      ['mixer', 'mixers', setMixers, mapDbToMixer],
      ['computer', 'computers', setComputers, mapDbToComputer],
      ['printer', 'printers', setPrinters, mapDbToPrinter],
    ];
    return Object.fromEntries(definitions.flatMap(([singular, table, setter, mapper]) => {
      const config = { singular, table, setter, mapper, cacheKey: table };
      return [[singular, config], [table, config]];
    }));
  }, []);
  const assetStateRef = useRef(null);
  assetStateRef.current = { dispensers, mixers, computers, printers, system_sets: systemSets };
  const removalPendingRef = useRef(false);
  const readBarrierRef = useRef(null);
  if (!readBarrierRef.current) readBarrierRef.current = createAssetReadBarrier();
  const withAssetWrite = useCallback(async action => {
    const finish = readBarrierRef.current.begin();
    try { return await action(); } finally { finish(); }
  }, []);
  const updateRows = useCallback((table, updater) => {
    const next = updater(assetStateRef.current[table]);
    assetStateRef.current = { ...assetStateRef.current, [table]: next };
    const setters = { dispensers: setDispensers, mixers: setMixers, computers: setComputers, printers: setPrinters, system_sets: setSystemSets };
    setters[table](next);
    return next;
  }, []);

  // Hydrate from IndexedDB cache on mount if available
  useEffect(() => {
    async function loadCached() {
      try {
        const setters = { dispensers: setDispensers, mixers: setMixers, computers: setComputers, printers: setPrinters, system_sets: setSystemSets };
        for (const table of ASSET_TABLES) {
          const full = await getCachedOfflineData(table, null);
          const summary = await getCachedOfflineData(assetCacheKey(table, false), null);
          const { rows, details } = cachedAssetSnapshot(full, summary);
          if (Array.isArray(rows)) {
            setters[table](rows);
            readyTablesRef.current.add(table);
            if (details) fullTablesRef.current.add(table);
          }
        }
        setSummaryReady(!isSupabaseConfigured || ASSET_TABLES.every(table => readyTablesRef.current.has(table)));
        setSystemSetsReady(!isSupabaseConfigured || readyTablesRef.current.has('system_sets'));
        const complete = ASSET_TABLES.every(table => fullTablesRef.current.has(table));
        setDetailsReady(!isSupabaseConfigured || complete);
        if (complete) detailsRequestedRef.current = true;
      } catch (error) {
        recordOperationalError('runtime', error);
        setLoadError('Chưa đọc được dữ liệu máy đã lưu trên thiết bị. Không có dữ liệu nào bị xóa.');
      } finally {
        setCacheHydrated(true);
        setLoading(false);
        hydrationRef.current.resolve();
      }
    }
    loadCached();
  }, []);

  // ── Fetch all asset tables ────────────────────────────────────────────────
  const performFetchAssets = useCallback(async (tables) => {
    const requestOwner = getOfflineOwner();
    const readEpoch = readBarrierRef.current.capture();
    if (!readBarrierRef.current.canCommit(readEpoch)) return false;
    const startedAt = performance.now();
    const details = detailsRequestedRef.current;
    if (!isSupabaseConfigured) return;
    setLoading(true);
    try {
      const pendingQueue = await getOfflineQueue();
      if (requestOwner !== getOfflineOwner()) return false;
      if (pendingQueue.some(isPendingAssetAction)) {
        console.info('[useAssets] Keeping local asset cache while changes are waiting to sync.');
        const complete = ASSET_TABLES.every(table => fullTablesRef.current.has(table));
        if (details && !complete) setLoadError('Có thay đổi đang chờ đồng bộ. Đồng bộ xong rồi tải lại chi tiết; bản lưu đầy đủ được giữ nguyên.');
        return !details || complete;
      }
      const definitions = [
        ['dispensers', mapDbToDispenser, setDispensers, 'id'],
        ['mixers', mapDbToMixer, setMixers, 'id'],
        ['computers', mapDbToComputer, setComputers, 'id'],
        ['printers', mapDbToPrinter, setPrinters, 'id'],
        ['system_sets', mapDbToSystemSet, setSystemSets, 'set_code'],
      ].filter(([table]) => tables.includes(table));
      const sources = await Promise.all(definitions.map(async ([table, mapper, setter, key]) => [
        await fetchAllRows(sb => sb.from(table).select(assetColumns(table, details)).order(key), safeQuery, `fetchAssets:${table}`, { key }),
        table, mapper, setter,
      ]));
      if (requestOwner !== getOfflineOwner() || !readBarrierRef.current.canCommit(readEpoch)) return false;
      const cacheWrites = [];
      for (const [result, key, mapper, setter] of sources) {
        if (Array.isArray(result.data)) {
          loadErrorsRef.current.delete(key);
          const mapped = result.data.map(mapper);
          setter(mapped);
          readyTablesRef.current.add(key);
          if (details) fullTablesRef.current.add(key);
          else fullTablesRef.current.delete(key);
          cacheWrites.push((async () => {
            if (details && !await persistAssetsLocal(key, mapped)) return false;
            return persistAssetsLocal(assetCacheKey(key, false), details ? { fullSnapshot: true } : { fullSnapshot: false, rows: mapped });
          })());
        } else {
          loadErrorsRef.current.set(key, userErrorMessage(result.error, 'Chưa tải đủ dữ liệu bộ máy. Bản lưu trên thiết bị được giữ; kiểm tra kết nối và thử lại.'));
          const full = await getCachedOfflineData(key, null);
          const summary = await getCachedOfflineData(assetCacheKey(key, false), null);
          const snapshot = cachedAssetSnapshot(full, summary);
          const cached = snapshot.rows;
          if (requestOwner !== getOfflineOwner() || !readBarrierRef.current.canCommit(readEpoch)) return false;
          if (Array.isArray(cached)) {
            setter(cached);
            readyTablesRef.current.add(key);
            if (snapshot.details) fullTablesRef.current.add(key);
            else fullTablesRef.current.delete(key);
          }
        }
      }

      setSummaryReady(ASSET_TABLES.every(table => readyTablesRef.current.has(table)));
      setSystemSetsReady(readyTablesRef.current.has('system_sets'));
      setDetailsReady(ASSET_TABLES.every(table => fullTablesRef.current.has(table)));
      const saved = (await Promise.all(cacheWrites)).every(Boolean);
      const failed = sources.filter(([result]) => result.error || !Array.isArray(result.data));
      if (saved) loadErrorsRef.current.delete('cache');
      else loadErrorsRef.current.set('cache', 'Đã tải dữ liệu bộ máy nhưng chưa lưu được bản ngoại tuyến trên thiết bị.');
      setLoadError([...new Set(loadErrorsRef.current.values())].join(' '));
      if (failed.length) return false;
      return saved;
    } catch (error) {
      recordOperationalError('runtime', error);
      if (requestOwner === getOfflineOwner()) setLoadError(userErrorMessage(error, 'Chưa tải được dữ liệu bộ máy. Dữ liệu đã lưu trên thiết bị được giữ nguyên.'));
      return false;
    } finally {
      if (requestOwner === getOfflineOwner()) recordDataLoadMetric(performance.now() - startedAt);
      setLoading(false);
    }
  }, []);

  if (!refreshQueueRef.current) refreshQueueRef.current = createAssetRefreshQueue(performFetchAssets);
  const fetchAssets = useCallback(tables => refreshQueueRef.current(tables), []);

  const ensureDetails = useCallback(async () => {
    detailsRequestedRef.current = true;
    await hydrationRef.current.promise;
    if (!isSupabaseConfigured) return true;
    if (!navigator.onLine && !ASSET_TABLES.every(table => fullTablesRef.current.has(table))) {
      setLoadError('Thiết bị chưa lưu đủ chi tiết ngoại tuyến. Kết nối mạng và tải lại trước khi chỉnh sửa hoặc sao lưu.');
      return false;
    }
    if (ASSET_TABLES.every(table => fullTablesRef.current.has(table))) return true;
    await fetchAssets();
    return ASSET_TABLES.every(table => fullTablesRef.current.has(table));
  }, [fetchAssets]);

  useEffect(() => {
    if (!cacheHydrated || detailsRequestedRef.current) return;
    if (!navigator.onLine) {
      if (!ASSET_TABLES.every(table => readyTablesRef.current.has(table))) setLoadError('Thiết bị chưa lưu đủ dữ liệu tổng quan ngoại tuyến. Kết nối mạng để tải dữ liệu.');
      return;
    }
    let cancelled = false;
    let idleHandle;
    let timer;
    // Render machine summaries before requesting the lightweight inventory index.
    void fetchAssets(['system_sets']).then(() => {
      if (cancelled || detailsRequestedRef.current) return;
      const loadInventory = () => { if (!cancelled) void fetchAssets(DEVICE_TABLES); };
      if (window.requestIdleCallback) idleHandle = window.requestIdleCallback(loadInventory, { timeout: 1000 });
      else timer = window.setTimeout(loadInventory, 0);
    });
    return () => {
      cancelled = true;
      if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
      window.clearTimeout(timer);
    };
  }, [cacheHydrated, fetchAssets]);

  // ── Generic add stock device ────────────────────────────────────────────────
  const addStockDevice = useCallback(async (category, deviceData) => {
    const cfg = deviceConfigs[category];
    if (!cfg) throw new Error(`Unknown category: ${category}`);

    const tempId = deviceData.id || `${category.toUpperCase()}-${Date.now()}`;
    const dbPayload = sanitizeDeviceForDb(category, deviceData, tempId);
    const localDevice = cfg.mapper(dbPayload);

    return withAssetWrite(async () => {
    const result = !isSupabaseConfigured ? {queued:false} : await persistMutation({
      online:navigator.onLine,
      write:()=>safeQuery(sb=>sb.from(cfg.table).insert(dbPayload).select(assetColumns(cfg.table, true)),'addStockDevice'),
      queue:()=>enqueueOfflineAction('ADD_DEVICE',dbPayload,cfg.table),
    });
    const confirmedDevice = !result.queued && result.data?.[0] ? cfg.mapper(result.data[0]) : localDevice;
    const rows = updateRows(cfg.table, prev => [confirmedDevice, ...prev.filter(item => item.id !== confirmedDevice.id)]);
    await persistAssetsLocal(cfg.cacheKey, rows);
    return result;
    });
  }, [withAssetWrite, updateRows, deviceConfigs]);

  // ── Generic edit device ────────────────────────────────────────────────────
  // Full editor: retain the revision captured when the form opened.
  const editDeviceDetails = useCallback(async (category, id, updates, revision) => {
    const cfg = deviceConfigs[category];
    const targetTable = cfg ? cfg.table : category;
    const singularCat = cfg ? cfg.singular : category;

    const { id: _ignoredId, ...dbUpdates } = mapDeviceToDb({ ...updates, id }, singularCat);
    if (updates.originalSerial !== undefined && updates.serial === updates.originalSerial) delete dbUpdates.serial;
    const appUpdates = { ...updates, id, isUpdated: true, updatedAt: new Date().toISOString() };

    if ('is_assigned' in updates) appUpdates.isAssigned = updates.is_assigned;
    if ('set_code' in updates) appUpdates.setCode = updates.set_code;

    if (!cfg) throw createPersistenceError('Loại thiết bị không hợp lệ.');
    if (isSupabaseConfigured) {
      if (!navigator.onLine) throw createPersistenceError('Cần kết nối mạng để lưu thiết bị và bộ máy đồng thời. Nội dung đang nhập được giữ nguyên.');
      await withAssetWrite(async () => {
        const acknowledgement = await saveDeviceEdit(query => safeQuery(query, `editDevice:${targetTable}`), targetTable, id, dbUpdates, revision);
        const updatedAt = acknowledgement?.data?.[0]?.updated_at;
        const rows = updateRows(targetTable, previous => previous.map(device => device.id === id
          ? { ...device, ...appUpdates, updatedAt: updatedAt || device.updatedAt } : device));
        await persistAssetsLocal(targetTable, rows);
      });
      const linked = updates.setCode || updates.set_code || assetStateRef.current.system_sets.some(set => set[`${singularCat}Id`] === id);
      await fetchAssets([linked ? 'system_sets' : targetTable]);
    } else {
      cfg.setter(prev => {
        const updated = prev.map(d => d.id === id ? { ...d, ...appUpdates } : d);
        persistAssetsLocal(cfg.cacheKey, updated);
        return updated;
      });
      setSystemSets(prev => prev.map(set => {
        const fields = singularCat === 'dispenser' ? { dispenserId: id, dispenserModel: updates.model, dispenserSerial: updates.serial }
          : singularCat === 'mixer' ? { mixerId: id, mixerModel: updates.model, mixerSerial: updates.serial }
          : singularCat === 'computer' ? { computerId: id, computerType: updates.type, computerSerial: updates.serial, tintingSoftware: updates.tintingSoftware, softwareVersion: updates.softwareVersion }
          : { printerId: id, printerSerial: updates.serial };
        const key = `${singularCat}Id`;
        if (set.setCode === updates.setCode && updates.isAssigned && (!set[key] || set[key] === id)) return { ...set, ...fields };
        if (set[key] === id) return { ...set, ...Object.fromEntries(Object.keys(fields).map(field => [field, field === key ? null : ''])) };
        return set;
      }));
    }
  }, [fetchAssets, withAssetWrite, updateRows, deviceConfigs]);

  // Compatibility adapter; full interactive edits use editDeviceDetails above.
  const editDevice = useCallback(async (category, id, updates) => {
    const cfg = deviceConfigs[category];
    const targetTable = cfg ? cfg.table : category;
    const singularCat = cfg ? cfg.singular : category;

    const { id: _ignoredId, ...dbUpdates } = mapDeviceToDb({ ...updates, id }, singularCat);
    const appUpdates = { ...updates, id, isUpdated: true, updatedAt: new Date().toISOString() };

    if ('is_assigned' in updates) appUpdates.isAssigned = updates.is_assigned;
    if ('set_code' in updates) appUpdates.setCode = updates.set_code;

    if (cfg) {
      cfg.setter(prev => {
        const updated = prev.map(d => d.id === id ? { ...d, ...appUpdates } : d);
        persistAssetsLocal(cfg.cacheKey, updated);
        return updated;
      });
    }

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const result = await withAssetWrite(() => safeQuery(
          sb => sb.from(targetTable).update(dbUpdates).eq('id', id).select('id'),
          `editDevice:${targetTable}`
        ));
        requireCompleteWrite(result);
        await fetchAssets([targetTable]);
      } catch (err) {
        recordOperationalError('device', err);
        console.warn(`[Offline] Failed online editDevice for ${targetTable}. Queueing action.`);
        if (!canRetryOffline(err)) {
          await fetchAssets([targetTable]);
          throw err;
        }
        await enqueueOfflineAction('EDIT_DEVICE', { id, ...dbUpdates }, targetTable);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log(`[Offline] Network down. Enqueueing editDevice for ${targetTable}.`);
      await enqueueOfflineAction('EDIT_DEVICE', { id, ...dbUpdates }, targetTable);
    }
  }, [fetchAssets, withAssetWrite, deviceConfigs]);

  // ── Generic delete device ──────────────────────────────────────────────────
  const deleteDevice = useCallback(async (category, id) => {
    const cfg = deviceConfigs[category];
    const targetTable = cfg ? cfg.table : category;
    if(!cfg) throw createPersistenceError('Loại thiết bị không hợp lệ.');
    if (removalPendingRef.current) throw createPersistenceError('Đang xóa dữ liệu. Vui lòng chờ.');
    const owner = getOfflineOwner();
    removalPendingRef.current = true;
    const finishWrite = readBarrierRef.current.begin();
    try {
      const result = await optimisticRemoval({
        id, key: 'id', read: () => assetStateRef.current[targetTable],
        update: updater => { if (owner === getOfflineOwner()) updateRows(targetTable, updater); },
        persist: () => !isSupabaseConfigured ? Promise.resolve({ queued: false }) : persistMutation({ online: navigator.onLine,
          write: () => safeQuery(sb => sb.from(targetTable).delete().eq('id', id).select('id'), 'deleteDevice'),
          queue: () => enqueueOfflineAction('DELETE_DEVICE', { id }, targetTable),
        }),
      });
      if (owner === getOfflineOwner()) await persistAssetsLocal(cfg.cacheKey, assetStateRef.current[targetTable]);
      return result;
    } finally {
      removalPendingRef.current = false;
      finishWrite();
    }
  }, [updateRows, deviceConfigs]);

  // ── Batch Import Devices from Excel ────────────────────────────────────────
  const importDevices = useCallback(async (type, items) => {
    const cfg = deviceConfigs[type];
    if (!cfg) throw new Error(`Unknown import type: ${type}`);

    const nowIso = new Date().toISOString();
    const markedItems = items.map(item => ({ ...item, createdAt: nowIso, isNew: true }));

    const dbItems = items.map(item => mapDeviceToDb(item,cfg.table));
    const result = !isSupabaseConfigured ? {queued:false} : await withAssetWrite(() => persistBatchMutation({items:dbItems, online:isSupabaseConfigured && navigator.onLine,
      write:rows => safeQuery(sb => sb.from(cfg.table).upsert(rows,{onConflict:'id'}).select('id'), 'importDevices'),
      queue:item => enqueueOfflineAction('ADD_DEVICE',item,cfg.table),
    }));
    cfg.setter(prev => {
      const ids = new Set(markedItems.map(item => item.id));
      const updated = [...markedItems,...prev.filter(item => !ids.has(item.id))];
      persistAssetsLocal(cfg.cacheKey,updated); return updated;
    });
    if (isSupabaseConfigured && !result.queued) await fetchAssets([cfg.table]);
    return result;
  }, [fetchAssets, withAssetWrite, deviceConfigs]);

  const importSystemSets = useCallback(async (items) => {
    const dbItems = items.map(mapSystemSetToDb).filter(item => item.set_code);
    if (dbItems.length !== items.length) throw new Error('Every imported system set must include a set code');

    const result = !isSupabaseConfigured ? {queued:false} : await withAssetWrite(() => persistBatchMutation({items:dbItems, key:'set_code', online:isSupabaseConfigured && navigator.onLine,
      write:rows => safeQuery(sb => sb.from('system_sets').upsert(rows,{onConflict:'set_code'}).select('set_code'), 'importSystemSets'),
      queue:item => enqueueOfflineAction('ASSEMBLE_SET',item),
    }));
    setSystemSets(prev => {
      const merged = new Map(prev.map(item => [item.setCode || item.set_code,item]));
      dbItems.map(mapDbToSystemSet).forEach(item => merged.set(item.setCode,item));
      const updated = Array.from(merged.values()); persistAssetsLocal('system_sets',updated); return updated;
    });
    if (isSupabaseConfigured && !result.queued) await fetchAssets(['system_sets']);
    return result;
  }, [fetchAssets, withAssetWrite]);

  // ── Assemble new system set ────────────────────────────────────────────────
  const assembleSet = useCallback(async (newSet) => {
    const setCode = newSet.setCode || newSet.set_code;
    const dbPayload = mapSystemSetToDb({ ...newSet, setCode });
    const appSetData = mapDbToSystemSet(dbPayload);

    if (isSupabaseConfigured) {
      if (!navigator.onLine) throw createPersistenceError('Cần kết nối mạng để ráp bộ máy đồng thời. Nội dung được giữ ở bản nháp.');
      const result=await withAssetWrite(() => safeQuery(sb=>sb.rpc('assemble_system_set_atomic',{p_operation_id:newSet.operationId,p_payload:dbPayload}),'assembleSystemSet'));
      if(result.error)throw result.error;
      if(!result.data?.ok || result.data.setCode !== setCode)throw createPersistenceError('Server chưa xác nhận ráp bộ máy.');
      await fetchAssets();
    } else {
      setSystemSets(prev=>{const updated=[appSetData,...prev.filter(item=>item.setCode!==setCode)];persistAssetsLocal('system_sets',updated);return updated;});
    }
    return {queued:false};
  }, [fetchAssets, withAssetWrite]);

  const replaceEquipment=useCallback(async payload=>{
    if(isSupabaseConfigured){
      if(!navigator.onLine)throw createPersistenceError('Cần có mạng để thay thiết bị đồng thời. Bản nháp được giữ nguyên.');
      const result=await withAssetWrite(() => saveEquipmentReplacement(query=>safeQuery(query,'replaceEquipment'),payload));
      await fetchAssets([EQUIPMENT_SLOTS.find(item => item.category === payload.p_category).table, 'system_sets']);return result;
    }
    const machine=systemSets.find(item=>item.setCode===payload.p_set_code);
    if(!machine||machine.updatedAt!==payload.p_expected_updated_at)throw Object.assign(new Error('Hồ sơ máy đã thay đổi. Tải lại để đối chiếu.'),{code:'PT409'});
    const catalog={computer:computers,dispenser:dispensers,mixer:mixers,printer:printers};
    const setters={computer:setComputers,dispenser:setDispensers,mixer:setMixers,printer:setPrinters};
    const list=catalog[payload.p_category];if(!list)throw Error('Loại thiết bị không hợp lệ');
    const slot=resolveEquipmentSlot(machine,payload.p_category,list);
    const incoming=replacementCandidates(list,machine,payload.p_action).find(item=>item.id===payload.p_device_id);
    if(!incoming||slot.device?.id===incoming.id&&payload.p_action!=='relink')throw Object.assign(new Error('Thiết bị không còn sẵn sàng.'),{code:'PT409'});
    if(systemSets.some(item=>item.setCode!==machine.setCode&&item[payload.p_category+'Id']===incoming.id))throw Error('Thiết bị đã được tham chiếu ở bộ máy khác.');
    const changedAt=new Date().toISOString();
    const table=EQUIPMENT_SLOTS.find(item=>item.category===payload.p_category).table;
    setters[payload.p_category](previous=>{const next=previous.map(device=>device.id===incoming.id?{...device,isAssigned:true,setCode:machine.setCode,updatedAt:changedAt}:device.id===slot.device?.id?{...device,isAssigned:false,setCode:null,status:payload.p_old_condition,updatedAt:changedAt}:device);persistAssetsLocal(table,next);return next;});
    setSystemSets(previous=>{const next=previous.map(item=>item.setCode===machine.setCode?{...item,...equipmentFields(payload.p_category,incoming),updatedAt:changedAt}:item);persistAssetsLocal('system_sets',next);return next;});
    return {ok:true,setCode:machine.setCode,newDeviceId:incoming.id,event:{operation_id:payload.p_operation_id,set_code:machine.setCode,npp_id:machine.nppId,region:machine.region,category:payload.p_category,action:payload.p_action,old_device_id:slot.device?.id||null,new_device_id:incoming.id,old_snapshot:slot.device,new_snapshot:incoming,old_condition:payload.p_old_condition,reason:payload.p_reason,changed_at:changedAt}};
  },[systemSets,computers,dispensers,mixers,printers,fetchAssets,withAssetWrite]);

  // ── Update system set ──────────────────────────────────────────────────────
  const updateSystemSet = useCallback(async (oldSetCode, updates) => {
    const newSetCode = (updates.setCode || updates.set_code || oldSetCode).trim();
    const isCodeChanged = newSetCode !== oldSetCode;
    if(isCodeChanged)throw createPersistenceError('Mã bộ máy được giữ cố định để bảo toàn lịch sử và liên kết thiết bị.');

    const dbPayload = mapSystemSetToDb({ ...updates, set_code: newSetCode, setCode: newSetCode });
    if(isSupabaseConfigured && (!updates.expectedRevision || !Number.isFinite(Date.parse(updates.expectedRevision)))) throw Object.assign(new Error('Giữ bản nháp và tải lại hồ sơ máy trước khi lưu.'),{code:'REVISION_REQUIRED'});
    const result = await withAssetWrite(async () => {
    const persisted = !isSupabaseConfigured ? {queued:false} : await persistMutation({
      online:navigator.onLine,
      write:async()=>{try {return await saveSystemSetEdit(query=>safeQuery(query,'updateSystemSet'),oldSetCode,dbPayload,updates.expectedRevision);}catch(error){return {data:null,error};}},
      queue:()=>enqueueOfflineAction('UPDATE_SYSTEM_SET',{targetSetCode:oldSetCode,data:dbPayload,expectedRevision:updates.expectedRevision})
    });
    const rows = updateRows('system_sets', prev => prev.map(item => item.setCode === oldSetCode ? { ...item, ...updates, isUpdated: true, updatedAt: persisted.data?.[0]?.updated_at || item.updatedAt } : item));
    await persistAssetsLocal('system_sets', rows);
    return persisted;
    });
    if(isSupabaseConfigured && !result.queued)await fetchAssets(['system_sets']);
    return result;
  }, [fetchAssets, withAssetWrite, updateRows]);

  // ── Delete system set ──────────────────────────────────────────────────────
  const deleteSystemSet = useCallback(async (setCode) => {
    if (removalPendingRef.current) throw createPersistenceError('Đang xóa dữ liệu. Vui lòng chờ.');
    const owner = getOfflineOwner();
    const operationId = createOperationId();
    removalPendingRef.current = true;
    const finishWrite = readBarrierRef.current.begin();
    try {
      const result = await optimisticRemoval({
        id: setCode, key: 'setCode', read: () => assetStateRef.current.system_sets,
        update: updater => { if (owner === getOfflineOwner()) updateRows('system_sets', updater); },
        persist: () => !isSupabaseConfigured ? Promise.resolve({ queued: false }) : persistMutation({
          online: navigator.onLine,
          write: () => safeQuery(sb => sb.rpc('delete_system_set_atomic', { p_operation_id: operationId, p_set_code: setCode }), 'deleteSystemSet'),
          queue: () => enqueueOfflineAction('DELETE_SYSTEM_SET', { set_code: setCode, operationId }),
        }),
      });
      if (owner !== getOfflineOwner()) return result;
      const writes = [persistAssetsLocal('system_sets', assetStateRef.current.system_sets)];
      // Release linked devices only after durable server/queue acknowledgement.
      for (const table of DEVICE_TABLES) {
        const next = updateRows(table, rows => rows.map(device => (device.setCode || device.set_code) === setCode
          ? { ...device, setCode: null, set_code: null, isAssigned: false, is_assigned: false } : device));
        writes.push(persistAssetsLocal(table, next));
      }
      await Promise.all(writes);
      return result;
    } finally {
      removalPendingRef.current = false;
      finishWrite();
    }
  }, [updateRows]);
  return {
    dispensers, setDispensers,
    mixers,     setMixers,
    computers,  setComputers,
    printers,   setPrinters,
    systemSets, setSystemSets,
    loading,
    loadError,
    addStockDevice,
    editDevice,
    editDeviceDetails,
    deleteDevice,
    deleteSystemSet,
    importDevices,
    importSystemSets,
    assembleSet,
    replaceEquipment,
    updateSystemSet,
    detailsReady, summaryReady, systemSetsReady, ensureDetails,
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
    tintingSoftware: row.tinting_software ?? row.tintingSoftware,
    softwareVersion: row.software_version ?? row.softwareVersion,
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
    updatedAt: row.updated_at || row.updatedAt, setCode: row.set_code || row.setCode, nppId: row.npp_id || row.nppId, nppName: row.npp_name || row.nppName, region: row.region, province: row.province,
    status: row.status, dispenserId: row.dispenser_id || row.dispenserId, dispenserModel: row.dispenser_model || row.dispenserModel, dispenserSerial: row.dispenser_serial || row.dispenserSerial,
    mixerId: row.mixer_id || row.mixerId, mixerModel: row.mixer_model || row.mixerModel, mixerSerial: row.mixer_serial || row.mixerSerial,
    computerSerial: row.computer_serial || row.computerSerial || '', tintingSoftware: row.tinting_software || row.tintingSoftware || '', softwareVersion: row.software_version || row.softwareVersion || '', agentStatus: row.agent_status || row.agentStatus || '',
    computerId: row.computer_id || row.computerId, computerType: row.computer_type || row.computerType, pcType: row.computer_type || row.pcType,
    printerId: row.printer_id || row.printerId, printerSerial: row.printer_serial || row.printerSerial, printerModel: 'QL700',
    installDate: row.install_date || row.installDate || row.installedDate, lastMaintenanceDate: row.last_maintenance_date || row.lastMaintenanceDate, nextMaintenanceDue: row.next_maintenance_due || row.nextMaintenanceDue,
    technician: row.technician, salesperson: row.salesperson || row.sales_person || '', stabilizer: row.stabilizer || '', notes: row.notes,
    installationPhotos: row.installation_photos ?? row.installationPhotos,
    createdAt: row.created_at || row.createdAt,
  };
}

// ─── App → DB Field Mappers (Clean snake_case for Supabase) ────────────────────
function mapDeviceToDb(obj, category) {
  const dbObj = {};
  const cat = (category || '').toLowerCase();

  // Basic identification & PK
  if (obj.id !== undefined) dbObj.id = obj.id;
  if (obj.serial !== undefined && obj.serial !== '—') dbObj.serial = obj.serial?.trim() || null;

  // Assignment status & system set link
  if (obj.isAssigned !== undefined || obj.is_assigned !== undefined) {
    dbObj.is_assigned = Boolean(obj.isAssigned ?? obj.is_assigned);
  }
  if (obj.setCode !== undefined || obj.set_code !== undefined) {
    dbObj.set_code = obj.setCode ?? obj.set_code ?? null;
  }

  // Category specific allowed fields (STRICT SCHEMA SANITIZATION)
  if (cat === 'computer' || cat === 'computers') {
    if (obj.type !== undefined) dbObj.type = normalizeDeviceType(cat,obj.type);
    if (obj.os !== undefined) dbObj.os = obj.os;
    if (obj.tintingSoftware !== undefined) dbObj.tinting_software = String(obj.tintingSoftware).trim();
    if (obj.softwareVersion !== undefined) dbObj.software_version = String(obj.softwareVersion).trim();
    if (obj.specs !== undefined) dbObj.specs = obj.specs;
    if (obj.network !== undefined) dbObj.network = obj.network;
    if (obj.status !== undefined) dbObj.status = obj.status;
    if (obj.stabilizer !== undefined) dbObj.stabilizer = obj.stabilizer;
  } else if (cat === 'dispenser' || cat === 'dispensers') {
    if (obj.model !== undefined) dbObj.model = obj.model;
    if (obj.status !== undefined) dbObj.status = obj.status;
  } else if (cat === 'mixer' || cat === 'mixers') {
    if (obj.model !== undefined) dbObj.model = obj.model;
    if (obj.type !== undefined) dbObj.type = normalizeDeviceType(cat,obj.type);
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
    status: data.status || 'Mới 100%',
    is_assigned: Boolean(data.isAssigned || data.is_assigned),
    set_code: data.setCode || data.set_code || null
  };

  if (category === 'dispenser') {
    return {
      ...base,
      serial: data.serial?.trim() || null,
      model: data.model || 'Satint'
    };
  }

  if (category === 'mixer') {
    return {
      ...base,
      serial: data.serial?.trim() || null,
      model: data.model || 'Satint ST-50',
      type: data.type || 'Lắc xoay khép kín'
    };
  }

  if (category === 'computer') {
    return {
      ...base,
      type: data.type === 'Case' ? 'Case' : 'AIO',
      serial: null,
      os: data.os || 'Windows 11 Pro',
      specs: data.specs || 'Core i5',
      network: data.network || 'Có mạng LAN'
    };
  }

  if (category === 'printer') {
    return {
      ...base,
      serial: data.serial?.trim() || null,
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

  if ('computerSerial' in obj || 'computer_serial' in obj) dbObj.computer_serial = obj.computerSerial ?? obj.computer_serial ?? '';
  if ('tintingSoftware' in obj || 'tinting_software' in obj) dbObj.tinting_software = obj.tintingSoftware ?? obj.tinting_software ?? '';
  if ('softwareVersion' in obj || 'software_version' in obj) dbObj.software_version = obj.softwareVersion ?? obj.software_version ?? '';
  if ('printerId' in obj || 'printer_id' in obj) dbObj.printer_id = obj.printerId ?? obj.printer_id ?? null;
  if ('printerSerial' in obj || 'printer_serial' in obj) dbObj.printer_serial = obj.printerSerial ?? obj.printer_serial ?? '';


  if ('installDate' in obj || 'installedDate' in obj || 'install_date' in obj) dbObj.install_date = obj.installDate ?? obj.installedDate ?? obj.install_date ?? null;
  if ('lastMaintenanceDate' in obj || 'last_maintenance_date' in obj) dbObj.last_maintenance_date = obj.lastMaintenanceDate ?? obj.last_maintenance_date ?? null;
  if ('nextMaintenanceDue' in obj || 'next_maintenance_due' in obj) dbObj.next_maintenance_due = obj.nextMaintenanceDue ?? obj.next_maintenance_due ?? null;

  if ('technician' in obj) dbObj.technician = obj.technician ?? '';
  if ('salesperson' in obj || 'sales_person' in obj) dbObj.salesperson = obj.salesperson ?? obj.sales_person ?? '';
  if ('stabilizer' in obj) dbObj.stabilizer = obj.stabilizer ?? '';
  if ('notes' in obj) dbObj.notes = obj.notes ?? '';
  if ('installationPhotos' in obj || 'installation_photos' in obj) dbObj.installation_photos = obj.installationPhotos ?? obj.installation_photos ?? [];

  return normalizeDateFields(dbObj,{install_date:'Ngày lắp đặt',last_maintenance_date:'Ngày bảo trì gần nhất',next_maintenance_due:'Hạn bảo trì'});
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
