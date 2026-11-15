'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {URL}=require('node:url');
const {getDb,now,id,audit,transaction,verifyAudit}=require('./pg-db');
const {hashPassword,checkPassword,createSession,readSession,cookie,clearCookie,isAllowedOrigin}=require('./pg-security');
const crypto=require('node:crypto');
const mfa=require('./mfa');
const root=path.join(__dirname,'..','public');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
const loginAttempts=new Map(),intakeAttempts=new Map();
class HttpError extends Error {constructor(status,msg){super(msg);this.status=status;}}
const fail=(s,msg)=>{throw new HttpError(s,msg)};
function str(v,label,max=180){ if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(422,`${label} is required (max ${max} characters)`);return v.trim(); }
function optional(v,max=500){if(v==null||v==='')return ''; if(typeof v!=='string'||v.length>max)fail(422,`Text exceeds ${max} characters`);return v.trim();}
function oneOf(v,allowed,label){if(!allowed.includes(v))fail(422,`Invalid ${label}`);return v;}
function number(v,label,min=0,max=1e12){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(422,`Invalid ${label}`);return v;}
function whole(v,label,min=0,max=1e12){if(!Number.isSafeInteger(v)||v<min||v>max)fail(422,`Invalid ${label}`);return v;}
function email(v){const e=str(v,'Email',200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))fail(422,'Enter a valid email');return e;}
function ref(v,label='Evidence URL'){const s=str(v,label,500);let url;try{url=new URL(s)}catch{fail(422,`${label} must be an HTTPS link`)}if(url.protocol!=='https:'||url.username||url.password)fail(422,`${label} must use HTTPS`);return s;}
function date(v,label='Date'){ const s=str(v,label,40);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail(422,`Invalid ${label}`);return s; }
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'Use Content-Type: application/json');
 if(req.body!==undefined){if(req.body&&typeof req.body==='object'&&!Array.isArray(req.body)&&JSON.stringify(req.body).length<=100_000)return req.body; if(typeof req.body==='string'){try{const x=JSON.parse(req.body);if(x&&typeof x==='object'&&!Array.isArray(x))return x}catch{}} fail(400,'Malformed JSON');}
 let chunks=[],size=0;for await(const x of req){size+=x.length;if(size>100_000)fail(413,'Request too large');chunks.push(x)}
 try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!result||Array.isArray(result)||typeof result!=='object')throw Error();return result}catch{fail(400,'Malformed JSON')}
}
function roles(session,...allowed){if(!session)fail(401,'Sign in required');if(!allowed.includes(session.role))fail(403,'Insufficient permissions');}
function throttle(req,store,limit=12,windowMs=15*60_000){
 const key=(req.socket.remoteAddress||'unknown');const t=Date.now(),item=store.get(key)||{n:0,since:t};
 if(t-item.since>windowMs){item.n=0;item.since=t}item.n++;store.set(key,item);
 if(item.n>limit)fail(429,'Too many attempts. Please try again later.');
 if(store.size>5000) for(const [k,v] of store) if(t-v.since>windowMs)store.delete(k);
}
const get=async(db,sql,...args)=>await db.prepare(sql).get(...args);
const all=async(db,sql,...args)=>await db.prepare(sql).all(...args);
async function requireRow(db,table,entityId){const valid=['programmes','applications','enquiries','cohorts','participants','funds','expenses','indicators','governance','evidence','opportunities','users'];if(!valid.includes(table))fail(500,'Invalid table');const r=(await get(db,`SELECT * FROM ${table} WHERE id=?`,entityId));if(!r)fail(404,'Record not found');return r;}
async function fundingSummary(db){return (await all(db,`SELECT f.id,f.name,f.received_mwk,f.restricted_programme_id,f.status,
 COALESCE((SELECT SUM(e.amount_mwk) FROM expenses e WHERE e.fund_id=f.id AND e.status IN ('approved','paid')),0) AS allocated_mwk,
 COALESCE((SELECT SUM(e.amount_mwk) FROM expenses e WHERE e.fund_id=f.id AND e.status='paid'),0) AS paid_mwk FROM funds f ORDER BY f.created_at DESC`)).map(f=>({...f,available_mwk:f.received_mwk-f.allocated_mwk}));}
async function handleApi(db,req,res,url,requestBody,session){
 const pathname=url.pathname,method=req.method;
 const B=requestBody||{};
 if(pathname==='/api/health'&&method==='GET'){
  const schema=await get(db,"SELECT to_regclass('public.schema_migrations') AS table_name, to_regclass('public.users') AS users_table");
  if(!schema.table_name||!schema.users_table)return json(res,503,{status:'uninitialized',service:'sudern-platform',production_authorized:false});
  const version=await get(db,'SELECT version FROM schema_migrations WHERE version=2');
  if(!version)return json(res,503,{status:'migration_pending',service:'sudern-platform',production_authorized:false});
  return json(res,200,{status:'ok',service:'sudern-platform',database:'postgresql',schema_version:version.version,commit_sha:process.env.VERCEL_GIT_COMMIT_SHA||null,production_authorized:false,time:now()});
 }
 if(pathname==='/api/public/config'&&method==='GET')return json(res,200,{intake_enabled:process.env.INTAKE_ENABLED==='true',environment:process.env.NODE_ENV==='production'?'production':'local'});
 if(pathname==='/api/public/programmes'&&method==='GET')return json(res,200,{items:(await all(db,'SELECT id,code,name,focus,description,state FROM programmes ORDER BY CASE id WHEN \'tech\' THEN 1 WHEN \'finance\' THEN 2 ELSE 3 END'))});
 if(pathname==='/api/public/opportunities'&&method==='GET')return json(res,200,{items:(await all(db,"SELECT id,category,title,description FROM opportunities WHERE status='active' ORDER BY created_at DESC LIMIT 30"))});
 if(pathname==='/api/public/applications'&&method==='POST'){
  if(process.env.INTAKE_ENABLED!=='true')fail(503,'Programme applications are not currently open');
  throttle(req,intakeAttempts,6,60*60_000);
  if(B.website)fail(400,'Invalid submission');
  const programme=(await requireRow(db,'programmes',str(B.programme_id,'Programme ID',30)));
  if(programme.state==='completed'||programme.state==='paused')fail(409,'Programme is not accepting expressions of interest');
  const name=str(B.applicant_name,'Applicant name',120),em=email(B.applicant_email),motivation=str(B.motivation,'Motivation',2000),phone=optional(B.phone,50);
  if(B.consent!==true)fail(422,'Explicit consent is required');
  const entityId=id('app'),t=now();
  await transaction(db,async()=>{await db.prepare('INSERT INTO applications(id,programme_id,applicant_name,applicant_email,phone,motivation,consent,status,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(entityId,programme.id,name,em,phone,motivation,1,'submitted','public',t,t);await audit(db,null,'application.submitted','application',entityId,{programme_id:programme.id,source:'public'});});
  return json(res,201,{id:entityId,status:'submitted',message:'Expression of interest recorded. This is not a place confirmation.'});
 }
 if(pathname==='/api/public/enquiries'&&method==='POST'){
  if(process.env.INTAKE_ENABLED!=='true')fail(503,'Enquiry intake is closed until approved data procedures exist');
  throttle(req,intakeAttempts,6,60*60_000);
  if(B.website)fail(400,'Invalid submission');
  const name=str(B.name,'Contact name',120),organisation=optional(B.organisation,150),em=email(B.email),message=str(B.message,'Enquiry details',2000);
  const interest=oneOf(B.interest,['Tech Forge / technical training','Financial Academy','ChumaLab / enterprise incubation','Governance and accountability','Institutional partnership','Volunteering or mentorship','Community project'],'interest area');
  if(B.consent!==true)fail(422,'Explicit contact consent is required');
  const entityId=id('enquiry'),t=now();
  await transaction(db,async()=>{await db.prepare('INSERT INTO enquiries(id,contact_name,organisation,contact_email,interest,message,consent,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(entityId,name,organisation,em,interest,message,1,'new',t,t);await audit(db,null,'enquiry.submitted','enquiry',entityId,{area:interest});});
  return json(res,201,{id:entityId,status:'new',message:'Enquiry received for review. No partnership, placement or funding is confirmed.'});
 }
 if(pathname==='/api/auth/login'&&method==='POST'){
  throttle(req,loginAttempts,15);
  const em=email(B.email),password=String(B.password||'');
  const authKey=crypto.createHash('sha256').update('auth:'+em).digest('hex');
  const resetAt=new Date(Date.now()+15*60000).toISOString(),clock=now();
  const attempts=await get(db,`INSERT INTO auth_attempts(key,attempts,reset_at,updated_at) VALUES(?,1,?,?)
   ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.reset_at < ? THEN 1 ELSE auth_attempts.attempts+1 END,
    reset_at=CASE WHEN auth_attempts.reset_at < ? THEN ? ELSE auth_attempts.reset_at END,updated_at=?
   RETURNING attempts`,authKey,resetAt,clock,clock,clock,resetAt,clock);
  if(attempts.attempts>12)fail(429,'Authentication temporarily limited; retry later');
  const user=(await get(db,'SELECT * FROM users WHERE email=? AND active=1',em));
  const valid=user?checkPassword(password,user.salt,user.pass_hash):checkPassword(password,'0123456789abcdef0123456789abcdef', '00'.repeat(64));
  if(!valid)fail(401,'Invalid email or password');
  if(mfa.isPrivileged(user.role)){
   // Fail closed if encryption material is not configured. No password-only privileged session.
   mfa.key();
   const token=crypto.randomBytes(32).toString('base64url');
   const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
   await transaction(db,async()=>{
    await db.prepare('DELETE FROM mfa_challenges WHERE user_id=?').run(user.id);
    await db.prepare('INSERT INTO mfa_challenges(challenge_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(tokenHash,user.id,new Date(Date.now()+5*60000).toISOString(),now());
    await audit(db,user.id,'auth.mfa.challenge','user',user.id,{});
   });
   return json(res,202,{mfa_required:true,enrollment_required:user.mfa_confirmed!==1,challenge:token});
  }
  const created=(await createSession(db,user,false));
  await db.prepare('DELETE FROM auth_attempts WHERE key=?').run(authKey);
  await audit(db,user.id,'auth.login','user',user.id,{mfa:false});
  res.setHeader('Set-Cookie',cookie(created.token,process.env.NODE_ENV==='production'));
  return json(res,200,{user:{id:user.id,name:user.name,email:user.email,role:user.role},csrf:created.csrf});
 }
 if(pathname==='/api/auth/mfa/setup'&&method==='POST'){
  throttle(req,loginAttempts,20);
  mfa.key();
  const challenge=str(B.challenge,'Challenge',200);
  const hash=crypto.createHash('sha256').update(challenge).digest('hex');
  const result=await transaction(db,async()=>{
   const row=await get(db,'SELECT c.*,u.email,u.mfa_confirmed FROM mfa_challenges c JOIN users u ON u.id=c.user_id WHERE c.challenge_hash=? AND c.expires_at>? FOR UPDATE',hash,now());
   if(!row||row.attempts>=5)fail(401,'Expired or invalid authentication challenge');
   if(row.mfa_confirmed===1)fail(409,'Authenticator already enrolled');
   const secret=row.pending_secret_enc?mfa.open(row.pending_secret_enc):mfa.newSecret();
   if(!row.pending_secret_enc)await db.prepare('UPDATE mfa_challenges SET pending_secret_enc=? WHERE challenge_hash=?').run(mfa.seal(secret),hash);
   return {secret,otpauth_uri:mfa.uri(secret,row.email)};
  });
  return json(res,200,result);
 }
 if(pathname==='/api/auth/mfa/verify'&&method==='POST'){
  throttle(req,loginAttempts,25);
  mfa.key();
  const challenge=str(B.challenge,'Challenge',200),code=str(B.code,'Verification code',100);
  const hash=crypto.createHash('sha256').update(challenge).digest('hex');
  const outcome=await transaction(db,async()=>{
   const record=await get(db,`SELECT c.*,u.email,u.name,u.role,u.active,u.mfa_confirmed,u.mfa_secret_enc,u.mfa_recovery_hashes,u.mfa_last_step
     FROM mfa_challenges c JOIN users u ON u.id=c.user_id WHERE c.challenge_hash=? AND c.expires_at>? FOR UPDATE`,hash,now());
   if(!record||record.attempts>=5||record.active!==1||!mfa.isPrivileged(record.role))return {error:'Expired or invalid authentication challenge'};
   const secret=record.mfa_confirmed===1?mfa.open(record.mfa_secret_enc):(record.pending_secret_enc?mfa.open(record.pending_secret_enc):null);
   const step=secret?mfa.matchingStep(secret,code):null;
   let valid=step!==null && (record.mfa_last_step===null||record.mfa_last_step===undefined||step>record.mfa_last_step),recovery=false,hashes=[];
   if(!valid&&record.mfa_confirmed===1){
    hashes=JSON.parse(record.mfa_recovery_hashes||'[]');const used=mfa.verifyRecovery(code,hashes);
    if(used>=0){hashes.splice(used,1);valid=true;recovery=true}
   }
   if(!valid){await db.prepare('UPDATE mfa_challenges SET attempts=attempts+1 WHERE challenge_hash=?').run(hash);return {error:'Invalid authenticator code'};}
   let codes;
   if(record.mfa_confirmed!==1){
    codes=Array.from({length:8},()=>mfa.recoveryCode());
    await db.prepare('UPDATE users SET mfa_secret_enc=?,mfa_confirmed=1,mfa_recovery_hashes=?,mfa_last_step=? WHERE id=?').run(mfa.seal(secret),JSON.stringify(codes.map(mfa.hashRecovery)),step,record.user_id);
   } else if(recovery){await db.prepare('UPDATE users SET mfa_recovery_hashes=? WHERE id=?').run(JSON.stringify(hashes),record.user_id)}
   else {await db.prepare('UPDATE users SET mfa_last_step=? WHERE id=?').run(step,record.user_id)}
   await db.prepare('DELETE FROM mfa_challenges WHERE challenge_hash=?').run(hash);
   await db.prepare('DELETE FROM auth_attempts WHERE key=?').run(crypto.createHash('sha256').update('auth:'+record.email).digest('hex'));
   const user={id:record.user_id,name:record.name,email:record.email,role:record.role};
   const session=await createSession(db,user,true);
   await audit(db,user.id,'auth.login','user',user.id,{mfa:true,recovery});
   return {user,csrf:session.csrf,token:session.token,recovery_codes:codes||undefined};
  });
  if(outcome.error)fail(401,outcome.error);
  res.setHeader('Set-Cookie',cookie(outcome.token,process.env.NODE_ENV==='production'));
  delete outcome.token;
  return json(res,200,outcome);
 }
 if(pathname==='/api/auth/me'&&method==='GET'){
  if(!session)fail(401,'Sign in required');
  return json(res,200,{user:{id:session.uid,name:session.name,email:session.email,role:session.role},csrf:session.csrf,expires_at:session.expires_at});
 }
 if(pathname==='/api/auth/logout'&&method==='POST'){
  if(session)await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash);
  res.setHeader('Set-Cookie',clearCookie(process.env.NODE_ENV==='production'));
  return json(res,200,{ok:true});
 }
 if(!session)fail(401,'Sign in required');
 if(pathname==='/api/dashboard'&&method==='GET'){
  const counts={applications:(await get(db,'SELECT COUNT(*) AS n FROM applications')).n,pending:(await get(db,"SELECT COUNT(*) AS n FROM applications WHERE status IN ('submitted','under_review')")).n,
   participants:(await get(db,'SELECT COUNT(*) AS n FROM participants')).n, enquiries:(await get(db,"SELECT COUNT(*) AS n FROM enquiries WHERE status!='closed'")).n, cohorts:(await get(db,'SELECT COUNT(*) AS n FROM cohorts')).n,
   open_expenses:(await get(db,"SELECT COUNT(*) AS n FROM expenses WHERE status='requested'")).n,
   evidence_pending:(await get(db,"SELECT COUNT(*) AS n FROM evidence WHERE status='pending'")).n,
   governance_pending:(await get(db,"SELECT COUNT(*) AS n FROM governance WHERE status='proposed'")).n,
   indicators:(await get(db,'SELECT COUNT(*) AS n FROM indicators')).n};
  const funding=(await fundingSummary(db));
  const programmes=(await all(db,`SELECT p.id,p.name,p.focus,p.state,
    (SELECT COUNT(*) FROM applications a WHERE a.programme_id=p.id) AS applications,
    (SELECT COUNT(*) FROM participants t WHERE t.programme_id=p.id) AS participants,
    (SELECT COUNT(*) FROM cohorts c WHERE c.programme_id=p.id) AS cohorts FROM programmes p ORDER BY p.code`));
  const months=(await all(db,"SELECT substr(created_at,1,7) AS month,COUNT(*) AS count FROM applications GROUP BY substr(created_at,1,7) ORDER BY month DESC LIMIT 8")).reverse();
  const activity=(await all(db,'SELECT action,entity_type,entity_id,occurred_at FROM audit ORDER BY seq DESC LIMIT 8'));
  return json(res,200,{counts,programmes,funding:{received:funding.reduce((s,x)=>s+x.received_mwk,0),allocated:funding.reduce((s,x)=>s+x.allocated_mwk,0),paid:funding.reduce((s,x)=>s+x.paid_mwk,0),available:funding.reduce((s,x)=>s+x.available_mwk,0)},months,activity,readiness:{level:'POSTGRES PREVIEW — UNVERIFIED',sandbox:process.env.SANDBOX==='true',production_certified:false,note:'Local runtime validation does not certify public launch, legal compliance, live payments, backups or production identity.'}});
 }
 if(pathname==='/api/programmes'&&method==='GET')return json(res,200,{items:(await all(db,`SELECT p.*,(SELECT COUNT(*) FROM applications a WHERE a.programme_id=p.id) AS applications,(SELECT COUNT(*) FROM participants t WHERE t.programme_id=p.id) AS participants FROM programmes p ORDER BY p.name`))});
 let m=pathname.match(/^\/api\/programmes\/([^/]+)$/);
 if(m&&method==='PATCH'){
  roles(session,'admin','director');const p=(await requireRow(db,'programmes',m[1]));const state=oneOf(B.state,['planned','active','paused','completed'],'state');
  await transaction(db,async()=>{await db.prepare('UPDATE programmes SET state=? WHERE id=?').run(state,p.id);await audit(db,session.uid,'programme.state','programme',p.id,{from:p.state,to:state});});return json(res,200,{ok:true});
 }
 if(pathname==='/api/cohorts'&&method==='GET')return json(res,200,{items:(await all(db,'SELECT c.*,p.name AS programme FROM cohorts c JOIN programmes p ON p.id=c.programme_id ORDER BY c.created_at DESC'))});
 if(pathname==='/api/cohorts'&&method==='POST'){
  roles(session,'admin','director','programme_officer');const p=(await requireRow(db,'programmes',str(B.programme_id,'Programme ID',30))),cid=id('coh');
  const name=str(B.name,'Cohort name',150),cap=whole(B.capacity,'Capacity',1,100000);
  const start=B.start_date?date(B.start_date,'Start date'):null,end=B.end_date?date(B.end_date,'End date'):null;
  if(start&&end&&end<start)fail(422,'End date precedes start date');
  await transaction(db,async()=>{await db.prepare('INSERT INTO cohorts(id,programme_id,name,capacity,start_date,end_date,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(cid,p.id,name,cap,start,end,'planned',now());await audit(db,session.uid,'cohort.created','cohort',cid,{programme_id:p.id,capacity:cap});});return json(res,201,{id:cid});
 }
 if(pathname==='/api/applications'&&method==='GET'){
  roles(session,'admin','director','programme_officer','mel_officer','viewer');
  return json(res,200,{items:(await all(db,'SELECT a.*,p.name AS programme FROM applications a JOIN programmes p ON p.id=a.programme_id ORDER BY a.created_at DESC LIMIT 500'))});
 }
 m=pathname.match(/^\/api\/applications\/([^/]+)$/);
 if(m&&method==='PATCH'){
  roles(session,'admin','director','programme_officer');
  const status=oneOf(B.status,['under_review','approved','rejected'],'application state');
  const transitions={submitted:['under_review','approved','rejected'],under_review:['approved','rejected'],approved:[],rejected:[],enrolled:[]};
  await transaction(db,async()=>{
   const app=await get(db,'SELECT * FROM applications WHERE id=? FOR UPDATE',m[1]);
   if(!app)fail(404,'Application not found');
   if(!transitions[app.status]?.includes(status))fail(409,'Invalid application transition');
   await db.prepare('UPDATE applications SET status=?,updated_at=? WHERE id=?').run(status,now(),app.id);
   await audit(db,session.uid,'application.review','application',app.id,{from:app.status,to:status});
  });return json(res,200,{ok:true});
 }
 if(pathname==='/api/participants'&&method==='GET'){
  roles(session,'admin','director','programme_officer','mel_officer','viewer');
  return json(res,200,{items:(await all(db,`SELECT t.*,p.name AS programme,c.name AS cohort FROM participants t JOIN programmes p ON p.id=t.programme_id LEFT JOIN cohorts c ON c.id=t.cohort_id ORDER BY t.created_at DESC LIMIT 500`))});
 }
 if(pathname==='/api/participants'&&method==='POST'){
  roles(session,'admin','director','programme_officer');const app=(await requireRow(db,'applications',str(B.application_id,'Application',40)));
  const cohort=(await requireRow(db,'cohorts',str(B.cohort_id,'Cohort',40)));
  if(app.status!=='approved')fail(409,'Only approved applications can be enrolled');
  if(cohort.programme_id!==app.programme_id)fail(409,'Cohort and programme do not match');
  if(cohort.status==='completed'||cohort.status==='cancelled')fail(409,'Cohort is not open');
  const uid=id('part');
  await transaction(db,async()=>{
   const locked=await get(db,'SELECT id,capacity,status FROM cohorts WHERE id=? FOR UPDATE',cohort.id);
   if(locked.status==='completed'||locked.status==='cancelled')fail(409,'Cohort is closed');
   const n=(await get(db,'SELECT COUNT(*) AS n FROM participants WHERE cohort_id=? AND status!=?',cohort.id,'withdrawn')).n;
   if(n>=locked.capacity)fail(409,'Cohort capacity exceeded');
   await db.prepare('INSERT INTO participants(id,application_id,programme_id,cohort_id,name,email,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(uid,app.id,app.programme_id,cohort.id,app.applicant_name,app.applicant_email,'active',now());
   await db.prepare("UPDATE applications SET status='enrolled',updated_at=? WHERE id=?").run(now(),app.id);
   await audit(db,session.uid,'participant.enrolled','participant',uid,{application_id:app.id,cohort_id:cohort.id});
  });return json(res,201,{id:uid});
 }
 m=pathname.match(/^\/api\/participants\/([^/]+)$/);
 if(m&&method==='PATCH'){
  roles(session,'admin','director','programme_officer');
  const next=oneOf(B.status,['completed','withdrawn'],'status');
  await transaction(db,async()=>{
   const part=await get(db,'SELECT * FROM participants WHERE id=? FOR UPDATE',m[1]);
   if(!part)fail(404,'Participant not found');
   if(part.status!=='active')fail(409,'Participant not active');
   await db.prepare('UPDATE participants SET status=? WHERE id=?').run(next,part.id);
   await audit(db,session.uid,'participant.status','participant',part.id,{from:part.status,to:next});
  });return json(res,200,{ok:true});
 }
 if(pathname==='/api/assessments'&&method==='GET'){
  roles(session,'admin','director','programme_officer','mel_officer','viewer');return json(res,200,{items:(await all(db,'SELECT a.*,p.name AS participant_name FROM assessments a JOIN participants p ON p.id=a.participant_id ORDER BY assessed_at DESC LIMIT 500'))});
 }
 if(pathname==='/api/assessments'&&method==='POST'){
  roles(session,'admin','programme_officer','mel_officer');const part=(await requireRow(db,'participants',str(B.participant_id,'Participant',40)));const eid=id('assess');
  const kind=oneOf(B.kind,['baseline','final','followup'],'assessment kind'),score=whole(B.score,'score',0,100),ev=ref(B.evidence_url),notes=optional(B.notes,800),when=date(B.assessed_at,'Assessment date');
  await transaction(db,async()=>{await db.prepare('INSERT INTO assessments(id,participant_id,kind,score,evidence_url,notes,assessed_at,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(eid,part.id,kind,score,ev,notes,when,session.uid,now());await audit(db,session.uid,'assessment.recorded','assessment',eid,{participant_id:part.id,kind,score});});return json(res,201,{id:eid});
 }
 if(pathname==='/api/funds'&&method==='GET'){
  roles(session,'admin','director','finance_officer','programme_officer','viewer');return json(res,200,{items:(await fundingSummary(db))});
 }
 if(pathname==='/api/funds'&&method==='POST'){
  roles(session,'finance_officer');const fid=id('fund'),name=str(B.name,'Fund name',150),source=ref(B.source_ref,'Verified receipt / agreement link'),amount=whole(B.received_mwk,'Received MWK',1,9e12);
  const restricted=B.restricted_programme_id?(await requireRow(db,'programmes',str(B.restricted_programme_id,'Programme',30))).id:null;
  await transaction(db,async()=>{await db.prepare('INSERT INTO funds(id,name,source_ref,restricted_programme_id,received_mwk,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(fid,name,source,restricted,amount,'confirmed',session.uid,now());await audit(db,session.uid,'fund.recorded','fund',fid,{received_mwk:amount,restricted_programme_id:restricted});});return json(res,201,{id:fid});
 }
 if(pathname==='/api/expenses'&&method==='GET'){
  roles(session,'admin','director','finance_officer','programme_officer','viewer');return json(res,200,{items:(await all(db,`SELECT e.*,f.name AS fund,p.name AS programme,(SELECT COUNT(*) FROM expense_approvals a WHERE a.expense_id=e.id) AS approvals FROM expenses e JOIN funds f ON f.id=e.fund_id JOIN programmes p ON p.id=e.programme_id ORDER BY e.requested_at DESC LIMIT 500`))});
 }
 if(pathname==='/api/expenses'&&method==='POST'){
  roles(session,'programme_officer','finance_officer','director');const fund=(await requireRow(db,'funds',str(B.fund_id,'Fund ID',40))),programme=(await requireRow(db,'programmes',str(B.programme_id,'Programme ID',30)));
  if(fund.status!=='confirmed')fail(409,'Fund is not open');if(fund.restricted_programme_id&&fund.restricted_programme_id!==programme.id)fail(409,'Restricted grant cannot fund this programme');
  const amount=whole(B.amount_mwk,'Requested amount (MWK)',1,9e12),purpose=str(B.purpose,'Purpose',500),proof=ref(B.proof_url,'Supporting document link'),eid=id('exp');
  await transaction(db,async()=>{await db.prepare('INSERT INTO expenses(id,fund_id,programme_id,amount_mwk,purpose,proof_url,status,requested_by,requested_at) VALUES(?,?,?,?,?,?,?,?,?)').run(eid,fund.id,programme.id,amount,purpose,proof,'requested',session.uid,now());await audit(db,session.uid,'expense.requested','expense',eid,{fund_id:fund.id,amount_mwk:amount});});return json(res,201,{id:eid});
 }
 m=pathname.match(/^\/api\/expenses\/([^/]+)\/approve$/);
 if(m&&method==='POST'){
  roles(session,'director','finance_officer');const entityId=m[1];
  const outcome=await transaction(db,async()=>{
   const e=await get(db,'SELECT * FROM expenses WHERE id=? FOR UPDATE',entityId);if(!e)fail(404,'Expense not found');
   await db.prepare('SELECT id FROM funds WHERE id=? FOR UPDATE').get(e.fund_id);
   if(e.status!=='requested')fail(409,'Expense no longer awaiting approval');
   if(e.requested_by===session.uid)fail(409,'Requester cannot approve their own expense');
   if((await get(db,'SELECT 1 FROM expense_approvals WHERE expense_id=? AND (user_id=? OR role=?)',entityId,session.uid,session.role)))fail(409,'Duplicate or same-role approval denied');
   const existing=(await get(db,'SELECT COUNT(*) AS n FROM expense_approvals WHERE expense_id=?',entityId)).n;
   if(existing===1){
    const funding=(await get(db,`SELECT f.received_mwk,COALESCE((SELECT SUM(amount_mwk) FROM expenses WHERE fund_id=f.id AND status IN ('approved','paid')),0) AS allocated FROM funds f WHERE f.id=?`,e.fund_id));
    if(e.amount_mwk>funding.received_mwk-funding.allocated)fail(409,'Insufficient unallocated funding. Expense approval blocked.');
   }
   await db.prepare('INSERT INTO expense_approvals(expense_id,user_id,role,approved_at) VALUES(?,?,?,?)').run(entityId,session.uid,session.role,now());
   if(existing===1)await db.prepare("UPDATE expenses SET status='approved' WHERE id=?").run(entityId);
   await audit(db,session.uid,'expense.approval','expense',entityId,{role:session.role,stage:existing+1,final:existing===1});
   return {approvals:existing+1,status:existing===1?'approved':'requested'};
  });return json(res,200,outcome);
 }
 m=pathname.match(/^\/api\/expenses\/([^/]+)\/reject$/);
 if(m&&method==='POST'){
  roles(session,'director');const reason=str(B.reason,'Reason',400);
  await transaction(db,async()=>{
   const e=await get(db,'SELECT * FROM expenses WHERE id=? FOR UPDATE',m[1]);
   if(!e)fail(404,'Expense not found');
   if(e.status!=='requested')fail(409,'Only requested expenses can be rejected');
   await db.prepare("UPDATE expenses SET status='rejected' WHERE id=?").run(e.id);
   await audit(db,session.uid,'expense.rejected','expense',e.id,{reason});
  });return json(res,200,{ok:true});
 }
 m=pathname.match(/^\/api\/expenses\/([^/]+)\/pay$/);
 if(m&&method==='POST'){
  roles(session,'finance_officer');const payment=ref(B.payment_ref,'Payment transaction evidence link');
  await transaction(db,async()=>{const e=await get(db,'SELECT * FROM expenses WHERE id=? FOR UPDATE',m[1]);if(!e)fail(404,'Expense not found');if(e.status!=='approved')fail(409,'Two approvals required before payment');await db.prepare("UPDATE expenses SET status='paid',payment_ref=?,paid_at=? WHERE id=?").run(payment,now(),e.id);await audit(db,session.uid,'expense.paid','expense',e.id,{amount_mwk:e.amount_mwk,payment_ref:payment});});return json(res,200,{ok:true});
 }
 if(pathname==='/api/indicators'&&method==='GET'){
  roles(session,'admin','director','programme_officer','finance_officer','mel_officer','viewer');
  return json(res,200,{items:(await all(db,`SELECT i.*,p.name AS programme,
   (SELECT o.value FROM observations o WHERE o.indicator_id=i.id ORDER BY o.observed_at DESC,o.created_at DESC LIMIT 1) AS latest_value,
   (SELECT COUNT(*) FROM observations o WHERE o.indicator_id=i.id) AS observations FROM indicators i LEFT JOIN programmes p ON p.id=i.programme_id ORDER BY i.created_at DESC`))});
 }
 if(pathname==='/api/indicators'&&method==='POST'){
  roles(session,'mel_officer','director');const iid=id('ind'),code=str(B.code,'Indicator code',40).toUpperCase(),name=str(B.name,'Indicator name',250),unit=str(B.unit,'Unit',60);
  const prog=B.programme_id?(await requireRow(db,'programmes',str(B.programme_id,'Programme',30))).id:null;
  const baseline=B.baseline===null||B.baseline===''||B.baseline===undefined?null:number(B.baseline,'Baseline',-1e9,1e9);
  const target=B.target===null||B.target===''||B.target===undefined?null:number(B.target,'Target',-1e9,1e9);
  const due=B.due_date?date(B.due_date,'Due date'):null;
  await transaction(db,async()=>{await db.prepare('INSERT INTO indicators(id,code,programme_id,name,unit,baseline,target,due_date,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(iid,code,prog,name,unit,baseline,target,due,session.uid,now());await audit(db,session.uid,'indicator.created','indicator',iid,{code});});return json(res,201,{id:iid});
 }
 if(pathname==='/api/observations'&&method==='GET'){
  roles(session,'admin','director','programme_officer','mel_officer','viewer');return json(res,200,{items:(await all(db,'SELECT o.*,i.code,i.name AS indicator FROM observations o JOIN indicators i ON i.id=o.indicator_id ORDER BY o.observed_at DESC LIMIT 500'))});
 }
 if(pathname==='/api/observations'&&method==='POST'){
  roles(session,'mel_officer');const ind=(await requireRow(db,'indicators',str(B.indicator_id,'Indicator ID',40))),v=number(B.value,'Measured value',-1e9,1e9),ev=ref(B.evidence_url),dt=date(B.observed_at,'Observed date'),oid=id('obs');
  await transaction(db,async()=>{await db.prepare('INSERT INTO observations(id,indicator_id,value,observed_at,evidence_url,notes,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(oid,ind.id,v,dt,ev,optional(B.notes,800),session.uid,now());await audit(db,session.uid,'observation.recorded','observation',oid,{indicator_id:ind.id,value:v});});return json(res,201,{id:oid});
 }
 if(pathname==='/api/governance'&&method==='GET')return json(res,200,{items:(await all(db,'SELECT g.*,u.name AS owner FROM governance g JOIN users u ON u.id=g.owner_id ORDER BY g.created_at DESC LIMIT 300'))});
 if(pathname==='/api/governance'&&method==='POST'){
  roles(session,'director','admin');const gid=id('gov'),title=str(B.title,'Title',220),category=oneOf(B.category,['policy','budget','programme','risk','partnership','compliance'],'category'),resolution=optional(B.resolution,2000);
  await transaction(db,async()=>{await db.prepare('INSERT INTO governance(id,title,category,owner_id,resolution,status,created_at) VALUES(?,?,?,?,?,?,?)').run(gid,title,category,session.uid,resolution,'proposed',now());await audit(db,session.uid,'governance.proposed','governance',gid,{category});});return json(res,201,{id:gid});
 }
 m=pathname.match(/^\/api\/governance\/([^/]+)\/approve$/);
 if(m&&method==='POST'){
  roles(session,'director');const ev=ref(B.evidence_url),resolution=str(B.resolution,'Resolution',2000);
  await transaction(db,async()=>{
   const g=await get(db,'SELECT * FROM governance WHERE id=? FOR UPDATE',m[1]);
   if(!g)fail(404,'Decision not found');
   if(g.status!=='proposed')fail(409,'Decision is not pending');
   await db.prepare("UPDATE governance SET status='approved',resolution=?,evidence_url=?,decided_at=? WHERE id=?").run(resolution,ev,now(),g.id);
   await audit(db,session.uid,'governance.approved','governance',g.id,{evidence_url:ev});
  });return json(res,200,{ok:true});
 }
 if(pathname==='/api/evidence'&&method==='GET')return json(res,200,{items:(await all(db,`SELECT e.*,u.name AS recorded_by_name FROM evidence e JOIN users u ON u.id=e.recorded_by ORDER BY e.created_at DESC LIMIT 500`))});
 if(pathname==='/api/evidence'&&method==='POST'){
  roles(session,'admin','director','programme_officer','finance_officer','mel_officer');
  const eid=id('ev'),title=str(B.title,'Evidence title',200),entityType=str(B.entity_type,'Entity type',50),entityId=str(B.entity_id,'Entity ID',80),source=ref(B.source_url),details=optional(B.details,1000);
  await transaction(db,async()=>{await db.prepare('INSERT INTO evidence(id,title,entity_type,entity_id,source_url,status,details,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(eid,title,entityType,entityId,source,'pending',details,session.uid,now());await audit(db,session.uid,'evidence.submitted','evidence',eid,{entity_type:entityType,entity_id:entityId});});return json(res,201,{id:eid});
 }
 m=pathname.match(/^\/api\/evidence\/([^/]+)\/review$/);
 if(m&&method==='POST'){
  roles(session,'director','mel_officer');const status=oneOf(B.status,['verified','rejected'],'review state');
  await transaction(db,async()=>{
   const ev=await get(db,'SELECT * FROM evidence WHERE id=? FOR UPDATE',m[1]);
   if(!ev)fail(404,'Evidence not found');
   if(ev.status!=='pending')fail(409,'Evidence has already been reviewed');
   if(ev.recorded_by===session.uid)fail(409,'Self-verification is not allowed');
   await db.prepare('UPDATE evidence SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?').run(status,session.uid,now(),ev.id);
   await audit(db,session.uid,'evidence.reviewed','evidence',ev.id,{status});
  });return json(res,200,{ok:true});
 }
 if(pathname==='/api/enquiries'&&method==='GET'){
  roles(session,'admin','director','programme_officer','viewer');return json(res,200,{items:(await all(db,'SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 300'))});
 }
 let en=pathname.match(/^\/api\/enquiries\/([^/]+)$/);
 if(en&&method==='PATCH'){
  roles(session,'admin','director','programme_officer');
  const status=oneOf(B.status,['under_review','closed'],'enquiry state');
  await transaction(db,async()=>{
   const record=await get(db,'SELECT * FROM enquiries WHERE id=? FOR UPDATE',en[1]);
   if(!record)fail(404,'Enquiry not found');
   if(record.status==='closed'||(record.status==='under_review'&&status==='under_review'))fail(409,'Invalid enquiry transition');
   await db.prepare('UPDATE enquiries SET status=?,updated_at=? WHERE id=?').run(status,now(),record.id);
   await audit(db,session.uid,'enquiry.review','enquiry',record.id,{from:record.status,to:status});
  });return json(res,200,{ok:true});
 }
 if(pathname==='/api/opportunities'&&method==='GET')return json(res,200,{items:(await all(db,'SELECT * FROM opportunities ORDER BY created_at DESC LIMIT 300'))});
 if(pathname==='/api/opportunities'&&method==='POST'){
  roles(session,'admin','director','programme_officer');const eid=id('opp'),title=str(B.title,'Title',200),description=str(B.description,'Description',1500),category=oneOf(B.category,['challenge','mentor','collaboration','volunteer'],'category');
  await transaction(db,async()=>{await db.prepare('INSERT INTO opportunities(id,category,title,description,status,created_by,created_at) VALUES(?,?,?,?,?,?,?)').run(eid,category,title,description,'proposed',session.uid,now());await audit(db,session.uid,'opportunity.created','opportunity',eid,{category});});return json(res,201,{id:eid});
 }
 m=pathname.match(/^\/api\/opportunities\/([^/]+)$/);
 if(m&&method==='PATCH'){
  roles(session,'director');const status=oneOf(B.status,['active','closed'],'status');
  await transaction(db,async()=>{
   const o=await get(db,'SELECT * FROM opportunities WHERE id=? FOR UPDATE',m[1]);
   if(!o)fail(404,'Opportunity not found');
   if(o.status==='closed'||o.status===status)fail(409,'Invalid opportunity transition');
   await db.prepare('UPDATE opportunities SET status=? WHERE id=?').run(status,o.id);
   await audit(db,session.uid,'opportunity.status','opportunity',o.id,{from:o.status,to:status});
  });return json(res,200,{ok:true});
 }
 if(pathname==='/api/team'&&method==='GET'){
  roles(session,'admin','director');return json(res,200,{items:(await all(db,'SELECT id,name,email,role,active,created_at FROM users ORDER BY created_at'))});
 }
 if(pathname==='/api/team'&&method==='POST'){
  roles(session,'admin');const uid=id('user'),name=str(B.name,'Name',120),em=email(B.email),role=oneOf(B.role,['admin','director','programme_officer','finance_officer','mel_officer','viewer'],'role');
  const {hash,salt}=hashPassword(B.password);
  await transaction(db,async()=>{await db.prepare('INSERT INTO users(id,name,email,pass_hash,salt,role,active,created_at) VALUES(?,?,?,?,?,?,?,?)').run(uid,name,em,hash,salt,role,1,now());await audit(db,session.uid,'user.created','user',uid,{role});});return json(res,201,{id:uid});
 }
 if(pathname==='/api/audit'&&method==='GET'){
  roles(session,'admin','director');return json(res,200,{items:(await all(db,`SELECT a.seq,a.action,a.entity_type,a.entity_id,a.occurred_at,a.event_hash,u.name AS actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY seq DESC LIMIT 300`)),integrity:await verifyAudit(db)});
 }
 fail(404,'API route not found');
}
async function serve(req,res){
 // Local production and direct-Node production targets must not bypass
 // the same release hold used by Vercel production deployments.
 const productionTarget=process.env.VERCEL_ENV==='production'||
  (process.env.NODE_ENV==='production'&&process.env.VERCEL_ENV!=='preview');
 if(productionTarget&&process.env.SUDERN_PRODUCTION_AUTHORIZED!=='true'){
  res.statusCode=503;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify({error:'SUDERN production release is not authorized'}));
  return;
 }
 const url=new URL(req.url||'/', 'http://localhost');const method=req.method;
 res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; img-src 'self' data: https://images.unsplash.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
 try{
  const db=await getDb();
  if(url.pathname.startsWith('/api/')){
   if(!isAllowedOrigin(req))fail(403,'Origin mismatch');
   const session=(await readSession(db,req));
   if(!['GET','HEAD','OPTIONS'].includes(method)&&session&&url.pathname!=='/api/auth/login'&&url.pathname!=='/api/public/applications'){
    if(req.headers['x-csrf-token']!==session.csrf)fail(403,'CSRF validation failed');
   }
   const B=['POST','PATCH','PUT'].includes(method)?await body(req):null;
   return await handleApi(db,req,res,url,B,session);
  }
  if(method!=='GET'&&method!=='HEAD')fail(405,'Method not allowed');
  const p=url.pathname==='/'?'/index.html':url.pathname==='/portal'?'/portal.html':url.pathname==='/apply'?'/apply.html':url.pathname;
  let decoded;try{decoded=decodeURIComponent(p)}catch{fail(400,'Malformed URL encoding')}
  const requested=path.resolve(root,'.'+decoded);
  if(!requested.startsWith(root+path.sep))fail(403,'Forbidden');
  if(!fs.existsSync(requested)||!fs.statSync(requested).isFile())fail(404,'Not found');
  const ext=path.extname(requested);if(!mime[ext])fail(415,'Unsupported file type');
  res.setHeader('Content-Type',mime[ext]);res.setHeader('Cache-Control',ext==='.html'?'no-store':'public, max-age=1800');
  const stream=fs.createReadStream(requested);stream.on('error',()=>res.destroy());
  return method==='HEAD'?res.end():stream.pipe(res);
 }catch(e){
  const status=e.status||(e.code==='23505'||e.code==='23503'?409:500);
  if(status===500)console.error('[server]',e.message);
  if(!res.headersSent)json(res,status,{error:status===500?'Internal server error':(e.code==='23505'||e.code==='23503'?'Record conflict':e.message)}); else res.end();
 }
}
async function start(port=Number(process.env.PORT||3000)){
 mfa.key();
 const db=await getDb();const server=http.createServer(serve);
 return new Promise(resolve=>server.listen(port,process.env.HOST||'127.0.0.1',()=>{const address=server.address();console.log(`SUDERN platform: http://${process.env.HOST||'127.0.0.1'}:${address.port}`);resolve({server,db,port:address.port});}));
}
if(require.main===module)start().catch(e=>{console.error('Startup failed:',e.message);process.exitCode=1});
module.exports={serve,start};
