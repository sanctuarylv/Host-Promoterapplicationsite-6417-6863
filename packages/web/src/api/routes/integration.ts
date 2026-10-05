/**
 * Staff administration: integration console, staff memberships and the
 * nonprofit Serve Team queue.
 *
 * Integration console rules:
 *  - The mode shown is derived from evidence (crew/integration.ts), never set by hand.
 *  - A "verified round trip" can only be recorded from an outbox row that the
 *    Command Center actually acknowledged (status=synced with receipt + canonical id).
 *  - Cutover needs that round trip, a fresh reconciliation dry run, and an
 *    explicit acknowledgement of the quarantine count. Nothing is migrated.
 */
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { staffProc } from "../middleware/auth";
import { db } from "../database";
import { crewAudit, crewOutbox, serveInterest, staffMemberships, user as authUser } from "../database/schema";
import { CANONICAL_ADAPTER, endpointFingerprint, getIntegrationState, reconciliationDryRun, type Cutover, type RoundTrip } from "../crew/integration";
import { drainDue, manualRetry, outboxSummary } from "../crew/outbox";
import { getCrewConfig } from "../crew/config";
import { readinessReport } from "../crew/production";
import { SERVE_STATUSES } from "../crew/serve";
import { actorOf, requireCan, STAFF_ROLES } from "../shared/permissions";
import { audit } from "../shared/audit";
import { getSetting, setSetting } from "../shared/settings";
import { uuid, sha256 } from "../shared/ids";

const id = z.string().min(1).max(64);
const reason = z.string().trim().min(3).max(500);
const OUTBOX_STATUSES = ["held", "pending", "processing", "synced", "failed", "dead"] as const;

export const integration = {
  /** Production configuration readiness (presence/shape only — no secret values, no IPs). */
  readiness: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "integration.manage");
    return readinessReport(context.headers);
  }),

  state: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "integration.manage");
    const [state, summary] = await Promise.all([getIntegrationState(), outboxSummary()]);
    return { ...state, outbox: { ...summary, byStatus: summary.byStatus.map((r) => ({ ...r, n: Number(r.n) })) } };
  }),

  outbox: staffProc
    .input(z.object({ status: z.enum(OUTBOX_STATUSES).optional(), cursor: z.string().max(80).optional(), limit: z.number().int().min(1).max(100).default(25) }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "integration.manage");
      const conds = [];
      if (input.status) conds.push(eq(crewOutbox.status, input.status));
      if (input.cursor) {
        const [ts, cid] = Buffer.from(input.cursor, "base64url").toString().split("|");
        const at = new Date(Number(ts));
        if (!Number.isFinite(at.getTime()) || !cid) throw new ORPCError("BAD_REQUEST", { message: "Bad cursor" });
        conds.push(or(lt(crewOutbox.created_at, at), and(eq(crewOutbox.created_at, at), lt(crewOutbox.id, cid))));
      }
      const rows = await db
        .select({
          id: crewOutbox.id,
          aggregateType: crewOutbox.aggregate_type,
          aggregateId: crewOutbox.aggregate_id,
          operation: crewOutbox.operation,
          opVersion: crewOutbox.op_version,
          status: crewOutbox.status,
          attempts: crewOutbox.attempts,
          maxAttempts: crewOutbox.max_attempts,
          nextAttemptAt: crewOutbox.next_attempt_at,
          lastError: crewOutbox.last_error,
          lastErrorClass: crewOutbox.last_error_class,
          receiptId: crewOutbox.receipt_id,
          canonicalId: crewOutbox.canonical_id,
          createdAt: crewOutbox.created_at,
          updatedAt: crewOutbox.updated_at,
        })
        .from(crewOutbox)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(crewOutbox.created_at), desc(crewOutbox.id))
        .limit(input.limit + 1);
      const more = rows.length > input.limit;
      const page = rows.slice(0, input.limit);
      const last = page[page.length - 1];
      return {
        rows: page,
        nextCursor: more && last ? Buffer.from(`${last.createdAt.getTime()}|${last.id}`).toString("base64url") : null,
      };
    }),

  retry: staffProc.input(z.object({ id, reason })).handler(async ({ input, context }) => {
    requireCan(context.principal, "integration.manage");
    const r = await manualRetry(input.id, actorOf(context.principal), input.reason);
    if (!r.ok) throw new ORPCError("PRECONDITION_FAILED", { message: r.error });
    return r;
  }),

  /** Run one bounded drain pass now. Only does anything in forward mode with a complete configuration. */
  drainNow: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "integration.manage");
    const cfg = getCrewConfig();
    if (cfg.submissionMode !== "forward" || !cfg.commandCenter.canForward)
      throw new ORPCError("PRECONDITION_FAILED", { message: "Forward mode is not configured — nothing was sent." });
    const res = await drainDue(10);
    await audit(db, actorOf(context.principal), { entityType: "outbox", entityId: "*", action: "outbox.drain_manual", data: { processed: res.processed } });
    return res;
  }),

  reconcile: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "integration.manage");
    const r = await reconciliationDryRun();
    const fingerprint = sha256(JSON.stringify(r.items.map((i) => [i.id, i.localStatus, i.action])));
    await setSetting("cc_last_reconciliation", { at: r.generatedAt, fingerprint, total: r.total, quarantine: r.quarantine }, context.principal.userId);
    await audit(db, actorOf(context.principal), {
      entityType: "integration",
      entityId: "reconciliation",
      action: "reconciliation.dry_run",
      data: { total: r.total, transfer: r.transfer, quarantine: r.quarantine, fingerprint },
    });
    return { ...r, fingerprint };
  }),

  /** Record a verified round trip from a real acknowledged outbox row. */
  recordRoundTrip: staffProc.input(z.object({ outboxId: id, environment: z.string().trim().min(2).max(60) })).handler(async ({ input, context }) => {
    requireCan(context.principal, "integration.manage");
    const [row] = await db.select().from(crewOutbox).where(eq(crewOutbox.id, input.outboxId)).limit(1);
    if (!row || row.status !== "synced" || !row.receipt_id || !row.canonical_id)
      throw new ORPCError("PRECONDITION_FAILED", { message: "Only an outbox entry acknowledged by Command Center (synced, with receipt and canonical id) counts as a round trip." });
    const endpoint = endpointFingerprint();
    if (!endpoint) throw new ORPCError("PRECONDITION_FAILED", { message: "Command Center endpoint is not configured." });
    // The receipt must have been issued by the endpoint configured NOW — a receipt
    // from a local mock or a previous endpoint is not evidence for this one.
    const [synced] = await db
      .select({ data: crewAudit.data })
      .from(crewAudit)
      .where(and(eq(crewAudit.entity_type, "outbox"), eq(crewAudit.entity_id, row.id), eq(crewAudit.action, "outbox.synced")))
      .orderBy(desc(crewAudit.id))
      .limit(1);
    if (!synced || synced.data?.endpoint !== endpoint || synced.data?.receipt !== row.receipt_id)
      throw new ORPCError("PRECONDITION_FAILED", { message: "That receipt was not issued by the currently configured Command Center endpoint." });
    const rt: RoundTrip = { at: new Date().toISOString(), receiptId: row.receipt_id, canonicalId: row.canonical_id, by: context.principal.userId, environment: input.environment, endpoint };
    await setSetting("cc_verified_round_trip", rt, context.principal.userId);
    await audit(db, actorOf(context.principal), { entityType: "integration", entityId: "round_trip", action: "integration.round_trip_recorded", to: row.receipt_id, data: rt });
    return rt;
  }),

  /** Record the cutover boundary. Requires round trip + matching reconciliation fingerprint + typed acknowledgement. */
  recordCutover: staffProc
    .input(z.object({ fingerprint: z.string().min(16).max(128), acknowledgeQuarantine: z.number().int().min(0), confirm: z.literal("CUTOVER") }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "integration.manage");
      if (!CANONICAL_ADAPTER.implemented) throw new ORPCError("PRECONDITION_FAILED", { message: CANONICAL_ADAPTER.reason });
      const state = await getIntegrationState();
      if (!state.roundTrip) throw new ORPCError("PRECONDITION_FAILED", { message: "Record a verified round trip first." });
      if (state.cutover) throw new ORPCError("CONFLICT", { message: "Cutover is already recorded." });
      const last = await getSetting<{ fingerprint: string; quarantine: number; at: string }>("cc_last_reconciliation");
      if (!last || last.fingerprint !== input.fingerprint)
        throw new ORPCError("PRECONDITION_FAILED", { message: "Run a fresh reconciliation dry run and confirm its fingerprint." });
      const fresh = await reconciliationDryRun();
      const freshFp = sha256(JSON.stringify(fresh.items.map((i) => [i.id, i.localStatus, i.action])));
      if (freshFp !== last.fingerprint) throw new ORPCError("CONFLICT", { message: "Data changed since the dry run. Run it again." });
      if (input.acknowledgeQuarantine !== last.quarantine)
        throw new ORPCError("PRECONDITION_FAILED", { message: `Acknowledge the ${last.quarantine} quarantined record(s) to continue.` });
      const c: Cutover = { at: new Date().toISOString(), by: context.principal.userId, reconciliationId: last.fingerprint, acknowledgedCount: last.quarantine };
      await setSetting("cc_cutover", c, context.principal.userId);
      await audit(db, actorOf(context.principal), { entityType: "integration", entityId: "cutover", action: "integration.cutover_recorded", data: c });
      return c;
    }),

  audit: staffProc
    .input(z.object({ entityType: z.string().max(40).optional(), entityId: z.string().max(64).optional(), limit: z.number().int().min(1).max(200).default(50) }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "integration.manage");
      const conds = [];
      if (input.entityType) conds.push(eq(crewAudit.entity_type, input.entityType));
      if (input.entityId) conds.push(eq(crewAudit.entity_id, input.entityId));
      return db
        .select()
        .from(crewAudit)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(crewAudit.id))
        .limit(input.limit);
    }),
};

/** Roles whose permission checks honour an event pin (see shared/permissions EVENT map). */
const EVENT_SCOPABLE: readonly string[] = ["event_director", "department_lead"];

export const staff = {
  list: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "staff.manage");
    const rows = await db
      .select({
        id: staffMemberships.id,
        userId: staffMemberships.user_id,
        role: staffMemberships.role,
        eventId: staffMemberships.event_id,
        departmentKey: staffMemberships.department_key,
        grantedBy: staffMemberships.granted_by,
        grantedAt: staffMemberships.granted_at,
        name: authUser.name,
        email: authUser.email,
      })
      .from(staffMemberships)
      .leftJoin(authUser, eq(authUser.id, staffMemberships.user_id))
      .where(isNull(staffMemberships.revoked_at))
      .orderBy(asc(authUser.email), asc(staffMemberships.role));
    return { rows, roles: STAFF_ROLES };
  }),

  /** Grant to an existing account by exact email. No account is created; no invite is sent. */
  grant: staffProc
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email().max(254),
        role: z.enum(STAFF_ROLES),
        eventId: id.nullable(),
        departmentKey: z.string().trim().max(60).nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "staff.manage");
      if (input.role === "department_lead" && !input.departmentKey)
        throw new ORPCError("BAD_REQUEST", { message: "A department lead needs a department." });
      // Only roles whose permissions are actually evaluated per event/department may
      // carry that scope; anything else would LOOK limited while acting globally.
      if (input.eventId && !EVENT_SCOPABLE.includes(input.role))
        throw new ORPCError("BAD_REQUEST", { message: `The ${input.role} role is organization-wide and cannot be limited to one event.` });
      if (input.departmentKey && input.role !== "department_lead")
        throw new ORPCError("BAD_REQUEST", { message: "Only a department lead is limited to a department." });
      const [u] = await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.email, input.email)).limit(1);
      if (!u) throw new ORPCError("NOT_FOUND", { message: "No account with that email has signed in yet." });
      const mid = uuid();
      await db.insert(staffMemberships).values({
        id: mid,
        user_id: u.id,
        role: input.role,
        event_id: input.eventId,
        department_key: input.departmentKey,
        granted_by: context.principal.userId,
      });
      await audit(db, actorOf(context.principal), { entityType: "staff_membership", entityId: mid, action: "staff.grant", to: input.role, data: { userId: u.id, eventId: input.eventId, departmentKey: input.departmentKey } });
      return { id: mid };
    }),

  revoke: staffProc.input(z.object({ id, reason })).handler(async ({ input, context }) => {
    requireCan(context.principal, "staff.manage");
    const [m] = await db.select().from(staffMemberships).where(eq(staffMemberships.id, input.id)).limit(1);
    if (!m || m.revoked_at) throw new ORPCError("NOT_FOUND", { message: "Membership not found" });
    // One conditional UPDATE: an admin membership is revoked only while ANOTHER
    // active admin (a different account) remains — so two admins revoking each
    // other at the same moment can never leave the organization with none.
    const keepsAnAdmin =
      m.role === "admin"
        ? sql`exists (select 1 from staff_memberships o where o.role = 'admin' and o.revoked_at is null and o.id <> ${m.id})`
        : sql`1 = 1`;
    const done = await db
      .update(staffMemberships)
      .set({ revoked_at: new Date(), revoked_by: context.principal.userId })
      .where(and(eq(staffMemberships.id, m.id), isNull(staffMemberships.revoked_at), keepsAnAdmin))
      .returning({ id: staffMemberships.id });
    if (!done.length) {
      if (m.role === "admin") throw new ORPCError("PRECONDITION_FAILED", { message: "This is the last admin account — grant another admin first." });
      throw new ORPCError("CONFLICT", { message: "This membership changed since you loaded it." });
    }
    await audit(db, actorOf(context.principal), { entityType: "staff_membership", entityId: m.id, action: "staff.revoke", from: m.role, note: input.reason });
    return { ok: true };
  }),
};

export const serveTeam = {
  list: staffProc
    .input(z.object({ status: z.array(z.enum(SERVE_STATUSES)).max(5).optional() }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "serve.manage");
      const rows = await db
        .select()
        .from(serveInterest)
        .where(input.status?.length ? inArray(serveInterest.status, input.status) : undefined)
        .orderBy(desc(serveInterest.created_at))
        .limit(500);
      const counts = await db.select({ status: serveInterest.status, n: sql<number>`count(*)` }).from(serveInterest).groupBy(serveInterest.status);
      return {
        rows,
        byStatus: counts.map((c) => ({ ...c, n: Number(c.n) })),
        total: counts.reduce((s, c) => s + Number(c.n), 0),
        entity: "Sanctuary LV nonprofit — Volunteer / Serve Team (unpaid)",
        authority: "local_staging" as const,
      };
    }),

  setStatus: staffProc
    .input(z.object({ id, revision: z.number().int(), status: z.enum(SERVE_STATUSES), note: z.string().trim().max(500).optional() }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "serve.manage");
      const [r] = await db.select().from(serveInterest).where(eq(serveInterest.id, input.id)).limit(1);
      if (!r) throw new ORPCError("NOT_FOUND", { message: "Not found" });
      if (r.revision !== input.revision) throw new ORPCError("CONFLICT", { message: "This record changed since you loaded it. Reload and try again." });
      const res = await db
        .update(serveInterest)
        .set({ status: input.status, revision: r.revision + 1, updated_at: new Date() })
        .where(and(eq(serveInterest.id, r.id), eq(serveInterest.revision, input.revision)));
      if (res.rowsAffected === 0) throw new ORPCError("CONFLICT", { message: "Concurrent edit — reload and try again." });
      await audit(db, actorOf(context.principal), {
        entityType: "serve_interest",
        entityId: r.id,
        action: "serve.status",
        from: r.status,
        to: input.status,
        revision: r.revision + 1,
        note: input.note,
      });
      return { revision: r.revision + 1 };
    }),
};
