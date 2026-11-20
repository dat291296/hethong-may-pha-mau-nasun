// Keep pending work encrypted and owner-scoped when a session is detached.
export function retainEncryptedDraft(record, ownerId) {
  return record?.ownerId === ownerId && record.encrypted === true
    && typeof record.logicalKey === 'string' && record.logicalKey.startsWith('form-draft:');
}

// These collections contain user-authored data, not disposable server caches.
const HANDBOOK_KEYS = new Set([
  'tech_handbook_errors',
  'tech_handbook_sops',
  'tech_handbook_field_tips',
]);

export function retainEncryptedHandbook(record, ownerId) {
  return record?.ownerId === ownerId && record.encrypted === true
    && HANDBOOK_KEYS.has(record.logicalKey);
}
