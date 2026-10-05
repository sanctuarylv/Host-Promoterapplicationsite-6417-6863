/**
 * Sanctuary LV nonprofit — Volunteer / Serve Team interest.
 * Deliberately separate from the Sanctuary LV Group paid pipeline: own table,
 * own acknowledgement/consent version, own statuses. Never mixed into paid
 * applications, offers, pay or hours.
 */
import type { z } from "zod";
import { db } from "../database";
import { serveInterest } from "../database/schema";
import { normalizeEmail, normalizePhone } from "./contract";
import { uuid } from "../shared/ids";

export { SERVE_CONSENT_VERSION, SERVE_ACKNOWLEDGEMENT, SERVE_AREAS, SERVE_STATUSES, serveSchema, type ServeInput } from "./serve-contract";
import { SERVE_CONSENT_VERSION, type serveSchema } from "./serve-contract";

export async function submitServeInterest(input: z.output<typeof serveSchema>): Promise<"saved" | "duplicate" | "dropped" | "stale_consent"> {
  if (input.website.trim() !== "") return "dropped";
  if (input.startedAt && Date.now() - input.startedAt < 3000) return "dropped";
  if (input.consentVersion !== SERVE_CONSENT_VERSION) return "stale_consent";
  const now = new Date();
  const rows = await db
    .insert(serveInterest)
    .values({
      id: uuid(),
      first_name: input.firstName,
      last_name: input.lastName,
      email_normalized: normalizeEmail(input.email),
      phone_normalized: input.phone ? normalizePhone(input.phone) : null,
      city: input.city || null,
      areas: input.areas,
      availability: input.availability,
      notes: input.notes || null,
      consent_version: SERVE_CONSENT_VERSION,
      consent_at: now,
    })
    .onConflictDoNothing({ target: serveInterest.email_normalized })
    .returning({ id: serveInterest.id });
  return rows.length ? "saved" : "duplicate";
}
