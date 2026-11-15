'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/index');
test('Production target refuses requests without explicit authorisation',async()=>{
 const prev={...process.env};
 try{
  process.env.VERCEL_ENV='production';delete process.env.SUDERN_PRODUCTION_AUTHORIZED;
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=body}};
  await handler({},res);
  assert.equal(res.statusCode,503);assert.match(res.body,/not authorized/);
  process.env.VERCEL_ENV='preview';
  const preview={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=body}};
  await handler({},preview);
  assert.equal(preview.statusCode,503);assert.equal(preview.body,'Configuration pending');
 }finally{for(const k of ['VERCEL_ENV','SUDERN_PRODUCTION_AUTHORIZED']){if(prev[k]===undefined)delete process.env[k];else process.env[k]=prev[k]}}
});

test('Malformed privileged MFA key fails closed before PostgreSQL access',async()=>{
 const env={...process.env};try{
  process.env.VERCEL_ENV='preview';process.env.DATABASE_URL='postgresql://synthetic.invalid/sudern_test';process.env.MFA_ENCRYPTION_KEY='invalid';
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=body}};
  await handler({},res);
  assert.equal(res.statusCode,503);assert.equal(res.body,'Security configuration invalid');
 }finally{for(const k of ['VERCEL_ENV','DATABASE_URL','MFA_ENCRYPTION_KEY']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}}
});

test('Direct Node production cannot bypass the release hold even with DATABASE_URL configured',async()=>{
 const {serve}=require('../src/server-postgres');
 const previous={NODE_ENV:process.env.NODE_ENV,VERCEL_ENV:process.env.VERCEL_ENV,SUDERN_PRODUCTION_AUTHORIZED:process.env.SUDERN_PRODUCTION_AUTHORIZED};
 process.env.NODE_ENV='production';delete process.env.VERCEL_ENV;process.env.SUDERN_PRODUCTION_AUTHORIZED='false';
 const out={statusCode:200,headers:{},body:'',setHeader(k,v){this.headers[k]=v},end(v){this.body=v||''}};
 try{await serve({method:'GET',url:'/api/health',headers:{}},out)}finally{
  for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
 assert.equal(out.statusCode,503);
 assert.match(out.body,/not authorized/);
 assert.equal(out.headers['Cache-Control'],'no-store');
});
