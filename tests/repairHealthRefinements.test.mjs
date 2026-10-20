import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCalendarDate,normalizeDateFields,normalizeOptionalTimestamp} from '../src/utils/dateUtils.js';
import {saveSystemSetEdit} from '../src/lib/systemSetEdit.js';
import {buildSystemHealth} from '../src/lib/systemHealth.js';
import {repairListPage,repairStringList,hasMalformedRepairLists,uniqueAssignedMachine} from '../src/lib/repairList.js';
test('calendar dates preserve valid dates, convert Vietnamese input and reject impossible dates',()=>{
 for(const value of ['', '  ',null,undefined])assert.equal(normalizeCalendarDate(value),null);
 assert.equal(normalizeCalendarDate('20/10/2026'),'2026-10-20');assert.equal(normalizeCalendarDate('2024-02-29'),'2024-02-29');
 for(const value of ['2026-02-29','2026-02-30','2026-13-01','wrong'])assert.throws(()=>normalizeCalendarDate(value),{code:'INVALID_DATE'});
 assert.throws(()=>normalizeCalendarDate('','Ngày tiếp nhận',true),{code:'INVALID_DATE'});
 assert.equal(normalizeOptionalTimestamp('  '),null);assert.equal(normalizeOptionalTimestamp('2026-10-20T08:15:00+07:00'),'2026-10-20T01:15:00.000Z');
 assert.throws(()=>normalizeOptionalTimestamp('2026-02-30T08:15:00Z'),{code:'INVALID_DATE'});
 assert.deepEqual(normalizeDateFields({salesperson:'Synthetic'},{install_date:'Install'}),{salesperson:'Synthetic'});
});
test('editing machine owner with blank optional dates sends SQL null, keeping identity and revision',async()=>{
 let payload;const client={from:()=>({update(value){payload=value;return this;},eq(){return this;},select(){return {data:[{set_code:'S1'}],error:null};}})};
 await saveSystemSetEdit(fn=>fn(client),'S1',{salesperson:'Synthetic owner',install_date:'',last_maintenance_date:' ',next_maintenance_due:null},'2026-10-20T01:00:00Z');
 assert.deepEqual(payload,{salesperson:'Synthetic owner',install_date:null,last_maintenance_date:null,next_maintenance_due:null});
 await assert.rejects(saveSystemSetEdit(()=>{throw Error('must not write');},'S1',{next_maintenance_due:'2026-02-30'},'2026-10-20T01:00:00Z'),{code:'INVALID_DATE'});
});
const machine={setCode:'S1',nppId:'N1',status:'DA_LAP_DAT',dispenserId:'D1'};
const device={id:'D1',setCode:'S1',isAssigned:true,serial:'DUP'};
const ticket=(id,date='2026-10-01',other={})=>({id,date,assetCode:'D1',nppId:'N1',productCategory:'Máy chiết',...other});
const health=extra=>buildSystemHealth({machines:[machine],devices:{dispenser:[device]},tickets:[ticket('A'),ticket('B')],...extra});
test('current fleet rate counts faulty devices once while incident density may exceed 100',()=>{
 const stats=health().operatingStats.find(row=>row.id==='dispenser');
 assert.equal(stats.operating,1);assert.equal(stats.faulty,1);assert.equal(stats.incidents,2);assert.equal(stats.rate,100);assert.equal(stats.incidentsPer100,200);
 assert.equal(health().currentFailureRate,100);
});
test('warehouse, withdrawn, maintenance, ambiguous links and legacy serial guesses never inflate fleet rate',()=>{
 for(const status of ['TRONG_KHO','DA_THU_HOI','BAO_THUONG_BAO_TRI'])assert.equal(health({machines:[{...machine,status}]}).operatingTotal,0);
 const broken=health({devices:{dispenser:[{...device,setCode:'OTHER'}]}});assert.equal(broken.currentFailureRate,null);assert.equal(broken.operatingStats.find(row=>row.id==='dispenser').excluded,1);
 assert.equal(health({machines:[machine,{...machine,setCode:'S2'}]}).operatingTotal,0);
 const missing=health({tickets:[ticket('LEGACY','2026-10-01',{assetCode:'',serialNumber:'DUP'})]});assert.equal(missing.faultyTotal,0);assert.equal(missing.unlinked.length,1);
});
test('yearly trend merges months and filters numerator independently of current fleet snapshot',()=>{
 const result=health({tickets:[ticket('A','2025-01-01'),ticket('B','2026-01-01'),ticket('C','2026-10-01')],from:'2026-01-01'});
 assert.deepEqual(result.trend.map(row=>[row.id,row.total]),[['2026',2]]);assert.equal(result.operatingTotal,1);assert.equal(result.faultyTotal,1);
 const empty=health({from:'2027-01-01'});assert.equal(empty.currentFailureRate,0);assert.equal(empty.operatingTotal,1);
 assert.equal(health({nppId:'OTHER'}).currentFailureRate,null);
});
test('repair pagination bounds rendered rows without changing or losing the full collection',()=>{
 const rows=Array.from({length:2503},(_,id)=>({id}));const first=repairListPage(rows,1,20);const last=repairListPage(rows,999,20);
 assert.equal(first.rows.length,20);assert.equal(first.rows[0].id,0);assert.equal(last.page,126);assert.equal(last.rows.length,3);assert.equal(rows.length,2503);
 assert.equal(repairListPage(rows,'bad',5000).size,20);assert.equal(repairListPage(rows,-9,10).page,1);assert.equal(repairListPage([],99).page,1);
});
test('malformed legacy image/material lists cannot crash the reader or be silently resaved',()=>{
 assert.deepEqual(repairStringList('legacy-invalid'),[]);assert.deepEqual(repairStringList(['image',null,{}]),['image']);
 assert.equal(hasMalformedRepairLists({photos:'legacy-invalid'}),true);assert.equal(hasMalformedRepairLists({materialsUsed:[{}]}),true);
 assert.equal(hasMalformedRepairLists({photos:[],materialsUsed:['Synthetic part']}),false);
});

test('repair autofill never guesses which machine belongs to an NPP with multiple active sets',()=>{
 assert.equal(uniqueAssignedMachine([machine], 'N1'),machine);
 assert.equal(uniqueAssignedMachine([machine,{...machine,setCode:'S2'}],'N1'),null);
 assert.equal(uniqueAssignedMachine([{...machine,status:'DA_THU_HOI'}],'N1'),null);
 assert.equal(uniqueAssignedMachine([machine],'OTHER'),null);
});
