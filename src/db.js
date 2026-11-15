'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'sudern.db');
let db;
function now(){ return new Date().toISOString(); }
function id(prefix){ return prefix+'_'+crypto.randomBytes(9).toString('hex'); }
function initDb(file=DATABASE_PATH){
  if(file!==':memory:') fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const c = new DatabaseSync(file); c.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  if(file!==':memory:') c.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  c.exec(`
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','director','programme_officer','finance_officer','mel_officer','viewer')),
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL,
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS programmes (
 id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, focus TEXT NOT NULL,
 description TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','active','completed','paused')),
 created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cohorts (
 id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES programmes(id), name TEXT NOT NULL,
 capacity INTEGER NOT NULL CHECK(capacity>0), start_date TEXT, end_date TEXT,
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed','cancelled')),
 created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS applications (
 id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES programmes(id),
 applicant_name TEXT NOT NULL, applicant_email TEXT NOT NULL, phone TEXT, motivation TEXT NOT NULL,
 consent INTEGER NOT NULL CHECK(consent=1),
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','under_review','approved','rejected','enrolled')),
 source TEXT NOT NULL DEFAULT 'public', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS enquiries (
 id TEXT PRIMARY KEY, contact_name TEXT NOT NULL, organisation TEXT NOT NULL DEFAULT '',
 contact_email TEXT NOT NULL, interest TEXT NOT NULL, message TEXT NOT NULL,
 consent INTEGER NOT NULL CHECK(consent=1),
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','under_review','closed')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS participants (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),
 programme_id TEXT NOT NULL REFERENCES programmes(id), cohort_id TEXT REFERENCES cohorts(id),
 name TEXT NOT NULL, email TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','withdrawn')),
 created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assessments (
 id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id),
 kind TEXT NOT NULL CHECK(kind IN ('baseline','final','followup')), score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
 evidence_url TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', assessed_at TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS funds (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, source_ref TEXT NOT NULL,
 restricted_programme_id TEXT REFERENCES programmes(id), received_mwk INTEGER NOT NULL CHECK(received_mwk>0),
 status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','closed')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS expenses (
 id TEXT PRIMARY KEY, fund_id TEXT NOT NULL REFERENCES funds(id), programme_id TEXT NOT NULL REFERENCES programmes(id),
 amount_mwk INTEGER NOT NULL CHECK(amount_mwk>0), purpose TEXT NOT NULL, proof_url TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','paid','rejected')),
 requested_by TEXT NOT NULL REFERENCES users(id), requested_at TEXT NOT NULL,
 payment_ref TEXT, paid_at TEXT);
CREATE TABLE IF NOT EXISTS expense_approvals (
 expense_id TEXT NOT NULL REFERENCES expenses(id), user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN ('director','finance_officer')),
 approved_at TEXT NOT NULL, PRIMARY KEY(expense_id,user_id), UNIQUE(expense_id,role));
CREATE TABLE IF NOT EXISTS indicators (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, programme_id TEXT REFERENCES programmes(id),
 name TEXT NOT NULL, unit TEXT NOT NULL, baseline REAL, target REAL,
 due_date TEXT, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observations (
 id TEXT PRIMARY KEY, indicator_id TEXT NOT NULL REFERENCES indicators(id),
 value REAL NOT NULL, observed_at TEXT NOT NULL, evidence_url TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS governance (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
 owner_id TEXT NOT NULL REFERENCES users(id), resolution TEXT NOT NULL DEFAULT '',
 evidence_url TEXT, status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','closed')),
 created_at TEXT NOT NULL, decided_at TEXT);
CREATE TABLE IF NOT EXISTS evidence (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 source_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
 details TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id), reviewed_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL, reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS opportunities (
 id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('challenge','mentor','collaboration','volunteer')),
 title TEXT NOT NULL, description TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','closed')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 actor_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 detail_json TEXT NOT NULL, occurred_at TEXT NOT NULL, previous_hash TEXT NOT NULL, event_hash TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS audit_immutable_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit records cannot be updated'); END;
CREATE TRIGGER IF NOT EXISTS audit_immutable_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit records cannot be deleted'); END;
CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries(status,created_at);
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status,created_at);
CREATE INDEX IF NOT EXISTS participants_programme_idx ON participants(programme_id,status);
CREATE INDEX IF NOT EXISTS expenses_fund_status_idx ON expenses(fund_id,status);
CREATE INDEX IF NOT EXISTS observations_indicator_idx ON observations(indicator_id,observed_at);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  `);
  const programmes=[
    ['tech','TECH','Tech Forge','Technology & workforce capability','Applied digital skills, networking, coding and technical problem-solving.'],
    ['finance','FACA','Financial Academy','Financial capability & literacy','Savings, budgeting, enterprise financial literacy and responsible financing readiness.'],
    ['chuma','CHUMA','ChumaLab','Enterprise incubation & business development','Business validation, practical enterprise development and measurable livelihoods.']
  ];
  const insert = c.prepare('INSERT OR IGNORE INTO programmes(id,code,name,focus,description,state,created_at) VALUES(?,?,?,?,?,?,?)');
  for(const [pid,code,name,focus,description] of programmes) insert.run(pid,code,name,focus,description,'planned',now());
  db=c; return c;
}
function getDb(){ if(!db) return initDb(); return db; }
function audit(c,actor,action,type,entity,details={}){
  const t=now(), eid=id('audit'), serialized=JSON.stringify(details);
  const last=c.prepare('SELECT event_hash FROM audit ORDER BY seq DESC LIMIT 1').get();
  const previous=last?.event_hash||'GENESIS';
  const hash=crypto.createHash('sha256').update(JSON.stringify([eid,actor||null,action,type,entity,serialized,t,previous])).digest('hex');
  c.prepare('INSERT INTO audit(id,actor_id,action,entity_type,entity_id,detail_json,occurred_at,previous_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(eid,actor||null,action,type,entity,serialized,t,previous,hash);
}
function transaction(c,fn){ c.exec('BEGIN IMMEDIATE'); try { const result=fn(); c.exec('COMMIT'); return result; } catch(e){c.exec('ROLLBACK');throw e;} }
function verifyAudit(c){
 let prev='GENESIS';let count=0;
 for(const e of c.prepare('SELECT * FROM audit ORDER BY seq').all()){
  const hash=crypto.createHash('sha256').update(JSON.stringify([e.id,e.actor_id,e.action,e.entity_type,e.entity_id,e.detail_json,e.occurred_at,prev])).digest('hex');
  if(e.previous_hash!==prev||e.event_hash!==hash) return {ok:false,count,failed_at:e.seq};
  prev=e.event_hash;count++;
 }
 return {ok:true,count,tip:prev};
}
module.exports={initDb,getDb,now,id,audit,transaction,verifyAudit};
