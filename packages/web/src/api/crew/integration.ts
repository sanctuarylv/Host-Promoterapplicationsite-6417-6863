/**
 * Integration mode — derived from real evidence, never from configuration alone.
 *
 *   local      CREW_SUBMISSION_MODE=local (default). Applications are saved and
 *              held in the outbox. Staging review functions allowed, labelled
 *              "Saved locally — Command Center connection pending".
 *   pending    Forward mode is configured but no verified round trip receipt
 *              has been recorded (cc_verified_round_trip) or cutover is not set.
 *              Behaves like local for decisions.
 *   connected  Forward configured + verified round trip + cutover boundary set
 *              + no recent connectivity failures. Local decisions become
 *              versioned outbox operations; canonical owner decides.
 *   degraded   Connected prerequisites met but recent sends failed
 *              (network/timeout/server/auth). Intake still saved; offers,
 *              assignments and credentials are disabled (cannot be committed
 *              to the canonical owner).
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import { crewApplications, crewOutbox } from "../database/schema";
import { getCrewConfig } from "./config";
import { getSetting } from "../shared/settings";
import { CONSENT_VERSION, LEGACY_STATUS_MAP, PIPELINE_STATUSES } from "./contract";

export type IntegrationMode = "local" | "pending" | "connected" | "degraded";

export type Cutover = { at: string; by: string; reconciliationId: string; acknowledgedCount: number };
export type RoundTrip = { at: string; receiptId: string; canonicalId: string; by: string; environment: string };

export async function getIntegrationState() {
  const cfg = getCrewConfig();
  const roundTrip = await getSetting<RoundTrip>("cc_verified_round_trip");
  const cutover = await getSetting<Cutover>("cc_cutover");
  let mode: IntegrationMode = "local";
  let reason = "Saved locally — Command Center connection pending";
  if (cfg.submissionMode === "forward") {
    if (!cfg.commandCenter.canForward) {
      mode = "pending";
      reason = "Forward mode set, but Command Center URL/path/key are incomplete";
    } else if (!roundTrip) {
      mode = "pending";
      reason = "Configured, but no verified round trip receipt has been recorded";
    } else if (!cutover) {
      mode = "pending";
      reason = "Round trip verified; reconciliation + cutover boundary not yet recorded";
    } else {
      const since = new Date(Date.now() - 15 * 60_000);
      const recent = await db
        .select({ cls: crewOutbox.last_error_class, status: crewOutbox.status })
        .from(crewOutbox)
        .where(gte(crewOutbox.updated_at, since))
        .orderBy(desc(crewOutbox.updated_at))
        .limit(10);
      const failing = recent.filter((r) => r.cls && ["network", "timeout", "server", "auth"].includes(r.cls) && r.status !== "synced").length;
      if (recent.length && failing >= Math.ceil(recent.length / 2)) {
        mode = "degraded";
        reason = "Recent Command Center sends are failing — intake is saved; canonical mutations are paused";
      } else {
        mode = "connected";
        reason = "Command Center round trip verified and cutover recorded";
      }
    }
  }
  return {
    mode,
    reason,
    submissionMode: cfg.submissionMode,
    referralMode: cfg.referralMode,
    configured: { forward: cfg.commandCenter.canForward, referralLookup: cfg.commandCenter.canLookupReferrals, statusPath: Boolean(cfg.commandCenter.statusPath) },
    roundTrip,
    cutover,
    legacyAdminMode: cfg.legacyAdminMode,
    contract: "proposed (unverified) — docs/COMMAND_CENTER_CONTRACT_V2.md",
  };
}

/** Mutations that must be durably committed by the canonical owner are blocked while degraded. */
export async function assertCanonicalWritable(what: string) {
  const s = await getIntegrationState();
  if (s.mode === "degraded")
    throw new ORPCError("PRECONDITION_FAILED", { message: `${what} is paused: Command Center is unavailable. Nothing was changed.` });
  return s;
}

/**
 * Reconciliation DRY RUN. Read-only. Lists every local application with its
 * mapped status, consent provenance, outbox state and conflicts. A canonical
 * comparison requires a Command Center read endpoint, which is not available —
 * reported as `canonical: "unavailable"` rather than assumed to match.
 */
export async function reconciliationDryRun() {
  const apps = await db
    .select({
      id: crewApplications.id,
      email: crewApplications.email_normalized,
      opportunity: crewApplications.opportunity_key,
      status: crewApplications.application_status,
      legacy: crewApplications.legacy_status,
      flags: crewApplications.status_flags,
      consent: crewApplications.consent_version,
      external: crewApplications.external_id,
      person: crewApplications.person_id,
      created: crewApplications.created_at,
    })
    .from(crewApplications);
  const ops = await db
    .select({ agg: crewOutbox.aggregate_id, status: crewOutbox.status, op: crewOutbox.operation, cls: crewOutbox.last_error_class })
    .from(crewOutbox)
    .where(and(eq(crewOutbox.aggregate_type, "application"), inArray(crewOutbox.operation, ["application.create"])));
  const opBy = new Map(ops.map((o) => [o.agg, o]));
  const items = apps.map((a) => {
    const conflicts: string[] = [];
    if (!a.person) conflicts.push("no_person_identity");
    if (!(PIPELINE_STATUSES as readonly string[]).includes(a.status)) conflicts.push("unmapped_status");
    if (a.legacy && !LEGACY_STATUS_MAP[a.legacy]) conflicts.push("unknown_legacy_status");
    for (const f of a.flags ?? []) if (f.startsWith("legacy_") || f === "phone_shared") conflicts.push(f);
    if (a.consent !== CONSENT_VERSION) conflicts.push("consent_predates_paid_acknowledgement");
    const op = opBy.get(a.id);
    if (!op) conflicts.push("missing_outbox_create");
    if (op?.status === "dead") conflicts.push(`outbox_dead_${op.cls ?? "unknown"}`);
    return {
      id: a.id,
      opportunity: a.opportunity,
      localStatus: a.status,
      legacyStatus: a.legacy,
      consentVersion: a.consent,
      outbox: op?.status ?? "none",
      canonicalId: a.external,
      canonical: "unavailable" as const,
      action: conflicts.some((c) => c.startsWith("legacy_") || c === "unmapped_status" || c === "no_person_identity" || c.startsWith("outbox_dead"))
        ? ("quarantine" as const)
        : ("transfer" as const),
      conflicts,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    total: items.length,
    transfer: items.filter((i) => i.action === "transfer").length,
    quarantine: items.filter((i) => i.action === "quarantine").length,
    alreadyCanonical: items.filter((i) => i.canonicalId).length,
    canonicalComparison: "unavailable — Command Center read endpoint not provided",
    items,
  };
}
