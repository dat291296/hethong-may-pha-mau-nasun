import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20261112090000_admin_change_audit.sql', import.meta.url);
const componentUrl = new URL('../src/modules/audit/components/AdminChangeHistory.jsx', import.meta.url);
const sidebarUrl = new URL('../src/app/components/Sidebar.jsx', import.meta.url);

test('change history is protected by admin-only row-level security', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.admin_change_audit FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /FOR SELECT TO authenticated USING \(public\.get_my_role\(\) = 'admin'\)/);
  assert.match(migration, /AFTER UPDATE ON public\.%I FOR EACH ROW/);
  assert.match(migration, /before_row -> key IS DISTINCT FROM after_row -> key/);
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE)\s+public\.(?:profiles|repair_tickets|system_sets)\b/i);
});

test('only admin accounts receive the change-history screen', async () => {
  const [component, sidebar] = await Promise.all([readFile(componentUrl, 'utf8'), readFile(sidebarUrl, 'utf8')]);
  assert.match(component, /if \(!isAdmin\) return null/);
  assert.match(component, /<del[\s\S]*<mark/);
  assert.match(sidebar, /role === 'admin'[\s\S]*id: 'adminChanges'/);
});
