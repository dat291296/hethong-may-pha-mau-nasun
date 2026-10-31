import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineAccessGrant,offlineAccessDecision,requireCurrentReplayScope,MAX_OFFLINE_READ_MS} from '../src/shared/security/offlineAccess.js';
import {requireOfflineReplayPermission} from '../src/shared/security/offlineReplayPolicy.js';
const user={id:'A',role:'technician',managedRegion:'Miền Bắc'};
test('offline reads require a matching account, bounded time window and unchanged scope',()=>{
 const grant=createOfflineAccessGrant(user,1000);
 assert.equal(offlineAccessDecision(grant,user,2000).allowed,true);
 for(const target of [{...user,id:'B'},{...user,role:'admin'},{...user,managedRegion:'Miền Nam'}])assert.equal(offlineAccessDecision(grant,target,2000).allowed,false);
 for(const now of [999,1000+MAX_OFFLINE_READ_MS])assert.equal(offlineAccessDecision(grant,user,now).allowed,false);
 assert.equal(offlineAccessDecision({...grant,expiresAt:grant.expiresAt+1},user,2000).allowed,false);
 assert.equal(offlineAccessDecision(null,user).allowed,false);
});
test('invalid and nationwide non-admin scopes are never granted offline',()=>{
 for(const role of ['manager','technician','qc','viewer','unknown'])assert.throws(()=>createOfflineAccessGrant({...user,role,managedRegion:'Toàn Quốc'}));
 assert.equal(createOfflineAccessGrant({...user,role:'admin',managedRegion:'Toàn Quốc'}).role,'admin');
});
test('offline grant never outlives known server session or trusted device deadlines',()=>{
 const grant=createOfflineAccessGrant(user,1000,{trusted_until:new Date(5000).toISOString(),session_expires_at:new Date(9000).toISOString()});
 assert.equal(grant.expiresAt,5000);assert.equal(offlineAccessDecision(grant,user,5000).allowed,false);
 assert.throws(()=>createOfflineAccessGrant(user,1000,{trusted_until:'invalid'}));
 assert.throws(()=>createOfflineAccessGrant(user,1000,{session_expires_at:new Date(1000).toISOString()}));
});
test('server replay identity and active role/region must be complete and current',()=>{
 const state={user_id:'A',role:'technician',managed_region:'Miền Bắc',profile_found:true,is_active:true};
 assert.deepEqual(requireCurrentReplayScope(state,'A'),user);
 for(const update of [{user_id:undefined},{user_id:'B'},{role:'root'},{managed_region:'Toàn Quốc'},{is_active:false},{profile_found:false}])assert.throws(()=>requireCurrentReplayScope({...state,...update},'A'));
});
test('cached edits cannot replay after downgrade, region change or owner mismatch',()=>{
 const item={ownerId:'A',action:'EDIT_NPP',payload:{region:'Miền Bắc'}};
 assert.equal(requireOfflineReplayPermission(user,item),true);
 for(const scope of [{...user,role:'viewer'},{...user,id:'B'},{...user,managedRegion:'Miền Nam'}])assert.throws(()=>requireOfflineReplayPermission(scope,item));
 for(const action of ['DELETE_NPP','DELETE_DEVICE','DELETE_REPAIR','UPDATE_AUDIT_LOG','DELETE_AUDIT_LOG','UNKNOWN'])assert.throws(()=>requireOfflineReplayPermission(user,{...item,action}));
 assert.throws(()=>requireOfflineReplayPermission(user,{...item,action:'EXECUTE_WORKFLOW',payload:{workflow:'MAINTENANCE'}}));
});
