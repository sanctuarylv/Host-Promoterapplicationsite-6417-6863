/**
 * Recruiting pipeline: allowed transitions + prerequisites, enforced on the
 * server. A UI drag can never bypass these. Every transition is revision-checked
 * (optimistic concurrency) and audited (append-only).
 *
 * offer_issued / accepted are reachable ONLY through the offers workflow
 * (issueOffer / worker acceptance) — not via a direct status change.
 * event_ready is reachable only when an assignment's derived readiness is clear.
 */
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import { crewApplications, crewInterviews, crewOffers, crewScorecards } from "../database/schema";
import { CONSENT_VERSION, scorecardKindsFor, type PipelineStatus } from "./contract";
import { audit, type Actor } from "../shared/audit";
import { enqueueStatusChange } from "./outbox";
import type { IntegrationMode } from "./integration";

export const TERMINAL: PipelineStatus[] = ["declined", "withdrawn"];
const ALTERNATIVE: PipelineStatus[] = ["waitlisted", "declined", "withdrawn"];

/** Forward edges (alternatives are allowed from any non-terminal state). */
const NEXT: Record<PipelineStatus, PipelineStatus[]> = {
  submitted: ["reviewed"],
  reviewed: ["screen_invited"],
  screen_invited: ["screen_completed"],
  screen_completed: ["assessment", "selected"],
  assessment: ["selected"],
  selected: ["offer_issued"],
  offer_issued: ["accepted", "selected"],
  accepted: ["onboarding"],
  onboarding: ["event_ready"],
  event_ready: [],
  waitlisted: ["reviewed", "selected"],
  declined: [],
  withdrawn: [],
};

/** Statuses only the dedicated workflows may set. */
const WORKFLOW_ONLY: Partial<Record<PipelineStatus, string>> = {
  offer_issued: "Issue an offer from approved terms instead.",
  accepted: "Only the applicant can accept their offer (worker portal).",
  event_ready: "Event-ready is derived from assignment readiness.",
};

export type Prereq = { ok: boolean; missing: string[] };

export async function prerequisites(app: typeof crewApplications.$inferSelect, to: PipelineStatus): Promise<Prereq> {
  const missing: string[] = [];
  const interviews = await db.select().from(crewInterviews).where(eq(crewInterviews.application_id, app.id));
  const screens = interviews.filter((i) => i.kind === "screen");
  switch (to) {
    case "reviewed":
      if (!app.reviewer_user_id) missing.push("Assign a reviewer first.");
      break;
    case "screen_invited":
      if (!screens.some((s) => s.status === "scheduled" || s.status === "completed")) missing.push("Schedule a screening interview.");
      break;
    case "screen_completed":
      if (!screens.some((s) => s.status === "completed")) missing.push("Mark the screening interview completed.");
      break;
    case "assessment":
      if (!interviews.some((i) => i.kind === "assessment" && i.status !== "cancelled")) missing.push("Schedule a structured assessment.");
      break;
    case "selected": {
      const cards = await db.select().from(crewScorecards).where(eq(crewScorecards.application_id, app.id));
      const kinds = scorecardKindsFor(app.role_interest);
      for (const k of kinds)
        if (!cards.some((c) => c.kind === k)) missing.push(`Submit a ${k === "host" ? "Host" : "Promoter"} scorecard.`);
      if (cards.length && !cards.some((c) => c.recommendation === "advance")) missing.push("At least one scorecard must recommend advancing.");
      break;
    }
    case "onboarding": {
      const offers = await db.select().from(crewOffers).where(and(eq(crewOffers.application_id, app.id), eq(crewOffers.status, "accepted")));
      if (!offers.length) missing.push("An accepted offer is required.");
      break;
    }
    default:
      break;
  }
  if ((to === "selected" || to === "offer_issued") && app.consent_version !== CONSENT_VERSION)
    missing.push("Applicant must confirm the current Sanctuary LV Group acknowledgement (older consent does not cover paid terms).");
  return { ok: missing.length === 0, missing };
}

export function allowedNext(from: PipelineStatus): PipelineStatus[] {
  if (TERMINAL.includes(from)) return [];
  const alts = ALTERNATIVE.filter((s) => s !== from);
  return [...new Set([...(NEXT[from] ?? []), ...alts])];
}

/**
 * Transition with optimistic concurrency. `via` marks calls from the offer/readiness
 * workflows, which are the only paths allowed to set workflow-only statuses.
 */
export async function transition(args: {
  applicationId: string;
  to: PipelineStatus;
  expectedRevision: number;
  actor: Actor;
  note?: string | null;
  via?: "offer_workflow" | "readiness" | "worker";
  mode: IntegrationMode;
}) {
  const [app] = await db.select().from(crewApplications).where(eq(crewApplications.id, args.applicationId)).limit(1);
  if (!app) throw new ORPCError("NOT_FOUND");
  if (app.revision !== args.expectedRevision)
    throw new ORPCError("CONFLICT", { message: "This application changed since you loaded it. Reload and try again.", data: { revision: app.revision } });
  const from = app.application_status as PipelineStatus;
  if (!allowedNext(from).includes(args.to))
    throw new ORPCError("PRECONDITION_FAILED", { message: `Cannot move from ${from} to ${args.to}.` });
  if (WORKFLOW_ONLY[args.to] && !args.via) throw new ORPCError("PRECONDITION_FAILED", { message: WORKFLOW_ONLY[args.to] });
  if (args.mode === "degraded") throw new ORPCError("PRECONDITION_FAILED", { message: "Command Center unavailable — decisions are paused." });
  const pre = await prerequisites(app, args.to);
  if (!pre.ok && !ALTERNATIVE.includes(args.to)) throw new ORPCError("PRECONDITION_FAILED", { message: pre.missing.join(" "), data: { missing: pre.missing } });

  const nextRev = app.revision + 1;
  await db.transaction(async (tx) => {
    const upd = await tx
      .update(crewApplications)
      .set({ application_status: args.to, revision: nextRev, updated_at: new Date() })
      .where(and(eq(crewApplications.id, app.id), eq(crewApplications.revision, args.expectedRevision)))
      .returning({ id: crewApplications.id });
    if (upd.length !== 1) throw new ORPCError("CONFLICT", { message: "This application changed since you loaded it." });
    await audit(tx, args.actor, { entityType: "application", entityId: app.id, action: "status.transition", from, to: args.to, revision: nextRev, note: args.note ?? null, data: { via: args.via ?? "staff", mode: args.mode } });
    if (args.mode === "connected") await enqueueStatusChange(tx, app.id, nextRev, args.to, app.status_flags ?? []);
  });
  return { status: args.to, revision: nextRev };
}

/** Bump revision + audit for non-status edits (reviewer, due date). */
export async function touchApplication(id: string, expectedRevision: number, set: Partial<typeof crewApplications.$inferInsert>, actor: Actor, action: string, data?: Record<string, unknown>) {
  const res = await db
    .update(crewApplications)
    .set({ ...set, revision: expectedRevision + 1, updated_at: new Date() })
    .where(and(eq(crewApplications.id, id), eq(crewApplications.revision, expectedRevision)))
    .returning({ id: crewApplications.id });
  if (res.length !== 1) throw new ORPCError("CONFLICT", { message: "This application changed since you loaded it." });
  await audit(db, actor, { entityType: "application", entityId: id, action, revision: expectedRevision + 1, data: data ?? null });
  return { revision: expectedRevision + 1 };
}

export const OPEN_STATUSES = ["submitted", "reviewed", "screen_invited", "screen_completed", "assessment", "selected", "offer_issued", "accepted", "onboarding"] as const;
export const isOpen = (s: string) => (OPEN_STATUSES as readonly string[]).includes(s);
