'use strict';
// External exact-head, synthetic-account preview smoke: no secret output, no real data writes.
const assert=require('node:assert/strict');
const mfa=require('../src/mfa');
const {URL}=require('node:url');
const base=process.env.SUDERN_PREVIEW_URL;
const expected=process.env.SUDERN_EXPECTED_SHA;
const email=process.env.SUDERN_SYNTHETIC_EMAIL;
const password=process.env.SUDERN_SYNTHETIC_PASSWORD;
if(!base||!expected||!email||!password){
 console.error('BLOCKED: SUDERN_PREVIEW_URL, SUDERN_EXPECTED_SHA, SUDERN_SYNTHETIC_EMAIL and SUDERN_SYNTHETIC_PASSWORD are required');
 process.exit(2);
}
let target;
try{target=new URL(base);assert.equal(target.protocol,'https:');assert.equal(target.pathname,'/');assert.equal(target.search,'');assert.equal(target.hash,'')}catch{
 console.error('BLOCKED: SUDERN_PREVIEW_URL must be a complete HTTPS origin, ending in /');process.exit(2);
}
if(!/^[0-9a-f]{40}$/.test(expected)){console.error('BLOCKED: exact 40-character hexadecimal commit SHA required');process.exit(2)}
const bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
let session;
async function req(path,method='GET',input){
 const headers={'Accept':'application/json'};
 if(bypass)headers['x-vercel-protection-bypass']=bypass;
 if(input!==undefined)headers['Content-Type']='application/json';
 if(session){headers.Cookie=session.cookie;if(!['GET','HEAD'].includes(method))headers['X-CSRF-Token']=session.csrf}
 const response=await fetch(new URL(path,target),{method,headers,body:input===undefined?undefined:JSON.stringify(input),redirect:'manual',signal:AbortSignal.timeout(15000)});
 const raw=await response.text();let body;
 try{body=JSON.parse(raw)}catch{body={error:'Non-JSON response (potentially access protection or proxy denial)'}}
 return {status:response.status,body,cookie:response.headers.get('set-cookie')};
}
(async()=>{
 let r=await req('/api/health');assert.equal(r.status,200,`health not ready: HTTP ${r.status}`);
 assert.equal(r.body.database,'postgresql');assert.equal(r.body.schema_version,2);assert.equal(r.body.commit_sha,expected,'Preview does not run expected commit');
 r=await req('/api/public/config');assert.equal(r.status,200);assert.equal(r.body.intake_enabled,false,'Public intake must remain disabled in preview');
 r=await req('/api/dashboard');assert.equal(r.status,401,'Unauthenticated dashboard must be denied');
 const challenge=await req('/api/auth/login','POST',{email,password});assert.equal(challenge.status,202,'Expected privileged MFA challenge');
 assert.equal(challenge.body.mfa_required,true);
 let secret=process.env.SUDERN_SYNTHETIC_TOTP_SECRET;
 if(challenge.body.enrollment_required){
  const setup=await req('/api/auth/mfa/setup','POST',{challenge:challenge.body.challenge});assert.equal(setup.status,200);
  secret=setup.body.secret;
 }
 assert.ok(secret,'Synthetic TOTP secret required for an already enrolled account');
 const verified=await req('/api/auth/mfa/verify','POST',{challenge:challenge.body.challenge,code:mfa.codeAt(secret,Date.now())});
 assert.equal(verified.status,200,'MFA sign-in failed');
 const cookie=verified.cookie?.split(';')[0];assert.ok(cookie?.startsWith('sudern_session='),'Secure session cookie absent');
 session={cookie,csrf:verified.body.csrf};
 assert.ok(session.csrf,'CSRF token absent');
 r=await req('/api/auth/me');assert.equal(r.status,200);assert.equal(r.body.user.email,email.toLowerCase());
 r=await req('/api/dashboard');assert.equal(r.status,200);
 r=await req('/api/audit');assert.equal(r.status,200);assert.equal(r.body.integrity.ok,true);
 r=await req('/api/auth/logout','POST');assert.equal(r.status,200);
 session=null;r=await req('/api/dashboard');assert.equal(r.status,401);
 console.log(JSON.stringify({status:'PASS',target:target.origin,commit_sha:expected,schema_version:2,checks:['health','exact_sha','intake_closed','unauth_denied','password_challenge','TOTP_MFA','authenticated_session','dashboard','audit_integrity','logout_revocation']}));
})().catch(e=>{console.error('PREVIEW SMOKE FAIL:',e.message);process.exitCode=1});
