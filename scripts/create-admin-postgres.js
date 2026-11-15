'use strict';
const {getDb,now,id,transaction,audit}=require('../src/pg-db');
const {hashPassword}=require('../src/pg-security');
(async()=>{
 if(process.env.SANDBOX!=='true')throw Error('First administrator provision requires SANDBOX=true and reviewed governance; live provisioning intentionally blocked');
 const [name,email]=process.argv.slice(2);if(!name||!email||!/^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(email))throw Error('Usage: SANDBOX=true ADMIN_PASSWORD=... npm run create-admin:pg -- "Full Name" "email@example.invalid"');
 const pw=process.env.ADMIN_PASSWORD;if(!pw)throw Error('Supply ADMIN_PASSWORD through secret injection');const {hash,salt}=hashPassword(pw);
 const db=await getDb();await transaction(db,async()=>{const existing=await db.prepare('SELECT COUNT(*) AS n FROM users').get();if(existing.n!==0)throw Error('Refusing admin bootstrap on a nonempty user directory');const uid=id('user');await db.prepare('INSERT INTO users(id,name,email,pass_hash,salt,role,active,created_at) VALUES(?,?,?,?,?,?,?,?)').run(uid,name,email.toLowerCase(),hash,salt,'admin',1,now());await audit(db,uid,'user.bootstrap','user',uid,{role:'admin',sandbox:true})});console.log('Sandbox administrator created. MFA enrolment is mandatory at first sign-in.');await db.close();
})().catch(e=>{console.error(e.message);process.exitCode=1});
