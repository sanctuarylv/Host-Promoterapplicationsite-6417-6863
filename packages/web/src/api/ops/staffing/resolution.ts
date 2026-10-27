/**
 * Phase 4 — PROPOSED credential and training resolution matrix (pure, READ-ONLY).
 *
 * For every credential and training gap reported by the Phase 3 review this
 * module records a reviewer-facing PROPOSAL: candidate access zones (drawn only
 * from the existing ACCESS_ZONES) and candidate training modules (the four
 * existing module keys, or clearly-labelled proposed new modules that do not
 * exist anywhere in the application).
 *
 * Boundaries — enforced by type literals and unit tests:
 *  - This module is NOT imported by plan.ts (or any module feeding
 *    buildImportPlan). The reviewed plan and its baseline plan_hash are unchanged.
 *  - Nothing is granted: every credential row carries `granted: false`.
 *  - Nothing is completed: every training row carries `completion_created: false`.
 *  - Conditional source wording ("as approved", "as required", "as applicable")
 *    is NEVER turned into a proposed zone or a proposed requirement; it is listed
 *    as a per-event human decision.
 *  - `all_staff` is never proposed. Where v1 grants it today, the narrowing is
 *    reported as a security delta for a human to accept or reject.
 *  - Every row is `status: "proposed"` with `decision: null`. Approval happens
 *    outside the application (docs/OPERATIONAL_DECISION_REGISTER_V4.md).
 */
import { AFTER_DARK_V1_ROLES, PLANNING_TRAINING_MODULES } from "./after-dark-v1";
import { ACCESS_ZONES, type AccessZone } from "./credentials";
import type { ImportPlan } from "./plan";
import type { TaxonomyReview } from "./review";

export const RESOLUTION_FORMAT = 1 as const;
export const EXISTING_MODULE_KEYS = PLANNING_TRAINING_MODULES.map((m) => m.key);
/** Existing modules already required of every role (`required: ["*"]`) — never "lost" by a role's text. */
export const GLOBAL_MODULE_KEYS = PLANNING_TRAINING_MODULES.filter((m) => m.required.includes("*")).map((m) => m.key);

// ── credential proposals (one per credential gap; reviewed, hand-written) ────
export type Confidence = "medium" | "low";
type CredentialProposalInput = { zones: AccessZone[]; rationale: string; confidence: Confidence; alternatives: AccessZone[][]; open_questions: string[] };

/**
 * Reviewer proposals keyed by role_key. Each must cover a role the Phase 3
 * review reports as a credential gap (asserted by tests). Zones come only from
 * ACCESS_ZONES. `all_staff` is deliberately absent.
 */
export const CREDENTIAL_PROPOSALS: Record<string, CredentialProposalInput> = {
  venue_liaison: {
    zones: ["front_of_house", "back_of_house"],
    rationale: "\"Operations / Venue\": works between the venue and Group operations across public and service areas. \"Venue\" has no reviewed zone token; proposed as FOH + BOH without stage.",
    confidence: "low",
    alternatives: [["front_of_house", "back_of_house", "stage"], []],
    open_questions: ["v1 grants all_staff today. Keep all_staff for this seat (requires a reviewed ZONE_TOKENS entry or per-event grant), or accept the narrower proposal?"],
  },
  vip_host: {
    zones: ["front_of_house", "vip"],
    rationale: "\"VIP / Hospitality / Backstage as approved\": VIP is mapped; Hospitality is a descriptor. FOH is proposed to match the v1 seat (guests arrive through FOH). \"Backstage as approved\" stays a per-event decision.",
    confidence: "medium",
    alternatives: [["vip"]],
    open_questions: ["Who may approve backstage access for a VIP Host on a given event, and is it recorded on the event plan?"],
  },
  accessibility_guest_care_host: {
    zones: ["front_of_house"],
    rationale: "\"Guest Experience / Accessibility\": both descriptors; every v1 Guest Experience seat is front_of_house.",
    confidence: "medium",
    alternatives: [["front_of_house", "vip"]],
    open_questions: ["Does accessibility support require escorting guests into VIP or seated areas that need a separate zone?"],
  },
  community_outreach_street_team_lead: {
    zones: [],
    rationale: "\"Promoter / Activation\": off-site / pre-event outreach. v1 Promoter and Promoter Manager seats carry no zone. Proposed: grants no zone.",
    confidence: "medium",
    alternatives: [["front_of_house"]],
    open_questions: ["Is there any onsite activation footprint that needs FOH access? (Role is not enabled for After Dark vNext.)"],
  },
  community_outreach_street_team: {
    zones: [],
    rationale: "\"Promoter / Activation\": as the Street Team Lead — off-site outreach; no zone proposed.",
    confidence: "medium",
    alternatives: [["front_of_house"]],
    open_questions: ["Same as the Street Team Lead. (Role is not enabled for After Dark vNext.)"],
  },
  security_manager_venue_security_liaison: {
    zones: ["front_of_house", "back_of_house"],
    rationale: "\"Security / All Access as required\": Security is a descriptor; \"All Access as required\" is conditional and is NOT proposed. FOH + BOH covers liaison with venue security at doors and service corridors. Security authority stays with the venue.",
    confidence: "low",
    alternatives: [["front_of_house", "back_of_house", "stage"]],
    open_questions: ["Who authorises all_staff for this role per event, and under which conditions?", "Is the role Group-employed or provided by the venue / a licensed contractor? (engagement classification pending)"],
  },
  access_control_credential_lead: {
    zones: ["front_of_house", "back_of_house"],
    rationale: "\"Access Control\": descriptor only. Credential issue / check points sit at guest entry (FOH) and the staff entrance (BOH).",
    confidence: "low",
    alternatives: [["front_of_house"]],
    open_questions: ["Where are credential and staff check points located at the After Dark venue?"],
  },
  safety_incident_response_coordinator: {
    zones: ["front_of_house", "back_of_house"],
    rationale: "\"Operations / Safety\": descriptors only. Responding to incidents requires reaching public and service areas; stage is excluded pending a decision.",
    confidence: "low",
    alternatives: [["front_of_house", "back_of_house", "stage"]],
    open_questions: ["Should incident response include the stage, or does the Stage Manager / venue own stage incidents?"],
  },
  event_admin_staff_check_in_coordinator: {
    zones: ["back_of_house"],
    rationale: "\"Staff Check-In / Operations\": descriptors only. Staff check-in is assumed to sit at the staff / service entrance (BOH).",
    confidence: "low",
    alternatives: [["front_of_house", "back_of_house"]],
    open_questions: ["Confirm the staff check-in location; if it is at the guest entrance the proposal should be FOH."],
  },
};

// ── training proposals (one entry per distinct unresolved phrase) ────────────
export type ProposedNewModule = { key: string; title: string; summary: string; verification: "self_attest" | "staff_verified"; status: "proposed"; exists: false };

/** Proposed NEW modules. None exists in crew_training_modules; none is created by this phase. */
export const PROPOSED_NEW_MODULES: ProposedNewModule[] = [
  ["radio_comms_protocol", "Radio and comms protocol", "Channel plan, call signs, priority traffic and hand-offs on show night.", "staff_verified"],
  ["accessibility_awareness", "Accessibility awareness", "Assisting guests with access needs respectfully; routes, seating and hand-offs.", "staff_verified"],
  ["de_escalation", "De-escalation", "Calm, respectful de-escalation and when to hand off to venue security.", "staff_verified"],
  ["privacy_data_handling", "Privacy and data handling", "Guest / staff personal data, photo & content rules, no private lists.", "self_attest"],
  ["registration_checkin_tools", "Registration and check-in tools", "Guest registration and staff check-in tools and procedures.", "staff_verified"],
  ["brand_conduct_standards", "Brand, messaging and conduct standards", "Sanctuary LV Group brand standards, honest messaging and conduct.", "self_attest"],
  ["confidentiality_artist_relations", "Confidentiality and artist relations", "Backstage conduct, artist confidentiality and green-room etiquette.", "self_attest"],
  ["access_control_procedures", "Access control procedures", "Credential policy, zone enforcement and emergency access.", "staff_verified"],
  ["technical_safety", "Technical and electrical safety", "Power, cabling, rigging awareness, hearing and stage safety, emergency shutdown.", "staff_verified"],
  ["manual_handling", "Manual handling and loading safety", "Safe lifting, load-in routes and PPE where required.", "staff_verified"],
  ["show_operations", "Show operations", "Show calling, run-of-show and cue discipline.", "staff_verified"],
  ["production_systems_competency", "Production systems competency", "Role-specific system competency (audio, lighting, video, broadcast) — verified per discipline.", "staff_verified"],
  ["incident_response_coordination", "Incident response coordination", "Incident command, documentation and stop-work / escalation authority (venue authority preserved).", "staff_verified"],
  ["event_leadership", "Event leadership", "Running the night: decision rights, escalation and debrief.", "self_attest"],
  ["venue_operations", "Venue operations", "Working with venue departments: rules, schedules and service routes.", "self_attest"],
  ["seating_capacity_management", "Seating and capacity management", "Seating plans, capacity counts and floor flow.", "staff_verified"],
  ["pos_cash_handling", "POS, inventory and financial controls", "Cashless / POS procedures, inventory counts and financial controls.", "staff_verified"],
].map(([key, title, summary, verification]) => ({ key: key!, title: title!, summary: summary!, verification: verification as ProposedNewModule["verification"], status: "proposed" as const, exists: false as const }));

export type PhraseResolution =
  | { kind: "existing"; module_key: string; note?: string }
  | { kind: "proposed_new"; module_key: string; note?: string }
  | { kind: "external_requirement"; module_key: null; note: string };

/**
 * Reviewer proposal for each distinct unresolved phrase (lower-case). Tests
 * assert every unresolved phrase in the review has exactly one entry and that
 * every module_key is an existing key or a PROPOSED_NEW_MODULES key.
 */
export const PHRASE_RESOLUTIONS: Record<string, PhraseResolution> = {
  "event leadership": { kind: "proposed_new", module_key: "event_leadership" },
  "venue ops": { kind: "proposed_new", module_key: "venue_operations" },
  "radio protocol": { kind: "proposed_new", module_key: "radio_comms_protocol" },
  comms: { kind: "proposed_new", module_key: "radio_comms_protocol" },
  "show calling": { kind: "proposed_new", module_key: "show_operations" },
  "run-of-show": { kind: "proposed_new", module_key: "show_operations" },
  "show cues": { kind: "proposed_new", module_key: "show_operations" },
  "stage safety": { kind: "proposed_new", module_key: "technical_safety" },
  "de-escalation": { kind: "proposed_new", module_key: "de_escalation" },
  accessibility: { kind: "proposed_new", module_key: "accessibility_awareness" },
  "accessibility awareness": { kind: "proposed_new", module_key: "accessibility_awareness" },
  "registration tools": { kind: "proposed_new", module_key: "registration_checkin_tools" },
  "staff procedures": { kind: "proposed_new", module_key: "registration_checkin_tools" },
  privacy: { kind: "proposed_new", module_key: "privacy_data_handling" },
  "privacy/content rules": { kind: "proposed_new", module_key: "privacy_data_handling" },
  "content handling": { kind: "proposed_new", module_key: "privacy_data_handling" },
  capacity: { kind: "proposed_new", module_key: "seating_capacity_management" },
  "seating plan": { kind: "proposed_new", module_key: "seating_capacity_management" },
  confidentiality: { kind: "proposed_new", module_key: "confidentiality_artist_relations" },
  "artist relations": { kind: "proposed_new", module_key: "confidentiality_artist_relations" },
  "artist communication": { kind: "proposed_new", module_key: "confidentiality_artist_relations" },
  "backstage conduct": { kind: "proposed_new", module_key: "confidentiality_artist_relations" },
  "access control": { kind: "proposed_new", module_key: "access_control_procedures" },
  "credential policy": { kind: "proposed_new", module_key: "access_control_procedures" },
  "credential control": { kind: "proposed_new", module_key: "access_control_procedures" },
  "emergency access": { kind: "proposed_new", module_key: "access_control_procedures" },
  "brand standards": { kind: "proposed_new", module_key: "brand_conduct_standards" },
  "brand messaging": { kind: "proposed_new", module_key: "brand_conduct_standards" },
  "brand conduct": { kind: "proposed_new", module_key: "brand_conduct_standards" },
  conduct: { kind: "proposed_new", module_key: "brand_conduct_standards" },
  "guest conduct": { kind: "proposed_new", module_key: "brand_conduct_standards" },
  compliance: { kind: "proposed_new", module_key: "brand_conduct_standards", note: "Scope of \"compliance\" (marketing law, venue rules, brand) needs confirmation." },
  "local/site rules": { kind: "existing", module_key: "venue_safety_authority", note: "\"site safety\" / \"venue rules\" already map to this module." },
  "technical safety": { kind: "proposed_new", module_key: "technical_safety" },
  power: { kind: "proposed_new", module_key: "technical_safety" },
  "emergency shutdown": { kind: "proposed_new", module_key: "technical_safety" },
  "electrical safety": { kind: "proposed_new", module_key: "technical_safety" },
  "hearing safety": { kind: "proposed_new", module_key: "technical_safety" },
  "cable safety": { kind: "proposed_new", module_key: "technical_safety" },
  "rigging awareness": { kind: "proposed_new", module_key: "technical_safety" },
  "audio system": { kind: "proposed_new", module_key: "production_systems_competency" },
  "stage audio": { kind: "proposed_new", module_key: "production_systems_competency" },
  "lighting console": { kind: "proposed_new", module_key: "production_systems_competency" },
  "playback systems": { kind: "proposed_new", module_key: "production_systems_competency" },
  "signal flow": { kind: "proposed_new", module_key: "production_systems_competency" },
  "broadcast workflow": { kind: "proposed_new", module_key: "production_systems_competency" },
  "platform access": { kind: "proposed_new", module_key: "production_systems_competency", note: "Platform account access itself is an IT permission, not a training completion." },
  "camera operation": { kind: "proposed_new", module_key: "production_systems_competency" },
  "manual handling": { kind: "proposed_new", module_key: "manual_handling" },
  "safe lifting": { kind: "proposed_new", module_key: "manual_handling" },
  "loading safety": { kind: "proposed_new", module_key: "manual_handling" },
  "venue routes": { kind: "existing", module_key: "venue_safety_authority", note: "Routes / exits are covered by venue_safety_authority (\"evacuation routes\")." },
  "ppe as required": { kind: "external_requirement", module_key: null, note: "Conditional (\"as required\") — PPE need is decided per task / venue; never auto-required." },
  "chemical/ppe rules as applicable": { kind: "external_requirement", module_key: null, note: "Conditional (\"as applicable\") — depends on venue chemicals and SDS; decided with the venue." },
  "licensing as applicable": { kind: "external_requirement", module_key: null, note: "Conditional (\"as applicable\") — a state / local licence is a credential held by a person, verified outside this system; never a training completion." },
  "incident command": { kind: "proposed_new", module_key: "incident_response_coordination" },
  "incident documentation": { kind: "proposed_new", module_key: "incident_response_coordination" },
  "incident reporting": { kind: "existing", module_key: "venue_safety_authority", note: "\"incident escalation\" already maps here; documentation depth may need incident_response_coordination." },
  "stop-work/escalation authority": { kind: "proposed_new", module_key: "incident_response_coordination", note: "Any stop-work authority must be agreed with the venue." },
  "pos procedures": { kind: "proposed_new", module_key: "pos_cash_handling" },
  "inventory control": { kind: "proposed_new", module_key: "pos_cash_handling" },
  "financial controls": { kind: "proposed_new", module_key: "pos_cash_handling" },
};

// ── output types ────────────────────────────────────────────────────────────
export type ZoneDelta = { added: AccessZone[]; removed: string[]; summary: "same" | "expands" | "narrows" | "changes" | "new_access" | "no_access" };
export type CredentialResolutionRow = {
  canonical_role_id: string;
  role_key: string;
  display_name: string;
  gap_status: "partial" | "unresolved";
  source_text: string;
  v1_zones: string[] | null;
  plan_zones: AccessZone[];
  proposed_zones: AccessZone[];
  alternatives: AccessZone[][];
  conditional_never_auto: string[];
  rationale: string;
  confidence: Confidence;
  open_questions: string[];
  delta_vs_v1: ZoneDelta | null;
  delta_vs_plan: ZoneDelta;
  status: "proposed";
  decision: null;
  granted: false;
};
export type ZoneReconciliationRow = { role_key: string; canonical_role_id: string; v1_zones: string[]; plan_zones: AccessZone[]; credential_status: string; delta: ZoneDelta };
export type TrainingResolutionRow = {
  canonical_role_id: string;
  role_key: string;
  display_name: string;
  gap_status: "partial" | "unresolved";
  plan_modules: string[];
  v1_modules: string[] | null;
  phrases: { phrase: string; resolution: PhraseResolution }[];
  proposed_existing_modules: string[];
  proposed_new_modules: string[];
  external_requirements: string[];
  /** v1 modules the canonical text no longer names and that are NOT globally required — a requirement that would be dropped if the plan were adopted as-is. */
  v1_modules_not_in_plan: string[];
  status: "proposed";
  decision: null;
  completion_created: false;
};
export type ResolutionMatrix = {
  resolution_format: typeof RESOLUTION_FORMAT;
  read_only: true;
  status: "proposed";
  note: string;
  access_zones: readonly AccessZone[];
  credentials: {
    rows: CredentialResolutionRow[];
    counts: { gaps: number; proposed_with_zones: number; proposed_no_zone: number; conditional_tokens: number; narrows_v1: number; new_access: number };
    zone_reconciliation: ZoneReconciliationRow[];
    security_flags: string[];
  };
  training: {
    rows: TrainingResolutionRow[];
    existing_modules: string[];
    global_modules: string[];
    proposed_new_modules: (ProposedNewModule & { roles: string[] })[];
    phrase_count: number;
    counts: { gaps: number; phrases_to_existing: number; phrases_to_new: number; phrases_external: number; roles_losing_v1_modules: number };
  };
  granted_any: false;
  completions_created: 0;
};

const sortZones = (zs: Iterable<string>) => ACCESS_ZONES.filter((z) => [...zs].includes(z));
/** `all_staff` is the broadest zone: a set containing it covers every zone. */
const covers = (set: readonly string[], z: string) => set.includes(z) || set.includes("all_staff");
export function zoneDelta(from: string[] | null, to: AccessZone[]): ZoneDelta {
  if (from === null) return { added: [...to], removed: [], summary: to.length ? "new_access" : "no_access" };
  const added = to.filter((z) => !covers(from, z));
  const removed = from.filter((z) => !covers(to, z));
  const summary = !added.length && !removed.length ? "same" : added.length && !removed.length ? "expands" : !added.length ? "narrows" : "changes";
  return { added, removed, summary };
}

export function buildResolutionMatrix(plan: ImportPlan, review: TaxonomyReview): ResolutionMatrix {
  const v1 = new Map(AFTER_DARK_V1_ROLES.map((r) => [r.key, r]));
  const credByRole = new Map(plan.credential_mappings.map((c) => [c.role_key, c]));

  const credRows: CredentialResolutionRow[] = review.credential_review.rows.map((g) => {
    const p = CREDENTIAL_PROPOSALS[g.role_key];
    if (!p) throw new Error(`no credential proposal for gap ${g.role_key}`);
    const proposed = sortZones(p.zones);
    return {
      canonical_role_id: g.canonical_role_id,
      role_key: g.role_key,
      display_name: g.display_name,
      gap_status: g.status,
      source_text: g.source_text,
      v1_zones: g.v1_zones,
      plan_zones: [...g.proposed_zones] as AccessZone[],
      proposed_zones: proposed,
      alternatives: p.alternatives.map(sortZones),
      conditional_never_auto: g.conditional_tokens,
      rationale: p.rationale,
      confidence: p.confidence,
      open_questions: p.open_questions,
      delta_vs_v1: g.v1_zones ? zoneDelta(g.v1_zones, proposed) : null,
      delta_vs_plan: zoneDelta(g.proposed_zones, proposed),
      status: "proposed",
      decision: null,
      granted: false,
    };
  });

  // Every continuing seat: v1 zones vs the zones the reviewed plan would propose.
  const zone_reconciliation: ZoneReconciliationRow[] = plan.canonical_roles.roles
    .filter((r) => r.legacy_role_key && v1.has(r.legacy_role_key))
    .map((r) => {
      const c = credByRole.get(r.role_key)!;
      const v1z = v1.get(r.legacy_role_key!)!.zones ?? [];
      return { role_key: r.role_key, canonical_role_id: r.canonical_role_id, v1_zones: v1z, plan_zones: c.proposed_zones, credential_status: c.status, delta: zoneDelta(v1z, c.proposed_zones) };
    });

  const security_flags: string[] = [];
  for (const r of zone_reconciliation) {
    if (r.delta.summary === "same") continue;
    if (r.delta.added.length) security_flags.push(`${r.role_key}: reviewed plan would ADD ${r.delta.added.join(", ")} vs v1 (${r.v1_zones.join(", ") || "none"}).`);
    if (r.delta.removed.length) security_flags.push(`${r.role_key}: reviewed plan would DROP ${r.delta.removed.join(", ")} vs v1 (plan: ${r.plan_zones.join(", ") || "none"}).`);
  }
  for (const r of credRows) {
    if (r.conditional_never_auto.length) security_flags.push(`${r.role_key}: conditional ${r.conditional_never_auto.map((t) => `"${t}"`).join(", ")} is never auto-granted — per-event human decision.`);
    if (r.delta_vs_v1 && r.delta_vs_v1.removed.includes("all_staff")) security_flags.push(`${r.role_key}: proposal narrows v1 all_staff to ${r.proposed_zones.join(", ") || "none"} — accept the narrowing or keep all_staff by explicit decision.`);
  }

  const known = new Set(EXISTING_MODULE_KEYS);
  const proposedKeys = new Set(PROPOSED_NEW_MODULES.map((m) => m.key));
  const trainRows: TrainingResolutionRow[] = review.training_review.rows.map((t) => {
    const phrases = t.unresolved_phrases.map((ph) => {
      const res = PHRASE_RESOLUTIONS[ph.toLowerCase()];
      if (!res) throw new Error(`no training resolution for phrase "${ph}" (${t.role_key})`);
      if (res.module_key && !known.has(res.module_key) && !proposedKeys.has(res.module_key)) throw new Error(`unknown module ${res.module_key}`);
      return { phrase: ph, resolution: res };
    });
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
    return {
      canonical_role_id: t.canonical_role_id,
      role_key: t.role_key,
      display_name: t.display_name,
      gap_status: t.status,
      plan_modules: t.module_keys,
      v1_modules: t.v1_modules,
      phrases,
      proposed_existing_modules: uniq(phrases.filter((p) => p.resolution.kind === "existing" && !t.module_keys.includes(p.resolution.module_key!)).map((p) => p.resolution.module_key)),
      proposed_new_modules: uniq(phrases.filter((p) => p.resolution.kind === "proposed_new").map((p) => p.resolution.module_key)),
      external_requirements: phrases.filter((p) => p.resolution.kind === "external_requirement").map((p) => p.phrase),
      v1_modules_not_in_plan: (t.v1_modules ?? []).filter((m) => !t.module_keys.includes(m) && !GLOBAL_MODULE_KEYS.includes(m)).sort(),
      status: "proposed",
      decision: null,
      completion_created: false,
    };
  });

  const allPhrases = trainRows.flatMap((r) => r.phrases);
  const distinct = new Map(allPhrases.map((p) => [p.phrase.toLowerCase(), p.resolution]));
  const kinds = [...distinct.values()];
  return {
    resolution_format: RESOLUTION_FORMAT,
    read_only: true,
    status: "proposed",
    note: "Proposals for human review only. Nothing is granted, no training module is created and no completion is recorded. Approval is recorded outside the application.",
    access_zones: ACCESS_ZONES,
    credentials: {
      rows: credRows,
      counts: {
        gaps: credRows.length,
        proposed_with_zones: credRows.filter((r) => r.proposed_zones.length).length,
        proposed_no_zone: credRows.filter((r) => !r.proposed_zones.length).length,
        conditional_tokens: credRows.reduce((a, r) => a + r.conditional_never_auto.length, 0),
        narrows_v1: credRows.filter((r) => r.delta_vs_v1?.summary === "narrows").length,
        new_access: credRows.filter((r) => r.delta_vs_v1 === null && r.proposed_zones.length).length,
      },
      zone_reconciliation,
      security_flags,
    },
    training: {
      rows: trainRows,
      existing_modules: EXISTING_MODULE_KEYS,
      global_modules: GLOBAL_MODULE_KEYS,
      proposed_new_modules: PROPOSED_NEW_MODULES.map((m) => ({ ...m, roles: trainRows.filter((r) => r.proposed_new_modules.includes(m.key)).map((r) => r.role_key) })),
      phrase_count: distinct.size,
      counts: {
        gaps: trainRows.length,
        phrases_to_existing: kinds.filter((k) => k.kind === "existing").length,
        phrases_to_new: kinds.filter((k) => k.kind === "proposed_new").length,
        phrases_external: kinds.filter((k) => k.kind === "external_requirement").length,
        roles_losing_v1_modules: trainRows.filter((r) => r.v1_modules_not_in_plan.length).length,
      },
    },
    granted_any: false,
    completions_created: 0,
  };
}
