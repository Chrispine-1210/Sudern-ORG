'use strict';
const crypto=require('node:crypto');
const {hashPassword,checkPassword,cookie,clearCookie,isAllowedOrigin}=require('./security');
const {isPrivileged}=require('./mfa');
async function createSession(c,user,verified=false){
 if(isPrivileged(user.role)&&!verified)throw Error('MFA required before privileged session issuance');
 const token=crypto.randomBytes(32).toString('base64url'),csrf=crypto.randomBytes(24).toString('base64url');
 const hash=crypto.createHash('sha256').update(token).digest('hex'),expires=new Date(Date.now()+8*3600*1000).toISOString();
 await c.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at,mfa_verified,created_at) VALUES(?,?,?,?,?,?)').run(hash,user.id,csrf,expires,verified?1:0,new Date().toISOString());
 return {token,csrf,expires};
}
async function readSession(c,req){const m=(req.headers.cookie||'').match(/(?:^|;\s*)sudern_session=([^;]+)/);if(!m)return null;
 const hash=crypto.createHash('sha256').update(m[1]).digest('hex');
 const session=await c.prepare('SELECT s.*,u.id AS uid,u.name,u.email,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').get(hash,new Date().toISOString());
 if(!session||isPrivileged(session.role)&&session.mfa_verified!==1)return null;
 return {...session,token_hash:hash};
}
module.exports={hashPassword,checkPassword,cookie,clearCookie,isAllowedOrigin,createSession,readSession};
