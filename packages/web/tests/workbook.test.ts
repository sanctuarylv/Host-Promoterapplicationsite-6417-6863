import { describe, expect, test } from "bun:test";
import { parseCsv, validateWorkbook } from "../src/api/ops/workbook";

const HEADER = "role_key,title,department_key,slot_class,workforce,count,supervisor_role_key,notes";

describe("workbook validator (dry run, pure)", () => {
  test("parses quoted CSV with commas, escaped quotes and CRLF", () => {
    const rows = parseCsv(`${HEADER}\r\nhost,"Host, front ""door""",guest_experience,core,paid_group,6,,\r\n`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('Host, front "door"');
    expect(rows[0]?.count).toBe("6");
  });

  test("flags duplicates, unknown supervisors, bad enums and the 36-role expectation", () => {
    const csv = [
      HEADER,
      "host,Host,guest_experience,core,paid_group,6,lead_missing,",
      "host,Host again,guest_experience,core,paid_group,1,,",
      "runner,Runner,operations,banana,contractor,-1,,",
    ].join("\n");
    const r = validateWorkbook(parseCsv(csv));
    expect(r.ok).toBe(false);
    const msgs = r.issues.map((i) => i.message).join("\n");
    expect(msgs).toContain("duplicate role_key");
    expect(msgs).toContain('supervisor_role_key "lead_missing"');
    expect(msgs).toContain("slot_class must be one of");
    expect(msgs).toContain("workforce must be one of");
    expect(msgs).toContain("non-negative integer");
    expect(msgs).toContain("expected 36 roles, found 2");
  });

  test("enforces paid Group vs nonprofit Serve separation", () => {
    const csv = [HEADER, "host,Host,guest_experience,core,paid_group,6,,volunteer welcome team", "serve,Serve Team,operations,core,nonprofit_serve,4,,hourly paid"].join("\n");
    const errs = validateWorkbook(parseCsv(csv)).issues.filter((i) => i.message.includes("entity separation"));
    expect(errs).toHaveLength(2);
  });

  test("a clean 36-role export is valid; unclassified and approved only warn", () => {
    const rows = Array.from({ length: 36 }, (_, i) => `role_${i},Role ${i},operations,core,${i === 0 ? "unclassified" : "paid_group"},1,${i ? "role_0" : ""},`);
    const r = validateWorkbook(parseCsv([HEADER, ...rows].join("\n")));
    expect(r.ok).toBe(true);
    expect(r.uniqueRoles).toBe(36);
    expect(r.issues.every((i) => i.level === "warning")).toBe(true);
  });

  test("missing required columns fail", () => {
    const r = validateWorkbook(parseCsv("role_key,title\nhost,Host"));
    expect(r.ok).toBe(false);
    expect(r.missingColumns).toContain("workforce");
  });
});
