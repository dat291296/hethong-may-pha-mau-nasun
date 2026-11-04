import React, { useEffect, useMemo, useState } from 'react';
import SafePortal from '../../../shared/components/SafePortal.jsx';
import { safeQuery, supabase } from '../../../shared/data-access/supabase.js';
import { addToQueue, getOfflineOwner, setCache } from '../../../shared/sync/offlineDb.js';
import { dequeueOfflineAction } from '../../../shared/sync/offlineSync.js';

const TABLES = { distributors: 'distributors', dispenser: 'dispensers', dispensers: 'dispensers', mixer: 'mixers', mixers: 'mixers', computer: 'computers', computers: 'computers', printer: 'printers', printers: 'printers', system_sets: 'system_sets', repair_tickets: 'repair_tickets' };
const SNAPSHOT_COLUMNS = Object.freeze({
  distributors: 'id,npp_code,updated_at,created_at,name,phone,contact_person,salesperson,brand,region,province,address,location_coordinates,google_maps_url,status,photos',
  dispensers: 'id,serial,status,is_assigned,set_code,model,created_at,updated_at',
  mixers: 'id,serial,status,is_assigned,set_code,model,type,created_at,updated_at',
  computers: 'id,serial,status,is_assigned,set_code,type,os,specs,network,stabilizer,tinting_software,software_version,created_at,updated_at',
  printers: 'id,serial,status,is_assigned,set_code,model,connection,created_at,updated_at',
  system_sets: 'set_code,npp_id,npp_name,region,province,status,dispenser_id,dispenser_model,dispenser_serial,mixer_id,mixer_model,mixer_serial,computer_id,computer_type,computer_serial,printer_id,printer_serial,tinting_software,software_version,agent_status,install_date,last_maintenance_date,next_maintenance_due,technician,salesperson,stabilizer,notes,installation_photos,created_at,updated_at',
  repair_tickets: 'id,ticket_code,date,technician,npp_id,npp_name,product_category,machine_model,serial_number,error_description,error_category,action_direction,replacement_condition,processing_status,customer_return_status,notes,photos,asset_code,field_visit_status,service_checklist,materials_used,before_photos,after_photos,npp_confirmation,sla_due_at,completed_at,assigned_user_id,assignment_due_date,record_version,last_updated_at,last_updated_by,created_at,updated_at',
});
const LABELS = { npp_code: 'Mã NPP', name: 'Tên', phone: 'Điện thoại', contact_person: 'Người liên hệ', region: 'Khu vực', province: 'Tỉnh / thành', serial: 'Serial', model: 'Model', status: 'Trạng thái', set_code: 'Mã bộ máy', notes: 'Ghi chú', processing_status: 'Trạng thái phiếu', error_description: 'Mô tả lỗi', assigned_user_id: 'Người được giao', assignment_due_date: 'Hạn xử lý' };
const RESOLVABLE_ACTIONS = new Set(['EDIT_NPP', 'EDIT_DEVICE', 'LINK_DEVICE', 'UPDATE_SYSTEM_SET', 'EDIT_REPAIR']);

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export default function ConflictResolutionModal({ item, onClose }) {
  const [serverRecord, setServerRecord] = useState(null);
  const [serverVersion, setServerVersion] = useState(null);
  const [choices, setChoices] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const owner = getOfflineOwner();
  const payloadContainer = item?.payload || {};
  const payloadKey = ['data', 'dbPayload', 'updates', 'update'].find(key => payloadContainer[key] && typeof payloadContainer[key] === 'object' && !Array.isArray(payloadContainer[key]));
  const payload = payloadKey ? payloadContainer[payloadKey] : payloadContainer;
  const table = TABLES[item?.entityType] || TABLES[item?.category];
  const rowId = item?.entityId || payloadContainer.id || payloadContainer.targetSetCode || payloadContainer.set_code || payload.id || payload.set_code;
  const idColumn = table === 'system_sets' ? 'set_code' : 'id';
  const canResolve = RESOLVABLE_ACTIONS.has(item?.action);
  const immutableAuditAction = ['UPDATE_AUDIT_LOG', 'DELETE_AUDIT_LOG'].includes(item?.action);

  useEffect(() => {
    let disposed = false;
    async function loadServerRecord() {
      if (immutableAuditAction) {
        setMessage('Nhật ký kiểm toán chỉ được thêm mới; máy chủ từ chối sửa/xóa. Không thể gửi lại thao tác cũ này. Bản ghi kiểm toán trên máy chủ được giữ nguyên.');
        setLoading(false);
        return;
      }
      if (!table || !rowId || !supabase) { setMessage('Không thể xác định bản ghi máy chủ của thao tác này.'); setLoading(false); return; }
      const entityType = item?.entityType === 'device' ? table : (item?.entityType || item?.category || table);
      const snapshotColumns = SNAPSHOT_COLUMNS[table];
      if (!snapshotColumns) { setMessage('Loại dữ liệu này chưa được phép đọc để đối chiếu. Hàng chờ được giữ nguyên.'); setLoading(false); return; }
      const [result, versionResult] = await Promise.all([
        safeQuery(client => client.from(table).select(snapshotColumns).eq(idColumn, rowId).maybeSingle(), 'loadSyncConflictSnapshot'),
        safeQuery(client => client.rpc('read_sync_entity_version', { p_entity_type: entityType, p_entity_id: String(rowId) }), 'readSyncConflictVersion'),
      ]);
      if (disposed || owner !== getOfflineOwner()) return;
      if (result.error || !result.data || versionResult.error || !Number.isSafeInteger(Number(versionResult.data))) setMessage('Không đọc được bản ghi và phiên bản máy chủ theo quyền hiện tại. Hàng chờ được giữ nguyên.');
      else { setServerRecord(result.data); setServerVersion(Number(versionResult.data)); }
      setLoading(false);
    }
    void loadServerRecord();
    return () => { disposed = true; };
  }, [idColumn, immutableAuditAction, item, owner, rowId, table]);

  const differences = useMemo(() => Object.entries(payload).filter(([key, localValue]) => {
    if (['id', 'created_at', 'updated_at', 'record_version', 'last_updated_at', 'last_updated_by'].includes(key)) return false;
    return serverRecord && JSON.stringify(localValue) !== JSON.stringify(serverRecord[key]);
  }), [payload, serverRecord]);

  const saveChoices = async () => {
    if (!serverRecord || !canResolve || !Number.isSafeInteger(serverVersion) || owner !== getOfflineOwner()) return;
    setSaving(true);
    try {
      const selected = Object.fromEntries(differences.map(([key, localValue]) => [key, choices[key] === 'server' ? serverRecord[key] : localValue]));
      const nextPayload = { ...payload, ...selected };
      const saved = await setCache(`sync-conflict-resolution:v1:${item.operationId || item.id}`, { itemId: item.id, operationId: item.operationId || item.id, originalItem: item, table, entityId: rowId, choices, selected, serverRecord, savedAt: Date.now() });
      if (!saved) throw new Error('CACHE_WRITE_FAILED');
      const queued = await addToQueue({ ...item, payload: payloadKey ? { ...payloadContainer, [payloadKey]: nextPayload } : nextPayload, baseVersion: serverVersion, status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null, lastErrorCode: null, updatedAt: Date.now() });
      if (!queued) throw new Error('OFFLINE_QUEUE_WRITE_FAILED');
      window.dispatchEvent(new Event('offline-queue-updated'));
      setMessage('Đã lưu lựa chọn và cập nhật hàng chờ. Bấm “Đồng bộ ngay” để gửi lại theo phiên bản máy chủ vừa đọc.');
    } catch {
      setMessage('Chưa lưu được lựa chọn. Giữ nguyên hàng chờ và thử lại.');
    } finally { setSaving(false); }
  };

  const archiveAndRemoveImmutableAction = async () => {
    if (!immutableAuditAction || !item?.id || saving || owner !== getOfflineOwner()) return;
    setSaving(true);
    try {
      const archiveKey = `immutable-audit-review:v1:${item.id}`;
      const archived = await setCache(archiveKey, { originalItem: item, archivedAt: Date.now(), owner });
      if (!archived) throw new Error('LOCAL_ARCHIVE_FAILED');
      await dequeueOfflineAction(item.id);
      window.dispatchEvent(new Event('offline-queue-updated'));
      setMessage('Đã lưu nguyên lệnh và thông tin đồng bộ trên thiết bị, sau đó gỡ riêng lệnh bị máy chủ cấm khỏi hàng chờ. Nhật ký kiểm toán trên máy chủ không bị thay đổi.');
    } catch {
      setMessage('Chưa hoàn tất. Nếu bản lưu cục bộ đã được ghi, lệnh vẫn còn trong hàng chờ; hãy thử lại sau.');
    } finally { setSaving(false); }
  };

  return <SafePortal><div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}><section className="modal-content conflict-resolution-modal" role="dialog" aria-modal="true" aria-labelledby="conflict-resolution-title"><header className="modal-header"><div><h2 id="conflict-resolution-title">Đối chiếu xung đột</h2><p>{item?.action} · {rowId}</p></div><button type="button" className="btn btn-secondary" onClick={onClose} aria-label="Đóng đối chiếu">Đóng</button></header><div className="modal-body"><p className="resource-muted">So sánh giá trị đang chờ với bản hiện tại mà tài khoản được phép đọc. Thao tác chỉ được xếp lại sau khi bạn xác nhận; máy chủ vẫn kiểm tra phiên bản khi đồng bộ.</p>{loading&&<p role="status">Đang tải bản hiện tại…</p>}{message&&<p role="status">{message}</p>}{immutableAuditAction&&<p className="resource-muted">Chọn nút dưới đây để lưu nguyên bản ghi hàng chờ được mã hóa trên thiết bị và gỡ riêng lệnh gửi không hợp lệ.</p>}{serverRecord&&(!differences.length?<p>Không thấy trường khác nhau trong phần nội dung đang chờ.</p>:<div className="conflict-diff-list">{differences.map(([key,localValue])=><article key={key} className="conflict-diff-row"><h3>{LABELS[key]||key}</h3><label><input type="radio" name={`conflict-${key}`} checked={choices[key]!=='server'} onChange={()=>setChoices(value=>({...value,[key]:'local'}))}/><span><strong>Giá trị trên thiết bị</strong><pre>{displayValue(localValue)}</pre></span></label><label><input type="radio" name={`conflict-${key}`} checked={choices[key]==='server'} onChange={()=>setChoices(value=>({...value,[key]:'server'}))}/><span><strong>Giá trị máy chủ</strong><pre>{displayValue(serverRecord[key])}</pre></span></label></article>)}</div>)}{serverRecord&&!canResolve&&<p role="status">Thao tác này cần kiểm tra thủ công; ứng dụng không tự sửa loại thao tác {item?.action}.</p>}</div><footer className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Đóng</button>{immutableAuditAction&&<button type="button" className="btn btn-primary" disabled={loading||saving} onClick={archiveAndRemoveImmutableAction}>{saving?'Đang lưu…':'Lưu bản gốc trên thiết bị và bỏ lệnh gửi'}</button>}<button type="button" className="btn btn-primary" disabled={!serverRecord||loading||saving||!differences.length||!canResolve||!Number.isSafeInteger(serverVersion)} onClick={saveChoices}>{saving?'Đang lưu…':'Áp dụng & xếp lại sync'}</button></footer></section></div></SafePortal>;
}
