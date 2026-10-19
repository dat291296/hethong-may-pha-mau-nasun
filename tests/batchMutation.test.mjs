import test from 'node:test';
import assert from 'node:assert/strict';
import { persistBatchMutation } from '../src/lib/durableMutation.js';
const items=[{id:'one'},{id:'two'}];
test('batch import rejects incomplete acknowledgements and never queues permission errors',async()=>{
  let queued=0;
  const queue=async()=>queued++;
  await assert.rejects(persistBatchMutation({items,online:true,write:async()=>({data:[items[0]],error:null}),queue}),{code:'PERSISTENCE_DENIED'});
  await assert.rejects(persistBatchMutation({items,online:true,write:async()=>({error:{code:'42501'}}),queue}),{code:'42501'});
  assert.equal(queued,0);
});
test('offline import waits for every durable entry and propagates a storage failure',async()=>{
  const stored=[];
  await assert.rejects(persistBatchMutation({items,online:false,queue:async item=>{
    if(item.id==='two')throw Error('QUOTA_EXCEEDED');stored.push(item);
  }}),/QUOTA_EXCEEDED/);
  assert.deepEqual(stored,[items[0]]);
  assert.equal((await persistBatchMutation({items,online:false,queue:async()=>{}})).queued,true);
});
test('duplicate or missing batch identities are rejected before writes',async()=>{
  for(const invalid of [[{id:'same'},{id:'same'}],[{}]]) {
    await assert.rejects(persistBatchMutation({items:invalid,online:true,write:()=>assert.fail('must not write')}),{code:'INVALID_BATCH_IDENTITIES'});
  }
});
