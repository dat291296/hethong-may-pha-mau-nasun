import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBrowserPasswordCredential, saveBrowserPasswordCredential } from '../src/shared/security/browserCredentials.js';

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

test('remembered browser credentials can refill login fields without submitting the form', async () => {
  let options;
  const credential = await loadBrowserPasswordCredential({
    credentials: {
      async get(value) {
        options = value;
        return { id: 'Admin@Example.com', password: 'Secret123!' };
      },
    },
  });

  assert.deepEqual(options, { password: true, mediation: 'optional' });
  assert.deepEqual(credential, { email: 'admin@example.com', password: 'Secret123!' });
});

test('browser credential retrieval fails closed when the browser has no saved password', async () => {
  assert.equal(await loadBrowserPasswordCredential({ credentials: { async get() { return null; } } }), null);
  assert.equal(await loadBrowserPasswordCredential({ credentials: {} }), null);
});
