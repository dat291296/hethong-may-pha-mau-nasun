import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ROLES, hasPermission } from '../src/shared/security/rbac.js';
import { REGIONS, canEditRegion } from '../src/shared/workspace/workspaceFilters.js';
import { validateStagingDestination } from './apply-staging-safety.mjs';

export function authorizationCases() {
  return ALL_ROLES.flatMap(role => REGIONS.flatMap(assignedRegion => REGIONS.flatMap(targetRegion =>
    ['read', 'create', 'edit', 'delete', 'move'].map(action => {
      const user = { role, managedRegion: role === 'admin' ? 'Toàn Quốc' : assignedRegion };
      const permission = `npp:${action === 'move' ? 'edit' : action}`;
      const regional = action === 'read' ? role === 'admin' || assignedRegion === targetRegion
        : action === 'delete' ? true : canEditRegion(user, targetRegion);
      return { role, assignedRegion, targetRegion, action,
        allowed: hasPermission(role, permission) && regional };
    }))));
}

export async function buildAuthorizationSql() {
  const template = await readFile(new URL('./verify-authorization-boundaries.rollback.sql', import.meta.url), 'utf8');
  const cases = authorizationCases();
  // Only fixed roles, actions and regions are generated; quote SQL literals as well.
  return template.replace("'[]'::jsonb /* AUTHORIZATION_CASES */", `'${JSON.stringify(cases).replaceAll("'", "''")}'::jsonb`)
    + `\nSELECT '${JSON.stringify({ status: 'passed', cases: cases.length, roles: ALL_ROLES.length,
      regions: REGIONS.length, sessionCases: ALL_ROLES.length * REGIONS.length * 3,
      evidence: 'postgres-role-and-claims', realJwt: false, fixtures: 'rolled-back' })}' AS authorization_result;\n`;
}

export async function runAuthorizationBoundaries(environment = process.env) {
  const destination = validateStagingDestination(environment);
  const sql = await buildAuthorizationSql();
  const child = spawn('psql', ['--dbname=' + destination.href, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], {
    env: { ...environment, PGSSLMODE: 'require' }, stdio: ['pipe', 'pipe', 'ignore'],
  });
  let output = '';
  const timer = setTimeout(() => child.kill(), 90000);
  try {
    await new Promise((accept, reject) => {
      child.on('error', () => reject(new Error('AUTHORIZATION_POSTGRES_UNAVAILABLE')));
      child.stdout.on('data', chunk => { if (output.length < 65536) output += chunk; });
      child.on('exit', code => code === 0 ? accept() : reject(new Error('AUTHORIZATION_BOUNDARIES_FAILED')));
      child.stdin.on('error', () => {});
      child.stdin.end(sql);
    });
    const result = JSON.parse(output.trim().split(/\r?\n/).at(-1));
    if (result.status !== 'passed' || result.cases !== authorizationCases().length || result.realJwt !== false) {
      throw new Error('AUTHORIZATION_RECEIPT_INVALID');
    }
    console.log(JSON.stringify(result));
    return result;
  } finally { clearTimeout(timer); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAuthorizationBoundaries().catch(error => { console.error(error.message); process.exitCode = 1; });
}
