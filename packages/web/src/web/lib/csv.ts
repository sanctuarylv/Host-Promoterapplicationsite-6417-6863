/**
 * CSV helpers shared by every export in the staff tools.
 *
 * Formula-injection policy (OWASP "CSV injection"): any cell whose first
 * character is = + - @ TAB or CR is prefixed with a single quote so
 * spreadsheet apps treat it as text. One exemption: a pure E.164 phone
 * number (`+` followed by 7–15 digits and nothing else). Such a cell can only
 * ever evaluate to the same number literal — it cannot reference cells, call
 * functions or open links — so leaving it intact keeps phone columns
 * re-importable without opening an injection path. Anything else beginning
 * with `+` (e.g. `+1 702 555`, `+cmd|...`, `+HYPERLINK(...)`) is neutralised.
 */
export function csvCell(v: unknown): string {
  let s =
    v === null || v === undefined
      ? ""
      : Array.isArray(v)
        ? v.join("; ")
        : v instanceof Date
          ? v.toISOString()
          : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^\+\d{7,15}$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], cols: [string, (r: T) => unknown][]): string {
  return [cols.map(([h]) => csvCell(h)).join(","), ...rows.map((r) => cols.map(([, fn]) => csvCell(fn(r))).join(","))].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
