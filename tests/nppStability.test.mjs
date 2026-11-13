import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getNppTicketStats } from '../src/modules/dashboard/lib/repairDashboard.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function fixture(overrides = {}) {
  const slots = []; let cursor = 0;
  const view = { owner: 'A', cached: [], failCache: false, reads: [] };
  const dependencies = {
    getOfflineOwner: () => view.owner,
    recordDataLoadMetric() {}, recordOperationalError() {},
    updateWithRevision: async () => ({data: [{updated_at: '2026-11-12T00:00:00Z'}]}),
    fetchAllRows: async () => ({data: view.reads, error: null}),
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]=typeof initial==='function'?initial():initial;
      return [slots[i], value => { slots[i]=typeof value==='function'?value(slots[i]):value; }]; },
    useRef(initial) { const i=cursor++; return slots[i] ||= {current:initial}; },
    useCallback: fn=>fn, useMemo: fn=>fn(), useEffect() {},
    supabase: {}, isSupabaseConfigured: true, safeQuery: async()=>({data:[{id:'N1'}]}),
    persistMutation: async options=>options.write(), persistBatchMutation: async()=>({queued:true}),
    INITIAL_NPPS: [], cacheOfflineData: async (_key,rows)=>{if(view.failCache)return false; view.cached=structuredClone(rows);return true;},
    getCachedOfflineData: async()=>view.cached, enqueueOfflineAction: async()=>{},
    getOfflineQueue: async()=>[{action:'ADD_NPP'}], userErrorMessage: (_error,fallback)=>fallback,
    generateQrToken: ()=> '0123456789', navigator:{onLine:true}, crypto:globalThis.crypto,
    ...overrides
  };
  const source=(await readFile(new URL('../src/modules/distributors/hooks/useNpps.js',import.meta.url),'utf8'))
    .replace(/^import .*;\r?\n/gm,'').replace('export function useNpps','function useNpps');
  const hook=new Function(...Object.keys(dependencies),source+'\nreturn useNpps;')(...Object.values(dependencies));
  return {view,render(){cursor=0;return hook();}};
}
test('NPP concurrent creates retain both rows in visible and durable snapshots',async()=>{
 const f=await fixture(); const h=f.render();
 await Promise.all([h.addNpp({id:'A',name:'A'}),h.addNpp({id:'B',name:'B'})]);
 assert.deepEqual(f.view.cached.map(row=>row.id).sort(),['A','B']);
 assert.deepEqual(f.render().npps,f.view.cached);
});
test('NPP acknowledgement after owner switch cannot publish or cache private rows',async()=>{
 const gate=deferred(), started=deferred();
 const f=await fixture({persistMutation:async()=>{started.resolve();return gate.promise;}});
 const pending=f.render().addNpp({id:'A',name:'Private'});
 await started.promise; f.view.owner='B';gate.resolve({queued:false});
 await assert.rejects(pending,{code:'OFFLINE_OWNER_CHANGED'});
 assert.deepEqual(f.view.cached,[]);assert.deepEqual(f.render().npps,[]);
});
test('NPP cache failure keeps acknowledged row and retry repairs cache before fallback',async()=>{
 const f=await fixture();f.view.failCache=true;
 await f.render().addNpp({id:'A'});
 assert.equal(f.render().npps[0].id,'A');
 assert.match(f.render().error,/Không tạo lại/);
 f.view.failCache=false;await f.render().refetch();
 assert.equal(f.view.cached[0].id,'A');
});
test('NPP stale read cannot resurrect a deleted row',async()=>{
 const gate=deferred(),started=deferred();let first=true;
 const f=await fixture({getOfflineQueue:async()=>[],fetchAllRows:async()=>{if(first){first=false;started.resolve();return gate.promise;}return {data:[],error:null};}});
 const read=f.render().refetch();await started.promise;
 await f.render().deleteNpp('A');gate.resolve({data:[{id:'A'}],error:null});await read;
 assert.deepEqual(f.render().npps,[]);assert.deepEqual(f.view.cached,[]);
});
test('dashboard summary retains legacy category and replacement semantics',()=>{
 const rows=[{productCategory:'Case'},{productCategory:'QL700',actionDirection:'Xuất đổi',replacementCondition:'Mới'},{productCategory:'Máy lắc',actionDirection:'Xuất đổi',replacementCondition:'Cũ'}];
 const stats=getNppTicketStats(rows);
 assert.equal(stats.repairs,1);assert.equal(stats.totalExchanges,2);
 assert.equal(stats.computerTickets[0],rows[0]);assert.equal(stats.printerTickets[0],rows[1]);
});
