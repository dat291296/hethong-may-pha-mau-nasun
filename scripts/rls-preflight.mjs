import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLES = ['admin', 'manager', 'technician', 'qc', 'viewer'];
const REGIONS = ['Miền Bắc', 'Miền Trung', 'Miền Nam'];

export function validateRlsConfiguration(environment) {
  const required = ['RLS_TEST_URL', 'RLS_TEST_ANON_KEY', 'RLS_PRODUCTION_URL'];
  for (const role of ROLES) {
    const prefix = `RLS_TEST_${role.toUpperCase()}`;
    required.push(`${prefix}_EMAIL`, `${prefix}_PASSWORD`);
    if (role !== 'admin') required.push(`${prefix}_REGION`);
  }
  const issues = required.filter(name => !environment[name]?.trim()).map(name => `MISSING:${name}`);
  const origins = {};
  for (const name of ['RLS_TEST_URL', 'RLS_PRODUCTION_URL']) {
    if (!environment[name]?.trim()) continue;
    try {
      const url = new URL(environment[name]);
      if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
        || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
        issues.push(`INVALID_ENDPOINT:${name}`);
      } else origins[name] = url.origin;
    } catch { issues.push(`INVALID_ENDPOINT:${name}`); }
  }
  if (origins.RLS_TEST_URL && origins.RLS_TEST_URL === origins.RLS_PRODUCTION_URL) {
    issues.push('RLS tests require an isolated staging project');
  }
  const key = environment.RLS_TEST_ANON_KEY?.trim();
  if (key) {
    let publicKey = key.startsWith('sb_publishable_') && key.length > 'sb_publishable_'.length;
    if (!publicKey) {
      try {
        const segments = key.split('.');
        publicKey = segments.length === 3
          && JSON.parse(Buffer.from(segments[1], 'base64url').toString()).role === 'anon';
      } catch { publicKey = false; }
    }
    if (!publicKey) issues.push('PUBLIC_KEY_REQUIRED:RLS_TEST_ANON_KEY');
  }
  const emails = new Set();
  for (const role of ROLES) {
    const prefix = `RLS_TEST_${role.toUpperCase()}`;
    const email = environment[`${prefix}_EMAIL`]?.trim().toLowerCase();
    if (email) {
      if (emails.has(email)) issues.push(`DISTINCT_ACCOUNT_REQUIRED:${prefix}_EMAIL`);
      emails.add(email);
    }
    const region = environment[`${prefix}_REGION`]?.trim();
    if (role !== 'admin' && region && !REGIONS.includes(region)) issues.push(`INVALID_REGION:${prefix}_REGION`);
  }
  return { valid: issues.length === 0, issues };
}

export function requireRlsConfiguration(environment) {
  const result = validateRlsConfiguration(environment);
  if (!result.valid) throw new Error(`RLS preflight failed: ${result.issues.join('; ')}`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireRlsConfiguration(process.env);
    console.log('RLS configuration validated; live authorization has not been tested.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
