/**
 * INTERFACE SPEC ONLY — Command Center staffing exports (proposed extension of
 * contract `sanctuary-cc.crew.proposed-v2`, docs/COMMAND_CENTER_CONTRACT_V2.md).
 *
 * NOT CONNECTED. Nothing imports this module from the router, the outbox or any
 * worker; it performs no I/O and holds no endpoint, path or credential. The
 * Command Center API has not been provided or verified (CANONICAL_ADAPTER.implemented
 * is false). These schemas describe what this app WOULD send once the Command
 * Center team confirms the contract — see docs/INTEGRATION_INTERFACE_SPECS_V4.md.
 *
 * Two proposed operations:
 *   staffing.taxonomy.export   — the 36 canonical roles (reference data, no people)
 *   staffing.assignment.export — approved event assignments (internal ids, no contact PII)
 *
 * Domain boundary: only Sanctuary LV Group (paid) staffing. The Sanctuary LV
 * nonprofit Serve Team is a separate domain and is never part of either export.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { ACCESS_ZONES } from "../../ops/staffing/credentials";
import type { ImportPlan } from "../../ops/staffing/plan";

export const SPEC_STATUS = { implemented: false, wired: false, verified_against_real_api: false, contract: "sanctuary-cc.crew.proposed-v2", extension: "staffing.v0-proposed" } as const;
export const GROUP_ENTITY = "sanctuary_lv_group" as const;

const isoTs = z.iso.datetime();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const StaffingRoleSchema = z
  .object({
    canonical_role_id: z.string().regex(/^SLVG-[A-Z]{3}-\d{3}$/),
    role_key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    display_name: z.string().min(1).max(120),
    department_key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    seniority: z.string().min(1).max(40),
    headcount_model: z.string().min(1).max(40),
    baseline_headcount: z.number().int().min(0).max(500),
    reports_to_role_key: z.string().nullable(),
    /** Always the literal pending value until HR / legal classify (decision register D-CLS-*). */
    engagement_type: z.literal("pending_classification"),
    /** Proposed zones from the reviewed plan — informational; never a grant. */
    proposed_zones: z.array(z.enum(ACCESS_ZONES)),
    credential_status: z.enum(["mapped", "partial", "unresolved"]),
    training_module_keys: z.array(z.string()),
    training_status: z.enum(["mapped", "partial", "unresolved"]),
  })
  .strict();

export const TaxonomyExportSchema = z
  .object({
    operation: z.literal("staffing.taxonomy.export"),
    contract: z.literal(SPEC_STATUS.contract),
    extension: z.literal(SPEC_STATUS.extension),
    entity_id: z.literal(GROUP_ENTITY),
    source_hash: sha256,
    plan_hash: sha256,
    generated_at: isoTs,
    idempotency_key: z.string().regex(/^crew:staffing\.taxonomy\.export:[0-9a-f]{16}$/),
    roles: z.array(StaffingRoleSchema).min(1),
  })
  .strict();
export type TaxonomyExport = z.infer<typeof TaxonomyExportSchema>;

/**
 * Approved event assignment. Identity is the internal crew person id plus the
 * Command Center canonical id when one was returned by a verified receipt.
 * Never names, email, phone, address, pay rate or private notes.
 */
export const AssignmentExportItemSchema = z
  .object({
    assignment_id: z.string().min(1),
    revision: z.number().int().min(1),
    event_id: z.string().min(1),
    person_id: z.string().min(1),
    person_canonical_id: z.string().nullable(),
    role_key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    canonical_role_id: z.string().regex(/^SLVG-[A-Z]{3}-\d{3}$/).nullable(),
    department_key: z.string(),
    shift_start_utc: isoTs.nullable(),
    shift_end_utc: isoTs.nullable(),
    shift_confirmed: z.boolean(),
    zones: z.array(z.enum(ACCESS_ZONES)),
    status: z.literal("approved"),
  })
  .strict();
export const AssignmentExportSchema = z
  .object({
    operation: z.literal("staffing.assignment.export"),
    contract: z.literal(SPEC_STATUS.contract),
    extension: z.literal(SPEC_STATUS.extension),
    entity_id: z.literal(GROUP_ENTITY),
    event_id: z.string().min(1),
    generated_at: isoTs,
    idempotency_key: z.string().regex(/^crew:staffing\.assignment\.export:[^:]+:[0-9a-f]{16}$/),
    assignments: z.array(AssignmentExportItemSchema),
  })
  .strict();
export type AssignmentExport = z.infer<typeof AssignmentExportSchema>;

/** Expected receipt (same strict rules as application.create: submission id must echo ours). */
export const StaffingReceiptSchema = z
  .object({ status: z.enum(["created", "replayed"]), idempotency_key: z.string(), receipt_id: z.string().min(1), payload_hash: sha256 })
  .strict();

const hex16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Pure builder: the taxonomy export that WOULD be sent for this reviewed plan. Not called by the app. */
export function buildTaxonomyExport(plan: ImportPlan, generated_at: string): TaxonomyExport {
  const cred = new Map(plan.credential_mappings.map((c) => [c.canonical_role_id, c]));
  const train = new Map(plan.training_mappings.map((t) => [t.canonical_role_id, t]));
  return TaxonomyExportSchema.parse({
    operation: "staffing.taxonomy.export",
    contract: SPEC_STATUS.contract,
    extension: SPEC_STATUS.extension,
    entity_id: GROUP_ENTITY,
    source_hash: plan.source_hash,
    plan_hash: plan.plan_hash,
    generated_at,
    idempotency_key: `crew:staffing.taxonomy.export:${hex16(plan.plan_hash)}`,
    roles: plan.canonical_roles.roles.map((r) => ({
      canonical_role_id: r.canonical_role_id,
      role_key: r.role_key,
      display_name: r.display_name,
      department_key: r.department_key,
      seniority: r.seniority,
      headcount_model: r.headcount_model,
      baseline_headcount: r.baseline_headcount,
      reports_to_role_key: r.reports_to_resolved,
      engagement_type: r.engagement_type,
      proposed_zones: cred.get(r.canonical_role_id)?.proposed_zones ?? [],
      credential_status: cred.get(r.canonical_role_id)?.status ?? "unresolved",
      training_module_keys: train.get(r.canonical_role_id)?.module_keys ?? [],
      training_status: train.get(r.canonical_role_id)?.status ?? "unresolved",
    })),
  });
}

export type AssignmentRowLike = {
  id: string;
  revision: number;
  event_id: string;
  person_id: string;
  role_key: string;
  department_key: string;
  shift_start_utc: Date | null;
  shift_end_utc: Date | null;
  shift_confirmed: boolean;
  zones: string[];
  status: string;
};

/** Pure builder over ops_assignments-shaped rows. Only `approved` rows are exported; Serve Team rows are rejected. */
export function buildAssignmentExport(
  event_id: string,
  rows: AssignmentRowLike[],
  opts: { generated_at: string; canonicalByRoleKey: Record<string, string>; canonicalPersonId?: Record<string, string>; excludedRoleKeys: readonly string[] },
): AssignmentExport {
  const approved = rows.filter((r) => r.event_id === event_id && r.status === "approved");
  for (const r of approved) if (opts.excludedRoleKeys.includes(r.role_key)) throw new Error(`role ${r.role_key} belongs to the nonprofit Serve Team domain and is never exported`);
  const items = approved
    .map((r) => ({
      assignment_id: r.id,
      revision: r.revision,
      event_id: r.event_id,
      person_id: r.person_id,
      person_canonical_id: opts.canonicalPersonId?.[r.person_id] ?? null,
      role_key: r.role_key,
      canonical_role_id: opts.canonicalByRoleKey[r.role_key] ?? null,
      department_key: r.department_key,
      shift_start_utc: r.shift_start_utc?.toISOString() ?? null,
      shift_end_utc: r.shift_end_utc?.toISOString() ?? null,
      shift_confirmed: r.shift_confirmed,
      zones: r.zones,
      status: "approved" as const,
    }))
    .sort((a, b) => a.assignment_id.localeCompare(b.assignment_id));
  const digest = hex16(items.map((i) => `${i.assignment_id}@${i.revision}`).join(","));
  return AssignmentExportSchema.parse({
    operation: "staffing.assignment.export",
    contract: SPEC_STATUS.contract,
    extension: SPEC_STATUS.extension,
    entity_id: GROUP_ENTITY,
    event_id,
    generated_at: opts.generated_at,
    idempotency_key: `crew:staffing.assignment.export:${event_id}:${digest}`,
    assignments: items,
  });
}
