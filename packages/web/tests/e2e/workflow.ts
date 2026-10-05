/**
 * End-to-end staffing workflow against the LOCAL dev server + LOCAL test DB:
 *   public application → review → screen → assessment → scorecard → selected
 *   → terms (drafted by drafter, approved by compensation approver; admin refused)
 *   → offer → explicit account link (SX- code) → worker accepts
 *   → assignment (unclassified / venue / cross-department / overlap guards)
 *   → approve → credential → door verify + check-in → worker attendance
 *   → cancel → credential revoked everywhere.
 *
 * Creates a fresh worker account per run (sign-up) so it can be re-run.
 * Run from packages/web:  bun tests/e2e/workflow.ts
 */
import { CONSENT_VERSION } from "../../src/api/crew/contract";
import { clientFor, outcome, signIn } from "./auth-smoke";
import { ORIGIN, q, recorder, rpc, sleep } from "./helpers";

const { check, report } = recorder();
const run = Date.now().toString(36);
const PASSWORD = "correct-horse-battery";
const pause = () => sleep(11_000); // Better Auth sign-in limit (3 per 10 s)

async function signUp(email: string, name: string): Promise<string> {
  const r = await fetch(`${ORIGIN}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD, name }),
  });
  const tok = r.headers.get("set-auth-token");
  if (r.status !== 200 || !tok) throw new Error(`sign-up ${email} -> ${r.status} ${(await r.text()).slice(0, 160)}`);
  return tok;
}

// ---- 1. public application ---------------------------------------------------
const email = `flow+${run}@example.com`;
const sub = await rpc("crew/submit", {
  firstName: "Flow",
  lastName: `Run${run}`,
  email,
  phone: `(702) 555-${String(1000 + Math.floor(Math.random() * 8999))}`,
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
  relevantExperience: "Front-desk hospitality for two years.",
  scenarioResponse: "Listen, stay calm, check the list, bring in the lead.",
  portfolioUrl: "",
  motivation: "Help build something real in this city.",
  referralSource: "friend",
  requiredConsent: true,
  marketingConsent: false,
  website: "",
  startedAt: Date.now() - 60_000,
  consentVersion: CONSENT_VERSION,
  attribution: {},
});
check("public submit -> 200", sub.status, 200);
const [appRow] = await q<{ id: string; person_id: string }>("select id, person_id from crew_applications where email_normalized = ?", [email]);
if (!appRow) throw new Error("application not persisted");
const appId = appRow.id;
const personId = appRow.person_id;

// ---- 2. staff pipeline (admin) -------------------------------------------------
const admin = clientFor(await signIn("admin.test@example.com"));
const adminSession = await admin.me.session();
const adminUserId = adminSession.user.id;
let d = await admin.recruiting.detail({ id: appId });
check("detail authority=local_staging", d.app.authority, "local_staging");
check("selected blocked before review", d.next.find((g) => g.to === "selected") ? "listed" : "not-next", "not-next");

let rev = (await admin.recruiting.assignReviewer({ id: appId, revision: d.app.revision, reviewerUserId: adminUserId, dueAt: null })).revision;
rev = (await admin.recruiting.transition({ id: appId, revision: rev, to: "reviewed" })).revision;
check("stale revision -> CONFLICT", await outcome(admin.recruiting.transition({ id: appId, revision: rev - 1, to: "screen_invited" })), "CONFLICT");
check("screen_invited w/o interview -> PRECONDITION_FAILED", await outcome(admin.recruiting.transition({ id: appId, revision: rev, to: "screen_invited" })), "PRECONDITION_FAILED");
const screen = await admin.recruiting.scheduleInterview({ applicationId: appId, kind: "screen", format: "phone", scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), interviewerUserId: adminUserId });
rev = (await admin.recruiting.transition({ id: appId, revision: rev, to: "screen_invited" })).revision;
await admin.recruiting.updateInterview({ id: screen.id, revision: 1, status: "completed", notes: "Clear communicator." });
rev = (await admin.recruiting.transition({ id: appId, revision: rev, to: "screen_completed" })).revision;
await admin.recruiting.scheduleInterview({ applicationId: appId, kind: "assessment", format: "simulated_assessment", scheduledAt: null, interviewerUserId: adminUserId });
rev = (await admin.recruiting.transition({ id: appId, revision: rev, to: "assessment" })).revision;
check("selected w/o scorecard -> PRECONDITION_FAILED", await outcome(admin.recruiting.transition({ id: appId, revision: rev, to: "selected" })), "PRECONDITION_FAILED");
check(
  "promoter scorecard on host app -> BAD_REQUEST",
  await outcome(admin.recruiting.submitScorecard({ applicationId: appId, kind: "promoter", scores: {}, evidence: {}, recommendation: "advance" })),
  "BAD_REQUEST",
);
const ev5 = "Observed in the simulated door scenario.";
await admin.recruiting.submitScorecard({
  applicationId: appId,
  kind: "host",
  scores: { communication: 3, guest_judgment: 3, reliability: 4, teamwork: 3, respectful_guidance: 3 },
  evidence: { communication: ev5, guest_judgment: ev5, reliability: ev5, teamwork: ev5, respectful_guidance: ev5 },
  recommendation: "advance",
});
rev = (await admin.recruiting.transition({ id: appId, revision: rev, to: "selected" })).revision;
check("offer_issued is workflow-only", await outcome(admin.recruiting.transition({ id: appId, revision: rev, to: "offer_issued" })), "PRECONDITION_FAILED");

// ---- 3. terms: separation of duties --------------------------------------------
await pause();
const drafter = clientFor(await signIn("drafter.test@example.com"));
const terms = await drafter.terms.draft({
  termsKey: `qa-host-${run}`,
  roleKey: "host",
  title: "Host (QA fixture terms)",
  duties: "QA fixture — not real terms.",
  compensation: "[TBD — VERIFIED DATA REQUIRED]",
  payBasis: "[TBD — VERIFIED DATA REQUIRED]",
  schedule: "QA fixture schedule.",
  engagementArrangement: "[TBD — VERIFIED DATA REQUIRED]",
  acceptanceRequirements: "QA fixture acceptance requirements.",
});
check("drafter cannot approve own terms", await outcome(drafter.terms.approve({ id: terms.id })), "FORBIDDEN");
check("admin cannot approve terms", await outcome(admin.terms.approve({ id: terms.id })), "FORBIDDEN");
check("offer with unapproved terms -> PRECONDITION_FAILED", await outcome(admin.offers.issue({ applicationId: appId, revision: rev, termsId: terms.id, expiresInDays: 7 })), "PRECONDITION_FAILED");
await pause();
const approver = clientFor(await signIn("approver.test@example.com"));
check("compensation approver approves", await outcome(approver.terms.approve({ id: terms.id })), "OK");
check("approver cannot read recruiting", await outcome(approver.recruiting.list({})), "FORBIDDEN");

const offer = await admin.offers.issue({ applicationId: appId, revision: rev, termsId: terms.id, expiresInDays: 7 });
const [appAfterOffer] = await q<{ s: string }>("select application_status s from crew_applications where id = ?", [appId]);
check("application -> offer_issued", appAfterOffer?.s, "offer_issued");

// ---- 4. explicit account link + accept -------------------------------------------
await pause();
const workerTok = await signUp(`flow.worker+${run}@example.com`, `Flow Worker ${run}`);
const worker = clientFor(workerTok);
check("fresh account grants nothing (overview FORBIDDEN)", await outcome(worker.worker.overview()), "FORBIDDEN");
check("same-email does NOT auto-link", (await q<{ u: string | null }>("select user_id u from crew_people where id = ?", [personId]))[0]?.u ?? "null", "null");
check("bad link code -> BAD_REQUEST", await outcome(worker.me.redeemLink({ code: "SX-not-a-real-code" })), "BAD_REQUEST");
const link = await admin.recruiting.issueLinkToken({ personId });
check("link code shape SX-", link.token.startsWith("SX-"), true);
check("redeem link", await outcome(worker.me.redeemLink({ code: link.token })), "OK");
check("redeem twice -> PRECONDITION_FAILED", await outcome(worker.me.redeemLink({ code: link.token })), "PRECONDITION_FAILED");
const ov = await worker.worker.overview();
const myOffer = ov.offers.find((o) => o.id === offer.offerId);
check("worker sees issued offer", myOffer?.status, "issued");
check("worker still FORBIDDEN on staff routes", await outcome(worker.recruiting.list({})), "FORBIDDEN");
check("accept offer", (await worker.worker.respondOffer({ offerId: offer.offerId, revision: myOffer!.revision, accept: true })).status, "accepted");
const [appAfterAccept] = await q<{ s: string }>("select application_status s from crew_applications where id = ?", [appId]);
check("application -> accepted", appAfterAccept?.s, "accepted");

// ---- 5. event + assignment guards --------------------------------------------------
const evt = await admin.events.create({ name: `QA flow event ${run}`, templateVersionId: "seed_tpl_after_dark_v1", timezone: "America/Los_Angeles", venueName: "QA venue (fixture)" });
const shift = { startDate: "2026-11-14", startTime: "18:00", endDate: "2026-11-15", endTime: "01:00", ambiguity: "reject" as const };
check(
  "unclassified role -> PRECONDITION_FAILED",
  await outcome(admin.assignments.propose({ eventId: evt.id, personId, roleKey: "event_director", shift: null, supervisorPersonId: null })),
  "PRECONDITION_FAILED",
);
check(
  "venue role -> BAD_REQUEST",
  await outcome(admin.assignments.propose({ eventId: evt.id, personId, roleKey: "venue_security_officer", shift: null, supervisorPersonId: null })),
  "BAD_REQUEST",
);
await pause();
const lead = clientFor(await signIn("lead.test@example.com"));
check(
  "dept lead: other department (promoter) -> FORBIDDEN",
  await outcome(lead.assignments.propose({ eventId: evt.id, personId, roleKey: "promoter", shift: null, supervisorPersonId: null })),
  "FORBIDDEN",
);
check("dept lead: recruiting.list -> FORBIDDEN", await outcome(lead.recruiting.list({})), "FORBIDDEN");
const asg = await lead.assignments.propose({ eventId: evt.id, personId, roleKey: "host", shift, supervisorPersonId: null });
check("dept lead proposes own-department host", Boolean(asg.id), true);
const clash = await outcome(admin.assignments.propose({ eventId: evt.id, personId, roleKey: "vip_host", shift, supervisorPersonId: null }));
check("overlapping shift -> CONFLICT", clash, "CONFLICT");
check("dept lead cannot approve", await outcome(lead.assignments.approve({ id: asg.id, revision: 1, confirmShift: true })), "FORBIDDEN");
await admin.assignments.approve({ id: asg.id, revision: 1, confirmShift: true });
check("credential before date confirmed -> PRECONDITION_FAILED", await outcome(admin.credentials.issue({ assignmentId: asg.id, validHours: 24 })), "PRECONDITION_FAILED");
const detail0 = await admin.events.detail({ id: evt.id });
await admin.events.setDate({ id: evt.id, revision: detail0.event.revision, localDate: "2026-11-14", ambiguity: "reject", venueConfirmed: false });
const cred = await admin.credentials.issue({ assignmentId: asg.id, validHours: 24 });
check("credential issued", Boolean(cred.id), true);

// ---- 6. worker credential + door verify + attendance ---------------------------------
const wc = await worker.worker.credential({ assignmentId: asg.id });
check("worker.credential active", wc.status, "active");
const token = wc.status === "active" ? wc.token : "";
check("token hash only in DB", (await q<{ n: number }>("select count(*) n from ops_credentials where token_hash = ?", [token]))[0]?.n, 0);
const other = await admin.events.create({ name: `QA other event ${run}`, templateVersionId: "seed_tpl_after_dark_v1", timezone: "America/Los_Angeles", venueName: null });
check("verify at other event -> wrong_event", (await admin.credentials.verify({ eventId: other.id, token, recordCheckIn: false })).result, "wrong_event");
check("verify unknown token -> unknown", (await admin.credentials.verify({ eventId: evt.id, token: "zzzzzzzzzzzzzzzz", recordCheckIn: false })).result, "unknown");
const v1 = await admin.credentials.verify({ eventId: evt.id, token, recordCheckIn: true });
check("door verify -> valid", v1.result, "valid");
check("dept lead can check in own dept", await outcome(lead.attendance.record({ assignmentId: asg.id, kind: "break_start", at: "2026-11-15T04:00:00.000Z" })), "OK");
await admin.attendance.record({ assignmentId: asg.id, kind: "break_end", at: "2026-11-15T04:30:00.000Z" });
const wa = await worker.worker.attendance({ assignmentId: asg.id });
check("worker.attendance log has 3 entries", wa.log.length, 3);
check("worker.attendance flags open shift", wa.issues.includes("Open shift (no check-out)"), true);
console.log("  worker.attendance:", JSON.stringify({ minutes: wa.minutes, issues: wa.issues }));
const ws = await worker.worker.callSheet({ assignmentId: asg.id });
check("worker call sheet call time", ws.call !== "TBD", true);

// ---- 7. cancel revokes credential ------------------------------------------------------
const before = await admin.events.detail({ id: evt.id });
const a1 = before.assignments.find((a) => a.id === asg.id)!;
const cancel = await admin.assignments.cancel({ id: asg.id, revision: a1.revision, reason: "QA: cancellation revocation test" });
check("cancel reports credentialsRevoked=1", cancel.credentialsRevoked, 1);
check("verify after cancel -> revoked", (await admin.credentials.verify({ eventId: evt.id, token, recordCheckIn: false })).result, "revoked");
check("worker.credential after cancel -> none", (await worker.worker.credential({ assignmentId: asg.id })).status, "none");
const [credRow] = await q<{ r: string }>("select revoked_reason r from ops_credentials where id = ?", [cred.id]);
check("revoked_reason", credRow?.r, "assignment_cancelled");
const [aud] = await q<{ data: string }>("select data from crew_audit where action = 'assignment.cancel' and entity_id = ? order by created_at desc limit 1", [evt.id]);
check("audit row records credentialsRevoked", JSON.parse(aud?.data ?? "{}").credentialsRevoked, 1);
check("worker call sheet after cancel -> NOT_FOUND", await outcome(worker.worker.callSheet({ assignmentId: asg.id })), "NOT_FOUND");

// ---- optional: leave a live fixture for browser tests ------------------------------------
if (process.env.KEEP === "1") {
  const a2 = await admin.assignments.propose({ eventId: evt.id, personId, roleKey: "host", shift, supervisorPersonId: null });
  await admin.assignments.approve({ id: a2.id, revision: 1, confirmShift: true });
  await admin.credentials.issue({ assignmentId: a2.id, validHours: 24 });
  console.log(`KEEP fixture: worker=flow.worker+${run}@example.com assignment=${a2.id} event=${evt.id}`);
}

console.log(`\nrun=${run} app=${appId} person=${personId} event=${evt.id} assignment=${asg.id}`);
report("workflow e2e");
process.exit(process.exitCode ?? 0);
