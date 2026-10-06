/**
 * Staffing-pipeline fixtures for the in-process suites. Every step goes through
 * the real procedures (public submit → review → screen → assessment → scorecard
 * → selected → approved terms → offer → explicit account link). Import AFTER
 * ./harness (which owns the disposable DB and env).
 */
import { CONSENT_VERSION } from "../../src/api/crew/contract";
import type { AppRouterClient } from "../../src/api";
import { client, db, rpc, S, signUp } from "./harness";
import { eq } from "drizzle-orm";

type C = AppRouterClient;
let seq = 0;

export function applicationPayload(email: string, role: "host" | "promoter", attribution: Record<string, unknown> = {}) {
  const n = ++seq;
  return {
    firstName: role === "host" ? "Hana" : "Pax",
    lastName: `Fixture${n}`,
    email,
    phone: `(702) 555-${String(2000 + n).padStart(4, "0")}`,
    city: "Las Vegas",
    state: "NV",
    roleInterest: role,
    ...(role === "host" ? { hostInterests: ["check_in"] } : { promoterInviteRange: "11_25", promoterExperience: false }),
    instagram: "",
    tiktok: "",
    otherSocial: "",
    networkTypes: ["friends"],
    availability: "occasionally",
    eveningsAvailable: true,
    weekendsAvailable: true,
    travelRange: "las_vegas_valley",
    relevantExperience: "Hospitality fixture experience (test data).",
    scenarioResponse: "Listen, stay calm, check the list, bring in the lead.",
    portfolioUrl: "",
    motivation: "Integration-test fixture applicant.",
    referralSource: "friend",
    requiredConsent: true,
    marketingConsent: false,
    website: "",
    startedAt: Date.now() - 60_000,
    consentVersion: CONSENT_VERSION,
    attribution,
  };
}

const EVID = "Observed during the simulated exercise (fixture).";
const SCORES = {
  host: ["communication", "guest_judgment", "reliability", "teamwork", "respectful_guidance"],
  promoter: ["outreach", "invitation_plan", "follow_through", "tracking_accuracy"],
} as const;

/** Approved terms per role (drafted by `drafter`, approved by a compensation approver). */
export async function approvedTerms(drafter: C, approver: C, roleKey: "host" | "promoter") {
  const t = await drafter.terms.draft({
    termsKey: `it-${roleKey}-${Date.now().toString(36)}-${++seq}`,
    roleKey,
    title: `${roleKey} (integration fixture terms)`,
    duties: "Fixture duties — not real terms.",
    compensation: "[TBD — VERIFIED DATA REQUIRED]",
    payBasis: "[TBD — VERIFIED DATA REQUIRED]",
    schedule: "Fixture schedule.",
    engagementArrangement: "[TBD — VERIFIED DATA REQUIRED]",
    acceptanceRequirements: "Fixture acceptance requirements.",
  });
  await approver.terms.approve({ id: t.id });
  return t.id;
}

export type Hire = { appId: string; personId: string; token: string; email: string; worker: C; offerId: string; offerRevision: number; appRevision: number };

/**
 * Applicant → selected → offer issued → worker account explicitly linked.
 * The offer is left OPEN (issued) so callers decide accept / decline / race.
 */
export async function hireToOffer(admin: C, adminUserId: string, termsId: string, role: "host" | "promoter", label: string, attribution: Record<string, unknown> = {}): Promise<Hire> {
  const acct = await signUp(label);
  const sub = await rpc("crew/submit", applicationPayload(`apply.${acct.email}`, role, attribution));
  if (sub.status !== 200) throw new Error(`submit ${label} -> ${sub.status} ${sub.message}`);
  const [row] = await db.select({ id: S.crewApplications.id, person: S.crewApplications.person_id }).from(S.crewApplications).where(eq(S.crewApplications.email_normalized, `apply.${acct.email}`));
  if (!row?.person) throw new Error("application not persisted");
  const appId = row.id;
  const d = await admin.recruiting.detail({ id: appId });
  let rev = (await admin.recruiting.assignReviewer({ id: appId, revision: d.app.revision, reviewerUserId: adminUserId, dueAt: null })).revision;
  rev = (await admin.recruiting.transition({ id: appId, revision: rev, to: "reviewed" })).revision;
  const screen = await admin.recruiting.scheduleInterview({ applicationId: appId, kind: "screen", format: "phone", scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), interviewerUserId: adminUserId });
  rev = (await admin.recruiting.transition({ id: appId, revision: rev, to: "screen_invited" })).revision;
  await admin.recruiting.updateInterview({ id: screen.id, revision: 1, status: "completed", notes: "Fixture screen." });
  rev = (await admin.recruiting.transition({ id: appId, revision: rev, to: "screen_completed" })).revision;
  await admin.recruiting.scheduleInterview({ applicationId: appId, kind: "assessment", format: "simulated_assessment", scheduledAt: null, interviewerUserId: adminUserId });
  rev = (await admin.recruiting.transition({ id: appId, revision: rev, to: "assessment" })).revision;
  const keys = SCORES[role];
  await admin.recruiting.submitScorecard({
    applicationId: appId,
    kind: role,
    scores: Object.fromEntries(keys.map((k) => [k, 3])),
    evidence: Object.fromEntries(keys.map((k) => [k, EVID])),
    recommendation: "advance",
  });
  rev = (await admin.recruiting.transition({ id: appId, revision: rev, to: "selected" })).revision;
  const offer = await admin.offers.issue({ applicationId: appId, revision: rev, termsId, expiresInDays: 7 });
  const worker = client(acct.token);
  const link = await admin.recruiting.issueLinkToken({ personId: row.person });
  await worker.me.redeemLink({ code: link.token });
  const ov = await worker.worker.overview();
  const o = ov.offers.find((x) => x.id === offer.offerId)!;
  return { appId, personId: row.person, token: acct.token, email: acct.email, worker, offerId: offer.offerId, offerRevision: o.revision, appRevision: offer.revision };
}

/** Required training completed by the worker and verified by staff. */
export async function trainAndVerify(admin: C, h: Hire) {
  const mods = (await admin.training.modules()).filter((m) => m.status === "active");
  for (const m of mods) await h.worker.worker.completeTraining({ moduleId: m.id });
  for (const r of await admin.training.records({ personId: h.personId })) if (!r.verified_at) await admin.training.verify({ recordId: r.id });
}

export const SHIFT = { startDate: "2026-11-14", startTime: "18:00", endDate: "2026-11-15", endTime: "01:00", ambiguity: "reject" as const };

/** Event with confirmed date + venue (readiness prerequisites). */
export async function readyEvent(admin: C, name: string) {
  const ev = await admin.events.create({ name, templateVersionId: "seed_tpl_after_dark_v1", timezone: "America/Los_Angeles", venueName: "Fixture venue" });
  const d = await admin.events.detail({ id: ev.id });
  await admin.events.setDate({ id: ev.id, revision: d.event.revision, localDate: "2026-11-14", ambiguity: "reject", venueConfirmed: true });
  return ev.id;
}
