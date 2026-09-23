import { supabase, isSupabaseConfigured } from './supabase';
import { addToQueue, getQueue, removeFromQueue, clearQueue, setCache, getCache } from './offlineDb';

let activeSyncPromise = null;

function getActionIdentity(item) {
  const payload = item?.payload || {};
  switch (item?.action) {
    case 'EDIT_DEVICE': return `${item.action}:${item.category}:${payload.id}`;
    case 'EDIT_NPP':
    case 'EDIT_REPAIR':
    case 'UPDATE_AUDIT_LOG': return `${item.action}:${payload.id}`;
    case 'UPDATE_SYSTEM_SET': return `${item.action}:${payload.targetSetCode || payload.set_code || payload.setCode}`;
    default: return null;
  }
}

async function updateDeviceWithSchemaFallback(table, id, updates) {
  const compatibleUpdates = { ...updates };
  while (true) {
    const { error } = await supabase.from(table).update(compatibleUpdates).eq('id', id);
    if (!error) return null;
    const match = String(error.message || '').match(/Could not find the '([^']+)' column/i);
    const missingColumn = match?.[1];
    if (!missingColumn || !(missingColumn in compatibleUpdates)) return error;
    console.warn(`[OfflineSync] ${table}.${missingColumn} is absent; retrying with legacy schema.`);
    delete compatibleUpdates[missingColumn];
  }
}

/**
 * Push an action to the offline queue
 */
export async function enqueueOfflineAction(action, payload, category = null) {
  const newItem = {
    id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    action,
    payload,
    category,
    timestamp: Date.now()
  };

  // Collapse consecutive edits to the same record so a weak mobile connection
  // does not replay obsolete intermediate versions.
  const queue = await getQueue();
  const previousItem = queue.at(-1);
  if (previousItem && getActionIdentity(previousItem) === getActionIdentity(newItem)) {
    await removeFromQueue(previousItem.id);
  }
  
  await addToQueue(newItem);
  
  // Dispatch custom event to trigger sync warning badge or sync attempt
  window.dispatchEvent(new Event('offline-queue-updated'));
  
  console.log(`[OfflineSync] Enqueued action: ${action}`, payload);
}

/**
 * Get all enqueued offline actions
 */
export async function getOfflineQueue() {
  return await getQueue();
}

/**
 * Remove an action from the queue by ID
 */
export async function dequeueOfflineAction(id) {
  await removeFromQueue(id);
  window.dispatchEvent(new Event('offline-queue-updated'));
}

/**
 * Clear the entire offline queue
 */
export async function clearOfflineQueue() {
  await clearQueue();
  window.dispatchEvent(new Event('offline-queue-updated'));
}

/**
 * Process the offline queue and upload all actions to Supabase.
 * Returns true if all synchronized successfully.
 */
async function processOfflineQueue(onStatusChange) {
  if (!isSupabaseConfigured || !navigator.onLine) {
    return false;
  }

  const queue = await getOfflineQueue();
  if (queue.length === 0) {
    window.dispatchEvent(new CustomEvent('nasun-sync-completed', { detail: { synced: 0 } }));
    return true;
  }

  console.log(`[OfflineSync] Starting sync of ${queue.length} actions...`);
  if (onStatusChange) onStatusChange('syncing', queue.length);

  let successCount = 0;

  for (const item of queue) {
    try {
      console.log(`[OfflineSync] Syncing action ${item.action}...`, item.payload);
      let error = null;

      switch (item.action) {
        case 'ADD_NPP':
          const { error: addNppErr } = await supabase.from('distributors').insert(item.payload);
          error = addNppErr;
          break;
        case 'EDIT_NPP':
          const { error: editNppErr } = await supabase.from('distributors').update(item.payload).eq('id', item.payload.id);
          error = editNppErr;
          break;
        case 'ADD_DEVICE':
          const { error: addDevErr } = await supabase.from(item.category).insert(normalizeDevicePayload(item.payload));
          error = addDevErr;
          break;
        case 'EDIT_DEVICE':
          {
            const devicePayload = normalizeDevicePayload(item.payload);
            const { id, ...deviceUpdates } = devicePayload;
            error = await updateDeviceWithSchemaFallback(item.category, id, deviceUpdates);
          }
          break;
        case 'DELETE_DEVICE':
          const { error: delDevErr } = await supabase.from(item.category).delete().eq('id', item.payload.id);
          error = delDevErr;
          break;
        case 'ASSEMBLE_SET':
          const { error: assembleErr } = await supabase.from('system_sets').insert(item.payload);
          error = assembleErr;
          break;
        case 'UPDATE_SYSTEM_SET':
          {
            const targetSetCode = item.payload.targetSetCode || item.payload.set_code || item.payload.setCode;
            const updatePayload = item.payload.data || item.payload.dbPayload || item.payload;
            if (!targetSetCode || !updatePayload || typeof updatePayload !== 'object') {
              throw new Error('Invalid UPDATE_SYSTEM_SET queue payload');
            }
            const { error: updateSetErr } = await supabase.from('system_sets').update(updatePayload).eq('set_code', targetSetCode);
            error = updateSetErr;
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
          const { error: addRepErr } = await supabase.from('repair_tickets').insert(item.payload);
          error = addRepErr;
          break;
        case 'DELETE_NPP':
          const { error: delNppErr } = await supabase.from('distributors').delete().eq('id', item.payload.id);
          error = delNppErr;
          break;
        case 'EDIT_REPAIR':
          const { error: editRepErr } = await supabase.from('repair_tickets').update(item.payload).eq('id', item.payload.id);
          error = editRepErr;
          break;
        case 'DELETE_REPAIR':
          const { error: delRepErr } = await supabase.from('repair_tickets').delete().eq('id', item.payload.id);
          error = delRepErr;
          break;
        case 'ADD_AUDIT_LOG':
          const { error: auditErr } = await supabase.from('audit_logs').insert(item.payload);
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
        throw new Error(error.message);
      }

      // Success, remove from queue
      await dequeueOfflineAction(item.id);
      successCount++;
      
    } catch (err) {
      console.error(`[OfflineSync] Failed to sync action ${item.id}:`, err);
      if (onStatusChange) onStatusChange('error', queue.length - successCount, err.message);
      return false;
    }
  }

  console.log(`[OfflineSync] Sync complete! Successfully synced ${successCount} actions.`);
  if (onStatusChange) onStatusChange('idle', 0);
  window.dispatchEvent(new CustomEvent('nasun-sync-completed', { detail: { synced: successCount } }));
  return true;
}

export function syncOfflineQueue(onStatusChange) {
  if (activeSyncPromise) return activeSyncPromise;
  activeSyncPromise = processOfflineQueue(onStatusChange)
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
