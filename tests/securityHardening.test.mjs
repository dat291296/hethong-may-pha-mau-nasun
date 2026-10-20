import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { userErrorMessage } from '../src/security/userError.js';
test('provider errors do not expose SQL, submitted values or hints',()=>{
 for(const error of [{code:'22P02',message:'invalid input customer-private-value'}, {code:'PGRST999',details:'private SQL',hint:'private value'},new Error('SELECT secret FROM profiles'),new Error('Lỗi SQL chứa dữ liệu riêng')]) {
  const result=userErrorMessage(error);
  assert.doesNotMatch(result,/customer-private|private SQL|SELECT|profiles|riêng/);
 }
 assert.match(userErrorMessage(new Error('Vui lòng nhập tên thiết bị.')),/nhập tên/);
});
test('build strips public console output and keeps private source maps disabled',async()=>{
 const source=await readFile(new URL('../vite.config.js',import.meta.url),'utf8');
 assert.match(source,/dropConsole: true/);assert.match(source,/sourcemap: false/);
});
test('session migration is fail closed and does not rewrite business rows',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261020082117_session_upload_privilege_hardening.sql',import.meta.url),'utf8');
 assert.match(sql,/AS RESTRICTIVE FOR ALL TO authenticated/);
 assert.match(sql,/FROM auth.sessions/);assert.match(sql,/s.expires_at>now\(\)/);
 assert.match(sql,/IF NOT public.has_active_app_session\(\)/);
 assert.match(sql,/REVOKE TRUNCATE, REFERENCES, TRIGGER/);
 assert.match(sql,/FROM PUBLIC,anon/);
 assert.doesNotMatch(sql,/^\s*(DELETE FROM|TRUNCATE |DROP TABLE|UPDATE public\.(distributors|repair_tickets|system_sets)) /mi);
});
test('photo guard validates bytes and allows unchanged historical fields',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261020082117_session_upload_privilege_hardening.sql',import.meta.url),'utf8');
 assert.match(sql,/IS NOT DISTINCT FROM previous_value THEN CONTINUE/);
 assert.match(sql,/jsonb_array_length\(value\)>6/);
 assert.match(sql,/decode\(payload,'base64'\)/);
 assert.match(sql,/octet_length\(bytes\)>2097152/);
 assert.match(sql,/INVALID_IMAGE_UPLOAD/);
});

import { validateInlineImage } from '../src/security/imageEvidence.js';
import worker from '../src/worker.js';
test('inline evidence rejects active content, spoofed MIME and oversize bytes',()=>{
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1cAAAAASUVORK5CYII=';
 assert.equal(validateInlineImage(png),png);
 for(const value of ['data:text/html;base64,PHNjcmlwdD4=', 'data:image/png;base64,U1lOVEhFVElD', png.replace('png','jpeg'), 'https://untrusted.invalid/image.png', 'data:image/png;base64,'+'A'.repeat(2796252)]) assert.throws(()=>validateInlineImage(value));
});
test('worker rejects foreign/null origins and never sends wildcard CORS',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('ok')}};
 for(const origin of ['https://untrusted.invalid','null']){
  const result=await worker.fetch(new Request('https://kythuat.nasun.workers.dev/',{headers:{Origin:origin}}),env);
  assert.equal(result.status,403);assert.equal(result.headers.get('Access-Control-Allow-Origin'),null);
 }
 const same=await worker.fetch(new Request('https://kythuat.nasun.workers.dev/',{method:'OPTIONS',headers:{Origin:'https://kythuat.nasun.workers.dev'}}),env);
 assert.equal(same.status,204);assert.equal(same.headers.get('Access-Control-Allow-Origin'),'https://kythuat.nasun.workers.dev');
 assert.equal((await worker.fetch(new Request('https://kythuat.nasun.workers.dev/'),env)).status,200);
});

import { resolveFailureState } from '../src/lib/syncQueue.js';
test('sync review keeps failure classification without retaining raw SQL errors',()=>{
 const failure=resolveFailureState({attempts:0},{code:'22P02',message:'invalid input syntax for customer-private-value'},1000);
 assert.equal(failure.status,'needs_review');assert.equal(failure.lastErrorCode,'22P02');assert.doesNotMatch(failure.lastError,/customer-private-value|invalid input/);
});
