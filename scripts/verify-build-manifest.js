'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'BUILD-MANIFEST-GITHUB-SOURCE.json'),'utf8'));
let checked=0;
for(const [relative,expected] of Object.entries(manifest.files)){
 const file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())throw Error('Manifest file missing or invalid: '+relative);
 const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(actual!==expected)throw Error('Manifest mismatch: '+relative);
 checked++;
}
if(checked<60)throw Error('Unreasonably small SUDERN source manifest');
console.log(JSON.stringify({status:'PASS',scope:manifest.scope,files_verified:checked,production_certified:false}));
