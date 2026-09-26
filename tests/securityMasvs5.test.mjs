import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  IMAGE_FILE_POLICY,
  PERMISSION_PURPOSES,
  validateSelectedFile,
  writeSensitiveClipboard,
} from '../src/security/permissionPolicy.js';

const profileUrl = new URL('../security/masvs/profile.json', import.meta.url);
const permissionsUrl = new URL('../security/masvs/platform-permissions.json', import.meta.url);
const qrUrl = new URL('../src/components/QrScannerModal.jsx', import.meta.url);
const gpsUrl = new URL('../src/utils/gpsHelper.js', import.meta.url);
const routesUrl = new URL('../src/components/FieldRouteMap.jsx', import.meta.url);
const compressorUrl = new URL('../src/utils/imageCompressor.js', import.meta.url);
const backupUrl = new URL('../src/components/DataBackupSyncModal.jsx', import.meta.url);

test('image selection enforces MIME, extension, and size limits', () => {
  const valid = { name: 'evidence.jpg', size: 1024, type: 'image/jpeg' };
  assert.equal(validateSelectedFile(valid, IMAGE_FILE_POLICY), valid);
  assert.throws(
    () => validateSelectedFile({ name: 'payload.svg', size: 1024, type: 'image/svg+xml' }, IMAGE_FILE_POLICY),
    /Định dạng/,
  );
  assert.throws(
    () => validateSelectedFile({ name: 'large.jpg', size: IMAGE_FILE_POLICY.maxBytes + 1, type: 'image/jpeg' }, IMAGE_FILE_POLICY),
    /giới hạn/,
  );
});

test('sensitive clipboard requires secure context and an approved purpose', async () => {
  const originalSecureContext = globalThis.isSecureContext;
  const originalNavigator = globalThis.navigator;
  let copied = '';
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async value => { copied = value; } } },
  });
  try {
    await writeSensitiveClipboard('backup', PERMISSION_PURPOSES.BACKUP_CLIPBOARD);
    assert.equal(copied, 'backup');
    await assert.rejects(() => writeSensitiveClipboard('backup', PERMISSION_PURPOSES.QR_SCAN), /not approved/);
  } finally {
    Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: originalSecureContext });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  }
});

test('camera is started by an explicit action and cleaned up on close', async () => {
  const source = await readFile(qrUrl, 'utf8');
  assert.match(source, /cameraStarted/);
  assert.match(source, /Cho phép mở camera/);
  assert.match(source, /if \(!cameraStarted\) return undefined/);
  assert.match(source, /scannerRef\.current\.clear\(\)/);
  assert.match(source, /rememberLastUsedCamera: false/);
});

test('geolocation is no longer requested on route page mount or silently downgraded to IP', async () => {
  const [gpsSource, routeSource] = await Promise.all([
    readFile(gpsUrl, 'utf8'),
    readFile(routesUrl, 'utf8'),
  ]);
  assert.match(gpsSource, /allowIpFallback = false/);
  assert.match(gpsSource, /requestGeolocationPosition\(purpose/);
  assert.doesNotMatch(routeSource, /User Geolocation on mount/);
  assert.match(routeSource, /PERMISSION_PURPOSES\.FIELD_CHECK_IN/);
});

test('photo processing rejects unsafe fallback and strips metadata by re-encoding', async () => {
  const source = await readFile(compressorUrl, 'utf8');
  assert.match(source, /validateSelectedFile\(file, IMAGE_FILE_POLICY\)/);
  assert.match(source, /canvas\.toDataURL\('image\/jpeg'/);
  assert.match(source, /40_000_000/);
});

test('backup clipboard uses centralized permission policy', async () => {
  const source = await readFile(backupUrl, 'utf8');
  assert.match(source, /writeSensitiveClipboard/);
  assert.doesNotMatch(source, /navigator\.clipboard\.writeText/);
});

test('MASVS-5 permission inventory covers browser and future native runtimes', async () => {
  const [profile, permissions] = await Promise.all([
    readFile(profileUrl, 'utf8').then(JSON.parse),
    readFile(permissionsUrl, 'utf8').then(JSON.parse),
  ]);
  assert.equal(profile.modules.find(item => item.id === 'MASVS-5')?.status, 'implemented');
  assert.equal(permissions.defaultPolicy, 'deny-unless-user-initiated');
  assert.deepEqual(permissions.permissions.map(item => item.name), [
    'camera', 'geolocation', 'files', 'clipboard-write',
  ]);
  assert.ok(permissions.nativeRequirements.android.some(item => item.includes('background location')));
  assert.ok(permissions.nativeRequirements.ios.some(item => item.includes('When In Use')));
});
