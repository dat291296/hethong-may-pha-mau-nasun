import { parseScannedPayload } from './qrPayload.js';

const deviceSerials = device => [device?.serial, device?.serialNumber, device?.serial_number].filter(Boolean).map(String);
const setSerials = set => [set?.dispenserSerial, set?.mixerSerial, set?.computerSerial, set?.printerSerial, set?.pcSerial].filter(Boolean).map(String);
const nppIdOfSet = set => set?.nppId ?? set?.npp_id ?? null;

export function resolveScannedCode(rawValue, { npps = [], systemSets = [], devices = [] } = {}) {
  let parsed;
  try { parsed = typeof rawValue === 'object' && rawValue?.kind ? rawValue : parseScannedPayload(rawValue); }
  catch (error) { return { error: error.message, type: null, npp: null, sets: [], device: null }; }

  let npp = null;
  let sets = [];
  let device = null;
  let highlightedSetCode = null;

  if (parsed.kind === 'token') {
    const tokens = npps.filter(item => item.qrToken === parsed.value || item.qr_token === parsed.value);
    const hasSerial = devices.some(item => deviceSerials(item).some(serial => serial.toUpperCase() === parsed.value.toUpperCase()))
      || systemSets.some(item => setSerials(item).some(serial => serial.toUpperCase() === parsed.value.toUpperCase()));
    if (tokens.length > 1 || (!parsed.explicitToken && tokens.length && hasSerial)) {
      return { error: 'Mã trùng giữa nhiều hồ sơ. Quét đường dẫn QR đầy đủ hoặc mở thiết bị để đối chiếu.', type: parsed.kind, npp: null, sets: [], device: null };
    }
    npp = tokens[0] || null;
    if (!npp && !parsed.explicitToken && hasSerial) parsed = { kind: 'device', value: parsed.value };
  }
  if (parsed.kind === 'npp') npp = npps.find(item => String(item.code || item.storedCode || item.id).toUpperCase() === parsed.value) || null;
  if (parsed.kind === 'set') {
    sets = systemSets.filter(item => String(item.setCode || item.set_code).toUpperCase() === parsed.value.toUpperCase());
    highlightedSetCode = sets[0]?.setCode || sets[0]?.set_code || null;
  }
  if (parsed.kind === 'device') {
    const matches = devices.filter(item => deviceSerials(item).some(serial => serial.toUpperCase() === parsed.value.toUpperCase()));
    if (matches.length > 1) return { error: 'Serial trùng ở nhiều thiết bị. Cần đối chiếu lại hồ sơ.', type: parsed.kind, npp: null, sets: [], device: null };
    if (matches.length === 1) {
      device = matches[0];
      const assignedCode = device.setCode || device.set_code;
      if (assignedCode) {
        sets = systemSets.filter(item => String(item.setCode || item.set_code) === String(assignedCode));
        highlightedSetCode = assignedCode;
      } else if (device.isAssigned !== false && device.is_assigned !== false) {
        sets = systemSets.filter(item => setSerials(item).some(serial => serial.toUpperCase() === parsed.value.toUpperCase()));
        highlightedSetCode = sets[0]?.setCode || null;
      } else return { error: 'Thiết bị đang trong kho, chưa gán vào bộ máy hoặc NPP.', type: parsed.kind, npp: null, sets: [], device };
    } else {
      sets = systemSets.filter(item => setSerials(item).some(serial => serial.toUpperCase() === parsed.value.toUpperCase()));
      if (sets.length > 1) return { error: 'Serial trùng ở nhiều bộ máy. Cần đối chiếu lại hồ sơ.', type: parsed.kind, npp: null, sets: [], device: null };
      if (sets.length === 1) highlightedSetCode = sets[0].setCode;
    }
  }

  if (!npp && sets.length) npp = npps.find(item => String(item.id) === String(nppIdOfSet(sets[0]))) || null;
  if (!npp) return { error: 'Không tìm thấy NPP hoặc bộ máy trong dữ liệu đã đồng bộ.', type: parsed.kind, npp: null, sets, device };
  if (!sets.length) sets = systemSets.filter(item => String(nppIdOfSet(item)) === String(npp.id));
  return { type: parsed.kind, npp, sets, device, highlightedSetCode };
}
