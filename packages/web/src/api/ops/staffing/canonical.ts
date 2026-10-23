/**
 * Canonical Sanctuary LV Group staffing taxonomy — format detection, column
 * adapter and validation (pure, no I/O, no database).
 *
 *   source text ─▶ detectFormat (full header set) ─▶ adaptCanonicalRows ─▶ CanonicalRole[]
 *                                                     validateCanonical ─▶ errors / warnings
 *
 * The canonical workbook is never rewritten to suit the legacy six-column
 * importer: canonical columns are translated here and every canonical field is
 * kept. Identity comes ONLY from the reviewed map in ./role-map.ts.
 */
import { parseCsvTable, WORKBOOK_COLUMNS, type WorkbookRow } from "../workbook";
import { AFTER_DARK_V1_ROLES } from "./after-dark-v1";
import { CANONICAL_ROLE_MAP, DEPARTMENT_KEYS, PLACEHOLDER_DISPOSITIONS, SUPERVISOR_ORG_ALIASES, type CanonicalMapEntry, type MatchClass } from "./role-map";

export const CANONICAL_SCHEMA_VERSION = "canonical_v1" as const;
export const CANONICAL_ENTITY_ID = "sanctuary_lv_group";
export const NONPROFIT_ENTITY_ID = "sanctuary_lv";
export const CANONICAL_ROLE_COUNT = 36;
export const CANONICAL_ID_RE = /^SLVG-EVT-\d{3}$/;

/** The complete canonical_v1 header set. Detection requires ALL of them. */
export const CANONICAL_V1_COLUMNS = [
  "role_id",
  "role_name",
  "department",
  "workstream",
  "reports_to",
  "baseline_headcount",
  "headcount_model",
  "opportunity_type",
  "engagement_type",
  "event_applicability",
  "seniority",
  "role_summary",
  "pre_event",
  "load_in",
  "live_event",
  "closeout",
  "dress_code",
  "credential_level",
  "training_requirements",
  "status",
  "entity_id",
  "import_version",
  "source_system",
] as const;

/** The legacy six required columns (src/api/ops/workbook.ts); supervisor_role_key/notes optional. */
export const LEGACY_REQUIRED_COLUMNS = WORKBOOK_COLUMNS.filter((c) => c !== "supervisor_role_key");

export const HEADCOUNT_MODELS = ["required", "recommended", "scalable", "event_specific"] as const;
export type HeadcountModel = (typeof HEADCOUNT_MODELS)[number];
export const SENIORITY_LEVELS = ["executive", "manager", "lead", "coordinator", "specialist", "team"] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number];
/** The ONLY engagement value this phase accepts. Classification is an authorized admin/legal decision. */
export const ENGAGEMENT_TYPES = ["pending_classification"] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];
export const OPPORTUNITY_TYPES = ["paid"] as const;
export const KNOWN_ENTITIES = [CANONICAL_ENTITY_ID, NONPROFIT_ENTITY_ID] as const;
export const ROLE_STATUSES = ["active", "inactive"] as const;

export type SourceFormat = "canonical_v1" | "legacy";
export type FormatDetection =
  | { format: SourceFormat; missing: []; extra: string[] }
  | { format: null; reason: string; missing_canonical: string[]; missing_legacy: string[] };

/**
 * Deterministic format detection by the COMPLETE required header set — never
 * by a single column. A file that satisfies both (or neither) is rejected.
 */
export function detectFormat(header: readonly string[]): FormatDetection {
  const have = new Set(header.map((h) => h.trim().toLowerCase()));
  const missing_canonical = CANONICAL_V1_COLUMNS.filter((c) => !have.has(c));
  const missing_legacy = LEGACY_REQUIRED_COLUMNS.filter((c) => !have.has(c));
  const canonical = missing_canonical.length === 0;
  const legacy = missing_legacy.length === 0;
  if (canonical && legacy) return { format: null, reason: "header satisfies both canonical_v1 and legacy — ambiguous", missing_canonical, missing_legacy };
  if (canonical) return { format: "canonical_v1", missing: [], extra: [...have].filter((h) => !(CANONICAL_V1_COLUMNS as readonly string[]).includes(h)).sort() };
  if (legacy) return { format: "legacy", missing: [], extra: [] };
  return { format: null, reason: "header matches neither canonical_v1 nor legacy", missing_canonical, missing_legacy };
}

export type ParsedSource = { header: string[]; rows: WorkbookRow[]; malformed: string[] };

/** CSV or JSON (array of row objects) → header + rows. JSON header = union of keys, sorted. */
export function parseSource(text: string, kind: "csv" | "json"): ParsedSource {
  if (kind === "csv") return parseCsvTable(text);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { header: [], rows: [], malformed: [`invalid JSON: ${(e as Error).message}`] };
  }
  const list = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { roles?: unknown }).roles) ? (data as { roles: unknown[] }).roles : null;
  if (!list) return { header: [], rows: [], malformed: ["JSON must be an array of role objects (or { roles: [...] })"] };
  const malformed: string[] = [];
  const rows: WorkbookRow[] = [];
  const keys = new Set<string>();
  list.forEach((r, i) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) return void malformed.push(`item ${i}: not an object`);
    const row: WorkbookRow = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
      const key = k.trim().toLowerCase();
      keys.add(key);
      row[key] = v == null ? "" : String(v).trim();
    }
    rows.push(row);
  });
  return { header: [...keys].sort(), rows, malformed };
}

export type SupervisorRef =
  | { kind: "role"; canonical_role_id: string; role_key: string; display_name: string }
  | { kind: "org_unit"; key: string; label: string }
  | null;

/** Internal model of one canonical role (every canonical column is kept). */
export type CanonicalRole = {
  canonical_role_id: string;
  role_key: string;
  display_name: string;
  legacy_display_name: string | null;
  aliases: string[];
  match: MatchClass;
  legacy_role_key: string | null;
  mapping_note: string;
  related: CanonicalMapEntry["related"] | null;
  department: string;
  department_key: string;
  workstream: string;
  entity_id: string;
  opportunity_type: string;
  engagement_type: string;
  baseline_headcount: number;
  headcount_model: HeadcountModel;
  event_applicability: string;
  event_applicability_key: string;
  seniority: Seniority;
  reports_to: string;
  reports_to_role: SupervisorRef;
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
  row: number;
};

export type Issue = { level: "error" | "warning"; code: string; row: number | null; canonical_role_id: string | null; message: string };

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normHeadcountModel = (v: string): HeadcountModel | null => {
  const k = slug(v);
  return (HEADCOUNT_MODELS as readonly string[]).includes(k) ? (k as HeadcountModel) : null;
};
const normSeniority = (v: string): Seniority | null => {
  const k = slug(v);
  return (SENIORITY_LEVELS as readonly string[]).includes(k) ? (k as Seniority) : null;
};

const V1 = new Map(AFTER_DARK_V1_ROLES.map((r) => [r.key, r]));

export type CanonicalResult = { roles: CanonicalRole[]; errors: Issue[]; warnings: Issue[] };

/**
 * Adapter + validator for canonical_v1 rows. Returns normalized roles (only
 * rows that passed every per-row check) plus all errors and warnings. `map` is
 * injectable so tests can prove duplicate / missing / cross-domain mappings
 * are rejected; production code always uses the reviewed CANONICAL_ROLE_MAP.
 */
export function adaptCanonicalRows(rows: WorkbookRow[], map: Record<string, CanonicalMapEntry> = CANONICAL_ROLE_MAP): CanonicalResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (code: string, row: number | null, id: string | null, message: string) => errors.push({ level: "error", code, row, canonical_role_id: id, message });
  const warn = (code: string, row: number | null, id: string | null, message: string) => warnings.push({ level: "warning", code, row, canonical_role_id: id, message });

  // ── Map integrity (deterministic, no duplicates, never into the nonprofit / external side) ──
  const byKey = new Map<string, string>();
  const byLegacy = new Map<string, string>();
  for (const [id, e] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
    if (!CANONICAL_ID_RE.test(id)) err("map_bad_id", null, id, `map entry "${id}" is not a canonical id`);
    if (byKey.has(e.role_key)) err("duplicate_mapping", null, id, `role_key "${e.role_key}" is mapped by both ${byKey.get(e.role_key)} and ${id}`);
    else byKey.set(e.role_key, id);
    if (e.legacy_key) {
      if (byLegacy.has(e.legacy_key)) err("duplicate_mapping", null, id, `legacy role "${e.legacy_key}" is claimed by both ${byLegacy.get(e.legacy_key)} and ${id}`);
      else byLegacy.set(e.legacy_key, id);
      if (e.legacy_key !== e.role_key) err("legacy_key_not_preserved", null, id, `${id} maps legacy "${e.legacy_key}" but uses role_key "${e.role_key}" — existing keys must be preserved`);
      const v1 = V1.get(e.legacy_key);
      if (!v1) err("map_unknown_legacy", null, id, `${id} maps to "${e.legacy_key}", which is not an existing role`);
      else if (v1.wf === "nonprofit_serve") err("nonprofit_conversion", null, id, `${id} would convert the Sanctuary LV nonprofit role "${e.legacy_key}" into a paid Group role`);
      else if (v1.wf === "venue_provider") err("external_conversion", null, id, `${id} would convert the venue/provider role "${e.legacy_key}" into Group personnel`);
      if (e.match === "new") err("map_class_conflict", null, id, `${id} is "new" but names legacy "${e.legacy_key}"`);
    } else if (e.match !== "new") err("map_class_conflict", null, id, `${id} is "${e.match}" but names no legacy role`);
    if (!e.legacy_key && V1.has(e.role_key) && !PLACEHOLDER_DISPOSITIONS[e.role_key]) err("duplicate_mapping", null, id, `${id} is "new" but its key "${e.role_key}" already exists — would duplicate or hijack an existing role`);
    if (PLACEHOLDER_DISPOSITIONS[e.role_key]) err("duplicate_mapping", null, id, `${id} key "${e.role_key}" is a ${PLACEHOLDER_DISPOSITIONS[e.role_key].class} role outside the paid Group taxonomy`);
  }

  // ── Per-row identity + fields ──
  const seenId = new Map<string, number>();
  const nameToId = new Map<string, string>();
  type Draft = { row: number; r: WorkbookRow; id: string; entry: CanonicalMapEntry };
  const drafts: Draft[] = [];
  rows.forEach((r, i) => {
    const row = i + 2; // header is line 1
    const id = (r.role_id ?? "").trim();
    if (!id) return err("missing_id", row, null, "role_id (canonical_role_id) is required");
    if (!CANONICAL_ID_RE.test(id)) return err("bad_id", row, id, `role_id "${id}" must match SLVG-EVT-###`);
    if (seenId.has(id)) return err("duplicate_id", row, id, `duplicate canonical role id (first on row ${seenId.get(id)})`);
    seenId.set(id, row);
    const entry = map[id];
    if (!entry) return err("unmapped_id", row, id, `${id} has no entry in the reviewed reconciliation map — identity is never guessed`);
    const name = (r.role_name ?? "").trim();
    if (!name) err("missing_field", row, id, "role_name is required");
    else if (nameToId.has(name)) err("duplicate_name", row, id, `role_name "${name}" is also used by ${nameToId.get(name)} — reports_to would be ambiguous`);
    else nameToId.set(name, id);
    drafts.push({ row, r, id, entry });
  });
  for (const id of Object.keys(map).sort()) if (!seenId.has(id)) err("missing_id", null, id, `${id} is in the reviewed map but missing from the file`);
  if (seenId.size !== CANONICAL_ROLE_COUNT) err("role_count", null, null, `expected ${CANONICAL_ROLE_COUNT} canonical roles, found ${seenId.size}`);

  const roles: CanonicalRole[] = [];
  for (const { row, r, id, entry } of drafts) {
    const before = errors.length;
    const req = (k: string) => {
      const v = (r[k] ?? "").trim();
      if (!v) err("missing_field", row, id, `${k} is required`);
      return v;
    };
    const entity = req("entity_id");
    if (entity && entity !== CANONICAL_ENTITY_ID) {
      if (entity === NONPROFIT_ENTITY_ID) err("nonprofit_conversion", row, id, `entity "${entity}" is the Sanctuary LV nonprofit — this taxonomy is Sanctuary LV Group only; refusing to convert`);
      else err("unknown_entity", row, id, `unknown entity "${entity}" (expected ${CANONICAL_ENTITY_ID})`);
    }
    const oppRaw = req("opportunity_type");
    const opp = oppRaw.toLowerCase();
    if (oppRaw && !(OPPORTUNITY_TYPES as readonly string[]).includes(opp)) {
      if (/volunteer|serve|unpaid/.test(opp)) err("nonprofit_conversion", row, id, `opportunity "${oppRaw}" would turn a paid Group role into a volunteer role`);
      else err("invalid_opportunity", row, id, `opportunity_type "${oppRaw}" must be Paid`);
    }
    const eng = req("engagement_type");
    if (eng && !(ENGAGEMENT_TYPES as readonly string[]).includes(eng))
      err("invalid_engagement", row, id, `engagement_type "${eng}" is not accepted — only pending_classification; worker classification is an authorized administrative/legal decision, never imported or inferred`);
    const hcRaw = req("baseline_headcount");
    const hc = Number(hcRaw);
    if (hcRaw && (!/^\d+$/.test(hcRaw) || !Number.isInteger(hc) || hc < 0)) err("invalid_headcount", row, id, `baseline_headcount "${hcRaw}" must be a non-negative integer`);
    const modelRaw = req("headcount_model");
    const model = normHeadcountModel(modelRaw);
    if (modelRaw && !model) err("invalid_headcount_model", row, id, `headcount_model "${modelRaw}" must be Required, Recommended, Scalable or Event-Specific`);
    const senRaw = req("seniority");
    const sen = normSeniority(senRaw);
    if (senRaw && !sen) err("invalid_seniority", row, id, `seniority "${senRaw}" must be one of ${SENIORITY_LEVELS.join(", ")}`);
    const dept = req("department");
    const deptKey = DEPARTMENT_KEYS[dept];
    if (dept && !deptKey) err("unknown_department", row, id, `department "${dept}" has no reviewed department key`);
    const status = req("status").toLowerCase();
    if (status && !(ROLE_STATUSES as readonly string[]).includes(status)) err("invalid_status", row, id, `status "${status}" must be active or inactive`);
    const applicability = req("event_applicability");
    const importVersion = req("import_version");
    const sourceSystem = req("source_system");
    if (sourceSystem && sourceSystem !== "sanctuary_staffing_workbook") warn("source_system", row, id, `unexpected source_system "${sourceSystem}"`);
    const workstream = req("workstream");
    const reportsTo = req("reports_to");
    const name = (r.role_name ?? "").trim();
    if (errors.length !== before || !model || !sen || !deptKey) continue;
    const v1 = entry.legacy_key ? V1.get(entry.legacy_key) : undefined;
    const legacyDisplay = v1 && v1.title !== name ? v1.title : null;
    roles.push({
      canonical_role_id: id,
      role_key: entry.role_key,
      display_name: name,
      legacy_display_name: legacyDisplay,
      aliases: legacyDisplay ? [legacyDisplay] : [],
      match: entry.match,
      legacy_role_key: entry.legacy_key,
      mapping_note: entry.note,
      related: entry.related ?? null,
      department: dept,
      department_key: deptKey,
      workstream,
      entity_id: entity,
      opportunity_type: opp,
      engagement_type: eng,
      baseline_headcount: hc,
      headcount_model: model,
      event_applicability: applicability,
      event_applicability_key: slug(applicability),
      seniority: sen,
      reports_to: reportsTo,
      reports_to_role: null,
      status,
      role_summary: (r.role_summary ?? "").trim(),
      pre_event_responsibilities: (r.pre_event ?? "").trim(),
      load_in_responsibilities: (r.load_in ?? "").trim(),
      live_event_responsibilities: (r.live_event ?? "").trim(),
      closeout_responsibilities: (r.closeout ?? "").trim(),
      dress_code: (r.dress_code ?? "").trim(),
      credential_level: (r.credential_level ?? "").trim(),
      training_requirements: (r.training_requirements ?? "").trim(),
      import_version: importVersion,
      source_system: sourceSystem,
      row,
    });
  }

  // ── Reporting lines: exact role_name match within the file, or an explicit org-unit alias ──
  const byName = new Map(roles.map((x) => [x.display_name, x]));
  for (const x of roles) {
    const org = SUPERVISOR_ORG_ALIASES[x.reports_to];
    const sup = byName.get(x.reports_to);
    if (org) x.reports_to_role = { kind: "org_unit", key: org, label: x.reports_to };
    else if (sup) x.reports_to_role = { kind: "role", canonical_role_id: sup.canonical_role_id, role_key: sup.role_key, display_name: sup.display_name };
    else err("unresolved_supervisor", x.row, x.canonical_role_id, `reports_to "${x.reports_to}" is not a role in this workbook or a reviewed org-unit alias`);
    if (sup && sup.canonical_role_id === x.canonical_role_id) err("supervisor_cycle", x.row, x.canonical_role_id, "role reports to itself");
  }
  // cycles through role→role edges
  const parent = new Map(roles.flatMap((x) => (x.reports_to_role?.kind === "role" ? [[x.canonical_role_id, x.reports_to_role.canonical_role_id] as const] : [])));
  for (const x of roles) {
    const seen = new Set<string>([x.canonical_role_id]);
    let cur = parent.get(x.canonical_role_id);
    while (cur) {
      if (seen.has(cur)) {
        if (cur === x.canonical_role_id) err("supervisor_cycle", x.row, x.canonical_role_id, "reporting chain loops back to this role");
        break;
      }
      seen.add(cur);
      cur = parent.get(cur);
    }
  }
  const unresolved = new Set(errors.filter((e) => e.code === "unresolved_supervisor" || e.code === "supervisor_cycle").map((e) => e.canonical_role_id));
  return { roles: roles.filter((x) => !unresolved.has(x.canonical_role_id)).sort((a, b) => a.canonical_role_id.localeCompare(b.canonical_role_id)), errors, warnings };
}
