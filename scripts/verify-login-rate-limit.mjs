import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
const url = new URL(process.env.RLS_TEST_URL || '');
assert.equal(url.origin,'https://kenznmtdfuexmfrtzypb.supabase.co','Rate-limit bursts must only target isolated staging');
const key = process.env.RLS_TEST_ANON_KEY;
assert.ok(key,'Staging publishable key required');
// Unknown synthetic identity: no real account lockout, signup or email delivery.
const email=`nasun-rate-${randomUUID()}@example.invalid`;
let limited=false;
// A bounded burst avoids sequential network latency refilling the token bucket.
for(let attempt=0;attempt<36;attempt+=6) {
 const responses=await Promise.all(Array.from({length:6},()=>fetch(new URL('/auth/v1/token?grant_type=password',url),{
  method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify({email,password:randomBytes(32).toString('base64url')}),signal:AbortSignal.timeout(20000),
 })));
 for(const response of responses) assert.ok([400,429].includes(response.status),'Expected invalid credentials or HTTP 429; unexpected provider response is not acceptance');
 if(responses.some(response=>response.status===429)){limited=true;console.log(`Staging Auth rate limit verified: HTTP 429 within ${attempt+6} synthetic requests. No production requests or real account credentials used.`);break;}
}
assert.ok(limited,'AUTH_RATE_LIMIT_NOT_VERIFIED_WITHIN_BOUNDED_PROBE');
