"""
Diagnostic probe for the intermittent console_v2 check "serve: success panel focused".
LOCAL dev server + LOCAL disposable test DB only. Each attempt submits one synthetic
Serve interest (example.com address) to the dev server's local DB.

    python3 packages/web/tests/browser/serve_focus_probe.py [attempts] [mode]

  mode  natural    real requestAnimationFrame (default)
        throttled  natural, with CDP CPU throttling x6 (stretches React's render task)
        forced     requestAnimationFrame callbacks run as a microtask, i.e. BEFORE
                   React commits the success panel (forces the race order)

/serve focuses the success panel with
    setDone(true); requestAnimationFrame(() => document.getElementById("serve-done")?.focus());
The probe wraps document.getElementById so every lookup of "serve-done" records whether
the element existed at the moment the rAF callback ran. A lookup that returns null means
focus was silently skipped and never retried: the failure mode of the flaky check.

Environment: CREW_BASE (default http://localhost:4200). Prints a JSON report; never fails
the build (exit 0). The probe is evidence for docs/PHASE4_READINESS_REPORT.md §6.
"""
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright

BASE = os.environ.get("CREW_BASE", "http://localhost:4200")
if not BASE.startswith(("http://localhost", "http://127.0.0.1")):
    sys.exit("refusing to run against a non-local server")
N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
MODE = sys.argv[2] if len(sys.argv) > 2 else "natural"
assert MODE in ("natural", "throttled", "forced"), MODE

INSTRUMENT = """
(() => {
  window.__probe = [];
  const gid = Document.prototype.getElementById;
  Document.prototype.getElementById = function (id) {
    const r = gid.call(this, id);
    if (id === "serve-done") window.__probe.push({ found: !!r, t: performance.now() });
    return r;
  };
  if (%s) {
    window.requestAnimationFrame = (cb) => { queueMicrotask(() => cb(performance.now())); return 0; };
  }
})();
""" % ("true" if MODE == "forced" else "false")


async def attempt(b, i, run):
    c = await b.new_context(viewport={"width": 390, "height": 844})
    await c.add_init_script(INSTRUMENT)
    p = await c.new_page()
    if MODE == "throttled":
        cdp = await c.new_cdp_session(p)
        await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 6})
    await p.goto(BASE + "/serve", wait_until="networkidle")
    await p.fill("#firstName", "Probe")
    await p.fill("#lastName", f"Focus{run}{i}")
    await p.fill("#email", f"serve.probe+{run}{i}@example.com")
    await p.locator("#areas-welcome-label").click()
    await p.fill("#availability", "Local focus probe (QA fixture)")
    await p.get_by_text("I understand that:").click()
    await p.wait_for_timeout(3300)  # time-trap is 3 s
    await p.get_by_role("button", name="Send Serve Team interest").click()
    await p.wait_for_selector("#serve-done", timeout=15000)
    await p.wait_for_timeout(300)
    active = await p.evaluate("document.activeElement?.id || document.activeElement?.tagName")
    lookups = await p.evaluate("window.__probe")
    await c.close()
    return {"attempt": i, "focused": active == "serve-done", "active": active, "lookups": lookups}


async def main():
    run = hex(int(time.time()))[2:]
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
        res = []
        for i in range(N):
            try:
                res.append(await attempt(b, i, run))
            except Exception as e:  # report, do not hide
                res.append({"attempt": i, "focused": None, "error": str(e)[:200]})
        await b.close()
    ok = [r for r in res if r.get("focused") is True]
    bad = [r for r in res if r.get("focused") is False]
    null_lookup = [r for r in bad if r.get("lookups") and not any(l["found"] for l in r["lookups"])]
    print(json.dumps({
        "mode": MODE, "attempts": N, "focused": len(ok), "not_focused": len(bad),
        "errors": len([r for r in res if r.get("focused") is None]),
        "not_focused_with_null_lookup": len(null_lookup),
        "focused_with_found_lookup": len([r for r in ok if any(l["found"] for l in r.get("lookups", []))]),
        "results": res,
    }, indent=1))


asyncio.run(main())
