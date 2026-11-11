import assert from 'node:assert/strict';
import test from 'node:test';
import { clearRememberedAccount, loadRememberedAccount, saveRememberedAccount } from '../src/shared/security/rememberedAccount.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}

test('remembered account stores only a normalized email and can be cleared', async () => {
  const storage = createMemoryStorage();
  await saveRememberedAccount(' Admin@Example.com ', storage);

  assert.equal(await loadRememberedAccount(storage), 'admin@example.com');
  assert.deepEqual([...storage.values.values()], ['admin@example.com']);

  await clearRememberedAccount(storage);
  assert.equal(await loadRememberedAccount(storage), '');
  assert.equal(storage.values.size, 0);
});

test('remembered account rejects invalid emails and removes malformed stored values', async () => {
  const storage = createMemoryStorage();
  await assert.rejects(() => saveRememberedAccount('not-an-email', storage), { code: 'INVALID_REMEMBERED_EMAIL' });
  await storage.setItem('nasun.remembered-login-email', 'malformed');
  assert.equal(await loadRememberedAccount(storage), '');
  assert.equal(storage.values.size, 0);
});
