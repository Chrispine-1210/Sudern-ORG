'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {URL}=require('node:url');
const {getDb,now,id,audit,transaction,verifyAudit}=require('./pg-db');
const {hashPassword,checkPassword,createSession,readSession,cookie,clearCookie,isAllowedOrigin}=require('./pg-security');
const crypto=require('node:crypto');
const mfa=require('./mfa');
const root=path.join(__dirname,'..','public');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
const loginAttempts=new Map(),intakeAttempts=new Map();
class HttpError extends Error {constructor(status,msg){super(msg);this.status=status;}}
const fail=(s,msg)=>{throw new HttpError(s,msg)};
function str(v,label,max=180){ if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(422,`${label} is required (max ${max} characters)`);return v.trim(); }
function optional(v,max=500){if(v==null||v==='')return ''; if(typeof v!=='string'||v.length>max)fail(422,`Text exceeds ${max} characters`);return v.trim();}
function oneOf(v,allowed,label){if(!allowed.includes(v))fail(422,`Invalid ${label}`);return v;}
function number(v,label,min=0,max=1e12){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(422,`Invalid ${label}`);return v;}
function whole(v,label,min=0,max=1e12){if(!Number.isSafeInteger(v)||v<min||v>m¶»§q«^