import { requireCompleteWrite } from './guardedWrite.js';

export function prepareDeviceEdit(category, form, original) {
  if (!original?.id) throw new Error('Không tìm thấy mã thiết bị gốc.');
  const serial = category === 'computer' ? (form.serial?.trim() || original.serial) : form.serial?.trim();
  if (category !== 'computer' && !serial) throw new Error('Vui lòng nhập serial thiết bị.');
  const isAssigned = Boolean(form.isAssigned && form.setCode);
  return { ...form, id: original.id, sourceId: original.id, expectedRevision: original.updatedAt, serial,
    isAssigned, setCode: isAssigned ? form.setCode : null };
}

export async function saveDeviceEdit(runQuery, table, id, updates, revision) {
  if (!revision || !Number.isFinite(Date.parse(revision))) {
    throw Object.assign(new Error('Tải lại thiết bị để lấy phiên bản mới trước khi lưu.'), { code: 'REVISION_REQUIRED' });
  }
  const result = await runQuery(client => client.rpc('edit_device_atomic', {
    p_table: table, p_id: id, p_updates: updates, p_expected_updated_at: revision,
  }));
  if (['PGRST202', '42883'].includes(result.error?.code)) {
    throw Object.assign(new Error('Database chưa có migration sửa thiết bị an toàn. Nội dung chưa được lưu.'), { code: 'SCHEMA_MIGRATION_REQUIRED' });
  }
  return requireCompleteWrite(result);
}
