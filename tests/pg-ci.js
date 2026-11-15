'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {migrate,getDb,db,audit,verifyAudit}=require('../src/pg-db');
async function run(){
 assert.ok(process.env.CI && process.env.DATABASE_URL,'Refusing non-CI or missing isolated database');
 assert.match(new URL(process.env.DATABASE_URL).pathname,/sudern_ci$/,'Expected isolated sudern_ci database');
 const first=await migrate();
 assert.equal(first.version,2);
 const second=await migrate();
 assert.equal(second.applied,false,'Migrations must be idempotent');
 await getDb();
 const versions=await db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
 assert.deepEqual(versions.map(x=>x.version),[1,2]);
 const programmes=await db.prepare('SELECT code,state FROM programmes ORDER BY code').all();
 assert.equal(programmes.length,3,'Tech Forge, Financial Academy, ChumaLab required');
 assert.ok(programmes.every(x=>x.state==='planned'),'No false programme activation');
 const col=await db.prepare("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='mfa_last_step'").all();
 assert.equal(col.length,1);
 const now=new Date().toISOString(),u='ci_'+crypto.randomBytes(6).toString('hex');
 await db.prepare('INSERT INTO users(id,name,email,pass_hash,salt,role,created_at) VALUES(?,?,?,?,?,?,?)')
  .run(u,'CI synthetic user',u+'@example.invalid','synthetic','synthetic','director',now);
 await db.prepare('INSERT INTO funds(id,name,source_ref,received_mwk,created_by,created_at) VALUES(?,?,?,?,?,?)')
  .run('ci_fund','CI test fund','SYNTHETIC-ONLY',500000,u,now);
 const runExp=(id,amount)=>db.prepare('INSERT INTO expenses(id,fund_id,programme_id,amount_mwk,purpose,proof_url,requested_by,requested_at) VALUES(?,?,?,?,?,?,?,?)')
  .run(id,'ci_fund','tech',amount,'CI test expense','https://example.invalid/evidence',u,now);
 await runExp('ci_expense_1',300000);
 await assert.rejects(()=>runExp('ci_invalid',-1),/check constraint|violates/i);
 await audit(db,u,'ci.evidence','fund','ci_fund',{synthetic:true});
 const integrity=await verifyAudit(db);
 assert.equal(integrity.ok,true);
 assert.ok(integrity.count>0);
 await assert.rejects(()=>db.prepare("UPDATE audit SET detail_json='tampered' WHERE entity_id='ci_fund'").run(),/audit records cannot be modified/);
 console.log('PASS: isolated PostgreSQL migrations v1/v2, programmes, finance constraints, MFA column, immutable chained audit.');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await db.close()});
