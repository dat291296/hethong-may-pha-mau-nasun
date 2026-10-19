import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDeviceType} from '../src/lib/deviceType.js';
import {dataCompletenessAlerts,missingDeviceFields,missingNppFields} from '../src/lib/dataCompleteness.js';
test('mixer types preserve mechanical values rather than computer enum values',()=>{
 for(const type of ['Lắc xoay khép kín','Lắc rung đứng',''])assert.equal(normalizeDeviceType('mixer',type),type);
 assert.equal(normalizeDeviceType('computer','All In One'),'AIO');assert.equal(normalizeDeviceType('computer','Case'),'Case');
});
test('regional technicians only see missing data from their own region and warehouse stays with administrators',()=>{
 const npps=[{id:'N',name:'North',region:'Miền Bắc'},{id:'S',name:'South',region:'Miền Nam'}];
 const systemSets=[{setCode:'SET-N',region:'Miền Bắc',nppId:'N'},{setCode:'SET-S',region:'Miền Nam',nppId:'S'}];
 const devices={mixer:[{id:'MN',setCode:'SET-N'},{id:'MS',setCode:'SET-S'},{id:'WAREHOUSE'}]};
 const north=dataCompletenessAlerts({npps,systemSets,devices,user:{role:'technician',managedRegion:'Miền Bắc'}});
 assert.ok(north.some(item=>item.id==='mixer:MN'));assert.ok(!north.some(item=>['mixer:MS','mixer:WAREHOUSE','npp:S'].includes(item.id)));
 const admin=dataCompletenessAlerts({npps,systemSets,devices,user:{role:'admin'}});assert.ok(admin.some(item=>item.id==='mixer:WAREHOUSE'));
});
test('data warnings identify individual missing fields and respect existing machine computer serials',()=>{
 assert.ok(missingNppFields({name:'N',region:'Miền Bắc'}).includes('Địa chỉ'));
 assert.deepEqual(missingDeviceFields({type:'Case',status:'Đang chạy tốt',os:'Windows',specs:'i5',network:'LAN'},'computer',{computerSerial:'PC-1'}),[]);
 assert.ok(missingDeviceFields({model:'M',serial:'—',status:'Mới'},'mixer').includes('Số seri'));
});
