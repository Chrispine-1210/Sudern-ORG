'use strict';const {getDb,verifyAudit}=require('../src/db');
try{const db=getDb(),integrity=db.prepare('PRAGMA integrity_check').get().integrity_check;
 const fk=db.prepare('PRAGMA foreign_key_check').all();const chain=verifyAudit(db);
 const entities=['users','programmes','cohorts','applications','enquiries','participants','funds','expenses','indicators','observations','evidence','audit'];
 const counts=Object.fromEntries(entities.map(k=>[k,db.prepare(`SELECT COUNT(*) AS n FROM ${k}`).get().n]));
 const result={database_integrity:integrity,foreign_key_violations:fk.length,audit_chain:chain,counts};
 console.log(JSON.stringify(result,null,2));if(integrity!=='ok'||fk.length||!chain.ok)process.exit(1);
}catch(e){console.error('Verification failure:',e.message);process.exit(1)}
