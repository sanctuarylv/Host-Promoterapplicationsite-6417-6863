/**
 * Serve Team public contract (pure: zod only). Imported by the API and by the
 * /serve page so both validate identically. Sanctuary LV nonprofit, unpaid.
 */
import { z } from "zod";
import { cleanText, LIMITS, normalizePhone } from "./contract";

export const SERVE_CONSENT_VERSION = "2026-10-04.serve-v1";
export const SERVE_ACKNOWLEDGEMENT = [
  "Serve Team roles are unpaid volunteer opportunities with Sanctuary LV nonprofit.",
  "Volunteering is separate from paid Host and Promoter opportunities with Sanctuary LV Group, and is never a condition of being considered for them.",
  "A Serve Team coordinator may contact me about serving, and the information I've submitted is accurate.",
] as const;

export const SERVE_AREAS = [
  { value: "welcome", label: "Welcome & greeting" },
  { value: "prayer_care", label: "Prayer & care" },
  { value: "setup_teardown", label: "Setup & teardown" },
  { value: "production_assist", label: "Production assist" },
  { value: "creative", label: "Creative & content" },
  { value: "not_sure", label: "Not sure yet" },
] as const;
export const SERVE_STATUSES = ["received", "contacted", "approved_to_serve", "not_now", "withdrawn"] as const;

const req = (max: number, label: string) =>
  z.string().transform(cleanText).pipe(z.string().min(1, `${label} is required`).max(max, `${label} is too long`));

export const serveSchema = z.object({
  firstName: req(LIMITS.name, "First name"),
  lastName: req(LIMITS.name, "Last name"),
  email: z.string().trim().max(LIMITS.email).pipe(z.email("Enter a valid email")),
  phone: z
    .string()
    .max(LIMITS.phone)
    .optional()
    .default("")
    .refine((v) => v.trim() === "" || normalizePhone(v) !== null, "Enter a valid phone number"),
  city: z.string().max(LIMITS.city).optional().default("").transform(cleanText),
  areas: z.array(z.enum(SERVE_AREAS.map((a) => a.value) as [string, ...string[]])).min(1, "Choose at least one").max(6),
  availability: req(200, "Availability"),
  notes: z.string().max(LIMITS.notes).optional().default("").transform(cleanText),
  acknowledged: z.literal(true, { error: "Please confirm to continue" }),
  consentVersion: z.string().max(40),
  website: z.string().max(200).optional().default(""),
  startedAt: z.number().int().nonnegative().optional(),
});
export type ServeInput = z.input<typeof serveSchema>;
