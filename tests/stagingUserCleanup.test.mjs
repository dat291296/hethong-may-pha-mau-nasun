import test from 'node:test';
import assert from 'node:assert/strict';
import { retireStagingUser } from '../scripts/staging-user-cleanup.mjs';
test('staging cleanup disables fixture access and soft-deletes without changing audit identity', async () => {
  const calls=[];
  const client={from:table=>({update:payload=>({eq:async(key,id)=>{calls.push({table,payload,key,id});return {error:null};}})}),auth:{admin:{deleteUser:async(id,soft)=>{calls.push({id,soft});return {error:null};}}}};
  await retireStagingUser(client,'fixture');
  assert.deepEqual(calls,[{table:'profiles',payload:{is_active:false},key:'id',id:'fixture'},{id:'fixture',soft:true}]);
});
