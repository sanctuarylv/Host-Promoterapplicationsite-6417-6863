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
  const again = await admin.staffingTaxonomy.preview();
  check("preview is deterministic (same plan_hash)", again.plan?.plan_hash, p.plan?.plan_hash);
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
