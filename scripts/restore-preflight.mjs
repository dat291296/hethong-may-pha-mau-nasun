import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateRestoreConfiguration(environment) {
  const project = name => {
    try {
      const value = new URL(environment[name]);
      if (value.protocol !== 'https:' || value.username || value.password || value.search || value.hash || value.port || !['', '/'].includes(value.pathname)) throw new Error();
      const match = value.hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
      if (!match) throw new Error();
      return match[1];
    } catch { throw new Error(`Invalid or missing ${name}`); }
  };
  const target = project('RESTORE_SUPABASE_URL');
  if (['tqoxyharlsubyqjxjnfg', 'kenznmtdfuexmfrtzypb'].includes(target)) throw new Error('Restore target must not be a protected live project');
  if (target === project('RLS_PRODUCTION_URL') || target === project('RLS_TEST_URL')) throw new Error('Restore target must differ from production and staging');
  let connection;
  try { connection = new URL(environment.RESTORE_DB_URL); } catch { throw new Error('Invalid or missing RESTORE_DB_URL'); }
  const identity = connection.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
    || (connection.hostname.endsWith('.pooler.supabase.com') ? decodeURIComponent(connection.username).match(/^postgres\.([a-z0-9]+)$/)?.[1] : null);
  if (!['postgres:', 'postgresql:'].includes(connection.protocol) || identity !== target || !connection.password) throw new Error('Restore database must match the isolated project');
  if (connection.hash || !['', '/postgres'].includes(connection.pathname)
    || !['', '5432'].includes(connection.port)
    || [...connection.searchParams.keys()].some(key => key !== 'sslmode')
    || (connection.searchParams.has('sslmode') && !['require','verify-full'].includes(connection.searchParams.get('sslmode')))) {
    throw new Error('Restore inspection requires a session connection and TLS');
  }
  connection.searchParams.set('sslmode', connection.searchParams.get('sslmode') || 'require');
  return connection;
}
export function requireEmptyRestoreDestination(counts) {
  for (const name of ['public_tables', 'internal_tables', 'auth_users', 'storage_objects', 'storage_buckets']) {
    if (!Number.isSafeInteger(counts?.[name]) || counts[name] !== 0) throw new Error('Restore target is not empty; no restore was performed');
  }
}
async function main() {
  const connection = validateRestoreConfiguration(process.env);
  const query = `SELECT json_build_object('public_tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'internal_tables',(SELECT count(*) FROM pg_tables WHERE schemaname='nasun_internal'),'auth_users',(SELECT count(*) FROM auth.users),'storage_objects',(SELECT count(*) FROM storage.objects),'storage_buckets',(SELECT count(*) FROM storage.buckets));`;
  const child = spawn('psql', ['--dbname=' + connection.href, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query], { env: { ...process.env, PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=30000' }, stdio: ['ignore', 'pipe', 'ignore'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  await new Promise((accept, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Restore destination inspection timed out')); }, 45000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('PostgreSQL client unavailable')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? accept() : reject(new Error('Restore destination inspection failed')); });
  });
  let counts;
  try { counts = JSON.parse(output.trim()); } catch { throw new Error('Invalid destination inspection result'); }
  requireEmptyRestoreDestination(counts);
  console.log('Restore destination is isolated and empty. No data was restored or modified.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
