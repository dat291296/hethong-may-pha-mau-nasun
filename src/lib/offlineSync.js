import { supabase, isSupabaseConfigured } from './supabase';
import { addToQueue, getQueue, removeFromQueue, clearQueue, setCache, getCache } from './offlineDb';

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
export async function syncOfflineQueue(onStatusChange) {
  if (!isSupabaseConfigured || !navigator.onLine) {
    return false;
  }

  const queue = await getOfflineQueue();
  if (queue.length === 0) {
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
          const { error: addDevErr } = await supabase.from(item.category).insert(item.payload);
          error = addDevErr;
          break;
        case 'EDIT_DEVICE':
          const { error: editDevErr } = await supabase.from(item.category).update(item.payload).eq('id', item.payload.id);
          error = editDevErr;
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
          const { error: updateSetErr } = await supabase.from('system_sets').update(item.payload).eq('set_code', item.payload.set_code || item.payload.setCode);
          error = updateSetErr;
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
        default:
          console.warn(`[OfflineSync] Unknown action type: ${item.action}`);
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
  return true;
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
