import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUEUE_SCHEMA_VERSION,
  SYNC_ENGINE_VERSION,
  classifySyncError,
  getRetryDelay,
  migrateQueueItem
} from '../src/lib/syncQueue.js';

test('migrates a legacy queue item without changing its stable id', () => {
  const migrated = migrateQueueItem({ id: 'action-1', action: 'EDIT_NPP', timestamp: 100 }, 200);
  assert.equal(migrated.id, 'action-1');
  assert.equal(migrated.operationId, 'action-1');
  assert.equal(migrated.schemaVersion, QUEUE_SCHEMA_VERSION);
  assert.equal(migrated.engineVersion, SYNC_ENGINE_VERSION);
  assert.equal(migrated.status, 'pending');
  assert.equal(migrated.createdAt, 100);
});

test('recovers an interrupted syncing item after reload', () => {
  const migrated = migrateQueueItem({
    id: 'action-2', operationId: 'op-2', schemaVersion: QUEUE_SCHEMA_VERSION,
    engineVersion: SYNC_ENGINE_VERSION, status: 'syncing', attempts: 2
  }, 300);
  assert.equal(migrated.status, 'pending');
  assert.equal(migrated.operationId, 'op-2');
  assert.equal(migrated.attempts, 2);
});

test('separates retryable network failures from invalid data', () => {
  assert.equal(classifySyncError({ message: 'Failed to fetch' }), 'retry_wait');
  assert.equal(classifySyncError({ code: '23503', message: 'foreign key constraint' }), 'needs_review');
  assert.equal(classifySyncError({ code: 'PGRST204', message: 'schema cache' }), 'needs_review');
});

test('caps exponential retry delays', () => {
  assert.equal(getRetryDelay(1), 4000);
  assert.equal(getRetryDelay(99), 5 * 60 * 1000);
});
