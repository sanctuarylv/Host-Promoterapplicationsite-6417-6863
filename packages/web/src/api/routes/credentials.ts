/**
 * Event access: staff credentials (opaque, hashed, expiring, revocable),
 * append-only staff attendance with corrections, promoter links, and guest
 * registration/admission aggregates (test fixtures only — no real guest data).
 */
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, asc, count, countDistinct, eq, inArray, isNull } from "drizzle-orm";
import { staffProc } from "../middleware/auth";
import { db } from "../database";
import {
  crewPeople,
  guestPromoterLinks,
  guestRegistrations,
  guestScans,
  opsAssignments,
  opsAttendance,
  opsEvents,
} from "../database/schema";
import { actorOf, requireCan } from "../shared/permissions";
import { audit } from "../shared/audit";
import { guestKey, opaqueToken, sha256, uuid } from "../shared/ids";
import { NO_CREDENTIAL_BLOCKER, assignmentReadiness, credentialHash } from "../ops/readiness";
import { computeMinutes } from "../ops/attendance";
import { opsCredentials } from "../database/schema";

const id = z.string().min(1).max(64);

async function loadAssignment(assignmentId: string) {
  const [a] = await db.select().from(opsAssignments).where(eq(opsAssignments.id, assignmentId)).limit(1);
  if (!a) throw new ORPCError("NOT_FOUND", { message: "Assignment not found." });
  return a;
}

export const credentials = {
  /** Issue (or rotate) a credential. The value is never returned to staff — the worker views it in their portal. */
  issue: staffProc.input(z.object({ assignmentId: id, validHours: z.number().int().min(1).max(72).default(24) })).handler(async ({ input, context }) => {
    const a = await loadAssignment(input.assignmentId);
    requireCan(context.principal, "event.manage", { eventId: a.event_id });
    if (a.status !== "approved") throw new ORPCError("PRECONDITION_FAILED", { message: "Approve the assignment before issuing a credential." });
    const [ev] = await db.select().from(opsEvents).where(eq(opsEvents.id, a.event_id)).limit(1);
    if (!ev?.date_confirmed) throw new ORPCError("PRECONDITION_FAILED", { message: "Confirm the event date first." });
    // Credentials only for ready assignments: every readiness condition except the credential itself.
    const missing = (await assignmentReadiness(a.id)).blockers.filter((b) => b !== NO_CREDENTIAL_BLOCKER);
    if (missing.length) throw new ORPCError("PRECONDITION_FAILED", { message: `Not ready for a credential: ${missing.join("; ")}.`, data: { missing } });
    const now = new Date();
    await db
      .update(opsCredentials)
      .set({ revoked_at: now, revoked_reason: "rotated" })
      .where(and(eq(opsCredentials.assignment_id, a.id), isNull(opsCredentials.revoked_at)));
    const credId = uuid();
    const anchor = a.shift_end_utc?.getTime() ?? now.getTime();
    const expires = new Date(Math.max(now.getTime(), anchor) + input.validHours * 3600_000);
    await db.insert(opsCredentials).values({
      id: credId,
      assignment_id: a.id,
      event_id: a.event_id,
      person_id: a.person_id,
      token_hash: credentialHash(credId),
      zones: a.zones,
      issued_by: context.principal.userId,
      expires_at: expires,
    });
    await audit(db, actorOf(context.principal), { entityType: "credential", entityId: credId, action: "credential.issue", data: { assignmentId: a.id, expiresAt: expires.toISOString() } });
    return { id: credId, expiresAt: expires.toISOString() };
  }),

  revoke: staffProc.input(z.object({ credentialId: id, reason: z.string().min(3).max(300) })).handler(async ({ input, context }) => {
    const [c] = await db.select().from(opsCredentials).where(eq(opsCredentials.id, input.credentialId)).limit(1);
    if (!c) throw new ORPCError("NOT_FOUND");
    requireCan(context.principal, "event.manage", { eventId: c.event_id });
    await db.update(opsCredentials).set({ revoked_at: new Date(), revoked_reason: input.reason }).where(eq(opsCredentials.id, c.id));
    await audit(db, actorOf(context.principal), { entityType: "credential", entityId: c.id, action: "credential.revoke", note: input.reason });
    return { ok: true };
  }),

  forAssignment: staffProc.input(z.object({ assignmentId: id })).handler(async ({ input, context }) => {
    const a = await loadAssignment(input.assignmentId);
    requireCan(context.principal, "roster.read", { eventId: a.event_id, departmentKey: a.department_key });
    return db
      .select({ id: opsCredentials.id, issuedAt: opsCredentials.issued_at, expiresAt: opsCredentials.expires_at, revokedAt: opsCredentials.revoked_at, reason: opsCredentials.revoked_reason })
      .from(opsCredentials)
      .where(eq(opsCredentials.assignment_id, a.id));
  }),

  /** Door/staff check: verifies a scanned credential and (optionally) records a check-in. */
  verify: staffProc.input(z.object({ eventId: id, token: z.string().min(10).max(200), recordCheckIn: z.boolean().default(false) })).handler(async ({ input, context }) => {
    const [c] = await db.select().from(opsCredentials).where(eq(opsCredentials.token_hash, sha256(input.token.trim()))).limit(1);
    if (!c) return { result: "unknown" as const };
    requireCan(context.principal, "attendance.record", { eventId: c.event_id, departmentKey: null });
    if (c.event_id !== input.eventId) return { result: "wrong_event" as const };
    if (c.revoked_at) return { result: "revoked" as const };
    if (c.expires_at < new Date()) return { result: "expired" as const };
    const [asg] = await db.select({ status: opsAssignments.status }).from(opsAssignments).where(eq(opsAssignments.id, c.assignment_id)).limit(1);
    if (asg?.status !== "approved") return { result: "revoked" as const };
    const [p] = await db.select({ f: crewPeople.first_name, l: crewPeople.last_name }).from(crewPeople).where(eq(crewPeople.id, c.person_id)).limit(1);
    if (input.recordCheckIn) {
      await db.insert(opsAttendance).values({ id: uuid(), assignment_id: c.assignment_id, event_id: c.event_id, person_id: c.person_id, kind: "check_in", at_utc: new Date(), source: "credential_scan", recorded_by: context.principal.userId });
    }
    return { result: "valid" as const, name: p ? `${p.f} ${p.l}` : "—", zones: c.zones, assignmentId: c.assignment_id };
  }),
};

export const attendance = {
  record: staffProc
    .input(z.object({ assignmentId: id, kind: z.enum(["check_in", "break_start", "break_end", "check_out"]), at: z.string().datetime().optional() }))
    .handler(async ({ input, context }) => {
      const a = await loadAssignment(input.assignmentId);
      requireCan(context.principal, "attendance.record", { eventId: a.event_id, departmentKey: a.department_key });
      if (a.status !== "approved") throw new ORPCError("PRECONDITION_FAILED", { message: "Assignment is not approved." });
      const rowId = uuid();
      await db.insert(opsAttendance).values({ id: rowId, assignment_id: a.id, event_id: a.event_id, person_id: a.person_id, kind: input.kind, at_utc: input.at ? new Date(input.at) : new Date(), source: "staff_entry", recorded_by: context.principal.userId });
      return { id: rowId };
    }),

  /** Corrections never edit history: they void an entry and (optionally) append a replacement, with a reason. */
  correct: staffProc
    .input(z.object({ entryId: id, reason: z.string().trim().min(5).max(500), replacement: z.object({ kind: z.enum(["check_in", "break_start", "break_end", "check_out"]), at: z.string().datetime() }).nullable() }))
    .handler(async ({ input, context }) => {
      const [e] = await db.select().from(opsAttendance).where(eq(opsAttendance.id, input.entryId)).limit(1);
      if (!e) throw new ORPCError("NOT_FOUND");
      const a = await loadAssignment(e.assignment_id);
      requireCan(context.principal, "attendance.record", { eventId: a.event_id, departmentKey: a.department_key });
      const base = { assignment_id: a.id, event_id: a.event_id, person_id: a.person_id, recorded_by: context.principal.userId, reason: input.reason };
      await db.insert(opsAttendance).values({ id: uuid(), ...base, kind: "void", at_utc: new Date(), source: "correction", corrects_id: e.id });
      if (input.replacement) await db.insert(opsAttendance).values({ id: uuid(), ...base, kind: input.replacement.kind, at_utc: new Date(input.replacement.at), source: "correction", corrects_id: e.id });
      await audit(db, actorOf(context.principal), { entityType: "attendance", entityId: e.id, action: "attendance.correct", note: input.reason });
      return { ok: true };
    }),

  forAssignment: staffProc.input(z.object({ assignmentId: id })).handler(async ({ input, context }) => {
    const a = await loadAssignment(input.assignmentId);
    requireCan(context.principal, "roster.read", { eventId: a.event_id, departmentKey: a.department_key });
    const log = await db.select().from(opsAttendance).where(eq(opsAttendance.assignment_id, a.id)).orderBy(asc(opsAttendance.created_at));
    return { log, ...computeMinutes(log) };
  }),
};

export const promoters = {
  /** Approve a promoter link for an event. Only people with an approved Promoter assignment there. */
  createLink: staffProc.input(z.object({ eventId: id, personId: id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "promoters.manage", { eventId: input.eventId });
    const asg = await db
      .select({ id: opsAssignments.id, role: opsAssignments.role_key })
      .from(opsAssignments)
      .where(and(eq(opsAssignments.event_id, input.eventId), eq(opsAssignments.person_id, input.personId), eq(opsAssignments.status, "approved")));
    if (!asg.some((a) => a.role.startsWith("promoter"))) throw new ORPCError("PRECONDITION_FAILED", { message: "Person needs an approved Promoter assignment for this event." });
    const code = `P${opaqueToken(5).replace(/[-_]/g, "x").slice(0, 7).toUpperCase()}`;
    const linkId = uuid();
    await db.insert(guestPromoterLinks).values({ id: linkId, event_id: input.eventId, person_id: input.personId, code, valid_from: new Date(), approved_by: context.principal.userId });
    await audit(db, actorOf(context.principal), { entityType: "event", entityId: input.eventId, action: "promoter_link.create", data: { linkId, personId: input.personId } });
    return { id: linkId, code };
  }),

  revokeLink: staffProc.input(z.object({ linkId: id })).handler(async ({ input, context }) => {
    const [l] = await db.select().from(guestPromoterLinks).where(eq(guestPromoterLinks.id, input.linkId)).limit(1);
    if (!l) throw new ORPCError("NOT_FOUND");
    requireCan(context.principal, "promoters.manage", { eventId: l.event_id });
    await db.update(guestPromoterLinks).set({ status: "revoked" }).where(eq(guestPromoterLinks.id, l.id));
    await audit(db, actorOf(context.principal), { entityType: "event", entityId: l.event_id, action: "promoter_link.revoke", data: { linkId: l.id } });
    return { ok: true };
  }),

  /** TEST FIXTURE ONLY: register a synthetic guest (stored as an HMAC key, never the address). */
  fixtureRegister: staffProc.input(z.object({ eventId: id, email: z.email().max(254), code: z.string().max(20).nullable() })).handler(async ({ input, context }) => {
    requireCan(context.principal, "promoters.manage", { eventId: input.eventId });
    const key = guestKey(input.email);
    const [link] = input.code
      ? await db.select().from(guestPromoterLinks).where(and(eq(guestPromoterLinks.code, input.code), eq(guestPromoterLinks.event_id, input.eventId), eq(guestPromoterLinks.status, "approved"))).limit(1)
      : [];
    const rows = await db
      .insert(guestRegistrations)
      .values({ id: uuid(), event_id: input.eventId, guest_key: key, promoter_link_id: link?.id ?? null, registered_at: new Date(), source: "test_fixture" })
      .onConflictDoNothing({ target: [guestRegistrations.event_id, guestRegistrations.guest_key] })
      .returning({ id: guestRegistrations.id });
    return { created: rows.length === 1, attributed: Boolean(link), registrationId: rows[0]?.id ?? null };
  }),

  /** TEST FIXTURE ONLY: record an admission scan. First scan = admitted, later scans = re-entry (not double counted). */
  fixtureScan: staffProc.input(z.object({ eventId: id, registrationId: id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "promoters.manage", { eventId: input.eventId });
    const [reg] = await db.select().from(guestRegistrations).where(and(eq(guestRegistrations.id, input.registrationId), eq(guestRegistrations.event_id, input.eventId))).limit(1);
    if (!reg) throw new ORPCError("NOT_FOUND");
    const prev = await db.select({ id: guestScans.id }).from(guestScans).where(and(eq(guestScans.registration_id, reg.id), eq(guestScans.result, "admitted"))).limit(1);
    const result = prev.length ? "reentry" : "admitted";
    await db.insert(guestScans).values({ id: uuid(), event_id: input.eventId, registration_id: reg.id, result, scanned_at: new Date(), scanned_by: context.principal.userId });
    return { result };
  }),

  /** Aggregates only — never guest identities. Denominators included. */
  aggregates: staffProc.input(z.object({ eventId: id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "referrals.read", { eventId: input.eventId });
    const links = await db.select().from(guestPromoterLinks).where(eq(guestPromoterLinks.event_id, input.eventId));
    const people = links.length ? await db.select({ id: crewPeople.id, f: crewPeople.first_name, l: crewPeople.last_name }).from(crewPeople).where(inArray(crewPeople.id, links.map((l) => l.person_id))) : [];
    const regs = await db
      .select({ link: guestRegistrations.promoter_link_id, n: count() })
      .from(guestRegistrations)
      .where(eq(guestRegistrations.event_id, input.eventId))
      .groupBy(guestRegistrations.promoter_link_id);
    const admitted = await db
      .select({ link: guestRegistrations.promoter_link_id, n: countDistinct(guestScans.registration_id) })
      .from(guestScans)
      .innerJoin(guestRegistrations, eq(guestRegistrations.id, guestScans.registration_id))
      .where(and(eq(guestScans.event_id, input.eventId), eq(guestScans.result, "admitted")))
      .groupBy(guestRegistrations.promoter_link_id);
    const reentries = await db.select({ n: count() }).from(guestScans).where(and(eq(guestScans.event_id, input.eventId), eq(guestScans.result, "reentry")));
    const r = new Map(regs.map((x) => [x.link, Number(x.n)]));
    const ad = new Map(admitted.map((x) => [x.link, Number(x.n)]));
    const totalRegs = regs.reduce((s, x) => s + Number(x.n), 0);
    const totalAdm = admitted.reduce((s, x) => s + Number(x.n), 0);
    return {
      source: "test_fixture_or_import — no live ticketing integration",
      totals: { registrations: totalRegs, uniqueAdmitted: totalAdm, reentries: Number(reentries[0]?.n ?? 0), unattributedRegistrations: r.get(null) ?? 0 },
      byPromoter: links.map((l) => {
        const p = people.find((x) => x.id === l.person_id);
        const regsN = r.get(l.id) ?? 0;
        const admN = ad.get(l.id) ?? 0;
        return { linkId: l.id, code: l.code, status: l.status, promoter: p ? `${p.f} ${p.l}` : "—", registrations: regsN, uniqueAdmitted: admN, showRate: regsN ? { num: admN, den: regsN } : null };
      }),
    };
  }),
};

