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
function open(value){const parts=String(value).split('.');¶»§q«^