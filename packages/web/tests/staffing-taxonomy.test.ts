/**
 * 36-role canonical staffing taxonomy importer (§35).
 * Pure tests plus one disposable temp-file DB for apply-twice / zero-write proofs.
 * Never touches the root .env database: every spawned process gets an explicit file: URL.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ROLE_OPTIONS } from "../src/api/crew/contract";
import { taxonomyReadiness } from "../src/api/crew/production";
import type { WorkbookRow } from "../src/api/ops/workbook";
import { AFTER_DARK_V1_ROLES } from "../src/api/ops/staffing/after-dark-v1";
import { adaptCanonicalRows, CANONICAL_V1_COLUMNS, detectFormat, parseSource, type CanonicalRole } from "../src/api/ops/staffing/canonical";
import { CANONICAL_V1_CSV, CANONICAL_V1_FILE, CANONICAL_V1_SHA256 } from "../src/api/ops/staffing/canonical-source";
import { mapCredential } from "../src/api/ops/staffing/credentials";
import { baselinePlanHash, checkIntegrity, REVIEWED_BASELINE, REVIEWED_PLAN_SHA256 } from "../src/api/ops/staffing/integrity";
import { buildTaxonomyReview, RUNNER_ROLE_KEY } from "../src/api/ops/staffing/review";
import { buildImportPlan, diffWrites, IMPORT_STATUS_BANNER, recordsForApply, stableStringify } from "../src/api/ops/staffing/plan";
import { CANONICAL_ROLE_MAP, PUBLIC_ROLE_RENAMES, REVIEWED_SOURCE_SHA256, type CanonicalMapEntry } from "../src/api/ops/staffing/role-map";
import { EMBEDDED_SOURCE, embeddedTaxonomy, TAXONOMY_STAGE_LABEL, TAXONOMY_STAGES, taxonomyStage } from "../src/api/ops/staffing/status";
import { mapTraining } from "../src/api/ops/staffing/training";

const WEB = resolve(import.meta.dir, "..");
const CSV_PATH = join(WEB, "data/staffing/sanctuary_lv_group_36_role_canonical_v1.csv");
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

const baseRows = () => parseSource(CANONICAL_V1_CSV, "csv").rows.map((r) => ({ ...r }));
const toCsv = (rows: WorkbookRow[]) => {
  const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [CANONICAL_V1_COLUMNS.join(","), ...rows.map((r) => CANONICAL_V1_COLUMNS.map((c) => q(r[c] ?? "")).join(","))].join("\r\n") + "\r\n";
};
const withRow = (id: string, patch: Record<string, string>) => baseRows().map((r) => (r.role_id === id ? { ...r, ...patch } : r));
const codes = (rows: WorkbookRow[], map?: Record<string, CanonicalMapEntry>) => adaptCanonicalRows(rows, map).errors.map((e) => e.code);
const plan = (text = CANONICAL_V1_CSV, extra: Partial<Parameters<typeof buildImportPlan>[0]> = {}) =>
  buildImportPlan({ text, kind: "csv", source_file: CANONICAL_V1_FILE, generated_at: "2026-01-01T00:00:00.000Z", ...extra });

const good = adaptCanonicalRows(baseRows());
const byKey = new Map<string, CanonicalRole>(good.roles.map((r) => [r.role_key, r]));
const supOf = (k: string) => {
  const s = byKey.get(k)?.reports_to_role;
  return s?.kind === "role" ? s.role_key : s?.kind === "org_unit" ? `org:${s.key}` : null;
};

describe("source + hash", () => {
  test("embedded copy is byte-identical to the committed file and the reviewed hash", () => {
    const fileHash = sha(readFileSync(CSV_PATH));
    expect(fileHash).toBe(CANONICAL_V1_SHA256);
    expect(sha(CANONICAL_V1_CSV)).toBe(CANONICAL_V1_SHA256);
    expect(REVIEWED_SOURCE_SHA256).toBe(CANONICAL_V1_SHA256);
  });
  test("plan records the source hash and file", () => {
    const p = plan();
    expect(p.source_hash).toBe(CANONICAL_V1_SHA256);
    expect(p.source_file).toBe(CANONICAL_V1_FILE);
    expect(p.import_status).toBe(IMPORT_STATUS_BANNER);
  });
});

describe("parsing", () => {
  test("canonical CSV parses 36 rows with the full canonical header", () => {
    const p = parseSource(CANONICAL_V1_CSV, "csv");
    expect(p.malformed).toEqual([]);
    expect(p.rows).toHaveLength(36);
    expect(detectFormat(p.header).format).toBe("canonical_v1");
    expect(good.errors).toEqual([]);
    expect(good.roles).toHaveLength(36);
  });
  test("canonical JSON (array or {roles}) parses to the same 36 roles", () => {
    const rows = baseRows();
    for (const text of [JSON.stringify(rows), JSON.stringify({ roles: rows })]) {
      const j = parseSource(text, "json");
      expect(detectFormat(j.header).format).toBe("canonical_v1");
      const res = adaptCanonicalRows(j.rows);
      expect(res.errors).toEqual([]);
      expect(res.roles.map((r) => r.canonical_role_id)).toEqual(good.roles.map((r) => r.canonical_role_id));
    }
    const jp = buildImportPlan({ text: JSON.stringify(rows), kind: "json", source_file: "x.json" });
    expect(jp.ok).toBe(true);
    expect(jp.canonical_roles.total).toBe(36);
  });
  test("required headers validated: a missing column is not silently accepted", () => {
    const lines = CANONICAL_V1_CSV.split("\r\n");
    const header = lines[0]!.split(",");
    const drop = header.indexOf("headcount_model");
    const text = lines.map((l, i) => (i === 0 ? header.filter((_, j) => j !== drop).join(",") : l)).join("\r\n");
    expect(detectFormat(parseSource(text, "csv").header).format).toBeNull();
    const p = plan(text);
    expect(p.ok).toBe(false);
    expect(p.errors.map((e) => e.code)).toContain("unknown_format");
  });
  test("malformed files are rejected", () => {
    const bad = plan(`${CANONICAL_V1_CSV}SLVG-EVT-099,"unterminated\r\n`);
    expect(bad.ok).toBe(false);
    expect(bad.errors.map((e) => e.code)).toContain("malformed");
    expect(plan("").ok).toBe(false);
    expect(buildImportPlan({ text: "{not json", kind: "json", source_file: "x.json" }).errors[0]?.code).toBe("malformed");
    expect(buildImportPlan({ text: '{"a":1}', kind: "json", source_file: "x.json" }).ok).toBe(false);
  });
  test("legacy six-column format is still recognised (validate only, never written)", () => {
    const legacy = "role_key,title,department_key,slot_class,workforce,count\nhost,Host,guest_experience,core,paid_group,6\n";
    const p = plan(legacy);
    expect(p.schema_version).toBe("legacy");
    expect(p.ok).toBe(false);
    expect(p.proposed_writes.operations).toEqual([]);
  });
});

describe("identity", () => {
  test("36 unique canonical ids SLVG-EVT-001..036", () => {
    const ids = good.roles.map((r) => r.canonical_role_id);
    expect(new Set(ids).size).toBe(36);
    expect(ids[0]).toBe("SLVG-EVT-001");
    expect(ids[35]).toBe("SLVG-EVT-036");
  });
  test("duplicate canonical id rejected", () => {
    const rows = baseRows();
    rows[1] = { ...rows[1]!, role_id: rows[0]!.role_id };
    expect(codes(rows)).toContain("duplicate_id");
  });
  test("unmapped id and bad id rejected — identity is never guessed", () => {
    expect(codes(withRow("SLVG-EVT-036", { role_id: "SLVG-EVT-037" }))).toContain("unmapped_id");
    expect(codes(withRow("SLVG-EVT-036", { role_id: "EVT-36" }))).toContain("bad_id");
  });
  test("existing role keys preserved and canonical id attaches to them", () => {
    for (const e of Object.values(CANONICAL_ROLE_MAP)) if (e.legacy_key) expect(e.role_key).toBe(e.legacy_key);
    expect(byKey.get("guest_experience_lead")?.canonical_role_id).toBe("SLVG-EVT-005");
    expect(byKey.get("guest_experience_lead")?.display_name).toBe("Guest Experience Manager");
    expect(byKey.get("host")?.canonical_role_id).toBe("SLVG-EVT-007");
    expect(byKey.get("promoter")?.canonical_role_id).toBe("SLVG-EVT-016");
    const bad = { ...CANONICAL_ROLE_MAP, "SLVG-EVT-007": { ...CANONICAL_ROLE_MAP["SLVG-EVT-007"]!, role_key: "host_v2" } };
    expect(codes(baseRows(), bad)).toContain("legacy_key_not_preserved");
  });
  test("a map that claims one legacy role twice is rejected", () => {
    const bad = { ...CANONICAL_ROLE_MAP, "SLVG-EVT-006": { role_key: "host", match: "partial" as const, legacy_key: "host", note: "" } };
    expect(codes(baseRows(), bad)).toContain("duplicate_mapping");
  });
});

describe("mapping classes", () => {
  const p = plan();
  const cls = (id: string) => p.canonical_roles.roles.find((r) => r.canonical_role_id === id)?.match;
  test("exact / rename / partial / new", () => {
    expect(cls("SLVG-EVT-007")).toBe("exact");
    expect(cls("SLVG-EVT-001")).toBe("rename");
    expect(cls("SLVG-EVT-016")).toBe("partial");
    expect(cls("SLVG-EVT-006")).toBe("new");
    expect([p.canonical_roles.exact, p.canonical_roles.renamed, p.canonical_roles.partial, p.canonical_roles.new]).toEqual([3, 7, 7, 19]);
  });
  test("excluded / external / separate-domain / unresolved existing roles are preserved, not imported", () => {
    const keys = (xs: { role_key: string }[]) => xs.map((x) => x.role_key);
    expect(keys(p.existing_roles.excluded)).toEqual(["serve_coordinator"]);
    expect(keys(p.existing_roles.external)).toContain("venue_security_supervisor");
    expect(p.existing_roles.external).toHaveLength(7);
    expect(keys(p.existing_roles.separate_domain)).toEqual(expect.arrayContaining(["content_director", "music_director", "prayer_team", "founder"]));
    expect(p.existing_roles.separate_domain).toHaveLength(10);
    expect(keys(p.existing_roles.unresolved)).toEqual(["runner"]);
    const imported = new Set(p.canonical_roles.roles.map((r) => r.role_key));
    for (const k of ["serve_coordinator", "venue_medical", "content_director", "runner", "founder"]) expect(imported.has(k)).toBe(false);
  });
  test("map is deterministic: same input ⇒ same plan_hash, independent of generated_at", () => {
    const a = plan(CANONICAL_V1_CSV, { generated_at: "2020-01-01T00:00:00.000Z" });
    const b = plan(CANONICAL_V1_CSV, { generated_at: "2030-01-01T00:00:00.000Z" });
    expect(a.plan_hash).toBe(b.plan_hash);
    const { generated_at: _a, ...ra } = a;
    const { generated_at: _b, ...rb } = b;
    expect(stableStringify(ra)).toBe(stableStringify(rb));
  });
});

describe("organizational boundary + classification", () => {
  test("every role is sanctuary_lv_group · paid · pending_classification", () => {
    for (const r of good.roles) {
      expect(r.entity_id).toBe("sanctuary_lv_group");
      expect(r.opportunity_type).toBe("paid");
      expect(r.engagement_type).toBe("pending_classification");
    }
  });
  test("sanctuary_lv_group + paid cannot silently become sanctuary_lv + volunteer", () => {
    expect(codes(withRow("SLVG-EVT-007", { entity_id: "sanctuary_lv" }))).toContain("nonprofit_conversion");
    expect(codes(withRow("SLVG-EVT-007", { opportunity_type: "Volunteer" }))).toContain("nonprofit_conversion");
    expect(codes(withRow("SLVG-EVT-007", { entity_id: "someone_else" }))).toContain("unknown_entity");
    const toServe = { ...CANONICAL_ROLE_MAP, "SLVG-EVT-013": { role_key: "serve_coordinator", match: "partial" as const, legacy_key: "serve_coordinator", note: "" } };
    expect(codes(baseRows(), toServe)).toContain("nonprofit_conversion");
    const toVenue = { ...CANONICAL_ROLE_MAP, "SLVG-EVT-031": { role_key: "venue_medical", match: "partial" as const, legacy_key: "venue_medical", note: "" } };
    expect(codes(baseRows(), toVenue)).toContain("external_conversion");
    expect(plan(toCsv(withRow("SLVG-EVT-007", { entity_id: "sanctuary_lv", opportunity_type: "Volunteer" }))).ok).toBe(false);
  });
  test("classification is never inferred: employee / contractor / blank are rejected", () => {
    for (const v of ["employee", "contractor", "W2", "1099"]) expect(codes(withRow("SLVG-EVT-002", { engagement_type: v }))).toContain("invalid_engagement");
    expect(codes(withRow("SLVG-EVT-002", { engagement_type: "" }))).toContain("missing_field");
  });
});

describe("reporting", () => {
  test("Host → Lead Host → Guest Experience Manager", () => {
    expect(supOf("host")).toBe("lead_host");
    expect(supOf("lead_host")).toBe("guest_experience_lead");
  });
  test("Promoter → Lead Promoter → Promoter Manager", () => {
    expect(supOf("promoter")).toBe("lead_promoter");
    expect(supOf("lead_promoter")).toBe("promoter_manager");
  });
  test("founders (Erskine / Andrea) resolve to the founders org unit, not a person", () => {
    expect(supOf("event_director")).toBe("org:founders");
  });
  test("invalid supervisor and cycles fail validation", () => {
    expect(codes(withRow("SLVG-EVT-007", { reports_to: "Nobody In Particular" }))).toContain("unresolved_supervisor");
    expect(plan(toCsv(withRow("SLVG-EVT-007", { reports_to: "Nobody In Particular" }))).ok).toBe(false);
    expect(codes(withRow("SLVG-EVT-007", { reports_to: "Host" }))).toContain("supervisor_cycle");
    expect(codes(withRow("SLVG-EVT-006", { reports_to: "Host" }))).toContain("supervisor_cycle");
  });
  test("the six supervisor changes are in the reconciliation evidence", () => {
    const ids = plan().supervisor_changes.map((s) => s.canonical_role_id);
    expect(ids).toEqual(["SLVG-EVT-003", "SLVG-EVT-005", "SLVG-EVT-007", "SLVG-EVT-009", "SLVG-EVT-016", "SLVG-EVT-025"]);
  });
});

describe("headcount", () => {
  const p = plan();
  test("canonical baseline = 66, promoter = 8, models are first-class", () => {
    expect(p.headcount.canonical_baseline_total).toBe(66);
    expect(p.headcount.promoter_baseline).toBe(8);
    expect(p.headcount.by_model).toEqual({ required: { roles: 17, seats: 17 }, recommended: { roles: 2, seats: 2 }, scalable: { roles: 9, seats: 39 }, event_specific: { roles: 8, seats: 8 } });
    for (const r of good.roles) {
      expect(typeof r.baseline_headcount).toBe("number");
      expect(r.headcount_model).toBeTruthy();
      expect(r.seniority).toBeTruthy();
      expect(r.event_applicability).toBeTruthy();
    }
  });
  test("scalable headcount stays configurable (a different baseline is accepted and flows to the preview)", () => {
    expect(byKey.get("promoter")?.headcount_model).toBe("scalable");
    const q = plan(toCsv(withRow("SLVG-EVT-016", { baseline_headcount: "12" })), { source_hash: undefined });
    expect(q.ok).toBe(true);
    expect(q.headcount.promoter_baseline).toBe(12);
    expect(q.after_dark_vnext?.rows.find((r) => r.role_key === "promoter")?.proposed_count).toBe(12);
    expect(codes(withRow("SLVG-EVT-016", { baseline_headcount: "-1" }))).toContain("invalid_headcount");
    expect(codes(withRow("SLVG-EVT-016", { headcount_model: "Elastic" }))).toContain("invalid_headcount_model");
  });
  test("66 seats are not assigned to any event", () => {
    expect(p.headcount.assignments_created).toBe(0);
    expect(p.proposed_writes.tables_written_on_apply).toEqual(["ops_canonical_roles"]);
    expect(p.proposed_writes.never_written.join(" ")).toContain("ops_assignments");
    expect(p.proposed_writes.applied).toBe(false);
  });
});

describe("credentials", () => {
  test("known mapping resolves to existing zones", () => {
    const m = mapCredential("X", "x", "Production / Backstage");
    expect(m.status).toBe("mapped");
    expect(m.proposed_zones).toEqual(["back_of_house", "stage"]);
  });
  test("unknown or conditional text warns and grants nothing", () => {
    const u = mapCredential("X", "x", "Laser Vault Master Key");
    expect(u.status).toBe("unresolved");
    expect(u.proposed_zones).toEqual([]);
    expect(u.gaps.length).toBeGreaterThan(0);
    const c = mapCredential("X", "x", "VIP as required");
    expect(c.proposed_zones).toEqual([]);
    expect(c.tokens[0]?.kind).toBe("conditional");
  });
  test("the plan never writes credentials, zones or permissions", () => {
    const p = plan();
    expect(p.proposed_writes.never_written.join(" ")).toContain("ops_credentials");
    expect(p.credential_mappings).toHaveLength(36);
    expect(p.warnings.filter((w) => w.code === "credential_gap").length).toBeGreaterThan(0);
  });
});

describe("training", () => {
  test("known phrases map to existing module keys; unknown stays unresolved", () => {
    const m = mapTraining("X", "x", "Event briefing, Hospitality; Quantum juggling");
    expect(m.module_keys).toEqual(["event_orientation", "guest_service_fundamentals"]);
    expect(m.unresolved).toEqual(["Quantum juggling"]);
    expect(m.status).toBe("partial");
    expect(mapTraining("X", "x", "Quantum juggling").status).toBe("unresolved");
  });
  test("a mapping is a requirement, never a completion", () => {
    const m = mapTraining("X", "x", "Event briefing");
    expect(Object.keys(m)).not.toContain("completed");
    expect(plan().proposed_writes.never_written.join(" ")).toContain("crew_training_records");
  });
});

describe("After Dark + public roles", () => {
  const p = plan();
  test("vNext is preview-only; v1 stays as seeded", () => {
    expect(p.after_dark_vnext?.status).toBe("preview_only");
    expect(p.after_dark_vnext?.based_on_version).toBe(1);
    expect(AFTER_DARK_V1_ROLES).toHaveLength(36);
    expect(AFTER_DARK_V1_ROLES.filter((r) => r.wf !== "venue_provider").reduce((a, r) => a + (r.n ?? 0), 0)).toBe(51);
    expect(p.after_dark_vnext?.counts.removed).toBe(0);
    expect(p.after_dark_vnext?.counts.carried_forward).toBe(19);
    expect(p.proposed_writes.never_written.join(" ")).toContain("ops_template_roles");
  });
  test("public roles stay curated; the GEM rename is prepared, not applied, and the key is kept", () => {
    expect(ROLE_OPTIONS.map((o) => o.value)).toEqual(["host", "promoter", "both", "not_sure", "guest_experience_lead", "promoter_manager"]);
    expect(p.public_roles.exposed_by_taxonomy).toEqual([]);
    expect(PUBLIC_ROLE_RENAMES[0]).toMatchObject({ role_key: "guest_experience_lead", status: "prepared_not_applied" });
    expect(ROLE_OPTIONS.find((o) => o.value === "guest_experience_lead")?.label).toBe("Guest Experience Lead");
  });
});

describe("idempotency (pure)", () => {
  const recs = recordsForApply({ text: CANONICAL_V1_CSV, kind: "csv", source_file: CANONICAL_V1_FILE });
  test("against itself every row is unchanged; a changed field is an update; a stolen key is a conflict", () => {
    expect(diffWrites(recs, []).every((o) => o.op === "insert")).toBe(true);
    expect(diffWrites(recs, recs).every((o) => o.op === "unchanged")).toBe(true);
    const edited = recs.map((r) => (r.role_key === "host" ? { ...r, baseline_headcount: 99 } : r));
    expect(diffWrites(recs, edited).filter((o) => o.op === "update").map((o) => o.role_key)).toEqual(["host"]);
    const thief = [{ ...recs[0]!, canonical_role_id: "SLVG-EVT-900", role_key: "host" }];
    const p = plan(CANONICAL_V1_CSV, { existing: thief });
    expect(p.ok).toBe(false);
    expect(p.errors.map((e) => e.code)).toContain("target_conflict");
  });
});

describe("readiness", () => {
  test("no stage is 'imported' and the row is never a pass", () => {
    expect(TAXONOMY_STAGES as readonly string[]).not.toContain("imported");
    for (const s of TAXONOMY_STAGES) {
      const r = taxonomyReadiness(s);
      expect(r.key).toBe("staffing_taxonomy");
      expect(r.label).toBe("36-Role Staffing Taxonomy");
      expect(r.state).not.toBe("pass");
      expect(r.stage_label).toBe(TAXONOMY_STAGE_LABEL[s]);
      expect(`${r.stage_label} ${r.detail}`).not.toMatch(/\bImported\b/);
      expect(r.detail).toContain("nothing imported");
    }
  });
  test("stage transitions: none → not supplied, invalid → failed, unreviewed → ready, reviewed → pending approval", () => {
    expect(taxonomyStage(null).stage).toBe("not_supplied");
    expect(taxonomyStage({ text: "role_id\n", source_file: "x", source_hash: "0" }).stage).toBe("validation_failed");
    expect(taxonomyStage({ text: CANONICAL_V1_CSV, source_file: "x", source_hash: CANONICAL_V1_SHA256 }, "different").stage).toBe("reconciliation_ready");
    expect(embeddedTaxonomy().stage).toBe("import_pending_approval");
    expect(taxonomyReadiness().stage_label).toBe("Import pending approval");
  });
  test("five stages; reviewed source with a drifted plan hash is a baseline mismatch, never pending approval", () => {
    expect(TAXONOMY_STAGES.length).toBe(5);
    expect(TAXONOMY_STAGES.indexOf("baseline_mismatch")).toBe(TAXONOMY_STAGES.indexOf("reconciliation_ready") + 1);
    expect(TAXONOMY_STAGES.indexOf("import_pending_approval")).toBe(TAXONOMY_STAGES.indexOf("baseline_mismatch") + 1);
    expect(taxonomyStage(EMBEDDED_SOURCE, REVIEWED_SOURCE_SHA256, "different").stage).toBe("baseline_mismatch");
    expect(TAXONOMY_STAGE_LABEL.baseline_mismatch).toMatch(/Baseline mismatch/);
    expect(taxonomyReadiness("baseline_mismatch").detail).toContain("nothing imported");
  });
  test("plan hash is path-independent: same bytes at another path still reach pending approval", () => {
    const moved = { text: CANONICAL_V1_CSV, source_hash: CANONICAL_V1_SHA256, source_file: "/tmp/elsewhere/workbook.csv" };
    expect(taxonomyStage(moved).stage).toBe("import_pending_approval");
    expect(baselinePlanHash(CANONICAL_V1_CSV, "csv", CANONICAL_V1_SHA256)).toBe(REVIEWED_PLAN_SHA256);
  });
});

describe("integrity (Phase 2 baseline)", () => {
  test("embedded source and plan match the reviewed baseline", () => {
    const { plan: p } = embeddedTaxonomy();
    const i = checkIntegrity(p!.source_hash, p!.plan_hash);
    expect(i.ok).toBe(true);
    expect(i.checks.map((c) => [c.key, c.match])).toEqual([["source_hash", true], ["plan_hash", true]]);
    expect(REVIEWED_BASELINE.commit.startsWith("065013b")).toBe(true);
    expect(REVIEWED_BASELINE.source_sha256).toBe("36dac8e8c7eb7ac529e25cdb217dc758582e6fecc4556163b81ad0ab35cf8892");
    expect(REVIEWED_BASELINE.plan_sha256).toBe("8c22363803999b763305dc8961dcc6b7226271c15c28829ce14aff842cfcd701");
  });
  test("any drift fails closed", () => {
    expect(checkIntegrity(CANONICAL_V1_SHA256, "x").ok).toBe(false);
    expect(checkIntegrity("x", REVIEWED_PLAN_SHA256).ok).toBe(false);
    expect(checkIntegrity(null, null).ok).toBe(false);
    const edited = toCsv(withRow("SLVG-EVT-007", { baseline_headcount: "7" }));
    expect(baselinePlanHash(edited, "csv", sha(edited))).not.toBe(REVIEWED_PLAN_SHA256);
  });
});

describe("Phase 3 review (pure, read-only)", () => {
  const p = embeddedTaxonomy().plan!;
  const live = { stored_canonical_roles: null, after_dark_versions: [{ version: 1, status: "active" }] };
  const r = buildTaxonomyReview(p, checkIntegrity(p.source_hash, p.plan_hash), live);

  test("role review: 36 roles / 66 seats, balancing against the plan", () => {
    expect(r.read_only).toBe(true);
    expect(r.role_review.rows.length).toBe(36);
    expect(r.role_review.totals).toEqual({ roles: 36, seats: 66, plan_roles: 36, plan_seats: 66, balances: true });
    for (const g of [r.role_review.by_model, r.role_review.by_department, r.role_review.by_match]) {
      expect(g.reduce((a, x) => a + x.roles, 0)).toBe(36);
      expect(g.reduce((a, x) => a + x.seats, 0)).toBe(66);
    }
  });
  test("runner stays unresolved with no decision, four unranked options", () => {
    const d = r.runner_decision;
    expect(d.role_key).toBe(RUNNER_ROLE_KEY);
    expect(d.classification).toBe("unresolved");
    expect(d.status).toBe("awaiting_human_decision");
    expect(d.decision).toBeNull();
    expect(d.decided_by).toBeNull();
    expect(d.decided_at).toBeNull();
    expect(d.options.map((o) => o.key)).toEqual(["keep_outside_taxonomy", "map_to_setup_breakdown_crew", "add_canonical_role", "retire_from_future_templates"]);
    expect(d.current.v1_count).toBe(2);
    expect(d.current.vnext_count).toBe(2);
    expect(Object.values(CANONICAL_ROLE_MAP).some((m) => m.role_key === RUNNER_ROLE_KEY || m.legacy_key === RUNNER_ROLE_KEY)).toBe(false);
    expect(r.role_review.rows.some((x) => x.role_key === RUNNER_ROLE_KEY)).toBe(false);
  });
  test("credential + training reviews cover every partial / unresolved mapping and grant nothing", () => {
    const credGaps = p.credential_mappings.filter((c) => c.status !== "mapped");
    expect(r.credential_review.rows.length).toBe(credGaps.length);
    expect(r.credential_review.counts).toEqual({ mapped: 27, partial: 1, unresolved: 8 });
    expect(r.credential_review.rows.every((c) => c.granted === false)).toBe(true);
    expect(r.credential_review.covers_all_gaps).toBe(true);
    const trainGaps = p.training_mappings.filter((t) => t.status !== "mapped");
    expect(r.training_review.rows.length).toBe(trainGaps.length);
    expect(r.training_review.counts).toEqual({ mapped: 1, partial: 21, unresolved: 14 });
    expect(r.training_review.rows.every((t) => t.completion_created === false)).toBe(true);
    expect(r.training_review.covers_all_gaps).toBe(true);
  });
  test("template comparison: 51 → 72 and the bridge balances", () => {
    const t = r.template_comparison!;
    expect(t.totals).toEqual({ v1: 51, vnext: 72, delta: 21 });
    expect(t.bridge_balances).toBe(true);
    expect(t.bridge.reduce((a, b) => a + b.seats, 0)).toBe(72);
    expect(t.by_workforce.reduce((a, w) => a + w.v1, 0)).toBe(51);
    expect(t.by_workforce.reduce((a, w) => a + w.vnext, 0)).toBe(72);
    expect(t.status).toBe("preview_only");
  });
  test("nonprofit Serve Team is separate", () => {
    expect(r.separation.canonical_entities).toEqual(["sanctuary_lv_group"]);
    expect(r.separation.nonprofit_roles_in_taxonomy).toBe(0);
    expect(r.separation.excluded_nonprofit_roles).toContain("serve_coordinator");
  });
  test("checklist: automated evidence passes, every human authorization pending, production not authorized", () => {
    const c = r.approval_checklist;
    expect(c.production_authorized).toBe(false);
    expect(c.automated.length).toBe(12);
    expect(c.automated.every((a) => a.status === "pass")).toBe(true);
    expect(c.automated_ok).toBe(true);
    expect(c.recorded.length).toBe(8);
    expect(c.human.length).toBe(10);
    for (const h of c.human) {
      expect(h.status).toBe("pending");
      expect(h.authorized_by).toBeNull();
      expect(h.authorized_at).toBeNull();
    }
    // Automated evidence never satisfies a human authorization.
    expect(new Set(c.automated.map((a) => a.key)).size + new Set(c.human.map((h) => h.key)).size).toBe(22);
  });
  test("automated evidence fails on hash drift, stored rows or a vNext template version", () => {
    const bad = buildTaxonomyReview(p, checkIntegrity(p.source_hash, p.plan_hash, { source: "x", plan: "y" }), live);
    const st = (rv: typeof r, k: string) => rv.approval_checklist.automated.find((a) => a.key === k)!.status;
    expect(st(bad, "source_hash")).toBe("fail");
    expect(st(bad, "plan_hash")).toBe("fail");
    expect(bad.approval_checklist.automated_ok).toBe(false);
    expect(bad.approval_checklist.production_authorized).toBe(false);
    const imported = buildTaxonomyReview(p, checkIntegrity(p.source_hash, p.plan_hash), { ...live, stored_canonical_roles: 36 });
    expect(st(imported, "nothing_imported")).toBe("fail");
    const activated = buildTaxonomyReview(p, checkIntegrity(p.source_hash, p.plan_hash), { ...live, after_dark_versions: [{ version: 1, status: "archived" }, { version: 2, status: "active" }] });
    expect(st(activated, "no_template_activation")).toBe("fail");
    const unreadable = buildTaxonomyReview(p, checkIntegrity(p.source_hash, p.plan_hash), { stored_canonical_roles: null, after_dark_versions: null });
    expect(st(unreadable, "no_template_activation")).toBe("not_available");
  });
});

// ── Disposable temp DB: dry run writes nothing; apply twice is idempotent; history untouched ──
describe("importer CLI on a disposable local DB", () => {
  const dir = mkdtempSync(join(tmpdir(), "taxonomy-test-"));
  const dbFile = join(dir, "crew.db");
  const url = `file:${dbFile}`;
  const out = join(dir, "plan.json");
  type Lib = { execute: (q: string | { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }>; close: () => void };
  let c: Lib;
  const run = (...args: string[]) => {
    const env = { ...process.env, DATABASE_URL: url, DATABASE_AUTH_TOKEN: "local-file" };
    const r = Bun.spawnSync(["bun", "scripts/workbook-import.ts", "--file", CSV_PATH, "--out", out, ...args], { cwd: WEB, env });
    return { code: r.exitCode, out: `${r.stdout.toString()}${r.stderr.toString()}` };
  };
  const q = async (s: string) => (await c.execute(s)).rows;

  beforeAll(async () => {
    const { createClient } = await import("@libsql/client");
    c = createClient({ url }) as unknown as Lib;
    const files = readdirSync(join(WEB, "drizzle")).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files)
      for (const stmt of readFileSync(join(WEB, "drizzle", f), "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) await c.execute(stmt);
    await c.execute({
      sql: "insert into ops_assignments (id, event_id, person_id, role_key, department_key, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: ["asg-hist-1", "evt-past", "person-1", "guest_experience_lead", "guest_experience", "completed", "test", 1700000000000, 1700000000000],
    });
    c.close();
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("dry run (no target and --target local) performs zero database writes", () => {
    const before = sha(readFileSync(dbFile));
    const a = run("--dry-run");
    expect(a.code).toBe(0);
    expect(a.out).toContain("DRY RUN, nothing written");
    const b = run("--dry-run", "--target", "local");
    expect(b.code).toBe(0);
    expect(b.out).toContain("insert 36");
    expect(sha(readFileSync(dbFile))).toBe(before);
  });
  test("apply is refused for non-local targets and without the source hash", () => {
    expect(run("--apply", "--target", "production").code).toBe(2);
    expect(run("--apply", "--target", "local").code).toBe(2);
    expect(run("--apply", "--target", "local", "--confirm-source-hash=deadbeef").code).toBe(2);
  });
  test("apply is refused without, or with a wrong, --confirm-plan-hash (Phase 2 baseline pin)", () => {
    const noPlan = run("--apply", "--target", "local", `--confirm-source-hash=${CANONICAL_V1_SHA256}`);
    expect(noPlan.code).toBe(2);
    expect(noPlan.out).toContain("integrity source_hash: MATCH");
    expect(noPlan.out).toContain("integrity plan_hash: MATCH");
    expect(run("--apply", "--target", "local", `--confirm-source-hash=${CANONICAL_V1_SHA256}`, "--confirm-plan-hash=deadbeef").code).toBe(2);
  });
  test("a valid but unreviewed source is refused even with its own hash confirmed", () => {
    const edited = toCsv(withRow("SLVG-EVT-007", { baseline_headcount: "7" }));
    const f = join(dir, "edited.csv");
    writeFileSync(f, edited);
    const before = sha(readFileSync(dbFile));
    const env = { ...process.env, DATABASE_URL: url, DATABASE_AUTH_TOKEN: "local-file" };
    const r = Bun.spawnSync(["bun", "scripts/workbook-import.ts", "--file", f, "--out", out, "--apply", "--target", "local", `--confirm-source-hash=${sha(edited)}`, `--confirm-plan-hash=${REVIEWED_PLAN_SHA256}`], { cwd: WEB, env });
    const o = `${r.stdout.toString()}${r.stderr.toString()}`;
    expect(r.exitCode).toBe(2);
    expect(o).toContain("integrity source_hash: MISMATCH");
    expect(o).toContain("not the Phase 2 reviewed source");
    expect(sha(readFileSync(dbFile))).toBe(before);
  });
  test("apply twice: 36 rows, no duplicates, second run writes nothing; history unchanged", async () => {
    const { createClient } = await import("@libsql/client");
    c = createClient({ url }) as unknown as Lib;
    const hist = JSON.stringify(await q("select * from ops_assignments order by id"));
    const tpl = JSON.stringify(await q("select count(*) n from ops_template_roles"));
    c.close();

    const first = run("--apply", "--target", "local", `--confirm-source-hash=${CANONICAL_V1_SHA256}`, `--confirm-plan-hash=${REVIEWED_PLAN_SHA256}`);
    expect(first.code).toBe(0);
    expect(first.out).toContain("wrote 36");
    const second = run("--apply", "--target", "local", `--confirm-source-hash=${CANONICAL_V1_SHA256}`, `--confirm-plan-hash=${REVIEWED_PLAN_SHA256}`);
    expect(second.code).toBe(0);
    expect(second.out).toContain("wrote 0");
    expect(second.out).toContain("unchanged 36");

    c = createClient({ url }) as unknown as Lib;
    const [agg] = await q("select count(*) n, count(distinct canonical_role_id) ids, count(distinct role_key) keys, sum(baseline_headcount) seats from ops_canonical_roles");
    expect(agg).toMatchObject({ n: 36, ids: 36, keys: 36, seats: 66 });
    expect(JSON.stringify(await q("select * from ops_assignments order by id"))).toBe(hist);
    expect(JSON.stringify(await q("select count(*) n from ops_template_roles"))).toBe(tpl);
    const [tr] = await q("select count(*) n from crew_training_records");
    expect(tr).toMatchObject({ n: 0 });
    const [gem] = await q("select role_key, display_name, legacy_display_name, engagement_type, entity_id from ops_canonical_roles where canonical_role_id = 'SLVG-EVT-005'");
    expect(gem).toMatchObject({ role_key: "guest_experience_lead", display_name: "Guest Experience Manager", engagement_type: "pending_classification", entity_id: "sanctuary_lv_group" });
    c.close();
  });
});
