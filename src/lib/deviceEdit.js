import { requireCompleteWrite } from './guardedWrite.js';

export function requireUniqueDeviceSerial(serial, originalId, devices, sets, npps = []) {
  const normalized = value => String(value || '').trim().toLocaleUpperCase('en');
  const conflicts = devices.filter(device => device.id !== originalId && normalized(device.serial) === normalized(serial));
  if (!normalized(serial) || !conflicts.length) return;
  const details = conflicts.map(device => {
    const machine = sets.find(set => set.setCode === device.setCode);
    const npp = npps.find(item => item.id === machine?.nppId);
    const owner = npp?.name || machine?.nppName || (device.setCode ? `Bộ máy ${device.setCode}` : 'Trong kho');
    return `Thiết bị ${device.id} · ${device.model || device.type || 'Chưa có model'} · Serial: ${device.serial}\nNPP: ${owner}${device.setCode ? ` · Bộ máy: ${device.setCode}` : ''}`;
  }).join('\n\n');
  throw Object.assign(new Error(`Serial đã được sử dụng:\n\n${details}\n\nHãy nhập đúng serial của thiết bị đang sửa. Nội dung chưa được lưu.`), { code: 'DEVICE_SERIAL_CONFLICT' });
}

export function findAssignedDevice(category, devices, machine) {
  if (!machine) return null;
  const id = machine[`${category}Id`];
  const matches = devices.filter(device => id ? device.id === id : device.setCode === machine.setCode);
  return matches.length === 1 ? matches[0] : null;
}

export function prepareDeviceEdit(category, form, original) {
  if (!original?.id) throw new Error('Không tìm thấy mã thiết bị gốc.');
  const inputSerial = form.serial?.trim();
  const serial = inputSerial && inputSerial === original.serial?.trim() ? original.serial
    : category === 'computer' ? (inputSerial || original.serial) : inputSerial;
  if (category !== 'computer' && !serial) throw new Error('Vui lòng nhập serial thiết bị.');
  const isAssigned = Boolean(form.isAssigned && form.setCode);
  return { ...form, id: original.id, sourceId: original.id, expectedRevision: original.updatedAt, originalSerial: original.serial, serial,
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
  if (result.error?.code === '23505' && /serial_key/.test(result.error.message || '')) {
    throw Object.assign(new Error('Số serial này đã được sử dụng cho thiết bị khác. Hãy giữ serial gốc hoặc nhập đúng serial của máy. Nội dung chưa được lưu.'), { code: 'DEVICE_SERIAL_CONFLICT' });
  }
  return requireCompleteWrite(result);
}
