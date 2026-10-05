/**
 * Campaign metrics suite — in-process, real auth + oRPC, FRESH disposable DB.
 *
 *   cd packages/web && env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bun tests/integration/campaigns.ts
 *
 * Every applicant goes through the real pipeline procedures. Two fixture edits
 * are made directly in the disposable DB and noted inline: back-dating one
 * application (date scope) and nothing else.
 */
const H = await import("./harness");
const { client, db, S, signUp, bootstrapAdmin, outcome, rpc, cleanup } = H;
const P = await import("./pipeline");
const { eq } = await import("drizzle-orm");
const { recorder } = await import("../e2e/helpers");

const { check, report } = recorder();

try {
  const adminAcct = await signUp("admin");
  await bootstrapAdmin(adminAcct.userId);
  const admin = client(adminAcct.token);
  const acc = { recruiter: await signUp("recruiter"), approver: await signUp("approver"), promo: await signUp("promo"), plain: await signUp("plain"), lead: await signUp("lead") };
  const g = (email: string, role: string) => admin.staff.grant({ email, role: role as "recruiter", eventId: null, departmentKey: null });
  await g(acc.recruiter.email, "recruiter");
  await g(acc.approver.email, "compensation_approver");
  await g(acc.promo.email, "promotion_lead");
  await admin.staff.grant({ email: acc.lead.email, role: "department_lead", eventId: null, departmentKey: "guest_experience" });
  const recruiter = client(acc.recruiter.token);
  const approver = client(acc.approver.token);

  const CODE = `it-cmp-${Date.now().toString(36)}`;
  const { id: cid } = await recruiter.campaigns.create({ name: "IT campaign (fixture)", concept: "Integration-test campaign — not real traction.", code: CODE, startDate: "2026-10-01" });
  const { id: emptyId } = await recruiter.campaigns.create({ name: "IT empty (fixture)", concept: "No applicants.", code: `${CODE}-empty`, startDate: "2026-10-01" });
  const attr = { utmCampaign: CODE, utmSource: "instagram", utmContent: "story-a" };

  // ---------------------------------------------------------------- permissions
  check("plain account cannot read campaign metrics", await outcome(client(acc.plain.token).campaigns.detail({ id: cid })), "FORBIDDEN");
  check("department lead cannot read campaign metrics", await outcome(client(acc.lead.token).campaigns.detail({ id: cid })), "FORBIDDEN");
  check("anonymous cannot read campaign metrics", await outcome(client().campaigns.detail({ id: cid })), "UNAUTHORIZED");
  check("promotion lead can read", await outcome(client(acc.promo.token).campaigns.detail({ id: cid })), "OK");

  // ---------------------------------------------------------------- cohort
  const hostTerms = await P.approvedTerms(recruiter, approver, "host");
  const promoTerms = await P.approvedTerms(recruiter, approver, "promoter");
  // A: host, accepted, trained, onboarding.
  const A = await P.hireToOffer(admin, adminAcct.userId, hostTerms, "host", "cmp-a", attr);
  await A.worker.worker.respondOffer({ offerId: A.offerId, revision: A.offerRevision, accept: true });
  await P.trainAndVerify(admin, A);
  let d = await admin.recruiting.detail({ id: A.appId });
  await admin.recruiting.transition({ id: A.appId, revision: d.app.revision, to: "onboarding" });
  // B: promoter, offered then declined (status returns to selected).
  const B = await P.hireToOffer(admin, adminAcct.userId, promoTerms, "promoter", "cmp-b", { ...attr, utmSource: "tiktok", utmContent: null });
  await B.worker.worker.respondOffer({ offerId: B.offerId, revision: B.offerRevision, accept: false });
  // G: host, accepted → onboarding → withdrawn. History must still count it.
  const G = await P.hireToOffer(admin, adminAcct.userId, hostTerms, "host", "cmp-g", attr);
  await G.worker.worker.respondOffer({ offerId: G.offerId, revision: G.offerRevision, accept: true });
  d = await admin.recruiting.detail({ id: G.appId });
  const gRev = (await admin.recruiting.transition({ id: G.appId, revision: d.app.revision, to: "onboarding" })).revision;
  await admin.recruiting.transition({ id: G.appId, revision: gRev, to: "withdrawn" });

  const submit = async (label: string, role: "host" | "promoter", a: Record<string, unknown>) => {
    const email = `cmp.${label}.${Date.now().toString(36)}@example.com`;
    const r = await rpc("crew/submit", P.applicationPayload(email, role, a));
    if (r.status !== 200) throw new Error(`submit ${label} -> ${r.status}`);
    const [row] = await db.select().from(S.crewApplications).where(eq(S.crewApplications.email_normalized, email));
    return row!;
  };
  // C: host, reviewed only. D: host, untouched. E: other campaign. F: host, back-dated.
  const C = await submit("c", "host", attr);
  const cRev = (await admin.recruiting.assignReviewer({ id: C.id, revision: C.revision, reviewerUserId: adminAcct.userId, dueAt: null })).revision;
  await admin.recruiting.transition({ id: C.id, revision: cRev, to: "reviewed" });
  await submit("d", "host", attr);
  await submit("e", "host", { utmCampaign: "some-other-campaign" });
  const F = await submit("f", "host", attr);
  // Fixture edit: back-date F to 2026-09-15 12:00 Las Vegas (19:00Z) for date-scope checks.
  await db.update(S.crewApplications).set({ created_at: new Date("2026-09-15T19:00:00Z") }).where(eq(S.crewApplications.id, F.id));

  // ---------------------------------------------------------------- whole campaign
  let m = (await recruiter.campaigns.detail({ id: cid })).metrics;
  check("scope label: whole campaign", `${m.scope.wholeCampaign}|${m.scope.label}`, "true|all roles · all dates");
  check("applications in scope (A,B,G,C,D,F; not E)", m.applications.value, 6);
  check("store denominator counts every application", m.applications.denominator, 7);
  check("unique people", `${m.uniquePeople.value}|${m.uniquePeople.unlinked}`, "6|0");
  check("reviewed = A,B,G,C (history-based)", `${m.reviewed.value}/${m.reviewed.denominator}`, "4/6");
  check("median time to review is measured", `${m.medianHoursToReview.value !== null}|${m.medianHoursToReview.n}`, "true|4");
  check("attended interview = completed screens (A,B,G)", m.interviewAttended.value, 3);
  check("qualified = reached Selected (A,B,G)", m.qualified.value, 3);
  check("offered (A,B,G)", m.offered.value, 3);
  check("accepted (A,G) — declined B excluded", m.accepted.value, 2);
  check("onboarding counts withdrawn-after-onboarding G via audit history", m.onboarding.value, 2);
  check("training complete (A only)", m.trainingComplete.value, 1);
  check("event-ready not inferred", m.eventReady.value, 0);
  check("every stage shares the scope denominator", [m.reviewed, m.qualified, m.offered, m.accepted, m.onboarding, m.trainingComplete, m.eventReady].every((x) => x.denominator === 6), true);
  check("by source groups", m.bySource.map((s) => `${s.source}:${s.n}`).sort().join(","), "instagram:5,tiktok:1");

  // ---------------------------------------------------------------- spend states
  check("no budget lines → spend none, no cost shown", `${m.spend.state}|${m.costPerQualified.value}|${m.costPerQualified.note}`, "none|null|No actual spend recorded");
  await recruiter.campaigns.setBudgetLine({ campaignId: cid, category: "paid_social", label: "Paid social", proposedCents: 50_000, approvedCents: 40_000, actualCents: 30_000 });
  await recruiter.campaigns.setBudgetLine({ campaignId: cid, category: "print", label: "Print", proposedCents: 10_000, approvedCents: null, actualCents: null });
  m = (await recruiter.campaigns.detail({ id: cid })).metrics;
  check("one of two lines recorded → partial, not complete", `${m.spend.state}|${m.spend.recordedLines}/${m.spend.totalLines}|${m.spend.actualCents}`, "partial|1/2|null");
  check("partial spend → no cost per qualified", m.costPerQualified.value, null);
  check("partial note explains", m.costPerQualified.note.startsWith("Spend partially recorded (1 of 2"), true);
  await recruiter.campaigns.setBudgetLine({ campaignId: cid, category: "print", label: "Print", proposedCents: 10_000, approvedCents: 10_000, actualCents: 0 });
  m = (await recruiter.campaigns.detail({ id: cid })).metrics;
  check("all lines recorded (incl. a true $0) → complete", `${m.spend.state}|${m.spend.actualCents}`, "complete|30000");
  check("cost per qualified = 30000 / 3", m.costPerQualified.value, 10_000);
  check("cost per accepted = 30000 / 2", m.costPerAccepted.value, 15_000);

  // ---------------------------------------------------------------- role scope
  m = (await recruiter.campaigns.detail({ id: cid, role: "promoter" })).metrics;
  check("role scope: promoter only", `${m.applications.value}|${m.qualified.value}|${m.accepted.value}`, "1|1|0");
  check("role scope: store denominator is promoters only", m.applications.denominator, 1);
  check("role scope label", m.scope.label, "role: promoter · all dates");
  check("role scope → spend not allocated, cost hidden", `${m.costPerQualified.value}|${m.costPerQualified.note.startsWith("Spend is recorded for the whole campaign")}`, "null|true");

  // ---------------------------------------------------------------- date scope
  m = (await recruiter.campaigns.detail({ id: cid, from: "2026-09-15", to: "2026-09-15" })).metrics;
  check("single-day scope includes only back-dated F", m.applications.value, 1);
  check("date scope label carries timezone", m.scope.label, "all roles · applied 2026-09-15 to 2026-09-15 (America/Los_Angeles)");
  m = (await recruiter.campaigns.detail({ id: cid, from: "2026-09-16" })).metrics;
  check("open-ended from excludes F", m.applications.value, 5);
  m = (await recruiter.campaigns.detail({ id: cid, to: "2026-09-14" })).metrics;
  check("to before F → empty scope", `${m.applications.value}|${m.medianHoursToReview.value}`, "0|null");
  check("empty scope rates show no fake 0% denominators", m.qualified.denominator, 0);
  check("from after to → BAD_REQUEST", await outcome(recruiter.campaigns.detail({ id: cid, from: "2026-10-02", to: "2026-10-01" })), "BAD_REQUEST");
  check("malformed date → BAD_REQUEST", await outcome(recruiter.campaigns.detail({ id: cid, from: "10/01/2026" })), "BAD_REQUEST");
  check("unknown role → BAD_REQUEST", await outcome(recruiter.campaigns.detail({ id: cid, role: "dj" as never })), "BAD_REQUEST");

  // ---------------------------------------------------------------- zero conversions
  await recruiter.campaigns.setBudgetLine({ campaignId: emptyId, category: "paid_social", label: "Paid social", proposedCents: 10_000, approvedCents: 10_000, actualCents: 5_000 });
  m = (await recruiter.campaigns.detail({ id: emptyId })).metrics;
  check("zero applicants with complete spend → cost undefined, not $0", `${m.spend.state}|${m.costPerAccepted.value}`, "complete|null");
  check("zero-conversion note", m.costPerAccepted.note, "No accepted offers yet — cost per accepted offer is undefined, not $0");
} catch (e) {
  check("SUITE ERROR", String((e as Error)?.stack ?? e), "no error");
} finally {
  report("campaign metrics integration");
  cleanup();
  process.exit(process.exitCode ?? 0);
}
