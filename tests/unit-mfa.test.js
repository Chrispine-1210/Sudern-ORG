'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.MFA_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
const m=require('../src/mfa');
test('TOTP known RFC 6238 SHA1 secret',()=>{
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 assert.equal(m.codeAt(secret,59000),'287082');
 assert.equal(m.validCode(secret,'287082',59000),true);
 assert.equal(m.validCode(secret,'287083',59000),false);
 assert.equal(m.validCode(secret,'287082',59000+30000*3),false);
});
test('MFA authenticated encryption and tamper rejection',()=>{
 const secret=m.newSecret(),sealed=m.seal(secret);
 assert.equal(m.open(sealed),secret);
 assert.notEqual(sealed,secret);
 const parts=sealed.split('.');
 parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
 assert.throws(()=>m.open(parts.join('.')));
});
test('Recovery codes are unique and redeem once removed',()=>{
 const codes=Array.from({length:8},()=>m.recoveryCode()),hashes=codes.map(m.hashRecovery);
 assert.equal(new Set(codes).size,8);
 assert.equal(m.verifyRecovery(codes[5],hashes),5);
 assert.equal(m.verifyRecovery('000000-000000-000000-000000',hashes),-1);
 hashes.splice(5,1);assert.equal(m.verifyRecovery(codes[5],hashes),-1);
});
test('All staff roles require privileged MFA',()=>{
 for(const role of ['admin','director','finance_officer','programme_officer','mel_officer','viewer'])assert.equal(m.isPrivileged(role),true);
});
test('Time-step identification enables one-use TOTP',()=>{
 const secret=m.newSecret(),at=Date.now(),code=m.codeAt(secret,at);
 assert.equal(m.matchingStep(secret,code,at),Math.floor(at/30000));
 assert.equal(m.matchingStep(secret,'not-six-digits',at),null);
});
