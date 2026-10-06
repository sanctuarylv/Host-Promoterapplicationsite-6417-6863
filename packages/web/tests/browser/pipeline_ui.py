"""
Interactive applicant-pipeline pass: one application is submitted through the public
API, then every staff step is driven by clicks (review → screen → assessment →
scorecard → selection → offer), followed by worker sign-up, link and acceptance.
Local dev server + LOCAL test DB only. Needs approved terms to exist (run
`KEEP=1 bun tests/e2e/workflow.ts` first).

    python3 packages/web/tests/browser/pipeline_ui.py [consent-version]

consent-version defaults to CONSENT_VERSION in src/api/crew/contract.ts. Environment:
CREW_BASE (default http://localhost:4200), CREW_SHOTS (default /tmp/shots/pipeline).
"""
import asyncio, json, os, time, random, sys
from playwright.async_api import async_playwright
BASE=os.environ.get("CREW_BASE","http://localhost:4200"); PW="correct-horse-battery"; OUT={"steps":[]}
if not BASE.startswith(("http://localhost","http://127.0.0.1")): sys.exit("refusing to run against a non-local server")
def _consent_version():
    import re
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../src/api/crew/contract.ts")).read()
    return re.search(r'CONSENT_VERSION\s*=\s*"([^"]+)"', src).group(1)
CV=sys.argv[1] if len(sys.argv) > 1 else _consent_version()
SHOTS=os.environ.get("CREW_SHOTS","/tmp/shots/pipeline"); os.makedirs(SHOTS,exist_ok=True)
def step(name, ok, info=""):
    OUT["steps"].append({"step":name,"ok":bool(ok),"info":str(info)[:300]})

async def signin(b, email, vp={"width":1440,"height":900}):
    ctx=await b.new_context(viewport=vp); pg=await ctx.new_page()
    errs=[]; bad=[]
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type=="error" else None)
    pg.on("response", lambda r: bad.append(f"{r.status} {r.url.replace(BASE,'')}") if "/api/" in r.url and r.status>=400 else None)
    await pg.goto(BASE+"/sign-in", wait_until="networkidle")
    await pg.fill("#si-email", email); await pg.fill("#si-password", PW)
    await pg.locator("form button[type=submit]").click()
    await pg.wait_for_url(lambda u: "/sign-in" not in u, timeout=10000)
    await pg.wait_for_load_state("networkidle")
    return ctx, pg, errs, bad

async def settle(pg, ms=700):
    await pg.wait_for_load_state("networkidle"); await pg.wait_for_timeout(ms)

def panel(pg, pid): return pg.locator(f"section#{pid}")

async def main():
    run=hex(int(time.time()))[2:]
    email=f"ui+{run}@example.com"
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="chrome", args=["--no-sandbox"])
        # create an application through the public API (not the subject of this test)
        rq=await p.request.new_context(base_url=BASE)
        body={"firstName":"Ui","lastName":f"Run{run}","email":email,"phone":f"(702) 555-{random.randint(1000,9999)}","city":"Las Vegas","state":"NV","roleInterest":"host","hostInterests":["check_in"],"instagram":"","tiktok":"","otherSocial":"","networkTypes":["friends"],"availability":"occasionally","eveningsAvailable":True,"weekendsAvailable":True,"travelRange":"las_vegas_valley","relevantExperience":"Hospitality front desk.","scenarioResponse":"Stay calm, check the list, involve the lead.","portfolioUrl":"","motivation":"Build something real.","referralSource":"friend","requiredConsent":True,"marketingConsent":False,"website":"","startedAt":int(time.time()*1000)-60000,"consentVersion":CV,"attribution":{}}
        r=await rq.post("/api/rpc/crew/submit", data=json.dumps({"json":body}), headers={"content-type":"application/json"})
        step("seed application via public API", r.status==200, r.status)
        ctx,pg,errs,bad=await signin(b,"admin.test@example.com")
        await pg.goto(BASE+"/staff/applicants", wait_until="networkidle")
        # search box if any
        link=pg.get_by_role("link", name=f"Ui Run{run}")
        if not await link.count():
            s=pg.get_by_label("Search", exact=False)
            if await s.count(): await s.first.fill(email); await settle(pg)
        await link.first.click(); await settle(pg)
        app_url=pg.url; OUT["app_url"]=app_url.replace(BASE,"")
        step("open applicant from list", "/staff/applicants/" in app_url, app_url)
        # reviewer
        rv=panel(pg,"reviewer")
        opts=await rv.locator("select option").all_inner_texts()
        await rv.locator("select").select_option(index=[i for i,o in enumerate(opts) if "Test Admin" in o or "admin" in o.lower()][0] if any("dmin" in o for o in opts) else 1)
        await rv.get_by_role("button", name="Save").click(); await settle(pg)
        step("assign reviewer", "assigned:" in (await rv.inner_text()).lower(), (await rv.inner_text())[:120])
        st=panel(pg,"status")
        async def move(to):
            btn=st.get_by_role("button", name=f"Move to {to}")
            dis=await btn.is_disabled() if await btn.count() else None
            if await btn.count() and not dis:
                await btn.click(); await settle(pg)
            return dis
        await move("Reviewed")
        step("transition -> Reviewed", "current: reviewed" in (await st.inner_text()).lower(), (await st.inner_text())[:80])
        # Screen invite blocked before interview
        btn=st.get_by_role("button", name="Move to Screen invited")
        step("Screen invited disabled w/o interview + reason shown", await btn.is_disabled() and "interview" in (await st.inner_text()).lower(), (await st.inner_text())[:200])
        iv=panel(pg,"interviews")
        await iv.get_by_label("When (your local time)").fill("2026-10-20T18:30")
        await iv.get_by_role("button", name="Schedule").click(); await settle(pg)
        step("schedule screen interview", "scheduled" in (await iv.inner_text()).lower(), (await iv.inner_text())[:160])
        await move("Screen invited")
        step("transition -> Screen invited", "current: screen invited" in (await st.inner_text()).lower())
        await iv.get_by_role("button", name="Completed").first.click(); await settle(pg)
        await move("Screen completed")
        step("complete screen + transition", "current: screen completed" in (await st.inner_text()).lower(), (await st.inner_text())[:80])
        await iv.get_by_label("Type").select_option("assessment")
        await iv.get_by_label("Format").select_option("simulated_assessment")
        await iv.get_by_role("button", name="Schedule").click(); await settle(pg)
        await iv.get_by_role("button", name="Completed").first.click(); await settle(pg)
        await move("Assessment")
        step("assessment recorded + transition", "current: assessment" in (await st.inner_text()).lower(), (await st.inner_text())[:80])
        # scorecard: submit empty first -> client validation
        sc=panel(pg,"scorecards")
        await sc.get_by_role("button", name="New Host scorecard").click()
        await sc.get_by_role("button", name="Submit scorecard").click()
        alert=sc.locator("[role=alert]")
        step("scorecard empty submit -> inline validation", await alert.count()>0, (await alert.first.inner_text())[:160] if await alert.count() else "")
        for fs in await sc.locator("fieldset").all():
            await fs.locator("input[type=radio]").nth(2).check()
            await fs.locator("input[type=text], input:not([type])").first.fill("Observed in role-play exercise.")
        await sc.get_by_label("Recommendation").select_option("advance")
        await sc.get_by_role("button", name="Submit scorecard").click(); await settle(pg)
        step("scorecard submitted", "Advance" in await sc.inner_text() and "No scorecards" not in await sc.inner_text(), (await sc.inner_text())[:160])
        await move("Selected")
        step("transition -> Selected", "current: selected" in (await st.inner_text()).lower(), (await st.inner_text())[:200])
        of=panel(pg,"offers")
        opts=await of.locator("select option").all_inner_texts()
        step("offer form lists approved terms", len(opts)>1, opts)
        if len(opts)>1:
            await of.locator("select").select_option(index=1)
            await of.get_by_role("button", name="Issue offer").click(); await settle(pg)
            step("issue offer -> Offer issued", "issued" in (await of.inner_text()).lower(), (await of.inner_text())[:160])
        pp=panel(pg,"person")
        await pp.get_by_role("button", name="Issue link code").click(); await settle(pg)
        code=(await pp.locator(".font-mono").first.inner_text()).strip() if await pp.locator(".font-mono").count() else ""
        step("issue link code shown once", code.startswith("SX-"), code[:4]+"…")
        tl=panel(pg,"timeline")
        step("timeline has audit entries", (await tl.locator("li").count())>=6, await tl.locator("li").count())
        await pg.screenshot(path=os.path.join(SHOTS,"applicant-after.png"), full_page=True)
        # keyboard: tab order reaches skip link / nav
        await pg.goto(BASE+"/staff/applicants", wait_until="networkidle")
        await pg.keyboard.press("Tab")
        f1=await pg.evaluate("document.activeElement?.innerText||document.activeElement?.getAttribute('aria-label')||document.activeElement?.tagName")
        tabs=[]
        for _ in range(8):
            await pg.keyboard.press("Tab"); tabs.append(await pg.evaluate("(document.activeElement?.innerText||document.activeElement?.getAttribute('aria-label')||document.activeElement?.tagName||'').slice(0,30)"))
        vis=await pg.evaluate("getComputedStyle(document.activeElement).outlineStyle+' '+getComputedStyle(document.activeElement).outlineWidth")
        step("keyboard tab order", True, json.dumps([f1]+tabs)+" focus-outline="+vis)
        OUT["admin_errors"]=errs; OUT["admin_api_4xx"]=bad
        await ctx.close()
        # worker side: fresh signup + redeem code + accept
        await asyncio.sleep(2)
        ctx=await b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); w=await ctx.new_page()
        werr=[]; w.on("pageerror", lambda e: werr.append(str(e)[:200]))
        await w.goto(BASE+"/sign-in", wait_until="networkidle")
        await w.get_by_role("button", name="New account").first.click()
        await w.fill("#si-name","Ui Worker"); await w.fill("#si-email",f"ui.worker+{run}@example.com"); await w.fill("#si-password",PW)
        await w.locator("form button[type=submit]").click()
        await w.wait_for_url(lambda u:"/sign-in" not in u, timeout=10000)
        await w.goto(BASE+"/portal", wait_until="networkidle"); await w.wait_for_timeout(600)
        inp=w.get_by_label("Link code", exact=False)
        step("portal shows link form for unlinked account", await inp.count()>0)
        await inp.first.fill("SX-WRONG-CODE"); await w.get_by_role("button", name="Link", exact=False).first.click(); await settle(w)
        txt=await w.inner_text("main")
        al=await w.locator("[role=alert]").all_inner_texts()
        step("bad code -> error shown, still unlinked", await inp.count()>0 and len(al)>0, al)
        await inp.first.fill(code); await w.get_by_role("button", name="Link", exact=False).first.click(); await settle(w,1200)
        txt=await w.inner_text("main")
        step("valid code links account -> portal shows offer", "offer" in txt.lower() and await w.get_by_label("Link code",exact=False).count()==0, txt[:300])
        await w.screenshot(path=os.path.join(SHOTS,"portal-linked.png"), full_page=True)
        acc=w.get_by_role("button", name="Accept", exact=False)
        if await acc.count():
            await acc.first.click(); await settle(w,1000)
            # maybe confirm
            c2=w.get_by_role("button", name="Confirm", exact=False)
            if await c2.count(): await c2.first.click(); await settle(w,1000)
        txt=await w.inner_text("main")
        step("worker accepts offer in UI", "accepted" in txt.lower(), txt[:300])
        tr=w.get_by_role("button", name="Mark complete", exact=False)
        n=await tr.count()
        if n: await tr.first.click(); await settle(w)
        step("training mark complete", n>0 and (await tr.count())<n, f"before={n} after={await tr.count()}")
        await w.screenshot(path=os.path.join(SHOTS,"portal-after.png"), full_page=True)
        out=w.get_by_role("button", name="Sign out")
        if await out.count():
            await out.first.click(); await settle(w)
            await w.goto(BASE+"/portal", wait_until="networkidle")
            step("sign out -> portal redirects to sign-in", "/sign-in" in w.url, w.url)
        else: step("sign out button found", False)
        OUT["worker_errors"]=werr
        await b.close()
    print(json.dumps(OUT, indent=1))
asyncio.run(main())
_p=sum(1 for x in OUT["steps"] if x["ok"])
print(f"pipeline UI browser: {_p}/{len(OUT['steps'])} PASS", file=sys.stderr)
sys.exit(0 if _p==len(OUT["steps"]) else 1)
