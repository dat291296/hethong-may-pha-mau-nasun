import test from 'node:test';
import assert from 'node:assert/strict';
import {dataChecksum,sealDataSnapshot,verifyDataSnapshot,requireUniqueDataRows,canonicalData} from '../src/shared/data-access/dataIntegrity.js';
test('snapshot checksum is stable across property order and detects tampering',async()=>{
 assert.equal(await dataChecksum({b:2,a:1}),await dataChecksum({a:1,b:2}));
 const value=await sealDataSnapshot({owner:'A',rows:[{id:'S1',notes:'Giữ dữ liệu cũ'}]});assert.equal(await verifyDataSnapshot(value),true);
 value.rows[0].notes='changed';assert.equal(await verifyDataSnapshot(value),false);assert.equal(await verifyDataSnapshot({owner:'A'}),false);
});
test('data identities, unsupported JSON and prototype keys fail before persistence',()=>{
 for(const rows of [[{id:'A'},{id:'A'}],[{id:''}],[{}]])assert.throws(()=>requireUniqueDataRows(rows,'id'));
 assert.equal(requireUniqueDataRows([{id:'A'},{id:'B'}],'id'),true);
 for(const value of [{n:NaN},{date:new Date()},JSON.parse('{"__proto__":{"bad":true}}'),{value:undefined}])assert.throws(()=>canonicalData(value));
 const cycle={};cycle.self=cycle;assert.throws(()=>canonicalData(cycle));
});
