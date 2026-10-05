/**
 * Crew application contract — the single source of truth for option values,
 * field limits and validation. Pure module (zod only): imported by the API
 * for server-side validation AND by the web client for step-by-step
 * validation, so both sides always agree.
 *
 * Option `value`s are stable machine keys (stored in the DB, sent to the
 * Sanctuary Command Center). Labels are display copy and may change freely.
 */
import { z } from "zod";

export const CONTRACT_VERSION = "crew-application.v2";
/**
 * Bump when the consent copy in the application changes.
 * v1 ("2026-10-03.v1") used mixed volunteer/contracted wording and does NOT
 * cover the Sanctuary LV Group paid-pathway acknowledgement below.
 */
export const CONSENT_VERSION = "2026-10-04.v2-group";
export const LEGACY_CONSENT_VERSIONS = ["2026-10-03.v1"] as const;
export const PAID_OPERATOR_ENTITY = "Sanctuary LV Group";
export const NONPROFIT_ENTITY = "Sanctuary LV nonprofit";
/** Opportunity every NEW paid-pathway application is filed under until real openings are approved. */
export const DEFAULT_OPPORTUNITY = "group_candidate_interest_2026";

/** The exact acknowledgement statements recorded with CONSENT_VERSION (shown in the form). */
export const ACKNOWLEDGEMENT_V2 = [
  "Paid Host and Promoter opportunities are operated by Sanctuary LV Group.",
  "Compensation, duties and engagement terms are provided for each approved opportunity; nothing in this application sets pay, classification or hours.",
  "Applying does not guarantee selection or an event assignment.",
  "Unpaid Volunteer / Serve Team opportunities with Sanctuary LV nonprofit are a separate pathway.",
  "Sanctuary LV Group may contact me about this application, and the information I've submitted is accurate.",
] as const;

const opt = <const T extends string>(value: T, label: string) => ({ value, label });

export const ROLE_OPTIONS = [
  opt("host", "Host"),
  opt("promoter", "Promoter"),
  opt("both", "Both"),
  opt("not_sure", "Not sure yet"),
  // v2 (additive): lead opportunities
  opt("guest_experience_lead", "Guest Experience Lead"),
  opt("promoter_manager", "Promoter Manager"),
] as const;

export const TRAVEL_OPTIONS = [
  opt("las_vegas_valley", "Las Vegas valley only"),
  opt("within_50mi", "Within about 50 miles"),
  opt("regional", "Regional travel possible"),
] as const;

export const NETWORK_OPTIONS = [
  opt("friends", "Friends / personal network"),
  opt("social_media", "Social media"),
  opt("church_community", "Church / community"),
  opt("music_creative", "Music / creative community"),
  opt("hospitality_nightlife", "Hospitality / nightlife"),
  opt("campus", "College / campus"),
  opt("business_professional", "Business / professional network"),
  opt("other", "Other"),
] as const;

export const AVAILABILITY_OPTIONS = [
  opt("most_events", "Most Sanctuary events"),
  opt("one_two_monthly", "1–2 events per month"),
  opt("occasionally", "Occasionally"),
  opt("event_specific", "Event-specific only"),
] as const;

export const INVITE_RANGE_OPTIONS = [
  opt("1_5", "1–5"),
  opt("6_10", "6–10"),
  opt("11_25", "11–25"),
  opt("26_50", "26–50"),
  opt("50_plus", "50+"),
] as const;

export const HOST_INTEREST_OPTIONS = [
  opt("guest_welcome", "Guest Welcome"),
  opt("check_in", "Check-In"),
  opt("hospitality", "Hospitality"),
  opt("seating", "Seating"),
  opt("vip_experience", "VIP Experience"),
  opt("guest_connection", "Guest Connection"),
  opt("event_operations", "Event Operations"),
  opt("prayer_ministry_support", "Prayer / Ministry Support"),
  opt("wherever_needed", "Wherever Needed"),
] as const;

export const REFERRAL_SOURCE_OPTIONS = [
  opt("sanctuary_event", "Sanctuary Event"),
  opt("friend", "Friend"),
  opt("instagram", "Instagram"),
  opt("tiktok", "TikTok"),
  opt("youtube", "YouTube"),
  opt("qr_code", "QR Code"),
  opt("event_activation", "Concert / Event Activation"),
  opt("team_member", "Sanctuary Team Member"),
  opt("other", "Other"),
] as const;

/** v1 statuses — still readable on legacy rows (mapped by the 0001 backfill, original kept in legacy_status). */
export const LEGACY_APPLICATION_STATUSES = [
  "submitted",
  "in_review",
  "contacted",
  "orientation",
  "active",
  "declined",
  "withdrawn",
] as const;
/** @deprecated v1 alias kept for the legacy staging admin. */
export const APPLICATION_STATUSES = LEGACY_APPLICATION_STATUSES;

/** v2 pipeline (see crew/pipeline.ts for prerequisites). */
export const PIPELINE_STATUSES = [
  "submitted",
  "reviewed",
  "screen_invited",
  "screen_completed",
  "assessment",
  "selected",
  "offer_issued",
  "accepted",
  "onboarding",
  "event_ready",
  "waitlisted",
  "declined",
  "withdrawn",
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** Explicit legacy → v2 map. `active`/`orientation` never imply acceptance or readiness. */
export const LEGACY_STATUS_MAP: Record<string, { to: PipelineStatus; flag?: string }> = {
  submitted: { to: "submitted" },
  in_review: { to: "reviewed" },
  contacted: { to: "screen_invited", flag: "legacy_contacted_no_screen_record" },
  orientation: { to: "reviewed", flag: "legacy_orientation_unverified" },
  active: { to: "reviewed", flag: "legacy_active_unverified" },
  declined: { to: "declined" },
  withdrawn: { to: "withdrawn" },
};

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
  "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

type Values<T extends readonly { value: string }[]> = T[number]["value"];
const values = <T extends readonly { value: string }[]>(o: T) =>
  o.map((x) => x.value) as unknown as [Values<T>, ...Values<T>[]];

export type RoleInterest = Values<typeof ROLE_OPTIONS>;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const roleNeedsPromoter = (r: string | undefined) => r === "promoter" || r === "both" || r === "promoter_manager";
export const roleNeedsHost = (r: string | undefined) => r === "host" || r === "both" || r === "guest_experience_lead";
/** Which anchored scorecard(s) apply to a role interest. */
export const scorecardKindsFor = (r: string): ("host" | "promoter")[] => [
  ...(roleNeedsHost(r) || r === "not_sure" ? (["host"] as const) : []),
  ...(roleNeedsPromoter(r) || r === "not_sure" ? (["promoter"] as const) : []),
];

export const LIMITS = {
  name: 60,
  email: 254,
  phone: 24,
  city: 80,
  handle: 60,
  url: 300,
  notes: 1000,
  motivationMin: 10,
  motivationMax: 1500,
  experience: 1500,
  scenario: 1500,
  code: 40,
} as const;

/* ------------------------------------------------------------------ */
/* Normalizers (pure — safe on client and server)                       */
/* ------------------------------------------------------------------ */

const INVISIBLE_RE = new RegExp(
  "[" +
    [[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x7f], [0x200b, 0x200f], [0x2028, 0x2029], [0xfeff, 0xfeff]]
      .map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`)
      .join("") +
    "]",
  "gu",
);

/** Strip control chars / zero-width chars and collapse whitespace. */
export function cleanText(input: string): string {
  return input
    // Control chars + zero-width / bidi / line-separator characters
    .replace(INVISIBLE_RE, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalize to E.164. US numbers are assumed when no country code is given
 * (10 digits → +1XXXXXXXXXX). Returns null when the number is not plausible.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Accepts "@handle", "handle" or a profile URL; returns the bare handle or null. */
export function normalizeHandle(raw: string, platform: "instagram" | "tiktok"): string | null {
  let v = raw.trim();
  if (!v) return "";
  const host = platform === "instagram" ? /instagram\.com/i : /tiktok\.com/i;
  if (/^https?:\/\//i.test(v) || host.test(v)) {
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      v = u.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }
  v = v.replace(/^@+/, "");
  const re = platform === "instagram" ? /^[A-Za-z0-9._]{1,30}$/ : /^[A-Za-z0-9._]{2,24}$/;
  return re.test(v) ? v : null;
}

export function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname.includes(".");
  } catch {
    return false;
  }
}

// Code helpers live in a zod-free module so the landing bundle can use them.
export { CODE_RE, normalizeCode } from "./codes";

/* ------------------------------------------------------------------ */
/* Field schemas                                                        */
/* ------------------------------------------------------------------ */

const text = (max: number, label: string) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(1, `${label} is required`).max(max, `${label} is too long`));

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .default("")
    .transform(cleanText)
    .pipe(z.string().max(max, "Too long"));

export const aboutSchema = z.object({
  firstName: text(LIMITS.name, "First name"),
  lastName: text(LIMITS.name, "Last name"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(LIMITS.email, "Email is too long")
    .pipe(z.email("Enter a valid email address")),
  phone: z
    .string()
    .trim()
    .min(1, "Mobile phone is required")
    .max(LIMITS.phone, "Phone number is too long")
    .refine((v) => normalizePhone(v) !== null, "Enter a valid mobile number, e.g. (702) 555-0123"),
  city: text(LIMITS.city, "City"),
  state: z.enum(US_STATES, { error: "Choose a state" }),
});

export const roleSchema = z.object({
  roleInterest: z.enum(values(ROLE_OPTIONS), { error: "Choose how you'd like to help" }),
});

export const socialSchema = z.object({
  instagram: optionalText(LIMITS.handle).refine(
    (v) => v === "" || normalizeHandle(v, "instagram") !== null,
    "Enter a valid Instagram handle, e.g. @yourname",
  ),
  tiktok: optionalText(LIMITS.handle).refine(
    (v) => v === "" || normalizeHandle(v, "tiktok") !== null,
    "Enter a valid TikTok handle, e.g. @yourname",
  ),
  otherSocial: optionalText(LIMITS.url).refine(
    (v) => v === "" || isSafeHttpUrl(v),
    "Enter a full link starting with https://",
  ),
  networkTypes: z
    .array(z.enum(values(NETWORK_OPTIONS)))
    .min(1, "Choose at least one")
    .max(NETWORK_OPTIONS.length),
});

export const availabilitySchema = z.object({
  availability: z.enum(values(AVAILABILITY_OPTIONS), { error: "Choose how often you could join" }),
  eveningsAvailable: z.boolean({ error: "Let us know about evenings" }),
  weekendsAvailable: z.boolean({ error: "Let us know about weekends" }),
});

export const promoterSchema = z.object({
  promoterInviteRange: z.enum(values(INVITE_RANGE_OPTIONS), { error: "Choose a range" }),
  promoterExperience: z.boolean({ error: "Choose yes or no" }),
  promoterExperienceNotes: optionalText(LIMITS.notes),
});

export const hostSchema = z.object({
  hostInterests: z
    .array(z.enum(values(HOST_INTEREST_OPTIONS)))
    .min(1, "Choose at least one area")
    .max(HOST_INTEREST_OPTIONS.length),
});

export const motivationSchema = z.object({
  motivation: z
    .string()
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(LIMITS.motivationMin, "Tell us a little more — a sentence or two is perfect")
        .max(LIMITS.motivationMax, "Please keep it under 1,500 characters"),
    ),
  referralSource: z.enum(values(REFERRAL_SOURCE_OPTIONS), { error: "Choose one" }),
});

/** v2: role-related experience and a short role scenario (no guest demographics, no private contact lists). */
export const experienceSchema = z.object({
  travelRange: z.enum(values(TRAVEL_OPTIONS), { error: "Choose how far you can travel" }),
  relevantExperience: z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(10, "A sentence or two is perfect").max(LIMITS.experience, "Please keep it under 1,500 characters")),
  scenarioResponse: z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(10, "A sentence or two is perfect").max(LIMITS.scenario, "Please keep it under 1,500 characters")),
  portfolioUrl: optionalText(LIMITS.url).refine((v) => v === "" || isSafeHttpUrl(v), "Enter a full link starting with https://"),
});

export const consentSchema = z.object({
  requiredConsent: z.literal(true, { error: "Please confirm the acknowledgement to continue" }),
  marketingConsent: z.boolean().default(false),
});

/** Attribution captured client-side from the landing URL (all optional, all sanitized). */
export const attributionSchema = z
  .object({
    referralCode: z.string().max(LIMITS.code).nullish(),
    campaign: z.string().max(LIMITS.code).nullish(),
    eventId: z.string().max(LIMITS.code).nullish(),
    qrCampaign: z.string().max(LIMITS.code).nullish(),
    utmSource: z.string().max(120).nullish(),
    utmMedium: z.string().max(120).nullish(),
    utmCampaign: z.string().max(120).nullish(),
    utmContent: z.string().max(120).nullish(),
    utmTerm: z.string().max(120).nullish(),
    referringUrl: z.string().max(500).nullish(),
    landingPath: z.string().max(500).nullish(),
    entryPoint: z.string().max(60).nullish(),
    firstTouch: z.record(z.string(), z.string().max(500)).nullish(),
    capturedAt: z.string().max(40).nullish(),
  })
  .default({});

export type AttributionInput = z.input<typeof attributionSchema>;

/** Base shape of a full application (role-specific blocks optional). */
const applicationBase = aboutSchema
  .extend(roleSchema.shape)
  .extend(socialSchema.shape)
  .extend(availabilitySchema.shape)
  .extend(promoterSchema.partial().shape)
  .extend(hostSchema.partial().shape)
  .extend(motivationSchema.shape)
  .extend(experienceSchema.partial().shape)
  .extend(consentSchema.shape)
  .extend({
    attribution: attributionSchema,
    /** Anti-abuse: honeypot (must be empty) + ms timestamp the form was opened. */
    website: z.string().max(200).optional().default(""),
    startedAt: z.number().int().nonnegative().optional(),
    sessionId: z.string().max(64).optional(),
    /** Which acknowledgement text the form displayed. Must equal CONSENT_VERSION for new submissions. */
    consentVersion: z.string().max(40).optional(),
  });

/** Full application — enforces role-conditional requirements. */
export const applicationSchema = applicationBase.superRefine((v, ctx) => {
  for (const k of ["travelRange", "relevantExperience", "scenarioResponse"] as const) {
    if (!v[k]) ctx.addIssue({ code: "custom", path: [k], message: "This answer is required" });
  }
  if (roleNeedsPromoter(v.roleInterest)) {
    if (!v.promoterInviteRange)
      ctx.addIssue({ code: "custom", path: ["promoterInviteRange"], message: "Choose a range" });
    if (typeof v.promoterExperience !== "boolean")
      ctx.addIssue({ code: "custom", path: ["promoterExperience"], message: "Choose yes or no" });
  }
  if (roleNeedsHost(v.roleInterest)) {
    if (!v.hostInterests || v.hostInterests.length === 0)
      ctx.addIssue({ code: "custom", path: ["hostInterests"], message: "Choose at least one area" });
  }
});

export type ApplicationInput = z.input<typeof applicationSchema>;
export type ApplicationParsed = z.output<typeof applicationSchema>;

/** The response is identical for new and duplicate applicants (no account enumeration). */
export type SubmitResult = { status: "received"; receivedAt: string };

/* ------------------------------------------------------------------ */
/* Analytics contract                                                    */
/* ------------------------------------------------------------------ */

export const ANALYTICS_EVENTS = [
  "crew_page_view",
  "role_selected",
  "application_started",
  "application_step_completed",
  "application_abandoned",
  "application_submitted",
  "host_application_submitted",
  "promoter_application_submitted",
  "both_application_submitted",
  "referral_visit",
  "qr_visit",
  "serve_page_view",
  "serve_interest_submitted",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/**
 * Allowlisted analytics properties: name → accepted values. Anything else is
 * dropped server-side. No free text, no URLs with query strings, no PII.
 */
const ROLE_VALUES = [...ROLE_OPTIONS.map((o) => o.value), "unset"] as const;
const STEP_IDS = ["about", "role", "social", "availability", "promoter", "host", "motivation", "experience", "confirm"] as const;
export const ANALYTICS_PROPS: Record<string, { kind: "enum"; values: readonly string[] } | { kind: "code" } | { kind: "int"; max: number } | { kind: "bool" } | { kind: "path" } | { kind: "utm" }> = {
  role: { kind: "enum", values: ROLE_VALUES },
  entry: { kind: "enum", values: ["hero", "header", "nav", "mobile_bar", "role_section", "final", "challenge", "application", "direct", "serve", "unknown"] },
  step: { kind: "enum", values: STEP_IDS },
  last_step: { kind: "enum", values: STEP_IDS },
  step_index: { kind: "int", max: 20 },
  total_steps: { kind: "int", max: 20 },
  steps: { kind: "int", max: 20 },
  resumed: { kind: "bool" },
  has_ref: { kind: "bool" },
  has_event: { kind: "bool" },
  reason: { kind: "enum", values: ["navigated_away", "pagehide", "unknown"] },
  ref: { kind: "code" },
  qr: { kind: "code" },
  event: { kind: "code" },
  path: { kind: "path" },
  utm_source: { kind: "utm" },
  utm_medium: { kind: "utm" },
};

export const labelFor = (
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
) => options.find((o) => o.value === value)?.label ?? value ?? "";
