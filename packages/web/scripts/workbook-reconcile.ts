/**
 * Staffing-workbook reconciliation — DRY RUN ONLY.
 *
 *   bun scripts/workbook-reconcile.ts path/to/workbook.csv
 *   bun scripts/workbook-reconcile.ts path/to/workbook.json   # array of row objects
 *
 * Validates an export of the official 36-role staffing workbook against the
 * template-role shape (src/api/ops/workbook.ts) and prints a report. It opens
 * no database connection and writes nothing. Importing the validated workbook
 * as a NEW template version is a separate, reviewed step (docs/RUNBOOK_V2.md
 * § Staffing workbook) — planning-seed roles are never overwritten in place.
 *
 * Expected columns: role_key, title, department_key, slot_class, workforce,
 * count, supervisor_role_key (optional), notes (optional).
 */
import { readFileSync } from "node:fs";
import { parseCsv, validateWorkbook, type WorkbookRow } from "../src/api/ops/workbook";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: bun scripts/workbook-reconcile.ts <workbook.csv|workbook.json>");
  process.exit(2);
}
const text = readFileSync(file, "utf8");
const rows: WorkbookRow[] = file.endsWith(".json")
  ? (JSON.parse(text) as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v == null ? "" : String(v).trim()])))
  : parseCsv(text);

const report = validateWorkbook(rows);
console.log(`[workbook-reconcile] DRY RUN — no database opened, nothing written`);
console.log(`rows=${report.rows} unique_roles=${report.uniqueRoles} expected=${report.expectedRoles}`);
if (report.missingColumns.length) console.log(`missing columns: ${report.missingColumns.join(", ")}`);
console.log(`by workforce: ${JSON.stringify(report.byWorkforce)}`);
for (const i of report.issues) console.log(`${i.level.toUpperCase()} row ${i.row}${i.role_key ? ` (${i.role_key})` : ""}: ${i.message}`);
console.log(report.ok ? "RESULT: valid — ready for a reviewed import" : "RESULT: not valid — fix the errors above");
process.exit(report.ok ? 0 : 1);
