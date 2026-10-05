"""
Staff operations UI pass: terms draft/approve, events, staffing, call sheet (print),
campaigns, session-error recovery, worker credential + attendance, with axe checks.
Local dev server + LOCAL test DB only. No external sends, no cutover.

    CREW_WORKER_EMAIL=<event-ready worker from `KEEP=1 bun tests/e2e/workflow.ts`> \
    CREW_AXE_PATH=/path/to/axe.min.js CREW_SHOTS=/tmp/shots/ops \
    python3 packages/web/tests/browser/operations.py

Environment: CREW_BASE (default http://localhost:4200), CREW_WORKER_EMAIL (required),
CREW_AXE_PATH (required; axe-core 4.x min build), CREW_SHOTS (screenshot dir, default
/tmp/shots/ops), CREW_PROGRESS (optional JSON progress file).
"""
import asyncio,json,os,subprocess,sys,time
from PIL import Image, ImageStat
from playwright.async_api import async_playwright
BASE=os.environ.get('CREW_BASE','http://localhost:4200'); PW='correct-horse-battery'; OUT={'checks':[]}
if not BASE.startswith(('http://localhost','http://127.0.0.1')): sys.exit('refusing to run against a non-local server')
WORKER=os.environ.get('CREW_WORKER_EMAIL') or sys.exit('set CREW_WORKER_EMAIL (event-ready worker from KEEP=1 workflow.ts)')
AXE=open(os.environ.get('CREW_AXE_PATH') or sys.exit('set CREW_AXE_PATH to axe.min.js')).read()
SHOTS=os.environ.get('CREW_SHOTS','/tmp/shots/ops'); os.makedirs(SHOTS,exist_ok=True)
PROGRESS=os.environ.get('CREW_PROGRESS')
def ck(n,ok,info=''):
 OUT['checks'].append({'name':n,'pass':bool(ok),'info':str(info)[:250]})
 if PROGRESS: open(PROGRESS,'w').write(json.dumps(OUT,indent=1))
async def settle(p): await p.wait_for_timeout(500); await p.wait_for_load_state('networkidle')
async def login(b,email):
 c=await b.new_context(viewport={'width':1440,'height':900},permissions=['clipboard-read','clipboard-write']);p=await c.new_page()
 await p.goto(BASE+'/sign-in',wait_until='networkidle');await p.fill('#si-email',email);await p.fill('#si-password',PW);await p.locator('form button[type=submit]').click();await p.wait_for_url(lambda u:'/sign-in' not in u);await settle(p);return c,p
async def axe(p,n):
 await p.add_script_tag(content=AXE)
 v=await p.evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>r.violations.map(v=>({id:v.id,n:v.nodes.length,targets:v.nodes.slice(0,3).map(n=>n.target)})))")
 ck('axe '+n,len(v)==0,v)
async def main():
 run=str(int(time.time())); title='UI fixture terms '+run; evt='UI fixture event '+run
 async with async_playwright() as pw:
  b=await pw.chromium.launch(channel='chrome',args=['--no-sandbox']);c,p=await login(b,'admin.test@example.com')
  errs=[];p.on('pageerror',lambda e:errs.append(str(e)))
  await p.goto(BASE+'/staff/terms',wait_until='networkidle');await p.get_by_role('button',name='New terms draft').click()
  for k,v in {'Terms key':'ui-'+run,'Title':title,'Duties':'Local QA fixture only.','Compensation':'[TBD — VERIFIED DATA REQUIRED]','Pay basis':'[TBD — VERIFIED DATA REQUIRED]','Schedule':'Local QA fixture only.','Proposed engagement arrangement':'[TBD — VERIFIED DATA REQUIRED]','Acceptance requirements':'Local QA fixture only.'}.items():await p.get_by_label(k,exact=True).fill(v)
  await p.get_by_role('button',name='Save draft',exact=True).click();await settle(p)
  ts=p.locator('section').filter(has=p.get_by_role('heading',name=title+' · v1',exact=True))
  ck('terms draft saved',await ts.count()==1)
  ck('admin cannot approve terms in UI',await ts.get_by_role('button',name='Approve',exact=True).count()==0)
  await axe(p,'terms')
  ca,pa=await login(b,'approver.test@example.com');await pa.goto(BASE+'/staff/terms',wait_until='networkidle')
  t=pa.locator('section').filter(has=pa.get_by_role('heading',name=title+' · v1',exact=True));await t.get_by_role('button',name='Approve',exact=True).click();await settle(pa)
  ck('independent approver approves fixture terms','APPROVED' in await t.inner_text());await ca.close()
  await p.goto(BASE+'/staff/events',wait_until='networkidle');await p.get_by_role('button',name='New event',exact=True).click()
  await p.get_by_label('Event name',exact=True).fill(evt);await p.get_by_label('Template (published)',exact=True).select_option('seed_tpl_after_dark_v1');await p.get_by_role('button',name='Create planning event').click();await settle(p)
  await p.get_by_role('link',name=evt,exact=True).click();await settle(p)
  ck('planning event creation appears in list and opens detail','/staff/events/' in p.url,p.url);OUT['event']=p.url
  dt=p.locator('#date');await dt.get_by_label('Confirm local date').fill('2026-11-20');await dt.get_by_role('button',name='Save date').click();await settle(p)
  ck('date confirmed, overnight milestones resolved','2026-11-21 01:00' in await dt.inner_text(),(await dt.inner_text())[:200])
  # assignment intentionally not ready (venue / training / supervisor)
  ass=p.locator('#assignments');await ass.get_by_label('Person',exact=True).select_option(index=1);await ass.get_by_label('Role',exact=True).select_option('host');await ass.get_by_label('Set a shift now',exact=True).check()
  for k,v in {'Start date':'2026-11-20','Start time':'18:00','End date':'2026-11-21','End time':'01:00'}.items():await ass.get_by_label(k,exact=True).fill(v)
  await ass.get_by_role('button',name='Propose',exact=True).click();await settle(p)
  ck('assignment proposed','PROPOSED' in await ass.inner_text())
  await ass.get_by_role('button',name='Approve',exact=True).click();await settle(p);ck('assignment approved','APPROVED' in await ass.inner_text())
  await ass.get_by_role('button',name='Access & time',exact=True).click();await settle(p)
  await ass.get_by_role('button',name='Issue credential',exact=True).click();await settle(p)
  ck('credential UI reports readiness failure',await ass.locator('[role=alert]').count()>0,await ass.locator('[role=alert]').all_inner_texts())
  await ass.get_by_role('button',name='Cancel assignment',exact=True).click();await ass.get_by_label('Reason for cancelling').fill('Local QA fixture cleanup');await ass.get_by_role('button',name='Confirm cancel',exact=True).click();await settle(p)
  ck('cancel assignment UI removes active assignment',await ass.get_by_role('button',name='Access & time',exact=True).count()==0)
  ros=p.locator('#ros');await ros.get_by_label('Title',exact=True).fill('UI handoff fixture');await ros.get_by_label('Relative to milestone').select_option(index=1);await ros.get_by_role('button',name='Add item').click();await settle(p)
  ck('run-of-show saves','UI handoff fixture' in await ros.inner_text())
  cl=p.locator('#closeout');await cl.get_by_label('Coverage issues',exact=True).fill('Local QA only; no real event.');await cl.get_by_role('button',name='Save draft',exact=True).click();await settle(p)
  ck('closeout draft saves','DRAFT' in await cl.inner_text())
  await cl.get_by_role('button',name='Submit closeout').click();await settle(p)
  ck('closeout submitter selects submitted state','SUBMITTED — READ ONLY' in await cl.inner_text() and await cl.get_by_label('Coverage issues',exact=True).get_attribute('readonly') is not None,await cl.inner_text())
  await axe(p,'event detail');await p.screenshot(path=os.path.join(SHOTS,'event-after.png'),full_page=True)
  await p.get_by_role('link',name='Call sheet',exact=True).click();await settle(p)
  # Real print path: PDF with "Background graphics" ON (worst case), rasterized for evidence.
  pdf=os.path.join(SHOTS,'call-sheet-print.pdf');await p.pdf(path=pdf,format='Letter',print_background=True)
  subprocess.run(['pdftoppm','-r','80','-png','-f','1','-l','1','-singlefile',pdf,os.path.join(SHOTS,'call-sheet-print')],check=True)
  ptxt=subprocess.run(['pdftotext',pdf,'-'],capture_output=True,text=True).stdout
  lum=ImageStat.Stat(Image.open(os.path.join(SHOTS,'call-sheet-print.png')).convert('L')).mean[0]
  ck('printed call sheet (backgrounds on) is light paper with readable text',lum>230 and 'CALL SHEET' in ptxt.upper() and 'Milestones' in ptxt,f'mean_lum={lum:.0f}')
  await p.emulate_media(media='print')
  ck('print view hides print button',not await p.get_by_role('button',name='Print call sheet').is_visible());await p.emulate_media(media='screen')
  await p.goto(BASE+'/staff/campaigns',wait_until='networkidle');nn=p.locator('#new')
  for k,v in {'Name':'UI fixture campaign '+run,'Code (utm_campaign)':'ui-'+run,'Start date':'2026-10-05','Concept':'Local QA only; not launched.'}.items():await nn.get_by_label(k,exact=True).fill(v)
  await nn.get_by_role('button',name='Create campaign').click();await settle(p);ck('campaign creation','/staff/campaigns/' in p.url);OUT['campaign']=p.url
  g=p.locator('#goals')
  for k,v in {'Role key':'host','Label':'QA hosts','Target':'6','Reserve':'1'}.items():await g.get_by_label(k,exact=True).fill(v)
  await g.get_by_role('button',name='Save goal').click();await settle(p);ck('goal saved with unknown qualified','QA hosts' in await g.inner_text() and 'Unknown' in await g.inner_text())
  l=p.locator('#links');await l.get_by_label('Label',exact=True).fill('UI tracked link');await l.get_by_label('Role preselect').select_option('host')
  for k,v in {'utm_source':'qa','utm_medium':'test','utm_content':'fixture'}.items():await l.get_by_label(k,exact=True).fill(v)
  await l.get_by_role('button',name='Add link').click();await settle(p);ck('tracked link saved','utm_campaign=ui-' in await l.inner_text())
  await l.get_by_role('button',name='Copy',exact=True).first.click();await settle(p);clip=await p.evaluate('navigator.clipboard.readText()');ck('copy link writes clipboard','utm_source=qa' in clip)
  await l.get_by_role('button',name='Show QR',exact=True).first.click();await settle(p);ck('QR image loads',await l.locator('img').evaluate('(e)=>e.complete && e.naturalWidth>0'))
  tasks=p.locator('#tasks');await tasks.get_by_label('Title',exact=True).fill('UI fixture task');await tasks.get_by_role('button',name='Add task').click();await settle(p)
  task=tasks.locator('li').filter(has_text='UI fixture task');ck('task saved',await task.count()==1)
  await task.get_by_label('Status',exact=True).select_option('done');await settle(p);ck('task status persists',await task.get_by_label('Status',exact=True).input_value()=='done')
  bud=p.locator('#budget')
  for k,v in {'Category key':'qa','Label':'QA budget','Proposed (USD)':'10.25'}.items():await bud.get_by_label(k,exact=True).fill(v)
  await bud.get_by_role('button',name='Save line').click();await settle(p);ck('budget preserves unknown actual','Not recorded' in await bud.inner_text() and '$10.25' in await bud.inner_text())
  await axe(p,'campaign detail');await p.screenshot(path=os.path.join(SHOTS,'campaign-after.png'),full_page=True)
  await p.goto(BASE+'/staff/integration',wait_until='networkidle');await p.get_by_role('button',name='Send due entries now').click();await settle(p)
  ck('local mode drain sends nothing','nothing was sent' in ' '.join(await p.locator('[role=alert]').all_inner_texts()),await p.locator('[role=alert]').all_inner_texts())
  await p.get_by_role('button',name='Run reconciliation dry run').click();await settle(p);ck('reconcile returns preview',await p.get_by_text('Would transfer',exact=True).count()>0)
  await axe(p,'integration')
  await p.goto(BASE+'/staff/serve',wait_until='networkidle');await axe(p,'serve queue')
  await p.goto(BASE+'/staff/access',wait_until='networkidle');await axe(p,'staff access')
  await p.set_viewport_size({'width':390,'height':844});await p.goto(BASE+'/staff/campaigns/'+OUT['campaign'].split('/')[-1],wait_until='networkidle');await axe(p,'campaign mobile')
  ck('mobile no document overflow',await p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  # Session error must not redirect or clear token; then retry.
  await p.route('**/api/auth/get-session**',lambda route:route.fulfill(status=503,content_type='application/json',body='{"message":"QA temporary session failure","code":"QA_FAILURE"}'))
  await p.goto(BASE+'/staff/applicants',wait_until='networkidle');await settle(p)
  ck('session error preserves route + offers retry','/staff/applicants' in p.url and await p.get_by_role('button',name='Try again',exact=True).count()==1,await p.inner_text('body'))
  await p.unroute('**/api/auth/get-session**');await p.get_by_role('button',name='Try again',exact=True).click();await p.get_by_role('heading',name='Applicants',exact=True).wait_for(timeout=15000);ck('session retry restores console',True)
  OUT['page_errors']=errs;await c.close()
  # Live ready local fixture -> worker credential QR and attendance
  c,p=await login(b,WORKER);await p.goto(BASE+'/portal',wait_until='networkidle');await p.get_by_role('button',name='Credential',exact=True).click();await settle(p)
  ck('worker active credential QR loads',await p.get_by_alt_text('Your staff credential QR code').evaluate('(e)=>e.complete&&e.naturalWidth>0'));await axe(p,'worker portal')
  await p.get_by_role('button',name='Attendance',exact=True).click();await settle(p);ck('worker attendance view', 'Recorded time:' in await p.inner_text('main'))
  await p.screenshot(path=os.path.join(SHOTS,'worker-ready.png'),full_page=True);await c.close();await b.close()
 print(json.dumps(OUT,indent=1))
asyncio.run(main())
_p=sum(1 for x in OUT['checks'] if x['pass'])
print(f"operations browser: {_p}/{len(OUT['checks'])} PASS",file=sys.stderr)
sys.exit(0 if _p==len(OUT['checks']) and not OUT.get('page_errors') else 1)
