/**
 * Phase 3 operational review of the 36-role canonical staffing taxonomy (pure, READ-ONLY).
 *
 * Derived entirely from the reviewed dry-run plan plus the committed After Dark
 * v1 seed and reconciliation map. It is returned NEXT TO the plan (never inside
 * it), so the plan and its Phase 2 baseline hash are unchanged by this review.
 *
 * Nothing here decides anything:
 *  - `runner` stays `unresolved`; its options are listed without a preference
 *    and `decision` is always null.
 *  - Credential and training rows are gap reports; nothing is granted or
 *    completed (`granted: false`, `completion_created: false`).
 *  - The approval checklist keeps AUTOMATED readiness evidence (computed here)
 *    strictly apart from HUMAN authorizations, whose status type is the single
 *    literal "pending" — no code path can mark a human authorization given, and
 *    `production_authorized` is the literal `false`.
 */
import { AFTER_DARK_V1_ROLES, PLANNING_TRAINING_MODULES, type PlanningRole } from "./after-dark-v1";
import { CANONICAL_ENTITY_ID, NONPROFIT_ENTITY_ID } from "./canonical";
import type { CredentialToken } from "./credentials";
import type { Integrity } from "./integrity";
import type { ImportPlan } from "./plan";
import { CANONICAL_ROLE_MAP, PLACEHOLDER_DISPOSITIONS, PUBLIC_ROLE_RENAMES } from "./role-map";
import type { VNextChange } from "./vnext";

export const REVIEW_FORMAT = 1 as const;
export const RUNNER_ROLE_KEY = "runner";

// ── Role review (36 roles / 66 seats) ───────────────────────────────────────
export type RoleReviewRow = {
  seq: number;
  canonical_role_id: string;
  role_key: string;
  display_name: string;
  department_key: string;
  seniority: string;
  headcount_model: string;
  baseline_headcount: number;
  entity_id: string;
  engagement_type: string;
  match: string;
  legacy_role_key: string | null;
  legacy_title: string | null;
  v1_count: number | null;
  reports_to_resolved: string | null;
  supervisor_change: { from: string | null; to: string | null } | null;
  credential_status: "mapped" | "partial" | "unresolved";
  training_status: "mapped" | "partial" | "unresolved";
  vnext_change: VNextChange | null;
  vnext_count: number | null;
  related: { key: string; relation: string } | null;
  flags: string[];
};

export type SeatGroup = { key: string; roles: number; seats: number };

// ── Runner decision record ──────────────────────────────────────────────────
export type RunnerOption = { key: string; label: string; effect: string; requires: string[] };
export type RunnerDecision = {
  role_key: typeof RUNNER_ROLE_KEY;
  classification: "unresolved";
  status: "awaiting_human_decision";
  decision: null;
  decided_by: null;
  decided_at: null;
  decision_owner: string;
  question: string;
  current: {
    v1_title: string | null;
    v1_count: number | null;
    v1_supervisor: string | null;
    v1_zones: string[];
    v1_workforce: string | null;
    disposition_reason: string | null;
    vnext_change: VNextChange | null;
    vnext_count: number | null;
  };
  related_canonical: { canonical_role_id: string; role_key: string; display_name: string; baseline_headcount: number; relation: string; note: string } | null;
  options: RunnerOption[];
  preserved: string[];
  note: string;
};

// ── Credential / training reviews ───────────────────────────────────────────
export type CredentialReviewRow = {
  canonical_role_id: string;
  role_key: string;
  display_name: string;
  status: "partial" | "unresolved";
  source_text: string;
  tokens: CredentialToken[];
  zone_tokens: string[];
  descriptor_tokens: string[];
  conditional_tokens: string[];
  unknown_tokens: string[];
  proposed_zones: string[];
  v1_zones: string[] | null;
  gaps: string[];
  decision_needed: string[];
  granted: false;
};

export type TrainingReviewRow = {
  canonical_role_id: string;
  role_key: string;
  display_name: string;
  status: "partial" | "unresolved";
  source_text: string;
  matched: { phrase: string; module_key: string }[];
  unresolved_phrases: string[];
  module_keys: string[];
  v1_modules: string[] | null;
  decision_needed: string;
  completion_created: false;
};

// ── Template comparison (After Dark v1 → vNext) ─────────────────────────────
export type ComparisonRow = {
  role_key: string;
  title: string;
  canonical_role_id: string | null;
  workforce: string;
  v1_count: number | null;
  vnext_count: number | null;
  delta: number;
  change: VNextChange;
  counted: boolean;
};
export type TemplateComparison = {
  v1_label: string;
  vnext_label: string;
  status: "preview_only";
  rows: ComparisonRow[];
  totals: { v1: number; vnext: number; delta: number };
  bridge: { key: string; label: string; seats: number; roles: string[] }[];
  bridge_balances: boolean;
  by_workforce: { workforce: string; v1: number; vnext: number }[];
  counts: Record<VNextChange, number>;
  not_enabled: { role_key: string; title: string; baseline_headcount: number }[];
  not_enabled_seats: number;
  venue_allowances: { role_key: string; title: string; count: number | null }[];
  notes: string[];
};

// ── Approval checklist ──────────────────────────────────────────────────────
export type EvidenceStatus = "pass" | "fail" | "not_available";
export type AutomatedEvidence = { key: string; label: string; status: EvidenceStatus; evidence: string };
export type RecordedEvidence = { key: string; label: string; command: string; reference: string };
/** The ONLY status a human authorization can have in code. Sign-off is recorded outside the app. */
export type HumanAuthorizationStatus = "pending";
export type HumanAuthorization = { key: string; label: string; owner: string; scope: string; status: HumanAuthorizationStatus; authorized_by: null; authorized_at: null };
export type ApprovalChecklist = {
  production_authorized: false;
  summary: string;
  automated: AutomatedEvidence[];
  automated_ok: boolean;
  recorded: RecordedEvidence[];
  human: HumanAuthorization[];
  sign_off_location: string;
};

export type LiveFacts = {
  /** Rows in ops_canonical_roles; null when the table does not exist (migration 0002 not applied). */
  stored_canonical_roles: number | null;
  /** After Dark template versions on this database; null when it could not be read. */
  after_dark_versions: { version: number; status: string }[] | null;
};

export type TaxonomyReview = {
  review_format: typeof REVIEW_FORMAT;
  read_only: true;
  role_review: {
    rows: RoleReviewRow[];
    totals: { roles: number; seats: number; plan_roles: number; plan_seats: number; balances: boolean };
    by_model: SeatGroup[];
    by_department: SeatGroup[];
    by_match: SeatGroup[];
  };
  runner_decision: RunnerDecision;
  credential_review: { rows: CredentialReviewRow[]; counts: Record<"mapped" | "partial" | "unresolved", number>; covers_all_gaps: boolean };
  training_review: {
    rows: TrainingReviewRow[];
    counts: Record<"mapped" | "partial" | "unresolved", number>;
    covers_all_gaps: boolean;
    unresolved_phrase_index: { phrase: string; roles: string[] }[];
    known_modules: string[];
  };
  template_comparison: TemplateComparison | null;
  separation: {
    group_entity: string;
    nonprofit_entity: string;
    canonical_entities: string[];
    nonprofit_roles_in_taxonomy: number;
    excluded_nonprofit_roles: string[];
    serve_team_identity: string;
  };
  approval_checklist: ApprovalChecklist;
};

const v1ByKey = new Map<string, PlanningRole>(AFTER_DARK_V1_ROLES.map((r) => [r.key, r]));
const group = <T,>(xs: T[], key: (x: T) => string, seats: (x: T) => number): SeatGroup[] => {
  const m = new Map<string, SeatGroup>();
  for (const x of xs) {
    const k = key(x);
    const g = m.get(k) ?? { key: k, roles: 0, seats: 0 };
    g.roles++;
    g.seats += seats(x);
    m.set(k, g);
  }
  return [...m.values()];
};

function buildRunnerDecision(plan: ImportPlan): RunnerDecision {
  const v1 = v1ByKey.get(RUNNER_ROLE_KEY);
  const disp = PLACEHOLDER_DISPOSITIONS[RUNNER_ROLE_KEY];
  const row = plan.after_dark_vnext?.rows.find((r) => r.role_key === RUNNER_ROLE_KEY) ?? null;
  const relEntry = Object.entries(CANONICAL_ROLE_MAP).find(([, e]) => e.related?.key === RUNNER_ROLE_KEY);
  const relRole = relEntry ? plan.canonical_roles.roles.find((r) => r.canonical_role_id === relEntry[0]) : undefined;
  return {
    role_key: RUNNER_ROLE_KEY,
    classification: "unresolved",
    status: "awaiting_human_decision",
    decision: null,
    decided_by: null,
    decided_at: null,
    decision_owner: "Sanctuary LV Group event leadership (Event Director / Event Operations Manager)",
    question: "How should the existing After Dark v1 role `runner` (2 seats) relate to the 36-role canonical taxonomy?",
    current: {
      v1_title: v1?.title ?? null,
      v1_count: v1?.n ?? null,
      v1_supervisor: v1?.sup ?? null,
      v1_zones: v1?.zones ?? [],
      v1_workforce: v1?.wf ?? null,
      disposition_reason: disp?.reason ?? null,
      vnext_change: row?.change ?? null,
      vnext_count: row?.proposed_count ?? null,
    },
    related_canonical:
      relEntry && relRole
        ? { canonical_role_id: relEntry[0], role_key: relRole.role_key, display_name: relRole.display_name, baseline_headcount: relRole.baseline_headcount, relation: relEntry[1].related!.relation, note: relEntry[1].note }
        : null,
    // Listed in a fixed order for reference. The order is NOT a ranking and no option is preferred.
    options: [
      {
        key: "keep_outside_taxonomy",
        label: "Keep `runner` as an existing role outside the canonical taxonomy",
        effect: "v1 and vNext keep 2 Runner seats as today; the disposition changes from unresolved to a documented class.",
        requires: ["Reviewed edit to PLACEHOLDER_DISPOSITIONS", "New reviewed plan_hash (baseline re-review)"],
      },
      {
        key: "map_to_setup_breakdown_crew",
        label: "Map `runner` onto Setup / Breakdown Crew (SLVG-EVT-033)",
        effect: "SLVG-EVT-033 would continue the Runner seat (match class changes from new); stable role_key and the 2 → 6 seat change must be decided.",
        requires: ["Reviewed edit to CANONICAL_ROLE_MAP", "Decision on which role_key existing records keep", "New reviewed plan_hash", "vNext seat totals re-reviewed"],
      },
      {
        key: "add_canonical_role",
        label: "Add Runner as its own canonical role in the workbook",
        effect: "The workbook gains a 37th role; the source bytes change.",
        requires: ["Workbook revision", "New reviewed source sha256 and plan_hash", "Full reconciliation re-review"],
      },
      {
        key: "retire_from_future_templates",
        label: "Retire `runner` from future templates only",
        effect: "v1 and all historical records keep Runner; a future template version would drop 2 seats (change: removed).",
        requires: ["Reviewed vNext rule change", "New reviewed plan_hash", "Template approval in a separate phase"],
      },
    ],
    preserved: [
      "`runner` is not mapped by any canonical role in the reviewed map.",
      "After Dark v1 Runner seats (2, supervisor ops_lead, zone back_of_house) are unchanged.",
      "vNext carries Runner forward unchanged (2 → 2); its seats are not added to Setup / Breakdown Crew (baseline 6).",
      "Existing template roles, assignments and event overrides that reference `runner` are never written by this phase or by the importer.",
    ],
    note: "No option is selected or recommended. The system does not infer a classification; a documented human decision is required.",
  };
}

function credentialDecision(c: { unknown: string[]; conditional: string[]; descriptor: string[]; zones: string[]; status: string }, v1Zones: string[] | null): string[] {
  const out: string[] = [];
  for (const t of c.conditional) out.push(`Decide when "${t}" applies (per event or never) — conditional access is never auto-granted.`);
  for (const t of c.unknown) out.push(`Add a reviewed zone mapping for "${t}", or confirm it grants no zone.`);
  if (c.status === "unresolved" && !c.unknown.length && !c.conditional.length)
    out.push(`Choose the access zone(s) for descriptor-only credential "${c.descriptor.join(" / ")}", or confirm it grants none.`);
  if (v1Zones) out.push(`Current After Dark v1 zones for this seat: ${v1Zones.join(", ") || "none"} (unchanged by this review).`);
  return out;
}

function buildComparison(plan: ImportPlan): TemplateComparison | null {
  const vn = plan.after_dark_vnext;
  if (!vn) return null;
  const rows: ComparisonRow[] = vn.rows.map((r) => {
    const counted = r.workforce !== "venue_provider";
    return {
      role_key: r.role_key,
      title: r.canonical_display_name ?? r.existing_title ?? r.role_key,
      canonical_role_id: r.canonical_role_id,
      workforce: r.workforce,
      v1_count: r.old_count,
      vnext_count: r.proposed_count,
      delta: counted ? (r.proposed_count ?? 0) - (r.old_count ?? 0) : 0,
      change: r.change,
      counted,
    };
  });
  const counted = rows.filter((r) => r.counted);
  const sum = (xs: ComparisonRow[], f: (r: ComparisonRow) => number | null) => xs.reduce((a, r) => a + (f(r) ?? 0), 0);
  const v1 = sum(counted, (r) => r.v1_count);
  const vnext = sum(counted, (r) => r.vnext_count);
  const continuing = counted.filter((r) => r.canonical_role_id && r.v1_count !== null && r.delta !== 0);
  const added = counted.filter((r) => r.change === "new");
  const bridge = [
    { key: "v1", label: `After Dark v${vn.based_on_version} Sanctuary-side seats`, seats: v1, roles: [] as string[] },
    { key: "continuing_count_changes", label: "Count changes on continuing seats (canonical baseline)", seats: sum(continuing, (r) => r.delta), roles: continuing.map((r) => `${r.role_key} ${r.v1_count}→${r.vnext_count}`) },
    { key: "new_enabled_roles", label: "New canonical roles enabled for After Dark", seats: sum(added, (r) => r.vnext_count), roles: added.map((r) => `${r.role_key} +${r.vnext_count}`) },
    { key: "carried_forward", label: "Roles outside the taxonomy carried forward unchanged", seats: 0, roles: counted.filter((r) => r.change === "carried_forward").map((r) => r.role_key) },
    { key: "removed", label: "Seats removed", seats: 0, roles: counted.filter((r) => r.change === "removed").map((r) => r.role_key) },
  ];
  const bridgeTotal = bridge.reduce((a, b) => a + b.seats, 0);
  const wfs = [...new Set(counted.map((r) => r.workforce))];
  const v1Wf = (wf: string) =>
    AFTER_DARK_V1_ROLES.filter((r) => r.wf !== "venue_provider" && (rows.find((x) => x.role_key === r.key)?.workforce ?? r.wf) === wf).reduce((a, r) => a + (r.n ?? 0), 0);
  const notEnabled = plan.canonical_roles.roles.filter((r) => vn.rows.some((x) => x.role_key === r.role_key && x.change === "not_enabled"));
  return {
    v1_label: `After Dark v${vn.based_on_version} (published, active)`,
    vnext_label: vn.proposed_version_label,
    status: "preview_only",
    rows,
    totals: { v1, vnext, delta: vnext - v1 },
    bridge,
    bridge_balances: bridgeTotal === vnext,
    // v1 seats are attributed to the workforce of the row that carries them in vNext (continuing seats become paid_group).
    by_workforce: wfs.map((wf) => ({ workforce: wf, v1: v1Wf(wf), vnext: sum(counted.filter((r) => r.workforce === wf), (r) => r.vnext_count) })),
    counts: vn.counts,
    not_enabled: notEnabled.map((r) => ({ role_key: r.role_key, title: r.display_name, baseline_headcount: r.baseline_headcount })),
    not_enabled_seats: notEnabled.reduce((a, r) => a + r.baseline_headcount, 0),
    venue_allowances: rows.filter((r) => !r.counted).map((r) => ({ role_key: r.role_key, title: r.title, count: r.v1_count })),
    notes: [
      "Preview only: After Dark v1 stays the published, active template. No template version is created or activated.",
      "Template counts are planning baselines — not assignments, hiring targets or per-event minimums. Event plans keep their own overrides.",
      "The vNext total includes seats carried forward from v1 that are NOT Group personnel: 1 Sanctuary LV nonprofit Serve Team coordinator seat (serve_coordinator), founder seats and unclassified content / music / ministry seats.",
      "Venue / provider allowances stay under venue authority and are not counted.",
    ],
  };
}

const RECORDED: RecordedEvidence[] = [
  { key: "typecheck", label: "Typecheck (scripts, app, node configs)", command: "bunx tsc -p tsconfig.{scripts,app,node}.json --noEmit", reference: "docs/PRODUCTION_APPROVAL_PACKAGE_V3.md §5" },
  { key: "lint", label: "Lint", command: "bun run lint", reference: "docs/PRODUCTION_APPROVAL_PACKAGE_V3.md §5" },
  { key: "unit", label: "Unit tests (incl. taxonomy + review)", command: "bun test tests/", reference: "docs/PRODUCTION_APPROVAL_PACKAGE_V3.md §5" },
  { key: "integration", label: "Integration suites on fresh disposable databases", command: "bun tests/integration/<suite>.ts", reference: "docs/PRODUCTION_APPROVAL_PACKAGE_V3.md §5" },
  { key: "browser", label: "Browser suites incl. branding regression and this page", command: "python3 tests/browser/<suite>.py", reference: "docs/PRODUCTION_APPROVAL_PACKAGE_V3.md §5" },
  { key: "migration", label: "Migration 0002 + importer rehearsal on a disposable copy", command: "bash tests/migration/check.sh <snapshot-copy>", reference: "docs/PRODUCTION_APPROVAL_PACKAGE_V3.md §6" },
  { key: "recovery", label: "Recovery procedures rehearsed on a disposable copy", command: "bash tests/migration/recovery.sh <legacy-snapshot.db> <pre-0002.db>", reference: "docs/PRODUCTION_APPROVAL_PACKAGE_V3.md §7" },
  { key: "build", label: "Production build", command: "bunx turbo build --force", reference: "docs/PRODUCTION_APPROVAL_PACKAGE_V3.md §5" },
];

const human = (key: string, label: string, owner: string, scope: string): HumanAuthorization => ({ key, label, owner, scope, status: "pending", authorized_by: null, authorized_at: null });

export function buildTaxonomyReview(plan: ImportPlan, integrity: Integrity, live: LiveFacts): TaxonomyReview {
  const cr = plan.canonical_roles.roles;
  const cred = new Map(plan.credential_mappings.map((c) => [c.canonical_role_id, c]));
  const train = new Map(plan.training_mappings.map((t) => [t.canonical_role_id, t]));
  const sup = new Map(plan.supervisor_changes.map((s) => [s.canonical_role_id, s]));
  const vrow = new Map((plan.after_dark_vnext?.rows ?? []).map((r) => [r.role_key, r]));

  const rows: RoleReviewRow[] = cr.map((r, i) => {
    const c = cred.get(r.canonical_role_id)!;
    const t = train.get(r.canonical_role_id)!;
    const s = sup.get(r.canonical_role_id);
    const v = vrow.get(r.role_key);
    const related = CANONICAL_ROLE_MAP[r.canonical_role_id]?.related ?? null;
    const flags: string[] = [];
    if (c.status !== "mapped") flags.push(`credential ${c.status}`);
    if (t.status !== "mapped") flags.push(`training ${t.status}`);
    if (s) flags.push("supervisor change");
    if (r.engagement_type === "pending_classification") flags.push("engagement pending classification");
    if (related?.relation === "may_absorb_unresolved") flags.push(`related to unresolved role "${related.key}" — human decision`);
    if (v?.change === "not_enabled") flags.push("not enabled for After Dark vNext");
    return {
      seq: i + 1,
      canonical_role_id: r.canonical_role_id,
      role_key: r.role_key,
      display_name: r.display_name,
      department_key: r.department_key,
      seniority: r.seniority,
      headcount_model: r.headcount_model,
      baseline_headcount: r.baseline_headcount,
      entity_id: plan.entity_id,
      engagement_type: r.engagement_type,
      match: r.match,
      legacy_role_key: r.legacy_role_key,
      legacy_title: r.legacy_role_key ? (v1ByKey.get(r.legacy_role_key)?.title ?? null) : null,
      v1_count: r.legacy_role_key ? (v1ByKey.get(r.legacy_role_key)?.n ?? null) : null,
      reports_to_resolved: r.reports_to_resolved,
      supervisor_change: s ? { from: s.from, to: s.to } : null,
      credential_status: c.status,
      training_status: t.status,
      vnext_change: v?.change ?? null,
      vnext_count: v?.proposed_count ?? null,
      related,
      flags,
    };
  });
  const seats = rows.reduce((a, r) => a + r.baseline_headcount, 0);

  const credRows: CredentialReviewRow[] = plan.credential_mappings
    .filter((c) => c.status !== "mapped")
    .map((c) => {
      const role = cr.find((r) => r.canonical_role_id === c.canonical_role_id)!;
      const kind = (k: CredentialToken["kind"]) => c.tokens.filter((t) => t.kind === k).map((t) => t.token);
      const v1Zones = role.legacy_role_key ? (v1ByKey.get(role.legacy_role_key)?.zones ?? []) : null;
      const parts = { unknown: kind("unknown"), conditional: kind("conditional"), descriptor: kind("descriptor"), zones: kind("zone"), status: c.status };
      return {
        canonical_role_id: c.canonical_role_id,
        role_key: c.role_key,
        display_name: role.display_name,
        status: c.status as "partial" | "unresolved",
        source_text: c.source_text,
        tokens: c.tokens,
        zone_tokens: parts.zones,
        descriptor_tokens: parts.descriptor,
        conditional_tokens: parts.conditional,
        unknown_tokens: parts.unknown,
        proposed_zones: c.proposed_zones,
        v1_zones: v1Zones,
        gaps: c.gaps,
        decision_needed: credentialDecision(parts, v1Zones),
        granted: false,
      };
    });

  const trainRows: TrainingReviewRow[] = plan.training_mappings
    .filter((t) => t.status !== "mapped")
    .map((t) => {
      const role = cr.find((r) => r.canonical_role_id === t.canonical_role_id)!;
      return {
        canonical_role_id: t.canonical_role_id,
        role_key: t.role_key,
        display_name: role.display_name,
        status: t.status as "partial" | "unresolved",
        source_text: t.source_text,
        matched: t.phrases.flatMap((p) => (p.module_key ? [{ phrase: p.text, module_key: p.module_key }] : [])),
        unresolved_phrases: t.unresolved,
        module_keys: t.module_keys,
        v1_modules: role.legacy_role_key ? (v1ByKey.get(role.legacy_role_key)?.training ?? []) : null,
        decision_needed:
          t.status === "unresolved"
            ? "No requirement maps to an existing module — approve new module(s), map phrases to existing modules, or accept as unresolved."
            : `Map or approve module(s) for: ${t.unresolved.join("; ")} — or accept as unresolved.`,
        completion_created: false,
      };
    });
  const phraseIdx = new Map<string, Set<string>>();
  for (const t of trainRows) for (const p of t.unresolved_phrases) (phraseIdx.get(p.toLowerCase()) ?? phraseIdx.set(p.toLowerCase(), new Set()).get(p.toLowerCase())!).add(t.role_key);
  const unresolved_phrase_index = [...phraseIdx.entries()]
    .map(([phrase, roles]) => ({ phrase, roles: [...roles].sort() }))
    .sort((a, b) => b.roles.length - a.roles.length || a.phrase.localeCompare(b.phrase));

  const tally = <T extends { status: "mapped" | "partial" | "unresolved" }>(xs: T[]) => ({
    mapped: xs.filter((x) => x.status === "mapped").length,
    partial: xs.filter((x) => x.status === "partial").length,
    unresolved: xs.filter((x) => x.status === "unresolved").length,
  });
  const credCounts = tally(plan.credential_mappings);
  const trainCounts = tally(plan.training_mappings);
  const comparison = buildComparison(plan);
  const runner = buildRunnerDecision(plan);

  const entities = [...new Set(rows.map((r) => r.entity_id))];
  const nonprofitExcluded = Object.entries(PLACEHOLDER_DISPOSITIONS)
    .filter(([, d]) => d.domain === "sanctuary_lv_nonprofit")
    .map(([k]) => k);
  const nonprofitInTaxonomy = rows.filter((r) => r.entity_id === NONPROFIT_ENTITY_ID || nonprofitExcluded.includes(r.role_key) || nonprofitExcluded.includes(r.legacy_role_key ?? "")).length;

  // ── automated readiness evidence (computed now; never implies authorization) ──
  const ev = (key: string, label: string, ok: boolean | null, evidence: string): AutomatedEvidence => ({ key, label, status: ok === null ? "not_available" : ok ? "pass" : "fail", evidence });
  const [srcCheck, planCheck] = integrity.checks;
  const runnerMapped = Object.values(CANONICAL_ROLE_MAP).some((e) => e.legacy_key === RUNNER_ROLE_KEY || e.role_key === RUNNER_ROLE_KEY);
  const runnerRow = plan.after_dark_vnext?.rows.find((r) => r.role_key === RUNNER_ROLE_KEY);
  const runnerOk = PLACEHOLDER_DISPOSITIONS[RUNNER_ROLE_KEY]?.class === "unresolved" && !runnerMapped && runnerRow?.change === "carried_forward" && runnerRow.old_count === runnerRow.proposed_count && runner.decision === null;
  const tablesOk = JSON.stringify(plan.proposed_writes.tables_written_on_apply) === JSON.stringify(["ops_canonical_roles"]) && plan.proposed_writes.applied === false;
  const versions = live.after_dark_versions;
  const automated: AutomatedEvidence[] = [
    ev("source_hash", srcCheck!.label, srcCheck!.match, `expected ${srcCheck!.expected} · actual ${srcCheck!.actual ?? "none"}`),
    ev("plan_hash", planCheck!.label, planCheck!.match, `expected ${planCheck!.expected} · actual ${planCheck!.actual ?? "none"}`),
    ev("plan_valid", "Plan validates with zero errors", plan.ok && plan.errors.length === 0, `${plan.errors.length} errors · ${plan.warnings.length} warnings (reviewed gaps)`),
    ev("roles_seats", "36 canonical roles / 66 baseline seats", rows.length === 36 && seats === 66 && seats === plan.headcount.canonical_baseline_total, `${rows.length} roles · ${seats} seats`),
    ev("runner_unresolved", "`runner` remains unresolved and unchanged", runnerOk, `disposition ${PLACEHOLDER_DISPOSITIONS[RUNNER_ROLE_KEY]?.class} · mapped ${runnerMapped} · vNext ${runnerRow?.old_count}→${runnerRow?.proposed_count} (${runnerRow?.change}) · decision null`),
    ev(
      "nonprofit_separation",
      "Sanctuary LV nonprofit Serve Team kept out of the paid Group taxonomy",
      entities.length === 1 && entities[0] === CANONICAL_ENTITY_ID && nonprofitInTaxonomy === 0 && nonprofitExcluded.includes("serve_coordinator"),
      `canonical entities ${entities.join(", ")} · nonprofit roles in taxonomy ${nonprofitInTaxonomy} · excluded ${nonprofitExcluded.join(", ")}`,
    ),
    ev("write_scope", "An approved import could write only ops_canonical_roles", tablesOk, `tables_written_on_apply ${plan.proposed_writes.tables_written_on_apply.join(", ")} · applied ${plan.proposed_writes.applied}`),
    ev("credential_coverage", "Every partial / unresolved credential mapping is in the review (none granted)", credRows.length === credCounts.partial + credCounts.unresolved && credRows.every((c) => c.granted === false), `${credRows.length} reviewed · partial ${credCounts.partial} · unresolved ${credCounts.unresolved}`),
    ev("training_coverage", "Every partial / unresolved training mapping is in the review (none completed)", trainRows.length === trainCounts.partial + trainCounts.unresolved && trainRows.every((t) => t.completion_created === false), `${trainRows.length} reviewed · partial ${trainCounts.partial} · unresolved ${trainCounts.unresolved}`),
    ev("template_bridge", "After Dark v1 → vNext seat bridge balances (preview only)", comparison ? comparison.bridge_balances && comparison.status === "preview_only" : null, comparison ? `${comparison.totals.v1} → ${comparison.totals.vnext} (Δ ${comparison.totals.delta})` : "no vNext preview"),
    ev("nothing_imported", "Nothing imported on this database", live.stored_canonical_roles === null || live.stored_canonical_roles === 0, live.stored_canonical_roles === null ? "ops_canonical_roles not present (migration 0002 not applied here)" : `ops_canonical_roles rows: ${live.stored_canonical_roles}`),
    ev(
      "no_template_activation",
      "No After Dark vNext template version exists on this database",
      versions === null ? null : versions.every((v) => v.version <= 1),
      versions === null ? "template versions not readable on this database" : versions.length ? versions.map((v) => `v${v.version} ${v.status}`).join(", ") : "no After Dark template seeded here",
    ),
  ];

  const humanAuth: HumanAuthorization[] = [
    human("runner_decision", "Runner classification decision", runner.decision_owner, "Choose one documented option for `runner`; re-baseline hashes if the map changes."),
    human("credential_mappings", `Credential mappings (${credCounts.partial} partial · ${credCounts.unresolved} unresolved)`, "Event Operations Manager with Access Control / Credential Lead", "Approve, edit or reject each zone proposal. Approval grants nothing by itself."),
    human("training_mappings", `Training mappings (${trainCounts.partial} partial · ${trainCounts.unresolved} unresolved)`, "Training owner (Guest Experience / Event Operations)", "Approve module mappings or new modules. Never marks anyone trained."),
    human("engagement_classification", "Engagement classification for all 36 roles (pending_classification)", "Sanctuary LV Group leadership with HR / legal", "Employee / contractor / other — outside this system's authority."),
    human("vnext_template", "After Dark vNext staffing template (51 → 72 seats; 9 roles not enabled)", "Event Director", "Approve the proposal only. Creating / activating a template version is a separate phase."),
    human("public_rename", `Public apply label rename (${PUBLIC_ROLE_RENAMES.map((r) => `${r.current_label} → ${r.canonical_label}`).join(", ")})`, "Sanctuary LV Group leadership", "Prepared, not applied."),
    human("backup_restore", "Production backup taken and recovery path accepted, incl. unverified rollback assumptions", "Platform owner", "See docs/PRODUCTION_APPROVAL_PACKAGE_V3.md §7."),
    human("production_migration", "Production migration 0002", "Platform owner", "Schema only — creates ops_canonical_roles and 5 nullable/defaulted columns."),
    human("production_import", "Production import of 36 canonical roles", "Platform owner + Event Director", "Writes ops_canonical_roles only."),
    human("release", "GitHub push, PR #1 merge and deployment", "Repository owner", "No push, merge or deploy is authorized in Phase 3."),
  ];

  return {
    review_format: REVIEW_FORMAT,
    read_only: true,
    role_review: {
      rows,
      totals: { roles: rows.length, seats, plan_roles: plan.canonical_roles.total, plan_seats: plan.headcount.canonical_baseline_total, balances: rows.length === plan.canonical_roles.total && seats === plan.headcount.canonical_baseline_total },
      by_model: group(rows, (r) => r.headcount_model, (r) => r.baseline_headcount),
      by_department: group(rows, (r) => r.department_key, (r) => r.baseline_headcount),
      by_match: group(rows, (r) => r.match, (r) => r.baseline_headcount),
    },
    runner_decision: runner,
    credential_review: { rows: credRows, counts: credCounts, covers_all_gaps: credRows.length === credCounts.partial + credCounts.unresolved },
    training_review: {
      rows: trainRows,
      counts: trainCounts,
      covers_all_gaps: trainRows.length === trainCounts.partial + trainCounts.unresolved,
      unresolved_phrase_index,
      known_modules: PLANNING_TRAINING_MODULES.map((m) => m.key),
    },
    template_comparison: comparison,
    separation: {
      group_entity: CANONICAL_ENTITY_ID,
      nonprofit_entity: NONPROFIT_ENTITY_ID,
      canonical_entities: entities,
      nonprofit_roles_in_taxonomy: nonprofitInTaxonomy,
      excluded_nonprofit_roles: nonprofitExcluded,
      serve_team_identity: "Sanctuary LV (nonprofit) Serve Team — volunteer pathway at /serve; unchanged and outside this taxonomy.",
    },
    approval_checklist: {
      production_authorized: false,
      summary: "Automated evidence shows readiness for review only. It is not authorization. Every human authorization below is pending and cannot be granted from this page.",
      automated,
      automated_ok: automated.every((a) => a.status !== "fail"),
      recorded: RECORDED,
      human: humanAuth,
      sign_off_location: "docs/PRODUCTION_APPROVAL_PACKAGE_V3.md §9 (signed outside the application)",
    },
  };
}
