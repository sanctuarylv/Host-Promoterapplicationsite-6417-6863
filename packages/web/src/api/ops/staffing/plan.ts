/**
 * Deterministic import plan for the canonical staffing taxonomy (pure).
 *
 * Same source bytes + same reviewed map + same target snapshot ⇒ byte-identical
 * plan, except `generated_at` (excluded from `plan_hash`, injectable for tests).
 * `proposed_writes` is informational: building a plan never writes anything,
 * and the only table an approved apply may ever write is ops_canonical_roles
 * (master taxonomy). Template versions, event plans, assignments, credentials,
 * permissions and training records are never written by the importer.
 */
import { createHash } from "node:crypto";
import { ROLE_OPTIONS } from "../../crew/contract";
import { validateWorkbook } from "../workbook";
import { AFTER_DARK_V1_ROLES } from "./after-dark-v1";
import {
  adaptCanonicalRows,
  CANONICAL_ENTITY_ID,
  CANONICAL_SCHEMA_VERSION,
  detectFormat,
  HEADCOUNT_MODELS,
  parseSource,
  type CanonicalRole,
  type Issue,
  type SourceFormat,
} from "./canonical";
import { mapCredential, type CredentialMapping } from "./credentials";
import { PLACEHOLDER_DISPOSITIONS, PUBLIC_ROLE_RENAMES, type CanonicalMapEntry } from "./role-map";
import { mapTraining, type TrainingMapping } from "./training";
import { buildAfterDarkVNext, type VNextPreview } from "./vnext";

export const IMPORT_STATUS_BANNER = "DRY RUN — NOTHING IMPORTED" as const;

/** Columns of ops_canonical_roles the importer owns (compared for insert / update / unchanged). */
export type CanonicalRoleRecord = {
  canonical_role_id: string;
  role_key: string;
  display_name: string;
  legacy_display_name: string | null;
  aliases: string[];
  match_class: string;
  legacy_role_key: string | null;
  department: string;
  department_key: string;
  workstream: string;
  entity_id: string;
  opportunity_type: string;
  engagement_type: string;
  baseline_headcount: number;
  headcount_model: string;
  event_applicability: string;
  event_applicability_key: string;
  seniority: string;
  reports_to: string;
  reports_to_role_key: string | null;
  reports_to_canonical_id: string | null;
  reports_to_org_unit: string | null;
  status: string;
  role_summary: string;
  pre_event_responsibilities: string;
  load_in_responsibilities: string;
  live_event_responsibilities: string;
  closeout_responsibilities: string;
  dress_code: string;
  credential_level: string;
  training_requirements: string;
  import_version: string;
  source_system: string;
  source_hash: string;
};

export const toRecord = (c: CanonicalRole, source_hash: string): CanonicalRoleRecord => ({
  canonical_role_id: c.canonical_role_id,
  role_key: c.role_key,
  display_name: c.display_name,
  legacy_display_name: c.legacy_display_name,
  aliases: c.aliases,
  match_class: c.match,
  legacy_role_key: c.legacy_role_key,
  department: c.department,
  department_key: c.department_key,
  workstream: c.workstream,
  entity_id: c.entity_id,
  opportunity_type: c.opportunity_type,
  engagement_type: c.engagement_type,
  baseline_headcount: c.baseline_headcount,
  headcount_model: c.headcount_model,
  event_applicability: c.event_applicability,
  event_applicability_key: c.event_applicability_key,
  seniority: c.seniority,
  reports_to: c.reports_to,
  reports_to_role_key: c.reports_to_role?.kind === "role" ? c.reports_to_role.role_key : null,
  reports_to_canonical_id: c.reports_to_role?.kind === "role" ? c.reports_to_role.canonical_role_id : null,
  reports_to_org_unit: c.reports_to_role?.kind === "org_unit" ? c.reports_to_role.key : null,
  status: c.status,
  role_summary: c.role_summary,
  pre_event_responsibilities: c.pre_event_responsibilities,
  load_in_responsibilities: c.load_in_responsibilities,
  live_event_responsibilities: c.live_event_responsibilities,
  closeout_responsibilities: c.closeout_responsibilities,
  dress_code: c.dress_code,
  credential_level: c.credential_level,
  training_requirements: c.training_requirements,
  import_version: c.import_version,
  source_system: c.source_system,
  source_hash,
});

/** Keys compared to decide update vs unchanged. source_hash alone never forces an update. */
const COMPARED = (Object.keys(toRecordShape()) as (keyof CanonicalRoleRecord)[]).filter((k) => k !== "source_hash");
function toRecordShape(): Record<keyof CanonicalRoleRecord, true> {
  return {
    canonical_role_id: true, role_key: true, display_name: true, legacy_display_name: true, aliases: true, match_class: true, legacy_role_key: true,
    department: true, department_key: true, workstream: true, entity_id: true, opportunity_type: true, engagement_type: true, baseline_headcount: true,
    headcount_model: true, event_applicability: true, event_applicability_key: true, seniority: true, reports_to: true, reports_to_role_key: true,
    reports_to_canonical_id: true, reports_to_org_unit: true, status: true, role_summary: true, pre_event_responsibilities: true, load_in_responsibilities: true,
    live_event_responsibilities: true, closeout_responsibilities: true, dress_code: true, credential_level: true, training_requirements: true,
    import_version: true, source_system: true, source_hash: true,
  };
}

export type WriteOp = { op: "insert" | "update" | "unchanged" | "conflict"; table: "ops_canonical_roles"; canonical_role_id: string; role_key: string; changed_fields: string[] };

/** Decide insert/update/unchanged per role against what the target already holds. */
export function diffWrites(records: CanonicalRoleRecord[], existing: Partial<CanonicalRoleRecord>[]): WriteOp[] {
  const byId = new Map(existing.map((e) => [e.canonical_role_id, e]));
  const byKey = new Map(existing.map((e) => [e.role_key, e]));
  return records.map((r) => {
    const cur = byId.get(r.canonical_role_id);
    const keyOwner = byKey.get(r.role_key);
    if (keyOwner && keyOwner.canonical_role_id !== r.canonical_role_id)
      return { op: "conflict", table: "ops_canonical_roles", canonical_role_id: r.canonical_role_id, role_key: r.role_key, changed_fields: [`role_key held by ${keyOwner.canonical_role_id}`] };
    if (!cur) return { op: "insert", table: "ops_canonical_roles", canonical_role_id: r.canonical_role_id, role_key: r.role_key, changed_fields: [] };
    const changed = COMPARED.filter((k) => JSON.stringify(cur[k] ?? null) !== JSON.stringify(r[k] ?? null));
    return { op: changed.length ? "update" : "unchanged", table: "ops_canonical_roles", canonical_role_id: r.canonical_role_id, role_key: r.role_key, changed_fields: changed };
  });
}

export type ImportPlan = {
  plan_format: 1;
  import_status: typeof IMPORT_STATUS_BANNER;
  source_file: string;
  source_hash: string;
  schema_version: SourceFormat | null;
  generated_at: string;
  entity_id: string;
  import_version: string | null;
  canonical_roles: {
    total: number;
    exact: number;
    renamed: number;
    partial: number;
    new: number;
    roles: {
      canonical_role_id: string;
      role_key: string;
      display_name: string;
      match: string;
      legacy_role_key: string | null;
      legacy_display_name: string | null;
      department_key: string;
      headcount_model: string;
      baseline_headcount: number;
      seniority: string;
      event_applicability: string;
      engagement_type: string;
      reports_to: string;
      reports_to_resolved: string | null;
      note: string;
    }[];
  };
  existing_roles: {
    preserved: { role_key: string; canonical_role_id: string; match: string; title_before: string; title_after: string }[];
    excluded: { role_key: string; domain: string; reason: string }[];
    external: { role_key: string; domain: string; reason: string }[];
    separate_domain: { role_key: string; domain: string; reason: string }[];
    unresolved: { role_key: string; domain: string; reason: string }[];
  };
  headcount: {
    canonical_baseline_total: number;
    proposed_template_total: number;
    existing_template_total: number;
    by_model: Record<string, { roles: number; seats: number }>;
    promoter_baseline: number | null;
    assignments_created: 0;
    note: string;
  };
  supervisor_changes: { canonical_role_id: string; role_key: string; display_name: string; from: string | null; to: string | null }[];
  credential_mappings: CredentialMapping[];
  training_mappings: TrainingMapping[];
  public_roles: { curated_options: string[]; exposed_by_taxonomy: string[]; prepared_renames: typeof PUBLIC_ROLE_RENAMES };
  after_dark_vnext: VNextPreview | null;
  legacy_report: ReturnType<typeof validateWorkbook> | null;
  warnings: Issue[];
  errors: Issue[];
  proposed_writes: {
    mode: "informational";
    applied: false;
    target: string;
    tables_written_on_apply: ["ops_canonical_roles"];
    never_written: string[];
    summary: { insert: number; update: number; unchanged: number; conflict: number };
    operations: WriteOp[];
  };
  ok: boolean;
  plan_hash: string;
};

export type PlanInput = {
  text: string;
  kind: "csv" | "json";
  source_file: string;
  /** sha256 of the raw source bytes; computed from `text` when omitted. */
  source_hash?: string;
  generated_at?: string;
  target?: string;
  /** Current ops_canonical_roles rows on the target (empty for a pure dry run with no target). */
  existing?: Partial<CanonicalRoleRecord>[];
  map?: Record<string, CanonicalMapEntry>;
};

/** JSON with object keys sorted recursively — the basis of plan_hash. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

const NEVER_WRITTEN = [
  "ops_templates / ops_template_versions / ops_template_roles (After Dark v1 untouched; vNext is preview-only)",
  "ops_events / ops_event_role_overrides (event plans)",
  "ops_assignments (no seats are assigned — 66 is a planning baseline)",
  "ops_credentials / zones / permissions",
  "crew_training_modules / crew_training_records",
  "people / applications / public apply options",
];

export function buildImportPlan(input: PlanInput): ImportPlan {
  const source_hash = input.source_hash ?? createHash("sha256").update(input.text).digest("hex");
  const parsed = parseSource(input.text, input.kind);
  const errors: Issue[] = parsed.malformed.map((m) => ({ level: "error", code: "malformed", row: null, canonical_role_id: null, message: m }));
  const warnings: Issue[] = [];
  const det = detectFormat(parsed.header);
  let roles: CanonicalRole[] = [];
  let legacy_report: ImportPlan["legacy_report"] = null;
  if (!parsed.header.length) errors.push({ level: "error", code: "empty", row: null, canonical_role_id: null, message: "no header row" });
  else if (det.format === null)
    errors.push({ level: "error", code: "unknown_format", row: null, canonical_role_id: null, message: `${det.reason}. Missing canonical_v1 columns: ${det.missing_canonical.join(", ") || "none"}` });
  else if (det.format === "legacy") {
    legacy_report = validateWorkbook(parsed.rows);
    warnings.push({ level: "warning", code: "legacy_format", row: null, canonical_role_id: null, message: "legacy six-column format: validated only (scripts/workbook-reconcile.ts). The canonical importer writes canonical_v1 sources only." });
    for (const i of legacy_report.issues) (i.level === "error" ? errors : warnings).push({ level: i.level, code: "legacy", row: i.row, canonical_role_id: null, message: `${i.role_key ?? ""} ${i.message}`.trim() });
  } else {
    const res = adaptCanonicalRows(parsed.rows, input.map);
    roles = res.roles;
    errors.push(...res.errors);
    warnings.push(...res.warnings);
  }

  const credential_mappings = roles.map((r) => mapCredential(r.canonical_role_id, r.role_key, r.credential_level));
  const training_mappings = roles.map((r) => mapTraining(r.canonical_role_id, r.role_key, r.training_requirements));
  for (const c of credential_mappings) for (const g of c.gaps) warnings.push({ level: "warning", code: "credential_gap", row: null, canonical_role_id: c.canonical_role_id, message: g });
  for (const t of training_mappings)
    if (t.unresolved.length) warnings.push({ level: "warning", code: "training_gap", row: null, canonical_role_id: t.canonical_role_id, message: `no training module for: ${t.unresolved.join("; ")}` });
  for (const r of roles)
    if (r.related?.relation === "coordinates_with_external")
      warnings.push({ level: "warning", code: "external_relation", row: null, canonical_role_id: r.canonical_role_id, message: `coordinates with external/venue role "${r.related.key}" — that role stays venue/provider` });

  const v1 = new Map(AFTER_DARK_V1_ROLES.map((r) => [r.key, r]));
  const disp = (cls: string) =>
    Object.entries(PLACEHOLDER_DISPOSITIONS)
      .filter(([, d]) => d.class === cls)
      .map(([role_key, d]) => ({ role_key, domain: d.domain, reason: d.reason }));
  for (const u of disp("unresolved")) warnings.push({ level: "warning", code: "unresolved_legacy_role", row: null, canonical_role_id: null, message: `existing role "${u.role_key}" has no approved canonical mapping — kept as-is` });

  const vnext = roles.length ? buildAfterDarkVNext(roles) : null;
  const by_model = Object.fromEntries(HEADCOUNT_MODELS.map((m) => [m, { roles: 0, seats: 0 }]));
  for (const r of roles) {
    by_model[r.headcount_model].roles++;
    by_model[r.headcount_model].seats += r.baseline_headcount;
  }
  const supKey = (r: CanonicalRole) => (r.reports_to_role?.kind === "role" ? r.reports_to_role.role_key : r.reports_to_role?.kind === "org_unit" ? r.reports_to_role.key : null);
  const records = roles.map((r) => toRecord(r, source_hash));
  const operations = det.format === "canonical_v1" ? diffWrites(records, input.existing ?? []) : [];
  for (const o of operations) if (o.op === "conflict") errors.push({ level: "error", code: "target_conflict", row: null, canonical_role_id: o.canonical_role_id, message: o.changed_fields.join("; ") });
  const summary = { insert: 0, update: 0, unchanged: 0, conflict: 0 };
  for (const o of operations) summary[o.op]++;

  const ok = errors.length === 0 && det.format === "canonical_v1" && roles.length > 0;
  const body: Omit<ImportPlan, "plan_hash" | "generated_at"> = {
    plan_format: 1,
    import_status: IMPORT_STATUS_BANNER,
    source_file: input.source_file,
    source_hash,
    schema_version: det.format === "canonical_v1" ? CANONICAL_SCHEMA_VERSION : det.format,
    entity_id: CANONICAL_ENTITY_ID,
    import_version: roles[0]?.import_version ?? null,
    canonical_roles: {
      total: roles.length,
      exact: roles.filter((r) => r.match === "exact").length,
      renamed: roles.filter((r) => r.match === "rename").length,
      partial: roles.filter((r) => r.match === "partial").length,
      new: roles.filter((r) => r.match === "new").length,
      roles: roles.map((r) => ({
        canonical_role_id: r.canonical_role_id,
        role_key: r.role_key,
        display_name: r.display_name,
        match: r.match,
        legacy_role_key: r.legacy_role_key,
        legacy_display_name: r.legacy_display_name,
        department_key: r.department_key,
        headcount_model: r.headcount_model,
        baseline_headcount: r.baseline_headcount,
        seniority: r.seniority,
        event_applicability: r.event_applicability,
        engagement_type: r.engagement_type,
        reports_to: r.reports_to,
        reports_to_resolved: supKey(r),
        note: r.mapping_note,
      })),
    },
    existing_roles: {
      preserved: roles
        .filter((r) => r.legacy_role_key)
        .map((r) => ({ role_key: r.role_key, canonical_role_id: r.canonical_role_id, match: r.match, title_before: v1.get(r.legacy_role_key!)?.title ?? "", title_after: r.display_name })),
      excluded: disp("excluded"),
      external: disp("external"),
      separate_domain: disp("separate_domain"),
      unresolved: disp("unresolved"),
    },
    headcount: {
      canonical_baseline_total: roles.reduce((a, r) => a + r.baseline_headcount, 0),
      proposed_template_total: vnext?.totals.proposed_sanctuary_seats ?? 0,
      existing_template_total: vnext?.totals.v1_sanctuary_seats ?? AFTER_DARK_V1_ROLES.filter((r) => r.wf !== "venue_provider").reduce((a, r) => a + (r.n ?? 0), 0),
      by_model,
      promoter_baseline: roles.find((r) => r.role_key === "promoter")?.baseline_headcount ?? null,
      assignments_created: 0,
      note: "Baseline headcount is a planning baseline — not a hiring target, employment guarantee, per-event minimum or payroll count. No assignments are created.",
    },
    supervisor_changes: roles
      .filter((r) => r.legacy_role_key && (v1.get(r.legacy_role_key)?.sup ?? null) !== supKey(r))
      .map((r) => ({ canonical_role_id: r.canonical_role_id, role_key: r.role_key, display_name: r.display_name, from: v1.get(r.legacy_role_key!)?.sup ?? null, to: supKey(r) })),
    credential_mappings,
    training_mappings,
    public_roles: { curated_options: ROLE_OPTIONS.map((o) => o.value), exposed_by_taxonomy: [], prepared_renames: PUBLIC_ROLE_RENAMES },
    after_dark_vnext: vnext,
    legacy_report,
    warnings,
    errors,
    proposed_writes: {
      mode: "informational",
      applied: false,
      target: input.target ?? "none (dry run — no database opened)",
      tables_written_on_apply: ["ops_canonical_roles"],
      never_written: NEVER_WRITTEN,
      summary,
      operations,
    },
    ok,
  };
  const plan_hash = createHash("sha256").update(stableStringify(body)).digest("hex");
  return { ...body, generated_at: input.generated_at ?? new Date().toISOString(), plan_hash } as ImportPlan;
}

/** Canonical records ready for an approved upsert (only when the plan is ok). */
export function recordsForApply(input: PlanInput): CanonicalRoleRecord[] {
  const parsed = parseSource(input.text, input.kind);
  const source_hash = input.source_hash ?? createHash("sha256").update(input.text).digest("hex");
  return adaptCanonicalRows(parsed.rows, input.map).roles.map((r) => toRecord(r, source_hash));
}
