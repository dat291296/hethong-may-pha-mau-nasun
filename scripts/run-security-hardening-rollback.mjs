import {spawn} from 'node:child_process';
import {validateStagingDestination} from './apply-staging-safety.mjs';
const destination=validateStagingDestination(process.env);
for (const file of ['scripts/verify-security-hardening.rollback.sql', 'scripts/verify-security-upgrade-state.sql', 'scripts/verify-security-upgrade.rollback.sql']) {
 const child=spawn('psql',['--dbname='+destination.href,'-X','-v','ON_ERROR_STOP=1','-f',file],{env:{...process.env,PGSSLMODE:'require'},stdio:['ignore','ignore','ignore']});
 await new Promise((resolve,reject)=>{child.on('error',()=>reject(new Error('PostgreSQL client unavailable')));child.on('exit',code=>code===0?resolve():reject(new Error('Staging rollback verification failed; no fixtures were committed')));});
}
console.log('Synthetic staging rollback verification passed.');
