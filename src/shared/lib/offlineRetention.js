// Keep pending work encrypted and owner-scoped when a session is detached.
export function retainEncryptedDraft(record, ownerId) {
  return record?.ownerId === ownerId && record.encrypted === true
    && typeof record.logicalKey === 'string' && record.logicalKey.startsWith('form-draft:');
}
