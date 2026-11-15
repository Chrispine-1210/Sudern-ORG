'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {placeholders}=require('../src/pg-db');
test('SQL placeholder adapter preserves quoted literal question marks',()=>{
 assert.equal(placeholders("SELECT '?' AS quoted, col FROM t WHERE id=? AND note=\"?\" AND status=?"),"SELECT '?' AS quoted, col FROM t WHERE id=$1 AND note=\"?\" AND status=$2");
});
test('Managed Postgres migration includes integrity, constrained money, and MFA challenge tables',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../migrations/001_initial_postgres.sql'),'utf8');
 for(const x of ['mfa_challenges','mfa_verified','mfa_secret_enc','received_mwk BIGINT','audit_immutable_update','audit_immutable_delete','schema_migrations'])assert.ok(sql.includes(x),x);
});

test('Additive v2 migration and schema verification enforce one-use TOTP',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../migrations/002_mfa_replay_control.sql'),'utf8');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS mfa_last_step BIGINT/);
 const adapter=fs.readFileSync(path.join(__dirname,'../src/pg-db.js'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'../src/server-postgres.js'),'utf8');
 assert.match(adapter,/migrations\/002_mfa_replay_control\.sql/);
 assert.match(server,/schema_migrations WHERE version=2/);
 assert.match(server,/mfa_last_step=/);
 for(const type of ['applications','participants','expenses','governance','evidence','enquiries','opportunities'])
  assert.match(server,new RegExp('FROM '+type+' WHERE id=\\? FOR UPDATE'));
});

// Regression: v0.3.2 wrote MFA time steps but omitted the column from the
// verification SELECT. That allowed reuse of a previously consumed code.
test('MFA verification reads the previously consumed TOTP step from the locked account',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../src/server-postgres.js'),'utf8');
 const challengeQuery=server.match(/SELECT c\.\*,u\.email,u\.name,u\.role,u\.active,u\.mfa_confirmed,[\s\S]*?FROM mfa_challenges c JOIN users u ON u\.id=c\.user_id[\s\S]*?FOR UPDATE/);
 assert.ok(challengeQuery,'Privileged MFA SELECT must be present');
 assert.match(challengeQuery[0],/u\.mfa_last_step/,'Previously used TOTP step must be projected');
 assert.match(challengeQuery[0],/FOR UPDATE/,'User and challenge rows must be locked');
});
