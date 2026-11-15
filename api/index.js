'use strict';
// Vercel preview-only Node function. Environment checks fail closed.
const {serve}=require('../src/server-postgres');
module.exports=async function handler(req,res){
 if(process.env.VERCEL_ENV==='production'&&process.env.SUDERN_PRODUCTION_AUTHORIZED!=='true'){
  res.statusCode=503;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('SUDERN production release is not authorized');return;
 }
 if(!process.env.DATABASE_URL||!process.env.MFA_ENCRYPTION_KEY){res.statusCode=503;res.setHeader('Cache-Control','no-store');res.end('Configuration pending');return}
 try{require('../src/mfa').key()}catch{res.statusCode=503;res.setHeader('Cache-Control','no-store');res.end('Security configuration invalid');return}
 await serve(req,res);
};
