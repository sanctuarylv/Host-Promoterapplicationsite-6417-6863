/**
 * Event operations: org chain, staffing templates (immutable published
 * versions), events, assignments, readiness, run of show, call sheets,
 * coverage and closeout. All planning data is local_staging.
 */
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, isNull, max, ne } from "drizzle-orm";
import { staffProc } from "../middleware/auth";
import { db } from "../database";
import {
  crewApplications,
  crewOffers,
  crewPeople,
  opsAssignments,
  opsCloseouts,
  opsCredentials,
  opsEventRoleOverrides,
  opsEvents,
  opsOrgUnits,
  opsProviderFulfillment,
  opsReportingLines,
  opsRunOfShow,
  opsTemplateRoles,
  opsTemplates,
  opsTemplateVersions,
} from "../database/schema";
import { actorOf, can, requireCan, visibleDepartments } from "../shared/permissions";
import { audit } from "../shared/audit";
import { uuid } from "../shared/ids";
import { addReportingLine, RELATIONS, removeReportingLine } from "../ops/org";
import { DEFAULT_TZ, overlaps, resolveMilestones, wallOf, zonedToUtc } from "../ops/time";
import { assignmentReadiness } from "../ops/readiness";
import { peakConcurrent, roleGap, slotTotals, WORKFORCE_KINDS } from "../ops/coverage";

const id = z.string().min(1).max(64);
const rev = z.number().int().min(1);
const ambiguity = z.enum(["reject", "earlier", "later"]).default("reject");

async function loadEvent(eventId: string) {
  const [ev] = await db.select().from(opsEvents).where(eq(opsEvents.id, eventId)).limit(1);
  if (!ev) throw new ORPCError("NOT_FOUND", { message: "Event not found." });
  return ev;
}

async function templateRoles(versionId: string) {
  return db.select().from(opsTemplateRoles).where(eq(opsTemplateRoles.template_version_id, versionId)).orderBy(asc(opsTemplateRoles.sort));
}

/** Slot math per role: template count, event override (may be unknown), provider fulfilment. */
function roleSlots(
  r: typeof opsTemplateRoles.$inferSelect,
  ov: (typeof opsEventRoleOverrides.$inferSelect)[],
  pf: (typeof opsProviderFulfillment.$inferSelect)[],
) {
  const o = ov.find((x) => x.role_key === r.role_key);
  const planned = o ? o.count : (r.approved_count ?? r.recommended_count);
  const providers = pf.filter((p) => p.role_key === r.role_key);
  return { planned, override: o ?? null, providers };
}

export const org = {
  chart: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "event.read", { eventId: null });
    const units = await db.select().from(opsOrgUnits);
    const lines = await db.select().from(opsReportingLines);
    return { units, lines, canManage: can(context.principal, "event.manage", { eventId: null }) };
  }),
  addLine: staffProc
    .input(z.object({ relation: z.enum(RELATIONS), child: z.string().max(60), parent: z.string().max(60), note: z.string().max(300).optional() }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "event.manage", { eventId: null });
      const units = await db.select({ key: opsOrgUnits.key }).from(opsOrgUnits).where(inArray(opsOrgUnits.key, [input.child, input.parent]));
      if (units.length !== (input.child === input.parent ? 1 : 2)) throw new ORPCError("BAD_REQUEST", { message: "Unknown org unit." });
      const r = await addReportingLine(input.relation, input.child, input.parent, uuid(), input.note);
      if (!r.ok) throw new ORPCError("PRECONDITION_FAILED", { message: "That reporting line would create a cycle." });
      await audit(db, actorOf(context.principal), { entityType: "org", entityId: input.child, action: "org.add_line", to: `${input.relation}:${input.parent}` });
      return r;
    }),
  removeLine: staffProc
    .input(z.object({ relation: z.enum(RELATIONS), child: z.string().max(60), parent: z.string().max(60) }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "event.manage", { eventId: null });
      await removeReportingLine(input.relation, input.child, input.parent);
      await audit(db, actorOf(context.principal), { entityType: "org", entityId: input.child, action: "org.remove_line", from: `${input.relation}:${input.parent}` });
      return { ok: true };
    }),
};

export const templates = {
  list: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "event.read", { eventId: null });
    const ts = await db.select().from(opsTemplates);
    const vs = await db.select().from(opsTemplateVersions).orderBy(desc(opsTemplateVersions.version));
    return ts.map((t) => ({ ...t, versions: vs.filter((v) => v.template_id === t.id) }));
  }),

  version: staffProc.input(z.object({ versionId: id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "event.read", { eventId: null });
    const [v] = await db.select().from(opsTemplateVersions).where(eq(opsTemplateVersions.id, input.versionId)).limit(1);
    if (!v) throw new ORPCError("NOT_FOUND");
    const roles = await templateRoles(v.id);
    const totals = slotTotals(roles.map((r) => ({ ...r, planned: r.approved_count ?? r.recommended_count })));
    return { version: v, roles, totals };
  }),

  /** Clone any version into a new DRAFT (published versions are never edited in place). */
  cloneVersion: staffProc.input(z.object({ versionId: id, note: z.string().max(300).optional() })).handler(async ({ input, context }) => {
    requireCan(context.principal, "event.manage", { eventId: null });
    const [v] = await db.select().from(opsTemplateVersions).where(eq(opsTemplateVersions.id, input.versionId)).limit(1);
    if (!v) throw new ORPCError("NOT_FOUND");
    const [m] = await db.select({ v: max(opsTemplateVersions.version) }).from(opsTemplateVersions).where(eq(opsTemplateVersions.template_id, v.template_id));
    const newId = uuid();
    const roles = await templateRoles(v.id);
    await db.transaction(async (tx) => {
      await tx.insert(opsTemplateVersions).values({
        id: newId,
        template_id: v.template_id,
        version: (m?.v ?? v.version) + 1,
        status: "draft",
        planning_guests: v.planning_guests,
        planning_guest_range: v.planning_guest_range,
        milestones: v.milestones,
        source_note: input.note ?? `Cloned from v${v.version}`,
      });
      if (roles.length) await tx.insert(opsTemplateRoles).values(roles.map((r) => ({ ...r, id: uuid(), template_version_id: newId })));
    });
    await audit(db, actorOf(context.principal), { entityType: "template_version", entityId: newId, action: "template.clone", from: v.id });
    return { id: newId };
  }),

  updateRole: staffProc
    .input(
      z.object({
        roleId: id,
        recommendedCount: z.number().int().min(0).max(500).nullable().optional(),
        minCount: z.number().int().min(0).max(500).nullable().optional(),
        confirmation: z.enum(["proposed", "provisional", "unconfirmed", "approved"]).optional(),
        responsibilities: z.string().max(2000).optional(),
        workforce: z.enum(WORKFORCE_KINDS).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "event.manage", { eventId: null });
      const [r] = await db.select().from(opsTemplateRoles).where(eq(opsTemplateRoles.id, input.roleId)).limit(1);
      if (!r) throw new ORPCError("NOT_FOUND");
      const [v] = await db.select().from(opsTemplateVersions).where(eq(opsTemplateVersions.id, r.template_version_id)).limit(1);
      if (v?.status !== "draft") throw new ORPCError("PRECONDITION_FAILED", { message: "Published template versions are immutable. Clone to a new draft." });
      await db
        .update(opsTemplateRoles)
        .set({
          ...(input.recommendedCount !== undefined ? { recommended_count: input.recommendedCount } : {}),
          ...(input.minCount !== undefined ? { min_count: input.minCount } : {}),
          ...(input.confirmation ? { confirmation: input.confirmation } : {}),
          ...(input.responsibilities !== undefined ? { responsibilities: input.responsibilities } : {}),
          ...(input.workforce ? { workforce: input.workforce } : {}),
        })
        .where(eq(opsTemplateRoles.id, r.id));
      await audit(db, actorOf(context.principal), { entityType: "template_version", entityId: r.template_version_id, action: "template.role_update", data: { role: r.role_key, ...input } });
      return { ok: true };
    }),

  publish: staffProc.input(z.object({ versionId: id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "event.manage", { eventId: null });
    const res = await db
      .update(opsTemplateVersions)
      .set({ status: "published", published_at: new Date() })
      .where(and(eq(opsTemplateVersions.id, input.versionId), eq(opsTemplateVersions.status, "draft")))
      .returning({ id: opsTemplateVersions.id });
    if (!res.length) throw new ORPCError("PRECONDITION_FAILED", { message: "Only drafts can be published." });
    await audit(db, actorOf(context.principal), { entityType: "template_version", entityId: input.versionId, action: "template.publish", to: "published" });
    return { ok: true };
  }),
};

export const events = {
  list: staffProc.handler(async ({ context }) => {
    const rows = await db.select().from(opsEvents).orderBy(desc(opsEvents.created_at));
    return rows.filter((e) => can(context.principal, "event.read", { eventId: e.id }) || can(context.principal, "roster.read", { eventId: e.id, departmentKey: null }) || visibleDepartments(context.principal, "roster.read", e.id)?.length);
  }),

  create: staffProc
    .input(z.object({ name: z.string().trim().min(3).max(120), templateVersionId: id, timezone: z.string().max(60).default(DEFAULT_TZ), venueName: z.string().max(120).nullable() }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "event.manage", { eventId: null });
      const [v] = await db.select().from(opsTemplateVersions).where(eq(opsTemplateVersions.id, input.templateVersionId)).limit(1);
      if (v?.status !== "published") throw new ORPCError("PRECONDITION_FAILED", { message: "Events use published template versions only." });
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
      } catch {
        throw new ORPCError("BAD_REQUEST", { message: "Unknown time zone." });
      }
      const newId = uuid();
      await db.insert(opsEvents).values({
        id: newId,
        name: input.name,
        template_version_id: v.id,
        timezone: input.timezone,
        venue_name: input.venueName,
        planning_guests: v.planning_guests,
        created_by: context.principal.userId,
      });
      await audit(db, actorOf(context.principal), { entityType: "event", entityId: newId, action: "event.create", data: { template: v.id } });
      return { id: newId };
    }),

  /** Confirm a real date: relative template milestones resolve to UTC (DST-safe). */
  setDate: staffProc
    .input(z.object({ id, revision: rev, localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ambiguity, venueConfirmed: z.boolean().optional() }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "event.manage", { eventId: input.id });
      const ev = await loadEvent(input.id);
      const [v] = await db.select().from(opsTemplateVersions).where(eq(opsTemplateVersions.id, ev.template_version_id)).limit(1);
      const r = resolveMilestones(input.localDate, v?.milestones ?? [], ev.timezone, input.ambiguity);
      if (!r.ok) throw new ORPCError("BAD_REQUEST", { message: r.errors.join("; "), data: { errors: r.errors } });
      const res = await db
        .update(opsEvents)
        .set({
          local_date: input.localDate,
          date_confirmed: true,
          resolved_milestones: r.milestones,
          ...(input.venueConfirmed !== undefined ? { venue_confirmed: input.venueConfirmed } : {}),
          revision: ev.revision + 1,
          updated_at: new Date(),
        })
        .where(and(eq(opsEvents.id, ev.id), eq(opsEvents.revision, input.revision)))
        .returning({ id: opsEvents.id });
      if (!res.length) throw new ORPCError("CONFLICT", { message: "This event changed since you loaded it." });
      await audit(db, actorOf(context.principal), { entityType: "event", entityId: ev.id, action: "event.set_date", from: ev.local_date, to: input.localDate, revision: ev.revision + 1 });
      return { revision: ev.revision + 1, milestones: r.milestones };
    }),

  detail: staffProc.input(z.object({ id })).handler(async ({ input, context }) => {
    const ev = await loadEvent(input.id);
    const full = can(context.principal, "event.read", { eventId: ev.id });
    const depts = visibleDepartments(context.principal, "roster.read", ev.id);
    if (!full && !(depts && depts.length)) throw new ORPCError("FORBIDDEN", { message: "No access to this event." });
    const roles = await templateRoles(ev.template_version_id);
    const ov = await db.select().from(opsEventRoleOverrides).where(eq(opsEventRoleOverrides.event_id, ev.id));
    const pf = await db.select().from(opsProviderFulfillment).where(eq(opsProviderFulfillment.event_id, ev.id));
    let asg = await db.select().from(opsAssignments).where(and(eq(opsAssignments.event_id, ev.id), ne(opsAssignments.status, "cancelled")));
    const visibleRoles = depts === null || full ? roles : roles.filter((r) => depts.includes(r.department_key));
    if (!(depts === null || full)) asg = asg.filter((a) => depts.includes(a.department_key));
    const people = asg.length
      ? await db.select({ id: crewPeople.id, first: crewPeople.first_name, last: crewPeople.last_name }).from(crewPeople).where(inArray(crewPeople.id, [...new Set(asg.map((a) => a.person_id))]))
      : [];
    const nameOf = new Map(people.map((p) => [p.id, `${p.first} ${p.last}`]));
    const assignments = await Promise.all(
      asg.map(async (a) => ({
        ...a,
        personName: nameOf.get(a.person_id) ?? "—",
        shiftLocal: a.shift_start_utc && a.shift_end_utc ? `${wallOf(a.shift_start_utc.getTime(), ev.timezone)} → ${wallOf(a.shift_end_utc.getTime(), ev.timezone)}` : null,
        readiness: await assignmentReadiness(a.id),
      })),
    );
    const coverage = visibleRoles.map((r) => {
      const s = roleSlots(r, ov, pf);
      const filled = assignments.filter((a) => a.role_key === r.role_key && a.status === "approved").length;
      const ready = assignments.filter((a) => a.role_key === r.role_key && a.readiness.ready).length;
      const g = roleGap(r.workforce, s.planned, s.providers.map((p) => p.count), filled);
      return {
        roleKey: r.role_key,
        title: r.title,
        group: r.group_key,
        department: r.department_key,
        workforce: r.workforce,
        confirmation: r.confirmation,
        planned: s.planned,
        filled,
        ready,
        provider: s.providers.length ? { count: g.provider, status: s.providers.map((p) => p.status), names: s.providers.map((p) => p.provider) } : null,
        sanctuaryDemand: g.demand,
        gap: g.gap,
      };
    });
    const ros = await db.select().from(opsRunOfShow).where(eq(opsRunOfShow.event_id, ev.id)).orderBy(asc(opsRunOfShow.seq));
    const [closeout] = await db.select().from(opsCloseouts).where(eq(opsCloseouts.event_id, ev.id)).limit(1);
    const blockers: string[] = [];
    if (!ev.date_confirmed) blockers.push("Event date not confirmed — milestones unresolved");
    if (!ev.venue_confirmed) blockers.push("Venue not confirmed");
    for (const c of coverage) {
      if (c.planned === null || (c.provider && c.provider.count === null)) blockers.push(`${c.title}: count unknown (venue/provider to confirm)`);
      else if (c.gap) blockers.push(`${c.title}: ${c.gap} unfilled`);
    }
    const totals = slotTotals(visibleRoles.map((r) => ({ ...r, planned: roleSlots(r, ov, pf).planned })));
    const approved = assignments.filter((a) => a.status === "approved");
    const staffing = {
      namedPeople: new Set(approved.map((a) => a.person_id)).size,
      approvedAssignments: approved.length,
      peakConcurrent: peakConcurrent(
        approved.filter((a) => a.shift_start_utc && a.shift_end_utc).map((a) => ({ start: a.shift_start_utc!.getTime(), end: a.shift_end_utc!.getTime() })),
      ),
      withoutShift: approved.filter((a) => !a.shift_start_utc || !a.shift_end_utc).length,
    };
    return {
      event: ev,
      totals,
      staffing,
      scope: full ? "full" : ("departments" as "full" | "departments"),
      departments: depts,
      roles: visibleRoles,
      overrides: ov,
      providers: pf,
      coverage,
      assignments,
      runOfShow: ros,
      closeout: closeout ?? null,
      blockers,
      can: {
        manage: can(context.principal, "event.manage", { eventId: ev.id }),
        approve: can(context.principal, "assignment.approve", { eventId: ev.id }),
        promoters: can(context.principal, "promoters.manage", { eventId: ev.id }),
        hours: can(context.principal, "hours.read", { eventId: ev.id }),
      },
    };
  }),

  setOverride: staffProc
    .input(z.object({ eventId: id, roleKey: z.string().max(60), count: z.number().int().min(0).max(500).nullable(), reason: z.string().trim().min(3).max(300) }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "event.manage", { eventId: input.eventId });
      await db
        .insert(opsEventRoleOverrides)
        .values({ id: uuid(), event_id: input.eventId, role_key: input.roleKey, count: input.count, reason: input.reason, approved_by: context.principal.userId })
        .onConflictDoUpdate({ target: [opsEventRoleOverrides.event_id, opsEventRoleOverrides.role_key], set: { count: input.count, reason: input.reason, approved_by: context.principal.userId } });
      await audit(db, actorOf(context.principal), { entityType: "event", entityId: input.eventId, action: "event.override", to: `${input.roleKey}=${input.count ?? "unknown"}`, note: input.reason });
      return { ok: true };
    }),

  setProvider: staffProc
    .input(z.object({ eventId: id, roleKey: z.string().max(60), provider: z.string().trim().min(2).max(80), count: z.number().int().min(0).max(500).nullable(), status: z.enum(["provisional", "confirmed"]), note: z.string().max(300).optional() }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "event.manage", { eventId: input.eventId });
      await db
        .insert(opsProviderFulfillment)
        .values({ id: uuid(), event_id: input.eventId, role_key: input.roleKey, provider: input.provider, count: input.count, status: input.status, note: input.note ?? null, created_by: context.principal.userId })
        .onConflictDoUpdate({
          target: [opsProviderFulfillment.event_id, opsProviderFulfillment.role_key, opsProviderFulfillment.provider],
          set: { count: input.count, status: input.status, note: input.note ?? null },
        });
      await audit(db, actorOf(context.principal), { entityType: "event", entityId: input.eventId, action: "event.provider", to: `${input.roleKey}:${input.provider}=${input.count ?? "unknown"} (${input.status})` });
      return { ok: true };
    }),

  addRunOfShow: staffProc
    .input(z.object({ eventId: id, milestoneKey: z.string().max(40).nullable(), offsetMin: z.number().int().min(-720).max(720), title: z.string().trim().min(2).max(160), departmentKey: z.string().max(60).nullable(), notes: z.string().max(500).optional() }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "event.manage", { eventId: input.eventId });
      const [m] = await db.select({ s: max(opsRunOfShow.seq) }).from(opsRunOfShow).where(eq(opsRunOfShow.event_id, input.eventId));
      await db.insert(opsRunOfShow).values({ id: uuid(), event_id: input.eventId, seq: (m?.s ?? 0) + 1, milestone_key: input.milestoneKey, offset_min: input.offsetMin, title: input.title, department_key: input.departmentKey, notes: input.notes ?? null });
      return { ok: true };
    }),

  saveCloseout: staffProc
    .input(
      z.object({
        eventId: id,
        revision: z.number().int().min(0),
        submit: z.boolean().default(false),
        coverageIssues: z.string().max(4000).optional(),
        trainingFeedback: z.string().max(4000).optional(),
        guestServiceFeedback: z.string().max(4000).optional(),
        contentHandoff: z.string().max(4000).optional(),
        incidentRefs: z.string().max(1000).optional(),
        returnAvailability: z.record(z.string().max(64), z.enum(["yes", "no", "unsure"])).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "event.manage", { eventId: input.eventId });
      const [cur] = await db.select().from(opsCloseouts).where(eq(opsCloseouts.event_id, input.eventId)).limit(1);
      if (cur?.status === "submitted") throw new ORPCError("PRECONDITION_FAILED", { message: "Closeout already submitted." });
      if ((cur?.revision ?? 0) !== input.revision) throw new ORPCError("CONFLICT", { message: "Closeout changed since you loaded it." });
      const vals = {
        coverage_issues: input.coverageIssues ?? cur?.coverage_issues ?? null,
        training_feedback: input.trainingFeedback ?? cur?.training_feedback ?? null,
        guest_service_feedback: input.guestServiceFeedback ?? cur?.guest_service_feedback ?? null,
        content_handoff: input.contentHandoff ?? cur?.content_handoff ?? null,
        incident_refs: input.incidentRefs ?? cur?.incident_refs ?? null,
        return_availability: input.returnAvailability ?? cur?.return_availability ?? {},
        status: input.submit ? "submitted" : "draft",
        revision: input.revision + 1,
        updated_by: context.principal.userId,
        updated_at: new Date(),
      };
      if (cur) await db.update(opsCloseouts).set(vals).where(and(eq(opsCloseouts.event_id, input.eventId), eq(opsCloseouts.revision, input.revision)));
      else await db.insert(opsCloseouts).values({ event_id: input.eventId, ...vals });
      await audit(db, actorOf(context.principal), { entityType: "event", entityId: input.eventId, action: input.submit ? "closeout.submit" : "closeout.save", revision: input.revision + 1 });
      return { revision: input.revision + 1 };
    }),
};

export const assignments = {
  /** Propose an assignment. Paid roles require an accepted offer; overlapping shifts are rejected unless marked compatible. */
  propose: staffProc
    .input(
      z.object({
        eventId: id,
        personId: id,
        roleKey: z.string().max(60),
        shift: z.object({ startDate: z.string(), startTime: z.string(), endDate: z.string(), endTime: z.string(), ambiguity }).nullable(),
        supervisorPersonId: z.string().max(64).nullable(),
        concurrentWith: z.string().max(64).nullable().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const ev = await loadEvent(input.eventId);
      const roles = await templateRoles(ev.template_version_id);
      const role = roles.find((r) => r.role_key === input.roleKey);
      if (!role) throw new ORPCError("BAD_REQUEST", { message: "Role is not part of this event's template." });
      requireCan(context.principal, "roster.write", { eventId: ev.id, departmentKey: role.department_key });
      if (role.workforce === "venue_provider" || role.workforce === "provider")
        throw new ORPCError("BAD_REQUEST", { message: "Venue/provider roles are tracked as provider fulfilment, not crew assignments." });
      if (role.workforce === "unclassified")
        throw new ORPCError("PRECONDITION_FAILED", {
          message: "This role's workforce is unclassified. Classify it (Sanctuary LV Group paid, nonprofit Serve Team or founder) in a new template version before assigning people.",
        });
      let offerId: string | null = null;
      if (role.workforce === "paid_group") {
        const [o] = await db
          .select({ id: crewOffers.id })
          .from(crewOffers)
          .where(and(eq(crewOffers.person_id, input.personId), eq(crewOffers.status, "accepted")))
          .orderBy(desc(crewOffers.updated_at))
          .limit(1);
        if (!o) throw new ORPCError("PRECONDITION_FAILED", { message: "This person has no accepted Sanctuary LV Group offer." });
        offerId = o.id;
      }
      let start: Date | null = null;
      let end: Date | null = null;
      if (input.shift) {
        const s = zonedToUtc(input.shift.startDate, input.shift.startTime, ev.timezone, input.shift.ambiguity);
        const e = zonedToUtc(input.shift.endDate, input.shift.endTime, ev.timezone, input.shift.ambiguity);
        if (!s.ok || !e.ok) throw new ORPCError("BAD_REQUEST", { message: `Shift time ${!s.ok ? "start" : "end"} is ${(!s.ok ? s : (e as { reason: string })).reason === "nonexistent" ? "inside a DST gap" : "ambiguous or invalid"}.` });
        if (e.utc <= s.utc) throw new ORPCError("BAD_REQUEST", { message: "Shift must end after it starts (use the next date for overnight shifts)." });
        start = new Date(s.utc);
        end = new Date(e.utc);
        const mine = await db.select().from(opsAssignments).where(and(eq(opsAssignments.person_id, input.personId), ne(opsAssignments.status, "cancelled")));
        const clash = mine.find((m) => m.shift_start_utc && m.shift_end_utc && overlaps(start!.getTime(), end!.getTime(), m.shift_start_utc.getTime(), m.shift_end_utc.getTime()));
        if (clash && clash.id !== input.concurrentWith)
          throw new ORPCError("CONFLICT", { message: "This person already has an overlapping shift. Mark it as an approved compatible overlap to continue.", data: { clashId: clash.id } });
        if (clash && !can(context.principal, "assignment.approve", { eventId: ev.id }))
          throw new ORPCError("FORBIDDEN", { message: "Only the event director can approve overlapping assignments." });
      }
      const newId = uuid();
      await db.insert(opsAssignments).values({
        id: newId,
        event_id: ev.id,
        person_id: input.personId,
        role_key: role.role_key,
        department_key: role.department_key,
        offer_id: offerId,
        shift_start_utc: start,
        shift_end_utc: end,
        supervisor_person_id: input.supervisorPersonId,
        zones: role.zones,
        concurrent_with: input.concurrentWith ?? null,
        created_by: context.principal.userId,
      });
      await audit(db, actorOf(context.principal), { entityType: "event", entityId: ev.id, action: "assignment.propose", to: role.role_key, data: { assignmentId: newId, personId: input.personId } });
      return { id: newId };
    }),

  approve: staffProc.input(z.object({ id, revision: rev, confirmShift: z.boolean().default(false) })).handler(async ({ input, context }) => {
    const [a] = await db.select().from(opsAssignments).where(eq(opsAssignments.id, input.id)).limit(1);
    if (!a) throw new ORPCError("NOT_FOUND");
    requireCan(context.principal, "assignment.approve", { eventId: a.event_id });
    const res = await db
      .update(opsAssignments)
      .set({ status: "approved", shift_confirmed: input.confirmShift ? Boolean(a.shift_start_utc) : a.shift_confirmed, revision: a.revision + 1, updated_at: new Date() })
      .where(and(eq(opsAssignments.id, a.id), eq(opsAssignments.revision, input.revision)))
      .returning({ id: opsAssignments.id });
    if (!res.length) throw new ORPCError("CONFLICT", { message: "Assignment changed since you loaded it." });
    await audit(db, actorOf(context.principal), { entityType: "event", entityId: a.event_id, action: "assignment.approve", from: a.status, to: "approved", data: { assignmentId: a.id } });
    return { revision: a.revision + 1 };
  }),

  cancel: staffProc.input(z.object({ id, revision: rev, reason: z.string().min(3).max(300) })).handler(async ({ input, context }) => {
    const [a] = await db.select().from(opsAssignments).where(eq(opsAssignments.id, input.id)).limit(1);
    if (!a) throw new ORPCError("NOT_FOUND");
    requireCan(context.principal, "roster.write", { eventId: a.event_id, departmentKey: a.department_key });
    const res = await db
      .update(opsAssignments)
      .set({ status: "cancelled", revision: a.revision + 1, updated_at: new Date() })
      .where(and(eq(opsAssignments.id, a.id), eq(opsAssignments.revision, input.revision)))
      .returning({ id: opsAssignments.id });
    if (!res.length) throw new ORPCError("CONFLICT");
    // A cancelled assignment must not keep working credentials.
    const revoked = await db
      .update(opsCredentials)
      .set({ revoked_at: new Date(), revoked_reason: "assignment_cancelled" })
      .where(and(eq(opsCredentials.assignment_id, a.id), isNull(opsCredentials.revoked_at)))
      .returning({ id: opsCredentials.id });
    await audit(db, actorOf(context.principal), { entityType: "event", entityId: a.event_id, action: "assignment.cancel", from: a.status, to: "cancelled", note: input.reason, data: { assignmentId: a.id, credentialsRevoked: revoked.length } });
    return { ok: true, credentialsRevoked: revoked.length };
  }),

  /** Staff call sheet (printable). Department leads see only their departments. */
  callSheet: staffProc.input(z.object({ eventId: id })).handler(async ({ input, context }) => {
    const ev = await loadEvent(input.eventId);
    const full = can(context.principal, "event.read", { eventId: ev.id });
    const depts = visibleDepartments(context.principal, "roster.read", ev.id);
    if (!full && !(depts && depts.length)) throw new ORPCError("FORBIDDEN");
    const roles = await templateRoles(ev.template_version_id);
    let asg = await db.select().from(opsAssignments).where(and(eq(opsAssignments.event_id, ev.id), eq(opsAssignments.status, "approved")));
    if (!full && depts) asg = asg.filter((a) => depts.includes(a.department_key));
    const ids = [...new Set(asg.flatMap((a) => [a.person_id, a.supervisor_person_id].filter(Boolean) as string[]))];
    const people = ids.length ? await db.select({ id: crewPeople.id, first: crewPeople.first_name, last: crewPeople.last_name }).from(crewPeople).where(inArray(crewPeople.id, ids)) : [];
    const name = new Map(people.map((p) => [p.id, `${p.first} ${p.last}`]));
    const ros = await db.select().from(opsRunOfShow).where(eq(opsRunOfShow.event_id, ev.id)).orderBy(asc(opsRunOfShow.seq));
    return {
      event: { id: ev.id, name: ev.name, localDate: ev.local_date, dateConfirmed: ev.date_confirmed, timezone: ev.timezone, venue: ev.venue_name, venueConfirmed: ev.venue_confirmed, milestones: ev.resolved_milestones ?? [] },
      rows: asg.map((a) => {
        const r = roles.find((x) => x.role_key === a.role_key);
        return {
          id: a.id,
          name: name.get(a.person_id) ?? "—",
          role: r?.title ?? a.role_key,
          department: a.department_key,
          call: a.shift_start_utc ? wallOf(a.shift_start_utc.getTime(), ev.timezone) : "TBD",
          release: a.shift_end_utc ? wallOf(a.shift_end_utc.getTime(), ev.timezone) : "TBD",
          supervisor: a.supervisor_person_id ? (name.get(a.supervisor_person_id) ?? "—") : "—",
          zones: a.zones,
          dress: r?.dress ?? null,
        };
      }),
      runOfShow: ros.filter((x) => full || !x.department_key || depts?.includes(x.department_key)),
      scope: full ? "full" : "departments",
    };
  }),
};

/** Lookup used by assignment UI: approved applicants' names for a person id. */
export async function personLabel(personId: string) {
  const [a] = await db.select({ f: crewApplications.first_name, l: crewApplications.last_name }).from(crewApplications).where(eq(crewApplications.person_id, personId)).limit(1);
  return a ? `${a.f} ${a.l}` : personId;
}
