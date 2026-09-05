const DB_NAME = 'nasun_offline_db';
const DB_VERSION = 1;

/**
 * Open or initialize the IndexedDB connection
 */
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Store to cache fetched data: npps, dispensers, mixers, etc.
      if (!db.objectStoreNames.contains('cached_data')) {
        db.createObjectStore('cached_data', { keyPath: 'key' });
      }

      // Store to queue offline actions (mutations)
      if (!db.objectStoreNames.contains('offline_queue')) {
        db.createObjectStore('offline_queue', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error || 'Failed to open IndexedDB');
    };
  });
}

/**
 * Store data into the cache store
 */
export async function setCache(key, data) {
  // Always write synchronously to localStorage as primary reliable fallback
  try {
    localStorage.setItem(`cached_${key}`, JSON.stringify(data));
  } catch (err) {
    console.warn('[offlineDb] localStorage quota or write error', err);
  }

  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('cached_data', 'readwrite');
      const store = transaction.objectStore('cached_data');
      const request = store.put({ key, data, timestamp: Date.now() });

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('[offlineDb] Error writing IndexedDB cache', e);
    return false;
  }
}

/**
 * Retrieve data from the cache store
 */
export async function getCache(key, fallback = []) {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const transaction = db.transaction('cached_data', 'readonly');
      const store = transaction.objectStore('cached_data');
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.data);
        } else {
          // Check fallback to localStorage
          const localCache = localStorage.getItem(`cached_${key}`);
          resolve(localCache ? JSON.parse(localCache) : fallback);
        }
      };
      request.onerror = () => {
        const localCache = localStorage.getItem(`cached_${key}`);
        resolve(localCache ? JSON.parse(localCache) : fallback);
      };
    });
  } catch (e) {
    console.error('[offlineDb] Error reading cache', e);
    const localCache = localStorage.getItem(`cached_${key}`);
    return localCache ? JSON.parse(localCache) : fallback;
  }
}

/**
 * Add action to offline queue
 */
export async function addToQueue(actionItem) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_queue', 'readwrite');
      const store = transaction.objectStore('offline_queue');
      const request = store.put(actionItem);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('[offlineDb] Error adding to queue', e);
    return false;
  }
}

/**
 * Get all actions in the queue
 */
export async function getQueue() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_queue', 'readonly');
      const store = transaction.objectStore('offline_queue');
      const request = store.getAll();

      request.onsuccess = () => {
        // Sort by timestamp to ensure actions are run in correct sequence
        const sorted = (request.result || []).sort((a, b) => a.timestamp - b.timestamp);
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('[offlineDb] Error reading queue', e);
    return [];
  }
}

/**
 * Remove an action from the queue
 */
export async function removeFromQueue(id) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_queue', 'readwrite');
      const store = transaction.objectStore('offline_queue');
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('[offlineDb] Error deleting from queue', e);
    return false;
  }
}

/**
 * Clear the entire offline queue
 */
export async function clearQueue() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_queue', 'readwrite');
      const store = transaction.objectStore('offline_queue');
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('[offlineDb] Error clearing queue', e);
    return false;
  }
}
