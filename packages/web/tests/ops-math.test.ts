import { describe, expect, test } from "bun:test";
import { addDays, overlaps, resolveMilestones, zonedToUtc } from "../src/api/ops/time";
import { computeMinutes } from "../src/api/ops/attendance";
import { peakConcurrent, roleGap, slotTotals } from "../src/api/ops/coverage";
import { createsCycle } from "../src/api/ops/org";

describe("reporting cycles", () => {
  test("self and indirect cycles rejected; unrelated branch allowed", () => {
    const edges = [{ child: "host", parent: "lead" }, { child: "lead", parent: "director" }];
    expect(createsCycle(edges, "director", "host")).toBe(true);
    expect(createsCycle(edges, "host", "host")).toBe(true);
    expect(createsCycle(edges, "content", "director")).toBe(false);
  });
});

describe("overnight and daylight-saving scheduling", () => {
  test("overnight LA milestones persist chronological UTC", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    const r = resolveMilestones("2026-11-14", [{ key: "doors", label: "Doors", local_time: "19:00", day_offset: 0 }, { key: "strike", label: "Strike", local_time: "01:00", day_offset: 1 }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.milestones[1]!.utc - r.milestones[0]!.utc).toBe(6 * 3600000);
  });
  test("spring-forward nonexistent time rejected", () => {
    expect(zonedToUtc("2026-03-08", "02:30")).toEqual({ ok: false, reason: "nonexistent" });
  });
  test("fall-back ambiguous time requires explicit earlier/later", () => {
    expect(zonedToUtc("2026-11-01", "01:30")).toMatchObject({ ok: false, reason: "ambiguous" });
    const a = zonedToUtc("2026-11-01", "01:30", undefined, "earlier");
    const b = zonedToUtc("2026-11-01", "01:30", undefined, "later");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.utc - a.utc).toBe(3600000);
  });
  test("invalid clocks and incompatible overlaps", () => {
    expect(zonedToUtc("2026-11-14", "25:00").ok).toBe(false);
    expect(overlaps(0, 10, 5, 15)).toBe(true);
    expect(overlaps(0, 10, 10, 15)).toBe(false);
  });
});

describe("staffing counts and provider substitutions", () => {
  test("provider fulfillment replaces demand, unknown is not zero", () => {
    expect(roleGap("paid_group", 2, [1], 1)).toEqual({ demand: 1, provider: 1, gap: 0 });
    expect(roleGap("paid_group", 2, [null], 0)).toEqual({ demand: null, provider: null, gap: null });
    expect(roleGap("venue_provider", 4, [4], 0)).toEqual({ demand: 0, provider: 4, gap: 0 });
    expect(roleGap("paid_group", null, [], 0).gap).toBeNull();
  });
  test("slots separate venue allowances and unknowns", () => {
    const r = slotTotals([{ role_key: "host", group_key: "gx", slot_class: "core", workforce: "paid_group", planned: 6 }, { role_key: "medical", group_key: "venue", slot_class: "venue", workforce: "venue_provider", planned: null }]);
    expect(r.sanctuarySlots).toBe(6);
    expect(r.venue.unknownRoles).toEqual(["medical"]);
  });
  test("peak concurrent uses half-open intervals, not sum of slots", () => {
    expect(peakConcurrent([{ start: 0, end: 10 }, { start: 10, end: 20 }])).toBe(1);
    expect(peakConcurrent([{ start: 0, end: 10 }, { start: 5, end: 20 }, { start: 7, end: 8 }])).toBe(3);
  });
});

describe("append-only attendance", () => {
  const entry = (id: string, kind: string, min: number, corrects_id: string | null = null) => ({ id, kind, at_utc: new Date(min * 60000), corrects_id });
  test("worked minutes subtract closed breaks", () => {
    expect(computeMinutes([entry("1", "check_in", 0), entry("2", "break_start", 60), entry("3", "break_end", 90), entry("4", "check_out", 120)])).toEqual({ minutes: 90, issues: [] });
  });
  test("void preserves original log while excluding entry", () => {
    expect(computeMinutes([entry("1", "check_in", 0), entry("2", "check_out", 120), entry("v", "void", 121, "2"), entry("3", "check_out", 150)])).toEqual({ minutes: 150, issues: [] });
  });
  test("missing checkout and double check-in flagged", () => {
    expect(computeMinutes([entry("1", "check_in", 0), entry("2", "check_in", 1)]).issues).toEqual(["Double check-in", "Open shift (no check-out)"]);
    expect(computeMinutes([entry("1", "check_out", 10)]).issues).toContain("Check-out without check-in");
  });
});