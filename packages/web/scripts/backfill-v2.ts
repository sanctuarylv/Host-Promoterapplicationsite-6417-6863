/**
 * v1 → v2 data backfill (run AFTER migration 0001).
 *
 *   bun scripts/backfill-v2.ts --dry-run      # report only, no writes
 *   bun scripts/backfill-v2.ts                # apply (local file DB only, see guard.ts)
 *
 * Per legacy application (person_id IS NULL):
 *   1. find-or-create crew_people by normalized email (phone is never a merge key;
 *      a phone held by a different person sets phone_shared on both)
 *   2. map the v1 status through LEGACY_STATUS_MAP, keep the original in
 *      legacy_status, add the review flag the map names
 *   3. sanitize attribution: referring_url → origin+path, landing_path → path,
 *      attribution_json.firstTouch → allow-listed keys (dropped key NAMES are audited, never values)
 *   4. enqueue a HELD application.create outbox row (nothing is sent)
 *   5. write a crew_audit row (actor "cli:backfill-v2")
 * Idempotent: rows that already have person_id are skipped; outbox uses the idempotency key.
 */
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../src/api/database";
import { crewApplications, crewAudit, crewOutbox, crewPeople, type CrewApplicationRow } from "../src/api/database/schema";
import { LEGACY_STATUS_MAP, PIPELINE_STATUSES } from "../src/api/crew/contract";
import { safePath, safeUrl, sanitizeFirstTouch } from "../src/api/crew/analytics";
import { toCommandCenterPayload } from "../src/api/crew/command-center";
import { idempotencyKeyFor, stableStringify } from "../src/api/crew/outbox";
import { sha256, uuid } from "../src/api/shared/ids";
import { assertWritable } from "./guard";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const target = assertWritable(argv, dryRun);
const ACTOR = "cli:backfill-v2";

type Plan = {
  id: string;
  person: { action: "create" | "reuse"; id: string };
  status: { from: string; to: string; flag: string | null; unknown: boolean };
  phoneSharedWith: string[];
  attribution: { referringUrl: boolean; landingPath: boolean; firstTouchKeys: string[] };
  outbox: "enqueue_held" | "exists";
};

const rows = await db.select().from(crewApplications).where(isNull(crewApplications.person_id));
const plans: Plan[] = [];
const peopleByEmail = new Map<string, string>();

for (const r of rows) {
  // 1. identity
  let personId = peopleByEmail.get(r.email_normalized);
  let personAction: "create" | "reuse" = "reuse";
  if (!personId) {
    const [p] = await db.select({ id: crewPeople.id }).from(crewPeople).where(eq(crewPeople.email_normalized, r.email_normalized)).limit(1);
    personId = p?.id;
    if (!personId) {
      personId = uuid();
      personAction = "create";
    }
    peopleByEmail.set(r.email_normalized, personId);
  }
  const phoneOthers = r.phone_normalized
    ? (
        await db
          .select({ id: crewPeople.id })
          .from(crewPeople)
          .where(and(eq(crewPeople.phone_normalized, r.phone_normalized), ne(crewPeople.email_normalized, r.email_normalized)))
      ).map((x) => x.id)
    : [];
  // also catch phone collisions among people created in this same run
  for (const other of plans)
    if (other.person.action === "create" && other.person.id !== personId) {
      const o = rows.find((x) => x.id === other.id);
      if (o && o.phone_normalized && o.phone_normalized === r.phone_normalized && o.email_normalized !== r.email_normalized) phoneOthers.push(other.person.id);
    }

  // 2. status
  const already = (PIPELINE_STATUSES as readonly string[]).includes(r.application_status) && r.legacy_status !== null;
  const m = LEGACY_STATUS_MAP[r.application_status];
  const to = already ? r.application_status : (m?.to ?? r.application_status);
  const flag = already ? null : m ? (m.flag ?? null) : "legacy_unknown_status";

  // 3. attribution
  const ft = sanitizeFirstTouch((r.attribution_json as Record<string, unknown> | null)?.firstTouch);
  const cleanRef = safeUrl(r.referring_url);
  const cleanLanding = safePath(r.landing_path);

  // 4. outbox
  const key = idempotencyKeyFor(r.id, "application.create", 1);
  const [ob] = await db.select({ id: crewOutbox.id }).from(crewOutbox).where(eq(crewOutbox.idempotency_key, key)).limit(1);

  plans.push({
    id: r.id,
    person: { action: personAction, id: personId },
    status: { from: r.application_status, to, flag, unknown: !m && !already },
    phoneSharedWith: [...new Set(phoneOthers)],
    attribution: {
      referringUrl: (r.referring_url ?? null) !== cleanRef,
      landingPath: (r.landing_path ?? null) !== cleanLanding,
      firstTouchKeys: ft.changed,
    },
    outbox: ob ? "exists" : "enqueue_held",
  });
}

const summary = {
  database: target.label,
  dryRun,
  candidates: rows.length,
  peopleToCreate: new Set(plans.filter((p) => p.person.action === "create").map((p) => p.person.id)).size,
  statusMap: plans.reduce<Record<string, number>>((acc, p) => ((acc[`${p.status.from}→${p.status.to}`] = (acc[`${p.status.from}→${p.status.to}`] ?? 0) + 1), acc), {}),
  flagged: plans.filter((p) => p.status.flag).length,
  unknownStatuses: plans.filter((p) => p.status.unknown).length,
  phoneShared: plans.filter((p) => p.phoneSharedWith.length).length,
  attributionSanitized: plans.filter((p) => p.attribution.referringUrl || p.attribution.landingPath || p.attribution.firstTouchKeys.length).length,
  outboxToEnqueue: plans.filter((p) => p.outbox === "enqueue_held").length,
};

console.log(JSON.stringify({ summary, plans }, null, 2));
if (dryRun) {
  console.log("\nDRY RUN — no changes written.");
  process.exit(0);
}

let applied = 0;
for (const plan of plans) {
  const r = rows.find((x) => x.id === plan.id)!;
  await db.transaction(async (tx) => {
    if (plan.person.action === "create") {
      await tx
        .insert(crewPeople)
        .values({
          id: plan.person.id,
          email_normalized: r.email_normalized,
          first_name: r.first_name,
          last_name: r.last_name,
          phone_normalized: r.phone_normalized || null,
          phone_shared: plan.phoneSharedWith.length > 0,
        })
        .onConflictDoNothing({ target: crewPeople.email_normalized });
    }
    // re-resolve (another run may have created the person concurrently)
    const [p] = await tx.select({ id: crewPeople.id }).from(crewPeople).where(eq(crewPeople.email_normalized, r.email_normalized)).limit(1);
    const personId = p!.id;
    if (plan.phoneSharedWith.length) {
      for (const other of [personId, ...plan.phoneSharedWith])
        await tx.update(crewPeople).set({ phone_shared: true, updated_at: new Date() }).where(eq(crewPeople.id, other));
    }

    const flags = new Set(r.status_flags ?? []);
    if (plan.status.flag) flags.add(plan.status.flag);
    if (plan.phoneSharedWith.length) flags.add("phone_shared");
    const attr = (r.attribution_json as Record<string, unknown> | null) ?? null;
    const ft = sanitizeFirstTouch(attr?.firstTouch);
    const nextAttr = attr ? { ...attr, firstTouch: ft.value } : attr;

    const res = await tx
      .update(crewApplications)
      .set({
        person_id: personId,
        legacy_status: r.legacy_status ?? r.application_status,
        application_status: plan.status.to,
        status_flags: [...flags],
        referring_url: safeUrl(r.referring_url),
        landing_path: safePath(r.landing_path),
        attribution_json: nextAttr,
        updated_at: new Date(),
      })
      .where(and(eq(crewApplications.id, r.id), isNull(crewApplications.person_id)));
    if (res.rowsAffected === 0) return; // someone else backfilled it

    const [fresh] = await tx.select().from(crewApplications).where(eq(crewApplications.id, r.id)).limit(1);
    const payload = toCommandCenterPayload(fresh as CrewApplicationRow);
    await tx
      .insert(crewOutbox)
      .values({
        id: uuid(),
        aggregate_type: "application",
        aggregate_id: r.id,
        operation: "application.create",
        op_version: 1,
        idempotency_key: idempotencyKeyFor(r.id, "application.create", 1),
        payload,
        payload_hash: sha256(stableStringify(payload)),
        status: "held",
      })
      .onConflictDoNothing({ target: crewOutbox.idempotency_key });

    await tx.insert(crewAudit).values({
      entity_type: "application",
      entity_id: r.id,
      action: "backfill.v2",
      actor_user_id: null,
      actor_label: ACTOR,
      from_value: plan.status.from,
      to_value: plan.status.to,
      data: {
        personId,
        personAction: plan.person.action,
        flag: plan.status.flag,
        phoneShared: plan.phoneSharedWith.length > 0,
        sanitized: plan.attribution, // key names / booleans only — never the dropped values
      },
    });
    applied++;
  });
}
console.log(`\nApplied to ${applied} application(s) on ${target.label}.`);
