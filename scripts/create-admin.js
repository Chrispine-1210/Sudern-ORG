'use strict';
const {getDb,id,now,audit,transaction}=require('../src/db');
const {hashPassword}=require('../src/security');
const [name,email]=process.argv.slice(2);const password=process.env.ADMIN_PASSWORD;
if(!name||!email||!password){console.error('Usage: ADMIN_PASSWORD=<strong-secret> npm run create-admin -- "Full Name" email@example.org (Use a protected secret manager and avoid shell history.)');process.exit(1)}
const {hash,salt}=hashPassword(password);const db=getDb(),uid=id('user');
try {transaction(db,()=>{db.prepare('INSERT INTO users(id,name,email,pass_hash,salt,role,active,created_at) VALUES(?,?,?,?,?,?,?,?)').run(uid,name,email.toLowerCase(),hash,salt,'admin',1,now());audit(db,uid,'user.bootstrap','user',uid,{role:'admin'});});console.log('Administrator created. ID:',uid)} catch(e){console.error('Could not create administrator:',e.message);process.exit(1)}
