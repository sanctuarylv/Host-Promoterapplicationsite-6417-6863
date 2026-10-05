/**
 * Outbox integration suite — runs entirely in-process against a FRESH
 * disposable libSQL file (migrations 0000 + 0001 applied) and the STRICT
 * local mock of the PROPOSED Command Center contract. No dev server, no
 * shared test DB, no network beyond 127.0.0.1.
 *
 *   cd packages/web && bun tests/integration/outbox.ts
 *
 * What a pass means: the outbox honours the proposed contract (stable
 * idempotency, strict receipts, exclusive claims, bounded backoff, audited
 * manual retry, stale-claim safety). It does NOT mean a real Command Center
 * is connected — no real endpoint has been provided.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startStrictMock } from "./strict-cc-mock";
import { recorder } from "../e2e/helpers";

const dir = mkdtempSync(join(tmpdir(), "crew-outbox-it-"));
const dbFile = join(dir, "outbox.db");
const API_KEY = "test-only-not-a-secret";
const SIGNING = "test-only-signing";
const CONTRACT = "sanctuary-cc.crew.proposed-v2";
const mock = startStrictMock({ apiKey: API_KEY, signingSecret: SIGNING, contractId: CONTRACT });

// Environment BEFORE any app module is imported (the db client reads it at import).
Object.assign(process.env, {
  DATABASE_URL: `file:${dbFile}`,
  DATABASE_AUTH_TOKEN: "local-file",
  CREW_SUBMISSION_MODE: "forward",
  COMMAND_CENTER_API_BASE_URL: mock.url,
  COMMAND_CENTER_APPLICATIONS_PATH: "/proposed/crew/applications",
  COMMAND_CENTER_STATUS_PATH: "/proposed/crew/applications/{id}/status-events",
  COMMAND_CENTER_API_KEY: API_KEY,
  COMMAND_CENTER_SIGNING_SECRET: SIGNING,
  COMMAND_CENTER_TIMEOUT_MS: "1500",
  CREW_TOKEN_SECRET: "test-only-token-secret",
});
if (!process.env.DATABASE_URL!.startsWith("file:")) throw new Error("refusing non-file database");

const { migrate } = await import("drizzle-orm/libsql/migrator");
const { db } = await import("../../src/api/database");
await migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });

const { eq, and, sql } = await import("drizzle-orm");
const S = await import("../../src/api/database/schema");
const O = await import("../../src/api/crew/outbox");
const { submitApplication } = await import("../../src/api/crew/submission-service");
const { applicationSchema, CONSENT_VERSION } = await import("../../src/api/crew/contract");
const { PROPOSED_CONTRACT_ID } = await import("../../src/api/crew/command-center");
const { CANONICAL_ADAPTER, getIntegrationState, reconciliationDryRun, endpointFingerprint } = await import("../../src/api/crew/integration");
const { setSetting } = await import("../../src/api/shared/settings");

const { check, report } = recorder();
check("mock contract id matches adapter", PROPOSED_CONTRACT_ID, CONTRACT);

let seq = 0;
const input = (extra: Record<string, unknown> = {}) =>
  applicationSchema.parse({
    firstName: "Outbox",
    lastName: `Case${++seq}`,
    email: `outbox.case${seq}.${Date.now().toString(36)}@example.com`,
    phone: `(702) 555-${String(2000 + seq).padStart(4, "0")}`,
    city: "Las Vegas",
    state: "NV",
    roleInterest: "host",
    hostInterests: ["check_in"],
    instagram: "",
    tiktok: "",
    otherSocial: "",
    networkTypes: ["friends"],
    availability: "occasionally",
    eveningsAvailable: true,
    weekendsAvailable: true,
    travelRange: "las_vegas_valley",
    relevantExperience: "Hospitality front desk.",
    scenarioResponse: "Listen, check the list, escalate to the lead.",
    portfolioUrl: "",
    motivation: "I want to help build something real in this city.",
    referralSource: "friend",
    requiredConsent: true,
    marketingConsent: false,
    website: "",
    startedAt: Date.now() - 60_000,
    consentVersion: CONSENT_VERSION,
    attribution: { utmSource: "it" },
    ...extra,
  });

const rowFor = async (appId: string, op = "application.create") =>
  (await db.select().from(S.crewOutbox).where(and(eq(S.crewOutbox.aggregate_id, appId), eq(S.crewOutbox.operation, op))).limit(1))[0]!;
const app = async (id: string) => (await db.select().from(S.crewApplications).where(eq(S.crewApplications.id, id)).limit(1))[0]!;
const auditCount = async (entityId: string, action: string) =>
  Number((await db.select({ n: sql<number>`count(*)` }).from(S.crewAudit).where(and(eq(S.crewAudit.entity_id, entityId), eq(S.crewAudit.action, action))))[0]?.n ?? 0);
/** Make a row due now without touching its identity/payload (simulates time passing). */
const makeDue = (id: string) => db.update(S.crewOutbox).set({ next_attempt_at: new Date(Date.now() - 1000) }).where(eq(S.crewOutbox.id, id));
const create = async () => {
  const r = await submitApplication(input());
  if (r.kind !== "created") throw new Error(`submit ${r.kind}`);
  return r.id;
};

// ---- 1. happy path through the real submit → enqueue → inline drain ----------
const a1 = await create();
const o1 = await rowFor(a1);
check("1 outbox synced inline after submit", o1.status, "synced");
check("1 stable idempotency key", o1.idempotency_key, `crew:application.create:${a1}:v1`);
check("1 payload hash = sha256(stable payload)", o1.payload_hash, (await import("../../src/api/shared/ids")).sha256(O.stableStringify(o1.payload)));
check("1 receipt recorded", o1.receipt_id, "rcpt_1");
check("1 canonical id recorded", o1.canonical_id, "cc_app_1");
const app1 = await app(a1);
check("1 application mirror external_id", app1.external_id, "cc_app_1");
check("1 application authority canonical_mirror", app1.authority, "canonical_mirror");
check("1 mock verified auth+contract+signature+hash", mock.seen.at(-1)?.verdict, "created");
check("1 payload carries no private scoring", JSON.stringify(o1.payload).includes("scorecard"), false);

// ---- 2. lost acknowledgement → resend replays the SAME request ---------------
await db.update(S.crewOutbox).set({ status: "pending", next_attempt_at: new Date(Date.now() - 1000) }).where(eq(S.crewOutbox.id, o1.id));
check("2 resend result", await O.processOne(o1.id, "w-resend"), "synced");
check("2 mock saw same key + same hash (replay)", mock.seen.at(-1)?.verdict, "replay");
check("2 replay keeps original canonical id", (await rowFor(a1)).canonical_id, "cc_app_1");
check("2 ledger holds exactly one record for the key", [...mock.ledger.keys()].filter((k) => k.includes(a1)).length, 1);

// ---- 3. obsolete generic 201 body is NOT success ------------------------------
const a3 = await create(); // succeeds; we re-drive it against scripted responses
const o3 = (await rowFor(a3)).id;
const reset = (id: string, extra: Partial<typeof S.crewOutbox.$inferInsert> = {}) =>
  db
    .update(S.crewOutbox)
    .set({ status: "pending", attempts: 0, max_attempts: 8, receipt_id: null, canonical_id: null, synced_at: null, next_attempt_at: new Date(Date.now() - 1000), ...extra })
    .where(eq(S.crewOutbox.id, id));
await reset(o3);
await db.update(S.crewApplications).set({ external_id: null, sync_status: "pending", authority: "local_staging" }).where(eq(S.crewApplications.id, a3));
mock.script.push({ status: 201, body: { id: "cc_generic" } });
const before3 = Date.now();
check("3 generic {id} body → failed", await O.processOne(o3, "w3"), "failed");
let r3 = await rowFor(a3);
check("3 classified malformed", r3.last_error_class, "malformed");
check("3 no receipt stored", r3.receipt_id, "null");
check("3 application not marked canonical", (await app(a3)).external_id, "null");
check("3 backoff scheduled ≥ 24s (30s ±20%)", r3.next_attempt_at.getTime() - before3 >= 24_000, true);
check("3 not due yet → claim refused", await O.claim(o3, "w3b"), false);

// ---- 4. receipt for a different submission / mismatched hash -------------------
await makeDue(o3);
mock.script.push({ status: 201, body: { status: "created", submission_id: "someone-else", receipt_id: "r", canonical_id: "c" } });
await O.processOne(o3, "w4");
check("4 wrong submission_id → malformed", (await rowFor(a3)).last_error_class, "malformed");
await makeDue(o3);
mock.script.push({ status: 201, body: { status: "created", submission_id: a3, receipt_id: "r", canonical_id: "c", payload_hash: "0".repeat(64) } });
check("4 receipt hash mismatch → dead (non-retryable)", await O.processOne(o3, "w4b"), "dead");
check("4 classified conflict", (await rowFor(a3)).last_error_class, "conflict");
await reset(o3);
mock.script.push({ status: 409, body: { error: "idempotency_conflict", submission_id: a3 } });
check("4 non-replay 409 → dead", await O.processOne(o3, "w4c"), "dead");

// ---- 5. retry classes, Retry-After, attempt bounds -----------------------------
await reset(o3, { max_attempts: 3 });
mock.script.push({ status: 503, headers: { "retry-after": "120" } });
const before5 = Date.now();
check("5 503 → failed (retryable)", await O.processOne(o3, "w5"), "failed");
r3 = await rowFor(a3);
check("5 Retry-After honoured (≥120s)", r3.next_attempt_at.getTime() - before5 >= 119_000, true);
check("5 backoff capped at 6h", O.backoffMs(40) <= 6 * 3600_000, true);
check("5 Retry-After capped at 1h", (await (await import("../../src/api/crew/command-center")).interpretForwardResponse(new Response("", { status: 429, headers: { "retry-after": "999999" } }), { submissionId: "x", payloadHash: "y" }) as { retryAfterMs?: number }).retryAfterMs, 3_600_000);
await makeDue(o3);
mock.script.push({ status: 429 });
check("5 429 → failed", await O.processOne(o3, "w5b"), "failed");
await makeDue(o3);
mock.script.push({ status: 500 });
check("5 third failure at max_attempts → dead", await O.processOne(o3, "w5c"), "dead");
check("5 attempts bounded at 3", (await rowFor(a3)).attempts, 3);
await makeDue(o3);
check("5 exhausted row not claimable", await O.claim(o3, "w5d"), false);
const drain5 = await O.drainDue(50);
check("5 drain ignores dead row", drain5.results.length, 0);

// ---- 6. audited manual retry -------------------------------------------------
const actor = { userId: "it-operator", label: "it operator" };
check("6 manual retry ok", (await O.manualRetry(o3, actor, "Reviewed: transient outage")).ok, true);
r3 = await rowFor(a3);
check("6 retry grants exactly one more attempt", r3.max_attempts, 4);
check("6 status pending, key unchanged", `${r3.status}|${r3.idempotency_key}`, `pending|crew:application.create:${a3}:v1`);
check("6 audit row written", await auditCount(o3, "outbox.manual_retry"), 1);
check("6 retry of synced row refused", (await O.manualRetry(o1.id, actor, "nope")).ok, false);
check("6 next drain syncs via replay of original ledger entry", await O.processOne(o3, "w6"), "synced");
check("6 canonical is the FIRST receipt for the key (no duplicate)", (await rowFor(a3)).canonical_id, "cc_app_2");

// ---- 7. exclusive concurrent claims ------------------------------------------
const a7 = await create();
const o7 = (await rowFor(a7)).id;
await reset(o7);
const wins = await Promise.all(Array.from({ length: 12 }, (_, i) => O.claim(o7, `racer-${i}`)));
check("7 exactly one of 12 concurrent claims wins", wins.filter(Boolean).length, 1);

// ---- 8. concurrent drains send each row once -------------------------------
const many = [await create(), await create(), await create()];
for (const id of many) await reset((await rowFor(id)).id);
const sent0 = mock.seen.length;
for (let i = 0; i < 3; i++) mock.script.push({ status: 503, delayMs: 150 }); // slow, so drains overlap
const [d1, d2, d3] = await Promise.all([O.drainDue(10, "dA"), O.drainDue(10, "dB"), O.drainDue(10, "dC")]);
const outcomes = [...d1.results, ...d2.results, ...d3.results].filter((r) => r !== "skipped");
check("8 three overlapping drains: 3 real sends for 3 rows", mock.seen.length - sent0, 3);
check("8 non-skipped outcomes = 3", outcomes.length, 3);

// ---- 9. expired claim recovery + stale processor cannot overwrite -----------
const a9 = await create();
const o9 = (await rowFor(a9)).id;
await reset(o9);
await db.update(S.crewApplications).set({ external_id: null, authority: "local_staging" }).where(eq(S.crewApplications.id, a9));
const syncedAudits9 = await auditCount(o9, "outbox.synced"); // the inline create already wrote one
mock.script.push({ status: 201, delayMs: 700, body: { status: "created", submission_id: a9, receipt_id: "rcpt_stale", canonical_id: "cc_stale" } });
const stale = O.processOne(o9, "stale-worker"); // claims now, then waits on the slow response
await Bun.sleep(150);
check("9 live claim blocks a second worker", await O.claim(o9, "early"), false);
const future = new Date(Date.now() + 10 * 60_000); // claim has expired by then
const winner = await O.processOne(o9, "recovery-worker", future);
check("9 expired claim recovered by new worker", winner, "synced");
check("9 stale worker reports lost_claim", await stale, "lost_claim");
const r9 = await rowFor(a9);
check("9 outbox keeps the winner's receipt", r9.receipt_id === "rcpt_stale" ? "overwritten" : "winner", "winner");
check("9 application mirror not overwritten by stale worker", (await app(a9)).external_id === "cc_stale" ? "overwritten" : "winner", "winner");
check("9 exactly one NEW synced audit (stale worker wrote none)", (await auditCount(o9, "outbox.synced")) - syncedAudits9, 1);

// ---- 10. timeout + network classes ---------------------------------------------
await reset(o9);
mock.script.push({ status: 201, delayMs: 2500, body: {} });
await O.processOne(o9, "w10");
check("10 slow response → timeout class", (await rowFor(a9)).last_error_class, "timeout");
process.env.COMMAND_CENTER_API_BASE_URL = "http://127.0.0.1:9"; // closed port
await makeDue(o9);
await O.processOne(o9, "w10b");
check("10 refused connection → network class", (await rowFor(a9)).last_error_class, "network");
process.env.COMMAND_CENTER_API_BASE_URL = mock.url;

// ---- 11. auth failures are not retried ---------------------------------------
await reset(o9);
process.env.COMMAND_CENTER_API_KEY = "wrong-key";
check("11 401 → dead (needs a human)", await O.processOne(o9, "w11"), "dead");
check("11 classified auth", (await rowFor(a9)).last_error_class, "auth");
process.env.COMMAND_CENTER_API_KEY = API_KEY;

// ---- 12. not configured → held, attempts untouched -----------------------------
await reset(o9);
delete process.env.COMMAND_CENTER_API_KEY;
check("12 missing key → held", await O.processOne(o9, "w12"), "held");
check("12 held does not consume attempts", (await rowFor(a9)).attempts, 0);
process.env.COMMAND_CENTER_API_KEY = API_KEY;
process.env.CREW_SUBMISSION_MODE = "local";
check("12 local mode drain sends nothing", (await O.drainDue(10)).processed, 0);
process.env.CREW_SUBMISSION_MODE = "forward";

// ---- 13. status operations are separate, versioned operations -------------
await O.enqueueStatusChange(db, a1, 2, "reviewed", []);
await O.enqueueStatusChange(db, a1, 2, "reviewed", []); // duplicate enqueue is a no-op
const st = await db.select().from(S.crewOutbox).where(and(eq(S.crewOutbox.aggregate_id, a1), eq(S.crewOutbox.operation, "application.status")));
check("13 one row per (application, revision)", st.length, 1);
check("13 versioned key", st[0]?.idempotency_key, `crew:application.status:${a1}:v2`);
check("13 status op synced via status path", await O.processOne(st[0]!.id, "w13"), "synced");
check("13 posted to /{id}/status-events", mock.seen.at(-1)?.path, `/proposed/crew/applications/${a1}/status-events`);
check("13 create receipt unaffected", (await rowFor(a1)).canonical_id, "cc_app_1");

// ---- 14. reconciliation + round-trip evidence bound to endpoint -------------
await reset(o9);
mock.script.push({ status: 400, body: { error: "validation_failed" } });
check("14 setup: 400 → dead (rejected)", await O.processOne(o9, "w14"), "dead");
const rec = await reconciliationDryRun();
check("14 dry run is read-only + flags canonical unavailable", `${rec.dryRun}|${rec.canonicalComparison.startsWith("unavailable")}`, "true|true");
check("14 dead outbox row quarantined", rec.items.find((i) => i.id === a9)?.action, "quarantine");
check("14 synced app carries canonical id", rec.items.find((i) => i.id === a1)?.canonicalId, "cc_app_1");
await setSetting("cc_verified_round_trip", { at: new Date().toISOString(), receiptId: "rcpt_1", canonicalId: "cc_app_1", by: "it", environment: "local strict mock", endpoint: endpointFingerprint() }, "it");
await setSetting("cc_cutover", { at: new Date().toISOString(), by: "it", reconciliationId: "x", acknowledgedCount: 0 }, "it");
const here = await getIntegrationState();
check("14 with round trip + stored cutover → pending, not local (adapter absent)", `${here.mode}|${here.cutover}`, "pending|null");
check("14 pending reason is the adapter gate", here.reason, CANONICAL_ADAPTER.reason);
process.env.COMMAND_CENTER_API_BASE_URL = "https://command-center.invalid";
const moved = await getIntegrationState();
check("14 repointed endpoint invalidates mock-era evidence", `${moved.mode}|${moved.staleRoundTrip}`, "pending|true");
await setSetting("cc_verified_round_trip", { at: new Date().toISOString(), receiptId: "r", canonicalId: "c", by: "it", environment: "legacy" }, "it");
check("14 evidence without endpoint binding is not accepted", (await getIntegrationState()).roundTrip, "null");
process.env.COMMAND_CENTER_API_BASE_URL = mock.url;

mock.stop();
report("Outbox integration (strict proposed-contract mock)");
rmSync(dir, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
