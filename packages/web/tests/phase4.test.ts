/**
 * Phase 4 — decision register, credential / training resolution matrix,
 * baseline preservation and router security inventory (pure; no network, no DB writes).
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PLANNING_TRAINING_MODULES } from "../src/api/ops/staffing/after-dark-v1";
import { ACCESS_ZONES } from "../src/api/ops/staffing/credentials";
import { buildDecisionRegister, GATE_AUTHORIZATIONS, RELEASE_GATES } from "../src/api/ops/staffing/decisions";
import { checkIntegrity, REVIEWED_BASELINE } from "../src/api/ops/staffing/integrity";
import { buildResolutionMatrix, CREDENTIAL_PROPOSALS, PHRASE_RESOLUTIONS, PROPOSED_NEW_MODULES, zoneDelta } from "../src/api/ops/staffing/resolution";
import { buildTaxonomyReview } from "../src/api/ops/staffing/review";
import { embeddedTaxonomy } from "../src/api/ops/staffing/status";

const WEB = resolve(import.meta.dir, "..");
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const src = (p: string) => readFileSync(join(WEB, p), "utf8");

const p = embeddedTaxonomy().plan!;
const review = buildTaxonomyReview(p, checkIntegrity(p.source_hash, p.plan_hash), { stored_canonical_roles: null, after_dark_versions: [{ version: 1, status: "published" }] });
const m = buildResolutionMatrix(p, review);
const reg = buildDecisionRegister(review, m);

describe("Phase 3 baseline preserved", () => {
  test("source, plan and 0002 migration hashes unchanged", () => {
    expect(p.source_hash).toBe("36dac8e8c7eb7ac529e25cdb217dc758582e6fecc4556163b81ad0ab35cf8892");
    expect(p.plan_hash).toBe("8c22363803999b763305dc8961dcc6b7226271c15c28829ce14aff842cfcd701");
    expect(p.plan_hash).toBe(REVIEWED_BASELINE.plan_sha256);
    expect(sha(readFileSync(join(WEB, "drizzle/0002_canonical_staffing_taxonomy.sql")))).toBe("96317d6dffbb00905b4e15c811bfc03ea7adf9bdec4fa1b84d51a6dde9678a2c");
    expect(checkIntegrity(p.source_hash, p.plan_hash).checks.every((c) => c.match)).toBe(true);
  });
  test("plan.ts import closure excludes review / resolution / decisions", () => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const [, spec] of readFileSync(file, "utf8").matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
        const base = resolve(dirname(file), spec!);
        for (const cand of [`${base}.ts`, join(base, "index.ts")]) {
          try {
            readFileSync(cand);
            visit(cand);
            break;
          } catch {
            /* next candidate */
          }
        }
      }
    };
    visit(join(WEB, "src/api/ops/staffing/plan.ts"));
    const names = [...seen].map((f) => f.split("/").pop());
    expect(names).toContain("credentials.ts");
    for (const n of ["review.ts", "resolution.ts", "decisions.ts"]) expect(names).not.toContain(n);
  });
});

describe("resolution matrix (proposed only)", () => {
  test("one credential proposal per credential gap, zones only from ACCESS_ZONES, never all_staff", () => {
    expect(m.credentials.rows.length).toBe(9);
    expect(m.credentials.rows.map((r) => r.role_key).sort()).toEqual(Object.keys(CREDENTIAL_PROPOSALS).sort());
    expect(review.credential_review.counts).toEqual({ mapped: 27, partial: 1, unresolved: 8 });
    for (const r of m.credentials.rows) {
      expect(r.granted).toBe(false);
      expect(r.status).toBe("proposed");
      expect(r.decision).toBeNull();
      for (const z of [...r.proposed_zones, ...r.alternatives.flat()]) expect(ACCESS_ZONES as readonly string[]).toContain(z);
      expect(r.proposed_zones).not.toContain("all_staff");
      expect(r.alternatives.flat()).not.toContain("all_staff");
    }
  });
  test("conditional tokens are carried as never-auto, not as zones", () => {
    const vip = m.credentials.rows.find((r) => r.role_key === "vip_host")!;
    expect(vip.conditional_never_auto).toEqual(["Backstage as approved"]);
    expect(vip.proposed_zones).not.toContain("back_of_house");
    const sec = m.credentials.rows.find((r) => r.role_key === "security_manager_venue_security_liaison")!;
    expect(sec.conditional_never_auto).toEqual(["All Access as required"]);
    expect(sec.proposed_zones).not.toContain("all_staff");
    expect(m.credentials.counts.conditional_tokens).toBe(2);
  });
  test("security delta vs v1: venue_liaison narrowing and plan expansions are flagged", () => {
    const vl = m.credentials.rows.find((r) => r.role_key === "venue_liaison")!;
    expect(vl.v1_zones).toEqual(["all_staff"]);
    expect(vl.plan_zones).toEqual([]);
    expect(vl.delta_vs_v1).toEqual({ added: [], removed: ["all_staff"], summary: "narrows" });
    const changed = Object.fromEntries(m.credentials.zone_reconciliation.filter((z) => z.delta.summary !== "same").map((z) => [z.role_key, z.delta.summary]));
    expect(changed).toEqual({ stage_manager: "expands", venue_liaison: "narrows", vip_host: "narrows", promoter_manager: "expands", promoter: "expands", production_manager: "expands", audio: "expands", videographer: "expands" });
    expect(m.credentials.security_flags.some((f) => f.startsWith("stage_manager: reviewed plan would ADD all_staff"))).toBe(true);
    expect(m.credentials.security_flags.some((f) => f.startsWith("production_manager: reviewed plan would ADD all_staff"))).toBe(true);
  });
  test("zoneDelta treats all_staff as covering every zone", () => {
    expect(zoneDelta(["all_staff"], ["front_of_house"]).summary).toBe("narrows");
    expect(zoneDelta(["stage"], ["stage", "all_staff"])).toEqual({ added: ["all_staff"], removed: [], summary: "expands" });
    expect(zoneDelta(null, []).summary).toBe("no_access");
    expect(zoneDelta(["vip"], ["vip"]).summary).toBe("same");
  });
  test("every unresolved training phrase has exactly one resolution; module keys exist or are proposed", () => {
    expect(m.training.rows.length).toBe(35);
    expect(review.training_review.counts).toEqual({ mapped: 1, partial: 21, unresolved: 14 });
    const phrases = new Set(review.training_review.rows.flatMap((t) => t.unresolved_phrases.map((x) => x.toLowerCase())));
    expect(phrases.size).toBe(62);
    expect(m.training.phrase_count).toBe(62);
    expect([...phrases].sort()).toEqual(Object.keys(PHRASE_RESOLUTIONS).sort());
    const existing = PLANNING_TRAINING_MODULES.map((x) => x.key);
    const proposed = PROPOSED_NEW_MODULES.map((x) => x.key);
    for (const x of proposed) expect(existing).not.toContain(x);
    for (const r of Object.values(PHRASE_RESOLUTIONS)) if (r.module_key) expect([...existing, ...proposed]).toContain(r.module_key);
    expect(m.training.counts.phrases_to_existing + m.training.counts.phrases_to_new + m.training.counts.phrases_external).toBe(62);
  });
  test("conditional training wording is external, never a module requirement", () => {
    for (const [k, r] of Object.entries(PHRASE_RESOLUTIONS)) if (/\bas (required|applicable|approved)\b/.test(k)) expect(r.kind).toBe("external_requirement");
  });
  test("no completion, no grant, proposed modules flagged as not existing", () => {
    expect(m.granted_any).toBe(false);
    expect(m.completions_created).toBe(0);
    for (const r of m.training.rows) {
      expect(r.completion_created).toBe(false);
      expect(r.status).toBe("proposed");
    }
    for (const x of m.training.proposed_new_modules) {
      expect(x.status).toBe("proposed");
      expect(x.exists).toBe(false);
      expect(x.roles.length).toBeGreaterThan(0);
    }
    expect(m.training.global_modules).toEqual(["event_orientation", "venue_safety_authority"]);
    expect(m.training.rows.filter((r) => r.v1_modules_not_in_plan.length).map((r) => [r.role_key, r.v1_modules_not_in_plan])).toEqual([["registration_lead", ["guest_service_fundamentals"]]]);
  });
  test("deterministic", () => {
    expect(JSON.stringify(buildResolutionMatrix(p, review))).toBe(JSON.stringify(m));
  });
});

describe("decision register (all pending)", () => {
  test("90 items, every one pending with null decision", () => {
    expect(reg.counts.total).toBe(90);
    expect(reg.counts.by_category).toEqual({ staffing_runner: 1, credential_gap: 9, zone_delta: 6, training_gap: 35, engagement_classification: 36, template_approval: 1, public_label: 1, nonprofit_behaviour_patch: 1 });
    expect(reg.counts.pending).toBe(90);
    expect(reg.counts.decided).toBe(0);
    expect(reg.production_authorized).toBe(false);
    for (const d of reg.items) {
      expect(d.status).toBe("pending");
      expect(d.decision).toBeNull();
      expect(d.decided_by).toBeNull();
      expect(d.decided_at).toBeNull();
      expect(d.options.length).toBeGreaterThanOrEqual(3);
      expect(d.blocks.length).toBeGreaterThan(0);
    }
    expect(new Set(reg.items.map((d) => d.id)).size).toBe(90);
  });
  test("runner: four options in the reviewed order, owner event leadership, no proposal", () => {
    const d = reg.items.find((x) => x.id === "D-RUN-001")!;
    expect(d.options.map((o) => o.key)).toEqual(["keep_outside_taxonomy", "map_to_setup_breakdown_crew", "add_canonical_role", "retire_from_future_templates"]);
    expect(d.owner).toBe("Sanctuary LV Group event leadership (Event Director / Event Operations Manager)");
    expect(d.proposal_ref).toBeNull();
  });
  test("classification covers all 36 roles and never pre-selects", () => {
    const cls = reg.items.filter((x) => x.category === "engagement_classification");
    expect(cls.map((x) => x.subject).sort()).toEqual(review.role_review.rows.map((r) => r.role_key).sort());
    for (const c of cls) expect(c.proposal_ref).toBeNull();
    expect(review.role_review.rows.every((r) => r.engagement_type === "pending_classification")).toBe(true);
  });
  test("domains: only the behaviour-only /serve fix is nonprofit; Group decisions never touch the Serve Team", () => {
    expect(reg.counts.by_domain).toEqual({ sanctuary_lv_group: 89, sanctuary_lv_nonprofit: 1 });
    const np = reg.items.filter((x) => x.domain === "sanctuary_lv_nonprofit");
    expect(np.map((x) => x.id)).toEqual(["D-SRV-001"]);
    for (const d of reg.items.filter((x) => x.domain === "sanctuary_lv_group")) expect(d.subject).not.toBe("serve_coordinator");
  });
  test("gates are all closed; every gate lists its human authorizations", () => {
    expect(reg.gates.map((g) => g.key as string)).toEqual(Object.keys(RELEASE_GATES));
    for (const g of reg.gates) {
      expect(g.open).toBe(false);
      expect(g.requires_authorizations).toEqual(GATE_AUTHORIZATIONS[g.key]);
    }
    const auth = new Set(reg.authorizations.map((a) => a.key));
    for (const keys of Object.values(GATE_AUTHORIZATIONS)) for (const k of keys) expect(auth.has(k)).toBe(true);
    expect(reg.authorizations.length).toBe(11);
    expect(reg.authorizations.every((a) => a.status === "pending")).toBe(true);
  });
  test("source has no way to record a decision", () => {
    const s = src("src/api/ops/staffing/decisions.ts");
    expect(s).toContain('export type DecisionStatus = "pending";');
    expect(s).not.toMatch(/status:\s*"(approved|decided|granted|rejected)"/);
    for (const f of ["decisions.ts", "resolution.ts"]) expect(src(`src/api/ops/staffing/${f}`)).not.toMatch(/from\s+"[^"]*database|db\.(insert|update|delete|run)/);
  });
});

describe("security reconciliation: router inventory", () => {
  test("procedure list is exactly the Phase 3 set; staffingTaxonomy is preview-only", async () => {
    process.env.APPLICATION_ID ??= "unit";
    process.env.VITE_RUNABLE_AUTH_ISSUER ??= "http://localhost:1";
    process.env.WEBSITE_URL ??= "http://localhost:1";
    const { router } = await import("../src/api/index");
    const out: string[] = [];
    const walk = (o: unknown, path: string[]) => {
      if (o && typeof o === "object" && "~orpc" in o) return void out.push(path.join("."));
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) walk(v, [...path, k]);
    };
    walk(router, []);
    expect(out.length).toBe(92);
    expect(sha(out.join("\n"))).toBe(PROCEDURE_INVENTORY_SHA256);
    expect(out.filter((x) => x.startsWith("staffingTaxonomy."))).toEqual(["staffingTaxonomy.preview"]);
  });
  test("preview is gated by integration.manage and only SELECTs", () => {
    const s = src("src/api/routes/staffing-taxonomy.ts");
    expect(s).toContain('requireCan(context.principal, "integration.manage")');
    expect(s).toContain("staffProc.handler");
    expect(s).not.toMatch(/\b(insert|update|delete|drop|alter)\b\s/i);
    expect([...s.matchAll(/sql`select /g)].length).toBe(2);
  });
});

/** sha256 of the newline-joined procedure paths at b5f8fca (Phase 3). Any added / removed procedure changes it. */
const PROCEDURE_INVENTORY_SHA256 = "eb8ceda41965863678002eed914797b53ec6007685d0ae9fc492a4235d1135af";
