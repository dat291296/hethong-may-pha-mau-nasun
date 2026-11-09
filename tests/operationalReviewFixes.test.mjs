import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveScannedCode } from '../src/modules/distributors/lib/resolveScannedCode.js';
import { parseScannedPayload } from '../src/modules/distributors/lib/qrPayload.js';
import { findDuplicateImportRows } from '../src/modules/imports/lib/importIdentity.js';
import { getVietnamDate, calendarDaysUntil } from '../src/shared/utils/dateUtils.js';
import { REPAIR_SUMMARY_COLUMNS, REPAIR_DETAIL_COLUMNS, mergeRepairSummary, requireRepairDetails } from '../src/modules/repairs/lib/repairQuery.js';
import { createSecureBackup } from '../src/shared/utils/secureBackup.js';

const serial = '1234567890';
const context = { npps: [{id:'N1',code:'NPP-MB-001'}], systemSets:[{setCode:'SET-MB-001',nppId:'N1',dispenserSerial:serial}], devices:[{serial,setCode:'SET-MB-001'}] };
test('ten-character serial lookup resolves devices without treating explicit QR URLs as serials', () => {
  assert.equal(resolveScannedCode(serial,context).npp.id,'N1');
  assert.equal(resolveScannedCode(serial,context).type,'device');
  const url = 'https://app.example/n/' + serial;
  const parsed = parseScannedPayload(url,'https://app.example');
  assert.ok(resolveScannedCode(parsed,context).error);
  const collision = {...context,npps:[...context.npps,{id:'N2',qrToken:serial}]};
  assert.match(resolveScannedCode(serial,collision).error,/trùng/);
  assert.equal(resolveScannedCode(parsed,collision).npp.id,'N2');
  assert.match(resolveScannedCode(serial,{...context,devices:[...context.devices,...context.devices]}).error,/trùng/);
});
test('duplicate import identities flag all lines, normalize whitespace and preserve distinct names', () => {
  const duplicates=findDuplicateImportRows([[' NPP  A '],['npp a'],['NPP B']],0);
  assert.deepEqual(duplicates.get('npp a'),[2,3]);
  assert.equal(duplicates.has('npp b'),false);
  assert.equal(findDuplicateImportRows([[''],[' ']],0).size,0);
});
test('Excel import carries Natos through the actual NPP row mapping', async () => {
  const source=await readFile(new URL('../src/modules/imports/components/ExcelImportModal.jsx',import.meta.url),'utf8');
  const body=source.match(/const newNpps = rowsToImport\.map\(\(row, i\) => \(\{([\s\S]*?)\}\)\);/)[1];
  const mapRow=new Function('row','i','importBatchId','return ({'+body+'});');
  assert.equal(mapRow({name:'Synthetic NPP',brand:'Natos'},0,{current:'fixture'}).brand,'Natos');
});
test('maintenance uses Vietnam calendar boundaries and validates leap days', () => {
  assert.equal(getVietnamDate(new Date('2026-11-06T17:00:00Z')),'2026-11-07');
  assert.equal(getVietnamDate(new Date('2026-11-06T16:59:59Z')),'2026-11-06');
  assert.equal(calendarDaysUntil('2026-11-06','2026-11-07'),-1);
  assert.equal(calendarDaysUntil('2026-11-07','2026-11-07'),0);
  assert.equal(calendarDaysUntil('2026-12-07','2026-11-07'),30);
  assert.equal(calendarDaysUntil('2028-02-29','2028-02-28'),1);
  assert.equal(calendarDaysUntil('2026-02-29','2026-11-07'),null);
  assert.equal(calendarDaysUntil(null,'2026-11-07'),null);
});
test('repair list omits image payloads and retains cached images only for the same revision', () => {
  const previous={id:'R1',recordVersion:2,photos:['image'],beforePhotos:['before'],afterPhotos:['after'],detailsLoaded:true};
  assert.equal(REPAIR_SUMMARY_COLUMNS.split(',').includes('photos'),false);
  for(const field of ['photos','before_photos','after_photos'])assert.ok(REPAIR_DETAIL_COLUMNS.split(',').includes(field));
  const same=mergeRepairSummary({id:'R1',recordVersion:2},previous);
  assert.deepEqual(requireRepairDetails(same).photos,['image']);
  const changed=mergeRepairSummary({id:'R1',recordVersion:3},previous);
  assert.equal(changed.detailsLoaded,false);
  assert.deepEqual(changed.photos,[]);
  assert.throws(()=>requireRepairDetails(changed));
  assert.throws(()=>requireRepairDetails(undefined));
});
test('backup rejects partial repair snapshots instead of silently dropping photos', async () => {
  await assert.rejects(createSecureBackup({repairTickets:[{id:'R1',detailsLoaded:false}]}),/chi tiết/);
});
