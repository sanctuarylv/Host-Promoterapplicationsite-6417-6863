/**
 * 36-role canonical staffing taxonomy — READ-ONLY reconciliation preview.
 *
 * Serves the deterministic dry-run plan built from the reviewed, committed
 * canonical source (src/api/ops/staffing/canonical-source.ts). There is no
 * write procedure: importing is a CLI-only, explicitly approved operation
 * (scripts/workbook-import.ts, docs/STAFFING_IMPORT_RUNBOOK_V2.md). The stage
 * reported here can never be "imported" (see ops/staffing/status.ts).
 */
import { sql } from "drizzle-orm";
import { staffProc } from "../middleware/auth";
import { db } from "../database";
import { requireCan } from "../shared/permissions";
import { IMPORT_STATUS_BANNER } from "../ops/staffing/plan";
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

export const staffingTaxonomy = {
  preview: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "integration.manage");
    const { stage, plan } = embeddedTaxonomy();
    return {
      import_status: IMPORT_STATUS_BANNER,
      stage,
      stage_label: TAXONOMY_STAGE_LABEL[stage],
      stored_canonical_roles: await storedCanonicalRoles(),
      plan,
    };
  }),
};
