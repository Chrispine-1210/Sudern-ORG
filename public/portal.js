'use strict';
const $=(id)=>document.getElementById(id);
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-MW',{maximumFractionDigits:0}).format(Number(v||0));
const fmtDate=v=>v?new Date(v).toLocaleDateString('en-GB',{year:'numeric',month:'short',day:'numeric'}):'â€”';
const percent=(n)=>Math.max(3,Math.min(95,n));
let session=null,view='overview',data={},activeForm=null,pendingMfa=null;
const roleNames={admin:'System Administrator',director:'Executive Director',programme_officer:'Programme Officer',finance_officer:'Finance Officer',mel_officer:'M&E Officer',viewer:'Read-only Reviewer'};
const can=(...rs)=>session&&rs.includes(session.user.role);
async function api(url,method='GET',payload){const opts={method,headers:{},credentials:'same-origin'};if(method!=='GET'){opts.headers['Content-Type']='application/json';if(session?.csrf)opts.headers['X-CSRF-Token']=session.csrf;opts.body=JSON.stringify(payload||{});}let response;try{response=await fetch(url,opts)}catch{throw Error('Cannot connect to the platform server.')}let result;try{result=await response.json()}catch{throw Error('Server returned an invalid response')}if(!response.ok)throw Error(result.error||`Request failed (${response.status})`);return result;}
function toast(message,error=false){const div=document.createElement('div');div.className='toast'+(error?' error':'');div.textContent=message;$('toast-region').a¶»§q«^