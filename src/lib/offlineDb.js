const DB_NAME = 'nasun_offline_db';
const DB_VERSION = 3;
const OWNER_STORAGE_KEY = 'nasun_offline_owner';
const CACHE_SEPARATOR = '::';
const LEGACY_CACHE_KEYS = {
  nasun_npps: 'npps',
  nasun_dispensers: 'dispensers',
  nasun_mixers: 'mixers',
  nasun_computers: 'computers',
  nasun_printers: 'printers',
  nasun_system_sets: 'system_sets',
  nasun_audit_logs: 'audit_logs',
  nasun_offline_user: 'nasun_offline_user',
  tech_handbook_errors: 'tech_handbook_errors',
  tech_handbook_field_tips: 'tech_handbook_field_tips',
  cached_npps: 'npps',
  cached_dispensers: 'dispensers',
  cached_mixers: 'mixers',
  cached_computers: 'computers',
  cached_printers: 'printers',
  cached_system_sets: 'system_sets',
  cached_audit_logs: 'audit_logs',
  cached_repair_tickets: 'repair_tickets',
  cached_locked_months: 'locked_months',
  cached_tinting_logs: 'tinting_logs',
  cached_formula_versions: 'formula_versions',
};

let dbPromise = null;
let activeOwnerId = readStoredOwner();
let ownerWaiters = [];
const encryptionKeyPromises = new Map();
const initializationPromises = new Map();

function readStoredOwner() {
  try {
    return localStorage.getItem(OWNER_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function requireOwner() {
  if (!activeOwnerId) throw new Error('OFFLINE_STORAGE_OWNER_REQUIRED');
  return activeOwnerId;
}

function waitForOwner() {
  if (activeOwnerId) return Promise.resolve(activeOwnerId);
  return new Promise(resolve => ownerWaiters.push(resolve));
}

function scopedKey(ownerId, key) {
  return `${ownerId}${CACHE_SEPARATOR}${key}`;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('cached_data')) {
        db.createObjectStore('cached_data', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('offline_queue')) {
        const queueStore = db.createObjectStore('offline_queue', { keyPath: 'id' });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('nextAttemptAt', 'nextAttemptAt', { unique: false });
        queueStore.createIndex('operationId', 'operationId', { unique: false });
      } else {
        const queueStore = event.target.transaction.objectStore('offline_queue');
        if (!queueStore.indexNames.contains('status')) queueStore.createIndex('status', 'status', { unique: false });
        if (!queueStore.indexNames.contains('nextAttemptAt')) queueStore.createIndex('nextAttemptAt', 'nextAttemptAt', { unique: false });
        if (!queueStore.indexNames.contains('operationId')) queueStore.createIndex('operationId', 'operationId', { unique: false });
      }
      if (!db.objectStoreNames.contains('crypto_keys')) {
        db.createObjectStore('crypto_keys', { keyPath: 'ownerId' });
      }
    };
    request.onsuccess = (event) => {
      const db = event.target.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = (event) => {
      dbPromise = null;
      reject(event.target.error || new Error('Failed to open IndexedDB'));
    };
    request.onblocked = () => console.warn('[offlineDb] Database upgrade is blocked by another tab.');
  });
  return dbPromise;
}

async function getEncryptionKey(ownerId) {
  if (!globalThis.crypto?.subtle) throw new Error('WEB_CRYPTO_UNAVAILABLE');
  if (!encryptionKeyPromises.has(ownerId)) {
    encryptionKeyPromises.set(ownerId, (async () => {
      const db = await openDb();
      const existing = await requestResult(db.transaction('crypto_keys', 'readonly').objectStore('crypto_keys').get(ownerId));
      if (existing?.key) return existing.key;
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const transaction = db.transaction('crypto_keys', 'readwrite');
      transaction.objectStore('crypto_keys').put({ ownerId, key, createdAt: Date.now() });
      await transactionDone(transaction);
      return key;
    })());
  }
  return encryptionKeyPromises.get(ownerId);
}

async function encryptValue(ownerId, value) {
  const key = await getEncryptionKey(ownerId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { iv: Array.from(iv), ciphertext };
}

async function decryptValue(ownerId, record) {
  if (!record?.encrypted || !record.ciphertext || !record.iv) throw new Error('INVALID_ENCRYPTED_RECORD');
  const key = await getEncryptionKey(ownerId);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
    key,
    record.ciphertext,
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function deleteRecord(storeName, key) {
  const db = await openDb();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

async function migrateLegacyStorage(ownerId) {
  const db = await openDb();
  const cacheRecords = await requestResult(db.transaction('cached_data', 'readonly').objectStore('cached_data').getAll());
  for (const record of cacheRecords || []) {
    if (record?.ownerId || !Object.prototype.hasOwnProperty.call(record || {}, 'data')) continue;
    const migrated = await setCache(record.key, record.data);
    if (migrated) await deleteRecord('cached_data', record.key);
  }

  const queueRecords = await requestResult(db.transaction('offline_queue', 'readonly').objectStore('offline_queue').getAll());
  for (const record of queueRecords || []) {
    if (record?.ownerId || record?.encrypted) continue;
    const migrated = await addToQueue(record);
    if (migrated) await deleteRecord('offline_queue', record.id);
  }

  for (const [storageKey, cacheKey] of Object.entries(LEGACY_CACHE_KEYS)) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const migrated = await setCache(cacheKey, JSON.parse(raw));
      if (migrated) localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn(`[offlineDb] Could not migrate ${storageKey}:`, error.message);
    }
  }

  console.info(`[offlineDb] Secure offline storage ready for ${ownerId.slice(0, 8)}…`);
}

export async function initializeOfflineStorage(userId) {
  if (!userId) throw new Error('OFFLINE_STORAGE_USER_REQUIRED');
  activeOwnerId = String(userId);
  ownerWaiters.forEach(resolve => resolve(activeOwnerId));
  ownerWaiters = [];
  try {
    localStorage.setItem(OWNER_STORAGE_KEY, activeOwnerId);
  } catch (error) {
    console.warn('[offlineDb] Could not persist offline owner:', error.message);
  }
  if (!initializationPromises.has(activeOwnerId)) {
    const ownerId = activeOwnerId;
    initializationPromises.set(ownerId, (async () => {
      await getEncryptionKey(ownerId);
      await migrateLegacyStorage(ownerId);
      window.dispatchEvent(new CustomEvent('nasun-offline-storage-ready', { detail: { userId: ownerId } }));
      return true;
    })());
  }
  return initializationPromises.get(activeOwnerId);
}

export async function setCache(key, data) {
  try {
    const ownerId = requireOwner();
    const encrypted = await encryptValue(ownerId, data);
    const db = await openDb();
    const transaction = db.transaction('cached_data', 'readwrite');
    transaction.objectStore('cached_data').put({
      key: scopedKey(ownerId, key), logicalKey: key, ownerId, encrypted: true,
      ...encrypted, timestamp: Date.now(),
    });
    await transactionDone(transaction);
    return true;
  } catch (error) {
    console.error('[offlineDb] Error writing encrypted cache:', error.message);
    return false;
  }
}

export async function getCache(key, fallback = []) {
  try {
    const ownerId = await waitForOwner();
    const db = await openDb();
    const record = await requestResult(db.transaction('cached_data', 'readonly').objectStore('cached_data').get(scopedKey(ownerId, key)));
    if (!record) return fallback;
    return await decryptValue(ownerId, record);
  } catch (error) {
    if (error.message !== 'OFFLINE_STORAGE_OWNER_REQUIRED') console.error('[offlineDb] Error reading encrypted cache:', error.message);
    return fallback;
  }
}

export async function addToQueue(actionItem) {
  try {
    const ownerId = requireOwner();
    const encrypted = await encryptValue(ownerId, actionItem);
    const db = await openDb();
    const transaction = db.transaction('offline_queue', 'readwrite');
    transaction.objectStore('offline_queue').put({
      id: scopedKey(ownerId, actionItem.id), itemId: actionItem.id, ownerId, encrypted: true,
      ...encrypted,
      status: actionItem.status || 'pending',
      nextAttemptAt: actionItem.nextAttemptAt || 0,
      operationId: actionItem.operationId || null,
      timestamp: actionItem.timestamp || Date.now(),
    });
    await transactionDone(transaction);
    return true;
  } catch (error) {
    console.error('[offlineDb] Error adding encrypted queue item:', error.message);
    return false;
  }
}

export async function getQueue() {
  try {
    const ownerId = await waitForOwner();
    const db = await openDb();
    const records = await requestResult(db.transaction('offline_queue', 'readonly').objectStore('offline_queue').getAll());
    const ownedRecords = (records || []).filter(record => record.ownerId === ownerId && record.encrypted);
    const items = await Promise.all(ownedRecords.map(record => decryptValue(ownerId, record)));
    return items.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  } catch (error) {
    if (error.message !== 'OFFLINE_STORAGE_OWNER_REQUIRED') console.error('[offlineDb] Error reading encrypted queue:', error.message);
    return [];
  }
}

export async function removeFromQueue(id) {
  try {
    await deleteRecord('offline_queue', scopedKey(requireOwner(), id));
    return true;
  } catch (error) {
    console.error('[offlineDb] Error deleting queue item:', error.message);
    return false;
  }
}

async function deleteOwnedRecords(storeName, ownerId) {
  const db = await openDb();
  const transaction = db.transaction(storeName, 'readwrite');
  const request = transaction.objectStore(storeName).openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    if (cursor.value?.ownerId === ownerId) cursor.delete();
    cursor.continue();
  };
  await transactionDone(transaction);
}

export async function clearQueue() {
  try {
    await deleteOwnedRecords('offline_queue', requireOwner());
    return true;
  } catch (error) {
    console.error('[offlineDb] Error clearing queue:', error.message);
    return false;
  }
}

export async function clearOfflineStorage(userId = activeOwnerId) {
  if (!userId) return true;
  const ownerId = String(userId);
  try {
    await deleteOwnedRecords('cached_data', ownerId);
    await deleteOwnedRecords('offline_queue', ownerId);
    await deleteRecord('crypto_keys', ownerId);
    encryptionKeyPromises.delete(ownerId);
    initializationPromises.delete(ownerId);
    for (const storageKey of Object.keys(LEGACY_CACHE_KEYS)) localStorage.removeItem(storageKey);
    if (activeOwnerId === ownerId) {
      activeOwnerId = null;
      localStorage.removeItem(OWNER_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent('nasun-offline-storage-cleared', { detail: { userId: ownerId } }));
    return true;
  } catch (error) {
    console.error('[offlineDb] Failed to clear offline data:', error.message);
    return false;
  }
}
