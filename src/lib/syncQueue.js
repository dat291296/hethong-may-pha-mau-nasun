import { userErrorMessage } from '../security/userError.js';
import { resolveSyncEntity, SYNC_CONTRACT_VERSION } from './syncContract.js';

export const QUEUE_SCHEMA_VERSION = 3;
export const SYNC_ENGINE_VERSION = 2;
export const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
export const MAX_SYNC_ATTEMPTS = 12;

export function createOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function migrateQueueItem(item, now = Date.now()) {
  const invalidPayload=item && Object.hasOwn(item,'payload') && (!item.payload || typeof item.payload!=='object' || Array.isArray(item.payload));
  const invalidVersion=['schemaVersion','engineVersion','contractVersion'].some(key=>item?.[key]!=null&&(!Number.isSafeInteger(Number(item[key]))||Number(item[key])<1));
  const invalidBase=item?.baseVersion!=null&&(!Number.isSafeInteger(item.baseVersion)||item.baseVersion<0);
  if(invalidPayload||invalidVersion||invalidBase)return {...item,status:'needs_review',lastErrorCode:'INVALID_OFFLINE_DATA',lastError:'Dữ liệu chờ gửi chưa hợp lệ. Bản gốc được giữ để kiểm tra, không tự động gửi.'};
  // An older client must never downgrade or reinterpret a newer queued intent.
  if (Number(item?.schemaVersion || 0) > QUEUE_SCHEMA_VERSION
    || Number(item?.engineVersion || 0) > SYNC_ENGINE_VERSION
    || Number(item?.contractVersion || 0) > SYNC_CONTRACT_VERSION) {
    return { ...item, status: 'needs_review', lastErrorCode: 'OFFLINE_APP_UPDATE_REQUIRED',
      lastError: 'Thao tác được tạo bằng phiên bản mới hơn. Cập nhật ứng dụng để tiếp tục; dữ liệu vẫn được giữ.' };
  }
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
  const needsReviewCodes = new Set(['OFFLINE_SCOPE_INVALID','OFFLINE_GRANT_WRITE_FAILED','REVISION_REQUIRED','SCHEMA_MIGRATION_REQUIRED','WORKFLOW_MIGRATION_REQUIRED','23502', '23503', '23505', '23514', '22P02', 'PGRST204', '42501', 'PGRST301', 'PGRST302', 'PT409', 'WRITE_CONFLICT', 'PERSISTENCE_DENIED', 'AUDIT_IMMUTABLE', 'OFFLINE_OWNER_CHANGED', 'SESSION_REJECTED', '401', '403', '409', '422']);
  if ([400, 401, 403, 409, 422].includes(Number(error?.status))) return 'needs_review';
  if (needsReviewCodes.has(code) || /schema cache|constraint|invalid input syntax|duplicate key|sync_conflict|permission denied|jwt expired|account_disabled|reauthentication_required/.test(message)) {
    return 'needs_review';
  }
  return 'retry_wait';
}

export function getRetryDelay(attempts) {
  return Math.min(MAX_RETRY_DELAY_MS, 2000 * (2 ** Math.min(Number(attempts || 0), 8)));
}

export function resolveFailureState(item, error, now = Date.now()) {
  const attempts = Number(item?.attempts || 0) + 1;
  const classified = classifySyncError(error);
  const status = classified === 'retry_wait' && attempts >= MAX_SYNC_ATTEMPTS ? 'dead_letter' : classified;
  return {
    status,
    attempts,
    lastError: userErrorMessage(error),
    lastErrorCode: String(error?.code || 'SYNC_OPERATION_FAILED'),
    nextAttemptAt: status === 'retry_wait' ? now + getRetryDelay(attempts) : 0,
    updatedAt: now
  };
}
