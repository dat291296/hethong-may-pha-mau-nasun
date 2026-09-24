import { supabase, isSupabaseConfigured } from './supabase';
import { addToQueue, getQueue, removeFromQueue, clearQueue, setCache, getCache } from './offlineDb';
import { createOperationId, migrateQueueItem, classifySyncError, getRetryDelay } from './syncQueue';

let activeSyncPromise = null;
const deviceIdPools = new Map();
const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nasun-sync-v2') : null;

function emitQueueUpdated(broadcast = true) {
  window.dispatchEvent(new Event('offline-queue-updated'));
  if (broadcast) syncChannel?.postMessage({ type: 'queue-updated', at: Date.now() });
}

if (syncChannel) {
  syncChannel.onmessage = event => {
    if (event.data?.type === 'queue-updated') emitQueueUpdated(false);
  };
}

async function saveQueueState(item, status, error = null) {
  const attempts = status === 'syncing' ? Number(item.attempts || 0) : Number(item.attempts || 0) + 1;
  const retryDelay = getRetryDelay(attempts);
  Object.assign(item, {
    status,
    attempts,
    lastError: error ? String(error.message || error) : null,
    nextAttemptAt: status === 'retry_wait' ? Date.now() + retryDelay : 0,
    updatedAt: Date.now()
  });
  await addToQueue(item);
}

const DEVICE_PREFIXES = {
  dispensers: 'DISP',
  mixers: 'MIXE',
  computers: 'COMP',
  printers: 'PRIN'
};

function getActionIdentity(item) {
  const payload = item?.payload || {};
  switch (item?.action) {
    case 'ADD_DEVICE': {
      const deviceId = payload.id || payload.sourceId || payload.managementCode || payload.management_code || payload.code || payload.qlCode || payload.ql_code;
      return deviceId ? `${item.action}:${item.category}:${deviceId}` : null;
    }
    case 'ASSEMBLE_SET': {
      const setCode = payload.set_code || payload.setCode;
      return setCode ? `${item.action}:${setCode}` : null;
    }
    case 'EDIT_DEVICE': return `${item.action}:${item.category}:${payload.id}`;
    case 'EDIT_NPP':
    case 'EDIT_REPAIR':
    case 'UPDATE_AUDIT_LOG': return `${item.action}:${payload.id}`;
    case 'UPDATE_SYSTEM_SET': {
      const setCode = payload.targetSetCode || payload.oldSetCode || payload.previousSetCode ||
        payload.currentSetCode || payload.originalSetCode || payload.old_code ||
        payload.set_code || payload.setCode || payload.data?.set_code || payload.data?.setCode ||
        payload.dbPayload?.set_code || payload.dbPayload?.setCode;
      return setCode ? `${item.action}:${setCode}` : null;
    }
    default: return null;
  }
}

async function resolveDeviceId(table, payload, queueItemId) {
  const existingId = payload?.id || payload?.sourceId || payload?.managementCode ||
    payload?.management_code || payload?.code || payload?.qlCode || payload?.ql_code;
  if (existingId) return String(existingId).trim();

  const prefix = DEVICE_PREFIXES[table] || 'DEV';
  if (!deviceIdPools.has(table)) {
    deviceIdPools.set(table, (async () => {
      const used = new Set();
      const { data, error } = await supabase.from(table).select('id');
      if (error) throw error;
      for (const row of data || []) {
        const match = String(row.id || '').match(new RegExp(`^${prefix}-(\\d{1,3})$`, 'i'));
        if (match) used.add(Number(match[1]));
      }
      return used;
    })());
  }

  const used = await deviceIdPools.get(table);
  for (let number = 1; number <= 999; number += 1) {
    if (!used.has(number)) {
      used.add(number);
      return `${prefix}-${String(number).padStart(3, '0')}`;
    }
  }

  const fallbackToken = String(queueItemId || Date.now()).replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase();
  return `${prefix}-${fallbackToken}`;
}

async function compactDuplicateCreates(queue) {
  const latestByIdentity = new Map();
  for (const item of queue) {
    if (!['ADD_DEVICE', 'ASSEMBLE_SET'].includes(item.action)) continue;
    const identity = getActionIdentity(item);
    if (identity) latestByIdentity.set(identity, item.id);
  }

  const compacted = [];
  for (const item of queue) {
    const identity = getActionIdentity(item);
    const isDuplicateCreate = ['ADD_DEVICE', 'ASSEMBLE_SET'].includes(item.action) &&
      identity && latestByIdentity.get(identity) !== item.id;
    if (isDuplicateCreate) {
      await removeFromQueue(item.id);
    } else {
      compacted.push(item);
    }
  }
  if (compacted.length !== queue.length) {
    emitQueueUpdated();
  }
  return compacted;
}

function sortQueueByDependency(queue) {
  const priorities = {
    ADD_NPP: 10,
    EDIT_NPP: 20,
    ADD_DEVICE: 30,
    ASSEMBLE_SET: 40,
    EXECUTE_WORKFLOW: 45,
    EDIT_DEVICE: 50,
    UPDATE_SYSTEM_SET: 60,
    ADD_REPAIR: 70,
    EDIT_REPAIR: 80,
    ADD_AUDIT_LOG: 90,
    UPDATE_AUDIT_LOG: 100,
    DELETE_AUDIT_LOG: 110,
    DELETE_REPAIR: 120,
    DELETE_SYSTEM_SET: 130,
    DELETE_DEVICE: 140,
    DELETE_NPP: 150
  };
  return [...queue].sort((a, b) => {
    const priorityDiff = (priorities[a.action] || 999) - (priorities[b.action] || 999);
    return priorityDiff || (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0);
  });
}

function describeQueueError(item, error) {
  const payload = item?.payload || {};
  const recordId = payload.id || payload.set_code || payload.setCode || payload.targetSetCode || 'không có mã';
  return `${item.action}${item.category ? `/${item.category}` : ''} (${recordId}): ${error.message}`;
}

function normalizeRepairCategory(category, machineModel = '') {
  const raw = String(category || '').trim();
  const allowed = ['Máy chiết', 'Máy lắc', 'Máy tính', 'Máy in', 'Phụ kiện', 'Linh kiện'];
  const exact = allowed.find(value => value.toLocaleLowerCase('vi') === raw.toLocaleLowerCase('vi'));
  if (exact) return exact;

  const hint = `${raw} ${machineModel || ''}`.toLocaleLowerCase('vi');
  if (/chiết|dispenser|satint|hero|first/.test(hint)) return 'Máy chiết';
  if (/lắc|mixer|shaker|ai88|ysa|kmc/.test(hint)) return 'Máy lắc';
  if (/máy tính|computer|\bpc\b|\baio\b|\bcase\b|laptop/.test(hint)) return 'Máy tính';
  if (/máy in|printer|ql700|brother/.test(hint)) return 'Máy in';
  if (/linh kiện|component|spare part/.test(hint)) return 'Linh kiện';
  return 'Phụ kiện';
}

function normalizeRepairPayload(payload, applyDefaults = false, queueItemId = null) {
  const source = payload || {};
  const mappings = {
    ticketCode: 'ticket_code', nppId: 'npp_id', nppName: 'npp_name',
    productCategory: 'product_category', machineModel: 'machine_model', serialNumber: 'serial_number',
    errorDescription: 'error_description', errorCategory: 'error_category',
    actionDirection: 'action_direction', replacementCondition: 'replacement_condition',
    processingStatus: 'processing_status', customerReturnStatus: 'customer_return_status',
    createdBy: 'created_by'
  };
  const allowed = new Set([
    'id', 'ticket_code', 'date', 'technician', 'npp_id', 'npp_name', 'product_category',
    'machine_model', 'serial_number', 'error_description', 'error_category', 'action_direction',
    'replacement_condition', 'processing_status', 'customer_return_status', 'notes', 'photos', 'created_by'
  ]);
  const normalized = {};
  for (const [key, value] of Object.entries(source)) {
    const dbKey = mappings[key] || key;
    if (allowed.has(dbKey) && value !== undefined) normalized[dbKey] = value;
  }

  if ('product_category' in normalized || applyDefaults) {
    normalized.product_category = normalizeRepairCategory(
      normalized.product_category,
      normalized.machine_model
    );
  }

  const exchangeType = source.exchangeType ?? source.exchange_type;
  if (exchangeType !== undefined) {
    const exchangeText = String(exchangeType).toLocaleLowerCase('vi');
    normalized.action_direction = exchangeText.includes('không') ? 'Sửa chữa' : 'Xuất đổi';
    normalized.replacement_condition = exchangeText.includes('cũ')
      ? 'Cũ'
      : (exchangeText.includes('mới') ? 'Mới' : 'N/A');
  }

  if (normalized.date === '' || (typeof normalized.date === 'string' && !normalized.date.trim())) {
    if (applyDefaults) normalized.date = new Date().toISOString().slice(0, 10);
    else delete normalized.date;
  }
  if (normalized.action_direction && !['Sửa chữa', 'Xuất đổi'].includes(normalized.action_direction)) {
    normalized.action_direction = 'Sửa chữa';
  }
  if (normalized.replacement_condition && !['Mới', 'Cũ', 'N/A'].includes(normalized.replacement_condition)) {
    normalized.replacement_condition = 'N/A';
  }
  if (normalized.processing_status && !['Chưa xử lý', 'Đã xử lý'].includes(normalized.processing_status)) {
    normalized.processing_status = 'Chưa xử lý';
  }
  if (normalized.customer_return_status && !['Chưa gửi trả', 'Đã gửi trả'].includes(normalized.customer_return_status)) {
    normalized.customer_return_status = 'Chưa gửi trả';
  }
  if ('photos' in normalized && !Array.isArray(normalized.photos)) normalized.photos = [];
  if (applyDefaults) {
    const fallbackId = `TICK-OFFLINE-${String(queueItemId || Date.now()).replace(/[^a-z0-9]/gi, '').slice(-12).toUpperCase()}`;
    normalized.id = normalized.id || normalized.ticket_code || fallbackId;
    normalized.ticket_code = normalized.ticket_code || normalized.id;
    normalized.technician = normalized.technician || 'Chưa cập nhật';
    normalized.npp_name = normalized.npp_name || '';
    normalized.machine_model = normalized.machine_model || 'Chưa cập nhật';
    normalized.serial_number = normalized.serial_number || 'N/A';
    normalized.action_direction = normalized.action_direction || 'Sửa chữa';
    normalized.replacement_condition = normalized.replacement_condition || 'N/A';
    normalized.processing_status = normalized.processing_status || 'Chưa xử lý';
    normalized.customer_return_status = normalized.customer_return_status || 'Chưa gửi trả';
    normalized.photos = Array.isArray(normalized.photos) ? normalized.photos : [];
  }
  return normalized;
}

function normalizeAuditPayload(payload, queueItemId) {
  const source = payload || {};
  const mappings = {
    setCode: 'set_code', nppId: 'npp_id', nppName: 'npp_name', serialList: 'serial_list',
    userId: 'user_id', targetId: 'target_id'
  };
  const allowed = new Set([
    'id', 'type', 'timestamp', 'set_code', 'npp_id', 'npp_name', 'serial_list',
    'technician', 'reason', 'notes', 'user_id', 'target_id', 'severity'
  ]);
  const normalized = {};
  for (const [key, value] of Object.entries(source)) {
    const dbKey = mappings[key] || key;
    if (allowed.has(dbKey) && value !== undefined) normalized[dbKey] = value;
  }
  if (!normalized.id) {
    const stableToken = String(queueItemId || Date.now()).replace(/[^a-z0-9-]/gi, '').toUpperCase();
    normalized.id = `AUDIT-${stableToken}`;
  }
  normalized.type = normalized.type || 'CẬP NHẬT HỆ THỐNG';
  normalized.set_code = normalized.set_code || '—';
  normalized.npp_id = normalized.npp_id || '—';
  if (!['INFO', 'WARNING', 'CRITICAL'].includes(normalized.severity)) normalized.severity = 'INFO';
  if (!normalized.timestamp || Number.isNaN(new Date(normalized.timestamp).getTime())) {
    normalized.timestamp = new Date().toISOString();
  }
  return normalized;
}

function normalizeSystemSetPayload(payload, applyDefaults = true) {
  const source = payload || {};
  const mappings = {
    setCode: 'set_code', nppId: 'npp_id', nppName: 'npp_name',
    dispenserId: 'dispenser_id', dispenserModel: 'dispenser_model', dispenserSerial: 'dispenser_serial',
    mixerId: 'mixer_id', mixerModel: 'mixer_model', mixerSerial: 'mixer_serial',
    computerId: 'computer_id', computerType: 'computer_type', computerSerial: 'computer_serial', pcType: 'computer_type',
    printerId: 'printer_id', printerSerial: 'printer_serial',
    tintingSoftware: 'tinting_software', softwareVersion: 'software_version', agentStatus: 'agent_status',
    installDate: 'install_date', installedDate: 'install_date', lastMaintenanceDate: 'last_maintenance_date',
    nextMaintenanceDue: 'next_maintenance_due', installationPhotos: 'installation_photos'
  };
  const allowed = new Set([
    'set_code', 'npp_id', 'npp_name', 'region', 'province', 'status',
    'dispenser_id', 'dispenser_model', 'dispenser_serial',
    'mixer_id', 'mixer_model', 'mixer_serial',
    'computer_id', 'computer_type', 'computer_serial',
    'printer_id', 'printer_serial', 'tinting_software', 'software_version',
    'agent_status', 'install_date', 'last_maintenance_date', 'next_maintenance_due',
    'technician', 'salesperson', 'stabilizer', 'notes', 'installation_photos'
  ]);
  const normalized = {};
  for (const [key, value] of Object.entries(source)) {
    const dbKey = mappings[key] || key;
    if (allowed.has(dbKey) && value !== undefined) normalized[dbKey] = value;
  }
  const dateFields = ['install_date', 'last_maintenance_date', 'next_maintenance_due'];
  for (const field of dateFields) {
    if (field in normalized && (normalized[field] === '' || String(normalized[field]).trim() === '')) {
      normalized[field] = null;
    }
  }
  if (applyDefaults) {
    normalized.npp_name = normalized.npp_name || '';
    const allowedStatuses = ['DA_LAP_DAT', 'TRONG_KHO', 'DA_THU_HOI', 'BAO_THUONG_BAO_TRI'];
    if (!allowedStatuses.includes(normalized.status)) normalized.status = 'TRONG_KHO';
    if (!Array.isArray(normalized.installation_photos)) normalized.installation_photos = [];
  }
  return normalized;
}

async function writeSystemSetWithSchemaFallback(payload, targetSetCode = null) {
  const compatiblePayload = normalizeSystemSetPayload(payload, !targetSetCode);
  const setCode = targetSetCode || compatiblePayload.set_code;
  if (!setCode) return new Error('Thiếu mã bộ máy khi đồng bộ system_sets');
  const requestedSetCode = compatiblePayload.set_code;

  // The primary key is also used as the UPDATE selector. Re-sending the same
  // value is unnecessary, while old queued renames may point at a code that
  // already exists after an earlier action was synchronized.
  if (targetSetCode && requestedSetCode === targetSetCode) {
    delete compatiblePayload.set_code;
  }
  if (targetSetCode && Object.keys(compatiblePayload).length === 0) return null;

  while (true) {
    const { error } = targetSetCode
      ? await supabase.from('system_sets').update(compatiblePayload).eq('set_code', targetSetCode)
      : await supabase.from('system_sets').upsert(compatiblePayload, { onConflict: 'set_code' });
    if (!error) return null;

    const isPrimaryKeyConflict = targetSetCode && requestedSetCode &&
      error.code === '23505' && String(error.message || '').includes('system_sets_pkey');
    if (isPrimaryKeyConflict) {
      const canonicalPayload = { ...compatiblePayload };
      delete canonicalPayload.set_code;
      if (Object.keys(canonicalPayload).length === 0) return null;
      const { error: canonicalError } = await supabase
        .from('system_sets')
        .update(canonicalPayload)
        .eq('set_code', requestedSetCode);
      return canonicalError;
    }

    const match = String(error.message || '').match(/Could not find the '([^']+)' column/i);
    const missingColumn = match?.[1];
    if (!missingColumn || !(missingColumn in compatiblePayload)) return error;
    console.warn(`[OfflineSync] system_sets.${missingColumn} is absent; retrying without it.`);
    delete compatiblePayload[missingColumn];
  }
}

async function resolveSystemSetTarget(queuePayload, updatePayload) {
  const directCode = queuePayload?.targetSetCode || queuePayload?.oldSetCode ||
    queuePayload?.previousSetCode || queuePayload?.currentSetCode || queuePayload?.originalSetCode ||
    queuePayload?.old_code || queuePayload?.set_code ||
    queuePayload?.setCode || updatePayload?.targetSetCode || updatePayload?.oldSetCode ||
    updatePayload?.set_code || updatePayload?.setCode;
  if (directCode) return String(directCode).trim();

  const normalized = normalizeSystemSetPayload(updatePayload, false);
  const lookupFields = ['dispenser_id', 'mixer_id', 'computer_id', 'printer_id'];
  for (const field of lookupFields) {
    if (!normalized[field]) continue;
    const { data, error } = await supabase
      .from('system_sets')
      .select('set_code')
      .eq(field, normalized[field])
      .limit(2);
    if (!error && data?.length === 1) return data[0].set_code;
  }

  const cachedSets = await getCache('system_sets', []);
  if (Array.isArray(cachedSets)) {
    const matches = cachedSets.filter(set => lookupFields.some(field => {
      if (!normalized[field]) return false;
      const camelKey = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      return String(set[field] ?? set[camelKey] ?? '') === String(normalized[field]);
    }));
    if (matches.length === 1) return matches[0].set_code || matches[0].setCode || null;

    const nppName = normalized.npp_name;
    if (nppName) {
      const nppMatches = cachedSets.filter(set => String(set.npp_name || set.nppName || '') === String(nppName));
      if (nppMatches.length === 1) return nppMatches[0].set_code || nppMatches[0].setCode || null;
    }
  }

  return null;
}

async function resolveDeviceLinkTarget(table, deviceId, requestedSetCode) {
  if (requestedSetCode) {
    const { data, error } = await supabase
      .from('system_sets')
      .select('set_code')
      .eq('set_code', requestedSetCode)
      .limit(1);
    if (error) throw error;
    if (data?.length === 1) return requestedSetCode;
  }

  const deviceFieldByTable = {
    dispensers: 'dispenser_id',
    mixers: 'mixer_id',
    computers: 'computer_id',
    printers: 'printer_id'
  };
  const deviceField = deviceFieldByTable[table];
  if (!deviceField || !deviceId) return null;

  const { data, error } = await supabase
    .from('system_sets')
    .select('set_code')
    .eq(deviceField, deviceId)
    .limit(2);
  if (error) throw error;
  return data?.length === 1 ? data[0].set_code : null;
}

async function updateDeviceWithSchemaFallback(table, id, updates) {
  const compatibleUpdates = { ...updates };
  if (table === 'computers') {
    if ('type' in compatibleUpdates) {
      compatibleUpdates.type = compatibleUpdates.type === 'Case' ? 'Case' : 'AIO';
    }
    if ('network' in compatibleUpdates) {
      const allowedNetworks = ['Có mạng LAN', 'Có mạng Wifi', 'Không có mạng'];
      if (!allowedNetworks.includes(compatibleUpdates.network)) compatibleUpdates.network = 'Có mạng LAN';
    }
    if ('os' in compatibleUpdates && !compatibleUpdates.os) compatibleUpdates.os = 'Windows 10 LTSC';
  }
  if (compatibleUpdates.serial && ['N/A', '—', 'null', 'undefined'].includes(String(compatibleUpdates.serial).trim())) {
    compatibleUpdates.serial = `AUTO-${id}`;
  }
  while (true) {
    const { error } = await supabase.from(table).update(compatibleUpdates).eq('id', id);
    if (!error) return null;
    const match = String(error.message || '').match(/Could not find the '([^']+)' column/i);
    const missingColumn = match?.[1];
    if (missingColumn && missingColumn in compatibleUpdates) {
      console.warn(`[OfflineSync] ${table}.${missingColumn} is absent; retrying with legacy schema.`);
      delete compatibleUpdates[missingColumn];
      continue;
    }
    const isDuplicateSerial = error.code === '23505' && String(error.message || '').toLowerCase().includes('serial');
    if (isDuplicateSerial && compatibleUpdates.serial !== `AUTO-${id}`) {
      compatibleUpdates.serial = `AUTO-${id}`;
      continue;
    }
    return error;
  }
}

async function insertDeviceWithSchemaFallback(table, payload, queueItemId) {
  const compatiblePayload = normalizeDevicePayload(payload);
  compatiblePayload.id = await resolveDeviceId(table, payload, queueItemId);
  applyRequiredDeviceDefaults(table, compatiblePayload);
  const deferredLink = compatiblePayload.set_code && compatiblePayload.is_assigned !== false ? {
    table,
    id: compatiblePayload.id,
    set_code: compatiblePayload.set_code,
    is_assigned: compatiblePayload.is_assigned
  } : null;

  // Device tables reference system_sets. Always create the stock device first,
  // then restore its set link in the second pass after all set records exist.
  if (compatiblePayload.set_code) {
    compatiblePayload.set_code = null;
    compatiblePayload.is_assigned = false;
  }

  while (true) {
    const { error } = await supabase.from(table).upsert(compatiblePayload, { onConflict: 'id' });
    if (!error) return { error: null, deferredLink, resolvedId: compatiblePayload.id };
    const match = String(error.message || '').match(/Could not find the '([^']+)' column/i);
    const missingColumn = match?.[1];
    if (missingColumn && missingColumn in compatiblePayload) {
      console.warn(`[OfflineSync] ${table}.${missingColumn} is absent; retrying without it.`);
      delete compatiblePayload[missingColumn];
      continue;
    }

    const isDuplicateSerial = error.code === '23505' && String(error.message || '').toLowerCase().includes('serial');
    if (isDuplicateSerial && compatiblePayload.serial !== `AUTO-${compatiblePayload.id}`) {
      compatiblePayload.serial = `AUTO-${compatiblePayload.id}`;
      continue;
    }

    return { error, deferredLink: null, resolvedId: compatiblePayload.id };
  }
}

/**
 * Push an action to the offline queue
 */
export async function enqueueOfflineAction(action, payload, category = null) {
  const now = Date.now();
  const newItem = migrateQueueItem({
    id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    operationId: createOperationId(),
    action,
    payload,
    category,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    timestamp: now
  });

  // Collapse consecutive edits to the same record so a weak mobile connection
  // does not replay obsolete intermediate versions.
  const queue = await getQueue();
  const previousItem = queue.at(-1);
  const newIdentity = getActionIdentity(newItem);
  if (previousItem && newIdentity && getActionIdentity(previousItem) === newIdentity) {
    await removeFromQueue(previousItem.id);
  }
  
  await addToQueue(newItem);
  
  // Dispatch custom event to trigger sync warning badge or sync attempt
  emitQueueUpdated();
  
  console.log(`[OfflineSync] Enqueued action: ${action}`, payload);
}

/**
 * Get all enqueued offline actions
 */
export async function getOfflineQueue() {
  const queue = await getQueue();
  const migrated = [];
  for (const rawItem of queue) {
    const item = migrateQueueItem(rawItem);
    migrated.push(item);
    if (JSON.stringify(item) !== JSON.stringify(rawItem)) await addToQueue(item);
  }
  return migrated;
}

/**
 * Remove an action from the queue by ID
 */
export async function dequeueOfflineAction(id) {
  await removeFromQueue(id);
  emitQueueUpdated();
}

/**
 * Clear the entire offline queue
 */
export async function clearOfflineQueue() {
  await clearQueue();
  emitQueueUpdated();
}

/**
 * Process the offline queue and upload all actions to Supabase.
 * Returns true if all synchronized successfully.
 */
async function processOfflineQueue(onStatusChange) {
  if (!isSupabaseConfigured || !navigator.onLine) {
    return false;
  }

  let queue = await getOfflineQueue();
  queue = await compactDuplicateCreates(queue);
  queue = sortQueueByDependency(queue);
  if (queue.length === 0) {
    window.dispatchEvent(new CustomEvent('nasun-sync-completed', { detail: { synced: 0 } }));
    return true;
  }

  const totalQueueCount = queue.length;
  const now = Date.now();
  const reviewItems = queue.filter(item => item.status === 'needs_review');
  queue = queue.filter(item => item.status !== 'needs_review' && Number(item.nextAttemptAt || 0) <= now);
  if (queue.length === 0) {
    if (reviewItems.length > 0 && onStatusChange) {
      const details = reviewItems.slice(0, 3).map(item => `${item.action}: ${item.lastError || 'Cần kiểm tra dữ liệu'}`).join(' | ');
      onStatusChange('error', totalQueueCount, `${reviewItems.length} mục cần kiểm tra. ${details}`);
    }
    return false;
  }

  console.log(`[OfflineSync] Starting sync of ${queue.length}/${totalQueueCount} eligible actions...`);
  if (onStatusChange) onStatusChange('syncing', totalQueueCount);

  let successCount = 0;
  const deferredDeviceLinks = [];
  const syncErrors = [];

  for (const item of queue) {
    try {
      await saveQueueState(item, 'syncing');
      console.log(`[OfflineSync] Syncing action ${item.action}...`, item.payload);
      let error = null;

      switch (item.action) {
        case 'ADD_NPP':
          const { error: addNppErr } = await supabase.from('distributors').upsert(item.payload, { onConflict: 'id' });
          error = addNppErr;
          break;
        case 'EDIT_NPP':
          const { error: editNppErr } = await supabase.from('distributors').update(item.payload).eq('id', item.payload.id);
          error = editNppErr;
          break;
        case 'ADD_DEVICE':
          {
            const hadStableId = Boolean(item.payload?.id);
            const result = await insertDeviceWithSchemaFallback(item.category, item.payload, item.id);
            if (!hadStableId && result.resolvedId) {
              item.payload = { ...item.payload, id: result.resolvedId };
              await addToQueue(item);
            }
            error = result.error;
            if (result.deferredLink) {
              deferredDeviceLinks.push({ queueItem: item, ...result.deferredLink });
            }
          }
          break;
        case 'EDIT_DEVICE':
          {
            const devicePayload = normalizeDevicePayload(item.payload);
            const { id, ...deviceUpdates } = devicePayload;
            const deferredLink = deviceUpdates.set_code && deviceUpdates.is_assigned !== false ? {
              queueItem: item,
              table: item.category,
              id,
              set_code: deviceUpdates.set_code,
              is_assigned: deviceUpdates.is_assigned
            } : null;
            if (deviceUpdates.set_code) {
              deviceUpdates.set_code = null;
              deviceUpdates.is_assigned = false;
            }
            error = await updateDeviceWithSchemaFallback(item.category, id, deviceUpdates);
            if (!error && deferredLink) deferredDeviceLinks.push(deferredLink);
          }
          break;
        case 'DELETE_DEVICE':
          const { error: delDevErr } = await supabase.from(item.category).delete().eq('id', item.payload.id);
          error = delDevErr;
          break;
        case 'ASSEMBLE_SET':
          error = await writeSystemSetWithSchemaFallback(item.payload);
          break;
        case 'EXECUTE_WORKFLOW':
          {
            const workflowPayload = item.payload || {};
            if (!workflowPayload.operationId || !workflowPayload.workflow || !workflowPayload.data) {
              throw new Error('Invalid EXECUTE_WORKFLOW queue payload');
            }
            const { error: workflowError } = await supabase.rpc('execute_equipment_workflow', {
              p_operation_id: workflowPayload.operationId,
              p_workflow: workflowPayload.workflow,
              p_payload: workflowPayload.data
            });
            error = workflowError;
          }
          break;
        case 'UPDATE_SYSTEM_SET':
          {
            const updatePayload = item.payload.data || item.payload.dbPayload || item.payload.updates || item.payload.update || item.payload;
            const targetSetCode = await resolveSystemSetTarget(item.payload, updatePayload);
            if (!targetSetCode || !updatePayload || typeof updatePayload !== 'object') {
              throw new Error('Invalid UPDATE_SYSTEM_SET queue payload');
            }
            if (!item.payload.targetSetCode) {
              item.payload = { targetSetCode, data: updatePayload };
              await addToQueue(item);
            }
            error = await writeSystemSetWithSchemaFallback(updatePayload, targetSetCode);
          }
          break;
        case 'DELETE_SYSTEM_SET':
          {
            const setCode = item.payload.set_code || item.payload.setCode;
            if (!setCode) throw new Error('Invalid DELETE_SYSTEM_SET queue payload');
            const { error: deleteSetErr } = await supabase.from('system_sets').delete().eq('set_code', setCode);
            error = deleteSetErr;
          }
          break;
        case 'ADD_REPAIR':
          item.payload = normalizeRepairPayload(item.payload, true, item.id);
          await addToQueue(item);
          const { error: addRepErr } = await supabase.from('repair_tickets').upsert(item.payload, { onConflict: 'id' });
          error = addRepErr;
          break;
        case 'DELETE_NPP':
          const { error: delNppErr } = await supabase.from('distributors').delete().eq('id', item.payload.id);
          error = delNppErr;
          break;
        case 'EDIT_REPAIR':
          {
            const repairPayload = normalizeRepairPayload(item.payload, false);
            const { id, ...repairUpdates } = repairPayload;
            if (!id) throw new Error('Invalid EDIT_REPAIR queue payload');
            item.payload = { id, ...repairUpdates };
            await addToQueue(item);
            const { error: editRepErr } = await supabase.from('repair_tickets').update(repairUpdates).eq('id', id);
            error = editRepErr;
          }
          break;
        case 'DELETE_REPAIR':
          const { error: delRepErr } = await supabase.from('repair_tickets').delete().eq('id', item.payload.id);
          error = delRepErr;
          break;
        case 'ADD_AUDIT_LOG':
          item.payload = normalizeAuditPayload(item.payload, item.id);
          await addToQueue(item);
          const { error: auditErr } = await supabase.from('audit_logs').upsert(item.payload, { onConflict: 'id' });
          error = auditErr;
          break;
        case 'UPDATE_AUDIT_LOG':
          {
            const { id, ...auditUpdate } = item.payload;
            const { error: updateAuditErr } = await supabase.from('audit_logs').update(auditUpdate).eq('id', id);
            error = updateAuditErr;
          }
          break;
        case 'DELETE_AUDIT_LOG':
          {
            const { error: deleteAuditErr } = await supabase.from('audit_logs').delete().eq('id', item.payload.id);
            error = deleteAuditErr;
          }
          break;
        default:
          throw new Error(`Unknown offline action type: ${item.action}`);
      }

      if (error) {
        throw error;
      }

      // A device whose system set is not created yet stays queued until the
      // second pass links it after ASSEMBLE_SET actions have completed.
      if (!deferredDeviceLinks.some(link => link.queueItem.id === item.id)) {
        await dequeueOfflineAction(item.id);
        successCount++;
        if (onStatusChange) onStatusChange('syncing', queue.length - successCount);
      }
      
    } catch (err) {
      console.error(`[OfflineSync] Failed to sync action ${item.id}:`, err);
      await saveQueueState(item, classifySyncError(err), err);
      syncErrors.push(describeQueueError(item, err));
      if (onStatusChange) onStatusChange('syncing', queue.length - successCount, err.message);
    }
  }

  for (const link of deferredDeviceLinks) {
    let resolvedSetCode = null;
    let linkError = null;
    try {
      resolvedSetCode = await resolveDeviceLinkTarget(link.table, link.id, link.set_code);
      linkError = await updateDeviceWithSchemaFallback(link.table, link.id, {
        set_code: resolvedSetCode,
        is_assigned: Boolean(resolvedSetCode) && link.is_assigned !== false
      });
    } catch (err) {
      linkError = err;
    }
    if (linkError) {
      console.error(`[OfflineSync] Failed to link ${link.table}.${link.id} to ${link.set_code}:`, linkError);
      await saveQueueState(link.queueItem, classifySyncError(linkError), linkError);
      syncErrors.push(`LINK_DEVICE/${link.table} (${link.id}): ${linkError.message}`);
      continue;
    }
    if (!resolvedSetCode) {
      console.warn(`[OfflineSync] Set ${link.set_code} no longer exists; ${link.table}.${link.id} remains free in stock.`);
    } else if (resolvedSetCode !== link.set_code) {
      console.info(`[OfflineSync] Relinked ${link.table}.${link.id} from ${link.set_code} to ${resolvedSetCode}.`);
    }
    await dequeueOfflineAction(link.queueItem.id);
    successCount++;
  }

  const remainingQueue = await getOfflineQueue();
  if (syncErrors.length > 0 || remainingQueue.length > 0) {
    const storedErrors = remainingQueue
      .filter(item => item.lastError)
      .slice(0, 3)
      .map(item => `${item.action}: ${item.lastError}`);
    const errorDetails = syncErrors.length > 0 ? syncErrors.slice(0, 3) : storedErrors;
    const summary = `${remainingQueue.length} mục chưa đồng bộ. ${errorDetails.join(' | ')}`;
    console.error('[OfflineSync] Partial sync completed:', summary);
    if (onStatusChange) onStatusChange('error', remainingQueue.length, summary);
    window.dispatchEvent(new CustomEvent('nasun-sync-partial', {
      detail: { synced: successCount, remaining: remainingQueue.length, errors: syncErrors.slice(0, 10) }
    }));
    return false;
  }

  console.log(`[OfflineSync] Sync complete! Successfully synced ${successCount} actions.`);
  if (onStatusChange) onStatusChange('idle', 0);
  window.dispatchEvent(new CustomEvent('nasun-sync-completed', { detail: { synced: successCount } }));
  return true;
}

export function syncOfflineQueue(onStatusChange) {
  if (activeSyncPromise) return activeSyncPromise;
  const runSync = () => processOfflineQueue(onStatusChange);
  const syncTask = navigator.locks?.request
    ? navigator.locks.request('nasun-offline-sync', { mode: 'exclusive' }, runSync)
    : runSync();
  activeSyncPromise = syncTask
    .finally(() => {
      activeSyncPromise = null;
    });
  return activeSyncPromise;
}

/**
 * Cache list data for offline reading
 */
export function cacheOfflineData(key, data) {
  setCache(key, data);
}

/**
 * Retrieve cached list data for offline reading
 */
export async function getCachedOfflineData(key, fallback = []) {
  return await getCache(key, fallback);
}

function normalizeDevicePayload(payload) {
  const { isAssigned, setCode, createdAt, updatedAt, isNew, isUpdated, sourceId, ...dbPayload } = payload || {};
  if (isAssigned !== undefined) dbPayload.is_assigned = Boolean(isAssigned);
  if (setCode !== undefined) dbPayload.set_code = setCode || null;
  return dbPayload;
}

function applyRequiredDeviceDefaults(table, payload) {
  const missingSerial = !payload.serial || ['N/A', '—', 'null', 'undefined'].includes(String(payload.serial).trim());
  if (missingSerial) payload.serial = `AUTO-${payload.id}`;
  payload.is_assigned = Boolean(payload.is_assigned);

  if (table === 'dispensers') {
    payload.model = payload.model || 'Satint';
    const allowedStatuses = ['Mới 100%', 'Đang chạy tốt', 'Cần bảo trì', 'Hỏng đầu phun', 'Hỏng nặng'];
    if (!allowedStatuses.includes(payload.status)) payload.status = 'Đang chạy tốt';
    return;
  }

  if (table === 'mixers') {
    payload.model = payload.model || 'Satint ST-50';
    const allowedTypes = ['Lắc xoay khép kín', 'Lắc rung đứng', 'Lắc rung ngang', 'Lắc mâm xoay'];
    if (!allowedTypes.includes(payload.type)) payload.type = 'Lắc xoay khép kín';
    const allowedStatuses = ['Mới 100%', 'Đang chạy tốt', 'Cần bảo trì', 'Hỏng motor', 'Hỏng nặng', 'Hỏng đầu phun'];
    if (!allowedStatuses.includes(payload.status)) payload.status = 'Đang chạy tốt';
    return;
  }

  if (table === 'computers') {
    payload.type = payload.type === 'Case' ? 'Case' : 'AIO';
    payload.os = payload.os || 'Windows 10 LTSC';
    payload.specs = payload.specs || '';
    const allowedNetworks = ['Có mạng LAN', 'Có mạng Wifi', 'Không có mạng'];
    if (!allowedNetworks.includes(payload.network)) payload.network = 'Có mạng LAN';
    if (!payload.status) payload.status = 'Đang chạy tốt';
    return;
  }

  if (table === 'printers') {
    payload.model = payload.model || 'QL700';
    const allowedConnections = ['USB', 'LAN', 'Bluetooth', 'Wifi'];
    if (!allowedConnections.includes(payload.connection)) payload.connection = 'USB';
    const allowedStatuses = ['Mới 100%', 'Đang chạy tốt', 'Cần bảo trì', 'Hỏng đầu in', 'Hỏng đầu phun', 'Hỏng nặng'];
    if (!allowedStatuses.includes(payload.status)) payload.status = 'Đang chạy tốt';
  }
}
