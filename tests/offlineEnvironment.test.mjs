import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { request } from 'node:http';
import { createHash } from 'node:crypto';
import { createOfflinePreviewServer } from '../scripts/serve-offline-preview.mjs';

async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'nasun-stage1-'));
  const bytes=Buffer.from('<!doctype html><h1>Synthetic preview</h1>');
  await writeFile(join(directory,'index.html'),bytes);
  await writeFile(join(directory,'preview-manifest.json'),JSON.stringify({version:1,synthetic:true,backendConnected:false,files:[{path:'index.html',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]}));
  t.after(()=>{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('nasun-stage1-'));return rm(directory,{recursive:true,force:true});});
  return directory;
}

test('preview only serves integrity-listed assets and cannot expose repository or environment files',async t=>{
  const instance=await createOfflinePreviewServer({directory:await fixture(t),port:0});t.after(()=>instance.close());
  const page=await fetch(instance.origin);
  assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);
  assert.equal(page.headers.get('x-content-type-options'),'nosniff');
  assert.equal(page.headers.get('access-control-allow-origin'),null);
  for(const path of ['/.env','/.git/config','/src/shared/lib/supabase.js','/@fs/C:/Windows','/api/customer','/%2e%2e/.env'])assert.equal((await fetch(instance.origin+path)).status,404);
  assert.equal((await fetch(instance.origin,{headers:{Origin:'https://untrusted.example'}})).status,403);
  const spoofedHost=await new Promise((accept,reject)=>{const req=request(instance.origin,{headers:{Host:'untrusted.example'}},response=>{response.resume();accept(response.statusCode);});req.on('error',reject);req.end();});
  assert.equal(spoofedHost,403);
  assert.equal((await fetch(instance.origin,{method:'POST',body:'synthetic'})).status,405);
});

test('fault fixtures cover permission, validation, outage, timeout and lost acknowledgement without a database',async t=>{
  const instance=await createOfflinePreviewServer({directory:await fixture(t),port:0});t.after(()=>instance.close());
  for(const [scenario,status] of Object.entries({online:200,unauthorized:401,forbidden:403,conflict:409,invalid:422,transient:503}))assert.equal((await fetch(`${instance.origin}/__fixture?scenario=${scenario}`)).status,status);
  await assert.rejects(fetch(`${instance.origin}/__fixture?scenario=timeout`,{signal:AbortSignal.timeout(30)}));
  await assert.rejects(fetch(`${instance.origin}/__fixture?scenario=lost-ack&operation=s1-test-op`));
  for(let attempt=0;attempt<2;attempt++)assert.equal((await (await fetch(`${instance.origin}/__fixture?scenario=replay&operation=s1-test-op`)).json()).commits,1);
  assert.equal((await fetch(`${instance.origin}/__fixture?scenario=replay&operation=invalid`)).status,400);
});

test('preview refuses tampered files and a manifest declaring a live backend',async t=>{
  const directory=await fixture(t);await writeFile(join(directory,'index.html'),'tampered');
  await assert.rejects(createOfflinePreviewServer({directory,port:0}),/PREVIEW_INTEGRITY_FAILED/);
  await writeFile(join(directory,'preview-manifest.json'),JSON.stringify({version:1,synthetic:true,backendConnected:true,files:[]}));
  await assert.rejects(createOfflinePreviewServer({directory,port:0}),/PREVIEW_MANIFEST_REQUIRED/);
});
