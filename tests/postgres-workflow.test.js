'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
if(!process.env.PG_TEST_DATABASE_URL){test('PostgreSQL isolated full HTTP workflow',{skip:'PG_TEST_DATABASE_URL not provided; no PostgreSQL runtime proof'},()=>{});}
else {
const u=new URL(process.env.PG_TEST_DATABASE_URL);
if(!/^sudern_(?:test|sandbox)(?:_[a-z\d]+)?$/.test(u.pathname.replace(/^\//,'')))throw Error('DANGER: PG_TEST_DATABASE_URL must target an isolated disposable sudern_test or sudern_sandbox database');
process.env.DATABASE_URL=process.env.PG_TEST_DATABASE_URL;
process.env.MFA_ENCRYPTION_KEY=process.env.MFA_ENCRYPTION_KEY||crypto.randomBytes(32).toString('base64');
process.env.INTAKE_ENABLED='true';process.env.SANDBOX='true';process.env.HOST='127.0.0.1';
const {start}=require('../src/server-postgres'),{migrate,getDb,id,now,transaction,audit,verifyAudit}=require('../src/pg-db'),{hashPassword}=require('../src/security'),mfa=require('../src/mfa');
let host,server,db;
const pass='Fake-Sandbox-Unique-Password-Only-2026';
const people={};
async function request(url,method='GET',body,identity){
 const headers={};if(body!==undefined)headers['content-type']='application/json';if(identity){headers.cookie=identity.cookie;if(method!=='GET')headers['x-csrf-token']=identity.csrf}
 const r=await fetch(host+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function createStaff(role){const name='Synthetic '+role,em=role+'@sudern-test.invalid',uid=id('user'),{salt,hash}=hashPassword(pass);
 await transaction(db,async()=>{await db.prepare('INSERT INTO users(id,name,email,pass_hash,salt,role,active,created_at) VALUES(?,?,?,?,?,?,?,?)').run(uid,name,em,hash,salt,role,1,now());await audit(db,uid,'test.staff','user',uid,{role})});
 people[role]={id:uid,email:em};
}
async function sign(role){const first=await request('/api/auth/login','POST',{email:people[role].email,password:pass});assert.equal(first.status,202,JSON.stringify(first.data));assert.equal(first.cookie,undefined,'No cookie until MFA');
 const setup=await request('/api/auth/mfa/setup','POST',{challenge:first.data.challenge});assert.equal(setup.status,200,JSON.stringify(setup.data));
 const invalid=await request('/api/auth/mfa/verify','POST',{challenge:first.data.challenge,code:'9999999'});assert.equal(invalid.status,401);
 const done=await request('/api/auth/mfa/verify','POST',{challenge:first.data.challenge,code:mfa.codeAt(setup.data.secret,Date.now())});assert.equal(done.status,200,JSON.stringify(done.data));assert.equal(done.data.recovery_codes.length,8);
 assert.equal((await request('/api/auth/mfa/verify','POST',{challenge:first.data.challenge,code:mfa.codeAt(setup.data.secret,Date.now())})).status,401,'Challenge cannot be reused');
 return {cookie:done.cookie,csrf:done.data.csrf};
}
test('SUDERN complete workflow on separate PostgreSQL database',async()=>{
 await migrate();db=await getDb();
 const existing=await db.prepare('SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM audit) AS events, (SELECT COUNT(*) FROM applications) AS applications').get();
 assert.deepEqual(existing,{users:0,events:0,applications:0},'Refusing to run PostgreSQL workflow unless test database is empty');
 const instance=await start(0);server=instance.server;host='http://127.0.0.1:'+instance.port;
 try{
  const health=await request('/api/health');assert.equal(health.status,200);assert.equal(health.data.schema_version,2);
  for(const role of ['admin','director','finance_officer','programme_officer','mel_officer','viewer'])await createStaff(role);
  const auth={};for(const role of Object.keys(people))auth[role]=await sign(role);
  // Fresh password challenge cannot reuse the TOTP already consumed during this time-step.
  const replayLogin=await request('/api/auth/login','POST',{email:people.admin.email,password:pass});
  assert.equal(replayLogin.status,202);
  const replayStep=await request('/api/auth/mfa/verify','POST',{challenge:replayLogin.data.challenge,code:mfa.codeAt(mfa.open((await db.prepare('SELECT mfa_secret_enc,mfa_last_step FROM users WHERE id=?').get(people.admin.id)).mfa_secret_enc), (await db.prepare('SELECT mfa_last_step FROM users WHERE id=?').get(people.admin.id)).mfa_last_step*30000)});
  assert.equal(replayStep.status,401,'Consumed TOTP must not create another session');
  assert.equal((await request('/api/dashboard')).status,401);
  assert.equal((await request('/api/dashboard','GET',undefined,auth.viewer)).status,200);
  const cohort=await request('/api/cohorts','POST',{programme_id:'tech',name:'Isolated Tech Cohort',capacity:1},auth.programme_officer);assert.equal(cohort.status,201,JSON.stringify(cohort.data));
  const app=await request('/api/public/applications','POST',{programme_id:'tech',applicant_name:'Synthetic Participant',applicant_email:'participant@sudern-test.invalid',motivation:'Isolated workflow, no real person',consent:true});assert.equal(app.status,201);
  assert.equal((await request(`/api/applications/${app.data.id}`,'PATCH',{status:'approved'},auth.programme_officer)).status,200);
  const participant=await request('/api/participants','POST',{application_id:app.data.id,cohort_id:cohort.data.id},auth.programme_officer);assert.equal(participant.status,201);
  assert.equal((await request('/api/participants','POST',{application_id:app.data.id,cohort_id:cohort.data.id},auth.programme_officer)).status,409);
  const assessments=await request('/api/assessments','POST',{participant_id:participant.data.id,kind:'baseline',score:40,evidence_url:'https://example.invalid/evidence',assessed_at:'2026-11-15'},auth.mel_officer);assert.equal(assessments.status,201);
  const f=await request('/api/funds','POST',{name:'SYNTHETIC only',source_ref:'https://example.invalid/source',received_mwk:500000,restricted_programme_id:'tech'},auth.finance_officer);assert.equal(f.status,201,JSON.stringify(f.data));
  const expense={fund_id:f.data.id,programme_id:'tech',amount_mwk:300000,purpose:'Synthetic material expense',proof_url:'https://example.invalid/evidence'};
  const e1=await request('/api/expenses','POST',expense,auth.programme_officer),e2=await request('/api/expenses','POST',expense,auth.programme_officer);
  assert.equal(e1.status,201);assert.equal(e2.status,201);
  assert.equal((await request(`/api/expenses/${e1.data.id}/pay`,'POST',{payment_ref:'https://example.invalid/pay'},auth.finance_officer)).status,409);
  assert.equal((await request(`/api/expenses/${e1.data.id}/approve`,'POST',{},auth.finance_officer)).status,200);
  assert.equal((await request(`/api/expenses/${e2.data.id}/approve`,'POST',{},auth.finance_officer)).status,200);
  const parallel=await Promise.all([request(`/api/expenses/${e1.data.id}/approve`,'POST',{},auth.director),request(`/api/expenses/${e2.data.id}/approve`,'POST',{},auth.director)]);
  assert.deepEqual(parallel.map(x=>x.status).sort(),[200,409],'Only one full allocation under same fund');
  const winning=parallel[0].status===200?e1:e2;assert.equal((await request(`/api/expenses/${winning.data.id}/pay`,'POST',{payment_ref:'https://example.invalid/payment'},auth.finance_officer)).status,200);
  const fd=await request('/api/funds','GET',undefined,auth.finance_officer);assert.equal(fd.data.items.find(x=>x.id===f.data.id).available_mwk,200000);
  const evidence=await request('/api/evidence','POST',{title:'Synthetic evidence',entity_type:'programme',entity_id:'tech',source_url:'https://example.invalid/evidence'},auth.mel_officer);assert.equal(evidence.status,201);
  assert.equal((await request(`/api/evidence/${evidence.data.id}/review`,'POST',{status:'verified'},auth.mel_officer)).status,409);
  assert.equal((await request(`/api/evidence/${evidence.data.id}/review`,'POST',{status:'verified'},auth.director)).status,200);
  const governance=await request('/api/governance','POST',{title:'Isolated review',category:'risk'},auth.director);assert.equal(governance.status,201);
  assert.equal((await request(`/api/governance/${governance.data.id}/approve`,'POST',{resolution:'Test-only approval',evidence_url:'https://example.invalid/gov'},auth.director)).status,200);
  const indicator=await request('/api/indicators','POST',{code:'ISOLATED-SKILLS',name:'Technical skill improvement',unit:'points',programme_id:'tech',baseline:40,target:75},auth.mel_officer);assert.equal(indicator.status,201);
  assert.equal((await request('/api/observations','POST',{indicator_id:indicator.data.id,value:60,observed_at:'2026-11-15',evidence_url:'https://example.invalid/obs'},auth.mel_officer)).status,201);
  const auditRead=await request('/api/audit','GET',undefined,auth.admin);assert.equal(auditRead.data.integrity.ok,true);
  assert.equal((await verifyAudit(db)).ok,true);
  console.log('PASS (when executed): PostgreSQL isolated application → enrollment → M&E → finance lock → governance → audit');
 }finally{server?.close();await db?.close()}
});
}
