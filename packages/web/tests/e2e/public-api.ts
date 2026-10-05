/**
 * Public intake contract (crew.submit v2, crew.serveInterest, crew.track)
 * against the LOCAL dev server + LOCAL test DB.
 * Run from packages/web:  bun tests/e2e/public-api.ts
 */
import { CONSENT_VERSION } from "../../src/api/crew/contract";
import { SERVE_CONSENT_VERSION } from "../../src/api/crew/serve-contract";
import { q, recorder, rpc } from "./helpers";

const { check, report } = recorder();
const run = Date.now().toString(36);
const phone = () => `(702) 555-${String(1000 + Math.floor(Math.random() * 8999))}`;

const v2 = (n: string, role: string, extra: Record<string, unknown> = {}) => ({
  firstName: "Test",
  lastName: n,
  email: `qa+${run}-${n}@example.com`,
  phone: phone(),
  city: "Las Vegas",
  state: "NV",
  roleInterest: role,
  instagram: "@qa.test",
  tiktok: "",
  otherSocial: "",
  networkTypes: ["friends"],
  availability: "occasionally",
  eveningsAvailable: true,
  weekendsAvailable: false,
  travelRange: "las_vegas_valley",
  relevantExperience: "Two years of front-desk hospitality.",
  scenarioResponse: "Stay calm, listen, check the list, bring in the lead.",
  portfolioUrl: "",
  motivation: "I want to help build something real in this city.",
  referralSource: "friend",
  requiredConsent: true,
  marketingConsent: false,
  website: "",
  startedAt: Date.now() - 60_000,
  consentVersion: CONSENT_VERSION,
  attribution: {
    utmSource: "ig",
    landingPath: "/crew",
    referringUrl: "https://l.instagram.com/?u=secret",
    firstTouch: { referringUrl: "https://ex.com/p?token=abc&x=1", landingPath: "/crew?ref=ABC", utm_source: "ig" },
  },
  ...extra,
});
const apps = (email: string) => q<{ n: number }>("select count(*) n from crew_applications where email_normalized = lower(?)", [email]);

// ---- valid + persistence -------------------------------------------------
const host = v2("host", "host", { hostInterests: ["check_in"] });
check("host v2 valid -> 200", (await rpc("crew/submit", host)).status, 200);
const [row] = await q<Record<string, string | number | null>>(
  "select travel_range, relevant_experience, scenario_response, consent_version, contract_version, authority, pathway, opportunity_key, attribution_json, referring_url, person_id from crew_applications where email_normalized = ?",
  [host.email],
);
check("row persisted", !!row, true);
check("travel_range stored", row?.travel_range, "las_vegas_valley");
check("scenario_response stored", row?.scenario_response, host.scenarioResponse);
check("consent_version stored", row?.consent_version, CONSENT_VERSION);
check("contract_version", row?.contract_version, "crew-application.v2");
check("authority=local_staging", row?.authority, "local_staging");
check("pathway=paid_group", row?.pathway, "paid_group");
const attr = String(row?.attribution_json ?? "");
check("firstTouch token stripped", attr.includes("token=abc"), false);
check("referring_url query stripped", String(row?.referring_url ?? "").includes("secret"), false);
const [ob] = await q<{ status: string; operation: string }>("select status, operation from crew_outbox where aggregate_id = (select id from crew_applications where email_normalized = ?)", [host.email]);
check("outbox row held (CC not configured)", `${ob?.operation}:${ob?.status}`, "application.create:held");
const [person] = await q<{ n: number }>("select count(*) n from crew_people where id = ?", [String(row?.person_id)]);
check("crew_people row linked", person?.n, 1);

// ---- validation ----------------------------------------------------------
for (const k of ["travelRange", "relevantExperience", "scenarioResponse"]) {
  const r = await rpc("crew/submit", v2(`miss-${k}`, "host", { hostInterests: ["check_in"], [k]: undefined }));
  check(`missing ${k} -> 400 BAD_REQUEST`, `${r.status}:${r.code}`, "400:BAD_REQUEST");
}
const badUrl = await rpc("crew/submit", v2("badurl", "host", { hostInterests: ["check_in"], portfolioUrl: "javascript:alert(1)" }));
check("javascript: portfolio url -> 400", badUrl.status, 400);
const noHost = await rpc("crew/submit", v2("nohost", "host"));
check("host without hostInterests -> 400", noHost.status, 400);
const noConsent = await rpc("crew/submit", v2("nocons", "host", { hostInterests: ["check_in"], requiredConsent: false }));
check("requiredConsent=false -> 400", noConsent.status, 400);

// ---- consent version -----------------------------------------------------
const stale = v2("stale", "host", { hostInterests: ["check_in"], consentVersion: "2026-10-03.v1" });
const staleR = await rpc("crew/submit", stale);
check("stale consent -> 412 PRECONDITION_FAILED", `${staleR.status}:${staleR.code}`, "412:PRECONDITION_FAILED");
check("stale consent not stored", (await apps(stale.email))[0]?.n, 0);
const missing = v2("nover", "host", { hostInterests: ["check_in"], consentVersion: undefined });
const missingR = await rpc("crew/submit", missing);
check("missing consentVersion -> 412", missingR.status, 412);
check("missing consentVersion not stored", (await apps(missing.email))[0]?.n, 0);

// ---- abuse / enumeration -------------------------------------------------
const honey = v2("honey", "host", { hostInterests: ["check_in"], website: "spam.biz" });
check("honeypot -> 200 (silent)", (await rpc("crew/submit", honey)).status, 200);
check("honeypot not stored", (await apps(honey.email))[0]?.n, 0);
const fast = v2("fast", "host", { hostInterests: ["check_in"], startedAt: Date.now() - 500 });
check("too-fast -> 200 (silent)", (await rpc("crew/submit", fast)).status, 200);
check("too-fast not stored", (await apps(fast.email))[0]?.n, 0);

const dupR = await rpc("crew/submit", { ...v2("dup", "host", { hostInterests: ["check_in"] }), email: host.email.toUpperCase() });
check("duplicate email -> 200, same shape", `${dupR.status}:${dupR.text.includes('"status":"received"')}`, "200:true");
check("duplicate did not create a row", (await apps(host.email))[0]?.n, 1);
const [dupCount] = await q<{ d: number }>("select duplicate_attempts d from crew_applications where email_normalized = ?", [host.email]);
check("duplicate_attempts incremented", dupCount?.d, 1);

// ---- concurrency: same email x5 in parallel ------------------------------
const race = v2("race", "both", { promoterInviteRange: "6_10", promoterExperience: false, hostInterests: ["seating"] });
const raced = await Promise.all(Array.from({ length: 5 }, () => rpc("crew/submit", race)));
check("5 concurrent same-email -> all 200", raced.map((r) => r.status).join(","), "200,200,200,200,200");
check("5 concurrent same-email -> exactly 1 application", (await apps(race.email))[0]?.n, 1);
const [racePeople] = await q<{ n: number }>("select count(*) n from crew_people where email_normalized = ?", [race.email]);
check("5 concurrent same-email -> exactly 1 person", racePeople?.n, 1);

// ---- same phone, different emails: flagged, never merged ------------------
const sharedPhone = phone();
const p1 = v2("ph1", "host", { hostInterests: ["check_in"], phone: sharedPhone });
const p2 = v2("ph2", "host", { hostInterests: ["check_in"], phone: sharedPhone.replace(/\D/g, "") });
await Promise.all([rpc("crew/submit", p1), rpc("crew/submit", p2)]);
const phoneRows = await q<{ email_normalized: string; phone_shared: number }>("select email_normalized, phone_shared from crew_people where email_normalized in (?, ?) order by email_normalized", [p1.email, p2.email]);
check("same phone -> 2 separate people", phoneRows.length, 2);
check("same phone -> both flagged phone_shared", phoneRows.every((r) => Number(r.phone_shared) === 1), true);

// ---- Serve Team (nonprofit) ----------------------------------------------
const serve = (n: string, extra: Record<string, unknown> = {}) => ({
  firstName: "Serve",
  lastName: n,
  email: `serve+${run}-${n}@example.com`,
  phone: "",
  city: "Henderson",
  areas: ["welcome", "setup_teardown"],
  availability: "Friday evenings",
  notes: "",
  acknowledged: true,
  consentVersion: SERVE_CONSENT_VERSION,
  website: "",
  startedAt: Date.now() - 30_000,
  ...extra,
});
const s1 = serve("ok");
check("serveInterest valid -> 200", (await rpc("crew/serveInterest", s1)).status, 200);
const [srow] = await q<Record<string, string>>("select consent_version, status, areas from serve_interest where email_normalized = ?", [s1.email]);
check("serve row stored with serve consent", srow?.consent_version, SERVE_CONSENT_VERSION);
check("serve row status received", srow?.status, "received");
check("serve NOT in paid applications table", (await apps(s1.email))[0]?.n, 0);
check("serve duplicate -> 200", (await rpc("crew/serveInterest", { ...s1, email: s1.email.toUpperCase() })).status, 200);
const [sCount] = await q<{ n: number }>("select count(*) n from serve_interest where email_normalized = ?", [s1.email]);
check("serve duplicate -> still 1 row", sCount?.n, 1);
const sStale = await rpc("crew/serveInterest", serve("stale", { consentVersion: CONSENT_VERSION }));
check("serve with paid consent version -> 412", sStale.status, 412);
const sHoney = serve("honey", { website: "x" });
await rpc("crew/serveInterest", sHoney);
const [hCount] = await q<{ n: number }>("select count(*) n from serve_interest where email_normalized = ?", [sHoney.email]);
check("serve honeypot not stored", hCount?.n, 0);
check("serve without acknowledgement -> 400", (await rpc("crew/serveInterest", serve("noack", { acknowledged: false }))).status, 400);
check("serve no areas -> 400", (await rpc("crew/serveInterest", serve("noarea", { areas: [] }))).status, 400);

// ---- versions + analytics allowlist --------------------------------------
const fv = await rpc("crew/formVersions", undefined);
check("formVersions exposes current versions", fv.text.includes(CONSENT_VERSION) && fv.text.includes(SERVE_CONSENT_VERSION), true);
check("track allowlisted -> 200", (await rpc("crew/track", { name: "crew_page_view", sessionId: "qa_session_1", props: { path: "/crew" } })).status, 200);
check("track unknown name -> 400", (await rpc("crew/track", { name: "evil_event" })).status, 400);

report("public-api");
