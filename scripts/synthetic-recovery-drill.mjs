import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { encryptRecoveryBackup, decryptRecoveryBackup } from './encrypt-recovery-backup.mjs';
import { exportStorageBackup } from './export-storage-backup.mjs';
import { verifyStorageArchive } from './verify-storage-archive.mjs';
import { createRecoveryIntegrity, verifyRecoveryIntegrity } from './recovery-integrity.mjs';

// This driver deliberately has no hosted destination or production secret input.
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Disposable GitHub runner required');
assert.equal(process.env.GITHUB_REPOSITORY, 'dat291296/hethong-may-pha-mau-nasun');
for (const key of ['SUPABASE_DB_URL', 'STAGING_DB_URL', 'BACKUP_SUPABASE_SERVICE_ROLE_KEY']) {
  assert.ok(!process.env[key], 'Live credentials are forbidden in a synthetic drill');
}
const started = Date.now();
const root = await mkdtemp(join(tmpdir(), 'nasun-recovery-'));
const archive = join(root, 'recovery');
await mkdir(archive);
const excluded = 'studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta,mailpit';
let active;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 900000,
    maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    if (command === 'docker' && args.includes('pg_restore')) {
      const diagnostics = (result.stderr || '').split('\n').filter(line => /^pg_restore: error:/.test(line));
      console.error(diagnostics.slice(0, 3).join('\n'));
    }
    // Commands can contain only local disposable identities; suppress provider output anyway.
    throw new Error(`SYNTHETIC_DRILL_COMMAND_FAILED:${command}:${args[0]}`);
  }
  return result.stdout;
}
function sql(query, input) {
  const args = ['exec', '-i', `supabase_db_${active}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
  if (query) args.push('-c', query);
  return run('docker', args, input ? { input } : {});
}
async function start(label) {
  active = `nasun-drill-${label}`;
  const config = join(root, 'supabase', 'config.toml');
  let text = await readFile(config, 'utf8');
  text = text.replace(/^project_id = .*$/m, `project_id = "${active}"`);
  await writeFile(config, text);
  run('supabase', ['start', '--exclude', excluded]);
  const values = JSON.parse(run('supabase', ['status', '--output', 'json']));
  const api = new URL(values.API_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(api.hostname), 'Loopback API required');
  return { admin: createClient(api.origin, values.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
    user: () => createClient(api.origin, values.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) };
}
function stop() {
  if (active) run('supabase', ['stop', '--no-backup']);
  active = undefined;
}
const password = randomBytes(32).toString('hex');
const passphrase = randomBytes(32).toString('hex');
const email = 'nasun-recovery@example.invalid';
const bytes = Buffer.from('NASUN synthetic evidence recovery payload');
const sha = value => createHash('sha256').update(value).digest('hex');
try {
  // Discover CLI flags before using the pinned tool; init creates no hosted resource.
  run('supabase', ['init', '--help']);
  run('supabase', ['start', '--help']);
  run('supabase', ['stop', '--help']);
  run('supabase', ['init']);
  const source = await start('source');
  const created = await source.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const actor = created.data.user.id;
  // Include the repository's complete base business schema, populated only by synthetic rows.
  sql(null, await readFile(resolve('supabase/schema.sql'), 'utf8'));
  sql(null, `
    CREATE SCHEMA nasun_internal;
    CREATE TABLE nasun_internal.drill_ledger(id text PRIMARY KEY, receipt jsonb NOT NULL);
    INSERT INTO nasun_internal.drill_ledger VALUES ('operation-1','{"ok":true}');
    REVOKE ALL ON SCHEMA nasun_internal FROM PUBLIC,anon,authenticated;
    ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.distributors TO authenticated;
    CREATE POLICY drill_region ON public.distributors FOR SELECT TO authenticated
      USING (region=(SELECT managed_region FROM public.profiles WHERE id=auth.uid()));
    GRANT SELECT ON public.profiles TO authenticated;
    INSERT INTO public.profiles(id,full_name,role,managed_region)
      VALUES ('${actor}','Synthetic recovery actor','technician','Miền Bắc')
      ON CONFLICT(id) DO UPDATE SET role='technician',managed_region='Miền Bắc';
    INSERT INTO public.distributors(id,name,region,status) VALUES
      ('SYN-RESTORE-N','Synthetic north','Miền Bắc','Đang hợp tác'),
      ('SYN-RESTORE-S','Synthetic south','Miền Nam','Đang hợp tác');
    CREATE POLICY drill_object_read ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id='drill-private' AND owner_id=auth.uid()::text);
    CREATE POLICY drill_object_write ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id='drill-private' AND split_part(name,'/',1)=auth.uid()::text);
  `);
  const login = source.user();
  assert.ifError((await login.auth.signInWithPassword({ email, password })).error);
  assert.ifError((await source.admin.storage.createBucket('drill-private', { public: false })).error);
  const object = `${actor}/evidence.txt`;
  assert.ifError((await login.storage.from('drill-private').upload(object, bytes, { contentType: 'text/plain' })).error);
  const before = sql(`SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users),'ledger',(SELECT jsonb_agg(t ORDER BY id) FROM nasun_internal.drill_ledger t),'distributors',(SELECT jsonb_agg(t ORDER BY id) FROM public.distributors t),'policies',(SELECT jsonb_agg(t ORDER BY policyname) FROM (SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE policyname LIKE 'drill_%') t));`).trim();
  // Preserve the same schemas, ACLs and role definitions as the recovery backup job.
  const container = `supabase_db_${active}`;
  run('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema=public', '--schema=auth', '--schema=storage', '--schema=nasun_internal', '--format=custom', '--no-owner', '-f', '/tmp/database.dump']);
  run('docker', ['cp', `${container}:/tmp/database.dump`, join(archive, 'database.dump')]);
  await writeFile(join(archive, 'roles.sql'), run('docker', ['exec', container, 'pg_dumpall', '-U', 'postgres', '--roles-only', '--no-role-passwords']));
  await exportStorageBackup({ storage: source.admin.storage, outputDirectory: join(archive, 'storage'),
    fetchObject: async (bucket, name) => {
      const result = await source.admin.storage.from(bucket).download(name);
      assert.ifError(result.error);
      return new Response(result.data);
    } });
  await verifyStorageArchive(join(archive, 'storage'));
  await createRecoveryIntegrity(archive);
  run('tar', ['-czf', join(root, 'recovery.tar.gz'), '-C', root, 'recovery']);
  await encryptRecoveryBackup(join(root, 'recovery.tar.gz'), join(root, 'recovery.enc'), passphrase);
  stop();
  console.log('Synthetic source exported and removed; starting independent empty destination.');
  const destination = await start('destination');
  assert.equal(sql('SELECT count(*) FROM auth.users;').trim(), '0');
  assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','nasun_internal');").trim(), '0');
  await decryptRecoveryBackup(join(root, 'recovery.enc'), join(root, 'restored.tar.gz'), passphrase);
  await mkdir(join(root, 'decrypted'));
  run('tar', ['-xzf', join(root, 'restored.tar.gz'), '-C', join(root, 'decrypted')]);
  const recovered = join(root, 'decrypted', 'recovery');
  await verifyRecoveryIntegrity(recovered);
  await verifyStorageArchive(join(recovered, 'storage'));
  run('docker', ['cp', join(recovered, 'database.dump'), `supabase_db_${active}:/tmp/database.dump`]);
  const toc = run('docker', ['exec', `supabase_db_${active}`, 'pg_restore', '--list', '/tmp/database.dump']);
  // Keep platform-owned auth/storage DDL from the fresh pinned stack. Restore all app DDL/ACLs,
  // Auth data, and custom Storage policies. Object metadata is rebuilt through Storage API.
  const selected = toc.split('\n').filter(line => {
    if (line.startsWith(';')) return true;
    if (/ SCHEMA - public /.test(line)) return false;
    if (/ (?:public|nasun_internal) /.test(line)) return true;
    if (/ TABLE DATA auth /.test(line) && !/schema_migrations/.test(line)) return true;
    return / POLICY storage objects drill_/.test(line);
  }).join('\n');
  await writeFile(join(root, 'restore.list'), selected);
  run('docker', ['cp', join(root, 'restore.list'), `supabase_db_${active}:/tmp/restore.list`]);
  run('docker', ['exec', `supabase_db_${active}`, 'pg_restore', '-U', 'postgres', '-d', 'postgres', '--no-owner', '--exit-on-error', '--single-transaction', '--use-list=/tmp/restore.list', '/tmp/database.dump']);
  const manifest = JSON.parse(await readFile(join(recovered, 'storage', 'manifest.json'), 'utf8'));
  for (const bucket of manifest.buckets) assert.ifError((await destination.admin.storage.createBucket(bucket.id, { public: bucket.public })).error);
  const restoredLogin = destination.user();
  assert.ifError((await restoredLogin.auth.signInWithPassword({ email, password })).error);
  assert.equal((await restoredLogin.auth.getUser()).data.user.id, actor);
  for (const file of manifest.files) {
    const content = await readFile(join(recovered, 'storage', file.file));
    assert.equal(sha(content), file.sha256);
    assert.ifError((await restoredLogin.storage.from(file.bucket).upload(file.name, content, { contentType: 'text/plain' })).error);
    const downloaded = await restoredLogin.storage.from(file.bucket).download(file.name);
    assert.ifError(downloaded.error);
    assert.equal(sha(Buffer.from(await downloaded.data.arrayBuffer())), file.sha256);
    const anonymous = destination.user();
    assert.ok((await anonymous.storage.from(file.bucket).download(file.name)).error);
    assert.ok((await anonymous.storage.from(file.bucket).upload('forbidden.txt', content)).error);
  }
  // Reload Data API metadata after restoring DDL, then exercise restored row policies.
  sql("NOTIFY pgrst, 'reload schema';");
  let visible;
  for (let attempt = 0; attempt < 15; attempt++) {
    visible = await restoredLogin.from('distributors').select('id');
    if (!visible.error && visible.data.length === 1) break;
    await new Promise(accept => setTimeout(accept, 1000));
  }
  assert.ifError(visible.error);
  assert.deepEqual(visible.data.map(row => row.id), ['SYN-RESTORE-N']);
  const after = sql(`SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users),'ledger',(SELECT jsonb_agg(t ORDER BY id) FROM nasun_internal.drill_ledger t),'distributors',(SELECT jsonb_agg(t ORDER BY id) FROM public.distributors t),'policies',(SELECT jsonb_agg(t ORDER BY policyname) FROM (SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE policyname LIKE 'drill_%') t));`).trim();
  assert.equal(after, before, 'Restored data and policy metadata must match');
  assert.equal(sql("SELECT has_table_privilege('authenticated','public.distributors','SELECT');").trim(), 't');
  assert.equal(sql("SELECT has_schema_privilege('authenticated','nasun_internal','USAGE');").trim(), 'f');
  console.log(JSON.stringify({ passed: true, environment: 'disposable-local-Supabase-on-public-standard-runner',
    productionDataUsed: false, hostedRestoreVerified: false, fullNasunMigrationChainVerified: false,
    database: true, authIdentityAndPasswordLogin: true, privateStorageBytesAndDenials: true,
    regionalRls: true, grantsAndPolicies: true, encryptionRoundtrip: true,
    elapsedSeconds: Math.ceil((Date.now() - started) / 1000), revision: process.env.GITHUB_SHA }));
} finally {
  stop();
}
