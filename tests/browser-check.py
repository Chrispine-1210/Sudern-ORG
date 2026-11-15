"""Local browser rendering + live HTTP API bridge.
Managed Chromium blocks direct localhost navigation in this environment.
The browser loads the real HTML/CSS/JS from disk; fetch() calls are bridged to
an actual isolated Node HTTP server through Python requests.Session.
This verifies UI navigation and live API integration, but is not a production-network E2E test.
"""
import re, json, requests, base64, os, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public';out=Path(__file__).resolve().parents[1]/'docs';out.mkdir(exist_ok=True)
img='data:image/webp;base64,'+base64.b64encode((root/'brand-emblem.webp').read_bytes()).decode()
base=os.getenv('BROWSER_BASE_URL','http://127.0.0.1:3108')
login_email=os.getenv('BROWSER_SANDBOX_EMAIL','admin@sandbox.sudern.invalid')
login_password=os.getenv('BROWSER_SANDBOX_PASSWORD')
if not login_password: raise SystemExit('Set BROWSER_SANDBOX_PASSWORD to the password used for your isolated sandbox. Do not use production credentials.')

def open_app(browser, filename, css, js, width=1440,height=1000):
 page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
 http=requests.Session()
 def bridge(source,url,method,headers,body):
  res=http.request(method,base+url,headers=headers,data=body,timeout=10)
  try:data=res.json()
  except:data={'error':f'Invalid response {res.status_code}'}
  return {'status':res.status_code,'data':data}
 page.expose_binding('__bridgeFetch',bridge)
 html=(root/filename).read_text()
 html=re.sub(r'<script\s+src="/[^" ]+"[^>]*></script>','',html)
 html=re.sub(r'<link\s+[^>]*href="https?://[^>]+>','',html)
 html=re.sub(r'<link\s+[^>]*href="/[^>]+>','',html)
 html=html.replace('src="/brand-emblem.webp"',f'src="{img}"').replace('src="brand-emblem.webp"',f'src="{img}"')
 page.set_content(html,wait_until='domcontentloaded')
 page.add_style_tag(path=str(root/css))
 page.evaluate('''() => { window.fetch = async (url,options={}) => { const data=await window.__bridgeFetch(url,options.method||'GET',options.headers||{},options.body||null); return {ok:data.status>=200&&data.status<300,status:data.status,json:async()=>data.data}; }; }''')
 page.add_script_tag(path=str(root/js))
 return page

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 errors=[]
 page=open_app(browser,'portal.html','portal.css','portal.js')
 page.on('pageerror',lambda e: errors.append(str(e)))
 page.screenshot(path=str(out/'01-portal-login.png'),full_page=True)
 page.get_by_placeholder('name@organisation.org').fill(login_email)
 page.get_by_placeholder('Enter your password').fill(login_password)
 page.get_by_role('button',name='Secure sign in').click()
 page.get_by_text('Institutional command centre.').wait_for(timeout=10000)
 page.screenshot(path=str(out/'02-executive-overview.png'),full_page=True)
 cases=[('Programmes','Programmes & implementation.','03-programmes.png'),('Applications','Applications & selection.','04-intake.png'),('Funds & expenditure','Financing & expenditure control.','05-financing.png'),('Monitoring & outcomes','Monitoring, evaluation & learning.','06-monitoring.png'),('Governance register','Governance & decisions.','07-governance.png'),('Evidence vault','Evidence & verification register.','08-evidence.png'),('Community network','Community & partnerships.','08b-community.png'),('Audit & traceability','Immutable event register.','09-audit.png')]
 for nav,title,screenshot in cases:
  page.get_by_role('button',name=nav).click()
  page.get_by_text(title,exact=True).wait_for(timeout=10000)
  page.screenshot(path=str(out/screenshot),full_page=True)
 # Test an actual browser form write through the HTTP-backed CSRF/session API.
 page.get_by_role('button',name='Governance register').click()
 page.get_by_text('Governance & decisions.',exact=True).wait_for(timeout=10000)
 page.get_by_role('button',name='Propose decision').click()
 test_decision_title='TEST / Browser governance '+uuid.uuid4().hex[:8]
 page.get_by_label('Matter / resolution title').fill(test_decision_title)
 page.get_by_label('Proposed resolution / meeting notes').fill('Non-production browser workflow verification')
 page.get_by_role('button',name='Save record').click()
 page.get_by_text(test_decision_title,exact=True).first.wait_for(timeout=10000)
 print('Browser-controlled governance record creation through live backend - PASS')
 print('Desktop portal: login, authenticated overview, 8 live-data modules - PASS')
 mobile=open_app(browser,'portal.html','portal.css','portal.js',390,844)
 mobile.screenshot(path=str(out/'10-mobile-login.png'),full_page=True)
 mobile.get_by_placeholder('name@organisation.org').fill(login_email)
 mobile.get_by_placeholder('Enter your password').fill(login_password)
 mobile.get_by_role('button',name='Secure sign in').click()
 mobile.get_by_text('Institutional command centre.',exact=True).wait_for(timeout=10000)
 mobile.screenshot(path=str(out/'11-mobile-overview.png'),full_page=True)
 mobile.get_by_role('button',name='Toggle menu').click()
 assert mobile.get_by_role('button',name='Evidence vault').is_visible()
 print('Mobile portal: login, overview, responsive navigation - PASS')
 apply=open_app(browser,'apply.html','apply.css','apply.js')
 apply.get_by_text('Intake is closed while institutional data protection', exact=False).wait_for(timeout=10000)
 apply.screenshot(path=str(out/'13-public-application.png'),full_page=True)
 print('Public intake page: backend-backed CLOSED status - PASS')
 public=open_app(browser,'index.html','styles.css','app.js')
 public.get_by_text('Enquiry intake is presently closed',exact=False).wait_for(timeout=10000)
 assert public.locator('#contact-submit').is_disabled()
 print('Public website: operational enquiry form correctly disabled when intake closed - PASS')
 print('UI page errors:',errors)
 assert not errors,errors
 browser.close()
