import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStagingDestination } from './apply-staging-safety.mjs';

async function main() {
  const destination = validateStagingDestination(process.env);
  const migration = 'supabase/migrations/20261111030000_viewer_national_read_scope.sql';
  const child = spawn('psql', ['--dbname=' + destination.href, '-v', 'ON_ERROR_STOP=1', '-f', migration], {
    env: { ...process.env, PGSSLMODE: 'require' },
    stdio: 'inherit',
  });
  await new Promise((resolveRun, rejectRun) => {
    child.on('error', () => rejectRun(new Error('PostgreSQL client could not start')));
    child.on('exit', code => code === 0 ? resolveRun() : rejectRun(new Error('Viewer scope migration failed; production was not targeted')));
  });
  console.log('Viewer read-only national scope applied to the approved isolated staging project.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
