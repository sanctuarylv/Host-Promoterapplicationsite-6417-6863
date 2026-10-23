/**
 * Source + plan hash integrity against the Phase 2 reviewed baseline (pure).
 *
 * Two hashes pin what was reviewed:
 *   - source_sha256: the raw bytes of the canonical workbook export
 *     (data/staffing/sanctuary_lv_group_36_role_canonical_v1.csv).
 *   - plan_sha256: the deterministic dry-run plan built from those bytes with
 *     the reviewed reconciliation map, no target and the canonical source path
 *     (`baselinePlanHash`). It changes whenever the role map, credential or
 *     training tables, vNext rules or validation change — even if the source
 *     bytes do not.
 *
 * A source that matches but a plan that does not is a BASELINE MISMATCH: the
 * derivation drifted from what was reviewed, so the stage drops out of
 * "import pending approval" and every apply is refused until the drift is
 * re-reviewed and both constants are updated in a reviewed commit.
 */
import { CANONICAL_V1_FILE } from "./canonical-source";
import { buildImportPlan } from "./plan";
import { REVIEWED_SOURCE_SHA256 } from "./role-map";

/** Phase 2 reviewed dry-run plan hash (commit 065013b; no target, canonical source path). */
export const REVIEWED_PLAN_SHA256 = "8c22363803999b763305dc8961dcc6b7226271c15c28829ce14aff842cfcd701";

export const REVIEWED_BASELINE = {
  phase: "Phase 2 — 36-role canonical taxonomy implementation",
  commit: "065013bb7c67ec9ae200ca7617204133b9c947cb",
  source_file: CANONICAL_V1_FILE,
  source_sha256: REVIEWED_SOURCE_SHA256,
  plan_sha256: REVIEWED_PLAN_SHA256,
  plan_basis: "buildImportPlan(source bytes, kind csv, source_file = canonical path, no target, no existing rows); generated_at excluded",
} as const;

/** Target-independent plan hash: same bytes ⇒ same hash, wherever the file is read from. */
export function baselinePlanHash(text: string, kind: "csv" | "json", source_hash: string): string {
  return buildImportPlan({ text, kind, source_file: CANONICAL_V1_FILE, source_hash, generated_at: "1970-01-01T00:00:00.000Z" }).plan_hash;
}

export type IntegrityCheck = { key: "source_hash" | "plan_hash"; label: string; expected: string; actual: string | null; match: boolean };
export type Integrity = { ok: boolean; baseline: typeof REVIEWED_BASELINE; checks: IntegrityCheck[] };

export function checkIntegrity(source_hash: string | null, plan_hash: string | null, expected = { source: REVIEWED_SOURCE_SHA256, plan: REVIEWED_PLAN_SHA256 }): Integrity {
  const checks: IntegrityCheck[] = [
    { key: "source_hash", label: "Source sha256 equals the Phase 2 reviewed source", expected: expected.source, actual: source_hash, match: source_hash === expected.source },
    { key: "plan_hash", label: "Dry-run plan_hash equals the Phase 2 reviewed plan", expected: expected.plan, actual: plan_hash, match: plan_hash === expected.plan },
  ];
  return { ok: checks.every((c) => c.match), baseline: REVIEWED_BASELINE, checks };
}
