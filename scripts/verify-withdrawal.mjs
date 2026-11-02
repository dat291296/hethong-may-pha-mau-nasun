import { spawn } from 'node:child_process';
import { validateStagingDestination } from './apply-staging-safety.mjs';

const destination = validateStagingDestination(process.env);
const child = spawn('psql', ['--dbname=' + destination.href, '-X', '-q', '-v', 'ON_ERROR_STOP=1',
  '-f', 'scripts/verify-withdrawal.rollback.sql'], {
  env: {...process.env, PGSSLMODE:'require'}, stdio:['ignore','ignore','ignore'],
});
const timer = setTimeout(() => child.kill(),90000);
try {
  await new Promise((accept,reject) => {
    child.on('error',()=>reject(new Error('WITHDRAWAL_QUERY_CLIENT_UNAVAILABLE')));
    child.on('exit',code=>code===0?accept():reject(new Error('WITHDRAWAL_ACCEPTANCE_FAILED')));
  });
  console.log('Withdrawal acceptance passed: four inventory categories, history and retry receipt; fixtures rolled back.');
} finally { clearTimeout(timer); }
