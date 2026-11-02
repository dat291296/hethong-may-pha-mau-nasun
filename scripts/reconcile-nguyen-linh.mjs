import {spawn} from 'node:child_process';
import {productionAuthorizationDestination} from './verify-production-authorization.mjs';
const destination=productionAuthorizationDestination(process.env);
const child=spawn('psql',['--dbname='+destination.href,'-X','-q','-v','ON_ERROR_STOP=1','-f','scripts/reconcile-nguyen-linh.sql'],{
  env:{...process.env,PGSSLMODE:'require'},stdio:['ignore','ignore','ignore'],
});
const timer=setTimeout(()=>child.kill(),60000);
try {
  await new Promise((accept,reject)=>{
    child.on('error',()=>reject(new Error('RECONCILIATION_CLIENT_UNAVAILABLE')));
    child.on('exit',code=>code===0?accept():reject(new Error('RECONCILIATION_FAILED_REQUIRES_REVIEW')));
  });
  console.log('Nguyen Linh audited withdrawal reconciled; all four inventory devices verified free.');
} finally {clearTimeout(timer);}
