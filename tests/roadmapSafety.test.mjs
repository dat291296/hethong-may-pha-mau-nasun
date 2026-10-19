import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRepairReturn} from '../src/lib/repairLifecycle.js';
import {buildSupportReport} from '../src/lib/supportReport.js';
test('unfinished repairs cannot be sent back but completed and legacy unreturned repairs remain editable',()=>{
 for(const processingStatus of ['Chưa xử lý','Đang xử lý',undefined]) assert.throws(()=>validateRepairReturn({processingStatus,customerReturnStatus:'Đã gửi trả'}),{code:'INVALID_REPAIR_RETURN'});
 assert.doesNotThrow(()=>validateRepairReturn({processingStatus:'Đã xử lý',customerReturnStatus:'Đã gửi trả'}));
 assert.doesNotThrow(()=>validateRepairReturn({processingStatus:'Chưa xử lý',customerReturnStatus:'Chưa gửi trả'}));
});
test('support export retains aggregate health while excluding credentials, identities and business content',()=>{
 const report=buildSupportReport({health:{online:true,queueTotal:3,counts:{needs_review:1},payload:'secret-customer',userId:'secret-id'},diagnostics:{counts:{sync:2},errors:['secret-token']},performance:{LCP:{value:420},URL:{value:'secret-url'}}});
 assert.equal(report.queueCounts.needs_review,1);assert.equal(report.errorCounts.sync,2);assert.equal(report.performance.LCP,420);
 assert.doesNotMatch(JSON.stringify(report),/secret|customer|token|userId|payload/);
});
test('support export sanitizes invalid aggregate counts and metric values',()=>{
 const report=buildSupportReport({health:{queueTotal:-5,counts:{pending:Infinity,needs_review:2.8}},performance:{INP:{value:NaN},CLS:{value:-1}}});
 assert.equal(report.queueTotal,0);assert.equal(report.queueCounts.pending,0);assert.equal(report.queueCounts.needs_review,2);assert.equal(report.performance.CLS,0);assert.equal(report.performance.INP,undefined);
});
