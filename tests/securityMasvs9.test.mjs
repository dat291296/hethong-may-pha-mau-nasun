import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profileUrl = new URL('../security/masvs/profile.json', import.meta.url);
const matrixUrl = new URL('../security/masvs/verification-matrix.json', import.meta.url);
const privacyUrl = new URL('../security/masvs/privacy-inventory.json', import.meta.url);
const loginUrl = new URL('../src/components/LoginModal.jsx', import.meta.url);

test('verification matrix covers every implemented MASVS module with tests and evidence', async () => {
  const [profile, matrix] = await Promise.all([
    readFile(profileUrl, 'utf8').then(JSON.parse), readFile(matrixUrl, 'utf8').then(JSON.parse),
  ]);
  assert.ok(profile.modules.every(module => module.status === 'implemented'));
  assert.deepEqual(matrix.modules.map(module => module.id), profile.modules.map(module => module.id));
  assert.ok(matrix.modules.every(module => module.tests.length > 0 && module.evidence.length > 0));
  assert.ok(matrix.nativeReleaseChecks.length >= 4);
});

test('privacy inventory documents purpose, storage, retention, sharing, and rights', async () => {
  const privacy = JSON.parse(await readFile(privacyUrl, 'utf8'));
  assert.ok(privacy.records.length >= 5);
  assert.ok(privacy.records.every(record => record.purpose && record.storage && record.retention && Array.isArray(record.sharing)));
  assert.ok(privacy.rightsProcess.length >= 3);
  assert.ok(privacy.prohibitedUses.includes('background location tracking'));
});

test('user-facing privacy notice discloses IP providers and retention', async () => {
  const source = await readFile(loginUrl, 'utf8');
  assert.match(source, /BigDataCloud hoặc ipapi/);
  assert.match(source, /thời gian hoạt động của tài khoản hoặc hồ sơ nghiệp vụ/);
  assert.match(source, /Camera không ghi hình/);
});

test('MASVS-9 is implemented and MFA remains optional', async () => {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  assert.equal(profile.modules.find(item => item.id === 'MASVS-9')?.status, 'implemented');
  assert.equal(profile.mobileMigrationRules.mfaMandatory, false);
});
