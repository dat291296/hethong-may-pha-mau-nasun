import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const productionRef = 'tqoxyharlsubyqjxjnfg';
export function productionAuthorizationDestination(environment) {
  try {
    const api = new URL(environment.PRODUCTION_SUPABASE_URL);
    const database = new URL(environment.SUPABASE_DB_URL);
    const direct = database.hostname === `db.${productionRef}.supabase.co` && database.username === 'postgres';
    const pooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(database.hostname)
      && decodeURIComponent(database.username) === `postgres.${productionRef}`;
    if (api.href !== `https://${productionRef}.supabase.co/`
      || !['postgres:', 'postgresql:'].includes(database.protocol) || !database.password
      || (!direct && !pooler) || database.pathname !== '/postgres' || database.hash
      || (database.port && database.port !== '5432')
      || [...database.searchParams].some(([key, value]) => key !== 'sslmode' || value !== 'require')) {
      throw Error();
    }
    return database;
  } catch { throw new Error('PRODUCTION_AUTHORIZATION_DESTINATION_REJECTED'); }
}

export async function verifyProductionAuthorization(environment = process.env) {
  const destination = productionAuthorizationDestination(environment);
  const sql = (await Promise.all(['verify-security-upgrade-state.sql', 'verify-definer-hardening-state.sql']
    .map(file => readFile(new URL(file, import.meta.url), 'utf8')))).join('\n');
  const child = spawn('psql', ['--dbname=' + destination.href, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], {
    env: { ...environment, PGSSLMODE: 'require',
      PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000' },
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  const timer = setTimeout(() => child.kill(), 60000);
  try {
    await new Promise((accept, reject) => {
      child.on('error', () => reject(new Error('PRODUCTION_AUTHORIZATION_POSTGRES_UNAVAILABLE')));
      child.on('exit', code => code === 0 ? accept() : reject(new Error('PRODUCTION_AUTHORIZATION_DRIFT_OR_CHECK_FAILED')));
      child.stdin.on('error', () => {});
      child.stdin.end(sql);
    });
    console.log('Production authorization metadata passed (read-only; no business rows queried).');
  } finally { clearTimeout(timer); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyProductionAuthorization().catch(error => { console.error(error.message); process.exitCode = 1; });
}
