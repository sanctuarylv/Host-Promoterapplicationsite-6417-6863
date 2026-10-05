/**
 * Authorization + state-race suite — in-process, real auth, FRESH disposable DB.
 *
 *   cd packages/web && env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bun tests/integration/authz.ts
 *
 * Covers: staff grant/revoke rules and the last-admin guard (incl. a mutual-revoke
 * race), cross-person worker isolation, cross-event and department scoping,
 * offer states (stale / expired / cancelled / declined / accept-vs-cancel race),
 * assignment state guards, door scans (repeat + concurrent) and hours safety,
 * guest attribution (validity, revoked, wrong event, first-wins) and concurrent
 * guest scans, and the per-account sign-in throttle.
 *
 * Time-dependent states (offer expiry, a link not yet in effect) are produced by
 * editing the fixture row in the disposable DB — noted inline where used.
 */
const H = await import("./harness");
const { client, db, S, signUp, bootstrapAdmin, outcome, rpc, cleanup, ORIGIN, app } = H;
const P = await import("./pipeline");
const { eq, and, isNull, sql } = await import("drizzle-orm");
const { recorder } = await import("../e2e/helpers");
const { computeMinutes } = await import("../../src/api/ops/attendance");

const { check, report } = recorder();
const statuses = (rs: PromiseSettledResult<unknown>[]) => rs.map((r) => (r.status === "fulfilled" ? "OK" : ((r.reason as { code?: string }).code ?? "ERR")));
const okCount = (rs: PromiseSettledResult<unknown>[]) => rs.filter((r) => r.status === "fulfilled").length;

try {
  // ---------------------------------------------------------------- accounts
  const adminAcct = await signUp("admin");
  await bootstrapAdmin(adminAcct.userId);
  const admin = client(adminAcct.token);
  const accts = {
    recruiter: await signUp("recruiter"),
    approver: await signUp("approver"),
    leadGX: await signUp("lead-gx"),
    director: await signUp("director"),
    promoLead: await signUp("promo-lead"),
    plain: await signUp("plain"),
    admin2: await signUp("admin2"),
  };
  const recruiter = client(accts.recruiter.token);
  const approver = client(accts.approver.token);
  const leadGX = client(accts.leadGX.token);
  const director = client(accts.director.token);
  const promoLead = client(accts.promoLead.token);
  const plain = client(accts.plain.token);
  const anon = client();

  // ---------------------------------------------------------- 1. staff grants
  check("anonymous staff route -> UNAUTHORIZED", await outcome(anon.recruiting.list({})), "UNAUTHORIZED");
  check("account with no grant -> FORBIDDEN", await outcome(plain.recruiting.list({})), "FORBIDDEN");
  check("account with no grant: worker.overview -> FORBIDDEN", await outcome(plain.worker.overview()), "FORBIDDEN");
  const recGrant = await admin.staff.grant({ email: accts.recruiter.email, role: "recruiter", eventId: null, departmentKey: null });
  await admin.staff.grant({ email: accts.approver.email, role: "compensation_approver", eventId: null, departmentKey: null });
  await admin.staff.grant({ email: accts.promoLead.email, role: "promotion_lead", eventId: null, departmentKey: null });
  check("recruiter cannot grant staff", await outcome(recruiter.staff.grant({ email: accts.plain.email, role: "admin", eventId: null, departmentKey: null })), "FORBIDDEN");
  check("dept lead without department -> BAD_REQUEST", await outcome(admin.staff.grant({ email: accts.leadGX.email, role: "department_lead", eventId: null, departmentKey: null })), "BAD_REQUEST");
  check("department on non-lead role -> BAD_REQUEST", await outcome(admin.staff.grant({ email: accts.plain.email, role: "recruiter", eventId: null, departmentKey: "guest_experience" })), "BAD_REQUEST");
  check("unknown email -> NOT_FOUND", await outcome(admin.staff.grant({ email: "nobody.here@example.com", role: "recruiter", eventId: null, departmentKey: null })), "NOT_FOUND");
  await admin.staff.grant({ email: accts.leadGX.email, role: "department_lead", eventId: null, departmentKey: "guest_experience" });
  check("recruiter now reads recruiting", await outcome(recruiter.recruiting.list({})), "OK");
  check("approver cannot read recruiting", await outcome(approver.recruiting.list({})), "FORBIDDEN");
  check("promotion lead cannot read recruiting", await outcome(promoLead.recruiting.list({})), "FORBIDDEN");

  // ------------------------------------------------------------ 2. pipeline
  const hostTerms = await P.approvedTerms(recruiter, approver, "host");
  const promoTerms = await P.approvedTerms(recruiter, approver, "promoter");
  const w1 = await P.hireToOffer(admin, adminAcct.userId, hostTerms, "host", "w1");
  const w2 = await P.hireToOffer(admin, adminAcct.userId, hostTerms, "host", "w2");
  const w3 = await P.hireToOffer(admin, adminAcct.userId, promoTerms, "promoter", "w3");

  // Cross-person: an open offer / application belonging to someone else.
  check("W2 cannot respond to W1's offer", await outcome(w2.worker.worker.respondOffer({ offerId: w1.offerId, revision: w1.offerRevision, accept: true })), "NOT_FOUND");
  check("W2 cannot re-acknowledge W1's application", await outcome(w2.worker.worker.reacknowledge({ applicationId: w1.appId, consentVersion: (await import("../../src/api/crew/contract")).CONSENT_VERSION })), "NOT_FOUND");
  const ov2 = await w2.worker.worker.overview();
  check("W2 overview lists only own offers", ov2.offers.every((o) => o.id === w2.offerId) && ov2.offers.length === 1, true);
  check("W2 overview lists only own applications", ov2.applications.every((a) => a.id === w2.appId), true);
  check("stale offer revision -> CONFLICT", await outcome(w1.worker.worker.respondOffer({ offerId: w1.offerId, revision: w1.offerRevision + 5, accept: true })), "CONFLICT");

  // Accept W1, W2, W3 (W2 via a parallel double-accept: exactly one may win).
  check("W1 accepts", (await w1.worker.worker.respondOffer({ offerId: w1.offerId, revision: w1.offerRevision, accept: true })).status, "accepted");
  const dbl = await Promise.allSettled([1, 2].map(() => w2.worker.worker.respondOffer({ offerId: w2.offerId, revision: w2.offerRevision, accept: true })));
  check("parallel double-accept: exactly one succeeds", okCount(dbl), 1);
  check("W3 accepts", (await w3.worker.worker.respondOffer({ offerId: w3.offerId, revision: w3.offerRevision, accept: true })).status, "accepted");
  check("respond after accept -> PRECONDITION_FAILED", await outcome(w1.worker.worker.respondOffer({ offerId: w1.offerId, revision: w1.offerRevision + 1, accept: false })), "PRECONDITION_FAILED");

  // --------------------------------------------------------- 3. events/scope
  const evA = await P.readyEvent(admin, "IT event A");
  const evB = await P.readyEvent(admin, "IT event B");
  await admin.staff.grant({ email: accts.director.email, role: "event_director", eventId: evA, departmentKey: null });
  check("recruiter cannot pin to an event (org-wide role)", await outcome(admin.staff.grant({ email: accts.plain.email, role: "recruiter", eventId: evA, departmentKey: null })), "BAD_REQUEST");

  for (const w of [w1, w2, w3]) await P.trainAndVerify(admin, w);
  const supervisor = w2.personId; // fixture supervisor (readiness requires one)
  const a1 = await leadGX.assignments.propose({ eventId: evA, personId: w1.personId, roleKey: "host", shift: P.SHIFT, supervisorPersonId: supervisor });
  check("dept lead cannot propose other department (promoter)", await outcome(leadGX.assignments.propose({ eventId: evA, personId: w3.personId, roleKey: "promoter", shift: null, supervisorPersonId: supervisor })), "FORBIDDEN");
  const a3 = await admin.assignments.propose({ eventId: evA, personId: w3.personId, roleKey: "promoter", shift: null, supervisorPersonId: supervisor });
  const a2 = await admin.assignments.propose({ eventId: evB, personId: w2.personId, roleKey: "host", shift: P.SHIFT, supervisorPersonId: w1.personId });
  check("director (event A) cannot approve event B", await outcome(director.assignments.approve({ id: a2.id, revision: 1, confirmShift: true })), "FORBIDDEN");
  check("dept lead cannot approve", await outcome(leadGX.assignments.approve({ id: a1.id, revision: 1, confirmShift: true })), "FORBIDDEN");
  await director.assignments.approve({ id: a1.id, revision: 1, confirmShift: true });
  check("approve twice -> PRECONDITION_FAILED", await outcome(director.assignments.approve({ id: a1.id, revision: 2, confirmShift: true })), "PRECONDITION_FAILED");
  await admin.assignments.approve({ id: a3.id, revision: 1, confirmShift: false });
  await admin.assignments.approve({ id: a2.id, revision: 1, confirmShift: true });

  const dl = await leadGX.events.detail({ id: evA });
  check("dept lead: event detail scope = departments", dl.scope, "departments");
  check("dept lead: sees only guest_experience assignments", dl.assignments.length > 0 && dl.assignments.every((a) => a.department_key === "guest_experience"), true);
  check("dept lead: promoter assignment hidden", dl.assignments.some((a) => a.id === a3.id), false);
  check("dept lead: coverage limited to own department", dl.coverage.every((c) => c.department === "guest_experience"), true);
  const dcs = await leadGX.assignments.callSheet({ eventId: evA });
  check("dept lead: call sheet excludes other departments", dcs.scope === "departments" && dcs.rows.every((r) => r.department === "guest_experience"), true);
  check("dept lead: other dept credential -> FORBIDDEN", await outcome(leadGX.credentials.forAssignment({ assignmentId: a3.id })), "FORBIDDEN");
  check("dept lead: other dept attendance read -> FORBIDDEN", await outcome(leadGX.attendance.forAssignment({ assignmentId: a3.id })), "FORBIDDEN");
  check("dept lead: other dept attendance write -> FORBIDDEN", await outcome(leadGX.attendance.record({ assignmentId: a3.id, kind: "check_in" })), "FORBIDDEN");
  check("dept lead: other dept cancel -> FORBIDDEN", await outcome(leadGX.assignments.cancel({ id: a3.id, revision: 2, reason: "scope test" })), "FORBIDDEN");
  const fd = await director.events.detail({ id: evA });
  check("director: own event scope = full", fd.scope, "full");
  check("director: other event detail -> FORBIDDEN", await outcome(director.events.detail({ id: evB })), "FORBIDDEN");
  check("director: other event call sheet -> FORBIDDEN", await outcome(director.assignments.callSheet({ eventId: evB })), "FORBIDDEN");
  const dlist = await director.events.list();
  check("director: events.list = only pinned event", dlist.map((e) => e.id).join(","), evA);
  check("admin: event detail scope = full", (await admin.events.detail({ id: evA })).scope, "full");

  // --------------------------------------------- 4. credentials + worker isolation
  const c1 = await admin.credentials.issue({ assignmentId: a1.id, validHours: 24 });
  const c2 = await admin.credentials.issue({ assignmentId: a2.id, validHours: 24 });
  check("credentials issued", Boolean(c1.id && c2.id), true);
  check("W2 cannot read W1 credential", await outcome(w2.worker.worker.credential({ assignmentId: a1.id })), "NOT_FOUND");
  check("W2 cannot read W1 attendance", await outcome(w2.worker.worker.attendance({ assignmentId: a1.id })), "NOT_FOUND");
  check("W2 cannot read W1 call sheet", await outcome(w2.worker.worker.callSheet({ assignmentId: a1.id })), "NOT_FOUND");
  check("staff account without person link: worker.credential -> FORBIDDEN", await outcome(admin.worker.credential({ assignmentId: a1.id })), "FORBIDDEN");
  const t1 = await w1.worker.worker.credential({ assignmentId: a1.id });
  const t2 = await w2.worker.worker.credential({ assignmentId: a2.id });
  const tok1 = t1.status === "active" ? t1.token : "";
  const tok2 = t2.status === "active" ? t2.token : "";
  check("worker sees own active credential", Boolean(tok1 && tok2), true);

  // Door verify: permission is checked before any token lookup.
  check("approver verify (real token) -> FORBIDDEN", await outcome(approver.credentials.verify({ eventId: evA, token: tok1, recordCheckIn: false })), "FORBIDDEN");
  check("approver verify (unknown token) -> FORBIDDEN (same answer)", await outcome(approver.credentials.verify({ eventId: evA, token: "zzzzzzzzzzzzzzzzzz", recordCheckIn: false })), "FORBIDDEN");
  check("dept lead verify (whole-event door) -> FORBIDDEN", await outcome(leadGX.credentials.verify({ eventId: evA, token: tok1, recordCheckIn: false })), "FORBIDDEN");
  check("director verify at event B -> FORBIDDEN", await outcome(director.credentials.verify({ eventId: evB, token: tok2, recordCheckIn: false })), "FORBIDDEN");
  check("director: W2 token at event A -> wrong_event", (await director.credentials.verify({ eventId: evA, token: tok2, recordCheckIn: false })).result, "wrong_event");

  // Repeat scans (sequential) never reset hours.
  const s1 = await director.credentials.verify({ eventId: evA, token: tok1, recordCheckIn: true });
  check("first scan records check-in", s1.result === "valid" ? s1.checkIn : s1.result, "recorded");
  const s2 = await director.credentials.verify({ eventId: evA, token: tok1, recordCheckIn: true });
  check("repeat scan -> already_checked_in", s2.result === "valid" ? s2.checkIn : s2.result, "already_checked_in");
  const log1 = await db.select().from(S.opsAttendance).where(eq(S.opsAttendance.assignment_id, a1.id));
  check("repeat scan appended nothing", log1.filter((l) => l.kind === "check_in").length, 1);

  // Concurrent scans: duplicates may be appended as evidence; hours keep the FIRST check-in.
  const burst = await Promise.allSettled(Array.from({ length: 6 }, () => admin.credentials.verify({ eventId: evB, token: tok2, recordCheckIn: true })));
  check("6 concurrent scans all valid", statuses(burst).every((s) => s === "OK"), true);
  const recorded = burst.filter((r) => r.status === "fulfilled" && (r.value as { checkIn?: string }).checkIn === "recorded").length;
  check("concurrent scans: at least one recorded", recorded >= 1, true);
  const ins = (await db.select().from(S.opsAttendance).where(eq(S.opsAttendance.assignment_id, a2.id))).filter((l) => l.kind === "check_in");
  const firstIn = Math.min(...ins.map((l) => l.at_utc.getTime()));
  const outAt = new Date(firstIn + 125 * 60_000).toISOString();
  await admin.attendance.record({ assignmentId: a2.id, kind: "check_out", at: outAt });
  const wa = await w2.worker.worker.attendance({ assignmentId: a2.id });
  check("hours after concurrent scans = checkout - FIRST check-in (125 min)", wa.minutes, 125);
  check("duplicate check-ins (if any) flagged, never silently merged", recorded > 1 ? wa.issues.includes("Double check-in") : true, true);
  console.log(`  concurrent scans: ${recorded} recorded / ${6 - recorded} already_checked_in`);
  // Pure function guard on the same property.
  const t0 = new Date("2026-11-15T02:00:00Z").getTime();
  const pure = computeMinutes([
    { id: "a", kind: "check_in", at_utc: new Date(t0), corrects_id: null },
    { id: "b", kind: "check_in", at_utc: new Date(t0 + 50 * 60_000), corrects_id: null },
    { id: "c", kind: "check_out", at_utc: new Date(t0 + 90 * 60_000), corrects_id: null },
  ]);
  check("computeMinutes: second check-in does not reset (90 min)", pure.minutes, 90);

  // ------------------------------------------------- 5. offer state machine
  // Fresh applicants for offer-state cases (W4..W7).
  const w4 = await P.hireToOffer(admin, adminAcct.userId, hostTerms, "host", "w4-expired");
  // Fixture time travel: move the open offer's expiry into the past in the disposable DB.
  await db.update(S.crewOffers).set({ expires_at: new Date(Date.now() - 60_000) }).where(eq(S.crewOffers.id, w4.offerId));
  check("expired offer -> PRECONDITION_FAILED", await outcome(w4.worker.worker.respondOffer({ offerId: w4.offerId, revision: w4.offerRevision, accept: true })), "PRECONDITION_FAILED");
  const [o4] = await db.select().from(S.crewOffers).where(eq(S.crewOffers.id, w4.offerId));
  check("expired offer untouched (still issued in DB)", o4?.status, "issued");
  check("overview reports it as expired", (await w4.worker.worker.overview()).offers[0]?.status, "expired");

  const w5 = await P.hireToOffer(admin, adminAcct.userId, hostTerms, "host", "w5-cancel");
  await admin.offers.cancel({ offerId: w5.offerId, revision: w5.offerRevision, reason: "Fixture cancellation" });
  check("respond to cancelled offer -> PRECONDITION_FAILED", await outcome(w5.worker.worker.respondOffer({ offerId: w5.offerId, revision: w5.offerRevision, accept: true })), "PRECONDITION_FAILED");
  const [app5] = await db.select().from(S.crewApplications).where(eq(S.crewApplications.id, w5.appId));
  check("cancelled offer returns application to selected", app5?.application_status, "selected");

  const w6 = await P.hireToOffer(admin, adminAcct.userId, hostTerms, "host", "w6-decline");
  check("decline", (await w6.worker.worker.respondOffer({ offerId: w6.offerId, revision: w6.offerRevision, accept: false })).status, "declined");
  const [app6] = await db.select().from(S.crewApplications).where(eq(S.crewApplications.id, w6.appId));
  check("declined offer returns application to selected", app6?.application_status, "selected");
  check("accept after decline -> PRECONDITION_FAILED", await outcome(w6.worker.worker.respondOffer({ offerId: w6.offerId, revision: w6.offerRevision + 1, accept: true })), "PRECONDITION_FAILED");
  check("assign with no accepted offer -> PRECONDITION_FAILED", await outcome(admin.assignments.propose({ eventId: evA, personId: w6.personId, roleKey: "host", shift: null, supervisorPersonId: null })), "PRECONDITION_FAILED");

  const w7 = await P.hireToOffer(admin, adminAcct.userId, hostTerms, "host", "w7-race");
  const race = await Promise.allSettled([
    w7.worker.worker.respondOffer({ offerId: w7.offerId, revision: w7.offerRevision, accept: true }),
    admin.offers.cancel({ offerId: w7.offerId, revision: w7.offerRevision, reason: "Race fixture" }),
  ]);
  check("accept vs cancel race: exactly one wins", okCount(race), 1);
  const [o7] = await db.select().from(S.crewOffers).where(eq(S.crewOffers.id, w7.offerId));
  const [app7] = await db.select().from(S.crewApplications).where(eq(S.crewApplications.id, w7.appId));
  const consistent = (o7?.status === "accepted" && app7?.application_status === "accepted") || (o7?.status === "cancelled" && app7?.application_status === "selected");
  check("race leaves offer + application consistent", consistent, true);
  console.log(`  race outcome: offer=${o7?.status} application=${app7?.application_status} (${statuses(race).join("/")})`);

  // --------------------------------------------------- 6. assignment states
  const a1d = (await admin.events.detail({ id: evA })).assignments.find((a) => a.id === a1.id)!;
  await admin.assignments.cancel({ id: a1.id, revision: a1d.revision, reason: "Fixture cancel" });
  check("cancel twice -> PRECONDITION_FAILED", await outcome(admin.assignments.cancel({ id: a1.id, revision: a1d.revision + 1, reason: "again" })), "PRECONDITION_FAILED");
  check("approve cancelled -> PRECONDITION_FAILED", await outcome(admin.assignments.approve({ id: a1.id, revision: a1d.revision + 1, confirmShift: true })), "PRECONDITION_FAILED");
  check("cancelled credential verifies as revoked", (await director.credentials.verify({ eventId: evA, token: tok1, recordCheckIn: true })).result, "revoked");

  // --------------------------------------------- 7. guest attribution + scans
  check("promoter link for non-promoter -> PRECONDITION_FAILED", await outcome(admin.promoters.createLink({ eventId: evB, personId: w2.personId })), "PRECONDITION_FAILED");
  check("dept lead cannot create promoter links", await outcome(leadGX.promoters.createLink({ eventId: evA, personId: w3.personId })), "FORBIDDEN");
  const link = await promoLead.promoters.createLink({ eventId: evA, personId: w3.personId });
  check("duplicate promoter link -> CONFLICT", await outcome(promoLead.promoters.createLink({ eventId: evA, personId: w3.personId })), "CONFLICT");
  const g = (email: string, code: string | null, eventId = evA) => promoLead.promoters.fixtureRegister({ eventId, email, code });
  check("register with code -> attributed", (await g("guest1@example.com", link.code)).attributed, true);
  check("code is case-insensitive", (await g("guest2@example.com", link.code.toLowerCase())).attributed, true);
  check("unknown code -> unattributed", (await g("guest3@example.com", "PNOTREAL")).attributed, false);
  check("event A code at event B -> unattributed", (await g("guest4@example.com", link.code, evB)).attributed, false);
  const again = await g("GUEST1@example.com", null);
  check("same guest again (any case): first registration wins", again.created, false);
  // Fixture time travel: a link whose validity starts in the future.
  await db.update(S.guestPromoterLinks).set({ valid_from: new Date(Date.now() + 3_600_000) }).where(eq(S.guestPromoterLinks.id, link.id));
  check("link not yet in effect -> unattributed", (await g("guest5@example.com", link.code)).attributed, false);
  await db.update(S.guestPromoterLinks).set({ valid_from: new Date(Date.now() - 1000) }).where(eq(S.guestPromoterLinks.id, link.id));
  await promoLead.promoters.revokeLink({ linkId: link.id });
  check("revoked link -> unattributed", (await g("guest6@example.com", link.code)).attributed, false);
  const [g1] = await db.select().from(S.guestRegistrations).where(eq(S.guestRegistrations.id, (await g("guest7@example.com", null)).registrationId!));
  check("registration stores no raw email", JSON.stringify(g1).includes("@"), false);

  const regId = (await db.select({ id: S.guestRegistrations.id }).from(S.guestRegistrations).where(and(eq(S.guestRegistrations.event_id, evA), eq(S.guestRegistrations.promoter_link_id, link.id))))[0]!.id;
  const scans = await Promise.allSettled(Array.from({ length: 8 }, () => promoLead.promoters.fixtureScan({ eventId: evA, registrationId: regId })));
  const results = scans.map((r) => (r.status === "fulfilled" ? r.value.result : "ERR"));
  check("8 concurrent guest scans: exactly 1 admitted", results.filter((r) => r === "admitted").length, 1);
  check("8 concurrent guest scans: 7 re-entries", results.filter((r) => r === "reentry").length, 7);
  check("scan of other event's registration -> NOT_FOUND", await outcome(promoLead.promoters.fixtureScan({ eventId: evB, registrationId: regId })), "NOT_FOUND");
  const agg = await promoLead.promoters.aggregates({ eventId: evA });
  check("aggregates: unique admitted counted once", agg.totals.uniqueAdmitted, 1);
  check("aggregates: re-entries separate", agg.totals.reentries, 7);
  check("aggregates: attributed registrations = 2", agg.byPromoter.find((b) => b.linkId === link.id)?.registrations, 2);
  check("aggregates: labelled as fixture data", agg.source.startsWith("test_fixture_or_import"), true);
  check("aggregates expose no guest identities", /guest\d@|guest_key/.test(JSON.stringify(agg)), false);
  check("dept lead cannot read referral aggregates", await outcome(leadGX.promoters.aggregates({ eventId: evA })), "FORBIDDEN");

  // ----------------------------------------------- 8. revoke + last admin
  await admin.staff.revoke({ id: recGrant.id, reason: "Fixture revoke" });
  check("revoked recruiter loses access immediately", await outcome(recruiter.recruiting.list({})), "FORBIDDEN");
  check("revoke twice -> NOT_FOUND", await outcome(admin.staff.revoke({ id: recGrant.id, reason: "again" })), "NOT_FOUND");
  const myAdmin = (await admin.staff.list()).rows.find((r) => r.userId === adminAcct.userId && r.role === "admin")!;
  check("sole admin cannot revoke self", await outcome(admin.staff.revoke({ id: myAdmin.id, reason: "self" })), "PRECONDITION_FAILED");
  const g2 = await admin.staff.grant({ email: accts.admin2.email, role: "admin", eventId: null, departmentKey: null });
  const admin2 = client(accts.admin2.token);
  const mutual = await Promise.allSettled([admin.staff.revoke({ id: g2.id, reason: "mutual A" }), admin2.staff.revoke({ id: myAdmin.id, reason: "mutual B" })]);
  const activeAdmins = await db.select().from(S.staffMemberships).where(and(eq(S.staffMemberships.role, "admin"), isNull(S.staffMemberships.revoked_at)));
  check("mutual admin revoke race: never zero admins", activeAdmins.length >= 1, true);
  console.log(`  mutual revoke: ${statuses(mutual).join("/")} -> ${activeAdmins.length} active admin(s)`);

  // ------------------------------------------- 9. per-account sign-in throttle
  const victim = await signUp("throttle");
  const signIn = (password: string) =>
    app.fetch(new Request(`${ORIGIN}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email: victim.email, password }) }));
  const codes: number[] = [];
  for (let i = 0; i < 10; i++) codes.push((await signIn(`wrong-password-${i}`)).status);
  check("10 wrong passwords -> 401 each", codes.every((c) => c === 401), true);
  check("11th attempt for the same account -> 429", (await signIn("wrong-password-x")).status, 429);
  check("correct password also throttled in window", (await signIn(H.PASSWORD)).status, 429);
  const other = await signUp("throttle-other");
  const otherRes = await app.fetch(new Request(`${ORIGIN}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email: other.email.toUpperCase(), password: H.PASSWORD }) }));
  check("other account unaffected (case-normalized email)", otherRes.status, 200);
  const keys = await db.all<{ key: string }>(sql`select key from crew_rate_limits where key like 'signin-email:%'`);
  check("throttle stores hashed keys only (no address)", keys.every((k) => !k.key.includes("@")), true);
  void rpc;
} catch (e) {
  console.error("SUITE ERROR", e);
  process.exitCode = 1;
} finally {
  report("authz + state integration");
  cleanup();
}
process.exit(process.exitCode ?? 0);
