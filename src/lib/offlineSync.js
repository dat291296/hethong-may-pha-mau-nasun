import { supabase, isSupabaseConfigured } from './supabase';

const QUEUE_KEY = 'nasun_offline_queue';

/**
 * Push an action to the offline queue
 */
export function enqueueOfflineAction(action, payload, category = null) {
  const queue = getOfflineQueue();
  const newItem = {
    id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    action,
    payload,
    category,
    timestamp: Date.now()
  };
  queue.push(newItem);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  
  // Dispatch custom event to trigger sync warning badge or sync attempt
  window.dispatchEvent(new Event('offline-queue-updated'));
  
  console.log(`[OfflineSync] Enqueued action: ${action}`, payload);
}

/**
 * Get all enqueued offline actions
 */
export function getOfflineQueue() {
  try {
    const queueJson = localStorage.getItem(QUEUE_KEY);
    return queueJson ? JSON.parse(queueJson) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Remove an action from the queue by ID
 */
export function dequeueOfflineAction(id) {
  const queue = getOfflineQueue();
  const filtered = queue.filter(item => item.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
  window.dispatchEvent(new Event('offline-queue-updated'));
}

/**
 * Clear the entire offline queue
 */
export function clearOfflineQueue() {
  localStorage.removeItem(QUEUE_KEY);
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

  const queue = getOfflineQueue();
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
      dequeueOfflineAction(item.id);
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
  try {
    localStorage.setItem(`cached_${key}`, JSON.stringify(data));
  } catch (e) {
    console.error('Error caching data for offline', e);
  }
}

/**
 * Retrieve cached list data for offline reading
 */
export function getCachedOfflineData(key, fallback = []) {
  try {
    const cached = localStorage.getItem(`cached_${key}`);
    return cached ? JSON.parse(cached) : fallback;
  } catch (e) {
    return fallback;
  }
}
