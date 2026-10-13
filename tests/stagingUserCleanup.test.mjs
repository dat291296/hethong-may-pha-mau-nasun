import test from 'node:test';
import assert from 'node:assert/strict';
import { retireStagingUser } from '../scripts/staging-user-cleanup.mjs';
test('staging cleanup disables fixture access and soft-deletes without changing audit identity', async () => {
  const calls=[];
  const client={auth:{admin:{updateUserById:async(id,payload)=>{calls.push({id,payload});return {error:null};},deleteUser:async(id,soft)=>{calls.push({id,soft});return {error:null};}}}};
  await retireStagingUser(client,'fixture');
  assert.deepEqual(calls,[{id:'fixture',payload:{ban_duration:'876000h'}},{id:'fixture',soft:true}]);
});
