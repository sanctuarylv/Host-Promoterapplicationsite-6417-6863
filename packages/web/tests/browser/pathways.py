"""
Paid Group vs nonprofit pathway separation, checked on the rendered pages
(acceptance item 2). Local dev server + LOCAL test DB only.

    DATABASE_URL=file:/path/to/crew-test.db DATABASE_AUTH_TOKEN=local-file bun run dev
    CREW_WORKER_EMAIL=<linked worker> python3 packages/web/tests/browser/pathways.py

Covers landing, FAQ, /serve, /sign-in, the worker portal and the staff terms
page. The apply form's confirm step is covered by apply_roles.py ("confirm step
names the paid operator"). Copy is compared case-insensitively on textContent
because several labels are uppercased with CSS.

Environment:
  CREW_BASE          default http://localhost:4200
  CREW_ADMIN_EMAIL   default admin.test@example.com
  CREW_WORKER_EMAIL  optional; a linked worker account for the portal check
  CREW_PASSWORD      default correct-horse-battery
Writes a JSON report to stdout; exit code 1 on any failure.
"""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("CREW_BASE", "http://localhost:4200")
ADMIN = os.environ.get("CREW_ADMIN_EMAIL", "admin.test@example.com")
WORKER = os.environ.get("CREW_WORKER_EMAIL")
PW = os.environ.get("CREW_PASSWORD", "correct-horse-battery")
if not BASE.startswith(("http://localhost", "http://127.0.0.1")):
    sys.exit("refusing to run against a non-local server")
OUT = {"checks": [], "skipped": []}

PAID = "sanctuary lv group"
NONPROFIT = "sanctuary lv nonprofit"


def ck(name, ok, info=""):
    OUT["checks"].append({"name": name, "pass": bool(ok), "info": str(info)[:250]})


async def text(p, sel="body"):
    t = await p.locator(sel).first.evaluate("e => e.textContent")
    return re.sub(r"\s+", " ", t or "").lower()


async def login(b, email):
    c = await b.new_context(viewport={"width": 1280, "height": 900})
    p = await c.new_page()
    await p.goto(BASE + "/sign-in", wait_until="networkidle")
    await p.fill("#si-email", email)
    await p.fill("#si-password", PW)
    await p.locator("form button[type=submit]").click()
    await p.wait_for_url(lambda u: "/sign-in" not in u, timeout=10000)
    await p.wait_for_load_state("networkidle")
    return c, p


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
        errs = []
        c = await b.new_context(viewport={"width": 390, "height": 844})
        p = await c.new_page()
        p.on("pageerror", lambda e: errs.append(str(e)))

        # Landing + pathways section
        await p.goto(BASE + "/crew", wait_until="networkidle")
        t = await text(p)
        ck("landing: paid roles operated by Sanctuary LV Group", f"operated by {PAID}" in t, t[:160])
        ck("landing: candidate-interest status shown", "candidate interest" in t)
        serve_links = await p.locator("#pathways a[href='/serve']").count()
        ck("landing: pathways section links to /serve", serve_links >= 1, serve_links)
        sec = await text(p, "#pathways")
        ck("landing: Serve card says unpaid and separate", "unpaid" in sec and "separate" in sec, sec[-200:])
        ck("landing: no pay rate claims", not re.search(r"\$\s?\d+\s?(/|per)\s?(hr|hour)", t))

        # FAQ
        q = p.get_by_role("button", name=re.compile("rather volunteer", re.I))
        await q.click()
        panel = await p.locator(f"#{await q.get_attribute('aria-controls')}").evaluate("e => e.textContent")
        panel = (panel or "").lower()
        ck("faq: volunteer answer names the nonprofit", NONPROFIT in panel, panel[:160])
        ck("faq: volunteer answer says unpaid and separate", "unpaid" in panel and "separate" in panel)
        q0 = p.get_by_role("button", name=re.compile("paid role", re.I))
        if await q0.get_attribute("aria-expanded") != "true":
            await q0.click()
        panel0 = ((await p.locator(f"#{await q0.get_attribute('aria-controls')}").evaluate("e => e.textContent")) or "").lower()
        ck("faq: paid answer names the Group and no confirmed pay", PAID in panel0 and "no paid openings" in panel0, panel0[:200])

        # /serve
        await p.goto(BASE + "/serve", wait_until="networkidle")
        t = await text(p, "main")
        ck("serve: nonprofit + unpaid eyebrow", f"{NONPROFIT} · unpaid" in t, t[:160])
        ck("serve: describes its own sign-up and consent", "own sign-up" in t and "consent" in t)
        ck("serve: title names the nonprofit", NONPROFIT in (await p.title()).lower(), await p.title())
        ck("serve: no compensation promised", not re.search(r"\b(you will be paid|paid shift|hourly rate)\b", t))

        # /sign-in
        await p.goto(BASE + "/sign-in", wait_until="networkidle")
        ck("sign-in: links to the Group application", await p.locator("a[href='/crew/apply']", has_text=re.compile("Sanctuary LV Group", re.I)).count() == 1)
        ck("sign-in: links to the nonprofit Serve Team", await p.locator("a[href='/serve']", has_text=re.compile("nonprofit", re.I)).count() == 1)
        await c.close()

        # Existing short referral links (/r/:code) still resolve and keep the
        # code as last-touch (session) and first-touch (local) attribution.
        rc = await b.new_context(viewport={"width": 390, "height": 844})
        rp = await rc.new_page()
        rp.on("pageerror", lambda e: errs.append(str(e)))
        await rp.goto(BASE + "/r/leg123?utm_source=flyer", wait_until="networkidle")
        u = rp.url
        ck("referral: /r/:code redirects to /crew with ref", "/crew?" in u and "ref=leg123" in u.lower(), u)
        ck("referral: other query params survive redirect", "utm_source=flyer" in u, u)
        last = json.loads(await rp.evaluate("sessionStorage.getItem('sx_attr_last') || '{}'"))
        first = json.loads(await rp.evaluate("localStorage.getItem('sx_attr_first') || '{}'"))
        ck("referral: last-touch stores referralCode", last.get("referralCode") == "LEG123", last)
        ck("referral: last-touch keeps utm_source", last.get("utmSource") == "flyer", last)
        ck("referral: first-touch stores referralCode with expiry", first.get("referralCode") == "LEG123" and first.get("expiresAt", 0) > 0, first)
        # Navigating inside the site without params must not wipe the code.
        await rp.goto(BASE + "/crew/apply", wait_until="networkidle")
        last2 = json.loads(await rp.evaluate("sessionStorage.getItem('sx_attr_last') || '{}'"))
        ck("referral: code persists into /crew/apply", last2.get("referralCode") == "LEG123", last2)
        await rc.close()
        # Invalid codes are dropped rather than stored.
        rc = await b.new_context()
        rp = await rc.new_page()
        await rp.goto(BASE + "/r/%3Cscript%3E", wait_until="networkidle")
        bad = json.loads(await rp.evaluate("sessionStorage.getItem('sx_attr_last') || '{}'"))
        ck("referral: invalid code is not stored", "referralCode" not in bad, bad)
        await rc.close()

        # Portal (signed-in worker)
        if WORKER:
            wc, wp = await login(b, WORKER)
            await wp.goto(BASE + "/portal", wait_until="networkidle")
            await wp.wait_for_timeout(600)
            t = await text(wp, "main")
            ck("portal: names both entities", f"operated by {PAID}" in t and NONPROFIT in t, t[:200])
            ck("portal: links to /serve pathway", await wp.locator("main a[href='/serve']").count() >= 1)
            await wc.close()
        else:
            OUT["skipped"].append("portal (CREW_WORKER_EMAIL unset)")

        # Staff terms page
        await asyncio.sleep(2)
        ac, ap = await login(b, ADMIN)
        await ap.goto(BASE + "/staff/terms", wait_until="networkidle")
        await ap.wait_for_timeout(600)
        t = await text(ap, "main")
        ck("staff terms: scoped to Sanctuary LV Group", PAID in t, t[:160])
        await ac.close()

        ck("no page errors", not errs, errs[:3])
        await b.close()
    passed = sum(1 for x in OUT["checks"] if x["pass"])
    OUT["summary"] = f"{passed}/{len(OUT['checks'])}"
    print(json.dumps(OUT, indent=1))
    sys.exit(0 if passed == len(OUT["checks"]) else 1)


asyncio.run(main())
