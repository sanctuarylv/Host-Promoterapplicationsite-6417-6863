/**
 * Phase 4 — operational decision register (pure, READ-ONLY).
 *
 * One row per open human decision about the 36-role canonical staffing
 * taxonomy and its rollout: the `runner` question, every credential gap, every
 * zone change the reviewed plan implies for a continuing v1 seat, every training
 * gap, engagement classification for all 36 roles, the After Dark vNext
 * template proposal, the public apply-label rename and the proposed /serve
 * focus fix.
 *
 * Nothing here decides anything:
 *  - The only status type is the literal "pending"; `decision`, `decided_by`
 *    and `decided_at` are the literal `null`. There is no write path; a decision
 *    is recorded outside the application (docs/OPERATIONAL_DECISION_REGISTER_V4.md)
 *    and lands, if ever, as a reviewed code / data change with new hashes.
 *  - No option is pre-selected or ranked. `proposal_ref` only points at the
 *    reviewer proposal in the resolution matrix; it is not a recommendation to
 *    adopt it.
 *  - Paid Sanctuary LV Group staffing and the Sanctuary LV (nonprofit) Serve
 *    Team are separate domains. The only nonprofit-domain row is the /serve
 *    focus fix, which changes behaviour only (no identity, copy or records).
 *
 * Not imported by plan.ts: the reviewed plan and its baseline hash are unchanged.
 */
import type { ResolutionMatrix } from "./resolution";
import type { TaxonomyReview } from "./review";

export const REGISTER_FORMAT = 1 as const;

/** The ONLY status a decision can have in code. */
export type DecisionStatus = "pending";
export type DecisionDomain = "sanctuary_lv_group" | "sanctuary_lv_nonprofit";
export type DecisionCategory =
  | "staffing_runner"
  | "credential_gap"
  | "zone_delta"
  | "training_gap"
  | "engagement_classification"
  | "template_approval"
  | "public_label"
  | "nonprofit_behaviour_patch";

/** Release gates a decision must clear before the gate can open (docs/RELEASE_PLAN_0002_V4.md §6). */
export const RELEASE_GATES = {
  G1_backup: "Production backup taken and restore verified",
  G2_migration: "Production migration 0002 (schema only)",
  G3_deploy: "Deploy the current build after 0002",
  G4_import: "Production import of the 36 canonical roles (ops_canonical_roles only)",
  G5_template: "Create an After Dark vNext template version (future phase; v1 stays active until then)",
  G6_staffing_live: "Engage / pay Group personnel against canonical roles",
  G7_public_label: "Change a public apply label",
  G8_serve_patch: "Merge the /serve focus fix",
} as const;
export type ReleaseGate = keyof typeof RELEASE_GATES;
/** Human authorizations (all pending) each gate additionally requires. */
export const GATE_AUTHORIZATIONS: Record<ReleaseGate, string[]> = {
  G1_backup: ["backup_restore"],
  G2_migration: ["backup_restore", "production_migration"],
  G3_deploy: ["production_migration", "release"],
  G4_import: ["production_import"],
  G5_template: ["vnext_template", "runner_decision", "credential_mappings", "training_mappings"],
  G6_staffing_live: ["engagement_classification"],
  G7_public_label: ["public_rename", "release"],
  G8_serve_patch: ["serve_focus_patch", "release"],
};

export type DecisionOption = { key: string; label: string };
export type DecisionItem = {
  id: string;
  category: DecisionCategory;
  domain: DecisionDomain;
  subject: string;
  question: string;
  context: string[];
  owner: string;
  options: DecisionOption[];
  /** Pointer to a reviewer proposal (resolution matrix), or null. Not a recommendation. */
  proposal_ref: string | null;
  blocks: ReleaseGate[];
  status: DecisionStatus;
  decision: null;
  decided_by: null;
  decided_at: null;
  source: string;
};
export type AuthorizationLink = { key: string; label: string; owner: string; status: "pending"; covers: string[] };
export type DecisionRegister = {
  register_format: typeof REGISTER_FORMAT;
  read_only: true;
  production_authorized: false;
  summary: string;
  items: DecisionItem[];
  counts: { total: number; pending: number; decided: 0; by_category: Record<DecisionCategory, number>; by_domain: Record<DecisionDomain, number> };
  gates: { key: ReleaseGate; label: string; blocked_by: number; requires_authorizations: string[]; open: false }[];
  authorizations: AuthorizationLink[];
  recording: string;
};

const OWNERS = {
  event_leadership: "Sanctuary LV Group event leadership (Event Director / Event Operations Manager)",
  credentials: "Event Operations Manager with Access Control / Credential Lead",
  training: "Training owner (Guest Experience / Event Operations)",
  classification: "Sanctuary LV Group leadership with HR / legal counsel",
  director: "Event Director",
  leadership: "Sanctuary LV Group leadership",
  serve: "Sanctuary LV (nonprofit) Serve Team owner + repository owner",
} as const;

const CLASSIFICATION_OPTIONS: DecisionOption[] = [
  { key: "employee", label: "Employee of Sanctuary LV Group" },
  { key: "independent_contractor", label: "Independent contractor" },
  { key: "vendor_or_agency_provided", label: "Provided by a vendor / agency / venue under contract" },
  { key: "not_used_by_group", label: "Not engaged by the Group (role not staffed)" },
];

const pending = (x: Omit<DecisionItem, "status" | "decision" | "decided_by" | "decided_at">): DecisionItem => ({ ...x, status: "pending", decision: null, decided_by: null, decided_at: null });
const pad = (n: number) => String(n).padStart(3, "0");

export function buildDecisionRegister(review: TaxonomyReview, matrix: ResolutionMatrix): DecisionRegister {
  const items: DecisionItem[] = [];
  const rr = review.runner_decision;

  // ── runner ────────────────────────────────────────────────────────────────
  items.push(
    pending({
      id: "D-RUN-001",
      category: "staffing_runner",
      domain: "sanctuary_lv_group",
      subject: rr.role_key,
      question: rr.question,
      context: [
        `v1: ${rr.current.v1_title} × ${rr.current.v1_count}, supervisor ${rr.current.v1_supervisor}, zones ${rr.current.v1_zones.join(", ") || "none"}`,
        `vNext preview: ${rr.current.vnext_change} (${rr.current.v1_count} → ${rr.current.vnext_count})`,
        rr.related_canonical ? `Related canonical role: ${rr.related_canonical.display_name} (${rr.related_canonical.canonical_role_id}, baseline ${rr.related_canonical.baseline_headcount}) — ${rr.related_canonical.relation}` : "No related canonical role",
        "Options are listed in a fixed order; the order is not a ranking.",
      ],
      owner: rr.decision_owner,
      options: rr.options.map((o) => ({ key: o.key, label: o.label })),
      proposal_ref: null,
      blocks: ["G4_import", "G5_template"],
      source: "review.runner_decision",
    }),
  );

  // ── credential gaps (9) ───────────────────────────────────────────────────
  matrix.credentials.rows.forEach((c, i) => {
    items.push(
      pending({
        id: `D-CRED-${pad(i + 1)}`,
        category: "credential_gap",
        domain: "sanctuary_lv_group",
        subject: c.role_key,
        question: `Which access zones should ${c.display_name} carry in a future template? Source: "${c.source_text}".`,
        context: [
          `Gap: ${c.gap_status} · plan zones ${c.plan_zones.join(", ") || "none"} · v1 zones ${c.v1_zones ? c.v1_zones.join(", ") || "none" : "no v1 seat"}`,
          `Reviewer proposal: ${c.proposed_zones.join(", ") || "no zone"} (confidence ${c.confidence})`,
          ...c.conditional_never_auto.map((t) => `Conditional "${t}" — never auto-granted; per-event decision`),
          ...c.open_questions,
        ],
        owner: OWNERS.credentials,
        options: [
          { key: "approve_proposal", label: `Approve proposal (${c.proposed_zones.join(", ") || "no zone"})` },
          ...c.alternatives.map((a, k) => ({ key: `alternative_${k + 1}`, label: `Alternative: ${a.join(", ") || "no zone"}` })),
          { key: "other_reviewed_mapping", label: "Other reviewed mapping (record zones explicitly)" },
          { key: "leave_unresolved", label: "Leave unresolved (role grants no zone)" },
        ],
        proposal_ref: `resolution.credentials.rows[${i}]`,
        blocks: ["G5_template"],
        source: "review.credential_review",
      }),
    );
  });

  // ── zone deltas on continuing seats that the plan marks mapped ────────────
  const gapRoles = new Set(matrix.credentials.rows.map((r) => r.role_key));
  matrix.credentials.zone_reconciliation
    .filter((z) => z.delta.summary !== "same" && !gapRoles.has(z.role_key))
    .forEach((z, i) => {
      items.push(
        pending({
          id: `D-ZONE-${pad(i + 1)}`,
          category: "zone_delta",
          domain: "sanctuary_lv_group",
          subject: z.role_key,
          question: `The reviewed plan maps ${z.role_key} to ${z.plan_zones.join(", ") || "no zone"}; After Dark v1 grants ${z.v1_zones.join(", ") || "no zone"}. Accept the change for a future template?`,
          context: [
            `Delta vs v1: ${z.delta.summary}${z.delta.added.length ? ` · adds ${z.delta.added.join(", ")}` : ""}${z.delta.removed.length ? ` · drops ${z.delta.removed.join(", ")}` : ""}`,
            "Nothing changes today: the import writes only ops_canonical_roles; v1 template roles, assignments and issued credentials keep their zones.",
          ],
          owner: OWNERS.credentials,
          options: [
            { key: "accept_plan_zones", label: `Accept plan zones (${z.plan_zones.join(", ") || "none"})` },
            { key: "keep_v1_zones", label: `Keep v1 zones (${z.v1_zones.join(", ") || "none"})` },
            { key: "other_reviewed_mapping", label: "Other reviewed mapping" },
          ],
          proposal_ref: `resolution.credentials.zone_reconciliation[${matrix.credentials.zone_reconciliation.indexOf(z)}]`,
          blocks: ["G5_template"],
          source: "resolution.credentials.zone_reconciliation",
        }),
      );
    });

  // ── training gaps (35) ────────────────────────────────────────────────────
  matrix.training.rows.forEach((t, i) => {
    items.push(
      pending({
        id: `D-TRN-${pad(i + 1)}`,
        category: "training_gap",
        domain: "sanctuary_lv_group",
        subject: t.role_key,
        question: `Resolve ${t.phrases.length} unmapped training requirement(s) for ${t.display_name}: ${t.phrases.map((p) => p.phrase).join("; ")}.`,
        context: [
          `Gap: ${t.gap_status} · plan modules ${t.plan_modules.join(", ") || "none"}`,
          `Proposal: existing ${t.proposed_existing_modules.join(", ") || "—"} · new (proposed, not created) ${t.proposed_new_modules.join(", ") || "—"}${t.external_requirements.length ? ` · external / conditional: ${t.external_requirements.join("; ")}` : ""}`,
          ...(t.v1_modules_not_in_plan.length ? [`v1 required ${t.v1_modules_not_in_plan.join(", ")}; the canonical text no longer names it`] : []),
          "Approving a mapping never marks anyone trained.",
        ],
        owner: OWNERS.training,
        options: [
          { key: "approve_proposal", label: "Approve proposed mapping (new modules still need authoring + a separate creation step)" },
          { key: "map_to_existing_only", label: "Map to existing modules only; leave the rest unresolved" },
          { key: "other_reviewed_mapping", label: "Other reviewed mapping" },
          { key: "accept_unresolved", label: "Accept as unresolved" },
        ],
        proposal_ref: `resolution.training.rows[${i}]`,
        blocks: ["G5_template"],
        source: "review.training_review",
      }),
    );
  });

  // ── engagement classification (36) ────────────────────────────────────────
  review.role_review.rows.forEach((r) => {
    items.push(
      pending({
        id: `D-CLS-${pad(r.seq)}`,
        category: "engagement_classification",
        domain: "sanctuary_lv_group",
        subject: r.role_key,
        question: `How is ${r.display_name} (${r.canonical_role_id}) engaged by Sanctuary LV Group?`,
        context: [
          `Recorded today: ${r.engagement_type} · ${r.department_key} · ${r.seniority} · ${r.headcount_model} · baseline ${r.baseline_headcount}`,
          "The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.",
        ],
        owner: OWNERS.classification,
        options: CLASSIFICATION_OPTIONS,
        proposal_ref: null,
        blocks: ["G6_staffing_live"],
        source: "review.role_review",
      }),
    );
  });

  // ── template, label, serve patch ──────────────────────────────────────────
  const tc = review.template_comparison;
  items.push(
    pending({
      id: "D-TPL-001",
      category: "template_approval",
      domain: "sanctuary_lv_group",
      subject: "after_dark_vnext",
      question: tc ? `Approve the After Dark vNext staffing proposal (${tc.totals.v1} → ${tc.totals.vnext} seats, ${tc.not_enabled.length} roles not enabled) for a future template build?` : "Approve the After Dark vNext staffing proposal?",
      context: [
        "Approval of the proposal does NOT create or activate a template version; v1 stays the published, active template.",
        "Depends on: D-RUN-001, D-CRED-*, D-ZONE-*, D-TRN-* (or explicit acceptance of them as unresolved).",
        "Package: docs/AFTER_DARK_VNEXT_APPROVAL_PACKAGE_V4.md",
      ],
      owner: OWNERS.director,
      options: [
        { key: "approve_for_build", label: "Approve proposal for a future template-build phase" },
        { key: "approve_with_changes", label: "Approve with recorded changes" },
        { key: "reject", label: "Reject; keep v1 only" },
      ],
      proposal_ref: "review.template_comparison",
      blocks: ["G5_template"],
      source: "review.template_comparison",
    }),
  );
  const rename = review.approval_checklist.human.find((h) => h.key === "public_rename");
  items.push(
    pending({
      id: "D-LBL-001",
      category: "public_label",
      domain: "sanctuary_lv_group",
      subject: "guest_experience_lead",
      question: rename?.label ?? "Public apply label rename",
      context: ["Prepared, not applied. Public role keys and existing applications are unchanged by a label change."],
      owner: OWNERS.leadership,
      options: [
        { key: "approve_rename", label: "Approve the rename" },
        { key: "keep_current", label: "Keep the current public label" },
        { key: "other_label", label: "Use a different label" },
      ],
      proposal_ref: null,
      blocks: ["G7_public_label"],
      source: "review.approval_checklist.human.public_rename",
    }),
  );
  items.push(
    pending({
      id: "D-SRV-001",
      category: "nonprofit_behaviour_patch",
      domain: "sanctuary_lv_nonprofit",
      subject: "/serve success focus",
      question: "Apply the behaviour-only fix that moves focus to the /serve success panel reliably (docs/patches/serve-success-focus.patch)?",
      context: [
        "Root cause: focus is requested in a requestAnimationFrame callback that can run before React commits the success panel (docs/PHASE4_READINESS_REPORT.md §6).",
        "Change: focus from an effect after commit. No copy, route, API, identity, schema or record change; Serve Team volunteer records untouched.",
        "Evidence: current build 24/32 focused (all 8 failures had no panel at lookup time); patched build 33/33 (docs/evidence/phase4/serve-focus).",
      ],
      owner: OWNERS.serve,
      options: [
        { key: "apply_patch", label: "Apply the patch as proposed" },
        { key: "apply_with_changes", label: "Apply with changes" },
        { key: "do_not_apply", label: "Do not apply; keep the known intermittent focus failure" },
      ],
      proposal_ref: "docs/patches/serve-success-focus.patch",
      blocks: ["G8_serve_patch"],
      source: "Phase 4 focus root-cause analysis",
    }),
  );

  // ── counts / gates / authorization links ──────────────────────────────────
  const cats: DecisionCategory[] = ["staffing_runner", "credential_gap", "zone_delta", "training_gap", "engagement_classification", "template_approval", "public_label", "nonprofit_behaviour_patch"];
  const by_category = Object.fromEntries(cats.map((c) => [c, items.filter((x) => x.category === c).length])) as Record<DecisionCategory, number>;
  const by_domain = { sanctuary_lv_group: items.filter((x) => x.domain === "sanctuary_lv_group").length, sanctuary_lv_nonprofit: items.filter((x) => x.domain === "sanctuary_lv_nonprofit").length };
  const ids = (cat: DecisionCategory) => items.filter((x) => x.category === cat).map((x) => x.id);
  const COVERS: Record<string, string[]> = {
    runner_decision: ids("staffing_runner"),
    credential_mappings: [...ids("credential_gap"), ...ids("zone_delta")],
    training_mappings: ids("training_gap"),
    engagement_classification: ids("engagement_classification"),
    vnext_template: ids("template_approval"),
    public_rename: ids("public_label"),
  };
  const authorizations: AuthorizationLink[] = review.approval_checklist.human.map((h) => ({ key: h.key, label: h.label, owner: h.owner, status: h.status, covers: COVERS[h.key] ?? [] }));
  authorizations.push({ key: "serve_focus_patch", label: "Behaviour-only /serve focus fix (nonprofit domain)", owner: OWNERS.serve, status: "pending", covers: ids("nonprofit_behaviour_patch") });

  return {
    register_format: REGISTER_FORMAT,
    read_only: true,
    production_authorized: false,
    summary: `${items.length} decisions, all pending. No decision can be recorded from the application; nothing is classified, granted, completed or activated.`,
    items,
    counts: { total: items.length, pending: items.filter((x) => x.status === "pending").length, decided: 0, by_category, by_domain },
    gates: (Object.keys(RELEASE_GATES) as ReleaseGate[]).map((key) => ({ key, label: RELEASE_GATES[key], blocked_by: items.filter((x) => x.blocks.includes(key)).length, requires_authorizations: GATE_AUTHORIZATIONS[key], open: false as const })),
    authorizations,
    recording: "Decisions are recorded outside the application in docs/OPERATIONAL_DECISION_REGISTER_V4.md §4 (sign-off table) and land only as reviewed code / data changes with re-baselined hashes.",
  };
}
