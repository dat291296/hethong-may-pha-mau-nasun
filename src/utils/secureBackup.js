const BACKUP_SCHEMA = 'nasun-paint-system-backup/v3';
const APP_NAME = 'Paint Tinting Manager';
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const MAX_RECORDS_PER_COLLECTION = 10_000;
const MAX_FIELDS_PER_RECORD = 100;
const MAX_STRING_LENGTH = 20_000;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const COLLECTIONS = [
  'npps',
  'dispensers',
  'mixers',
  'computers',
  'printers',
  'systemSets',
  'repairTickets',
  'auditLogs',
  'tintingLogs',
];

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertSafeValue(value, path, depth = 0) {
  if (depth > 8) throw new Error(`Dữ liệu lồng quá sâu tại ${path}.`);
  if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
    throw new Error(`Chuỗi dữ liệu quá dài tại ${path}.`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`Giá trị số không hợp lệ tại ${path}.`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeValue(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (value !== null && typeof value === 'object') {
    if (!isPlainObject(value)) throw new Error(`Đối tượng không hợp lệ tại ${path}.`);
    const keys = Object.keys(value);
    if (keys.length > MAX_FIELDS_PER_RECORD) throw new Error(`Quá nhiều trường dữ liệu tại ${path}.`);
    for (const key of keys) {
      if (BLOCKED_KEYS.has(key)) throw new Error(`Trường dữ liệu bị cấm tại ${path}.`);
      assertSafeValue(value[key], `${path}.${key}`, depth + 1);
    }
  }
}

function validateCollections(data) {
  if (!isPlainObject(data)) throw new Error('Gói sao lưu không chứa đối tượng dữ liệu hợp lệ.');
  const unknownKeys = Object.keys(data).filter((key) => !COLLECTIONS.includes(key));
  if (unknownKeys.length) throw new Error(`Gói sao lưu chứa danh mục không được phép: ${unknownKeys.join(', ')}.`);

  const normalized = {};
  let totalRecords = 0;
  for (const collection of COLLECTIONS) {
    const records = data[collection] ?? [];
    if (!Array.isArray(records)) throw new Error(`${collection} phải là một danh sách.`);
    if (records.length > MAX_RECORDS_PER_COLLECTION) {
      throw new Error(`${collection} vượt quá ${MAX_RECORDS_PER_COLLECTION} bản ghi.`);
    }
    records.forEach((record, index) => {
      if (!isPlainObject(record)) throw new Error(`${collection}[${index}] không phải bản ghi hợp lệ.`);
      assertSafeValue(record, `${collection}[${index}]`);
    });
    normalized[collection] = records;
    totalRecords += records.length;
  }
  if (totalRecords === 0) throw new Error('Gói sao lưu không có bản ghi nào.');
  return { data: normalized, totalRecords };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) throw new Error('Trình duyệt không hỗ trợ kiểm tra toàn vẹn SHA-256.');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createSecureBackup(sourceData) {
  const serializableData = JSON.parse(JSON.stringify(sourceData));
  const { data, totalRecords } = validateCollections(serializableData);
  const checksum = await sha256(stableStringify(data));
  return {
    schema: BACKUP_SCHEMA,
    appName: APP_NAME,
    version: '3.0.0',
    exportedAt: new Date().toISOString(),
    integrity: { algorithm: 'SHA-256', checksum },
    summary: Object.fromEntries(COLLECTIONS.map((key) => [`${key}Count`, data[key].length])),
    totalRecords,
    data,
  };
}

export async function parseAndValidateBackup(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Tệp sao lưu đang trống.');
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('Tệp sao lưu vượt quá giới hạn 10 MB.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Tệp không phải JSON hợp lệ.');
  }
  if (!isPlainObject(parsed)) throw new Error('Cấu trúc tệp sao lưu không hợp lệ.');
  assertSafeValue(parsed, 'backup');

  const isSignedFormat = parsed.schema === BACKUP_SCHEMA;
  const importedData = isSignedFormat ? parsed.data : (parsed.data || parsed);
  const validated = validateCollections(importedData);

  if (isSignedFormat) {
    if (parsed.appName !== APP_NAME || parsed.integrity?.algorithm !== 'SHA-256') {
      throw new Error('Thông tin nhận dạng hoặc thuật toán toàn vẹn không hợp lệ.');
    }
    const expected = await sha256(stableStringify(validated.data));
    if (expected !== parsed.integrity?.checksum) {
      throw new Error('Tệp sao lưu đã bị thay đổi hoặc bị hỏng. Không thể nhập dữ liệu.');
    }
  }

  return {
    ...validated,
    integrityVerified: isSignedFormat,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
  };
}

export { BACKUP_SCHEMA, MAX_BACKUP_BYTES };
