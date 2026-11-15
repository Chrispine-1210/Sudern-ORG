'use strict';
const crypto=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const als=new AsyncLocalStorage();
let pool;
function now(){return new Date().toISOString()}
function id(prefix){return prefix+'_'+crypto.randomBytes(9).toString('hex')}
// Convert the original code's SQLite '?' bind markers to Postgres $1, $2, ... .
// SQL in this app is statically authored; only args are user-controllable.
function placeholders(sql){let n=0,inside=null,escape=false;return sql.replace(/./gs,c=>{if(inside){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===inside)inside=null;return c;}if(c==='\''||c==='"'){inside=c;return c}return c==='?'?'$'+(++n):c});}
function getPool(){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required for PostgreSQL mode');
 if(!pool){
  const {Pool,types}=require('pg');
  types.setTypeParser(20,v=>{const n=Number(v);if(!Number.isSafeInteger(n))throw Error('Unsafe PostgreSQL BIGINT exceeds JS integer precision');return n});
  types.setTypeParser(1700,v=>{const n=Number(v);if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw Error('Unsafe PostgreSQL NUMERIC exceeds JS precision');return n});
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:Number(process.env.PG_POOL_MAX||4),idleTimeoutMillis:15000,connectionTimeoutMillis:10000,application_name:'sudern-operations'});
  pool.on('error',e=>console.error('[po¶»§q«^