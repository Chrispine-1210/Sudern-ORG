'use strict';
const form=document.getElementById('application-form'),status=document.getElementById('availability'),message=document.getElementById('message');
async function init(){try{
 const [config,programmes]=await Promise.all([fetch('/api/public/config').then(r=>r.json()),fetch('/api/public/programmes').then(r=>r.json())]);
 const select=document.getElementById('programme');select.replaceChildren();
 programmes.items.forEach(p=>{const opt=document.createElement('option');opt.value=p.id;opt.textContent=`${p.name} · ${p.state==='planned'?'Programme planning':p.state}`;select.append(opt)});
 if(config.intake_enabled){status.textContent='The expression-of-interest channel is open. Submission is not a confirmation of admission or funding.';form.hidden=false;}else{status.textContent='Intake is closed while institutional data protection and programme launch requirements are being completed. No applications can be submitted currently.'}
 }catch{status.textContent='Unable to determine intake availability. Try again when the official service is operating.'}}
form.addEventListener('submit',async e=>{e.preventDefault();const b=document.getElementById('send');b.disabled=true;message.textContent='';const f=new FormData(form),payload={applicant_name:f.get('applicant_name'),applicant_email:f.get('applicant_email'),phone:f.get('phone'),programme_id:f.get('programme_id'),motivation:f.get('motivation'),consent:f.get('consent')==='on',website:f.get('website')};
 try{const r=await fetch('/api/public/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw Error(d.error||'Submission could not be recorded');message.textContent=`Recorded: ${d.id}. This is an expression of interest, not a confirmed place.`;message.style.color='#146a3d';form.reset()}catch(err){message.textContent=err.message;message.style.color='#b53c44'}finally{b.disabled=false}});
init();
