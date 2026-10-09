import test from 'node:test';
import assert from 'node:assert/strict';
import { requireReplaySession } from '../src/security/replaySession.js';
import { classifySyncError } from '../src/lib/syncQueue.js';

test('replay requires a matching server user, active profile and trusted session', async () => {
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'A' } } }) },
    rpc: async () => ({ data: { profile_found: true, is_active: true } }) };
  assert.equal(await requireReplaySession(client, 'A', () => 'A', async () => ({ supported: true, state: { valid: true } })), true);
  await assert.rejects(requireReplaySession(client, 'A', () => 'B', async () => ({})), /OFFLINE_OWNER_CHANGED/);
  await assert.rejects(requireReplaySession(client, 'B', () => 'B', async () => ({})), /SESSION_REJECTED/);
  await assert.rejects(requireReplaySession(client, 'A', () => 'A', async () => ({ supported: true, state: { valid: false } })), /SESSION_REJECTED/);
  await assert.rejects(requireReplaySession(client, 'A', () => 'A', async () => ({ supported: false, state: null })), /SESSION_REJECTED/);
  client.rpc = async () => ({ data: { profile_found: true, is_active: false } });
  await assert.rejects(requireReplaySession(client, 'A', () => 'A', async () => ({})), /SESSION_REJECTED/);
});

test('replay stops when the account changes during an outstanding server check', async () => {
  let owner = 'A';
  const client = { auth: { getUser: async () => { owner = 'B'; return { data: { user: { id: 'A' } } }; } },
    rpc: async () => { throw new Error('Must not reach server mutation'); } };
  await assert.rejects(requireReplaySession(client, 'A', () => owner, async () => ({})), /OFFLINE_OWNER_CHANGED/);
  for (const code of ['PT409', 'WRITE_CONFLICT', 'OFFLINE_OWNER_CHANGED', 'SESSION_REJECTED']) {
    assert.equal(classifySyncError({ code }), 'needs_review');
  }
});

test('authentication outages fail closed before any replay', async () => {
  const client = { auth: { getUser: async () => ({ error: new Error('Network unavailable') }) } };
  await assert.rejects(requireReplaySession(client, 'A', () => 'A', async () => ({})), /Network unavailable/);
});
