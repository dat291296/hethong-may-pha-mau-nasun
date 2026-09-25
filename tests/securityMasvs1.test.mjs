import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profileUrl = new URL('../security/masvs/profile.json', import.meta.url);
const threatsUrl = new URL('../security/masvs/threat-register.json', import.meta.url);
const threatDragonUrl = new URL('../security/masvs/threat-dragon.json', import.meta.url);
const bridgeUrl = new URL('../src/platform/mobileSecurityBridge.js', import.meta.url);

test('MASVS profile targets PWA now and native mobile later', async () => {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  assert.equal(profile.currentRuntime, 'pwa');
  assert.deepEqual(profile.futureRuntimes, ['android', 'ios']);
  assert.ok(profile.targetProfiles.includes('MAS-L1'));
  assert.ok(profile.targetProfiles.includes('MAS-P'));
  assert.equal(profile.mobileMigrationRules.businessLogicRemainsInReact, true);
  assert.equal(profile.mobileMigrationRules.platformAccessUsesBridge, true);
  assert.equal(profile.mobileMigrationRules.backendAuthorizationRemainsServerSide, true);
  assert.equal(profile.mobileMigrationRules.nativeSecretsUsePlatformKeystore, true);
});

test('MASVS threat register covers security and privacy threats', async () => {
  const register = JSON.parse(await readFile(threatsUrl, 'utf8'));
  assert.ok(register.methodologies.includes('STRIDE'));
  assert.ok(register.methodologies.includes('LINDDUN'));
  assert.ok(register.threats.some(threat => threat.severity === 'critical'));
  assert.ok(register.threats.some(threat => threat.category === 'Unawareness'));
  assert.ok(register.threats.every(threat => /^MASVS-\d+$/.test(threat.nextModule)));
});

test('Threat Dragon model is version-controlled and importable', async () => {
  const model = JSON.parse(await readFile(threatDragonUrl, 'utf8'));
  assert.match(model.version, /^2\./);
  assert.ok(model.summary.title);
  assert.ok(Array.isArray(model.detail.diagrams));
  assert.equal(model.detail.diagrams[0].diagramType, 'STRIDE');
  assert.ok(Array.isArray(model.detail.diagrams[0].cells));
});

test('mobile security bridge fails closed when native controls are unavailable', async () => {
  const source = await readFile(bridgeUrl, 'utf8');
  assert.match(source, /NATIVE_SECURITY_BRIDGE_UNAVAILABLE/);
  assert.match(source, /getOrCreateEncryptionKey/);
  assert.match(source, /deleteEncryptionKey/);
  assert.match(source, /setScreenProtection/);
  assert.match(source, /getIntegrityToken/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
