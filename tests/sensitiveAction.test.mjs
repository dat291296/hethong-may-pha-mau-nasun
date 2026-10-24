import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeSensitiveAction, reauthenticateSensitiveAction } from '../src/security/sensitiveAction.js';

test('sensitive actions fail closed for missing server control and rejected authentication', async () => {
  for (const code of ['PGRST202', '42883']) {
    await assert.rejects(authorizeSensitiveAction({ rpc: async () => ({ error: { code } }) }), { code: 'SCHEMA_MIGRATION_REQUIRED' });
  }
  await assert.rejects(authorizeSensitiveAction({ rpc: async () => ({ error: { code: '42501', message: 'ADMIN_REQUIRED' } }) }), { code: 'ADMIN_REQUIRED' });
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
  await assert.rejects(reauthenticateSensitiveAction(client, 'synthetic-password'));
  await assert.rejects(reauthenticateSensitiveAction(client, 'synthetic-password', async()=>({supported:true,state:{valid:false}})));
  await reauthenticateSensitiveAction(client, 'synthetic-password', async()=>({supported:true,state:{valid:true}}));
  assert.equal(calls, 1);
});
