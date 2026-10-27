import {hasPermission} from './rbac.js';
// This preflight only rejects stale intents; server RLS remains authoritative.
const permissions=Object.freeze({ADD_NPP:'npp:create',EDIT_NPP:'npp:edit',DELETE_NPP:'npp:delete',
 ADD_DEVICE:'asset:create',EDIT_DEVICE:'asset:edit',DELETE_DEVICE:'asset:delete',LINK_DEVICE:'asset:edit',
 ASSEMBLE_SET:'asset:create',UPDATE_SYSTEM_SET:'asset:edit',DELETE_SYSTEM_SET:'asset:delete',
 ADD_REPAIR:'repair:create',EDIT_REPAIR:'repair:edit',DELETE_REPAIR:'repair:delete',ADD_AUDIT_LOG:'repair:create'});
export function requireOfflineReplayPermission(scope,item){
 if(item.ownerId&&item.ownerId!==scope.id)throw Object.assign(new Error('OFFLINE_OWNER_CHANGED'),{code:'OFFLINE_OWNER_CHANGED'});
 let permission=permissions[item.action];
 if(item.action==='EXECUTE_WORKFLOW')permission={INSTALL:'workflow:install',TRANSFER:'workflow:transfer',WITHDRAW:'workflow:withdraw'}[item.payload?.workflow];
 if(!permission||!hasPermission(scope.role,permission))throw Object.assign(new Error('OFFLINE_PERMISSION_CHANGED'),{code:'42501'});
 const region=item.payload?.region||item.payload?.data?.region;
 if(region&&scope.role!=='admin'&&region!==scope.managedRegion)throw Object.assign(new Error('OFFLINE_REGION_CHANGED'),{code:'42501'});
 return true;
}
