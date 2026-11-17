import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthEventScheduler } from '../src/shared/security/authEventScheduler.js';

test('auth listener returns synchronously and releases the lock before API calls', async () => {
  let locked = true;
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const scheduler = createAuthEventScheduler(async () => {
    assert.equal(locked, false, 'Calling APIs under the auth lock would deadlock');
    finish();
  }, error => { throw error; });
  assert.equal(scheduler.listener('SIGNED_IN', { user: { id: 'synthetic' } }), undefined);
  locked = false;
  await finished;
  scheduler.dispose();
});

test('auth events retain ordering and disposed listeners do not run queued work', async () => {
  const events = [];
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const scheduler = createAuthEventScheduler(async event => {
    events.push(event);
    if (events.length === 2) finish();
  }, error => { throw error; });
  scheduler.listener('SIGNED_IN', {});
  scheduler.listener('SIGNED_OUT', null);
  await finished;
  scheduler.listener('IGNORED_AFTER_DISPOSE', null);
  scheduler.dispose();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(events, ['SIGNED_IN', 'SIGNED_OUT']);
});
import { readFile } from 'node:fs/promises';
import { readStoredAuthUser } from '../src/shared/security/authRuntime.js';
import { ROLES, ROLE_LABELS } from '../src/shared/security/rbac.js';
import { createOfflineAccessGrant, offlineAccessDecision, OFFLINE_GRANT_KEY } from '../src/shared/security/offlineAccess.js';

test('stored identity restores without refreshing an expired access token and never returns tokens', async () => {
  const storage = { getItem: async () => JSON.stringify({ user: { id: 'A' }, refresh_token: 'synthetic', expires_at: 1 }) };
  assert.deepEqual(await readStoredAuthUser(storage), { id: 'A' });
  for (const raw of [null, '{}', 'invalid', JSON.stringify({ user: { id: 'A' } })]) {
    assert.equal(await readStoredAuthUser({ getItem: async () => raw }), null);
  }
  assert.equal(await readStoredAuthUser({ getItem: async () => { throw Error('storage unavailable'); } }), null);
});

async function authStartupFixture({ online, validGrant = true, callback = false }) {
  const effects = [], slots = [];
  let cursor = 0, listener;
  const cached = { id: 'A', role: 'technician', managedRegion: 'Miền Bắc' };
  const dependencies = {
    createContext: () => ({}), useContext: () => ({}),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect: fn => effects.push(fn), useCallback: fn => fn,
    ROLES, ROLE_LABELS, isSupabaseConfigured: true, isDevelopmentFallback: false,
    supabase: { auth: {
      getSession: () => new Promise(() => {}),
      onAuthStateChange: fn => { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    } },
    window: { location: { search: callback ? '?recovery=true' : '', hash: '' } },
    navigator: { onLine: online }, URLSearchParams, console,
    readStoredAuthUser: async () => ({ id: 'A' }),
    initializeOfflineStorage: async () => {},
    clearOfflineStorage: async () => {},
    getCacheStrict: async key => key === OFFLINE_GRANT_KEY ? (validGrant ? createOfflineAccessGrant(cached) : null) : cached,
    OFFLINE_GRANT_KEY, offlineAccessDecision, createAuthEventScheduler,
    resolveEmailAuthSession: () => new Promise(() => {}),
  };
  const source = (await readFile(new URL('../src/shared/context/AuthContext.jsx', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export function /g, 'function ')
    .replace(/export default AuthContext;/, '')
    .replace(/return \(\s*<AuthContext.Provider[\s\S]*?<\/AuthContext.Provider>\s*\);/, 'return value;');
  const provider = new Function(...Object.keys(dependencies), source + '\nreturn AuthProvider;')(...Object.values(dependencies));
  const render = () => { cursor = 0; return provider({ children: null }); };
  render();
  const cleanup = effects[0]();
  await new Promise(resolve => setTimeout(resolve, 15));
  return { render, cleanup, listener };
}

test('cached authorized account opens before a stalled auth network request both online and offline', async () => {
  for (const online of [false, true]) {
    const f = await authStartupFixture({ online });
    assert.equal(f.render().user.id, 'A');
    assert.equal(f.render().loading, false);
    f.listener('INITIAL_SESSION', null);
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(f.render().user.id, 'A');
    f.cleanup();
  }
});

test('startup does not open cached data without a grant or during account recovery', async () => {
  for (const options of [{ online: false, validGrant: false }, { online: true, callback: true }]) {
    const f = await authStartupFixture(options);
    assert.equal(f.render().user, null);
    f.cleanup();
  }
});

test('authoritative sign-out closes an account restored from cache', async () => {
  const f = await authStartupFixture({ online: false });
  assert.equal(f.render().user.id, 'A');
  f.listener('SIGNED_OUT', null);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(f.render().user, null);
  f.cleanup();
});
