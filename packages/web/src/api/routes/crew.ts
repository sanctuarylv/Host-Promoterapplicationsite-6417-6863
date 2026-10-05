import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { db } from "../database";
import { crewEvents } from "../database/schema";
import { ANALYTICS_EVENTS, applicationSchema, CONSENT_VERSION, type SubmitResult } from "../crew/contract";
import { submitApplication } from "../crew/submission-service";
import { limitRequest } from "../crew/rate-limit";
import { sanitizeAnalyticsProps } from "../crew/analytics";
import { serveSchema, submitServeInterest, SERVE_CONSENT_VERSION } from "../crew/serve";

const propValue = z.union([z.string().max(500), z.number(), z.boolean()]);

const tooMany = () =>
  new ORPCError("TOO_MANY_REQUESTS", { message: "Too many attempts. Please wait a few minutes and try again." });

export const crew = {
  /** Versions the public forms must display/echo back. */
  formVersions: base.handler(() => ({ consentVersion: CONSENT_VERSION, serveConsentVersion: SERVE_CONSENT_VERSION })),

  /**
   * Public Sanctuary LV Group application. Identical response for new and
   * duplicate applicants (no enumeration). Saved locally (authority=local_staging).
   */
  submit: base.input(applicationSchema).handler(async ({ input, context }): Promise<SubmitResult> => {
    const rl = await limitRequest(context.headers, "submit", 5, 60, 10 * 60_000);
    if (!rl.ok) throw tooMany();
    let outcome;
    try {
      outcome = await submitApplication(input);
    } catch (e) {
      console.error("[crew.submit] failed", e instanceof Error ? e.message : e);
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "We couldn't save your application. Please try again." });
    }
    if (outcome.kind === "dropped" && outcome.reason === "stale_consent") {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "This form was updated since you opened it. Please reload the page and review the acknowledgement.",
      });
    }
    return { status: "received", receivedAt: new Date().toISOString() };
  }),

  /** Separate nonprofit Volunteer / Serve Team interest (unpaid; own table, consent and statuses). */
  serveInterest: base.input(serveSchema).handler(async ({ input, context }): Promise<SubmitResult> => {
    const rl = await limitRequest(context.headers, "serve", 5, 60, 10 * 60_000);
    if (!rl.ok) throw tooMany();
    const r = await submitServeInterest(input);
    if (r === "stale_consent")
      throw new ORPCError("PRECONDITION_FAILED", { message: "This form was updated. Please reload the page and try again." });
    return { status: "received", receivedAt: new Date().toISOString() };
  }),

  /** First-party analytics mirror. Allowlisted names AND props; no free text, no PII, no tokens. */
  track: base
    .input(
      z.object({
        name: z.enum(ANALYTICS_EVENTS),
        sessionId: z.string().max(64).optional(),
        props: z.record(z.string().max(40), propValue).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const rl = await limitRequest(context.headers, "track", 120, 1200, 60_000);
      if (!rl.ok) return { ok: false };
      const props = sanitizeAnalyticsProps(input.props);
      const sessionId = input.sessionId && /^[A-Za-z0-9_-]{8,64}$/.test(input.sessionId) ? input.sessionId : null;
      await db.insert(crewEvents).values({ name: input.name, session_id: sessionId, props });
      return { ok: true };
    }),
};
