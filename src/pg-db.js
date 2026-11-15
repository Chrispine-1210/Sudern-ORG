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
  pool.on('error',e=>console.error('[postgres pool]',e.message));
 }
 return pool;
}
async function query(sql,args=[]){const conn=als.getStore()||getPool();return conn.query(placeholders(sql),args)}
const db={prepare(sql){return {
  async get(...args){const {rows}=await query(sql,args);return rows[0]},
  async all(...args){const {rows}=await query(sql,args);return rows},
  async run(...args){const result=await query(sql,args);return {changes:result.rowCount}}
}}, async close(){if(pool){await pool.end();pool=null}}};
async function getDb(){await query('SELECT 1');return db}
async function transaction(_db,fn){
 if(als.getStore())return fn();
 const client=await getPool().connect();
 try{await client.query('BEGIN');const result=await als.run(client,fn);await client.query('COMMIT');return result}
 catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
async function audit(_db,actor,action,type,entity,details={}){
 if(!als.getStore())return transaction(db,()=>audit(db,actor,action,type,entity,details));
 await query("SELECT pg_advisory_xact_lock(hashtext('sudern_audit_chain_v1'))");
 const t=now(),eid=id('audit'),serialized=JSON.stringify(details);
 const last=await db.prepare('SELECT event_hash FROM audit ORDER BY seq DESC LIMIT 1').get();
 const previous=last?.event_hash||'GENESIS';
 const hash=crypto.createHash('sha256').update(JSON.stringify([eid,actor||null,action,type,entity,serialized,t,previous])).digest('hex');
 await db.prepare('INSERT INTO audit(id,actor_id,action,entity_type,entity_id,detail_json,occurred_at,previous_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)').run(eid,actor||null,action,type,entity,serialized,t,previous,hash);
}
async function verifyAudit(_db){let prev='GENESIS',count=0;const items=await db.prepare('SELECT * FROM audit ORDER BY seq').all();for(const e of items){
 const hash=crypto.createHash('sha256').update(JSON.stringify([e.id,e.actor_id,e.action,e.entity_type,e.entity_id,e.detail_json,e.occurred_at,prev])).digest('hex');
 if(e.previous_hash!==prev||e.event_hash!==hash)return {ok:false,count,failed_at:e.seq};prev=e.event_hash;count++;
}return {ok:true,count,tip:prev}}
async function migrate(){const conn=await getPool().connect();try{
 await conn.query('BEGIN');await conn.query("SELECT pg_advisory_xact_lock(hashtext('sudern_schema_migration_v1'))");
 await conn.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
 const existing=await conn.query('SELECT version FROM schema_migrations ORDER BY version');
 const versions=new Set(existing.rows.map(r=>r.version));
 if(!versions.has(1)){
  // Existing unrelated tables never silently adopted as SUDERN schema.
  const conflicting=await conn.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename IN ('users','sessions','programmes','funds','audit')");
  if(conflicting.rows.length)throw Error('Existing tables present without migration ledger; refusing migration');
  await conn.query(readFileSync(path.join(__dirname,'../migrations/001_initial_postgres.sql'),'utf8'));
  await conn.query('INSERT INTO schema_migrations(version,applied_at) VALUES($1,$2)',[1,now()]);
  const programmes=[
  ['tech','TECH','Tech Forge','Technology & workforce capability','Applied digital skills, networking, coding and technical problem-solving.'],
  ['finance','FACA','Financial Academy','Financial capability & literacy','Savings, budgeting, enterprise financial literacy and responsible financing readiness.'],
  ['chuma','CHUMA','ChumaLab','Enterprise incubation & business development','Business validation, practical enterprise development and measurable livelihoods.']];
  for(const [pid,code,name,focus,description] of programmes)await conn.query('INSERT INTO programmes(id,code,name,focus,description,state,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[pid,code,name,focus,description,'planned',now()]);
 }
 if(!versions.has(2)){
  await conn.query(readFileSync(path.join(__dirname,'../migrations/002_mfa_replay_control.sql'),'utf8'));
  await conn.query('INSERT INTO schema_migrations(version,applied_at) VALUES($1,$2)',[2,now()]);
 }
 await conn.query('COMMIT');return {version:2,applied:!versions.has(1)||!versions.has(2)};
 }catch(e){await conn.query('ROLLBACK');throw e}finally{conn.release()}}
module.exports={getDb,db,now,id,audit,verifyAudit,transaction,migrate,query,placeholders};
