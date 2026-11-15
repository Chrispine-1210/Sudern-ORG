'use strict';
const {migrate,db}=require('../src/pg-db');
(async()=>{if(!process.env.DATABASE_URL||!process.env.MFA_ENCRYPTION_KEY)throw Error('DATABASE_URL and MFA_ENCRYPTION_KEY required');
 const r=await migrate();console.log(`SUDERN schema v${r.version} ${r.applied?'applied':'already present'}`);
 await db.close();})().catch(e=>{console.error('Migration refused:',e.message);process.exitCode=1});
