/**
 * Readiness stage of the 36-role staffing taxonomy (pure).
 *
 * "Imported" is deliberately NOT a member of TaxonomyStage: no production
 * import is authorized in this phase, so no code path can report it. Adding it
 * requires changing this type — a reviewed change in a future, explicitly
 * authorized write phase.
 */
import { CANONICAL_V1_CSV, CANONICAL_V1_FILE, CANONICAL_V1_SHA256 } from "./canonical-source";
import { baselinePlanHash, REVIEWED_PLAN_SHA256 } from "./integrity";
import { buildImportPlan, type ImportPlan } from "./plan";
import { REVIEWED_SOURCE_SHA256 } from "./role-map";

export const TAXONOMY_STAGES = ["not_supplied", "validation_failed", "reconciliation_ready", "baseline_mismatch", "import_pending_approval"] as const;
export type TaxonomyStage = (typeof TAXONOMY_STAGES)[number];
export const TAXONOMY_STAGE_LABEL: Record<TaxonomyStage, string> = {
  not_supplied: "Not supplied",
  validation_failed: "Validation failed",
  reconciliation_ready: "Reconciliation ready",
  baseline_mismatch: "Baseline mismatch — re-review required",
  import_pending_approval: "Import pending approval",
};

export type TaxonomySource = { text: string; source_file: string; source_hash: string } | null;
export const EMBEDDED_SOURCE: TaxonomySource = { text: CANONICAL_V1_CSV, source_file: CANONICAL_V1_FILE, source_hash: CANONICAL_V1_SHA256 };

/** Fixed timestamp for the server-side preview so the served plan is reproducible. */
export const PREVIEW_GENERATED_AT = "1970-01-01T00:00:00.000Z";

/**
 * not_supplied → validation_failed → reconciliation_ready (valid, unreviewed source)
 * → baseline_mismatch (reviewed source, but the derived plan drifted from the
 * reviewed plan hash) → import_pending_approval (both hashes match the Phase 2
 * baseline). Pending approval is the ceiling: nothing here can report an import.
 */
export function taxonomyStage(
  source: TaxonomySource,
  reviewedHash: string = REVIEWED_SOURCE_SHA256,
  reviewedPlanHash: string = REVIEWED_PLAN_SHA256,
): { stage: TaxonomyStage; plan: ImportPlan | null } {
  if (!source) return { stage: "not_supplied", plan: null };
  const plan = buildImportPlan({ text: source.text, kind: "csv", source_file: source.source_file, source_hash: source.source_hash, generated_at: PREVIEW_GENERATED_AT });
  if (!plan.ok) return { stage: "validation_failed", plan };
  if (plan.source_hash !== reviewedHash) return { stage: "reconciliation_ready", plan };
  // Path-independent: the baseline plan is always built with the canonical source path.
  const baseline = source.source_file === CANONICAL_V1_FILE ? plan.plan_hash : baselinePlanHash(source.text, "csv", source.source_hash);
  return { stage: baseline === reviewedPlanHash ? "import_pending_approval" : "baseline_mismatch", plan };
}

let memo: ReturnType<typeof taxonomyStage> | null = null;
/** The reviewed, committed source (cached — pure function of embedded bytes). */
export function embeddedTaxonomy() {
  memo ??= taxonomyStage(EMBEDDED_SOURCE);
  return memo;
}
