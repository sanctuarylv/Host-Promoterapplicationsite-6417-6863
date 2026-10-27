/**
 * Phase 4 interface specs — Command Center staffing exports and ticketing import.
 * Pure schema / builder tests. Nothing here is wired to the router or a network.
 */
import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  AssignmentExportSchema,
  buildAssignmentExport,
  buildTaxonomyExport,
  SPEC_STATUS,
  StaffingRoleSchema,
  TaxonomyExportSchema,
} from "../src/api/integrations/specs/command-center-staffing";
import { dryRunTicketingImport, TICKETING_SPEC_STATUS, TicketingImportSchema } from "../src/api/integrations/specs/ticketing-import";
import { PLACEHOLDER_DISPOSITIONS } from "../src/api/ops/staffing/role-map";
import { embeddedTaxonomy } from "../src/api/ops/staffing/status";

const WEB = resolve(import.meta.dir, "..");
const plan = embeddedTaxonomy().plan!;
const NONPROFIT_KEYS = Object.entries(PLACEHOLDER_DISPOSITIONS).filter(([, d]) => d.domain === "sanctuary_lv_nonprofit").map(([k]) => k);
const key = (s: string) => createHmac("sha256", "unit-test-secret").update(`guest:${s}`).digest("hex");

describe("spec status: not implemented, not wired", () => {
  test("status literals", () => {
    expect(SPEC_STATUS).toMatchObject({ implemented: false, wired: false, verified_against_real_api: false, contract: "sanctuary-cc.crew.proposed-v2" });
    expect(TICKETING_SPEC_STATUS).toMatchObject({ implemented: false, wired: false, provider: null });
  });
  test("no production source imports the specs; specs do no I/O", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
      }
    };
    walk(join(WEB, "src"));
    const importers = files.filter((f) => !f.includes("/integrations/specs/") && /integrations\/specs/.test(readFileSync(f, "utf8")));
    expect(importers).toEqual([]);
    for (const f of ["command-center-staffing.ts", "ticketing-import.ts"]) {
      const s = readFileSync(join(WEB, "src/api/integrations/specs", f), "utf8");
      expect(s).not.toMatch(/\bfetch\(|from "[^"]*database|process\.env|https?:\/\/(?!localhost)/);
    }
  });
});

describe("Command Center staffing.taxonomy.export", () => {
  const x = buildTaxonomyExport(plan, "2026-01-01T00:00:00.000Z");
  test("36 roles, Group entity only, pending classification, deterministic key", () => {
    expect(x.roles.length).toBe(36);
    expect(x.entity_id).toBe("sanctuary_lv_group");
    expect(x.plan_hash).toBe("8c22363803999b763305dc8961dcc6b7226271c15c28829ce14aff842cfcd701");
    expect(x.roles.every((r) => r.engagement_type === "pending_classification")).toBe(true);
    expect(buildTaxonomyExport(plan, "2026-01-01T00:00:00.000Z").idempotency_key).toBe(x.idempotency_key);
    for (const k of NONPROFIT_KEYS) expect(x.roles.map((r) => r.role_key)).not.toContain(k);
  });
  test("strict: unknown fields and classified engagement types are rejected", () => {
    expect(TaxonomyExportSchema.safeParse({ ...x, extra: 1 }).success).toBe(false);
    expect(StaffingRoleSchema.safeParse({ ...x.roles[0], engagement_type: "employee" }).success).toBe(false);
    expect(StaffingRoleSchema.safeParse({ ...x.roles[0], proposed_zones: ["roof"] }).success).toBe(false);
  });
});

describe("Command Center staffing.assignment.export", () => {
  const base = { revision: 1, event_id: "ev1", department_key: "guest_experience", shift_start_utc: new Date("2026-02-01T02:00:00Z"), shift_end_utc: null, shift_confirmed: true, zones: ["front_of_house"] };
  const rows = [
    { ...base, id: "a2", person_id: "p2", role_key: "host", status: "approved" },
    { ...base, id: "a1", person_id: "p1", role_key: "door_team", status: "approved" },
    { ...base, id: "a3", person_id: "p3", role_key: "host", status: "proposed" },
    { ...base, id: "a4", person_id: "p4", role_key: "host", status: "approved", event_id: "ev2" },
  ];
  const opts = { generated_at: "2026-01-01T00:00:00.000Z", canonicalByRoleKey: { host: "SLVG-EVT-007" }, excludedRoleKeys: NONPROFIT_KEYS };
  test("only approved rows for the event, sorted, no contact PII", () => {
    const x = buildAssignmentExport("ev1", rows, opts);
    expect(x.assignments.map((a) => a.assignment_id)).toEqual(["a1", "a2"]);
    expect(x.assignments[1]!.canonical_role_id).toBe("SLVG-EVT-007");
    expect(x.assignments[0]!.canonical_role_id).toBeNull();
    const json = JSON.stringify(x);
    for (const k of ["email", "phone", "first_name", "last_name", "pay", "notes"]) expect(json).not.toContain(`"${k}`);
    expect(AssignmentExportSchema.safeParse({ ...x, assignments: [{ ...x.assignments[0], email: "a@b.c" }] }).success).toBe(false);
  });
  test("idempotency key changes with revision", () => {
    const a = buildAssignmentExport("ev1", rows, opts).idempotency_key;
    const b = buildAssignmentExport("ev1", rows.map((r) => (r.id === "a1" ? { ...r, revision: 2 } : r)), opts).idempotency_key;
    expect(a).not.toBe(b);
  });
  test("nonprofit Serve Team roles are never exported", () => {
    expect(NONPROFIT_KEYS).toContain("serve_coordinator");
    expect(() => buildAssignmentExport("ev1", [{ ...base, id: "s1", person_id: "v1", role_key: "serve_coordinator", status: "approved" }], opts)).toThrow(/nonprofit Serve Team/);
  });
});

describe("ticketing import (dry run, no PII)", () => {
  const doc = {
    version: "ticketing-import.v0-proposed",
    provider: "example_tix",
    provider_event_ref: "EVT-1",
    event_id: "ev1",
    exported_at: "2026-02-02T00:00:00.000Z",
    attendees: [
      { attendee_ref: "ord-1.l1", ticket_type: "GA", registered_at: "2026-01-10T00:00:00.000Z", promo_code: "ab12", status: "valid" },
      { attendee_ref: "ord-1.l1", ticket_type: "GA", registered_at: "2026-01-11T00:00:00.000Z", promo_code: null, status: "valid" },
      { attendee_ref: "ord-2.l1", ticket_type: "GA", registered_at: "2026-01-12T00:00:00.000Z", promo_code: null, status: "refunded" },
      { attendee_ref: "ord-3.l1", ticket_type: "VIP", registered_at: "2026-01-13T00:00:00.000Z", promo_code: null, status: "valid" },
    ],
    scans: [
      { attendee_ref: "ord-1.l1", scanned_at: "2026-02-01T03:00:00.000Z", gate: "A" },
      { attendee_ref: "ord-1.l1", scanned_at: "2026-02-01T04:00:00.000Z", gate: "A" },
      { attendee_ref: "ord-2.l1", scanned_at: "2026-02-01T03:10:00.000Z", gate: null },
      { attendee_ref: "ord-9.l1", scanned_at: "2026-02-01T03:20:00.000Z", gate: null },
    ],
  };
  test("maps onto staging semantics: first registration wins, re-entry not double counted", () => {
    const r = dryRunTicketingImport(doc, key);
    expect(r.live).toBe(false);
    expect(r.applied).toBe(false);
    expect(r.totals).toEqual({ attendees: 4, registrations: 2, scans: 2, admitted: 1, reentries: 1 });
    expect(r.registrations[0]!.promo_code).toBe("AB12");
    expect(r.registrations.every((x) => x.source === "import" && /^[0-9a-f]{64}$/.test(x.guest_key))).toBe(true);
    expect(r.skipped).toEqual([
      { reason: "attendee_refunded", count: 1 },
      { reason: "duplicate_attendee", count: 1 },
      { reason: "scan_without_registration", count: 2 },
    ]);
    expect(JSON.stringify(r)).not.toContain("ord-1");
  });
  test("PII fields and identifying refs are rejected, not dropped", () => {
    const bad = (patch: object) => TicketingImportSchema.safeParse({ ...doc, attendees: [{ ...doc.attendees[0], ...patch }] }).success;
    expect(bad({ email: "guest@example.com" })).toBe(false);
    expect(bad({ name: "Pat" })).toBe(false);
    expect(bad({ phone: "+17025550100" })).toBe(false);
    expect(bad({ attendee_ref: "guest@example.com" })).toBe(false);
    expect(bad({ attendee_ref: "+17025550100" })).toBe(false);
    expect(TicketingImportSchema.safeParse({ ...doc, buyer_notes: "x" }).success).toBe(false);
    expect(TicketingImportSchema.safeParse(doc).success).toBe(true);
  });
});
