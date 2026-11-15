'use strict';
const crypto=require('node:crypto');
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
 if(typeof password!=='string'||password.length<12||password.length>256)throw Object.assign(new Error('Password must contain 12–256 characters'),{status:400});
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
 const session=c.prepare(`SELECT s.*,u.id AS uid,u.name,u.email,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).get(hash,new Date().toISOString());
 return session?{...session,token_hash:hash}:null;
}
function cookie(token,secure){return `sudern_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800${secure?'; Secure':''}`;}
function clearCookie(secure){return `sudern_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`;}
function isAllowedOrigin(req){
 const origin=req.headers.origin;
 if(!origin)return true;
 try { const parsed=new URL(origin);const expected=req.headers.host;
   return parsed.host===expected && ['http:','https:'].includes(parsed.protocol);
 } catch{return false;}
}
module.exports={hashPassword,checkPassword,createSession,readSession,cookie,clearCookie,isAllowedOrigin};
