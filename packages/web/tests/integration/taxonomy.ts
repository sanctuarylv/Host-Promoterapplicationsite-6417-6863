/**
 * Staffing taxonomy suite — read-only preview RBAC + the readiness row.
 * In-process, real auth + oRPC, FRESH disposable DB (migrations 0000-0002 + planning seed).
 *
 *   cd packages/web && env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bun tests/integration/taxonomy.ts
 */
const H = await import("./harness");
const { client, signUp, bootstrapAdmin, outcome, cleanup, db } = H;
const { recorder } = await import("../e2e/helpers");
const { sql } = await import("drizzle-orm");

const { check, report } = recorder();

const counts = async () => {
  const one = async (t: string) => Number((await db.get<{ n: number }>(sql.raw(`select count(*) as n from ${t}`)))?.n ?? 0);
  return {
    canonical: await one("ops_canonical_roles"),
    templateRoles: await one("ops_template_roles"),
    templateVersions: await one("ops_template_versions"),
    assignments: await one("ops_assignments"),
    training: await one("crew_training_records"),
    audit: await one("crew_audit"),
  };
};

try {
  const adminAcct = await signUp("admin");
  await bootstrapAdmin(adminAcct.userId);
  const admin = client(adminAcct.token);
  const recAcct = await signUp("recruiter");
  const plainAcct = await signUp("plain");
  await admin.staff.grant({ email: recAcct.email, role: "recruiter", eventId: null, departmentKey: null });

  // ---------------------------------------------------------------- access
  check("anonymous preview -> UNAUTHORIZED", await outcome(client().staffingTaxonomy.preview()), "UNAUTHORIZED");
  check("non-staff preview -> FORBIDDEN", await outcome(client(plainAcct.token).staffingTaxonomy.preview()), "FORBIDDEN");
  check("recruiter (no integration.manage) preview -> FORBIDDEN", await outcome(client(recAcct.token).staffingTaxonomy.preview()), "FORBIDDEN");

  // ---------------------------------------------------------------- preview content
  const before = await counts();
  check("seeded After Dark v1 has 36 template roles", before.templateRoles, 36);
  const p = await admin.staffingTaxonomy.preview();
  check("banner is DRY RUN — NOTHING IMPORTED", p.import_status, "DRY RUN — NOTHING IMPORTED");
  check("stage is import_pending_approval", p.stage, "import_pending_approval");
  check("stage label", p.stage_label, "Import pending approval");
  check("no canonical roles stored (migration applied, nothing imported)", p.stored_canonical_roles, 0);
  check("plan ok", p.plan?.ok, true);
  check("36 canonical roles", p.plan?.canonical_roles.total, 36);
  check("66 baseline seats", p.plan?.headcount.canonical_baseline_total, 66);
  check("mapping counts exact/rename/partial/new", [p.plan?.canonical_roles.exact, p.plan?.canonical_roles.renamed, p.plan?.canonical_roles.partial, p.plan?.canonical_roles.new].join("/"), "3/7/7/19");
  check("6 supervisor changes", p.plan?.supervisor_changes.length, 6);
  check("0 errors", p.plan?.errors.length, 0);
  check("vNext preview_only", p.plan?.after_dark_vnext?.status, "preview_only");
  check("proposed writes not applied", p.plan?.proposed_writes.applied, false);
  // ---------------------------------------------------------------- Phase 3: integrity + review
  check("integrity ok against the Phase 2 baseline", p.integrity.ok, true);
  check("integrity source_hash matches", p.integrity.checks.find((c) => c.key === "source_hash")?.match, true);
  check("integrity plan_hash matches", p.integrity.checks.find((c) => c.key === "plan_hash")?.match, true);
  check("baseline commit 065013b", p.integrity.baseline.commit.slice(0, 7), "065013b");
  const rv = p.review;
  check("review present + read_only", rv?.read_only, true);
  check("role review 36 roles / 66 seats, balances", [rv?.role_review.totals.roles, rv?.role_review.totals.seats, rv?.role_review.totals.balances].join("/"), "36/66/true");
  check("runner unresolved, no decision", [rv?.runner_decision.classification, rv?.runner_decision.status, rv?.runner_decision.decision].join("/"), "unresolved/awaiting_human_decision/");
  check("runner decision is null", rv?.runner_decision.decision, null);
  check("runner has 4 options", rv?.runner_decision.options.length, 4);
  check("credential review 9 rows (1 partial / 8 unresolved)", [rv?.credential_review.rows.length, rv?.credential_review.counts.partial, rv?.credential_review.counts.unresolved].join("/"), "9/1/8");
  check("credential review grants nothing", rv?.credential_review.rows.every((c) => c.granted === false), true);
  check("training review 35 rows (21 partial / 14 unresolved)", [rv?.training_review.rows.length, rv?.training_review.counts.partial, rv?.training_review.counts.unresolved].join("/"), "35/21/14");
  check("training review completes nothing", rv?.training_review.rows.every((t) => t.completion_created === false), true);
  check("template comparison 51 -> 72, bridge balances", [rv?.template_comparison?.totals.v1, rv?.template_comparison?.totals.vnext, rv?.template_comparison?.bridge_balances].join("/"), "51/72/true");
  check("separation: Group entity only, no nonprofit roles", [rv?.separation.canonical_entities.join(","), rv?.separation.nonprofit_roles_in_taxonomy].join("/"), "sanctuary_lv_group/0");
  const cl = rv?.approval_checklist;
  check("production_authorized is false", cl?.production_authorized, false);
  check("12 automated evidence items, all pass on this DB", [cl?.automated.length, cl?.automated.every((a) => a.status === "pass")].join("/"), "12/true");
  check("nothing_imported evidence passes (0 rows)", cl?.automated.find((a) => a.key === "nothing_imported")?.status, "pass");
  check("no_template_activation evidence passes (v1 only)", cl?.automated.find((a) => a.key === "no_template_activation")?.status, "pass");
  check("10 human authorizations, every one pending with no approver", [cl?.human.length, cl?.human.every((h) => h.status === "pending" && h.authorized_by === null && h.authorized_at === null)].join("/"), "10/true");
  check("recorded evidence is separate (8 items)", cl?.recorded.length, 8);

  const again = await admin.staffingTaxonomy.preview();
  check("preview is deterministic (same plan_hash)", again.plan?.plan_hash, p.plan?.plan_hash);
  check("review is deterministic", JSON.stringify(again.review) === JSON.stringify(p.review), true);
  check("preview performs zero writes", JSON.stringify(await counts()), JSON.stringify(before));

  // ---------------------------------------------------------------- readiness row
  const r = await admin.integration.readiness();
  const row = r.checks.find((c) => c.key === "staffing_taxonomy");
  check("readiness has the 36-Role Staffing Taxonomy row", row?.label, "36-Role Staffing Taxonomy");
  check("readiness row state blocked_user (never pass)", row?.state, "blocked_user");
  check("readiness row stage label", row?.stage_label, "Import pending approval");
  check("readiness row says nothing imported", Boolean(row?.detail.includes("nothing imported")), true);
  check("readiness never claims Imported", /\bImported\b/.test(JSON.stringify(r)), false);
  check("old workbook row removed", r.checks.some((c) => c.key === "workbook"), false);
} finally {
  report("staffing taxonomy integration");
  cleanup();
}
