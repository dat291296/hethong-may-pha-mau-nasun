import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

const url = process.env.RLS_TEST_URL;
if (!url || new URL(url).origin !== 'https://kenznmtdfuexmfrtzypb.supabase.co'
  || new URL(process.env.RLS_PRODUCTION_URL).origin === new URL(url).origin) throw new Error('ISOLATED_STAGING_REQUIRED');
const engine = process.env.UI_TEST_ENGINE || 'chrome';
if (!['chrome', 'webkit'].includes(engine)) throw new Error('INVALID_TEST_ENGINE');
const service = createClient(url, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, options = {}) => fetch(input, { ...options, signal: AbortSignal.timeout(30000) }) },
});
const fixtures = [];
const directory = 'output/playwright/reconnect';
const browserSession = `nasun-jwt-${engine}`;
const origin = 'http://127.0.0.1:5194';
let server;
function check(result) { if (result.error) throw new Error('STAGING_FIXTURE_REQUEST_FAILED'); return result.data; }

async function cli(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', '--package', '@playwright/cli@0.1.22', 'playwright-cli', `-s=${browserSession}`, ...args], {
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !/SUPABASE|RLS_TEST_|PASSWORD|TOKEN|PASSPHRASE/.test(name))),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('BROWSER_STEP_FAILED: TIMEOUT')); }, args[0] === 'close' ? 10000 : 150000);
    child.stdout.on('data', chunk => { if (output.length < 100000) output += chunk; });
    child.stderr.on('data', () => {});
    child.on('error', () => reject(new Error('BROWSER_CLI_UNAVAILABLE')));
    child.on('exit', code => { clearTimeout(timeout); code === 0 && !output.includes('### Error') ? resolve() : reject(new Error('BROWSER_STEP_FAILED: ' + args[0])); });
  });
}

try {
  for (const label of ['A', 'B']) {
    const email = `nasun-ui-${randomUUID()}@example.invalid`;
    const password = randomBytes(32).toString('base64url');
    const data = check(await service.auth.admin.createUser({ email, password, email_confirm: true,
      app_metadata: { nasun_rls_fixture: true, fixture_role: 'manager', fixture_region: 'Miền Bắc' } }));
    fixtures.push({ id: data.user.id, email, password, label });
    check(await service.from('profiles').delete().eq('id', data.user.id));
    check(await service.from('profiles').insert({ id: data.user.id, full_name: 'Synthetic browser account', role: 'manager', managed_region: 'Miền Bắc', is_active: true, mfa_required: false }));
  }
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/index.html`, '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staging reconnect verification</title><body><div id="root"></div><script type="module" src="/output/playwright/reconnect/probe.jsx"></script></body></html>');
  await writeFile(`${directory}/probe.jsx`, `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider,useAuth} from '/src/context/AuthContext.jsx';
import {supabase} from '/src/lib/supabase.js';
import * as db from '/src/lib/offlineDb.js';
import {syncOfflineQueue} from '/src/lib/offlineSync.js';
import {validateTrustedDeviceSession} from '/src/security/trustedDevice.js';
async function control(action,account='A'){const r=await fetch('/__nasun_ui/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account})});if(!r.ok)throw Error('CONTROL_FAILED');return r.json();}
window.uiProbe={
 async ready(){try{const result=await validateTrustedDeviceSession();return result.supported&&result.state?.valid===true;}catch{return false;}},
 async ownerIs(account){const identity=await control('identity',account);return db.getOfflineOwner()===identity.id&&document.querySelector('main')?.dataset.owner===identity.id;},
 async login(account='A'){const session=await control('session',account);const result=await supabase.auth.setSession(session);if(result.error)throw Error('LOGIN_FAILED');},
 async queue(){if(!await db.addToQueue({id:'UI-SYNTHETIC-PENDING',operationId:'UI-SYNTHETIC-OP',action:'EDIT_NPP',payload:{id:'UI-SYNTHETIC-ONLY'},status:'pending'}))throw Error('QUEUE_FAILED');},
 async pending(){return (await db.getQueue()).length;},
 async resumeOwner(account='A'){const result=await control('identity',account);await db.initializeOfflineStorage(result.id);},
 async revoke(){await control('revoke');},
 async cleanup(){await db.clearQueue();},
 async replay(){return syncOfflineQueue();}
};
function Probe(){const auth=useAuth();return <main data-owner={auth.user?.id||''} data-auth={auth.loading?'loading':auth.user?'signed-in':'signed-out'} data-role={auth.role}><h1>Nasun — staging reconnect</h1><p>{auth.user?'Đã đăng nhập':'Đã đăng xuất'}</p></main>;}
createRoot(document.getElementById('root')).render(<AuthProvider><Probe/></AuthProvider>);
`);
  process.env.VITE_SUPABASE_URL = url;
  process.env.VITE_SUPABASE_ANON_KEY = process.env.RLS_TEST_ANON_KEY;
  server = await createServer({ server: { host: '127.0.0.1', port: 5194, strictPort: true }, plugins: [{
    name: 'isolated-staging-ui-control', configureServer(vite) {
      vite.middlewares.use('/__nasun_ui', async (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        if (request.method !== 'POST' || request.headers.origin !== origin) { response.statusCode = 403; response.end(); return; }
        try {
          let body=''; for await (const chunk of request) { body+=chunk; if(body.length>1024)throw Error('BODY_LIMIT'); }
          const account = fixtures.find(item => item.label === JSON.parse(body).account);
          if (!account) throw Error('FIXTURE_ONLY');
          let result;
          if (request.url === '/session') {
            const client = createClient(url, process.env.RLS_TEST_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
            const data = check(await client.auth.signInWithPassword({ email: account.email, password: account.password }));
            result = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
          } else if (request.url === '/identity') result = { id: account.id };
          else if (request.url === '/revoke') {
            const user = check(await service.auth.admin.getUserById(account.id));
            if (!user.user.app_metadata.nasun_rls_fixture) throw Error('FIXTURE_ONLY');
            const sessions = check(await service.from('account_sessions').update({ revoked_at: new Date().toISOString(), revoked_reason: 'UI_STAGING_TEST' }).eq('user_id', account.id).select('session_id'));
            if (!sessions.length) throw Error('SESSION_NOT_REGISTERED'); result = { revoked: true };
          } else throw Error('UNKNOWN_CONTROL');
          response.setHeader('Content-Type','application/json'); response.end(JSON.stringify(result));
        } catch { response.statusCode=500; response.end('STAGING_CONTROL_FAILED'); }
      });
    },
  }] });
  await server.listen();
  console.log(`Starting ${engine} UI reconnect with real staging JWT and disposable accounts.`);
  await cli('open', `${origin}/${directory}/index.html`, `--browser=${engine}`, ...(engine === 'webkit' ? ['--device=iphone 15'] : []));
  await cli('run-code', `async (page) => {
    await page.waitForFunction(()=>window.uiProbe);
    await page.evaluate(()=>window.uiProbe.login());
    await page.locator('main[data-auth="signed-in"]').waitFor();
    await page.waitForFunction(()=>window.uiProbe.ready(),{},{timeout:45000});
    await page.context().setOffline(true);
    await page.evaluate(()=>window.uiProbe.queue());
    await page.context().setOffline(false);
    await page.evaluate(()=>window.uiProbe.revoke());
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.locator('main[data-auth="signed-out"]').waitFor({timeout:45000});
    await page.evaluate(async()=>{if(await window.uiProbe.replay()!==false)throw Error('REVOKED_REPLAY_ALLOWED');await window.uiProbe.resumeOwner();if(await window.uiProbe.pending()!==1)throw Error('PENDING_LOST');});
    await page.evaluate(()=>window.uiProbe.login());
    await page.locator('main[data-auth="signed-in"]').waitFor();
    await page.evaluate(async()=>{if(await window.uiProbe.pending()!==1)throw Error('FRESH_LOGIN_LOST_PENDING');});
    await page.evaluate(()=>window.uiProbe.login('B'));
    await page.waitForFunction(()=>window.uiProbe.ownerIs('B'),{},{timeout:45000});
    await page.evaluate(async()=>{if(await window.uiProbe.pending()!==0)throw Error('ACCOUNT_QUEUE_LEAK');});
    await page.evaluate(()=>window.uiProbe.login());
    await page.waitForFunction(()=>window.uiProbe.ownerIs('A'),{},{timeout:45000});
    await page.evaluate(async()=>{if(await window.uiProbe.pending()!==1)throw Error('RETURN_LOGIN_LOST_PENDING');await window.uiProbe.cleanup();});
  }`);
  const evidence = { engine, device: engine==='webkit'?'iPhone 15 emulation':'desktop', realJwt:true,
    scope:'Actual AuthProvider UI, real staging Auth/RPC, offline/reconnect and revoked-session handling; not full application UI or real Safari/iOS',
    commit:process.env.GITHUB_SHA || null, passed:['offline queue','revoked reconnect signs out','revoked replay rejected','pending recovered after fresh login','second account isolation'],
    nativeVerified:false, realSafariVerified:false };
  await writeFile(`${directory}/${engine}-evidence.json`, JSON.stringify(evidence,null,2));
  console.log(`${engine}: real-JWT reconnect, session invalidation and account isolation passed.`);
} catch (error) {
  console.error(['ISOLATED_STAGING_REQUIRED','BROWSER_CLI_UNAVAILABLE'].includes(error.message) || error.message.startsWith('BROWSER_STEP_FAILED:') ? error.message : 'BROWSER_RECONNECT_VERIFICATION_FAILED');
  process.exitCode=1;
} finally {
  await cli('close').catch(()=>{});
  await server?.close();
  for (const fixture of fixtures) {
    const result=await service.auth.admin.deleteUser(fixture.id);
    if(result.error){console.error('DISPOSABLE_ACCOUNT_CLEANUP_FAILED');process.exitCode=1;}
  }
}
