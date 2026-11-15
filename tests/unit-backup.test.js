'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {operate}=require('../scripts/secure-pg-backup');
test('AES-256-GCM encrypted PostgreSQL dump round-trip and tamper detection',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sudern-backup-test-'));
 process.env.SUDERN_BACKUP_KEY=crypto.randomBytes(32).toString('base64');
 const p=n=>path.join(dir,n);
 try{
   const input=crypto.randomBytes(250000);fs.writeFileSync(p('source.dump'),input,{mode:0o600});
   const sealed=operate('encrypt',p('source.dump'),p('encrypted.aesgcm'));
   assert.equal(sealed.mode,'encrypt');assert.notDeepEqual(fs.readFileSync(p('encrypted.aesgcm')).subarray(0,32),input.subarray(0,32));
   const opened=operate('decrypt',p('encrypted.aesgcm'),p('restored.dump'));
   assert.equal(opened.mode,'decrypt');assert.deepEqual(fs.readFileSync(p('restored.dump')),input);
   assert.throws(()=>operate('decrypt',p('encrypted.aesgcm'),p('restored.dump')),/already exists/);
   const modified=fs.readFileSync(p('encrypted.aesgcm'));modified[modified.length-25]^=0x80;fs.writeFileSync(p('tampered.aesgcm'),modified);
   assert.throws(()=>operate('decrypt',p('tampered.aesgcm'),p('not-created.dump')));
   assert.equal(fs.existsSync(p('not-created.dump')),false);
 } finally{delete process.env.SUDERN_BACKUP_KEY;fs.rmSync(dir,{recursive:true,force:true})}
});
