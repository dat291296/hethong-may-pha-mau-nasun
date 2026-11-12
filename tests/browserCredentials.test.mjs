import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveBrowserPasswordCredential } from '../src/shared/security/browserCredentials.js';

class FakePasswordCredential {
  constructor(value) { Object.assign(this, value); }
}

test('password is handed to the browser credential store only when the caller requests it', async () => {
  const saved = [];
  const credentials = { async store(value) { saved.push(value); } };
  const stored = await saveBrowserPasswordCredential(' Admin@Example.com ', 'Secret123!', {
    credentials,
    PasswordCredentialType: FakePasswordCredential,
  });

  assert.equal(stored, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'admin@example.com');
  assert.equal(saved[0].password, 'Secret123!');
});

test('unsupported password stores and malformed credentials fail closed', async () => {
  assert.equal(await saveBrowserPasswordCredential('admin@example.com', 'secret', { credentials: {}, PasswordCredentialType: FakePasswordCredential }), false);
  assert.equal(await saveBrowserPasswordCredential('bad-email', 'secret', { credentials: { store() {} }, PasswordCredentialType: FakePasswordCredential }), false);
  assert.equal(await saveBrowserPasswordCredential('admin@example.com', '', { credentials: { store() {} }, PasswordCredentialType: FakePasswordCredential }), false);
});
