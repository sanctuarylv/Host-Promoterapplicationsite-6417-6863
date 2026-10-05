import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Crew applications — local system of record + outbox for the future
 * Sanctuary Command Center integration (see docs/COMMAND_CENTER_INTEGRATION.md).
 * Column names follow the Command Center-facing snake_case data model.
 */
export const crewApplications = sqliteTable(
  "crew_applications",
  {
    id: text("id").primaryKey(), // UUID v4 — portable across systems

    first_name: text("first_name").notNull(),
    last_name: text("last_name").notNull(),
    email: text("email").notNull(),
    email_normalized: text("email_normalized").notNull(),
    phone: text("phone").notNull(), // as entered (display)
    phone_normalized: text("phone_normalized").notNull(), // E.164
    city: text("city").notNull(),
    state: text("state").notNull(),

    role_interest: text("role_interest").notNull(), // host | promoter | both | not_sure | lead_* (additive)

    /* ---- v2 (migration 0001) — person identity + opportunity scope ---- */
    person_id: text("person_id"), // crew_people.id (backfilled for legacy rows)
    opportunity_key: text("opportunity_key").notNull().default("general_interest"),
    pathway: text("pathway").notNull().default("legacy_mixed"), // paid_group | legacy_mixed
    contract_version: text("contract_version").notNull().default("crew-application.v1"),
    legacy_status: text("legacy_status"), // original v1 status, kept for audit
    status_flags: text("status_flags", { mode: "json" }).$type<string[]>().notNull().default([]),
    revision: integer("revision").notNull().default(1),
    reviewer_user_id: text("reviewer_user_id"),
    review_due_at: integer("review_due_at", { mode: "timestamp" }),
    authority: text("authority").notNull().default("local_staging"), // local_staging | canonical_mirror
    travel_range: text("travel_range"),
    relevant_experience: text("relevant_experience"),
    scenario_response: text("scenario_response"),
    portfolio_url: text("portfolio_url"),

    instagram: text("instagram"),
    tiktok: text("tiktok"),
    other_social: text("other_social"),
    network_types: text("network_types", { mode: "json" }).$type<string[]>().notNull(),

    availability: text("availability").notNull(),
    evenings_available: integer("evenings_available", { mode: "boolean" }).notNull(),
    weekends_available: integer("weekends_available", { mode: "boolean" }).notNull(),

    promoter_invite_range: text("promoter_invite_range"),
    promoter_experience: integer("promoter_experience", { mode: "boolean" }),
    promoter_experience_notes: text("promoter_experience_notes"),

    host_interests: text("host_interests", { mode: "json" }).$type<string[]>().notNull(),

    motivation: text("motivation").notNull(),
    referral_source: text("referral_source").notNull(),

    // Attribution (last-touch columns; first touch kept in attribution_json)
    referral_code_used: text("referral_code_used"),
    referral_code_status: text("referral_code_status"), // unverified | valid | invalid | none
    campaign: text("campaign"),
    event_id: text("event_id"),
    qr_campaign: text("qr_campaign"),
    utm_source: text("utm_source"),
    utm_medium: text("utm_medium"),
    utm_campaign: text("utm_campaign"),
    utm_content: text("utm_content"),
    utm_term: text("utm_term"),
    referring_url: text("referring_url"),
    landing_path: text("landing_path"),
    entry_point: text("entry_point"),
    attribution_json: text("attribution_json", { mode: "json" }).$type<Record<string, unknown>>(),

    application_status: text("application_status").notNull().default("submitted"),

    // Consent — required acknowledgement and optional marketing kept separate
    required_consent_at: integer("required_consent_at", { mode: "timestamp" }).notNull(),
    consent_version: text("consent_version").notNull(),
    marketing_consent: integer("marketing_consent", { mode: "boolean" }).notNull().default(false),
    marketing_consent_at: integer("marketing_consent_at", { mode: "timestamp" }),

    // Command Center outbox
    sync_status: text("sync_status").notNull().default("not_configured"), // not_configured | pending | synced | failed
    sync_attempts: integer("sync_attempts").notNull().default(0),
    sync_error: text("sync_error"),
    synced_at: integer("synced_at", { mode: "timestamp" }),
    external_id: text("external_id"),

    // Duplicate protection bookkeeping (never exposed publicly)
    duplicate_attempts: integer("duplicate_attempts").notNull().default(0),
    last_duplicate_at: integer("last_duplicate_at", { mode: "timestamp" }),

    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // v2: one application per (email, opportunity). Legacy rows all sit in
    // opportunity "general_interest", so this is never weaker than the v1 index.
    uniqueIndex("crew_applications_email_opp_uq").on(t.email_normalized, t.opportunity_key),
    uniqueIndex("crew_applications_person_opp_uq").on(t.person_id, t.opportunity_key),
    index("crew_applications_phone_idx").on(t.phone_normalized),
    index("crew_applications_status_idx").on(t.application_status, t.created_at),
    index("crew_applications_created_idx").on(t.created_at),
    index("crew_applications_ref_idx").on(t.referral_code_used),
    index("crew_applications_sync_idx").on(t.sync_status),
  ],
);

/**
 * First-party conversion events (no PII). Mirrors what is sent to the
 * Runable analytics collector so the admin view can show a simple funnel.
 */
export const crewEvents = sqliteTable(
  "crew_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    session_id: text("session_id"),
    props: text("props", { mode: "json" }).$type<Record<string, string | number | boolean>>(),
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("crew_events_name_idx").on(t.name, t.created_at)],
);

export * from "./auth-schema";
export * from "./schema-identity";
export * from "./schema-recruiting";
export * from "./schema-ops";
export * from "./schema-campaigns";

export type CrewApplicationRow = typeof crewApplications.$inferSelect;
export type CrewApplicationInsert = typeof crewApplications.$inferInsert;
