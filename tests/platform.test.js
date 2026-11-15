'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sudern-verification-'));
process.env.DATABASE_PATH=path.join(temp,'test.db');process.env.INTAKE_ENABLED='true';
process.env.HOST='127.0.0.1';
const {start}=require('../src/server');const {hashPassword}=require('../src/security');
const {getDb,id,now,transaction,audit,verifyAudit}=require('../src/db');
let server,base,db;const users={};
const password='Test-Only-Long-Password-2026';
function user(role){const uid=id('user'),em=`${role}@tests.invalid`,name=role.replace('_',' '),{hash,salt}=hashPassword(password);db.prepare('INSERT INTO users(id,name,email,pass_hash,salt,role,active,created_at) VALUES(?,?,?,?,?,?,?,?)').run(uid,name,em,hash,salt,role,1,now());users[role]={id:uid,email:em};}
async function request(path,method='GET',payload,identity,headers={}){
 const h={...headers};if(payload!==undefined)h['Content-Type']='application/json';if(identity){h.Cookie=identity.cookie;if(method!=='GET'&&!('X-CSRF-Token' in h))h['X-CSRF-Token']=identity.csrf;}
 const result=await fetch(base+path,{method,headers:h,body:payload===undefined?undefined:JSON.stringify(payload)});
 const txt=await result.text();let data;try{data=JSON.parse(txt)}catch{data=txt}
 return {status:result.status,data,headers:result.headers};
}
async function sign(role){const r=await request('/api/auth/login','POST',{email:users[role].email,password});assert.equal(r.status,200,JSON.stringify(r.data));return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf,...r.data.user};}
const evidenceUrl='https://example.org/evidence/receipt-123';
let admin,director,finance,programme,mel,viewer;
test.before(async()=>{db=getDb();['admin','director','finance_officer','programme_officer','mel_officer','viewer'].forEach(user);const s=await start(0);server=s.server;base=`http://127.0.0.1:${s.port}`;admin=await sign('admin');director=await sign('director');finance=await sign('finance_officer');programme=await sign('programme_officer');mel=await sign('mel_officer');viewer=await sign('viewer');});
test.after(()=>{server?.close();db?.close();fs.rmSync(temp,{recursive:true,force:true});});
test('Public website, portal, application page and health are served',async()=>{
 for(const route of ['/','/portal','/apply','/portal.css','/portal.js','/brand-emblem.webp']){const r=await fetch(base+route);assert.equal(r.status,200,route);assert.ok((await r.arrayBuffer()).byteLength>100)}
 const h=await request('/api/health');assert.equal(h.data.status,'ok');
 const p=await request('/api/public/programmes');assert.equal(p.data.items.length,3);
});
test('Real public contact enquiries are consent-gated, retained, and reviewed by authorised staff',async()=>{
 const contact={name:'Test Contact',organisation:'Synthetic Collective',email:'contact@example.invalid',interest:'Institutional partnership',message:'A synthetic enquiry for integration verification.',consent:true};
 assert.equal((await request('/api/public/enquiries','POST',{...contact,consent:false})).status,422);
 const created=await request('/api/public/enquiries','POST',contact);assert.equal(created.status,201);
 assert.equal((await request('/api/enquiries')).status,401);
 assert.equal((await request('/api/enquiries','GET',undefined,finance)).status,403);
 assert.equal((await request(`/api/enquiries/${created.data.id}`,'PATCH',{status:'under_review'},finance)).status,403);
 assert.equal((await request(`/api/enquiries/${created.data.id}`,'PATCH',{status:'under_review'},programme)).status,200);
 assert.equal((await request(`/api/enquiries/${created.data.id}`,'PATCH',{status:'closed'},programme)).status,200);
 assert.equal((await request(`/api/enquiries/${created.data.id}`,'PATCH',{status:'under_review'},programme)).status,409);
 process.env.INTAKE_ENABLED='false';
 try{assert.equal((await request('/api/public/enquiries','POST',contact)).status,503)}finally{process.env.INTAKE_ENABLED='true'}
});
test('Security: unauthenticated access, wrong role, CSRF, bad login and input validation denied',async()=>{
 assert.equal((await request('/api/dashboard')).status,401);
 assert.equal((await request('/api/funds','POST',{name:'Wrong',source_ref:evidenceUrl,received_mwk:10},viewer)).status,403);
 assert.equal((await request('/api/governance','POST',{title:'No',category:'policy'},director,{'X-CSRF-Token':'incorrect'})).status,403);
 assert.equal((await request('/api/dashboard','GET',undefined,viewer,{Origin:'https://unauthorised.example'})).status,403);
 assert.equal((await request('/api/auth/login','POST',{email:'admin@tests.invalid',password:'wrongpass'})).status,401);
 assert.equal((await request('/api/funds','POST',{name:'Wrong scheme',source_ref:'javascript:alert(1)',received_mwk:500},finance)).status,422);
});
test('Application intake, review, capacity-limited enrolment, assessments',async()=>{
 const cohort=await request('/api/cohorts','POST',{programme_id:'tech',name:'Sandbox TECH-01',capacity:1,start_date:'2026-11-15',end_date:'2026-12-15'},programme);assert.equal(cohort.status,201);
 const publicForm={programme_id:'tech',applicant_name:'Test Participant One',applicant_email:'test-one@example.invalid',phone:'',motivation:'Synthetic test record, not an actual applicant.',consent:true};
 assert.equal((await request('/api/public/applications','POST',{...publicForm,consent:false})).status,422);
 const submitted=await request('/api/public/applications','POST',publicForm);assert.equal(submitted.status,201);const appId=submitted.data.id;
 assert.equal((await request(`/api/applications/${appId}`,'PATCH',{status:'approved'},viewer)).status,403);
 assert.equal((await request(`/api/applications/${appId}`,'PATCH',{status:'approved'},programme)).status,200);
 assert.equal((await request('/api/participants','POST',{application_id:appId,cohort_id:cohort.data.id},programme)).status,201);
 assert.equal((await request('/api/participants','POST',{application_id:appId,cohort_id:cohort.data.id},programme)).status,409);
 const two=await request('/api/public/applications','POST',{...publicForm,applicant_name:'Test Participant Two',applicant_email:'test-two@example.invalid'});assert.equal(two.status,201);
 assert.equal((await request(`/api/applications/${two.data.id}`,'PATCH',{status:'approved'},programme)).status,200);
 assert.equal((await request('/api/participants','POST',{application_id:two.data.id,cohort_id:cohort.data.id},programme)).status,409);
 const p=(await request('/api/participants','GET',undefined,mel)).data.items[0];
 assert.equal((await request('/api/assessments','POST',{participant_id:p.id,kind:'baseline',score:105,assessed_at:'2026-11-15',evidence_url:evidenceUrl},mel)).status,422);
 assert.equal((await request('/api/assessments','POST',{participant_id:p.id,kind:'baseline',score:45,assessed_at:'2026-11-15',evidence_url:evidenceUrl},mel)).status,201);
});
test('Finance: donor restrictions, dual approvals, no self-approval, budget guard, payment evidence',async()=>{
 const f=await request('/api/funds','POST',{name:'SANDBOX - Tech grant',source_ref:evidenceUrl,received_mwk:500000,restricted_programme_id:'tech'},finance);assert.equal(f.status,201);
 const fund_id=f.data.id;
 const expense={fund_id,programme_id:'tech',amount_mwk:300000,purpose:'Synthetic training material purchase',proof_url:evidenceUrl};
 assert.equal((await request('/api/expenses','POST',{...expense,programme_id:'chuma'},programme)).status,409);
 const e=await request('/api/expenses','POST',expense,programme);assert.equal(e.status,201);
 assert.equal((await request(`/api/expenses/${e.data.id}/pay`,'POST',{payment_ref:evidenceUrl},finance)).status,409);
 assert.equal((await request(`/api/expenses/${e.data.id}/approve`,'POST',{},finance)).data.status,'requested');
 assert.equal((await request(`/api/expenses/${e.data.id}/approve`,'POST',{},finance)).status,409);
 const approved=await request(`/api/expenses/${e.data.id}/approve`,'POST',{},director);assert.equal(approved.status,200);assert.equal(approved.data.status,'approved');
 assert.equal((await request(`/api/expenses/${e.data.id}/pay`,'POST',{payment_ref:evidenceUrl},finance)).status,200);
 const fBalance=(await request('/api/funds','GET',undefined,finance)).data.items[0];assert.equal(fBalance.available_mwk,200000);assert.equal(fBalance.paid_mwk,300000);
 const e2=await request('/api/expenses','POST',{...expense,amount_mwk:240000},programme);assert.equal(e2.status,201);
 assert.equal((await request(`/api/expenses/${e2.data.id}/approve`,'POST',{},finance)).status,200);
 assert.equal((await request(`/api/expenses/${e2.data.id}/approve`,'POST',{},director)).status,409);
 assert.equal((await request('/api/funds','GET',undefined,finance)).data.items[0].available_mwk,200000);
 const e3=await request('/api/expenses','POST',{...expense,amount_mwk:10000},director);assert.equal(e3.status,201);
 assert.equal((await request(`/api/expenses/${e3.data.id}/approve`,'POST',{},director)).status,409);
});
test('Evidence self-verification denied; independent review and governance decision approval',async()=>{
 const e=await request('/api/evidence','POST',{title:'Synthetic project evidence',entity_type:'programme',entity_id:'tech',source_url:evidenceUrl},mel);assert.equal(e.status,201);
 assert.equal((await request(`/api/evidence/${e.data.id}/review`,'POST',{status:'verified'},mel)).status,409);
 assert.equal((await request(`/api/evidence/${e.data.id}/review`,'POST',{status:'verified'},director)).status,200);
 const g=await request('/api/governance','POST',{title:'Test risk response',category:'risk',resolution:'Approve a sandbox action only'},director);assert.equal(g.status,201);
 assert.equal((await request(`/api/governance/${g.data.id}/approve`,'POST',{resolution:'Approved sandbox risk response',evidence_url:evidenceUrl},director)).status,200);
});
test('Outcomes, public community visibility and role limits',async()=>{
 const i=await request('/api/indicators','POST',{code:'SANDBOX-1',name:'Test skills improvement',unit:'points',programme_id:'tech',baseline:10,target:40},mel);assert.equal(i.status,201);
 assert.equal((await request('/api/observations','POST',{indicator_id:i.data.id,value:28,observed_at:'2026-11-15',evidence_url:evidenceUrl},mel)).status,201);
 const o=await request('/api/opportunities','POST',{title:'Test volunteer pairing',category:'volunteer',description:'Synthetic opportunity not open to the public'},programme);assert.equal(o.status,201);
 assert.equal((await request('/api/public/opportunities')).data.items.length,0);
 assert.equal((await request(`/api/opportunities/${o.data.id}`,'PATCH',{status:'active'},programme)).status,403);
 assert.equal((await request(`/api/opportunities/${o.data.id}`,'PATCH',{status:'active'},director)).status,200);
 assert.equal((await request('/api/public/opportunities')).data.items.length,1);
 const dashboard=await request('/api/dashboard','GET',undefined,viewer);assert.equal(dashboard.status,200);assert.equal(dashboard.data.counts.participants,1);
});
test('Durable SQLite backup can be restored to a clean target and audit-verified',async()=>{
 const {backup,DatabaseSync}=require('node:sqlite');
 const target=path.join(temp,'restored-backup.db');
 await backup(db,target);
 const restored=new DatabaseSync(target);restored.exec('PRAGMA foreign_keys=ON');
 assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM participants').get().n,1);
 assert.equal(verifyAudit(restored).ok,true);restored.close();
});
test('Audit chain is append-only and verifiable',async()=>{
 const a=await request('/api/audit','GET',undefined,admin);assert.equal(a.status,200);assert.equal(a.data.integrity.ok,true);assert.ok(a.data.integrity.count>12);
 assert.throws(()=>db.prepare('DELETE FROM audit WHERE seq=1').run(),/audit records cannot be deleted/);
 assert.throws(()=>db.prepare("UPDATE audit SET action='changed' WHERE seq=1").run(),/audit records cannot be updated/);
 assert.equal(verifyAudit(db).ok,true);
});
