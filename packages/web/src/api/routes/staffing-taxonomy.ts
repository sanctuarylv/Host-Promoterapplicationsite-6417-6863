/**
 * 36-role canonical staffing taxonomy — READ-ONLY reconciliation preview.
 *
 * Serves the deterministic dry-run plan built from the reviewed, committed
 * canonical source (src/api/ops/staffing/canonical-source.ts). There is no
 * write procedure: importing is a CLI-only, explicitly approved operation
 * (scripts/workbook-import.ts, docs/STAFFING_IMPORT_RUNBOOK_V2.md). The stage
 * reported here can never be "imported" (see ops/staffing/status.ts).
 *
 * Phase 3 adds, NEXT TO the unchanged plan: hash integrity against the Phase 2
 * baseline and the read-only operational review (ops/staffing/review.ts). The
 * only database access is the two SELECTs below.
 */
import { sql } from "drizzle-orm";
import { staffProc } from "../middleware/auth";
import { db } from "../database";
import { requireCan } from "../shared/permissions";
import { checkIntegrity } from "../ops/staffing/integrity";
import { IMPORT_STATUS_BANNER } from "../ops/staffing/plan";
import { buildTaxonomyReview } from "../ops/staffing/review";
import { embeddedTaxonomy, TAXONOMY_STAGE_LABEL } from "../ops/staffing/status";

/** Row count in ops_canonical_roles, or null when migration 0002 is not applied on this database. Read-only. */
async function storedCanonicalRoles(): Promise<number | null> {
  try {
    const r = await db.get<{ n: number }>(sql`select count(*) as n from ops_canonical_roles`);
    return Number(r?.n ?? 0);
  } catch {
    return null;
  }
}

/** After Dark template versions on this database, or null when unreadable. Read-only. */
async function afterDarkVersions(): Promise<{ version: number; status: string }[] | null> {
  try {
    const rows = await db.all<{ version: number; status: string }>(
      sql`select v.version as version, v.status as status from ops_template_versions v join ops_templates t on t.id = v.template_id where t.template_key = 'after_dark' order by v.version`,
    );
    return rows.map((r) => ({ version: Number(r.version), status: String(r.status) }));
  } catch {
    return null;
  }
}

export const staffingTaxonomy = {
  preview: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "integration.manage");
    const { stage, plan } = embeddedTaxonomy();
    const stored_canonical_roles = await storedCanonicalRoles();
    const integrity = checkIntegrity(plan?.source_hash ?? null, plan?.ok ? plan.plan_hash : null);
    const review = plan?.ok ? buildTaxonomyReview(plan, integrity, { stored_canonical_roles, after_dark_versions: await afterDarkVersions() }) : null;
    return {
      import_status: IMPORT_STATUS_BANNER,
      stage,
      stage_label: TAXONOMY_STAGE_LABEL[stage],
      stored_canonical_roles,
      integrity,
      plan,
      review,
    };
  }),
};
