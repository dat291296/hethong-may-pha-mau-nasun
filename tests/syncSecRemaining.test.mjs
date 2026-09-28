import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MAX_SYNC_ATTEMPTS,
  SYNC_ENGINE_VERSION,
  migrateQueueItem,
  resolveFailureState
} from '../src/lib/syncQueue.js';

const conflictSqlUrl = new URL('../supabase/sync_sec_module_4_conflict_engine.sql', import.meta.url);
const realtimeSqlUrl = new URL('../supabase/sync_sec_module_5_private_realtime.sql', import.meta.url);
const healthSqlUrl = new URL('../supabase/sync_sec_module_6_observability.sql', import.meta.url);
const realtimeClientUrl = new URL('../src/lib/realtimeSync.js', import.meta.url);
const feedClientUrl = new URL('../src/lib/changeFeed.js', import.meta.url);

test('module 4 uses RLS-visible versions and optimistic conflict checks', async () => {
  const sql = await readFile(conflictSqlUrl, 'utf8');
  assert.match(sql, /sync_entity_versions_visible_entities/);
  assert.match(sql, /SYNC_CONFLICT expected %, current %/);
  assert.match(sql, /execute_sync_operation_v2/);
  assert.match(sql, /SECURITY INVOKER/);
  assert.doesNotMatch(sql, /TRUNCATE|DROP TABLE|DISABLE ROW LEVEL SECURITY/i);
});

test('module 5 authorizes private Broadcast and sends metadata-only signals', async () => {
  const [sql, client] = await Promise.all([
    readFile(realtimeSqlUrl, 'utf8'), readFile(realtimeClientUrl, 'utf8')
  ]);
  assert.match(sql, /ON realtime\.messages/);
  assert.match(sql, /realtime\.messages\.extension = 'broadcast'/);
  assert.match(sql, /realtime\.send\(jsonb,text,text,boolean\)/);
  assert.doesNotMatch(sql, /ALTER TABLE realtime\.messages ENABLE ROW LEVEL SECURITY/i);
  assert.match(client, /private: true/);
  assert.match(client, /pullChangeFeed/);
});

test('module 6 exposes only caller-scoped aggregate health', async () => {
  const sql = await readFile(healthSqlUrl, 'utf8');
  assert.match(sql, /WHERE user_id = caller_id/);
  assert.match(sql, /applied24h/);
  assert.match(sql, /failed24h/);
  assert.doesNotMatch(sql, /SELECT \*/i);
});

test('chaos: interrupted work resumes and stable operation id survives reload', () => {
  const migrated = migrateQueueItem({
    id: 'action-chaos-1', operationId: 'operation-chaos-1', engineVersion: 1,
    status: 'syncing', attempts: 4, action: 'EDIT_NPP', payload: { id: 'NPP-001' }
  }, 1000);
  assert.equal(migrated.status, 'pending');
  assert.equal(migrated.operationId, 'operation-chaos-1');
  assert.equal(migrated.engineVersion, SYNC_ENGINE_VERSION);
});

test('chaos: repeated network loss is bounded and enters dead letter', () => {
  let state = { attempts: 0 };
  for (let index = 0; index < MAX_SYNC_ATTEMPTS; index += 1) {
    state = { ...state, ...resolveFailureState(state, new Error('Failed to fetch'), index * 1000) };
  }
  assert.equal(state.attempts, MAX_SYNC_ATTEMPTS);
  assert.equal(state.status, 'dead_letter');
  assert.equal(state.nextAttemptAt, 0);
});

test('chaos: conflicts stop automatic replay while transient errors wait', () => {
  assert.equal(resolveFailureState({}, new Error('SYNC_CONFLICT expected 2, current 3')).status, 'needs_review');
  assert.equal(resolveFailureState({}, new Error('Failed to fetch')).status, 'retry_wait');
});

test('chaos: durable feed waits for acknowledgement and Realtime is only an accelerator', async () => {
  const feed = await readFile(feedClientUrl, 'utf8');
  assert.match(feed, /pendingCursor !== null/);
  assert.match(feed, /acknowledgeChangeFeedCursor/);
  assert.match(feed, /setCache\(CURSOR_CACHE_KEY/);
});
