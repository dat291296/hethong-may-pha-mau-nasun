import test from 'node:test';
import assert from 'node:assert/strict';
import {saveSystemSetEdit} from '../src/lib/systemSetEdit.js';
const revision='2026-10-19T01:00:00Z';
function query(result,calls){const builder={update(value){calls.push(['update',value]);return this;},eq(key,value){calls.push(['eq',key,value]);return this;},select(){return Promise.resolve(result);}};return fn=>fn({from:table=>{calls.push(['from',table]);return builder;}});}
test('machine profile edits use the original server revision and cannot change machine identity',async()=>{
 const calls=[];await saveSystemSetEdit(query({data:[{set_code:'SET-1'}],error:null},calls),'SET-1',{set_code:'SET-1',notes:'Field observation'},revision);
 assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='updated_at'&&c[2]===revision));
 assert.deepEqual(calls.find(c=>c[0]==='update')[1],{notes:'Field observation'});
 await assert.rejects(saveSystemSetEdit(()=>{throw Error('must not write');},'SET-1',{set_code:'SET-2'},revision),{code:'PERSISTENCE_DENIED'});
});
test('stale or permission-filtered writes and missing revisions never report saved',async()=>{
 await assert.rejects(saveSystemSetEdit(query({data:[],error:null},[]),'SET-1',{notes:'Keep draft'},revision),{code:'WRITE_CONFLICT'});
 await assert.rejects(saveSystemSetEdit(()=>{throw Error('must not write');},'SET-1',{},null),{code:'REVISION_REQUIRED'});
 await assert.rejects(saveSystemSetEdit(query({data:null,error:{code:'42501',message:'Denied'}},[]),'SET-1',{},revision),{code:'42501'});
});

test('missing server capabilities require review while network loss remains retryable',async()=>{
 const {classifySyncError}=await import('../src/lib/syncQueue.js');
 for(const code of ['REVISION_REQUIRED','SCHEMA_MIGRATION_REQUIRED','WORKFLOW_MIGRATION_REQUIRED'])assert.equal(classifySyncError({code}),'needs_review');
 assert.equal(classifySyncError({message:'Failed to fetch'}),'retry_wait');
});
