/**
 * Staffing-workbook validation (pure, no I/O).
 *
 * The official 36-role staffing workbook has NOT been supplied. Until it is,
 * every template role is a planning seed (`confirmation` proposed /
 * provisional / unconfirmed). This module validates an exported workbook
 * (CSV or JSON rows) against the template-role shape so it can be reconciled
 * before anything is written. It never writes and never marks a role
 * `approved` — approval stays a staff decision recorded after review.
 */
import { WORKFORCE_KINDS } from "./coverage";

export const WORKBOOK_EXPECTED_ROLES = 36;
export const SLOT_CLASSES = ["core", "talent", "care", "promoter", "founder", "venue"] as const;
export const WORKBOOK_COLUMNS = ["role_key", "title", "department_key", "slot_class", "workforce", "count", "supervisor_role_key"] as const;

export type WorkbookRow = Record<string, string>;
export type WorkbookIssue = { row: number; role_key: string | null; level: "error" | "warning"; message: string };
export type WorkbookReport = {
  rows: number;
  uniqueRoles: number;
  expectedRoles: number;
  missingColumns: string[];
  issues: WorkbookIssue[];
  byWorkforce: Record<string, number>;
  ok: boolean;
};

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): WorkbookRow[] {
  const records: string[][] = [];
  let field = "";
  let rec: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      rec.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      rec.push(field);
      field = "";
      if (rec.some((f) => f.trim() !== "")) records.push(rec);
      rec = [];
    } else field += c;
  }
  rec.push(field);
  if (rec.some((f) => f.trim() !== "")) records.push(rec);
  const [header, ...body] = records;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;

export function validateWorkbook(rows: WorkbookRow[]): WorkbookReport {
  const issues: WorkbookIssue[] = [];
  const present = new Set(rows.flatMap((r) => Object.keys(r)));
  const missingColumns = rows.length ? WORKBOOK_COLUMNS.filter((c) => c !== "supervisor_role_key" && !present.has(c)) : [...WORKBOOK_COLUMNS];
  const seen = new Map<string, number>();
  const byWorkforce: Record<string, number> = {};

  rows.forEach((r, idx) => {
    const row = idx + 2; // 1-based + header line
    const key = r.role_key?.trim() || null;
    const err = (message: string) => issues.push({ row, role_key: key, level: "error", message });
    const warn = (message: string) => issues.push({ row, role_key: key, level: "warning", message });
    if (!key) return err("role_key is required");
    if (!KEY_RE.test(key)) err("role_key must be lower_snake_case");
    if (seen.has(key)) err(`duplicate role_key (first on row ${seen.get(key)})`);
    else seen.set(key, row);
    if (!r.title) err("title is required");
    if (!r.department_key) err("department_key is required");
    if (r.slot_class && !(SLOT_CLASSES as readonly string[]).includes(r.slot_class)) err(`slot_class must be one of ${SLOT_CLASSES.join(", ")}`);
    const wf = r.workforce || "unclassified";
    if (!(WORKFORCE_KINDS as readonly string[]).includes(wf)) err(`workforce must be one of ${WORKFORCE_KINDS.join(", ")}`);
    byWorkforce[wf] = (byWorkforce[wf] ?? 0) + 1;
    if (wf === "unclassified") warn("workforce is unclassified — paid (Sanctuary LV Group) vs volunteer (Sanctuary LV nonprofit) must be decided before approval");
    if (r.count !== undefined && r.count !== "") {
      const n = Number(r.count);
      if (!Number.isInteger(n) || n < 0) err("count must be a non-negative integer or blank (unknown)");
    }
    const note = `${r.title ?? ""} ${r.notes ?? ""}`.toLowerCase();
    if (wf === "paid_group" && /volunteer|nonprofit/.test(note)) err("paid_group role is described as volunteer/nonprofit — entity separation conflict");
    if (wf === "nonprofit_serve" && /\b(paid|wage|hourly|contractor|stipend)\b/.test(note)) err("nonprofit_serve role is described as paid — entity separation conflict");
    if (r.confirmation === "approved") warn("approved in the export — import keeps it 'proposed' until staff approve it in-app");
  });

  rows.forEach((r, idx) => {
    const sup = r.supervisor_role_key?.trim();
    if (sup && sup !== "founders" && !seen.has(sup))
      issues.push({ row: idx + 2, role_key: r.role_key || null, level: "error", message: `supervisor_role_key "${sup}" is not a role in this workbook` });
  });

  if (seen.size !== WORKBOOK_EXPECTED_ROLES)
    issues.push({ row: 0, role_key: null, level: "warning", message: `expected ${WORKBOOK_EXPECTED_ROLES} roles, found ${seen.size}` });

  return {
    rows: rows.length,
    uniqueRoles: seen.size,
    expectedRoles: WORKBOOK_EXPECTED_ROLES,
    missingColumns,
    issues,
    byWorkforce,
    ok: missingColumns.length === 0 && !issues.some((i) => i.level === "error"),
  };
}
