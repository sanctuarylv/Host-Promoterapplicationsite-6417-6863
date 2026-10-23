/**
 * "After Dark — Proposed Staffing Template vNext" (pure, PREVIEW ONLY).
 *
 *   master taxonomy (36 canonical roles)  ─▶  staffing template (this proposal)  ─▶  event plan (per event)
 *
 * This builds a diff between the published After Dark v1 template and a
 * proposed vNext derived from the canonical taxonomy. It never writes a
 * template version, never activates anything and never replaces v1. Event
 * plans keep their own counts (ops_event_role_overrides); a template count is a
 * planning baseline, not an assignment.
 *
 * Rules (reviewed assumptions — docs/STAFFING_TAXONOMY_V2.md §9):
 *  - A canonical role continuing an existing v1 seat stays enabled (the
 *    template already staffs it); its proposed count is the canonical baseline.
 *  - A NEW Required / Recommended / Scalable role is enabled only when its
 *    event_applicability is in the After Dark applicability profile.
 *  - A NEW Event-Specific role is OFF by default, whatever its applicability.
 *  - Every v1 role the workbook does not cover (19) is carried forward
 *    unchanged with its disposition — nothing is removed.
 */
import { AFTER_DARK_V1_ROLES, type PlanningRole } from "./after-dark-v1";
import type { CanonicalRole, HeadcountModel } from "./canonical";
import { PLACEHOLDER_DISPOSITIONS, type DispositionClass } from "./role-map";

export const AFTER_DARK_TEMPLATE_KEY = "after_dark";
export const AFTER_DARK_CURRENT_VERSION = 1;

/** Event-applicability labels that describe After Dark (reviewed assumption, staff-editable later). */
export const AFTER_DARK_APPLICABILITY: readonly string[] = [
  "All Events",
  "Public Events",
  "Programmed Events",
  "Venue-Based Events",
  "Ticketed/Registered Events",
  "Growth Events",
  "Music/Programmed Events",
  "Credentialed Events",
  "Load-In Events",
];

export type VNextChange = "new" | "changed" | "unchanged" | "carried_forward" | "not_enabled" | "removed";
export type VNextRow = {
  role_key: string;
  existing_role_key: string | null;
  existing_title: string | null;
  canonical_role_id: string | null;
  canonical_display_name: string | null;
  workforce: PlanningRole["wf"] | "paid_group";
  headcount_model: HeadcountModel | null;
  old_count: number | null;
  proposed_count: number | null;
  old_supervisor: string | null;
  proposed_supervisor: string | null;
  reporting_change: boolean;
  enabled: boolean;
  required: boolean;
  change: VNextChange;
  disposition: DispositionClass | null;
  reason: string;
};

export type VNextPreview = {
  title: string;
  status: "preview_only";
  template_key: string;
  based_on_version: number;
  proposed_version_label: string;
  applicability_profile: readonly string[];
  rows: VNextRow[];
  totals: {
    v1_sanctuary_seats: number;
    proposed_group_seats: number;
    carried_forward_sanctuary_seats: number;
    proposed_sanctuary_seats: number;
    venue_allowances_unchanged: number;
    not_enabled_baseline_seats: number;
  };
  counts: Record<VNextChange, number>;
};

const sanctuarySide = (r: PlanningRole) => r.wf !== "venue_provider";

export function buildAfterDarkVNext(roles: CanonicalRole[], v1: PlanningRole[] = AFTER_DARK_V1_ROLES, profile: readonly string[] = AFTER_DARK_APPLICABILITY): VNextPreview {
  const byKey = new Map(v1.map((r) => [r.key, r]));
  const supKey = (c: CanonicalRole) => (c.reports_to_role?.kind === "role" ? c.reports_to_role.role_key : c.reports_to_role?.kind === "org_unit" ? c.reports_to_role.key : null);
  const rows: VNextRow[] = [];

  for (const c of roles) {
    const old = c.legacy_role_key ? byKey.get(c.legacy_role_key) : undefined;
    const inProfile = profile.includes(c.event_applicability);
    let enabled: boolean;
    let reason: string;
    if (old) {
      enabled = true;
      reason = `Continues existing v1 seat "${old.title}" (${c.match}).`;
    } else if (c.headcount_model === "event_specific") {
      enabled = false;
      reason = `Event-Specific (${c.event_applicability}) — off by default; enable per event when the function is needed.`;
    } else if (inProfile) {
      enabled = true;
      reason = `New ${c.headcount_model.replace("_", "-")} role; "${c.event_applicability}" applies to After Dark.`;
    } else {
      enabled = false;
      reason = `"${c.event_applicability}" is not in the After Dark applicability profile — staff decision.`;
    }
    const proposed_count = enabled ? c.baseline_headcount : 0;
    const proposed_supervisor = supKey(c);
    const old_supervisor = old?.sup ?? null;
    const reporting_change = Boolean(old) && old_supervisor !== proposed_supervisor;
    const countChanged = Boolean(old) && old!.n !== proposed_count;
    const titleChanged = Boolean(old) && old!.title !== c.display_name;
    const change: VNextChange = !old ? (enabled ? "new" : "not_enabled") : reporting_change || countChanged || titleChanged ? "changed" : "unchanged";
    const notes: string[] = [reason];
    if (countChanged) notes.push(`Count ${old!.n ?? "unknown"} → ${proposed_count} (canonical planning baseline; event plans may override${c.headcount_model === "scalable" ? ", scalable" : ""}).`);
    if (reporting_change) notes.push(`Supervisor ${old_supervisor ?? "none"} → ${proposed_supervisor}.`);
    if (titleChanged) notes.push(`Title "${old!.title}" → "${c.display_name}" (key "${c.role_key}" kept).`);
    rows.push({
      role_key: c.role_key,
      existing_role_key: old?.key ?? null,
      existing_title: old?.title ?? null,
      canonical_role_id: c.canonical_role_id,
      canonical_display_name: c.display_name,
      workforce: "paid_group",
      headcount_model: c.headcount_model,
      old_count: old ? old.n : null,
      proposed_count,
      old_supervisor,
      proposed_supervisor,
      reporting_change,
      enabled,
      required: c.headcount_model === "required",
      change,
      disposition: null,
      reason: notes.join(" "),
    });
  }

  const claimed = new Set(roles.flatMap((c) => (c.legacy_role_key ? [c.legacy_role_key] : [])));
  for (const r of v1) {
    if (claimed.has(r.key)) continue;
    const d = PLACEHOLDER_DISPOSITIONS[r.key];
    rows.push({
      role_key: r.key,
      existing_role_key: r.key,
      existing_title: r.title,
      canonical_role_id: null,
      canonical_display_name: null,
      workforce: r.wf,
      headcount_model: null,
      old_count: r.n,
      proposed_count: r.n,
      old_supervisor: r.sup ?? null,
      proposed_supervisor: r.sup ?? null,
      reporting_change: false,
      enabled: true,
      required: false,
      change: "carried_forward",
      disposition: d?.class ?? "unresolved",
      reason: `Carried forward unchanged — ${d ? `${d.class.replace("_", " ")}: ${d.reason}` : "no disposition recorded (unresolved)."}`,
    });
  }

  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, n) => a + (n ?? 0), 0);
  const carried = rows.filter((x) => x.change === "carried_forward");
  const group = rows.filter((x) => x.canonical_role_id && x.enabled);
  const counts = { new: 0, changed: 0, unchanged: 0, carried_forward: 0, not_enabled: 0, removed: 0 } as Record<VNextChange, number>;
  for (const x of rows) counts[x.change]++;
  const proposed_group_seats = sum(group.map((x) => x.proposed_count));
  const carried_forward_sanctuary_seats = sum(carried.filter((x) => x.workforce !== "venue_provider").map((x) => x.proposed_count));
  return {
    title: "After Dark — Proposed Staffing Template vNext",
    status: "preview_only",
    template_key: AFTER_DARK_TEMPLATE_KEY,
    based_on_version: AFTER_DARK_CURRENT_VERSION,
    proposed_version_label: "vNext (draft proposal — not created)",
    applicability_profile: profile,
    rows,
    totals: {
      v1_sanctuary_seats: sum(v1.filter(sanctuarySide).map((r) => r.n)),
      proposed_group_seats,
      carried_forward_sanctuary_seats,
      proposed_sanctuary_seats: proposed_group_seats + carried_forward_sanctuary_seats,
      venue_allowances_unchanged: carried.filter((x) => x.workforce === "venue_provider").length,
      not_enabled_baseline_seats: sum(roles.filter((c) => !group.some((g) => g.canonical_role_id === c.canonical_role_id)).map((c) => c.baseline_headcount)),
    },
    counts,
  };
}
