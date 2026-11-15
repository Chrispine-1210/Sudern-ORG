'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/index');
function mock(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=body}}}
test('Production deployment fails closed without explicit authorisation',async()=>{
 const env={...process.env};
 try{
  process.env.VERCEL_ENV='production';delete process.env.SUDERN_PRODUCTION_AUTHORIZED;
  const res=mock();await handler({},res);
  assert.equal(res.statusCode,503);
  assert.match(res.body,/not authorized/);
  process.env.VERCEL_ENV='preview';
  delete process.env.DATABASE_URL;delete process.env.MFA_ENCRYPTION_KEY;
  const preview=mock();await handler({},preview);
  assert.equal(preview.statusCode,503);
  assert.equal(preview.body,'Configuration pending');
 }finally{for(const k of ['VERCEL_ENV','SUDERN_PRODUCTION_AUTHORIZED','DATABASE_URL','MFA_ENCRYPTION_KEY']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}}
});
test('Malformed encryption key is rejected before PostgreSQL use',async()=>{
 const env={...process.env};
 try{
  process.env.VERCEL_ENV='preview';
  process.env.DATABASE_URL='postgresql://synthetic.invalid/sudern_test';
  process.env.MFA_ENCRYPTION_KEY='invalid';
  const res=mock();await handler({},res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body,'Security configuration invalid');
 }finally{for(const k of ['VERCEL_ENV','DATABASE_URL','MFA_ENCRYPTION_KEY']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}}
});
test('Direct Node server production cannot bypass authorisation hold',async()=>{
 const {serve}=require('../src/server-postgres');
 const previous={NODE_ENV:process.env.NODE_ENV,VERCEL_ENV:process.env.VERCEL_ENV,SUDERN_PRODUCTION_AUTHORIZED:process.env.SUDERN_PRODUCTION_AUTHORIZED};
 process.env.NODE_ENV='production';delete process.env.VERCEL_ENV;process.env.SUDERN_PRODUCTION_AUTHORIZED='false';
 const out=mock();try{await serve({method:'GET',url:'/api/health',headers:{}},out)}finally{
  for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v
 }
 assert.equal(out.statusCode,503);
 assert.match(out.body,/not authorized/);
 assert.equal(out.headers['Cache-Control'],'no-store');
});
