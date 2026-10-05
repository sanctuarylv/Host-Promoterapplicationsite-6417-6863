/**
 * Recruiter pipeline (individual staff sign-in, scoped permissions).
 * Every write is revision-checked and audited. Local data is
 * authority=local_staging — Command Center remains the canonical owner.
 */
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { staffProc } from "../middleware/auth";
import { db } from "../database";
import {
  crewApplications,
  crewAudit,
  crewInterviews,
  crewOffers,
  crewPeople,
  crewScorecards,
  personLinkTokens,
  staffMemberships,
  user as authUser,
} from "../database/schema";
import { listApplications, listInputSchema } from "../crew/app-list";
import { allowedNext, prerequisites, touchApplication, transition } from "../crew/pipeline";
import { PIPELINE_STATUSES, scorecardKindsFor, type PipelineStatus } from "../crew/contract";
import { RUBRIC_VERSION, RUBRICS, validateScorecard } from "../crew/scorecards";
import { assertCanonicalWritable, getIntegrationState } from "../crew/integration";
import { actorOf, requireCan } from "../shared/permissions";
import { audit } from "../shared/audit";
import { opaqueToken, sha256, uuid } from "../shared/ids";

const id = z.string().min(1).max(64);
const rev = z.number().int().min(1);

async function loadApp(appId: string) {
  const [app] = await db.select().from(crewApplications).where(eq(crewApplications.id, appId)).limit(1);
  if (!app) throw new ORPCError("NOT_FOUND", { message: "Application not found." });
  return app;
}

export const recruiting = {
  list: staffProc.input(listInputSchema).handler(async ({ input, context }) => {
    requireCan(context.principal, "recruiting.read");
    const page = await listApplications(input, context.principal.userId);
    const state = await getIntegrationState();
    return { ...page, integration: { mode: state.mode, reason: state.reason } };
  }),

  detail: staffProc.input(z.object({ id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "recruiting.read");
    const app = await loadApp(input.id);
    const [person] = app.person_id ? await db.select().from(crewPeople).where(eq(crewPeople.id, app.person_id)).limit(1) : [];
    const others = app.person_id
      ? await db
          .select({ id: crewApplications.id, opportunity_key: crewApplications.opportunity_key, status: crewApplications.application_status })
          .from(crewApplications)
          .where(eq(crewApplications.person_id, app.person_id))
      : [];
    const interviews = await db.select().from(crewInterviews).where(eq(crewInterviews.application_id, app.id)).orderBy(asc(crewInterviews.created_at));
    const scorecards = await db.select().from(crewScorecards).where(eq(crewScorecards.application_id, app.id)).orderBy(asc(crewScorecards.created_at));
    const offers = await db.select().from(crewOffers).where(eq(crewOffers.application_id, app.id)).orderBy(desc(crewOffers.created_at));
    const timeline = await db
      .select()
      .from(crewAudit)
      .where(and(eq(crewAudit.entity_type, "application"), eq(crewAudit.entity_id, app.id)))
      .orderBy(desc(crewAudit.created_at))
      .limit(200);
    const next = (PIPELINE_STATUSES as readonly string[]).includes(app.application_status)
      ? allowedNext(app.application_status as PipelineStatus)
      : [];
    const gates = await Promise.all(next.map(async (to) => ({ to, ...(await prerequisites(app, to)) })));
    const state = await getIntegrationState();
    const kinds = scorecardKindsFor(app.role_interest);
    return {
      app,
      person: person
        ? { id: person.id, phoneShared: person.phone_shared, linked: Boolean(person.user_id), linkedAt: person.linked_at }
        : null,
      otherApplications: others.filter((o) => o.id !== app.id),
      interviews,
      scorecards,
      offers,
      timeline,
      next: gates,
      rubrics: kinds.map((k) => ({ kind: k, version: RUBRIC_VERSION, ...RUBRICS[k] })),
      integration: { mode: state.mode, reason: state.reason },
      canWrite: {
        recruiting: context.principal.memberships.some((m) => m.role === "admin" || m.role === "recruiter"),
      },
    };
  }),

  /** Staff accounts available as reviewers/interviewers. */
  // Names + roles of active staff only (no applicant data). Any staff member may read
  // it — approvers need to see who drafted terms to keep separation of duties visible.
  staffDirectory: staffProc.handler(async () => {
    const rows = await db
      .select({ userId: staffMemberships.user_id, role: staffMemberships.role, name: authUser.name })
      .from(staffMemberships)
      .innerJoin(authUser, eq(authUser.id, staffMemberships.user_id))
      .where(isNull(staffMemberships.revoked_at));
    const by = new Map<string, { userId: string; name: string; roles: string[] }>();
    for (const r of rows) {
      const e = by.get(r.userId) ?? { userId: r.userId, name: r.name, roles: [] };
      e.roles.push(r.role);
      by.set(r.userId, e);
    }
    return [...by.values()];
  }),

  assignReviewer: staffProc
    .input(z.object({ id, revision: rev, reviewerUserId: z.string().max(64).nullable(), dueAt: z.string().datetime().nullable() }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "recruiting.write");
      if (input.reviewerUserId) {
        const ok = await db
          .select({ id: staffMemberships.id })
          .from(staffMemberships)
          .where(and(eq(staffMemberships.user_id, input.reviewerUserId), isNull(staffMemberships.revoked_at)))
          .limit(1);
        if (!ok.length) throw new ORPCError("BAD_REQUEST", { message: "Reviewer must be an active staff account." });
      }
      return touchApplication(
        input.id,
        input.revision,
        { reviewer_user_id: input.reviewerUserId, review_due_at: input.dueAt ? new Date(input.dueAt) : null },
        actorOf(context.principal),
        "reviewer.assign",
        { reviewer: input.reviewerUserId, dueAt: input.dueAt },
      );
    }),

  transition: staffProc
    .input(z.object({ id, revision: rev, to: z.enum(PIPELINE_STATUSES), note: z.string().max(2000).optional() }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "recruiting.write");
      const state = await assertCanonicalWritable("Status changes");
      return transition({
        applicationId: input.id,
        to: input.to,
        expectedRevision: input.revision,
        actor: actorOf(context.principal),
        note: input.note ?? null,
        mode: state.mode,
      });
    }),

  scheduleInterview: staffProc
    .input(
      z.object({
        applicationId: id,
        kind: z.enum(["screen", "assessment"]),
        format: z.enum(["phone", "video", "in_person", "simulated_assessment"]),
        scheduledAt: z.string().datetime().nullable(),
        interviewerUserId: z.string().max(64).nullable(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "recruiting.write");
      const app = await loadApp(input.applicationId);
      if (["declined", "withdrawn"].includes(app.application_status))
        throw new ORPCError("PRECONDITION_FAILED", { message: "Application is closed." });
      const newId = uuid();
      await db.insert(crewInterviews).values({
        id: newId,
        application_id: app.id,
        kind: input.kind,
        format: input.format,
        scheduled_at: input.scheduledAt ? new Date(input.scheduledAt) : null,
        interviewer_user_id: input.interviewerUserId,
        notes: input.notes || null,
        created_by: context.principal.userId,
      });
      await audit(db, actorOf(context.principal), {
        entityType: "application",
        entityId: app.id,
        action: "interview.schedule",
        to: input.kind,
        data: { interviewId: newId, format: input.format, scheduledAt: input.scheduledAt },
      });
      return { id: newId };
    }),

  updateInterview: staffProc
    .input(z.object({ id, revision: rev, status: z.enum(["scheduled", "completed", "no_show", "cancelled"]), notes: z.string().max(2000).optional() }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "recruiting.write");
      const [iv] = await db.select().from(crewInterviews).where(eq(crewInterviews.id, input.id)).limit(1);
      if (!iv) throw new ORPCError("NOT_FOUND");
      const res = await db
        .update(crewInterviews)
        .set({ status: input.status, notes: input.notes ?? iv.notes, revision: iv.revision + 1, updated_at: new Date() })
        .where(and(eq(crewInterviews.id, iv.id), eq(crewInterviews.revision, input.revision)))
        .returning({ id: crewInterviews.id });
      if (!res.length) throw new ORPCError("CONFLICT", { message: "This interview changed since you loaded it." });
      await audit(db, actorOf(context.principal), {
        entityType: "application",
        entityId: iv.application_id,
        action: "interview.update",
        from: iv.status,
        to: input.status,
        data: { interviewId: iv.id },
      });
      return { revision: iv.revision + 1 };
    }),

  submitScorecard: staffProc
    .input(
      z.object({
        applicationId: id,
        kind: z.enum(["host", "promoter"]),
        scores: z.record(z.string().max(40), z.number().int()),
        evidence: z.record(z.string().max(40), z.string().max(1000)),
        recommendation: z.enum(["advance", "hold", "do_not_advance"]),
      }),
    )
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "recruiting.write");
      const app = await loadApp(input.applicationId);
      if (!scorecardKindsFor(app.role_interest).includes(input.kind))
        throw new ORPCError("BAD_REQUEST", { message: `A ${input.kind} scorecard does not apply to this role interest.` });
      const errors = validateScorecard(input.kind, input.scores, input.evidence);
      if (errors.length) throw new ORPCError("BAD_REQUEST", { message: errors.join(" "), data: { errors } });
      const newId = uuid();
      await db.insert(crewScorecards).values({
        id: newId,
        application_id: app.id,
        kind: input.kind,
        rubric_version: RUBRIC_VERSION,
        scores: input.scores,
        evidence: input.evidence,
        recommendation: input.recommendation,
        reviewer_user_id: context.principal.userId,
      });
      await audit(db, actorOf(context.principal), {
        entityType: "application",
        entityId: app.id,
        action: "scorecard.submit",
        to: input.recommendation,
        data: { scorecardId: newId, kind: input.kind, rubric: RUBRIC_VERSION },
      });
      return { id: newId };
    }),

  /**
   * One-time worker link code. Linking a sign-in account to a crew profile is
   * ALWAYS explicit (the worker redeems this code) — never by email match.
   * The plaintext code is returned once to the staff member to hand over in
   * person or through an approved channel; this app sends no messages.
   */
  issueLinkToken: staffProc.input(z.object({ personId: id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "people.link");
    const [person] = await db.select().from(crewPeople).where(eq(crewPeople.id, input.personId)).limit(1);
    if (!person) throw new ORPCError("NOT_FOUND");
    if (person.user_id) throw new ORPCError("PRECONDITION_FAILED", { message: "This profile is already linked to an account." });
    const now = new Date();
    await db
      .update(personLinkTokens)
      .set({ revoked_at: now })
      .where(and(eq(personLinkTokens.person_id, person.id), isNull(personLinkTokens.used_at), isNull(personLinkTokens.revoked_at)));
    const token = `SX-${opaqueToken(12)}`;
    const tokenId = uuid();
    const expires = new Date(now.getTime() + 72 * 3600_000);
    await db.insert(personLinkTokens).values({
      id: tokenId,
      person_id: person.id,
      token_hash: sha256(token),
      expires_at: expires,
      created_by_user_id: context.principal.userId,
    });
    await audit(db, actorOf(context.principal), { entityType: "person", entityId: person.id, action: "link_token.issue", data: { tokenId, expiresAt: expires.toISOString() } });
    return { token, expiresAt: expires.toISOString() };
  }),

  /** People who may be assigned to events: accepted offers on the paid pathway. */
  assignable: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "event.read", { eventId: null });
    const offers = await db
      .select({ personId: crewOffers.person_id, applicationId: crewOffers.application_id, offerId: crewOffers.id })
      .from(crewOffers)
      .where(eq(crewOffers.status, "accepted"));
    if (!offers.length) return [];
    const apps = await db
      .select({ id: crewApplications.id, first: crewApplications.first_name, last: crewApplications.last_name, role: crewApplications.role_interest })
      .from(crewApplications)
      .where(inArray(crewApplications.id, offers.map((o) => o.applicationId)));
    const byApp = new Map(apps.map((a) => [a.id, a]));
    return offers.map((o) => ({ ...o, name: `${byApp.get(o.applicationId)?.first ?? ""} ${byApp.get(o.applicationId)?.last ?? ""}`.trim(), role: byApp.get(o.applicationId)?.role ?? "" }));
  }),
};
