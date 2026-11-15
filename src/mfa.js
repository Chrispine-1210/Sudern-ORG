'use strict';
const crypto=require('node:crypto');
const ABC='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const privileged=new Set(['admin','director','programme_officer','finance_officer','mel_officer','viewer']);
function isPrivileged(role){return privileged.has(role)}
function key(){const raw=process.env.MFA_ENCRYPTION_KEY;if(!raw)throw Error('MFA_ENCRYPTION_KEY is required for privileged authentication');if(!/^[A-Za-z0-9+/]{43}=$/.test(raw))throw Error('MFA_ENCRYPTION_KEY must be canonical base64 for 32 bytes');const buf=Buffer.from(raw,'base64');if(buf.length!==32)throw Error('MFA_ENCRYPTION_KEY must be base64-encoded 32 bytes');return buf}
function encodeBase32(bytes){let bits=0,acc=0,output='';for(const b of bytes){acc=(acc<<8)|b;bits+=8;while(bits>=5){bits-=5;output+=ABC[(acc>>>bits)&31]}}if(bits)output+=ABC[(acc<<(5-bits))&31];return output}
function decodeBase32(str){let bits=0,acc=0,output=[];for(const c of str.replace(/=+$/,'').toUpperCase()){const i=ABC.indexOf(c);if(i<0)throw Error('Invalid TOTP secret');acc=(acc<<5)|i;bits+=5;if(bits>=8){bits-=8;output.push((acc>>>bits)&255)}}return Buffer.from(output)}
function newSecret(){return encodeBase32(crypto.randomBytes(20))}
function seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv),enc=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),enc].map(b=>b.toString('base64url')).join('.')}
function open(value){const parts=String(value).split('.');if(parts.length!==3)throw Error('Invalid encrypted secret');const [iv,tag,enc]=parts.map(x=>Buffer.from(x,'base64url'));const cipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(enc),cipher.final()]).toString('utf8')}
function codeAt(secret,timestamp){const bytes=decodeBase32(secret),counter=BigInt(Math.floor(timestamp/30000)),message=Buffer.alloc(8);message.writeBigUInt64BE(counter);const digest=crypto.createHmac('sha1',bytes).update(message).digest();const offset=digest[19]&0xf;const code=(digest.readUInt32BE(offset)&0x7fffffff)%1000000;return String(code).padStart(6,'0')}
function matchingStep(secret,input,time=Date.now()){
 if(!/^\d{6}$/.test(String(input)))return null;
 const target=Buffer.from(String(input));
 for(const skew of [-1,0,1]){
  const when=time+skew*30000;
  if(crypto.timingSafeEqual(Buffer.from(codeAt(secret,when)),target))return Math.floor(when/30000);
 }
 return null;
}
function validCode(secret,input,time=Date.now()){return matchingStep(secret,input,time)!==null}
function recoveryCode(){return crypto.randomBytes(12).toString('hex').toUpperCase().match(/.{1,6}/g).join('-')}
function hashRecovery(value){return crypto.createHmac('sha256',key()).update(String(value).replace(/-/g,'').toUpperCase()).digest('hex')}
function verifyRecovery(value,hashes){if(typeof value!=='string'||!/^([A-Fa-f0-9]{6}-){3}[A-Fa-f0-9]{6}$/.test(value))return -1;const hash=hashRecovery(value);return hashes.findIndex(h=>h.length===hash.length&&crypto.timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(hash,'hex')))}
function uri(secret,email){return `otpauth://totp/${encodeURIComponent('SUDERN')}:${encodeURIComponent(email)}?secret=${secret}&issuer=SUDERN&algorithm=SHA1&digits=6&period=30`}
module.exports={isPrivileged,key,encodeBase32,decodeBase32,newSecret,seal,open,codeAt,matchingStep,validCode,recoveryCode,hashRecovery,verifyRecovery,uri};
