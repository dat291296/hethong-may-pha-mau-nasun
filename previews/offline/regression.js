import { migrateQueueItem } from '../../src/lib/syncQueue.js';
import {sealDataSnapshot,verifyDataSnapshot,requireUniqueDataRows} from '../../src/lib/dataIntegrity.js';
import {createOfflineAccessGrant,offlineAccessDecision} from '../../src/security/offlineAccess.js';
import {requireOfflineReplayPermission} from '../../src/security/offlineReplayPolicy.js';
const result = document.getElementById('result');
const checks = {};
const owner = 'stage1-synthetic-owner';
const draftKey = 'form-draft:stage1-old';
const operation = { id:'s1-old-queue', operationId:'s1-stable-intent', action:'EDIT_NPP', payload:{id:'s1-synthetic',contact_person:'Synthetic contact'},schemaVersion:1,engineVersion:1,timestamp:1000 };
const requestValue = request => new Promise((accept,reject) => { request.onsuccess=()=>accept(request.result);request.onerror=()=>reject(request.error); });
const transactionDone = transaction => new Promise((accept,reject) => { transaction.oncomplete=accept;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error); });
function verify(name, value) { checks[name] = Boolean(value); if (!value) throw new Error('STAGE1_ASSERTION_FAILED'); }

async function seedLegacy() {
  const request = indexedDB.open('nasun_offline_db',3);
  request.onupgradeneeded=()=>{
    const db=request.result;db.createObjectStore('cached_data',{keyPath:'key'});
    db.createObjectStore('offline_queue',{keyPath:'id'});db.createObjectStore('crypto_keys',{keyPath:'ownerId'});
  };
  const db=await requestValue(request);
  const queueRows=await requestValue(db.transaction('offline_queue').objectStore('offline_queue').getAll());
  const cacheRows=await requestValue(db.transaction('cached_data').objectStore('cached_data').getAll());
  if(queueRows.length || cacheRows.length) { db.close(); throw new Error('FRESH_ORIGIN_REQUIRED'); }
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  async function encrypt(store, logicalKey, value) {
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(`nasun|2|${owner}|${store}|${logicalKey}`)},key,new TextEncoder().encode(JSON.stringify(value)));
    return {ownerId:owner,encrypted:true,cryptoVersion:2,cryptoProvider:'webcrypto',algorithm:'AES-GCM',iv:Array.from(iv),ciphertext};
  }
  const draft=await encrypt('cached_data',draftKey,{savedAt:Date.now()-70*86400000,value:{notes:'Synthetic draft from schema v3',photos:['synthetic-photo-marker']}});
  const queued=await encrypt('offline_queue',operation.id,operation);
  const transaction=db.transaction(['cached_data','offline_queue','crypto_keys'],'readwrite');
  const done=transactionDone(transaction);
  transaction.objectStore('crypto_keys').put({ownerId:owner,key});
  transaction.objectStore('cached_data').put({...draft,key:`${owner}::${draftKey}`,logicalKey:draftKey});
  transaction.objectStore('offline_queue').put({...queued,id:`${owner}::${operation.id}`,itemId:operation.id,operationId:operation.operationId});
  await done;db.close();
  sessionStorage.setItem('nasun-stage1-seeded','true');
  location.replace('./regression.html?phase=current');
}

async function inspectCurrent() {
  verify('fullPageReloadAfterLegacySeed', sessionStorage.getItem('nasun-stage1-seeded')==='true');
  const storage=await import('../../src/lib/offlineDb.js');
  await storage.initializeOfflineStorage(owner);
  const saved=await storage.getCacheStrict(draftKey);
  verify('oldDraftAndPhotoSurviveV3ToV4',saved.value.notes==='Synthetic draft from schema v3' && saved.value.photos[0]==='synthetic-photo-marker');
  const queue=await storage.getQueue();
  const migrated=migrateQueueItem(queue[0]);
  verify('oldQueuePreservesOperationIdAndPayload',queue.length===1 && migrated.operationId===operation.operationId && JSON.stringify(migrated.payload)===JSON.stringify(operation.payload));
  const future={...operation,id:'s1-future',schemaVersion:99,engineVersion:99,contractVersion:99};
  const quarantined=migrateQueueItem(future);
  verify('futureClientPayloadIsQuarantined',quarantined.status==='needs_review' && quarantined.schemaVersion===99 && JSON.stringify(quarantined.payload)===JSON.stringify(future.payload));
  const lease=await storage.withOfflineLease('stage1-lease',async()=>!(await storage.withOfflineLease('stage1-lease',async()=>true)).acquired);
  verify('concurrentLeaseBlocked',lease.acquired && lease.value);
  verify('leaseReleased',(await storage.withOfflineLease('stage1-lease',async()=>true)).acquired);
  await storage.clearOfflineStorage(owner);await storage.initializeOfflineStorage('stage1-other-owner');
  verify('accountIsolation',(await storage.getQueue()).length===0 && await storage.getCacheStrict(draftKey)===null);
  await storage.initializeOfflineStorage(owner);
  verify('detachRetainsDraftAndPending',(await storage.getQueue()).length===1 && (await storage.getCacheStrict(draftKey)).value.photos.length===1);
  let blocked=false;
  try { const old=await requestValue(indexedDB.open('nasun_offline_db',3));old.close(); } catch(error) { blocked=error.name==='VersionError'; }
  verify('olderSchemaClientFailsClosed',blocked && (await storage.getQueue())[0].operationId===operation.operationId);
  for(const [scenario,status] of Object.entries({online:200,unauthorized:401,forbidden:403,conflict:409,invalid:422,transient:503})) {
    verify(`networkFixture_${scenario}`,(await fetch(`/__fixture?scenario=${scenario}`)).status===status);
  }
  let timedOut=false;
  try { await fetch('/__fixture?scenario=timeout',{signal:AbortSignal.timeout(50)}); } catch { timedOut=true; }
  verify('boundedNetworkTimeout',timedOut);
  let replyLost=false;
  try { await fetch('/__fixture?scenario=lost-ack&operation=s1-browser-intent'); } catch { replyLost=true; }
  const receipt=await (await fetch('/__fixture?scenario=replay&operation=s1-browser-intent')).json();
  verify('lostAckFixtureKeepsSingleCommit',replyLost && receipt.commits===1 && receipt.operation==='s1-browser-intent');
  const snapshot=await sealDataSnapshot({owner,rows:[{id:'S1',notes:'Synthetic retained data'}]});
  verify('stage2SnapshotChecksumVerified',await verifyDataSnapshot(snapshot));
  snapshot.rows[0].notes='changed';verify('stage2SnapshotTamperRejected',!await verifyDataSnapshot(snapshot));
  let duplicatesRejected=false;try{requireUniqueDataRows([{id:'S1'},{id:'S1'}],'id');}catch{duplicatesRejected=true;}
  verify('stage2DuplicateIdentitiesRejected',duplicatesRejected);
  const profile={id:owner,role:'technician',managedRegion:'Miền Bắc'};
  const now=Date.now();const grant=createOfflineAccessGrant(profile,now,{session_expires_at:new Date(now+60000).toISOString()});
  verify('stage3OfflineReadScopeValid',offlineAccessDecision(grant,profile,now+1).allowed);
  verify('stage3ExpiredOrForeignGrantRejected',!offlineAccessDecision(grant,profile,now+60000).allowed&&!offlineAccessDecision(grant,{...profile,id:'foreign'},now+1).allowed);
  let downgradeRejected=false;try{requireOfflineReplayPermission({...profile,role:'viewer'},{action:'EDIT_NPP',ownerId:owner,payload:{region:'Miền Bắc'}});}catch{downgradeRejected=true;}
  verify('stage3DowngradeStopsReplayWithoutDroppingQueue',downgradeRejected&&(await storage.getQueue()).length===1);
  let wrongRegionRejected=false;try{requireOfflineReplayPermission(profile,{action:'EDIT_NPP',ownerId:owner,payload:{region:'Miền Nam'}});}catch{wrongRegionRejected=true;}
  verify('stage3ForeignRegionStopsReplay',wrongRegionRejected);
  const report={passed:true,checks,scope:'Synthetic browser/schema/environment tests; not live JWT, restore or physical iOS',backendConnected:false};
  result.textContent=JSON.stringify(report,null,2);result.dataset.complete='true';result.dataset.passed='true';
  const offlineButton=document.getElementById('offline-read');offlineButton.disabled=false;
  offlineButton.onclick=async()=>{
    const output=document.getElementById('offline-read-result');
    try { const draft=await storage.getCacheStrict(draftKey);const pending=await storage.getQueue();
      const ok=draft.value.photos.length===1 && pending[0].operationId===operation.operationId;
      output.dataset.passed=String(ok);output.textContent=ok?'Đọc lại nháp và hàng chờ đạt.':'Không đọc được dữ liệu đã giữ.';
    } catch {output.dataset.passed='false';output.textContent='Không đọc được dữ liệu đã giữ.';}
  };
  const reconnectButton=document.getElementById('reconnect');reconnectButton.disabled=false;
  reconnectButton.onclick=async()=>{
    const output=document.getElementById('reconnect-result');
    try { const ok=(await fetch('/__fixture?scenario=online')).status===200;output.dataset.passed=String(ok);output.textContent=ok?'Kết nối trở lại đạt.':'Chưa có kết nối.'; }
    catch {output.dataset.passed='false';output.textContent='Chưa có kết nối.';}
  };
}
try {
  if(new URL(location.href).searchParams.get('phase')==='current')await inspectCurrent();else await seedLegacy();
} catch(error) {
  result.textContent=JSON.stringify({passed:false,checks,error:['FRESH_ORIGIN_REQUIRED','STAGE1_ASSERTION_FAILED'].includes(error.message)?error.message:'STAGE1_BROWSER_FAILED'},null,2);
  result.dataset.complete='true';result.dataset.passed='false';
}
