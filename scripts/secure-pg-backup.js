'use strict';
// AES-256-GCM authenticated encryption of PostgreSQL *custom-format dumps*.
// Use only on an offline, consented snapshot obtained through pg_dump -Fc.
// No DB/network access. Key comes exclusively from an environment secret.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const MAGIC=Buffer.from('SUDERN-PG-AESGCM-v1\n');
function secret(){
 const raw=process.env.SUDERN_BACKUP_KEY;
 if(typeof raw!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(raw))throw Error('SUDERN_BACKUP_KEY must be a protected base64 32-byte secret');
 const k=Buffer.from(raw,'base64');if(k.length!==32)throw Error('Bad backup key length');return k;
}
function operate(action,input,output){
 if(!['encrypt','decrypt'].includes(action)||!input||!output)throw Error('Usage: secure-pg-backup.js <encrypt|decrypt> <existing input> <new output>');
 const src=path.resolve(input),dst=path.resolve(output);
 if(src===dst)throw Error('Input and output cannot be the same file');
 const key=secret(),st=fs.statSync(src);if(!st.isFile())throw Error('Source must be a file');
 const read=fs.openSync(src,'r');let write,tmp,ok=false;
 try {
   // Exclusive creation: avoid clobbering existing backup files.
   if(fs.existsSync(dst))throw Error('Output already exists; refusing overwrite');
   tmp=dst+'.partial-'+crypto.randomBytes(5).toString('hex');
   write=fs.openSync(tmp,'wx',0o600);
   const size=64*1024,chunk=Buffer.alloc(size);
   if(action==='encrypt'){
     const iv=crypto.randomBytes(12),enc=crypto.createCipheriv('aes-256-gcm',key,iv);
     enc.setAAD(MAGIC);
     fs.writeSync(write,MAGIC);fs.writeSync(write,iv);
     let n;while((n=fs.readSync(read,chunk,0,size,null))>0)fs.writeSync(write,enc.update(chunk.subarray(0,n)));
     fs.writeSync(write,enc.final());fs.writeSync(write,enc.getAuthTag());
   } else {
     if(st.size<MAGIC.length+12+16)throw Error('Backup is truncated');
     const prefix=Buffer.alloc(MAGIC.length+12);fs.readSync(read,prefix,0,prefix.length,0);
     if(!prefix.subarray(0,MAGIC.length).equals(MAGIC))throw Error('Unknown backup format');
     const iv=prefix.subarray(MAGIC.length),tag=Buffer.alloc(16);
     fs.readSync(read,tag,0,16,st.size-16);
     const dec=crypto.createDecipheriv('aes-256-gcm',key,iv);dec.setAAD(MAGIC);dec.setAuthTag(tag);
     let offset=prefix.length;
     while(offset<st.size-16){const n=fs.readSync(read,chunk,0,Math.min(size,st.size-16-offset),offset);if(n===0)throw Error('Unexpected EOF');offset+=n;fs.writeSync(write,dec.update(chunk.subarray(0,n)))}
     fs.writeSync(write,dec.final()); // Rejects tampered ciphertext/tag.
   }
   fs.fsyncSync(write);fs.closeSync(write);write=undefined;
   fs.renameSync(tmp,dst);ok=true;
   const sha=crypto.createHash('sha256'),fh=fs.openSync(dst,'r'),buf=Buffer.alloc(64*1024);try{let n;while((n=fs.readSync(fh,buf,0,buf.length,null))>0)sha.update(buf.subarray(0,n))}finally{fs.closeSync(fh)}
   return {mode:action,bytes:fs.statSync(dst).size,sha256:sha.digest('hex')};
 } finally{if(write!==undefined)fs.closeSync(write);fs.closeSync(read);if(!ok&&tmp)try{fs.unlinkSync(tmp)}catch{}}
}
if(require.main===module){try{const r=operate(process.argv[2],process.argv[3],process.argv[4]);console.log(JSON.stringify(r));}catch(e){console.error('Secure backup operation failed:',e.message);process.exitCode=1}}
module.exports={operate};
