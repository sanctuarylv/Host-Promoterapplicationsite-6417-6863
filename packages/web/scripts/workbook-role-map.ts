/**
 * Reviewed canonical ⇄ existing role reconciliation map.
 *
 * The map itself lives in src/api/ops/staffing/role-map.ts because the server
 * (the /staff/taxonomy preview and the readiness row) must read the SAME
 * decisions as this importer, and app code cannot import from scripts/. This
 * file is the script-side entry point named in the runbook; it re-exports the
 * map unchanged so there is exactly one source of identity decisions.
 *
 *   bun scripts/workbook-role-map.ts      # prints the map as a table (no I/O beyond stdout)
 */
export * from "../src/api/ops/staffing/role-map";
import { CANONICAL_ROLE_MAP, PLACEHOLDER_DISPOSITIONS } from "../src/api/ops/staffing/role-map";

if (import.meta.main) {
  for (const [id, e] of Object.entries(CANONICAL_ROLE_MAP)) console.log(`${id}  ${e.match.padEnd(7)}  ${e.role_key.padEnd(42)} ${e.legacy_key ?? "—"}`);
  for (const [key, d] of Object.entries(PLACEHOLDER_DISPOSITIONS)) console.log(`(existing)    ${d.class.padEnd(15)} ${key.padEnd(34)} ${d.domain}`);
}
