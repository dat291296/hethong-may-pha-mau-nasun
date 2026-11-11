import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authorizationCases, buildAuthorizationSql, runAuthorizationBoundaries } from '../scripts/authorization-boundaries.mjs';
import { productionAuthorizationDestination } from '../scripts/verify-production-authorization.mjs';
import { verifyNppAuthorization } from '../scripts/verify-npp-authorization.mjs';

test('authorization matrix covers five roles, three assigned regions, three target regions and every NPP action', () => {
  const cases = authorizationCases();
  assert.equal(cases.length, 225);
  assert.equal(new Set(cases.map(value => JSON.stringify(value))).size, 225);
  assert.equal(cases.filter(item => item.allowed).length, 90);
  for (const item of cases) {
    if (item.role === 'admin') assert.equal(item.allowed, true);
    else if (item.action === 'read') assert.equal(item.allowed, item.role === 'viewer' || item.assignedRegion === item.targetRegion);
    else if (item.role === 'viewer' || item.action === 'delete') assert.equal(item.allowed, false);
    else assert.equal(item.allowed, item.assignedRegion === item.targetRegion);
  }
});

test('staging SQL probes undo each operation and roll back users, sessions and all outer writes', async () => {
  const sql = await buildAuthorizationSql();
  assert.match(sql, /BEGIN;[\s\S]*SET LOCAL statement_timeout/);
  assert.match(sql, /APPROVED_STAGING_FIXTURES_REQUIRED/);
  assert.match(sql, /RAISE SQLSTATE 'Z0001'/);
  assert.match(sql, /WHEN insufficient_privilege THEN permitted := false/);
  assert.match(sql, /checks <> jsonb_array_length\(expectations\)/);
  assert.match(sql, /ARRAY\['revoked', 'expired', 'disabled'\]/);
  assert.match(sql, /ROLLBACK;\s*SELECT/);
  assert.doesNotMatch(sql, /\bCOMMIT\s*;|CREATE\s+(?:OR REPLACE\s+)?(?:FUNCTION|POLICY)|ALTER\s+(?:TABLE|FUNCTION)/i);
  assert.doesNotMatch(sql, /AUTHORIZATION_CASES \*\//);
  const receipt = JSON.parse(sql.match(/SELECT '([^']+)' AS authorization_result/)[1]);
  assert.equal(receipt.realJwt, false);
  assert.equal(receipt.sessionCases, 45);
});

test('authorization rollback runner refuses a production destination before starting PostgreSQL', async () => {
  await assert.rejects(runAuthorizationBoundaries({
    STAGING_DB_URL: 'postgresql://postgres:synthetic@db.tqoxyharlsubyqjxjnfg.supabase.co:5432/postgres',
    RLS_PRODUCTION_URL: 'https://tqoxyharlsubyqjxjnfg.supabase.co',
  }));
});

const production = {
  PRODUCTION_SUPABASE_URL: 'https://tqoxyharlsubyqjxjnfg.supabase.co',
  SUPABASE_DB_URL: 'postgresql://postgres:synthetic@db.tqoxyharlsubyqjxjnfg.supabase.co:5432/postgres?sslmode=require',
};
test('production metadata gate accepts only the approved direct or session pooler identity', () => {
  assert.equal(productionAuthorizationDestination(production).port, '5432');
  const pooler = { ...production, SUPABASE_DB_URL:
    'postgresql://postgres.tqoxyharlsubyqjxjnfg:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres' };
  assert.equal(productionAuthorizationDestination(pooler).hostname, 'aws-0-ap-northeast-1.pooler.supabase.com');
  for (const SUPABASE_DB_URL of [
    production.SUPABASE_DB_URL.replace('tqoxyharlsubyqjxjnfg', 'kenznmtdfuexmfrtzypb'),
    production.SUPABASE_DB_URL.replace('sslmode=require', 'sslmode=disable'),
    production.SUPABASE_DB_URL + '&options=unsafe',
    production.SUPABASE_DB_URL.replace(':5432', ':6543'),
    production.SUPABASE_DB_URL.replace('/postgres?', '/other?'),
    'secret-do-not-echo',
  ]) assert.throws(() => productionAuthorizationDestination({ ...production, SUPABASE_DB_URL }),
    { message: 'PRODUCTION_AUTHORIZATION_DESTINATION_REJECTED' });
});

test('deploy waits for read-only production metadata and staging executes the rollback matrix', async () => {
  const [deploy, staging, verifier] = await Promise.all([
    readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/rls-integration.yml', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/verify-production-authorization.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(deploy, /needs: \[rls-gate, authorization-gate\]/);
  assert.match(deploy, /authorization-gate:[\s\S]*environment: backup/);
  assert.match(verifier, /default_transaction_read_only=on/);
  assert.match(verifier, /verify-security-upgrade-state.sql/);
  assert.match(verifier, /verify-definer-hardening-state.sql/);
  assert.match(staging, /node scripts\/authorization-boundaries.mjs/);
});

const stagingEnvironment = { RLS_TEST_URL: 'https://kenznmtdfuexmfrtzypb.supabase.co',
  RLS_PRODUCTION_URL: 'https://tqoxyharlsubyqjxjnfg.supabase.co' };
function jwtFixture({ permitViewerEdit = false, failDelete = false } = {}) {
  const rows = new Map();
  const removed = [];
  const clients = ['admin', 'manager', 'technician', 'qc', 'viewer'].map(role => ({ role, client: {
    auth: { getUser: async () => ({ data: { user: { id: role,
      email: `nasun-rls-${role}@example.invalid`, app_metadata: { nasun_rls_fixture: true } } }, error: null }) },
    rpc: async () => ({ data: role === 'admin', error: null }),
    from(table) {
      let action = 'select', body, field, expected, ids, single = false;
      const query = {
        insert(value) { action = 'insert'; body = value; return query; },
        update(value) { action = 'update'; body = value; return query; },
        delete() { action = 'delete'; return query; },
        select() { return query; },
        eq(key, value) { field = key; expected = value; return query; },
        in(_key, value) { ids = value; return query; },
        single() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (table === 'profiles') return { data: { role, managed_region: role === 'admin' ? 'Toàn Quốc' : 'Miền Bắc' }, error: null };
            const matches = [...rows.values()].filter(row => (!field || row[field] === expected) && (!ids || ids.includes(row.id)));
            const visible = row => role === 'admin' || role === 'viewer' || row.region === 'Miền Bắc';
            const writable = row => visible(row) && role !== 'viewer';
            let data = [];
            if (action === 'insert') {
              const values = Array.isArray(body) ? body : [body];
              if (!values.every(writable)) return { data: null, error: { code: '42501' } };
              for (const row of values) { rows.set(row.id, { ...row }); data.push({ id: row.id }); }
            } else for (const row of matches) {
              if (!visible(row)) continue;
              if (action === 'select') data.push({ ...row });
              if (action === 'update' && ((writable(row) && writable({ ...row, ...body })) || permitViewerEdit && role === 'viewer' && !body.region)) {
                Object.assign(row, body); data.push({ id: row.id });
              }
              if (action === 'delete' && role === 'admin') {
                removed.push(row.id);
                if (failDelete) return { data: null, error: { code: '42501' } };
                rows.delete(row.id); data.push({ id: row.id });
              }
            }
            return { data: single ? data[0] : data, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  } }));
  return { clients, admin: clients[0].client, rows, removed };
}

test('real-JWT acceptance helper checks all five clients and removes only its generated NPPs', async () => {
  const f = jwtFixture();
  f.rows.set('existing-business-row', { id: 'existing-business-row', region: 'Miền Bắc' });
  const receipt = await verifyNppAuthorization(f.admin, f.clients, stagingEnvironment);
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.realJwt, true);
  assert.equal(receipt.checks, 66);
  assert.deepEqual([...f.rows.keys()], ['existing-business-row']);
  assert.ok(f.removed.every(id => id.startsWith('SYN-NPP-AUTH-')));
});

test('an over-permissive viewer update fails acceptance and still cleans every own fixture', async () => {
  const f = jwtFixture({ permitViewerEdit: true });
  await assert.rejects(verifyNppAuthorization(f.admin, f.clients, stagingEnvironment), /unauthorized NPP edit/);
  assert.equal(f.rows.size, 0);
});

test('incomplete fixture cleanup cannot produce successful acceptance', async () => {
  const f = jwtFixture({ failDelete: true });
  await assert.rejects(verifyNppAuthorization(f.admin, f.clients, stagingEnvironment),
    { message: 'NPP_AUTHORIZATION_FIXTURE_CLEANUP_INCOMPLETE' });
  assert.ok(f.rows.size > 0);
});

test('real-JWT acceptance refuses production and ordinary identities before writing any fixture', async () => {
  const f = jwtFixture();
  await assert.rejects(verifyNppAuthorization(f.admin, f.clients, {
    ...stagingEnvironment, RLS_TEST_URL: stagingEnvironment.RLS_PRODUCTION_URL,
  }), { message: 'NPP_AUTHORIZATION_ISOLATED_STAGING_REQUIRED' });
  f.admin.auth.getUser = async () => ({ data: { user: { app_metadata: {}, email: 'ordinary@example.invalid' } }, error: null });
  await assert.rejects(verifyNppAuthorization(f.admin, f.clients, stagingEnvironment), /Disposable fixture identities required/);
  assert.equal(f.rows.size, 0);
});
