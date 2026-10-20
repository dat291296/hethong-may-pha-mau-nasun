import test from 'node:test';
import assert from 'node:assert/strict';
import {EQUIPMENT_SLOTS,resolveEquipmentSlot,replacementCandidates,equipmentFields,saveEquipmentReplacement,readReplacementEvents} from '../src/lib/equipmentReplacement.js';
import {buildSystemHealth} from '../src/lib/systemHealth.js';
const machine={setCode:'S1',dispenserId:'D1',nppId:'N1',status:'DA_LAP_DAT'};
const old={id:'D1',setCode:'S1',isAssigned:true,status:'Đang chạy tốt',serial:'DUPLICATE'};
const free={id:'D2',setCode:null,isAssigned:false,status:'Đang chạy tốt',serial:'DUPLICATE'};
test('four permanent slots distinguish missing, valid and conflicting links',()=>{
 assert.equal(EQUIPMENT_SLOTS.length,4);
 assert.equal(resolveEquipmentSlot(machine,'dispenser',[old,free]).state,'linked');
 assert.equal(resolveEquipmentSlot(machine,'computer',[]).state,'empty');
 assert.equal(resolveEquipmentSlot(machine,'dispenser',[free]).state,'conflict');
 assert.equal(resolveEquipmentSlot(machine,'dispenser',[old,{...free,setCode:'S1'}]).state,'conflict');
});
test('warehouse selection excludes assigned, broken and inconsistent devices; reconciliation preserves existing link',()=>{
 const rows=[old,free,{...free,id:'D3',status:'Hỏng nặng'},{...free,id:'D4',isAssigned:true},{...free,id:'D5',setCode:'S2'}];
 assert.deepEqual(replacementCandidates(rows,machine).map(d=>d.id),['D2']);
 assert.deepEqual(replacementCandidates(rows,machine,'relink').map(d=>d.id),['D1']);
});
test('replacement computer fields do not inherit old software',()=>{
 const fields=equipmentFields('computer',{id:'PC2',serial:'NEW',type:'Case'});
 assert.equal(fields.computerId,'PC2');assert.equal(fields.tintingSoftware,'');assert.equal(fields.softwareVersion,'');
});
test('RPC acknowledgements must match machine and device; failures retain actionable codes',async()=>{
 const payload={p_set_code:'S1',p_device_id:'D2'};
 await assert.rejects(saveEquipmentReplacement(async()=>({data:{ok:true,setCode:'S1',newDeviceId:'WRONG'}}),payload),{code:'PERSISTENCE_DENIED'});
 await assert.rejects(saveEquipmentReplacement(async()=>({error:{code:'PGRST202'}}),payload),{code:'SCHEMA_MIGRATION_REQUIRED'});
 await assert.rejects(saveEquipmentReplacement(async()=>({error:{code:'PT409'}}),payload),{code:'PT409'});
 const response={ok:true,setCode:'S1',newDeviceId:'D2'};
 assert.deepEqual(await saveEquipmentReplacement(async()=>({data:response}),payload),response);
});
const ticket=(id,fields={})=>({id,date:'2026-10-15',nppId:'N1',productCategory:'Máy chiết',assetCode:'D1',machineModel:'A2',processingStatus:'Chưa xử lý',actionDirection:'Sửa chữa',...fields});
const build=fields=>buildSystemHealth({machines:[machine],devices:{dispenser:[old,free]},npps:[{id:'N1',name:'Synthetic A'}],...fields});
test('duplicate serials never infer device identity; historical immutable identity remains visible',()=>{
 const health=build({tickets:[ticket('A'),ticket('B',{assetCode:'',serialNumber:'DUPLICATE'}),ticket('C',{assetCode:'RETIRED'})],events:[{category:'dispenser',old_device_id:'RETIRED',old_snapshot:{model:'A1',serial:'OLD'}}]});
 assert.equal(health.total,3);assert.equal(health.unlinked.length,1);assert.equal(health.equipment.length,2);
 assert.equal(health.failureRate,null);assert.equal(health.categories[0].share,100);
 assert.equal(health.states.find(s=>s.name==='Cần bảo trì / có phiếu mở').total,1);
});
test('repeat incidents require earlier confirmed completion on same device; date filters are strict',()=>{
 const tickets=[ticket('OLD',{date:'2026-09-01',completedAt:'2026-10-01T00:00:00Z',processingStatus:'Đã xử lý'}),ticket('NEW'),ticket('OTHER',{assetCode:'D2'}),ticket('INVALID',{date:'2026-02-30'}),ticket('MISSING',{date:''})];
 const health=build({tickets,from:'2026-10-01',to:'2026-10-31'});
 assert.equal(health.total,2);assert.equal(health.repeat30,1);assert.equal(health.repeat90,1);assert.equal(health.unknownDates,2);
 assert.equal(build({tickets:tickets.map(t=>({...t,completedAt:undefined})),from:'2026-10-01'}).repeat90,0);
});
test('NPP/category filters and exchange totals use selected ticket denominator',()=>{
 const tickets=[ticket('A',{actionDirection:'Xuất đổi'}),ticket('B',{nppId:'N2'}),ticket('C',{productCategory:'Máy lắc',assetCode:'M1'})];
 const health=build({tickets,nppId:'N1',category:'dispenser'});
 assert.equal(health.total,1);assert.equal(health.distributors[0].exchanges,1);assert.equal(health.distributors[0].repairs,0);
 assert.equal(health.categories[0].share,100);
});

test('history reader returns arrays and refuses incomplete/failed responses before caching',async()=>{
 const rows=[{operation_id:'A'},{operation_id:'B'}];
 assert.deepEqual(await readReplacementEvents(async()=>({data:rows,count:2,error:null})),rows);
 await assert.rejects(readReplacementEvents(async()=>({data:rows,count:3,error:null})),{code:'INCOMPLETE_QUERY'});
 await assert.rejects(readReplacementEvents(async()=>({error:{code:'42501'}})),{code:'42501'});
});
