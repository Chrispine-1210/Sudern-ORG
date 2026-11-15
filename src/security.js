'use strict';
const crypto=require('node:crypto');
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
 if(typeof password!=='string'||password.length<12||password.length>256)throw Object.assign(new Error('Password must contain 12â€“256 characters'),{status:400});
 return {salt,hash:crypto.scryptSync(password,salt,64).toString('hex')};
}
function checkPassword(password,salt,stored){
 if(typeof password!=='string'||password.length>256)return false;
 const attempted=crypto.scryptSync(password,salt,64);
 const expected=Buffer.from(stored,'hex');
 return attempted.length===expected.length&&crypto.timingSafeEqual(attempted,expected);
}
function createSession(c,user){
 const token=crypto.randomBytes(32).toString('base64url');
 const csrf=crypto.randomBytes(24).toString('base64url');
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 const expires=new Date(Date.now()+8*3600*1000).toISOString();
 c.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at,created_at) VALUES(?,?,?,?,?)')
  .run(hash,user.id,csrf,expires,new Date().toISOString());
 return {token,csrf,expires};
}
function readSession(c,req){
 const m=(req.headers.cookie||'').match(/(?:^|;\s*)sudern_session=([^;]+)/);
 if(!m)return null;
 const hash=crypto.createHash('sha256').update(m[1]).digest('hex');
 const session=c.prepare(`SELECT s.*,u.id AS uid,u.name,u.email,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AN¶»§q«^