export const SYNC_CONTRACT_VERSION = 1;

const ENTITY_BY_ACTION = Object.freeze({
  ADD_NPP: 'distributors', EDIT_NPP: 'distributors', DELETE_NPP: 'distributors',
  ADD_DEVICE: 'device', EDIT_DEVICE: 'device', DELETE_DEVICE: 'device', LINK_DEVICE: 'device',
  ASSEMBLE_SET: 'system_sets', UPDATE_SYSTEM_SET: 'system_sets', DELETE_SYSTEM_SET: 'system_sets',
  ADD_REPAIR: 'repair_tickets', EDIT_REPAIR: 'repair_tickets', DELETE_REPAIR: 'repair_tickets',
  ADD_AUDIT_LOG: 'audit_logs', UPDATE_AUDIT_LOG: 'audit_logs', DELETE_AUDIT_LOG: 'audit_logs',
  EXECUTE_WORKFLOW: 'workflow'
});

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== '');
}

export function resolveSyncEntity(action, payload = {}, category = null) {
  const entityType = category || ENTITY_BY_ACTION[action] || 'unknown';
  const nested = payload.data || payload.dbPayload || {};
  const entityId = firstValue(
    payload.id, payload.targetSetCode, payload.oldSetCode, payload.set_code, payload.setCode,
    payload.code, payload.managementCode, payload.management_code,
    nested.id, nested.set_code, nested.setCode
  );
  return { entityType, entityId: entityId ? String(entityId) : null };
}

export function buildSyncEnvelope(item, deviceId = null) {
  if (!item?.operationId || !item?.action) throw new Error('INVALID_SYNC_ITEM');
  const resolved = resolveSyncEntity(item.action, item.payload, item.category);
  const entityType = item.entityType || resolved.entityType;
  const entityId = item.entityId || resolved.entityId;
  return {
    contractVersion: SYNC_CONTRACT_VERSION,
    operationId: String(item.operationId),
    deviceId: deviceId ? String(deviceId) : null,
    action: String(item.action),
    entityType,
    entityId,
    baseVersion: Number.isInteger(item.baseVersion) ? item.baseVersion : null,
    schemaVersion: Number(item.schemaVersion || 1),
    engineVersion: Number(item.engineVersion || 1),
    occurredAt: new Date(item.timestamp || item.createdAt || Date.now()).toISOString(),
    payload: item.payload || {}
  };
}
