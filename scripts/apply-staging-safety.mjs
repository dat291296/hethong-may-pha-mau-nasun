import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPROVED_STAGING_REF = 'kenznmtdfuexmfrtzypb';
export function validateStagingDestination(environment) {
  const parse = name => {
    let text = (environment[name] || '').trim();
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")) || (text.startsWith('`') && text.endsWith('`'))) text = text.slice(1, -1).trim();
    if (!/^postgres(?:ql)?:\/\//.test(text) || /[\r\n]/.test(text)) throw new Error(`Invalid ${name}`);
    const separator = text.lastIndexOf('@');
    const credentialsStart = text.indexOf('://') + 3;
    const credentials = text.slice(credentialsStart, separator);
    const colon = credentials.indexOf(':');
    if (separator < 0 || colon < 0) throw new Error(`Invalid ${name}`);
    try {
      const password = encodeURIComponent(decodeURIComponent(credentials.slice(colon + 1).replace(/%(?![0-9a-f]{2})/gi, '%25')));
      return new URL(text.slice(0, credentialsStart) + credentials.slice(0, colon + 1) + password + text.slice(separator));
    } catch { throw new Error(`Invalid ${name}`); }
  };
  const target = parse('STAGING_DB_URL'), production = parse('SUPABASE_DB_URL');
  const projectRef = connection => {
    const direct = connection.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
    if (direct) return direct[1];
    if (connection.hostname.endsWith('.pooler.supabase.com')) return decodeURIComponent(connection.username).match(/^postgres\.([a-z0-9]+)$/)?.[1];
    return null;
  };
  if (projectRef(target) !== APPROVED_STAGING_REF || !projectRef(production) || projectRef(production) === APPROVED_STAGING_REF || !target.password || !production.password) throw new Error('Staging destination is not isolated or approved');
  return target;
}
async function main() {
  const destination = validateStagingDestination(process.env);
  for (const migration of ['supabase/sensitive_action_reauthentication.sql', 'supabase/technical_document_uploads_migration.sql', 'supabase/technical_storage_recent_auth.sql', 'supabase/device_edit_atomic.sql']) {
  const child = spawn('psql', ['--dbname=' + destination.href, '-v', 'ON_ERROR_STOP=1', '-f', migration], {
    env: { ...process.env, PGSSLMODE: 'require' }, stdio: ['ignore', 'ignore', 'ignore']
  });
  await new Promise((accept, reject) => {
    child.on('error', () => reject(new Error('PostgreSQL client could not start')));
    child.on('exit', code => code === 0 ? accept() : reject(new Error('Staging safety migration failed; production was not targeted')));
  });
  }
  console.log('Staging safety migration applied; existing business records were not updated or deleted.');
  const healthQuery = `SELECT jsonb_build_object(
    'active_sessions', COUNT(*) FILTER (WHERE state = 'active'),
    'waiting_on_locks', COUNT(*) FILTER (WHERE wait_event_type = 'Lock'),
    'long_running_device_edits', COUNT(*) FILTER (WHERE state = 'active' AND query LIKE '%edit_device_atomic%' AND query_start < NOW() - INTERVAL '30 seconds')
  ) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`;
  const health = spawn('psql', ['--dbname=' + destination.href, '-At', '-v', 'ON_ERROR_STOP=1', '-c', healthQuery], {
    env: { ...process.env, PGSSLMODE: 'require', PGOPTIONS: '-c statement_timeout=10000' }, stdio: ['ignore', 'pipe', 'ignore'],
  });
  let output = '';
  health.stdout.on('data', chunk => { if (output.length < 4096) output += chunk; });
  await new Promise(resolveHealth => {
    health.on('error', () => resolveHealth());
    health.on('exit', code => {
      if (code === 0) {
        try {
          const value = JSON.parse(output);
          const keys = ['active_sessions', 'waiting_on_locks', 'long_running_device_edits'];
          if (keys.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)) {
            console.log('Staging DB health: ' + JSON.stringify(Object.fromEntries(keys.map(key => [key, value[key]]))));
          }
        } catch { console.log('Staging health metadata unavailable.'); }
      }
      resolveHealth();
    });
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
