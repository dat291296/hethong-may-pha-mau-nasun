import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseScannedPayload, isValidQrToken, buildNppQrPayload, generateQrToken } from '../src/modules/distributors/lib/qrPayload.js';
import { resolveScannedCode } from '../src/modules/distributors/lib/resolveScannedCode.js';
import { splitIntoBatches, paginateLabels, countLabelSheets, fitLabelName, validatePrintableNpp } from '../src/modules/distributors/lib/qrPrint.js';
import { hasPermission, ROLES } from '../src/shared/security/rbac.js';
import { requireOfflineReplayPermission } from '../src/shared/security/offlineReplayPolicy.js';

const npp = { id: '1', code: 'NPP-MB-001', name: 'NPP Mẫu', region: 'Miền Bắc', qrToken: 'K7M2QX9P4D' };
const set = { setCode: 'SET-MB-001', nppId: '1', dispenserSerial: 'DISP-001' };

test('QR token shape and host validation', () => {
  assert.equal(isValidQrToken(generateQrToken()), true);
  assert.equal(isValidQrToken('K7M2QX9P4D'), true);
  assert.equal(isValidQrToken('K7M2QX9P4'), false);
  for (const character of ['I', 'L', 'O', 'U']) assert.equal(isValidQrToken(`K7M2QX9P4${character}`), false);
  const appUrl = 'https://kythuat.nasun.workers.dev';
  assert.deepEqual(parseScannedPayload(`${appUrl}/n/K7M2QX9P4D`, appUrl), { kind: 'token', value: 'K7M2QX9P4D' });
  assert.throws(() => parseScannedPayload('https://evil.example/n/K7M2QX9P4D', appUrl));
  assert.throws(() => parseScannedPayload(`${appUrl}/n/K7M2QX9P4D?x=1`, appUrl));
  assert.throws(() => parseScannedPayload(''));
  assert.throws(() => parseScannedPayload('X'.repeat(200)));
  assert.throws(() => parseScannedPayload('NPP-MB-00\u00011'));
  assert.equal(buildNppQrPayload('K7M2QX9P4D', appUrl), 'https://kythuat.nasun.workers.dev/n/K7M2QX9P4D');
});

test('NPP, set and device scans resolve through local records', () => {
  const context = { npps: [npp], systemSets: [set], devices: [{ serial: 'DISP-001', setCode: 'SET-MB-001', isAssigned: true }] };
  assert.equal(resolveScannedCode('K7M2QX9P4D', context).npp.id, '1');
  assert.equal(resolveScannedCode('NPP-MB-001', context).type, 'npp');
  assert.equal(resolveScannedCode('SET-MB-001', context).highlightedSetCode, 'SET-MB-001');
  assert.equal(resolveScannedCode('DISP-001', context).device.serial, 'DISP-001');
  assert.match(resolveScannedCode('UNKNOWN-001', context).error, /Không tìm thấy/);
  assert.match(resolveScannedCode('DISP-001', { ...context, devices: [...context.devices, { serial: 'DISP-001' }] }).error, /trùng/);
  assert.match(resolveScannedCode('DISP-002', { ...context, devices: [{ serial: 'DISP-002', isAssigned: false }] }).error, /trong kho/);
  assert.ok(resolveScannedCode('X'.repeat(200), context).error);
});

test('A8 print planning handles pages, skip slots, batches and names', () => {
  assert.equal(paginateLabels(Array.from({ length: 11 }, (_, i) => i)).length, 2);
  assert.equal(paginateLabels([1, 2], { skip: 3 })[0].length, 5);
  assert.equal(countLabelSheets(11, 1, 0), 2);
  assert.equal(countLabelSheets(2, 2, 3), 1);
  assert.deepEqual(splitIntoBatches(Array.from({ length: 101 }, (_, i) => i)).map(batch => batch.length), [50, 50, 1]);
  assert.ok(fitLabelName('Tên NPP có dấu tiếng Việt').lines[0].includes('tiếng Việt'));
  assert.ok(fitLabelName('N'.repeat(80)).lines.length <= 2);
  assert.equal(validatePrintableNpp({ ...npp, qrToken: '' }), 'Chưa có mã QR được cấp');
});

test('QR permissions matrix protects scanning and printing', () => {
  const expected = {
    admin: [true, true], manager: [true, true], technician: [true, false], qc: [false, false], viewer: [false, false],
  };
  for (const role of Object.values(ROLES)) {
    assert.deepEqual([hasPermission(role, 'qr:scan'), hasPermission(role, 'qr:print')], expected[role]);
    const scope = { id: `user-${role}`, role, managedRegion: 'Miền Bắc' };
    const scan = { action: 'ADD_QR_AUDIT', ownerId: scope.id, payload: { p_action: 'scan' } };
    const print = { action: 'ADD_QR_AUDIT', ownerId: scope.id, payload: { p_action: 'print' } };
    if (expected[role][0]) assert.doesNotThrow(() => requireOfflineReplayPermission(scope, scan));
    else assert.throws(() => requireOfflineReplayPermission(scope, scan), { code: '42501' });
    if (expected[role][1]) assert.doesNotThrow(() => requireOfflineReplayPermission(scope, print));
    else assert.throws(() => requireOfflineReplayPermission(scope, print), { code: '42501' });
  }
});

test('QR token RPCs stay authenticated and do not expose a public NPP card', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261105010000_npp_qr_tokens_authenticated.sql', import.meta.url), 'utf8');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_qr_audit[\s\S]*FROM PUBLIC, anon/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.record_qr_audit[\s\S]*TO authenticated/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reissue_distributor_qr_token[\s\S]*FROM PUBLIC, anon/i);
  assert.doesNotMatch(sql, /public_npp_card|GRANT\s+SELECT\s+ON\s+public\.distributors\s+TO\s+anon/i);
  assert.match(sql, /actor_region IS DISTINCT FROM npp_row\.region/);
});
