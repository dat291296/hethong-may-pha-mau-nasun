import { resolveSyncEntity, SYNC_CONTRACT_VERSION } from './syncContract.js';

export const QUEUE_SCHEMA_VERSION = 3;
export const SYNC_ENGINE_VERSION = 1;
export const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

export function createOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function migrateQueueItem(item, now = Date.now()) {
  const needsEngineReset = Number(item?.engineVersion || 0) < SYNC_ENGINE_VERSION;
  const entity = resolveSyncEntity(item?.action, item?.payload, item?.category);
  return {
    ...item,
    operationId: item?.operationId || item?.id || createOperationId(),
    schemaVersion: QUEUE_SCHEMA_VERSION,
    engineVersion: SYNC_ENGINE_VERSION,
    contractVersion: SYNC_CONTRACT_VERSION,
    entityType: item?.entityType || entity.entityType,
    entityId: item?.entityId || entity.entityId,
    baseVersion: Number.isInteger(item?.baseVersion) ? item.baseVersion : null,
    status: needsEngineReset || item?.status === 'syncing' ? 'pending' : (item?.status || 'pending'),
    attempts: Number(item?.attempts || 0),
    nextAttemptAt: needsEngineReset ? 0 : Number(item?.nextAttemptAt || 0),
    lastError: needsEngineReset ? null : (item?.lastError || null),
    createdAt: item?.createdAt || item?.timestamp || now,
    updatedAt: item?.updatedAt || now,
    timestamp: item?.timestamp || item?.createdAt || now
  };
}

export function classifySyncError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '').toLowerCase();
  const needsReviewCodes = new Set(['23502', '23503', '23505', '23514', '22P02', 'PGRST204']);
  if (needsReviewCodes.has(code) || /schema cache|constraint|invalid input syntax|duplicate key/.test(message)) {
    return 'needs_review';
  }
  return 'retry_wait';
}

export function getRetryDelay(attempts) {
  return Math.min(MAX_RETRY_DELAY_MS, 2000 * (2 ** Math.min(Number(attempts || 0), 8)));
}
