/**
 * LEGACY shared-key applicant view (`x-crew-admin-key` = CREW_ADMIN_ACCESS_KEY).
 *
 * Since individual staff sign-in exists, this path is READ-ONLY: verify, a
 * paginated/filtered list with population totals, and nothing that mutates.
 * Status changes and retries moved to the authenticated staff console
 * (routes/recruiting.ts, routes/integration.ts). It is fully disabled when
 * CREW_LEGACY_ADMIN_MODE=disabled or once a Command Center cutover is recorded.
 */
import { timingSafeEqual } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { count, inArray } from "drizzle-orm";
import { base } from "../__core/app";
import { db } from "../database";
import { crewEvents } from "../database/schema";
import { getCrewConfig } from "../crew/config";
import { limitRequest } from "../crew/rate-limit";
import { listApplications, listInputSchema } from "../crew/app-list";
import { getIntegrationState } from "../crew/integration";

function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

const legacyAdmin = base.use(async ({ context, next }) => {
  const cfg = getCrewConfig();
  if (cfg.legacyAdminMode === "disabled")
    throw new ORPCError("FORBIDDEN", { message: "The shared-key view is disabled. Sign in with your own staff account." });
  const key = cfg.adminAccessKey;
  if (!key) throw new ORPCError("FORBIDDEN", { message: "Shared-key view is disabled (CREW_ADMIN_ACCESS_KEY not set)." });
  const rl = await limitRequest(context.headers, "admin", 60, 300, 60_000);
  if (!rl.ok) throw new ORPCError("TOO_MANY_REQUESTS");
  const given = context.headers.get("x-crew-admin-key") ?? "";
  if (!safeEqual(given, key)) throw new ORPCError("UNAUTHORIZED", { message: "Invalid access key." });
  const state = await getIntegrationState();
  if (state.cutover)
    throw new ORPCError("FORBIDDEN", { message: "Command Center cutover is recorded — the shared-key view is retired." });
  return next();
});

export const crewAdmin = {
  verify: legacyAdmin.handler(() => ({ ok: true, mode: "readonly" as const })),

  list: legacyAdmin.input(listInputSchema).handler(async ({ input }) => {
    const page = await listApplications(input);
    const funnel = await db
      .select({ name: crewEvents.name, n: count() })
      .from(crewEvents)
      .where(
        inArray(crewEvents.name, [
          "crew_page_view",
          "application_started",
          "application_submitted",
          "application_abandoned",
          "referral_visit",
          "qr_visit",
        ]),
      )
      .groupBy(crewEvents.name);
    const state = await getIntegrationState();
    return {
      ...page,
      funnel: Object.fromEntries(funnel.map((f) => [f.name, Number(f.n)])) as Record<string, number>,
      integration: { mode: state.mode, reason: state.reason, submissionMode: state.submissionMode, referralMode: state.referralMode },
      access: "legacy_readonly" as const,
    };
  }),
};
