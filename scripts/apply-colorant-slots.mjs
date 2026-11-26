import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const destination = new URL(process.env.SUPABASE_DB_URL || '');
const api = new URL(process.env.PRODUCTION_SUPABASE_URL || '');
const approved = 'tqoxyharlsubyqjxjnfg';
const ref = destination.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
  || (destination.hostname.endsWith('.pooler.supabase.com')
    && decodeURIComponent(destination.username).match(/^postgres\.([a-z0-9]+)$/)?.[1]);
if (!['postgres:', 'postgresql:'].includes(destination.protocol) || ref !== approved
  || api.hostname !== approved + '.supabase.co' || !destination.password) {
  throw new Error('Production destination mismatch');
}
const migration = (await readFile('supabase/migrations/20261126000100_dispenser_colorant_slots.sql', 'utf8'))
  .replace(/^\s*(begin|commit);\s*$/gim, '');
const query = `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TEMP TABLE before_dispensers ON COMMIT DROP AS
 SELECT id, to_jsonb(d) - 'colorant_slots' AS original FROM public.dispensers d;
${migration}
DO $$ BEGIN
 IF EXISTS (
   SELECT 1 FROM before_dispensers b FULL JOIN public.dispensers d USING (id)
   WHERE b.original IS DISTINCT FROM (to_jsonb(d) - 'colorant_slots')
 ) THEN RAISE EXCEPTION 'Existing dispenser data changed'; END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;`;
const child = spawn('psql', ['--dbname=' + destination.href, '-X', '-q', '-v', 'ON_ERROR_STOP=1'],
  { env: { ...process.env, PGSSLMODE: 'require' }, stdio: ['pipe', 'ignore', 'ignore'] });
child.stdin.on('error', () => {});
child.stdin.end(query);
await new Promise((resolve, reject) => {
  child.on('error', () => reject(new Error('PostgreSQL client unavailable')));
  child.on('exit', code => code === 0 ? resolve() : reject(new Error('Colorant migration failed and rolled back')));
});
console.log('Colorant schema applied. Existing dispenser data verified.');
