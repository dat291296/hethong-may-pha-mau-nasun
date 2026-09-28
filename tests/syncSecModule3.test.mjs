import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/sync_sec_module_3_change_feed.sql', import.meta.url);
const feedUrl = new URL('../src/lib/changeFeed.js', import.meta.url);
const appUrl = new URL('../src/App.jsx', import.meta.url);

test('module 3 adds a monotonic feed without mutating business rows', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /cursor_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.capture_sync_change/);
  assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE/);
  assert.match(sql, /to_regclass\('public\.' \|\| target\.table_name\)/);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|TRUNCATE) public\.(?:distributors|system_sets|dispensers|mixers|computers|printers|repair_tickets)/i);
});

test('feed cannot be written or queried directly by browser roles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /REVOKE ALL ON TABLE public\.sync_change_feed FROM authenticated/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /public\.get_my_role\(\) = 'admin'/);
  assert.match(sql, /public\.can_access_region\(region\)/);
  assert.doesNotMatch(sql, /SELECT cursor_id, table_name, record_id/);
});

test('change feed RPC bounds batches and advances an opaque cursor', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /LEAST\(GREATEST\(COALESCE\(p_limit, 250\), 1\), 500\)/);
  assert.match(sql, /'nextCursor'/);
  assert.match(sql, /'hasMore'/);
  assert.match(sql, /ORDER BY cursor_id/);
});

test('client persists cursor in encrypted cache only after refresh acknowledgement', async () => {
  const [feed, app] = await Promise.all([readFile(feedUrl, 'utf8'), readFile(appUrl, 'utf8')]);
  assert.match(feed, /getCache\(CURSOR_CACHE_KEY/);
  assert.match(feed, /setCache\(CURSOR_CACHE_KEY/);
  assert.match(feed, /pendingCursor = nextCursor/);
  assert.match(feed, /runGeneration/);
  assert.match(app, /Promise\.allSettled\(refreshTasks\)/);
  assert.match(app, /acknowledgeChangeFeedCursor/);
  assert.match(app, /nasun-cloud-changes/);
});
