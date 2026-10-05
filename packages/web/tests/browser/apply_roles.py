"""
Public application flow, one run per role (local dev server + LOCAL test DB only).

    DATABASE_URL=file:$CREW_TEST_DB DATABASE_AUTH_TOKEN=local-file bun run dev   # in another shell
    CREW_TEST_DB=/path/to/crew-test.db python3 packages/web/tests/browser/apply_roles.py

For host, promoter, both, guest_experience_lead and promoter_manager: walks the
mobile flow, checks the role-specific scenario prompt and the confirm summary,
submits after a normal duration, checks success copy + heading focus, then reads
the stored row from the local DB (role, scenario answer, attribution, consent
separation: required consent recorded, marketing consent left off).

Regression guard: Promoter and Promoter Manager submissions were silently blocked
because the form sends `hostInterests: []` (fixed in contract.ts; see contracts.test.ts).

Environment: CREW_ROLES (comma list, default all five), CREW_BASE (default http://localhost:4200), CREW_TEST_DB (required
for stored-value checks; skipped if unset), CREW_SHOTS (optional screenshot dir).
"""
import asyncio, json, os, random, sqlite3, sys, time
from playwright.async_api import async_playwright

BASE = os.environ.get("CREW_BASE", "http://localhost:4200")
DB = os.environ.get("CREW_TEST_DB")
SHOTS = os.environ.get("CREW_SHOTS")
if not BASE.startswith(("http://localhost", "http://127.0.0.1")):
    sys.exit("refusing to run against a non-local server")
ROLES = os.environ.get("CREW_ROLES", "host,promoter,both,guest_experience_lead,promoter_manager").split(",")
SCENARIO_HINT = {
    "host": "isn't on the check-in list",
    "promoter": "invite people to a first-time Sanctuary night",
    "both": "isn't on the check-in list",
    "guest_experience_lead": "Two Hosts haven't arrived",
    "promoter_manager": "far more confirmed guests",
}
OUT = {"checks": [], "skipped": []}


def ck(name, ok, info=""):
    OUT["checks"].append({"name": name, "pass": bool(ok), "info": str(info)[:250]})


async def run_role(b, role, run):
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    pg = await ctx.new_page()
    errs, status = [], []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("response", lambda r: status.append(r.status) if "/api/rpc/crew/submit" in r.url else None)
    await pg.goto(f"{BASE}/crew/apply?role={role}&utm_source=qa&utm_campaign=qa-{run}&ref=ABC123", wait_until="networkidle")
    email = f"apply.{role}.{run}@example.com"
    scenario_label = ""
    for _ in range(16):
        if await pg.is_visible("#firstName"):
            await pg.fill("#firstName", "Vee")
            await pg.fill("#lastName", f"{role.title().replace('_', '')}{run}")
            await pg.fill("#email", email)
            await pg.fill("#phone", f"702555{random.randint(1000, 9999)}")
            await pg.fill("#city", "Las Vegas")
            await pg.select_option("#state", "NV")
        if await pg.is_visible("#instagram"):
            await pg.fill("#instagram", "@vee.qa")
            await pg.click("#networkTypes-friends-label")
        if await pg.is_visible("#travelRange-within_50mi-label"):
            await pg.click("#travelRange-within_50mi-label")
            await pg.click("#availability-one_two_monthly-label")
            await pg.click("#eveningsAvailable-yes-label")
            await pg.click("#weekendsAvailable-yes-label")
        if await pg.is_visible("#promoterInviteRange-11_25-label"):
            await pg.click("#promoterInviteRange-11_25-label")
            await pg.click("#promoterExperience-no-label")
        if await pg.is_visible("#hostInterests-check_in-label"):
            await pg.click("#hostInterests-check_in-label")
        if await pg.is_visible("#relevantExperience"):
            scenario_label = await pg.evaluate("document.querySelector('label[for=scenarioResponse]')?.innerText || ''")
            await pg.fill("#relevantExperience", "Front desk at a hotel for two years (QA fixture).")
            await pg.fill("#scenarioResponse", f"QA scenario answer for {role}: stay calm, check, escalate, follow up.")
        if await pg.is_visible("#motivation"):
            await pg.fill("#motivation", "I want to help build a room people feel welcome in.")
            await pg.click("#referralSource-qr_code-label")
        if await pg.is_visible("#requiredConsent-label"):
            break
        await pg.get_by_role("button", name="Continue").click()
        await pg.wait_for_timeout(400)
    # innerText reflects CSS text-transform (labels render uppercase), so compare case-insensitively.
    ck(f"{role}: role-specific scenario prompt", SCENARIO_HINT[role].lower() in scenario_label.lower(), scenario_label[:120])
    summary = await pg.evaluate("document.querySelector('main')?.innerText || ''")
    ck(f"{role}: confirm step names the paid operator", "Sanctuary LV Group" in summary)
    ck(f"{role}: marketing consent is separate and unticked", not await pg.locator("#marketingConsent").is_checked())
    await pg.click("#requiredConsent-label")
    ck(f"{role}: required consent ticked", await pg.locator("#requiredConsent").is_checked())
    await pg.wait_for_timeout(3500)  # normal human duration
    await pg.get_by_role("button", name="Submit application").click()
    await pg.wait_for_timeout(2500)
    ck(f"{role}: submit accepted", status and status[-1] == 200, status or (await pg.evaluate("[...document.querySelectorAll('[role=alert],[aria-invalid=true]')].map(e=>e.id||e.innerText).join(' | ')")))
    body = await pg.evaluate("document.body.innerText")
    ck(f"{role}: success copy", "Our team will review your application" in body and "no need to apply again" in body)
    ck(f"{role}: success heading focused", await pg.evaluate("document.activeElement?.tagName") == "H1")
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        await pg.screenshot(path=os.path.join(SHOTS, f"apply-{role}-success.png"), full_page=True)
    ck(f"{role}: no page errors", not errs, errs[:2])
    await ctx.close()

    if not DB:
        OUT["skipped"].append(f"{role}: stored values (CREW_TEST_DB unset)")
        return
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    row = con.execute("select * from crew_applications where email_normalized = ?", (email,)).fetchone()
    con.close()
    ck(f"{role}: stored", row is not None)
    if row is None:
        return
    ck(f"{role}: stored role", row["role_interest"] == role, row["role_interest"])
    ck(f"{role}: stored scenario answer", (row["scenario_response"] or "").startswith(f"QA scenario answer for {role}"))
    ck(f"{role}: stored attribution", (row["utm_source"], row["utm_campaign"], row["referral_code_used"]) == ("qa", f"qa-{run}", "ABC123"), (row["utm_source"], row["utm_campaign"], row["referral_code_used"]))
    ck(f"{role}: consent separation", bool(row["required_consent_at"]) and row["marketing_consent"] == 0 and row["marketing_consent_at"] is None)
    ck(f"{role}: linked to a person", bool(row["person_id"]))


async def main():
    run = hex(int(time.time()))[2:]
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
        for role in ROLES:
            try:
                await run_role(b, role, run)
            except Exception as e:
                ck(f"{role}: SUITE ERROR", False, repr(e)[:250])
        await b.close()


asyncio.run(main())
print(json.dumps(OUT, indent=1))
passed = sum(1 for x in OUT["checks"] if x["pass"])
print(f"apply roles browser: {passed}/{len(OUT['checks'])} PASS ({len(OUT['skipped'])} skipped)", file=sys.stderr)
sys.exit(0 if passed == len(OUT["checks"]) else 1)
