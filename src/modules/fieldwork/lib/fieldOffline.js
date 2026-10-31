import { searchText } from './teamWorkspace.js';
import { requireUniqueDataRows } from '../../../shared/data-access/dataIntegrity.js';

export const FIELD_PACK_TTL = 8 * 60 * 60 * 1000;
export const FIELD_PACK_KEY = 'field-pack:v1';
const copyFields = (row, fields) => Object.fromEntries(fields.filter(key => row?.[key] !== undefined).map(key => [key, row[key]]));

export function buildFieldPack({ owner, machines, npps = [], repairs = [], selected, now = Date.now() }) {
  if (!owner || !Array.isArray(selected) || !selected.length || selected.length > 20) throw new Error('Chọn từ 1 đến 20 bộ máy để tải.');
  const requested = new Set(selected);
  if(requested.size!==selected.length)throw new Error('Danh sách bộ máy bị trùng. Hãy chọn lại.');
  const rows = machines.filter(row => requested.has(row.setCode));
  requireUniqueDataRows(rows,'setCode');
  requireUniqueDataRows(npps,'id');
  if (rows.length !== requested.size) throw new Error('Có bộ máy chưa tải được hoặc không còn trong danh sách hiện tại.');
  const nppIds = new Set(rows.map(row => row.nppId));
  const pack = {
    version: 1, owner, savedAt: now, expiresAt: now + FIELD_PACK_TTL,
    machines: rows.map(row => copyFields(row, ['setCode','nppId','nppName','region','status','dispenserModel','dispenserSerial','mixerModel','mixerSerial','computerModel','computerSerial','printerModel','printerSerial','lastMaintenanceDate','nextMaintenanceDue','dbRevision','updatedAt'])),
    npps: npps.filter(row => nppIds.has(row.id)).map(row => copyFields(row, ['id','code','name','region','address','contactPerson','phone'])),
    repairs: repairs.filter(row => requested.has(row.setCode) || nppIds.has(row.nppId)).slice(0, 100).map(row => copyFields(row, ['id','setCode','nppId','date','productCategory','machineModel','serial','issue','problemDescription','errorDescription','processingStatus','customerReturnStatus'])),
    excluded: ['Ảnh và tài liệu chưa được tải riêng không có trong gói này.'],
    warnings:rows.filter(row=>row.nppId&&!npps.some(npp=>npp.id===row.nppId)).map(row=>({code:'NPP_NOT_IN_SNAPSHOT',setCode:row.setCode})),
  };
  if (new TextEncoder().encode(JSON.stringify(pack)).byteLength > 2 * 1024 * 1024) throw new Error('Gói hồ sơ quá lớn. Hãy chọn ít bộ máy hơn.');
  return pack;
}

export function readFieldPack(pack, owner, query = '', now = Date.now()) {
  if (!pack || pack.version !== 1 || pack.owner !== owner) return { state: 'missing', machines: [] };
  if (!Number.isFinite(pack.expiresAt) || now >= pack.expiresAt || now < pack.savedAt) return { state: 'expired', machines: [], savedAt: pack.savedAt };
  const term = searchText(query.trim());
  return { state: 'ready', savedAt: pack.savedAt, expiresAt: pack.expiresAt,
    machines: pack.machines.filter(row => searchText(`${row.setCode} ${row.nppName || ''} ${row.dispenserSerial || ''}`).includes(term)) };
}

export const OFFLINE_ACTIONS = Object.freeze({
  repair: { label: 'Phiếu sửa chữa', mode: 'draft' },
  maintenance: { label: 'Checklist bảo trì', mode: 'draft' },
  notes: { label: 'Thông tin mô tả', mode: 'queue' },
  allocation: { label: 'Cấp phát / thay thiết bị', mode: 'online' },
  withdrawal: { label: 'Thu hồi', mode: 'online' },
  approval: { label: 'Chốt / duyệt phiếu', mode: 'online' },
  account: { label: 'Tài khoản / phân quyền', mode: 'online' },
  audit: { label: 'Nhật ký tác nghiệp', mode: 'immutable' },
});

export function requireOfflineAction(kind, online) {
  const policy = OFFLINE_ACTIONS[kind];
  if (!policy || policy.mode === 'immutable') throw Object.assign(new Error('Không được sửa hoặc xóa nhật ký tác nghiệp.'), { code: 'AUDIT_IMMUTABLE' });
  if (policy.mode === 'online' && !online) throw Object.assign(new Error('Thao tác này cần có mạng để xác nhận; chỉ được chuẩn bị bản nháp.'), { code: 'ONLINE_REQUIRED' });
  return policy;
}

// Transport and storage adapters let web and future native clients share invariants.
// The demo supplies a synthetic server; this does not replace production RPCs.
export function createFieldSyncProtocol({ owner, load, save, send, pull, lock, now = Date.now, id = () => crypto.randomUUID() }) {
  const checkOwner = () => { const value = owner(); if (!value) throw new Error('AUTH_REQUIRED'); return value; };
  const initial = account => ({ version: 1, owner: account, operations: [], rows: {}, cursor: 0, receipts: [] });
  async function document(account) {
    const state = await load(account) || initial(account);
    if (state.version !== 1 || state.owner !== account || !Array.isArray(state.operations)) throw new Error('UNSUPPORTED_OFFLINE_DOCUMENT');
    if (owner() !== account) throw new Error('OFFLINE_OWNER_CHANGED');
    return structuredClone(state);
  }
  async function write(account, state) {
    if (owner() !== account) throw new Error('OFFLINE_OWNER_CHANGED');
    if (await save(account, state) !== true) throw new Error('DRAFT_WRITE_FAILED');
    if (owner() !== account) throw new Error('OFFLINE_OWNER_CHANGED');
  }
  async function edit(task) {
    const account = checkOwner();
    return lock(account, async () => { const state = await document(account); return task(account, state); });
  }
  return {
    snapshot: () => document(checkOwner()),
    stage: (kind, entityId, baseVersion, payload, intentId = null) => edit(async (account, state) => {
      const policy = requireOfflineAction(kind, true);
      if (state.operations.length >= 250) throw new Error('OFFLINE_DOCUMENT_FULL');
      if (!entityId || !Number.isSafeInteger(baseVersion) || baseVersion < 0 || !payload || typeof payload !== 'object') throw new Error('INVALID_OFFLINE_OPERATION');
      if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 12 * 1024 * 1024) throw new Error('OFFLINE_PAYLOAD_TOO_LARGE');
      const previous = intentId && state.operations.find(row => row.id === intentId);
      if (previous) {
        if (previous.kind !== kind || previous.entityId !== entityId || previous.baseVersion !== baseVersion) throw new Error('OFFLINE_INTENT_MISMATCH');
        if (JSON.stringify(previous.payload) === JSON.stringify(payload)) return previous;
        if (previous.status !== 'draft') throw new Error('Bản nháp đã vào hàng chờ. Hãy tạo bản nháp mới để ghi nhận thay đổi tiếp theo.');
        previous.payload = structuredClone(payload); await write(account, state); return previous;
      }
      const operation = { id: intentId || id(), owner: account, kind, entityId, baseVersion, payload: structuredClone(payload), status: 'draft', confirmationRequired: policy.mode === 'online', createdAt: now(), attempts: 0 };
      state.operations.push(operation); await write(account, state); return operation;
    }),
    submit: (operationId, { online = false, confirm = false } = {}) => edit(async (account, state) => {
      const operation = state.operations.find(row => row.id === operationId);
      if (!operation || operation.status !== 'draft') throw new Error('INVALID_OFFLINE_TRANSITION');
      if (operation.confirmationRequired && (!online || !confirm)) throw new Error('ONLINE_CONFIRMATION_REQUIRED');
      operation.status = 'pending'; await write(account, state);
    }),
    rebase: (operationId, version) => edit(async (account, state) => {
      const operation = state.operations.find(row => row.id === operationId);
      if (!operation || operation.status !== 'conflict' || !Number.isSafeInteger(version) || version !== operation.serverVersion) throw new Error('CONFLICT_REVIEW_REQUIRED');
      // Preserve the original rejected edit as evidence and create a new intent.
      state.operations.push({ ...structuredClone(operation), id: id(), baseVersion: version, status: 'draft', supersedes: operation.id, createdAt: now(), attempts: 0 });
      operation.status = 'retained'; await write(account, state);
    }),
    resumeAuth: () => edit(async (account, state) => {
      state.operations.filter(row => row.status === 'auth_required').forEach(row => { row.status = 'pending'; });
      await write(account, state);
    }),
    sync: () => edit(async (account, state) => {
      for (const operation of state.operations) {
        if (!['pending','retry_wait'].includes(operation.status) || operation.nextAttemptAt > now()) continue;
        if (owner() !== account) throw new Error('OFFLINE_OWNER_CHANGED');
        operation.attempts += 1;
        await write(account, state);
        let reply;
        try { reply = await send(structuredClone(operation)); }
        catch { operation.status = operation.attempts >= 12 ? 'review' : 'retry_wait'; operation.nextAttemptAt = now() + Math.min(300000, 2000 * 2 ** operation.attempts); await write(account, state); continue; }
        if (owner() !== account) throw new Error('OFFLINE_OWNER_CHANGED');
        if (reply?.status === 401) operation.status = 'auth_required';
        else if (reply?.status === 409) { operation.status = 'conflict'; operation.serverVersion = reply.version; }
        else if (reply?.status === 403 || reply?.status === 422) operation.status = 'review';
        else if (reply?.operationId === operation.id && reply?.ok === true && Number.isSafeInteger(reply.version) && reply.version >= operation.baseVersion) {
          operation.status = 'confirmed';
          state.receipts.push({ id: operation.id, confirmedAt: now(), version: reply.version });
        } else { operation.status = 'review'; }
        await write(account, state);
      }
      if (pull) {
        const batch = await pull(state.cursor);
        if (!batch || !Array.isArray(batch.rows) || !Number.isSafeInteger(batch.cursor) || batch.cursor < state.cursor) throw new Error('INVALID_SYNC_BATCH');
        for (const row of batch.rows) {
          if (!row.id || !Number.isSafeInteger(row.version)) throw new Error('INVALID_SYNC_ROW');
          if (row.owner && row.owner !== account) throw new Error('OFFLINE_OWNER_CHANGED');
          if (row.deleted) delete state.rows[row.id]; else Object.defineProperty(state.rows, row.id, { value: row, enumerable: true, writable: true, configurable: true });
        }
        state.cursor = batch.cursor;
        // Rows and cursor share one durable document write.
        await write(account, state);
      }
      return state;
    }),
  };
}
