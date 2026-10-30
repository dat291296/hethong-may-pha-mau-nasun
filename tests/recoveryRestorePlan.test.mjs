import test from 'node:test';
import assert from 'node:assert/strict';
import { schemaSelection, orderAuthDataEntries } from '../scripts/recovery-restore-plan.mjs';

const toc = `; PostgreSQL custom archive fixture
1; 2615 2200 SCHEMA - public pg_database_owner
2; 1259 10 TABLE public profiles postgres
3; 0 21 TABLE DATA auth identities supabase_auth_admin
4; 0 22 TABLE DATA auth refresh_tokens supabase_auth_admin
5; 0 23 TABLE DATA auth users supabase_auth_admin
6; 0 24 TABLE DATA auth sessions supabase_auth_admin
7; 0 0 SEQUENCE SET auth refresh_tokens_id_seq supabase_auth_admin
8; 0 25 TABLE DATA auth schema_migrations supabase_auth_admin
9; 826 26 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES supabase_admin
10; 826 27 DEFAULT ACL public DEFAULT PRIVILEGES FOR FUNCTIONS postgres
11; 3256 28 POLICY storage objects machine_evidence_read supabase_storage_admin
12; 0 29 TABLE DATA storage objects supabase_storage_admin
13; 2620 30 TRIGGER auth users on_auth_user_created supabase_auth_admin`;

test('Auth logical recovery retains token sequence state and custom policies without replacing managed DDL', () => {
  const selected = schemaSelection(toc);
  assert.match(selected, /SEQUENCE SET auth refresh_tokens_id_seq/);
  assert.match(selected, /POLICY storage objects machine_evidence_read/);
  assert.match(selected, /TRIGGER auth users on_auth_user_created/);
  assert.match(selected, /DEFAULT PRIVILEGES FOR FUNCTIONS postgres/);
  assert.doesNotMatch(selected, /SCHEMA - public|TABLE DATA auth schema_migrations|TABLE DATA storage objects|DEFAULT PRIVILEGES FOR TABLES supabase_admin/);
});

test('Auth rows restore before dependent identities and tokens, then restore sequence counters', () => {
  const plan = orderAuthDataEntries(schemaSelection(toc), [
    { child: 'auth.identities', parent: 'auth.users' },
    { child: 'auth.sessions', parent: 'auth.users' },
    { child: 'auth.refresh_tokens', parent: 'auth.sessions' },
  ]);
  assert.ok(plan.indexOf('TABLE DATA auth.users') === -1);
  assert.ok(plan.indexOf('TABLE DATA auth users') < plan.indexOf('TABLE DATA auth identities'));
  assert.ok(plan.indexOf('TABLE DATA auth sessions') < plan.indexOf('TABLE DATA auth refresh_tokens'));
  assert.ok(plan.indexOf('TABLE DATA auth refresh_tokens') < plan.indexOf('SEQUENCE SET auth refresh_tokens_id_seq'));
  assert.throws(() => orderAuthDataEntries(schemaSelection(toc), [
    { child: 'auth.users', parent: 'auth.identities' },
    { child: 'auth.identities', parent: 'auth.users' },
  ]), /dependency cycle/);
});
