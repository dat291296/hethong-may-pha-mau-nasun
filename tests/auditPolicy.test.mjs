import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAuditAppendOnly } from '../src/lib/auditPolicy.js';
import { classifySyncError } from '../src/lib/syncQueue.js';
test('old audit changes are blocked for review while new entries and other work remain allowed', () => {
  for (const action of ['UPDATE_AUDIT_LOG','DELETE_AUDIT_LOG']) {
    assert.throws(() => assertAuditAppendOnly(action), error => error.code === 'AUDIT_IMMUTABLE' && classifySyncError(error) === 'needs_review');
  }
  for (const action of ['ADD_AUDIT_LOG','EDIT_DEVICE','DELETE_REPAIR']) assert.doesNotThrow(() => assertAuditAppendOnly(action));
});
