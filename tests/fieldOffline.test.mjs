import test from 'node:test';
import assert from 'node:assert/strict';
import { createFieldSyncProtocol, buildFieldPack, readFieldPack, requireOfflineAction } from '../src/modules/fieldwork/lib/fieldOffline.js';
import { commitSyncCheckpoint, refreshBeforeCheckpoint } from '../src/shared/lib/syncCheckpoint.js';

function fixture() {
  const documents = new Map(); let account = 'a', clock = 1000, seq = 0;
  const control = { offline: false, quota: false, lost: false, status: 200, badAck: false, badPull: false };
  const server = { version: 0, commits: 0, receipts: new Map() };
  const options = {
    owner: () => account, now: () => clock, id: () => `operation-${++seq}`,
    load: async key => structuredClone(documents.get(key)),
    save: async (key, value) => { if(control.quota) return false; documents.set(key, structuredClone(value)); return true; },
    lock: async (_key, task) => task(),
    send: async operation => {
      if(control.offline) throw Error('NETWORK_ERROR');
      if(control.status !== 200) return { status: control.status, version: server.version };
      if(control.badAck) return { ok: true, operationId: 'wrong', version: 1 };
      if(server.receipts.has(operation.id)) return server.receipts.get(operation.id);
      if(operation.baseVersion !== server.version) return { status: 409, version: server.version };
      const receipt = { ok: true, operationId: operation.id, version: ++server.version };
      server.receipts.set(operation.id, receipt); server.commits++;
      if(control.lost) { control.lost = false; throw Error('RESPONSE_LOST'); }
      return receipt;
    },
    pull: async () => control.badPull ? { cursor: 'bad', rows: [] } : { cursor: server.version, rows: [{ id: 'S1', version: server.version, owner: account }] },
  };
  return { protocol: createFieldSyncProtocol(options), options, control, server, documents, switch: value => { account = value; }, advance: () => { clock += 300000; } };
}

test('an offline draft survives protocol recreation with stable identity and payload', async () => {
  const f = fixture(); const operation = await f.protocol.stage('repair','S1',0,{ notes:'Lỗi máy lắc', materials:'Dây curoa mới', photos:['synthetic-image'] });
  const reopened = createFieldSyncProtocol(f.options);
  assert.deepEqual((await reopened.snapshot()).operations[0], operation);
  assert.equal(f.server.commits, 0);
});

test('saving the same form intent twice updates only its draft and never duplicates a submitted intent', async () => {
  const f=fixture(); await f.protocol.stage('repair','S1',0,{notes:'first'},'stable-form-id');
  await f.protocol.stage('repair','S1',0,{notes:'second'},'stable-form-id');
  assert.equal((await f.protocol.snapshot()).operations.length,1);
  await f.protocol.submit('stable-form-id');
  await f.protocol.stage('repair','S1',0,{notes:'second'},'stable-form-id');
  await assert.rejects(f.protocol.stage('repair','S1',0,{notes:'third'},'stable-form-id'));
  assert.equal((await f.protocol.snapshot()).operations.length,1);
});

test('server commit followed by a lost reply retries the same operation without duplicate writes', async () => {
  const f = fixture(); const row = await f.protocol.stage('notes','S1',0,{ notes:'Synthetic' }); await f.protocol.submit(row.id);
  f.control.lost = true; await f.protocol.sync();
  assert.equal((await f.protocol.snapshot()).operations[0].status,'retry_wait');
  f.advance(); await f.protocol.sync();
  assert.equal(f.server.commits,1); assert.equal((await f.protocol.snapshot()).operations[0].status,'confirmed');
});

test('conflicts retain the old edit and require explicit rebase into a new draft', async () => {
  const f = fixture(); const row = await f.protocol.stage('repair','S1',0,{ notes:'My edit' }); await f.protocol.submit(row.id); f.server.version = 2;
  await f.protocol.sync(); assert.equal((await f.protocol.snapshot()).operations[0].status,'conflict');
  await assert.rejects(f.protocol.rebase(row.id,1)); await f.protocol.rebase(row.id,2);
  const state = await f.protocol.snapshot(); assert.equal(state.operations[0].status,'retained'); assert.equal(state.operations[1].status,'draft');
  assert.notEqual(state.operations[0].id,state.operations[1].id); assert.equal(state.operations[1].baseVersion,2); assert.equal(f.server.commits,0);
});

test('revoked sessions and permission denial preserve work without automatic retry', async () => {
  for(const status of [401,403,422]) {
    const f = fixture(); const row = await f.protocol.stage('maintenance','S1',0,{ checklist:['PASS'] }); await f.protocol.submit(row.id); f.control.status=status;
    await f.protocol.sync(); await f.protocol.sync();
    const saved=(await f.protocol.snapshot()).operations[0]; assert.equal(saved.attempts,1); assert.notEqual(saved.status,'confirmed'); assert.equal(f.server.commits,0);
  }
});

test('quota failure never claims a durable draft or advances a pull cursor', async () => {
  const f=fixture(); f.control.quota=true; await assert.rejects(f.protocol.stage('repair','S1',0,{notes:'Keep me'})); assert.equal(f.documents.size,0);
  f.control.quota=false; await f.protocol.stage('repair','S1',0,{notes:'Keep me'}); const before=structuredClone(f.documents.get('a'));
  f.server.version=4; f.control.quota=true; await assert.rejects(f.protocol.sync()); assert.deepEqual(f.documents.get('a'),before);
});

test('switching account hides drafts and returning to the original account recovers them', async () => {
  const f=fixture(); await f.protocol.stage('repair','S1',0,{notes:'Private draft'}); f.switch('b'); assert.equal((await f.protocol.snapshot()).operations.length,0);
  f.switch('a'); assert.equal((await f.protocol.snapshot()).operations.length,1);
});

test('wrong acknowledgements and malformed pull batches do not clear pending work', async () => {
  const f=fixture(); const row=await f.protocol.stage('repair','S1',0,{notes:'Synthetic'}); await f.protocol.submit(row.id); f.control.badAck=true; await f.protocol.sync();
  assert.equal((await f.protocol.snapshot()).operations[0].status,'review'); f.control.badPull=true; await assert.rejects(f.protocol.sync()); assert.equal((await f.protocol.snapshot()).cursor,0);
});

test('allocation can be drafted offline but cannot be submitted without online confirmation', async () => {
  const f=fixture(); const row=await f.protocol.stage('allocation','S1',0,{device:'M1'});
  await assert.rejects(f.protocol.submit(row.id)); await assert.rejects(f.protocol.submit(row.id,{online:true}));
  await f.protocol.submit(row.id,{online:true,confirm:true});
  assert.throws(()=>requireOfflineAction('audit',true)); assert.throws(()=>requireOfflineAction('allocation',false));
});

test('field packs exclude unselected records, inline photos and secrets and expire without deleting drafts', () => {
  const pack=buildFieldPack({owner:'a',now:1000,selected:['S1'],machines:[{setCode:'S1',nppId:'N1',nppName:'Đại lý mẫu',dispenserSerial:'X',installationPhotos:['private'],secret:'hidden'},{setCode:'S2'}],npps:[{id:'N1',name:'Demo',secret:'hidden'},{id:'N2'}]});
  assert.equal(pack.machines.length,1); assert.equal(pack.npps.length,1); assert.equal(pack.machines[0].secret,undefined); assert.equal(pack.machines[0].installationPhotos,undefined);
  assert.equal(readFieldPack(pack,'b','',2000).state,'missing'); assert.equal(readFieldPack(pack,'a','dai ly',2000).machines.length,1);
  assert.equal(readFieldPack(pack,'a','',pack.expiresAt).state,'expired'); assert.equal(pack.machines.length,1);
});

test('cursor commits require matching account, generation, receipt and a durable write', async () => {
  const pending={owner:'a',generation:3,cursor:9}; let writes=0;
  const attempt=extra=>commitSyncCheckpoint({pending,owner:'a',generation:3,cursor:9,persist:async()=>{writes++;return true;},...extra});
  assert.equal(await attempt({owner:'b'}),false); assert.equal(await attempt({generation:4}),false); assert.equal(await attempt({cursor:10}),false); assert.equal(writes,0);
  assert.equal(await attempt({persist:async()=>false}),false); assert.equal(await attempt(),true);
});

test('refresh failure or a skipped refresh never acknowledges a change batch', async () => {
  let ack=0; const acknowledge=async()=>{ack++;return true;};
  assert.equal(await refreshBeforeCheckpoint([Promise.resolve(false)],acknowledge),false);
  assert.equal(await refreshBeforeCheckpoint([Promise.reject(Error('network'))],acknowledge),false);
  assert.equal(await refreshBeforeCheckpoint([Promise.resolve(undefined)],acknowledge),false);
  assert.equal(ack,0); assert.equal(await refreshBeforeCheckpoint([Promise.resolve(true)],acknowledge),true);
});
