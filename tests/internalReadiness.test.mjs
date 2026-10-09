import test from 'node:test';
import assert from 'node:assert/strict';
import {assessBackupFreshness} from '../scripts/verify-internal-readiness.mjs';
test('failed latest backup cannot be hidden by an older successful backup',()=>{
 const now=Date.parse('2026-10-09T10:00:00Z');
 const results=assessBackupFreshness([{id:1,name:'Encrypted Database Backup',status:'completed',conclusion:'success',created_at:'2026-10-08T10:00:00Z'},{id:2,name:'Encrypted Database Backup',status:'completed',conclusion:'failure',created_at:'2026-10-09T09:00:00Z'}],now);
 assert.equal(results[0].passed,false);assert.equal(results[0].runId,2);assert.equal(results[1].passed,false);
});
test('stale, missing and future backup timestamps fail closed',()=>{
 for(const timestamp of ['2026-10-01T00:00:00Z','2027-01-01T00:00:00Z'])assert.equal(assessBackupFreshness([{id:1,name:'Encrypted Database Backup',status:'completed',conclusion:'success',created_at:timestamp}],Date.parse('2026-10-09T00:00:00Z'))[0].passed,false);
});
