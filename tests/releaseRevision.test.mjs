import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyReleaseRevision} from '../scripts/verify-release-revision.mjs';
const sha='a'.repeat(40);
const env={RELEASE_SHA:sha,GITHUB_SHA:sha,GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'dat291296/hethong-may-pha-mau-nasun',GITHUB_TOKEN:'synthetic'};
const response=async()=>({ok:true,json:async()=>({commit:{sha}})});
test('release requires the explicitly approved immutable main revision',async()=>{
  assert.equal(await verifyReleaseRevision(env,response),sha);
  for(const changes of [{RELEASE_SHA:'main'},{GITHUB_SHA:'b'.repeat(40)},{GITHUB_REF:'refs/heads/staging'},{GITHUB_REPOSITORY:'foreign/repo'},{GITHUB_TOKEN:''}]) {
    await assert.rejects(verifyReleaseRevision({...env,...changes},response),/CONTEXT_REJECTED/);
  }
});
test('release stops if main moves or revision lookup fails',async()=>{
  await assert.rejects(verifyReleaseRevision(env,async()=>({ok:true,json:async()=>({commit:{sha:'b'.repeat(40)}})})),/MAIN_MOVED/);
  await assert.rejects(verifyReleaseRevision(env,async()=>({ok:false})),/LOOKUP_FAILED/);
});
