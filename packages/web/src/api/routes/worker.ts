/**
 * Signed-in self-service.
 * - `me.session`: who am I, which staff scopes, am I linked to a crew profile.
 * - `me.redeemLink`: explicit account ↔ crew profile link with a one-time code
 *   issued by staff. Never automatic, never by email match.
 * - `worker.*`: only the linked person's own records.
 */
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { principalProc, workerProc } from "../middleware/auth";
import { db } from "../database";
import {
  crewApplications,
  crewOffers,
  crewPeople,
  crewTerms,
  crewTrainingModules,
  crewTrainingRecords,
  opsAssignments,
  opsAttendance,
  opsEvents,
  opsRunOfShow,
  opsTemplateRoles,
  personLinkTokens,
} from "../database/schema";
import { audit } from "../shared/audit";
import { sha256, uuid } from "../shared/ids";
import { limitRequest } from "../crew/rate-limit";
import { transition } from "../crew/pipeline";
import { assertCanonicalWritable, getIntegrationState } from "../crew/integration";
import { CONSENT_VERSION, ACKNOWLEDGEMENT_V2 } from "../crew/contract";
import { can } from "../shared/permissions";
import { activeCredentialFor, assignmentReadiness, credentialToken } from "../ops/readiness";
import { wallOf } from "../ops/time";
import { computeMinutes } from "../ops/attendance";

const id = z.string().min(1).max(64);
const workerActor = (userId: string) => ({ userId, label: "worker" });

/** Statuses as the applicant sees them (internal steps collapsed). */
const PUBLIC_STATUS: Record<string, string> = {
  submitted: "Received",
  reviewed: "In review",
  screen_invited: "Screening",
  screen_completed: "Screening",
  assessment: "Assessment",
  selected: "In review",
  offer_issued: "Offer available",
  accepted: "Offer accepted",
  onboarding: "Onboarding",
  event_ready: "Ready for event",
  waitlisted: "Waitlist",
  declined: "Closed",
  withdrawn: "Withdrawn",
};

export const me = {
  session: principalProc.handler(async ({ context }) => {
    const p = context.principal;
    const state = p.memberships.length ? await getIntegrationState() : null;
    return {
      /** Staff-only banner: the evidence-derived integration mode (never set by hand). */
      integration: state ? { mode: state.mode, reason: state.reason } : null,
      user: { id: p.userId, name: p.name, email: p.email },
      staff: p.memberships.map((m) => ({ role: m.role, eventId: m.eventId, departmentKey: m.departmentKey })),
      isStaff: p.memberships.length > 0,
      linkedPersonId: p.personId,
      /** Navigation hints only — every procedure re-checks its own permission server-side. */
      sections: {
        applicants: can(p, "recruiting.read"),
        terms: can(p, "terms.read"),
        events: p.memberships.some((m) => ["admin", "event_director", "department_lead", "promotion_lead", "compensation_approver"].includes(m.role)),
        planning: can(p, "event.read", { eventId: null }),
        campaigns: can(p, "campaigns.read"),
        serve: can(p, "serve.manage"),
        integration: can(p, "integration.manage"),
        staff: can(p, "staff.manage"),
      },
    };
  }),

  redeemLink: principalProc.input(z.object({ code: z.string().trim().min(6).max(80) })).handler(async ({ input, context }) => {
    const rl = await limitRequest(context.headers, `link:${context.principal.userId}`, 10, 10, 15 * 60_000);
    if (!rl.ok) throw new ORPCError("TOO_MANY_REQUESTS");
    if (context.principal.personId) throw new ORPCError("PRECONDITION_FAILED", { message: "This account is already linked to a crew profile." });
    const now = new Date();
    const [t] = await db
      .select()
      .from(personLinkTokens)
      .where(and(eq(personLinkTokens.token_hash, sha256(input.code)), isNull(personLinkTokens.used_at), isNull(personLinkTokens.revoked_at), gt(personLinkTokens.expires_at, now)))
      .limit(1);
    if (!t) throw new ORPCError("BAD_REQUEST", { message: "That code is invalid or expired. Ask your recruiter for a new one." });
    await db.transaction(async (tx) => {
      const used = await tx
        .update(personLinkTokens)
        .set({ used_at: now, used_by_user_id: context.principal.userId })
        .where(and(eq(personLinkTokens.id, t.id), isNull(personLinkTokens.used_at)))
        .returning({ id: personLinkTokens.id });
      if (!used.length) throw new ORPCError("CONFLICT", { message: "Code already used." });
      const linked = await tx
        .update(crewPeople)
        .set({ user_id: context.principal.userId, linked_at: now, linked_via: `link_token:${t.id}`, updated_at: now })
        .where(and(eq(crewPeople.id, t.person_id), isNull(crewPeople.user_id)))
        .returning({ id: crewPeople.id });
      if (!linked.length) throw new ORPCError("CONFLICT", { message: "This crew profile is already linked." });
      await audit(tx, workerActor(context.principal.userId), { entityType: "person", entityId: t.person_id, action: "link_token.redeem", data: { tokenId: t.id } });
    });
    return { ok: true };
  }),
};

export const worker = {
  overview: workerProc.handler(async ({ context }) => {
    const pid = context.personId;
    const apps = await db
      .select({ id: crewApplications.id, opportunity: crewApplications.opportunity_key, status: crewApplications.application_status, role: crewApplications.role_interest, consent: crewApplications.consent_version, revision: crewApplications.revision, created_at: crewApplications.created_at })
      .from(crewApplications)
      .where(eq(crewApplications.person_id, pid));
    const offers = await db.select().from(crewOffers).where(eq(crewOffers.person_id, pid)).orderBy(desc(crewOffers.created_at));
    const termRows = offers.length ? await db.select().from(crewTerms).where(inArray(crewTerms.id, offers.map((o) => o.terms_id))) : [];
    const asg = await db.select().from(opsAssignments).where(and(eq(opsAssignments.person_id, pid), ne(opsAssignments.status, "cancelled")));
    const evs = asg.length ? await db.select().from(opsEvents).where(inArray(opsEvents.id, [...new Set(asg.map((a) => a.event_id))])) : [];
    const roleKeys = new Set<string>(apps.map((a) => a.role));
    const roles = evs.length ? await db.select().from(opsTemplateRoles).where(inArray(opsTemplateRoles.template_version_id, evs.map((e) => e.template_version_id))) : [];
    for (const a of asg) roleKeys.add(a.role_key);
    const requiredModuleKeys = new Set<string>(asg.flatMap((a) => roles.find((r) => r.role_key === a.role_key)?.training ?? []));
    const modules = await db.select().from(crewTrainingModules).where(eq(crewTrainingModules.status, "active")).orderBy(asc(crewTrainingModules.module_key));
    const records = await db.select().from(crewTrainingRecords).where(eq(crewTrainingRecords.person_id, pid));
    const relevant = modules.filter((m) => m.required_for.includes("*") || m.required_for.some((r) => roleKeys.has(r)) || requiredModuleKeys.has(m.module_key));
    const now = Date.now();
    return {
      applications: apps.map((a) => ({ ...a, label: PUBLIC_STATUS[a.status] ?? "In review", needsReconsent: a.consent !== CONSENT_VERSION })),
      acknowledgement: { version: CONSENT_VERSION, statements: ACKNOWLEDGEMENT_V2 },
      offers: offers.map((o) => {
        const t = termRows.find((x) => x.id === o.terms_id);
        return {
          id: o.id,
          status: o.status === "issued" && o.expires_at.getTime() < now ? "expired" : o.status,
          revision: o.revision,
          expiresAt: o.expires_at,
          terms: t ? { title: t.title, version: t.version, operator: t.operator_entity, duties: t.duties, compensation: t.compensation, payBasis: t.pay_basis, schedule: t.schedule, arrangement: t.engagement_arrangement, acceptance: t.acceptance_requirements } : null,
        };
      }),
      training: relevant.map((m) => {
        const r = records.find((x) => x.module_id === m.id);
        return { id: m.id, key: m.module_key, title: m.title, summary: m.summary, verification: m.verification, completedAt: r?.completed_at ?? null, verifiedAt: r?.verified_at ?? null, required: requiredModuleKeys.has(m.module_key) || m.required_for.includes("*") };
      }),
      assignments: await Promise.all(
        asg.map(async (a) => {
          const ev = evs.find((e) => e.id === a.event_id)!;
          const role = roles.find((r) => r.role_key === a.role_key && r.template_version_id === ev.template_version_id);
          return {
            id: a.id,
            status: a.status,
            event: { id: ev.id, name: ev.name, localDate: ev.local_date, dateConfirmed: ev.date_confirmed, venue: ev.venue_confirmed ? ev.venue_name : null },
            role: role?.title ?? a.role_key,
            call: a.shift_start_utc ? wallOf(a.shift_start_utc.getTime(), ev.timezone) : null,
            release: a.shift_end_utc ? wallOf(a.shift_end_utc.getTime(), ev.timezone) : null,
            readiness: await assignmentReadiness(a.id),
          };
        }),
      ),
    };
  }),

  /** Re-confirm the current Sanctuary LV Group acknowledgement on an older application. */
  reacknowledge: workerProc.input(z.object({ applicationId: id, consentVersion: z.literal(CONSENT_VERSION) })).handler(async ({ input, context }) => {
    const [a] = await db.select().from(crewApplications).where(and(eq(crewApplications.id, input.applicationId), eq(crewApplications.person_id, context.personId))).limit(1);
    if (!a) throw new ORPCError("NOT_FOUND");
    const now = new Date();
    const done = await db
      .update(crewApplications)
      .set({ consent_version: CONSENT_VERSION, required_consent_at: now, revision: a.revision + 1, updated_at: now })
      .where(and(eq(crewApplications.id, a.id), eq(crewApplications.revision, a.revision)))
      .returning({ id: crewApplications.id });
    if (!done.length) throw new ORPCError("CONFLICT", { message: "Your application changed. Reload and try again." });
    await audit(db, workerActor(context.principal.userId), { entityType: "application", entityId: a.id, action: "consent.reacknowledge", from: a.consent_version, to: CONSENT_VERSION, revision: a.revision + 1 });
    return { ok: true };
  }),

  respondOffer: workerProc
    .input(z.object({ offerId: id, revision: z.number().int().min(1), accept: z.boolean(), note: z.string().max(500).optional() }))
    .handler(async ({ input, context }) => {
      const [o] = await db.select().from(crewOffers).where(and(eq(crewOffers.id, input.offerId), eq(crewOffers.person_id, context.personId))).limit(1);
      if (!o) throw new ORPCError("NOT_FOUND");
      if (o.status !== "issued") throw new ORPCError("PRECONDITION_FAILED", { message: "This offer is no longer open." });
      if (o.expires_at < new Date()) throw new ORPCError("PRECONDITION_FAILED", { message: "This offer has expired. Contact your recruiter." });
      const state = await assertCanonicalWritable("Responding to offers");
      const [app] = await db.select().from(crewApplications).where(eq(crewApplications.id, o.application_id)).limit(1);
      if (!app) throw new ORPCError("NOT_FOUND");
      const to = input.accept ? "accepted" : "declined";
      const res = await db
        .update(crewOffers)
        .set({ status: to, revision: o.revision + 1, responded_at: new Date(), response_note: input.note ?? null, updated_at: new Date() })
        .where(and(eq(crewOffers.id, o.id), eq(crewOffers.revision, input.revision), eq(crewOffers.status, "issued"), gt(crewOffers.expires_at, new Date())))
        .returning({ id: crewOffers.id });
      if (!res.length) throw new ORPCError("CONFLICT", { message: "This offer changed. Reload to see the latest version." });
      try {
        await transition({ applicationId: app.id, to: input.accept ? "accepted" : "selected", expectedRevision: app.revision, actor: workerActor(context.principal.userId), note: `Offer ${o.id} ${to} by applicant`, via: "worker", mode: state.mode });
      } catch (e) {
        // Compensate ONLY our own write: if staff changed the offer meanwhile
        // (e.g. cancelled it), that newer state wins and is left untouched.
        await db
          .update(crewOffers)
          .set({ status: "issued", revision: o.revision + 2, responded_at: null, response_note: null, updated_at: new Date() })
          .where(and(eq(crewOffers.id, o.id), eq(crewOffers.revision, o.revision + 1), eq(crewOffers.status, to)));
        throw e;
      }
      await audit(db, workerActor(context.principal.userId), { entityType: "offer", entityId: o.id, action: `offer.${to}`, from: "issued", to, revision: o.revision + 1 });
      return { status: to };
    }),

  completeTraining: workerProc.input(z.object({ moduleId: id })).handler(async ({ input, context }) => {
    const [m] = await db.select().from(crewTrainingModules).where(and(eq(crewTrainingModules.id, input.moduleId), eq(crewTrainingModules.status, "active"))).limit(1);
    if (!m) throw new ORPCError("NOT_FOUND");
    const now = new Date();
    await db
      .insert(crewTrainingRecords)
      .values({ id: uuid(), person_id: context.personId, module_id: m.id, completed_at: now })
      .onConflictDoUpdate({ target: [crewTrainingRecords.person_id, crewTrainingRecords.module_id], set: { completed_at: now } });
    await audit(db, workerActor(context.principal.userId), { entityType: "person", entityId: context.personId, action: "training.complete", data: { moduleId: m.id, verification: m.verification } });
    return { ok: true, needsVerification: m.verification === "staff_verified" };
  }),

  /** Own credential (QR value). Shown only to the assigned worker; DB keeps the hash. */
  credential: workerProc.input(z.object({ assignmentId: id })).handler(async ({ input, context }) => {
    const [a] = await db.select().from(opsAssignments).where(and(eq(opsAssignments.id, input.assignmentId), eq(opsAssignments.person_id, context.personId))).limit(1);
    if (!a) throw new ORPCError("NOT_FOUND");
    if (a.status !== "approved") return { status: "none" as const };
    const c = await activeCredentialFor(a.id);
    if (!c) return { status: "none" as const };
    return { status: "active" as const, token: credentialToken(c.id), expiresAt: c.expires_at, zones: c.zones };
  }),

  /** Own attendance log + computed minutes (append-only; corrections shown as voids). */
  attendance: workerProc.input(z.object({ assignmentId: id })).handler(async ({ input, context }) => {
    const [a] = await db.select().from(opsAssignments).where(and(eq(opsAssignments.id, input.assignmentId), eq(opsAssignments.person_id, context.personId))).limit(1);
    if (!a) throw new ORPCError("NOT_FOUND");
    const log = await db
      .select({ id: opsAttendance.id, kind: opsAttendance.kind, at_utc: opsAttendance.at_utc, corrects_id: opsAttendance.corrects_id, source: opsAttendance.source })
      .from(opsAttendance)
      .where(eq(opsAttendance.assignment_id, a.id))
      .orderBy(asc(opsAttendance.created_at));
    return { log, ...computeMinutes(log) };
  }),
  /** Own call sheet: only the worker's own call, supervisor and public run-of-show items. */
  callSheet: workerProc.input(z.object({ assignmentId: id })).handler(async ({ input, context }) => {
    const [a] = await db.select().from(opsAssignments).where(and(eq(opsAssignments.id, input.assignmentId), eq(opsAssignments.person_id, context.personId), eq(opsAssignments.status, "approved"))).limit(1);
    if (!a) throw new ORPCError("NOT_FOUND");
    const [ev] = await db.select().from(opsEvents).where(eq(opsEvents.id, a.event_id)).limit(1);
    if (!ev) throw new ORPCError("NOT_FOUND");
    const [role] = await db.select().from(opsTemplateRoles).where(and(eq(opsTemplateRoles.template_version_id, ev.template_version_id), eq(opsTemplateRoles.role_key, a.role_key))).limit(1);
    const [sup] = a.supervisor_person_id ? await db.select({ f: crewPeople.first_name, l: crewPeople.last_name }).from(crewPeople).where(eq(crewPeople.id, a.supervisor_person_id)).limit(1) : [];
    const ros = await db.select().from(opsRunOfShow).where(eq(opsRunOfShow.event_id, ev.id)).orderBy(asc(opsRunOfShow.seq));
    return {
      event: { name: ev.name, localDate: ev.local_date, dateConfirmed: ev.date_confirmed, venue: ev.venue_confirmed ? ev.venue_name : "Venue to be confirmed", timezone: ev.timezone, milestones: ev.resolved_milestones ?? [] },
      role: role?.title ?? a.role_key,
      duties: role?.responsibilities ?? null,
      dress: role?.dress ?? null,
      call: a.shift_start_utc ? wallOf(a.shift_start_utc.getTime(), ev.timezone) : "TBD",
      release: a.shift_end_utc ? wallOf(a.shift_end_utc.getTime(), ev.timezone) : "TBD",
      supervisor: sup ? `${sup.f} ${sup.l}` : "To be confirmed",
      zones: a.zones,
      runOfShow: ros.filter((x) => !x.department_key || x.department_key === a.department_key).map((x) => ({ title: x.title, milestone: x.milestone_key, offset: x.offset_min })),
    };
  }),
};
