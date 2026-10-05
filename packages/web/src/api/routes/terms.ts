/**
 * Versioned engagement terms (Sanctuary LV Group), offers and training.
 *
 * - Terms are drafted by recruiters/approvers and must be APPROVED by a
 *   compensation_approver who did not draft them (separation of duties).
 *   Approved versions are immutable; changes create a new version.
 * - Nothing here sets worker classification — `engagement_arrangement` is a
 *   proposed arrangement recorded for the approver; no legal claim is made.
 * - Offers can only be issued from approved terms, to selected applicants
 *   with the current acknowledgement. Only the applicant can accept.
 */
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { staffProc } from "../middleware/auth";
import { db } from "../database";
import { crewApplications, crewOffers, crewTerms, crewTrainingModules, crewTrainingRecords } from "../database/schema";
import { CONSENT_VERSION, PAID_OPERATOR_ENTITY, ROLE_OPTIONS } from "../crew/contract";
import { transition } from "../crew/pipeline";
import { assertCanonicalWritable } from "../crew/integration";
import { actorOf, can, requireCan } from "../shared/permissions";
import { audit } from "../shared/audit";
import { uuid } from "../shared/ids";

const id = z.string().min(1).max(64);
const long = (n = 4000) => z.string().trim().min(1).max(n);

export const terms = {
  list: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "terms.read");
    const rows = await db.select().from(crewTerms).orderBy(asc(crewTerms.terms_key), desc(crewTerms.version));
    return {
      rows,
      canApprove: can(context.principal, "terms.approve"),
      canDraft: can(context.principal, "terms.draft"),
      me: context.principal.userId,
    };
  }),

  /** Create a new draft version (new key or next version of an existing key). */
  draft: staffProc
    .input(
      z.object({
        termsKey: z.string().regex(/^[a-z0-9-]{3,60}$/),
        roleKey: z.enum(ROLE_OPTIONS.map((r) => r.value) as [string, ...string[]]),
        title: long(120),
        duties: long(),
        compensation: long(1000),
        payBasis: long(200),
        schedule: long(1000),
        engagementArrangement: long(1000),
        acceptanceRequirements: long(2000),
      }),
    )
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "terms.draft");
      const [m] = await db.select({ v: max(crewTerms.version) }).from(crewTerms).where(eq(crewTerms.terms_key, input.termsKey));
      const version = (m?.v ?? 0) + 1;
      const newId = uuid();
      await db.insert(crewTerms).values({
        id: newId,
        terms_key: input.termsKey,
        version,
        operator_entity: PAID_OPERATOR_ENTITY,
        role_key: input.roleKey,
        title: input.title,
        duties: input.duties,
        compensation: input.compensation,
        pay_basis: input.payBasis,
        schedule: input.schedule,
        engagement_arrangement: input.engagementArrangement,
        acceptance_requirements: input.acceptanceRequirements,
        created_by: context.principal.userId,
      });
      await audit(db, actorOf(context.principal), { entityType: "terms", entityId: newId, action: "terms.draft", to: `${input.termsKey}@${version}` });
      return { id: newId, version };
    }),

  approve: staffProc.input(z.object({ id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "terms.approve");
    const [t] = await db.select().from(crewTerms).where(eq(crewTerms.id, input.id)).limit(1);
    if (!t) throw new ORPCError("NOT_FOUND");
    if (t.status !== "draft") throw new ORPCError("PRECONDITION_FAILED", { message: "Only drafts can be approved." });
    if (t.created_by === context.principal.userId)
      throw new ORPCError("FORBIDDEN", { message: "Terms must be approved by someone other than the drafter." });
    const now = new Date();
    const res = await db
      .update(crewTerms)
      .set({ status: "approved", approved_by: context.principal.userId, approved_at: now })
      .where(and(eq(crewTerms.id, t.id), eq(crewTerms.status, "draft")))
      .returning({ id: crewTerms.id });
    if (!res.length) throw new ORPCError("CONFLICT");
    await audit(db, actorOf(context.principal), { entityType: "terms", entityId: t.id, action: "terms.approve", from: "draft", to: "approved" });
    return { ok: true };
  }),

  retire: staffProc.input(z.object({ id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "terms.approve");
    await db.update(crewTerms).set({ status: "retired", retired_at: new Date() }).where(eq(crewTerms.id, input.id));
    await audit(db, actorOf(context.principal), { entityType: "terms", entityId: input.id, action: "terms.retire", to: "retired" });
    return { ok: true };
  }),
};

export const offers = {
  issue: staffProc
    .input(z.object({ applicationId: id, revision: z.number().int().min(1), termsId: id, expiresInDays: z.number().int().min(1).max(30) }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "offers.issue");
      const state = await assertCanonicalWritable("Issuing offers");
      const [app] = await db.select().from(crewApplications).where(eq(crewApplications.id, input.applicationId)).limit(1);
      if (!app || !app.person_id) throw new ORPCError("NOT_FOUND", { message: "Application or person identity missing." });
      if (app.application_status !== "selected")
        throw new ORPCError("PRECONDITION_FAILED", { message: "Offers can only be issued to selected applicants." });
      if (app.consent_version !== CONSENT_VERSION)
        throw new ORPCError("PRECONDITION_FAILED", { message: "Applicant must confirm the current Sanctuary LV Group acknowledgement first." });
      const [t] = await db.select().from(crewTerms).where(eq(crewTerms.id, input.termsId)).limit(1);
      if (!t || t.status !== "approved") throw new ORPCError("PRECONDITION_FAILED", { message: "Terms must be approved before an offer is issued." });
      const open = await db
        .select({ id: crewOffers.id })
        .from(crewOffers)
        .where(and(eq(crewOffers.application_id, app.id), eq(crewOffers.status, "issued")))
        .limit(1);
      if (open.length) throw new ORPCError("PRECONDITION_FAILED", { message: "An offer is already open for this application." });
      const offerId = uuid();
      const expires = new Date(Date.now() + input.expiresInDays * 86400_000);
      await db.insert(crewOffers).values({
        id: offerId,
        application_id: app.id,
        person_id: app.person_id,
        terms_id: t.id,
        expires_at: expires,
        issued_by: context.principal.userId,
      });
      try {
        const r = await transition({
          applicationId: app.id,
          to: "offer_issued",
          expectedRevision: input.revision,
          actor: actorOf(context.principal),
          note: `Offer ${offerId} from terms ${t.terms_key}@${t.version}`,
          via: "offer_workflow",
          mode: state.mode,
        });
        await audit(db, actorOf(context.principal), { entityType: "offer", entityId: offerId, action: "offer.issue", to: "issued", data: { termsId: t.id, expiresAt: expires.toISOString() } });
        return { offerId, revision: r.revision };
      } catch (e) {
        await db.delete(crewOffers).where(eq(crewOffers.id, offerId));
        throw e;
      }
    }),

  cancel: staffProc.input(z.object({ offerId: id, revision: z.number().int().min(1), reason: z.string().min(3).max(500) })).handler(async ({ input, context }) => {
    requireCan(context.principal, "offers.issue");
    const [o] = await db.select().from(crewOffers).where(eq(crewOffers.id, input.offerId)).limit(1);
    if (!o) throw new ORPCError("NOT_FOUND");
    if (o.status !== "issued") throw new ORPCError("PRECONDITION_FAILED", { message: "Only open offers can be cancelled." });
    const res = await db
      .update(crewOffers)
      .set({ status: "cancelled", revision: o.revision + 1, updated_at: new Date(), response_note: input.reason })
      .where(and(eq(crewOffers.id, o.id), eq(crewOffers.revision, input.revision)))
      .returning({ id: crewOffers.id });
    if (!res.length) throw new ORPCError("CONFLICT", { message: "The offer changed since you loaded it." });
    const [app] = await db.select().from(crewApplications).where(eq(crewApplications.id, o.application_id)).limit(1);
    if (app?.application_status === "offer_issued") {
      const state = await assertCanonicalWritable("Cancelling offers");
      await transition({ applicationId: app.id, to: "selected", expectedRevision: app.revision, actor: actorOf(context.principal), note: `Offer cancelled: ${input.reason}`, via: "offer_workflow", mode: state.mode });
    }
    await audit(db, actorOf(context.principal), { entityType: "offer", entityId: o.id, action: "offer.cancel", from: "issued", to: "cancelled", note: input.reason });
    return { ok: true };
  }),
};

export const training = {
  // Module catalogue only (no person records) — readable by any staff member.
  modules: staffProc.handler(async () => {
    return db.select().from(crewTrainingModules).orderBy(asc(crewTrainingModules.module_key), desc(crewTrainingModules.version));
  }),

  records: staffProc.input(z.object({ personId: id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "training.verify", { eventId: null });
    return db.select().from(crewTrainingRecords).where(eq(crewTrainingRecords.person_id, input.personId));
  }),

  verify: staffProc.input(z.object({ recordId: id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "training.verify", { eventId: null });
    const [r] = await db.select().from(crewTrainingRecords).where(eq(crewTrainingRecords.id, input.recordId)).limit(1);
    if (!r) throw new ORPCError("NOT_FOUND");
    if (!r.completed_at) throw new ORPCError("PRECONDITION_FAILED", { message: "The worker has not marked this module complete." });
    await db.update(crewTrainingRecords).set({ verified_at: new Date(), verified_by: context.principal.userId }).where(eq(crewTrainingRecords.id, r.id));
    await audit(db, actorOf(context.principal), { entityType: "person", entityId: r.person_id, action: "training.verify", data: { moduleId: r.module_id } });
    return { ok: true };
  }),
};
