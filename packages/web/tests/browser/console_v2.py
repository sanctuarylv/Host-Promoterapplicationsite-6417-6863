"""
Browser pass for the v2 console changes (local dev server + LOCAL test DB only).

    # dev server must point at a disposable local libSQL file, never the remote DB:
    DATABASE_URL=file:/path/to/crew-test.db DATABASE_AUTH_TOKEN=local-file bun run dev
    python3 packages/web/tests/browser/console_v2.py

Covers: /serve validation, normal-duration submission, success focus, Serve queue
status mutation; staff grant UI (role-conditional event/department fields, reset
on role change), grant + revoke of a temporary local identity; campaign results
scope (role/date filters, invalid range, scope label); integration cutover is
blocked in this build. Optional axe checks when CREW_AXE_PATH points at axe.min.js.

Environment (all optional):
  CREW_BASE          default http://localhost:4200
  CREW_ADMIN_EMAIL   default admin.test@example.com  (local test account)
  CREW_PASSWORD      default correct-horse-battery   (local test password)
  CREW_AXE_PATH      path to axe.min.js (axe-core 4.x); axe checks skipped if unset
  CREW_SHOTS         directory for screenshots; none written if unset
Writes a JSON report to stdout; exit code 1 on any failure.
"""
import asyncio, json, os, re, sys, time
from playwright.async_api import async_playwright

BASE = os.environ.get("CREW_BASE", "http://localhost:4200")
ADMIN = os.environ.get("CREW_ADMIN_EMAIL", "admin.test@example.com")
PW = os.environ.get("CREW_PASSWORD", "correct-horse-battery")
AXE = open(os.environ["CREW_AXE_PATH"]).read() if os.environ.get("CREW_AXE_PATH") else None
SHOTS = os.environ.get("CREW_SHOTS")
if not BASE.startswith(("http://localhost", "http://127.0.0.1")):
    sys.exit("refusing to run against a non-local server")
OUT = {"checks": [], "skipped": []}


def ck(name, ok, info=""):
    OUT["checks"].append({"name": name, "pass": bool(ok), "info": str(info)[:250]})


async def settle(p, ms=500):
    await p.wait_for_load_state("networkidle")
    await p.wait_for_timeout(ms)


async def shot(p, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        await p.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=True)


async def axe(p, name):
    if not AXE:
        OUT["skipped"].append(f"axe {name} (CREW_AXE_PATH unset)")
        return
    await p.add_script_tag(content=AXE)
    v = await p.evaluate(
        "axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})"
        ".then(r=>r.violations.map(v=>({id:v.id,n:v.nodes.length})))"
    )
    ck(f"axe {name}", len(v) == 0, v)


async def login(b, email):
    c = await b.new_context(viewport={"width": 1440, "height": 900})
    p = await c.new_page()
    await p.goto(BASE + "/sign-in", wait_until="networkidle")
    await p.fill("#si-email", email)
    await p.fill("#si-password", PW)
    await p.locator("form button[type=submit]").click()
    await p.wait_for_url(lambda u: "/sign-in" not in u, timeout=10000)
    await settle(p)
    return c, p


async def main():
    run = hex(int(time.time()))[2:]
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
        errs = []

        # ---------------------------------------------------------------- /serve
        c = await b.new_context(viewport={"width": 390, "height": 844})
        p = await c.new_page()
        p.on("pageerror", lambda e: errs.append(str(e)))
        await p.goto(BASE + "/serve", wait_until="networkidle")
        await p.get_by_role("button", name="Send Serve Team interest").click()
        alert = await p.get_by_role("alert").inner_text()
        ck("serve: empty submit shows error summary", "need attention" in alert, alert)
        ck("serve: first invalid field focused", await p.evaluate("document.activeElement?.id") == "firstName", await p.evaluate("document.activeElement?.id"))
        serve_last = f"Serve{run}"
        await p.fill("#firstName", "Sera")
        await p.fill("#lastName", serve_last)
        await p.fill("#email", f"serve+{run}@example.com")
        await p.locator("#areas-welcome-label").click()
        await p.fill("#availability", "Friday evenings (local QA fixture)")
        await p.get_by_text("I understand that:").click()
        ck("serve: area + acknowledgement toggled via their labels", await p.get_by_label("Welcome & greeting").is_checked() and await p.locator("#acknowledged").is_checked())
        await p.wait_for_timeout(3500)  # normal human duration (time-trap is 3 s)
        await p.get_by_role("button", name="Send Serve Team interest").click()
        await p.wait_for_selector("#serve-done", timeout=10000)
        await p.wait_for_timeout(200)
        ck("serve: success panel focused", await p.evaluate("document.activeElement?.id") == "serve-done")
        ck("serve: success copy makes no promise", "doesn't confirm a place" in await p.locator("#serve-done").inner_text())
        await axe(p, "serve success (mobile)")
        await shot(p, "serve-success-mobile")
        await c.close()

        # ---------------------------------------------------------------- staff
        c, p = await login(b, ADMIN)
        p.on("pageerror", lambda e: errs.append(str(e)))

        # Serve queue status mutation
        await p.goto(BASE + "/staff/serve", wait_until="networkidle")
        item = p.locator("li").filter(has_text=serve_last).first
        ck("serve queue: new interest listed", await item.count() == 1)
        await item.get_by_label("Status", exact=True).select_option("contacted")
        await item.get_by_label("Internal note (optional)").fill("Called (QA fixture)")
        await item.get_by_role("button", name="Update").click()
        await settle(p)
        item = p.locator("li").filter(has_text=serve_last).first
        ck("serve queue: status updated", "CONTACTED" in (await item.inner_text()).upper(), (await item.inner_text())[:120])
        await axe(p, "staff serve")

        # Staff access: conditional fields + grant/revoke of a temporary identity
        temp = f"access+{run}@example.com"
        r = await p.request.post(BASE + "/api/auth/sign-up/email", data={"email": temp, "password": PW, "name": "Access Fixture"}, headers={"origin": BASE})
        ck("temporary local identity created", r.status == 200, r.status)
        await p.goto(BASE + "/staff/access", wait_until="networkidle")
        role = p.get_by_label("Role", exact=True)
        await role.select_option("recruiter")
        ck("recruiter: no event or department field", await p.get_by_label("Limit to event").count() == 0 and await p.get_by_label("Department key").count() == 0)
        await role.select_option("event_director")
        ck("event director: event field only", await p.get_by_label("Limit to event").count() == 1 and await p.get_by_label("Department key").count() == 0)
        await role.select_option("department_lead")
        ck("department lead: event + department fields", await p.get_by_label("Limit to event").count() == 1 and await p.get_by_label("Department key").count() == 1)
        await p.get_by_label("Department key").fill("guest_experience")
        await role.select_option("event_director")
        await role.select_option("department_lead")
        ck("role change resets department key", await p.get_by_label("Department key").input_value() == "")
        await role.select_option("recruiter")
        await p.get_by_label("Account email").fill(temp)
        await p.get_by_role("button", name="Grant", exact=True).click()
        await settle(p)
        members = p.locator("#members")
        ck("grant: membership listed", temp in await members.inner_text())
        revoke = p.get_by_role("button", name=f"Revoke Recruiter for {temp}")
        ck("revoke button has a row-specific accessible name", await revoke.count() == 1)
        await revoke.click()
        await p.get_by_label("Reason for revoking").fill("QA fixture cleanup")
        await p.get_by_role("button", name="Confirm revoke").click()
        await settle(p)
        ck("revoke: membership removed", temp not in await p.locator("#members").inner_text())
        await axe(p, "staff access")

        # Campaign results scope
        await p.goto(BASE + "/staff/campaigns", wait_until="networkidle")
        first = p.locator("a[href^='/staff/campaigns/']").first
        # Planning-seed (demo) campaigns are labelled; ordinary ones are not.
        seed_li = p.locator("#list li", has_text="Build the Night")
        if await seed_li.count():
            ck("campaign list: planning seed labelled", await seed_li.first.get_by_text("Planning seed", exact=True).count() == 1)
            plain = p.locator("#list li", has_text="UI fixture campaign")
            if await plain.count():
                ck("campaign list: non-seed not labelled", await plain.first.get_by_text("Planning seed", exact=True).count() == 0)
            await seed_li.first.locator("a").click()
            await settle(p)
            ck("campaign detail: seed eyebrow says not live results", "planning seed, not live results" in (await p.locator("main").inner_text()).lower())
            await p.go_back()
            await settle(p)
        else:
            OUT["skipped"].append("planning-seed label (seed campaign absent)")
        if await first.count() == 0:
            OUT["skipped"].append("campaign scope (no campaigns in this DB)")
        else:
            await first.click()
            await settle(p)
            mt = p.locator("#metrics")
            ck("campaign: default scope label", "all roles · all dates" in await mt.inner_text())
            await mt.get_by_label("Role", exact=True).select_option("promoter")
            await settle(p)
            ck("campaign: role scope label", "role: promoter" in await mt.inner_text())
            await mt.get_by_label("Applied from").fill("2026-10-10")
            await mt.get_by_label("Applied to").fill("2026-10-01")
            await settle(p)
            ck("campaign: inverted range flagged, not queried", "end date must be on or after" in await mt.inner_text() and await mt.get_by_label("Applied to").get_attribute("aria-invalid") == "true")
            await mt.get_by_label("Applied to").fill("2026-10-31")
            await settle(p)
            ck("campaign: date scope label with timezone", "applied 2026-10-10 to 2026-10-31 (America/Los_Angeles)" in await mt.inner_text(), (await mt.inner_text())[:200])
            ck("campaign: filtered scope hides cost per outcome", "clear the filters" in await mt.inner_text())
            await mt.get_by_role("button", name="Clear filters").click()
            await settle(p)
            ck("campaign: clear restores whole campaign", "all roles · all dates" in await mt.inner_text())
            await axe(p, "campaign detail")
            await shot(p, "campaign-scope")

        # Integration: cutover blocked in this build
        await p.goto(BASE + "/staff/integration", wait_until="networkidle")
        await p.get_by_role("button", name="Run reconciliation dry run").click()
        await settle(p, 800)
        rc = p.locator("#reconcile")
        txt = await rc.inner_text()
        rt = p.locator("[data-testid='readiness-table']")
        states = await rt.locator("[data-check]").evaluate_all("els => Object.fromEntries(els.map(e => [e.dataset.check, e.dataset.state]))")
        ck("readiness: Command Center row is never PASS", states.get("command_center") == "blocked_external", states.get("command_center"))
        ck("readiness: live ticketing blocked, legal keys blocked for user input", states.get("ticketing") == "blocked_external" and states.get("legal:VITE_SANCTUARY_TERMS_URL") == "blocked_user", states)
        rtxt = await rt.inner_text()
        ck("readiness: shows no IP addresses", not re.search(r"\b\d{1,3}(\.\d{1,3}){3}\b", rtxt), rtxt[:120])
        await shot(p, "integration-readiness")
        ck("integration: cutover form not offered", await rc.get_by_label("Type CUTOVER").count() == 0 and "Cutover is disabled in this build" in txt, txt[-200:])
        await axe(p, "staff integration")
        await c.close()

        ck("no page errors", not errs, errs[:3])
        await b.close()


try:
    asyncio.run(main())
except Exception as e:  # report what ran, then fail
    ck("SUITE ERROR", False, repr(e)[:250])
print(json.dumps(OUT, indent=1))
passed = sum(1 for x in OUT["checks"] if x["pass"])
print(f"console v2 browser: {passed}/{len(OUT['checks'])} PASS ({len(OUT['skipped'])} skipped)", file=sys.stderr)
sys.exit(0 if passed == len(OUT["checks"]) else 1)
