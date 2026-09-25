import {
  getMobileSecurityCapabilities,
  getNativeKeyAlias,
  requireNativeSecurityBridge,
} from '../platform/mobileSecurityBridge.js';

const DB_NAME = 'nasun_offline_db';
const DB_VERSION = 3;
const CRYPTO_VERSION = 2;
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

function usesNativeCrypto() {
  const capabilities = getMobileSecurityCapabilities();
  if (capabilities.platform === 'native' && !capabilities.nativeBridge) {
    requireNativeSecurityBridge();
  }
  return capabilities.nativeBridge;
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
    const keyPromise = (async () => {
      const db = await openDb();
      const existing = await requestResult(db.transaction('crypto_keys', 'readonly').objectStore('crypto_keys').get(ownerId));
      if (existing?.key) return existing.key;
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const transaction = db.transaction('crypto_keys', 'readwrite');
      transaction.objectStore('crypto_keys').put({
        ownerId,
        key,
        algorithm: 'AES-GCM',
        keyLength: 256,
        keyVersion: 1,
        createdAt: Date.now(),
      });
      await transactionDone(transaction);
      return key;
    })();
    encryptionKeyPromises.set(ownerId, keyPromise);
    keyPromise.catch(() => encryptionKeyPromises.delete(ownerId));
  }
  return encryptionKeyPromises.get(ownerId);
}

function encryptionContext(ownerId, storeName, logicalKey) {
  return `nasun|${CRYPTO_VERSION}|${ownerId}|${storeName}|${logicalKey}`;
}

function encodeBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function encryptValue(ownerId, value, storeName, logicalKey) {
  const context = encryptionContext(ownerId, storeName, logicalKey);
  if (usesNativeCrypto()) {
    const bridge = requireNativeSecurityBridge();
    const result = await bridge.encrypt({
      keyAlias: getNativeKeyAlias(ownerId),
      plaintext: encodeBase64(new TextEncoder().encode(JSON.stringify(value))),
      context,
    });
    if (!result?.iv || !result?.ciphertext) throw new Error('INVALID_NATIVE_ENCRYPTION_RESULT');
    return {
      cryptoVersion: CRYPTO_VERSION,
      cryptoProvider: 'native-keystore',
      algorithm: 'AES-GCM',
      iv: result.iv,
      ciphertext: result.ciphertext,
    };
  }
  const key = await getEncryptionKey(ownerId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const additionalData = new TextEncoder().encode(context);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, plaintext);
  return {
    cryptoVersion: CRYPTO_VERSION,
    cryptoProvider: 'webcrypto',
    algorithm: 'AES-GCM',
    iv: Array.from(iv),
    ciphertext,
  };
}

async function decryptValue(ownerId, record, storeName, logicalKey) {
  if (!record?.encrypted || !record.ciphertext || !record.iv) throw new Error('INVALID_ENCRYPTED_RECORD');
  const context = encryptionContext(ownerId, storeName, logicalKey);
  if (record.cryptoProvider === 'native-keystore') {
    const bridge = requireNativeSecurityBridge();
    const result = await bridge.decrypt({
      keyAlias: getNativeKeyAlias(ownerId),
      iv: record.iv,
      ciphertext: record.ciphertext,
      context,
    });
    if (!result?.plaintext) throw new Error('INVALID_NATIVE_DECRYPTION_RESULT');
    return JSON.parse(new TextDecoder().decode(decodeBase64(result.plaintext)));
  }
  const key = await getEncryptionKey(ownerId);
  const algorithm = { name: 'AES-GCM', iv: new Uint8Array(record.iv) };
  if ((record.cryptoVersion || 1) >= CRYPTO_VERSION) {
    algorithm.additionalData = new TextEncoder().encode(context);
  }
  const plaintext = await crypto.subtle.decrypt(
    algorithm,
    key,
    record.ciphertext,
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function putRecord(storeName, record) {
  const db = await openDb();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(record);
  await transactionDone(transaction);
}

async function upgradeEncryptedRecords(ownerId) {
  const db = await openDb();
  for (const storeName of ['cached_data', 'offline_queue']) {
    const records = await requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
    for (const record of records || []) {
      if (record?.ownerId !== ownerId || !record.encrypted || (record.cryptoVersion || 1) >= CRYPTO_VERSION) continue;
      const logicalKey = storeName === 'cached_data' ? record.logicalKey : record.itemId;
      if (!logicalKey) continue;
      try {
        const value = await decryptValue(ownerId, record, storeName, logicalKey);
        const upgraded = await encryptValue(ownerId, value, storeName, logicalKey);
        await putRecord(storeName, { ...record, ...upgraded, upgradedAt: Date.now() });
      } catch (error) {
        console.warn(`[offlineDb] Preserved legacy encrypted ${storeName} record after upgrade failure:`, error.message);
      }
    }
  }
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
      if (usesNativeCrypto()) {
        await requireNativeSecurityBridge().getOrCreateEncryptionKey({
          keyAlias: getNativeKeyAlias(ownerId),
          algorithm: 'AES-GCM',
          keyLength: 256,
          hardwareBacked: true,
        });
      } else {
        await getEncryptionKey(ownerId);
      }
      await migrateLegacyStorage(ownerId);
      await upgradeEncryptedRecords(ownerId);
      window.dispatchEvent(new CustomEvent('nasun-offline-storage-ready', { detail: { userId: ownerId } }));
      return true;
    })());
  }
  return initializationPromises.get(activeOwnerId);
}

export async function setCache(key, data) {
  try {
    const ownerId = requireOwner();
    const encrypted = await encryptValue(ownerId, data, 'cached_data', key);
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
    return await decryptValue(ownerId, record, 'cached_data', key);
  } catch (error) {
    if (error.message !== 'OFFLINE_STORAGE_OWNER_REQUIRED') console.error('[offlineDb] Error reading encrypted cache:', error.message);
    return fallback;
  }
}

export async function addToQueue(actionItem) {
  try {
    const ownerId = requireOwner();
    const encrypted = await encryptValue(ownerId, actionItem, 'offline_queue', actionItem.id);
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
    const items = await Promise.all(ownedRecords.map(record => decryptValue(ownerId, record, 'offline_queue', record.itemId)));
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
    let nativeKeyDeleted = true;
    if (usesNativeCrypto()) {
      try {
        await requireNativeSecurityBridge().deleteEncryptionKey({ keyAlias: getNativeKeyAlias(ownerId) });
      } catch (error) {
        nativeKeyDeleted = false;
        console.error('[offlineDb] Native encryption key deletion failed:', error.message);
      }
    }
    await deleteRecord('crypto_keys', ownerId);
    encryptionKeyPromises.delete(ownerId);
    initializationPromises.delete(ownerId);
    for (const storageKey of Object.keys(LEGACY_CACHE_KEYS)) localStorage.removeItem(storageKey);
    if (activeOwnerId === ownerId) {
      activeOwnerId = null;
      localStorage.removeItem(OWNER_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent('nasun-offline-storage-cleared', { detail: { userId: ownerId } }));
    return nativeKeyDeleted;
  } catch (error) {
    console.error('[offlineDb] Failed to clear offline data:', error.message);
    return false;
  }
}
