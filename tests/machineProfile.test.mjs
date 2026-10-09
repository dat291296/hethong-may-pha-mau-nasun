import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMachineProfile} from '../src/lib/machineProfile.js';
import {resolveMachineCode} from '../src/lib/machineWorkspace.js';
import {recordOperationalError,getOperationalDiagnostics} from '../src/lib/operationalDiagnostics.js';
const machine={id:'a',setCode:'A',nppId:'n',dispenserSerial:'S',dispenserId:'d'};
test('machine code lookup rejects device serials and ambiguous codes',()=>{
 assert.equal(resolveMachineCode([machine],' a '),machine);
 assert.equal(resolveMachineCode([machine],'S'),null);
 assert.equal(resolveMachineCode([machine,{...machine,id:'b'}],'A'),null);
 assert.equal(resolveMachineCode([machine],''),null);
 assert.equal(resolveMachineCode([machine],'A'.repeat(161)),null);
});
test('explicit set identity wins over matching legacy serial and NPP',()=>{
 const result=resolveMachineProfile(machine,[machine],{dispenser:[{id:'d',serial:'S'}]},[],[{id:'r',setCode:'OTHER',serialNumber:'S',nppId:'n'}],[]);
 assert.equal(result.history.length,0);
 assert.equal(result.devices[0].device.id,'d');
});
test('ambiguous serial history is excluded and missing NPP never matches',()=>{
 const tickets=[{id:'r',serialNumber:'S',nppId:'n'}];
 assert.equal(resolveMachineProfile(machine,[machine,{...machine,id:'b',setCode:'B'}],{},[],tickets,[]).history.length,0);
 assert.equal(resolveMachineProfile({...machine,nppId:null},[machine],{},[],[{id:'r',serialNumber:'S'}],[]).history.length,0);
});
test('history is chronological and empty state counts repair and audit entries together',()=>{
 const result=resolveMachineProfile(machine,[machine],{},[],[{id:'r',serialNumber:'S',nppId:'n',date:'2026-10-01'}],[{id:'l',setCode:'A',timestamp:'2026-10-02'}]);
 assert.deepEqual(result.history.map(item=>item.key),['audit:l','repair:r']);
});
test('operational diagnostics reject secrets, customer fields and arbitrary error text',()=>{
 recordOperationalError('runtime',{message:'CUSTOMER SECRET',stack:'TOKEN',email:'PRIVATE',code:'UNSAFE_TOKEN'});
 assert.doesNotMatch(JSON.stringify(getOperationalDiagnostics()),/CUSTOMER|SECRET|TOKEN|PRIVATE/);
 for(let i=0;i<60;i++)recordOperationalError('sync');
 assert.equal(getOperationalDiagnostics().recent.length,50);
});
