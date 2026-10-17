import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { validateStagingDestination, APPROVED_STAGING_REF } from './apply-staging-safety.mjs';

const staging = process.argv.includes('--staging');
const approvedRef = staging ? APPROVED_STAGING_REF : 'tqoxyharlsubyqjxjnfg';
const destination = staging ? validateStagingDestination(process.env) : new URL(process.env.SUPABASE_DB_URL || '');
const api = new URL((staging ? process.env.RLS_TEST_URL : process.env.PRODUCTION_SUPABASE_URL) || '');
const databaseRef = destination.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
  || (destination.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(destination.username).match(/^postgres\.([a-z0-9]+)$/)?.[1]);
if (!['postgres:', 'postgresql:'].includes(destination.protocol) || databaseRef !== approvedRef
  || api.hostname !== `${approvedRef}.supabase.co` || !destination.password) {
  throw new Error('Production destination does not match the approved project');
}
if (process.argv.includes('--validate-only')) process.exit(0);

const auditOnly = process.argv.includes('--audit-only');
const migrations = auditOnly ? ['audit_logs_append_only.sql'] : ['sensitive_action_reauthentication.sql', 'technical_document_uploads_migration.sql',
  'technical_storage_recent_auth.sql', 'device_edit_atomic.sql', 'optional_device_serial.sql', 'account_npp_integrity.sql', 'technician_region_write_migration.sql', 'trusted_session_revocation.sql', 'revoked_session_write_guard.sql', 'technician_national_read_admin_session.sql'];
const statements = await Promise.all(migrations.map(async name => (await readFile(`supabase/${name}`, 'utf8'))
  .replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')));
const snapshot = `
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
CREATE TEMP TABLE release_baseline (relation regclass, columns text[], content jsonb) ON COMMIT DROP;
DO $$ DECLARE item record; fields text[]; content jsonb; BEGIN
  FOR item IN SELECT c.oid::regclass AS relation FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND (n.nspname='public' OR (n.nspname='auth' AND c.relname='users')
      OR (n.nspname='storage' AND c.relname='objects')) ORDER BY c.oid
  LOOP
    EXECUTE format('LOCK TABLE %s IN SHARE MODE', item.relation);
    SELECT array_agg(attname::text ORDER BY attnum) INTO fields FROM pg_attribute
      WHERE attrelid=item.relation AND attnum>0 AND NOT attisdropped;
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), ''[]''::jsonb) FROM %s t', item.relation) INTO content;
    INSERT INTO release_baseline VALUES (item.relation, fields, content);
  END LOOP;
END $$;
`;
const verify = `
DO $$ DECLARE item record; content jsonb; BEGIN
  FOR item IN SELECT * FROM release_baseline LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(projected ORDER BY projected::text), ''[]''::jsonb) FROM
      (SELECT (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(t)) WHERE key=ANY($1)) projected FROM %s t) q', item.relation)
      INTO content USING item.columns;
    IF content IS DISTINCT FROM item.content THEN RAISE EXCEPTION 'RELEASE_DATA_PRESERVATION_FAILED'; END IF;
  END LOOP;
END $$;
SELECT pg_notification_queue_usage();
NOTIFY pgrst, 'reload schema';
COMMIT;
`;
const auditVerification = auditOnly ? `
CREATE TEMP TABLE audit_immutability_probe (id integer) ON COMMIT DROP;
INSERT INTO audit_immutability_probe VALUES (1);
CREATE TRIGGER probe_rows BEFORE UPDATE OR DELETE ON audit_immutability_probe
FOR EACH ROW EXECUTE FUNCTION public.reject_audit_log_mutation();
CREATE TRIGGER probe_truncate BEFORE TRUNCATE ON audit_immutability_probe
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_log_mutation();
DO $$ BEGIN
  BEGIN UPDATE audit_immutability_probe SET id=2; RAISE EXCEPTION 'UPDATE_NOT_BLOCKED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM audit_immutability_probe; RAISE EXCEPTION 'DELETE_NOT_BLOCKED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN TRUNCATE audit_immutability_probe; RAISE EXCEPTION 'TRUNCATE_NOT_BLOCKED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.audit_logs'::regclass AND tgname IN ('audit_logs_append_only','audit_logs_no_truncate') AND tgenabled='O') <> 2 THEN
    RAISE EXCEPTION 'AUDIT_TRIGGERS_NOT_ENABLED';
  END IF;
  IF has_table_privilege('authenticated','public.audit_logs','UPDATE') OR has_table_privilege('authenticated','public.audit_logs','DELETE')
    OR has_table_privilege('anon','public.audit_logs','UPDATE') OR has_table_privilege('anon','public.audit_logs','DELETE') THEN
    RAISE EXCEPTION 'AUDIT_ROLE_PRIVILEGES_NOT_REVOKED';
  END IF;
END $$;
` : '';
const child = spawn('psql', ['--dbname=' + destination.href, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], {
  env: { ...process.env, PGSSLMODE: 'require' }, stdio: ['pipe', 'ignore', 'ignore'],
});
child.stdin.on('error', () => {});
child.stdin.end(snapshot + statements.join('\n') + auditVerification + verify);
await new Promise((accept, reject) => {
  child.on('error', () => reject(new Error('PostgreSQL client unavailable')));
  child.on('exit', code => code === 0 ? accept() : reject(new Error('Production migration failed; transaction rolled back. Review schema prerequisites.')));
});
console.log('Schema updated. All pre-existing public rows, Auth users and Storage objects matched exactly on original columns.');
