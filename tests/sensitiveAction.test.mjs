import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeSensitiveAction, reauthenticateSensitiveAction } from '../src/security/sensitiveAction.js';

test('sensitive actions fail closed for missing server control and rejected authentication', async () => {
  await assert.rejects(authorizeSensitiveAction({ rpc: async () => ({ error: { code: 'PGRST202' } }) }));
  await assert.rejects(authorizeSensitiveAction({ rpc: async () => ({ data: false }) }));
  await assert.rejects(authorizeSensitiveAction({ rpc: async () => ({ error: { message: 'REAUTHENTICATION_REQUIRED' } }) }), { code: 'REAUTHENTICATION_REQUIRED' });
  await authorizeSensitiveAction({ rpc: async () => ({ data: true }) });
});
test('reauthentication binds the current identity and requires server confirmation', async () => {
  let calls = 0;
  const client = { auth: {
    getUser: async () => ({ data: { user: { id: 'synthetic-user', email: 'synthetic@example.invalid' } } }),
    signInWithPassword: async () => ({ data: { user: { id: 'different-user' } } }),
    signOut: async () => {},
  }, rpc: async () => { calls++; return { data: true }; } };
  await assert.rejects(reauthenticateSensitiveAction(client, 'synthetic-password'));
  assert.equal(calls, 0);
  client.auth.signInWithPassword = async () => ({ data: { user: { id: 'synthetic-user' } } });
  await reauthenticateSensitiveAction(client, 'synthetic-password');
  assert.equal(calls, 1);
});
