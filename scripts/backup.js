'use strict';
const {backup}=require('node:sqlite');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {getDb,verifyAudit}=require('../src/db');
(async()=>{
 const target=process.argv[2];
 if(!target){console.error('Usage: node scripts/backup.js /secure/destination/backup-YYYYMMDD.db');process.exit(2)}
 const abs=path.resolve(target);fs.mkdirSync(path.dirname(abs),{recursive:true,mode:0o700});
 if(fs.existsSync(abs)){console.error('Refusing to overwrite existing backup');process.exit(2)}
 const db=getDb(),chain=verifyAudit(db);
 if(!chain.ok)throw new Error(`Audit chain fails at event ${chain.failed_at}; investigate before relying on a backup`);
 await backup(db,abs);fs.chmodSync(abs,0o600);
 const hash=crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
 console.log(JSON.stringify({file:abs,sha256:hash,audit_events:chain.count,encrypted:false,warning:'Protect this unencrypted backup. Offsite encryption is a production gate.'},null,2));
})().catch(e=>{console.error(e.message);process.exit(1)});
