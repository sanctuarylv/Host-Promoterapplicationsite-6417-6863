"""
Phase 3 read-only taxonomy review panels on /staff/taxonomy, plus the
Sanctuary LV Group / Sanctuary LV (nonprofit Serve) branding regression.
Local dev server + LOCAL test DB only.

    DATABASE_URL=file:/path/to/crew-test.db DATABASE_AUTH_TOKEN=local-file bun run dev
    python3 packages/web/tests/browser/taxonomy_review.py

Checks the six review panels render the reviewed counts (36 roles / 66 seats,
9 credential gaps, 35 training gaps, 51 -> 72 template seats), that production
is shown as NOT authorized, that the runner decision is "None", that every
human authorization is pending, and that no panel contains a button, input,
select, textarea or form (display only). Network: asserts the page issues no
non-GET/oRPC-mutation requests other than sign-in.

Environment:
  CREW_BASE          default http://localhost:4200
  CREW_ADMIN_EMAIL   default admin.test@example.com
  CREW_PASSWORD      default correct-horse-battery
  CREW_SHOTS         optional directory for screenshots
  CREW_AXE_PATH      path to axe.min.js (axe-core 4.x); axe check skipped if unset

Phase 4 adds the decision register (90 decisions, every one pending, 8 closed
gates, 11 pending authorizations) and the credential / training resolution
matrix (9 credential proposals, 35 training proposals, granted No, 0
completions, 17 proposed modules that do not exist) — both display only.
Writes a JSON report to stdout; exit code 1 on any failure.
"""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("CREW_BASE", "http://localhost:4200")
ADMIN = os.environ.get("CREW_ADMIN_EMAIL", "admin.test@example.com")
PW = os.environ.get("CREW_PASSWORD", "correct-horse-battery")
SHOTS = os.environ.get("CREW_SHOTS")
AXE_PATH = os.environ.get("CREW_AXE_PATH")
AXE = open(AXE_PATH).read() if AXE_PATH else None
if not BASE.startswith(("http://localhost", "http://127.0.0.1")):
    sys.exit("refusing to run against a non-local server")
OUT = {"checks": [], "skipped": []}

PANELS = ["approval-checklist", "decision-register", "resolution-matrix", "role-review", "runner-decision", "credential-review", "training-review", "template-comparison"]
# oRPC procedures this page may call. Anything else (and any non-GET outside /api/rpc) is a failure.
# oRPC reads are POSTs, so the check is on the procedure name, not the method.
ALLOWED_RPC = {"staffingTaxonomy/preview", "me/session"}


def ck(name, ok, info=""):
    OUT["checks"].append({"name": name, "pass": bool(ok), "info": str(info)[:250]})


async def axe(p, name, include=None):
    if not AXE:
        OUT["skipped"].append(f"axe {name} (CREW_AXE_PATH unset)")
        return
    await p.add_script_tag(content=AXE)
    ctx = json.dumps({"include": include}) if include else "document"
    v = await p.evaluate(
        f"axe.run({ctx},{{runOnly:{{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}}})"
        ".then(r=>r.violations.map(v=>({id:v.id,n:v.nodes.length})))"
    )
    ck(f"axe {name}", len(v) == 0, v)


async def text(p, sel="body"):
    t = await p.locator(sel).first.evaluate("e => e.textContent")
    return re.sub(r"\s+", " ", t or "").lower()


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
        errs = []

        # ------------------------------------------------------------ branding regression (anonymous)
        c = await b.new_context(viewport={"width": 1280, "height": 900})
        p = await c.new_page()
        p.on("pageerror", lambda e: errs.append(str(e)))
        for path in ["/crew", "/crew/faq", "/sign-in"]:
            await p.goto(BASE + path, wait_until="networkidle")
            t = await text(p)
            ck(f"branding {path}: shows Sanctuary LV Group", "sanctuary lv group" in t, t[:140])
        await p.goto(BASE + "/serve", wait_until="networkidle")
        t = await text(p)
        title = (await p.title()).lower()
        ck("branding /serve: shows Sanctuary LV (nonprofit)", "sanctuary lv nonprofit" in t, t[:140])
        ident = await text(p, "main p.eyebrow") + " " + await text(p, "#serve-title")
        ck("branding /serve: Serve Team identity (eyebrow + h1) never says Group", "group" not in ident, ident)
        # The Group may only appear as the separate paid operator it is contrasted with.
        mentions = re.findall(r".{0,60}sanctuary lv group.{0,10}", t)
        ck("branding /serve: Group named only as the separate paid operator", all(re.search(r"(operated by|with|paid)", m) for m in mentions), mentions[:3])
        ck("branding /serve: title is nonprofit, not Group", "sanctuary lv" in title and "group" not in title, title)
        await c.close()

        # ------------------------------------------------------------ staff page
        c = await b.new_context(viewport={"width": 1440, "height": 1000})
        p = await c.new_page()
        p.on("pageerror", lambda e: errs.append(str(e)))
        reqs = []
        p.on("request", lambda r: reqs.append((r.method, r.url)))
        await p.goto(BASE + "/sign-in", wait_until="networkidle")
        await p.fill("#si-email", ADMIN)
        await p.fill("#si-password", PW)
        await p.locator("form button[type=submit]").click()
        await p.wait_for_url(lambda u: "/sign-in" not in u, timeout=10000)
        await p.wait_for_load_state("networkidle")
        reqs.clear()

        await p.goto(BASE + "/staff/taxonomy", wait_until="networkidle")
        await p.wait_for_selector("[data-testid='approval-checklist']", timeout=15000)

        ck("import-status banner still present", "nothing imported" in await text(p, "[data-testid='import-status']"))
        for pid in PANELS:
            ck(f"panel #{pid} rendered", await p.locator(f"section#{pid}").count() == 1)
            interactive = await p.locator(f"section#{pid}").locator("button, input, select, textarea, form, [contenteditable=true]").count()
            ck(f"panel #{pid} is display-only (no controls)", interactive == 0, interactive)
        nav = await p.locator("nav a[href^='#']").evaluate_all("els => els.map(e => e.getAttribute('href'))")
        ck("section nav links to all review panels", all(f"#{pid}" in nav for pid in PANELS), nav)

        # Approval checklist
        ap = p.locator("[data-testid='approval-checklist']")
        ck("checklist: data-production-authorized=false", await ap.get_attribute("data-production-authorized") == "false")
        ck("checklist: 'Production authorized: No'", (await text(p, "[data-testid='production-authorized']")).strip() == "no")
        integ = await text(p, "[data-testid='integrity-checks']")
        ck("checklist: source hash shown and matching", "36dac8e8c7eb7ac529e25cdb217dc758582e6fecc4556163b81ad0ab35cf8892" in integ and "mismatch" not in integ, integ[:200])
        ck("checklist: plan hash shown and matching", "8c22363803999b763305dc8961dcc6b7226271c15c28829ce14aff842cfcd701" in integ, integ[:200])
        auto_n = await p.locator("[data-testid='checklist-automated'] > li").count()
        ck("checklist: 12 automated evidence items", auto_n == 12, auto_n)
        auto_t = await text(p, "[data-testid='checklist-automated']")
        ck("checklist: no automated item fails", "fail" not in auto_t, auto_t[:200])
        rec_n = await p.locator("[data-testid='checklist-recorded'] > li").count()
        ck("checklist: 8 recorded evidence items (separate list)", rec_n == 8, rec_n)
        human_rows = p.locator("[data-testid='checklist-human'] tbody tr")
        hn = await human_rows.count()
        ck("checklist: 10 human authorizations", hn == 10, hn)
        statuses = await human_rows.evaluate_all("rs => rs.map(r => r.lastElementChild.textContent.trim().toLowerCase())")
        ck("checklist: every human authorization pending", hn > 0 and all("pending" in s for s in statuses), statuses)
        ck("checklist: no human authorization shows approved", not any(re.search(r"\b(approved|authorized)\b", s) for s in statuses), statuses)

        # Phase 4: decision register
        dr = p.locator("[data-testid='decision-register']")
        ck("register: data-production-authorized=false", await dr.get_attribute("data-production-authorized") == "false")
        ck("register: 90 total / 90 pending", await dr.get_attribute("data-total") == "90" and await dr.get_attribute("data-pending") == "90")
        ck("register: decided = 0", (await text(p, "[data-testid='decisions-decided']")).strip() == "0")
        items = p.locator("[data-testid='decision-items'] tbody tr")
        n_items = await items.count()
        ck("register: 90 decision rows", n_items == 90, n_items)
        st = await items.evaluate_all("rs => rs.map(r => r.getAttribute('data-status'))")
        ck("register: every decision data-status=pending", n_items > 0 and set(st) == {"pending"}, sorted(set(st)))
        dec = await items.evaluate_all("rs => rs.map(r => r.lastElementChild.textContent.trim().toLowerCase())")
        ck("register: every decision value 'none'", n_items > 0 and set(dec) == {"none"}, sorted(set(dec)))
        doms = await items.evaluate_all("rs => rs.map(r => r.getAttribute('data-domain'))")
        ck("register: 89 Group + 1 nonprofit (serve patch only)", doms.count("sanctuary_lv_group") == 89 and doms.count("sanctuary_lv_nonprofit") == 1, {d: doms.count(d) for d in set(doms)})
        srv = await p.locator("[data-decision='D-SRV-001']").get_attribute("data-domain")
        ck("register: D-SRV-001 is the nonprofit item", srv == "sanctuary_lv_nonprofit", srv)
        gates = p.locator("[data-testid='release-gates'] tbody tr")
        go = await gates.evaluate_all("rs => rs.map(r => r.getAttribute('data-open'))")
        ck("register: 8 release gates, all closed", len(go) == 8 and set(go) == {"false"}, go)
        auth = await p.locator("[data-testid='register-authorizations'] tbody tr").evaluate_all("rs => rs.map(r => r.getAttribute('data-status'))")
        ck("register: 11 authorizations, all pending", len(auth) == 11 and set(auth) == {"pending"}, auth)
        rt = await text(p, "section#decision-register")
        ck("register: no approved/authorized decision wording", not re.search(r"status[^.]{0,20}\b(approved|decided)\b", rt), rt[:120])

        # Phase 4: resolution matrix
        rm = p.locator("[data-testid='resolution-matrix']")
        ck("matrix: data-granted-any=false, completions 0", await rm.get_attribute("data-granted-any") == "false" and await rm.get_attribute("data-completions") == "0")
        ck("matrix: 'Credentials granted: No'", (await text(p, "[data-testid='resolution-granted']")).strip() == "no")
        crow = p.locator("[data-testid='resolution-credentials'] tbody tr")
        cg = await crow.evaluate_all("rs => rs.map(r => [r.getAttribute('data-granted'), r.getAttribute('data-status'), r.lastElementChild.textContent.trim()])")
        ck("matrix: 9 credential proposals, granted No, status proposed", len(cg) == 9 and all(x == ["false", "proposed", "No"] for x in cg), cg[:3])
        ck("matrix: no credential proposal uses all_staff", "all_staff" not in " ".join(await crow.evaluate_all("rs => rs.map(r => r.children[5].textContent)")), "")
        zr = await p.locator("[data-testid='zone-reconciliation'] tbody tr").evaluate_all("rs => rs.map(r => r.getAttribute('data-role') + ':' + r.getAttribute('data-delta'))")
        ck("matrix: venue_liaison narrows vs v1", "venue_liaison:narrows" in zr, zr)
        ck("matrix: 8 non-same zone deltas", sum(1 for z in zr if not z.endswith(":same")) == 8, zr)
        fl = await p.locator("[data-testid='security-flags'] li").count()
        ck("matrix: 11 security flags", fl == 11, fl)
        trow = p.locator("[data-testid='resolution-training'] tbody tr")
        tg = await trow.evaluate_all("rs => rs.map(r => [r.getAttribute('data-completion'), r.getAttribute('data-status'), r.lastElementChild.textContent.trim()])")
        ck("matrix: 35 training proposals, completion No", len(tg) == 35 and all(x == ["false", "proposed", "No"] for x in tg), tg[:3])
        pm = await p.locator("[data-testid='proposed-modules'] tbody tr").evaluate_all("rs => rs.map(r => r.getAttribute('data-exists'))")
        ck("matrix: 17 proposed modules, none exist", len(pm) == 17 and set(pm) == {"false"}, pm)
        await axe(p, "decision register + resolution matrix", [["section#decision-register"], ["section#resolution-matrix"]])
        await axe(p, "staff taxonomy page")

        # Role review
        rr = await p.locator("[data-testid='role-review'] tbody tr").count()
        ck("role review: 36 rows", rr == 36, rr)
        tot = await text(p, "[data-testid='role-review-totals']")
        ck("role review totals: 36 roles / 66 seats", "36" in tot and "66" in tot, tot)

        # Runner
        rd = p.locator("[data-testid='runner-decision']")
        ck("runner: data-classification=unresolved", await rd.get_attribute("data-classification") == "unresolved")
        ck("runner: data-decision=none", await rd.get_attribute("data-decision") == "none")
        ck("runner: decision value 'None'", (await text(p, "[data-testid='runner-decision-value']")).strip() == "none")
        on = await p.locator("[data-testid='runner-options'] > li").count()
        ck("runner: four options listed", on == 4, on)
        rt = await text(p, "section#runner-decision")
        ck("runner: no option recommended", "no option is selected or recommended" in rt, rt[-200:])

        # Credential + training
        cr = await p.locator("[data-testid='credential-review'] tbody tr").count()
        ck("credential review: 9 rows", cr == 9, cr)
        tr = await p.locator("[data-testid='training-review'] tbody tr").count()
        ck("training review: 35 rows", tr == 35, tr)
        ck("training review: phrase index present", await p.locator("[data-testid='training-phrase-index'] li").count() >= 1)

        # Template comparison
        ctot = await text(p, "[data-testid='comparison-totals']")
        ck("comparison: 51 -> 72 (+21)", "51" in ctot and "72" in ctot and "21" in ctot, ctot)
        bridge = await text(p, "[data-testid='comparison-bridge']")
        ck("comparison: bridge rows present", "count changes" in bridge and "new canonical roles" in bridge, bridge[:200])
        wf = await text(p, "[data-testid='comparison-workforce']")
        ck("comparison: workforce split incl. nonprofit_serve", "paid" in wf and ("nonprofit" in wf or "serve" in wf), wf[:200])
        ck("comparison: preview only", "preview" in await text(p, "section#template-comparison"))

        # Branding on staff page + no writes
        ck("staff page: Sanctuary LV Group branding", "sanctuary lv group" in await text(p))
        rpc = sorted({re.sub(r".*/api/rpc/", "", u).split("?")[0] for (m, u) in reqs if "/api/rpc/" in u})
        other = [(m, u) for (m, u) in reqs if "/api/" in u and "/api/rpc/" not in u and m != "GET"]
        ck("staff page: only read procedures called", set(rpc) <= ALLOWED_RPC and not other, {"rpc": rpc, "other": other})
        ck("no page errors", not errs, errs[:3])

        if SHOTS:
            os.makedirs(SHOTS, exist_ok=True)
            for pid in PANELS:
                await p.locator(f"section#{pid}").screenshot(path=os.path.join(SHOTS, f"taxonomy-review-{pid}.jpg"), quality=70, type="jpeg")
        await b.close()

    passed = sum(1 for x in OUT["checks"] if x["pass"])
    OUT["summary"] = f"{passed}/{len(OUT['checks'])} PASS"
    print(json.dumps(OUT, indent=1))
    sys.exit(0 if passed == len(OUT["checks"]) else 1)


asyncio.run(main())
