/**
 * Durable outbox to the Command Center.
 *
 * - One row per (aggregate, operation, op_version). The idempotency key is
 *   derived from those and never changes: retries replay the SAME request.
 * - A changed canonical status is a NEW operation (application.status, vN) —
 *   an old create request is never replayed with changed content.
 * - Exclusive claim: a row is processed only by the worker whose conditional
 *   UPDATE succeeded; expired claims become claimable again.
 * - Retry classification + exponential backoff with jitter, bounded attempts.
 *   Exhausted or non-retryable rows stop and need a manual (audited) retry.
 */
import { and, eq, inArray, lte, or, sql, isNull, lt } from "drizzle-orm";
import { db } from "../database";
import { crewApplications, crewOutbox, type CrewApplicationRow } from "../database/schema";
import { RETRYABLE, sendOperation, toCommandCenterPayload, type ErrorClass } from "./command-center";
import { getCrewConfig } from "./config";
import { endpointFingerprint } from "./integration";
import { audit, type Actor, SYSTEM } from "../shared/audit";
import { sha256, uuid } from "../shared/ids";

/** A claim must outlive the request timeout so a slow-but-live worker is not overtaken mid-request. */
const claimMs = () => Math.max(60_000, getCrewConfig().commandCenter.timeoutMs * 2 + 10_000);
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 6 * 60 * 60_000;

export const idempotencyKeyFor = (aggregateId: string, operation: string, version: number) =>
  `crew:${operation}:${aggregateId}:v${version}`;

/** Stable JSON (sorted keys) so the hash is deterministic. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

export function backoffMs(attempts: number, retryAfterMs?: number, rand = Math.random()) {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));
  const jittered = exp * (0.8 + rand * 0.4);
  return Math.min(MAX_DELAY_MS, Math.max(jittered, retryAfterMs ?? 0));
}

type Exec = Pick<typeof db, "insert" | "update" | "select">;

/**
 * Enqueue application.create for a stored application. Status is "held" while
 * submissions are local-only, "pending" in forward mode. Idempotent: enqueueing
 * twice is a no-op (unique idempotency key).
 */
export async function enqueueApplicationCreate(exec: Exec, row: CrewApplicationRow) {
  const payload = toCommandCenterPayload(row);
  const key = idempotencyKeyFor(row.id, "application.create", 1);
  const forward = getCrewConfig().submissionMode === "forward";
  await exec
    .insert(crewOutbox)
    .values({
      id: uuid(),
      aggregate_type: "application",
      aggregate_id: row.id,
      operation: "application.create",
      op_version: 1,
      idempotency_key: key,
      payload,
      payload_hash: sha256(stableStringify(payload)),
      status: forward ? "pending" : "held",
    })
    .onConflictDoNothing({ target: crewOutbox.idempotency_key });
}

/** Enqueue a versioned status change (only used once connected mode is enabled). */
export async function enqueueStatusChange(exec: Exec, applicationId: string, revision: number, status: string, flags: string[]) {
  const payload = { submission_id: applicationId, revision, status, flags, at: new Date().toISOString() };
  await exec
    .insert(crewOutbox)
    .values({
      id: uuid(),
      aggregate_type: "application",
      aggregate_id: applicationId,
      operation: "application.status",
      op_version: revision,
      idempotency_key: idempotencyKeyFor(applicationId, "application.status", revision),
      payload,
      payload_hash: sha256(stableStringify(payload)),
      status: "pending",
    })
    .onConflictDoNothing({ target: crewOutbox.idempotency_key });
}

/** Atomically claim one row. Returns true only for the single winner. */
export async function claim(id: string, workerId: string, now = new Date()) {
  const rows = await db
    .update(crewOutbox)
    .set({ status: "processing", claimed_by: workerId, claim_expires_at: new Date(now.getTime() + claimMs()), updated_at: now })
    .where(
      and(
        eq(crewOutbox.id, id),
        or(
          and(inArray(crewOutbox.status, ["pending", "failed"]), lte(crewOutbox.next_attempt_at, now)),
          and(eq(crewOutbox.status, "processing"), lt(crewOutbox.claim_expires_at, now)),
        ),
        lt(crewOutbox.attempts, crewOutbox.max_attempts),
      ),
    )
    .returning({ id: crewOutbox.id });
  return rows.length === 1;
}

export type ProcessResult = "synced" | "failed" | "dead" | "held" | "skipped" | "lost_claim";

/**
 * Process one claimed row. Only the current claimer may record the outcome:
 * every write after the network call is conditional on (claimed_by = me,
 * status = processing). A worker whose claim expired and was taken over gets
 * "lost_claim" and touches NOTHING — no outbox outcome, no application mirror,
 * no audit row — so a stale processor can never overwrite the winner.
 */
export async function processOne(id: string, workerId: string, now0 = new Date()): Promise<ProcessResult> {
  if (!(await claim(id, workerId, now0))) return "skipped";
  const [row] = await db.select().from(crewOutbox).where(eq(crewOutbox.id, id)).limit(1);
  if (!row) return "skipped";
  // Bind the receipt to the endpoint that issued it (checked by recordRoundTrip).
  const endpoint = endpointFingerprint();
  const res = await sendOperation({
    operation: row.operation,
    idempotencyKey: row.idempotency_key,
    submissionId: row.aggregate_id,
    payload: row.payload,
    payloadHash: row.payload_hash,
  });
  const now = new Date();
  const attempts = row.attempts + 1;
  const mine = and(eq(crewOutbox.id, id), eq(crewOutbox.claimed_by, workerId), eq(crewOutbox.status, "processing"));
  if (res.ok) {
    const won = await db
      .update(crewOutbox)
      .set({
        status: "synced",
        attempts,
        receipt_id: res.receiptId,
        canonical_id: res.canonicalId,
        synced_at: now,
        last_error: null,
        last_error_class: null,
        claimed_by: null,
        claim_expires_at: null,
        updated_at: now,
      })
      .where(mine)
      .returning({ id: crewOutbox.id });
    if (won.length !== 1) return "lost_claim";
    if (row.operation === "application.create") {
      await db
        .update(crewApplications)
        .set({ sync_status: "synced", synced_at: now, external_id: res.canonicalId, sync_error: null, sync_attempts: attempts, authority: "canonical_mirror" })
        .where(eq(crewApplications.id, row.aggregate_id));
    }
    await audit(db, SYSTEM, { entityType: "outbox", entityId: id, action: "outbox.synced", to: res.canonicalId, data: { receipt: res.receiptId, replay: res.replay, attempts, endpoint } });
    return "synced";
  }
  const cls: ErrorClass = res.errorClass;
  const retryable = RETRYABLE.has(cls) && attempts < row.max_attempts;
  const status = cls === "not_configured" ? "held" : retryable ? "failed" : "dead";
  const won = await db
    .update(crewOutbox)
    .set({
      status,
      attempts: cls === "not_configured" ? row.attempts : attempts,
      last_error: res.error.slice(0, 200),
      last_error_class: cls,
      next_attempt_at: new Date(now.getTime() + backoffMs(attempts, res.retryAfterMs)),
      claimed_by: null,
      claim_expires_at: null,
      updated_at: now,
    })
    .where(mine)
    .returning({ id: crewOutbox.id });
  if (won.length !== 1) return "lost_claim";
  if (row.operation === "application.create") {
    await db
      .update(crewApplications)
      .set({ sync_status: cls === "not_configured" ? "not_configured" : "failed", sync_error: `${cls}: ${res.error}`.slice(0, 200), sync_attempts: attempts })
      .where(eq(crewApplications.id, row.aggregate_id));
  }
  await audit(db, SYSTEM, { entityType: "outbox", entityId: id, action: `outbox.${status}`, data: { errorClass: cls, attempts: cls === "not_configured" ? row.attempts : attempts } });
  return status;
}

/** Drain due rows (bounded). Safe to run concurrently from several instances. */
export async function drainDue(limit = 10, workerId = `w-${uuid().slice(0, 8)}`) {
  if (getCrewConfig().submissionMode !== "forward") return { processed: 0, results: [] as string[] };
  const now = new Date();
  const due = await db
    .select({ id: crewOutbox.id })
    .from(crewOutbox)
    .where(
      and(
        or(
          and(inArray(crewOutbox.status, ["pending", "failed"]), lte(crewOutbox.next_attempt_at, now)),
          and(eq(crewOutbox.status, "processing"), lt(crewOutbox.claim_expires_at, now)),
        ),
        lt(crewOutbox.attempts, crewOutbox.max_attempts),
      ),
    )
    .orderBy(crewOutbox.next_attempt_at)
    .limit(limit);
  const results: ProcessResult[] = [];
  for (const d of due) results.push(await processOne(d.id, workerId));
  return { processed: results.filter((r) => r !== "skipped" && r !== "lost_claim").length, results };
}

/**
 * Manual retry by an authorized operator: resets a dead/failed/held row to be
 * due now, grants one more attempt if exhausted, and writes an audit record.
 * The idempotency key and payload are unchanged.
 */
export async function manualRetry(id: string, actor: Actor, reason: string) {
  const [row] = await db.select().from(crewOutbox).where(eq(crewOutbox.id, id)).limit(1);
  if (!row) return { ok: false as const, error: "not_found" };
  if (row.status === "synced" || row.status === "processing") return { ok: false as const, error: `cannot_retry_${row.status}` };
  const now = new Date();
  const updated = await db
    .update(crewOutbox)
    .set({
      status: "pending",
      next_attempt_at: now,
      max_attempts: row.attempts >= row.max_attempts ? row.attempts + 1 : row.max_attempts,
      updated_at: now,
    })
    .where(and(eq(crewOutbox.id, id), eq(crewOutbox.status, row.status), eq(crewOutbox.attempts, row.attempts)))
    .returning({ id: crewOutbox.id });
  // Lost a race with a worker or another operator: report it, write no audit claiming a retry happened.
  if (updated.length !== 1) return { ok: false as const, error: "state_changed_retry_again" };
  await audit(db, actor, { entityType: "outbox", entityId: id, action: "outbox.manual_retry", from: row.status, to: "pending", note: reason, data: { attempts: row.attempts, lastErrorClass: row.last_error_class } });
  return { ok: true as const };
}

export async function outboxSummary() {
  const rows = await db
    .select({ status: crewOutbox.status, operation: crewOutbox.operation, n: sql<number>`count(*)` })
    .from(crewOutbox)
    .groupBy(crewOutbox.status, crewOutbox.operation);
  const pendingCreate = await db
    .select({ n: sql<number>`count(*)` })
    .from(crewApplications)
    .where(isNull(crewApplications.external_id));
  return { byStatus: rows, applicationsWithoutCanonicalId: Number(pendingCreate[0]?.n ?? 0) };
}
