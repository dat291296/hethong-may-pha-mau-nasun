import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateStagingDestination } from './apply-staging-safety.mjs';

// Export metadata only. This process never queries a production endpoint or business rows.
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.GITHUB_REPOSITORY, 'dat291296/hethong-may-pha-mau-nasun');
assert.ok(!process.env.SUPABASE_DB_URL);
const connection = validateStagingDestination(process.env);
const output = join(process.env.RUNNER_TEMP, 'nasun-staging-schema.dump');
const result = spawnSync('docker', ['run', '--rm', '--network', 'host',
  ...['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE', 'PGOPTIONS'].flatMap(name => ['-e', name]),
  'postgres:17-alpine', 'pg_dump', '--schema=public', '--schema=nasun_internal', '--schema=auth', '--schema=storage',
  '--schema-only', '--format=custom', '--no-owner'], {
  env: { ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || '5432',
    PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password),
    PGDATABASE: connection.pathname.slice(1) || 'postgres', PGSSLMODE: 'require',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=60000' },
  timeout: 180000, maxBuffer: 32 * 1024 * 1024,
});
assert.ok(!result.error && result.status === 0, 'Approved staging schema-only export failed; provider diagnostics suppressed');
assert.ok(result.stdout.subarray(0, 5).equals(Buffer.from('PGDMP')), 'Invalid schema archive');
await writeFile(output, result.stdout, { mode: 0o600, flag: 'wx' });
console.log('Approved staging schema exported read-only; no table data or credentials retained in evidence.');
