/** v2 recruiting tables: interviews, scorecards, terms, offers, training, qualifications. */
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

const ms = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = () => new Date();

export const crewInterviews = sqliteTable(
  "crew_interviews",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id").notNull(),
    kind: text("kind").notNull(), // screen | assessment
    format: text("format").notNull(), // phone | video | in_person | simulated_assessment
    scheduled_at: ms("scheduled_at"),
    interviewer_user_id: text("interviewer_user_id"),
    status: text("status").notNull().default("scheduled"), // scheduled | completed | no_show | cancelled
    notes: text("notes"),
    revision: integer("revision").notNull().default(1),
    created_by: text("created_by").notNull(),
    created_at: ms("created_at").notNull().$defaultFn(now),
    updated_at: ms("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("crew_interviews_app_idx").on(t.application_id)],
);

/** Anchored scorecard submissions — append-only; a re-score is a new row. */
export const crewScorecards = sqliteTable(
  "crew_scorecards",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id").notNull(),
    kind: text("kind").notNull(), // host | promoter
    rubric_version: text("rubric_version").notNull(),
    scores: text("scores", { mode: "json" }).$type<Record<string, number>>().notNull(),
    evidence: text("evidence", { mode: "json" }).$type<Record<string, string>>().notNull(),
    recommendation: text("recommendation").notNull(), // advance | hold | do_not_advance
    reviewer_user_id: text("reviewer_user_id").notNull(),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("crew_scorecards_app_idx").on(t.application_id)],
);

/**
 * Engagement terms (versioned). Approved versions are immutable; changes create
 * a new version. Compensation text is entered by an authorized approver — the
 * app never invents amounts or classifications.
 */
export const crewTerms = sqliteTable(
  "crew_terms",
  {
    id: text("id").primaryKey(),
    terms_key: text("terms_key").notNull(), // e.g. host-after-dark
    version: integer("version").notNull(),
    operator_entity: text("operator_entity").notNull(),
    role_key: text("role_key").notNull(),
    title: text("title").notNull(),
    duties: text("duties").notNull(),
    compensation: text("compensation").notNull(),
    pay_basis: text("pay_basis").notNull(),
    schedule: text("schedule").notNull(),
    engagement_arrangement: text("engagement_arrangement").notNull(), // proposed arrangement — requires approval
    acceptance_requirements: text("acceptance_requirements").notNull(),
    status: text("status").notNull().default("draft"), // draft | approved | retired
    created_by: text("created_by").notNull(),
    approved_by: text("approved_by"),
    approved_at: ms("approved_at"),
    retired_at: ms("retired_at"),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("crew_terms_key_version_uq").on(t.terms_key, t.version)],
);

export const crewOffers = sqliteTable(
  "crew_offers",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id").notNull(),
    person_id: text("person_id").notNull(),
    terms_id: text("terms_id").notNull(),
    status: text("status").notNull().default("issued"), // issued | accepted | declined | expired | cancelled
    revision: integer("revision").notNull().default(1),
    expires_at: ms("expires_at").notNull(),
    issued_by: text("issued_by").notNull(),
    responded_at: ms("responded_at"),
    response_note: text("response_note"),
    created_at: ms("created_at").notNull().$defaultFn(now),
    updated_at: ms("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("crew_offers_person_idx").on(t.person_id), index("crew_offers_app_idx").on(t.application_id)],
);

export const crewTrainingModules = sqliteTable(
  "crew_training_modules",
  {
    id: text("id").primaryKey(),
    module_key: text("module_key").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    required_for: text("required_for", { mode: "json" }).$type<string[]>().notNull(), // role keys; ["*"] = all
    verification: text("verification").notNull(), // self_attest | staff_verified
    status: text("status").notNull().default("active"), // active | retired
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("crew_training_modules_key_version_uq").on(t.module_key, t.version)],
);

export const crewTrainingRecords = sqliteTable(
  "crew_training_records",
  {
    id: text("id").primaryKey(),
    person_id: text("person_id").notNull(),
    module_id: text("module_id").notNull(),
    completed_at: ms("completed_at"),
    verified_at: ms("verified_at"),
    verified_by: text("verified_by"),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("crew_training_records_uq").on(t.person_id, t.module_id)],
);

export const crewQualifications = sqliteTable(
  "crew_qualifications",
  {
    id: text("id").primaryKey(),
    person_id: text("person_id").notNull(),
    qualification_key: text("qualification_key").notNull(),
    verified_by: text("verified_by").notNull(),
    verified_at: ms("verified_at").notNull(),
    expires_at: ms("expires_at"),
    revoked_at: ms("revoked_at"),
  },
  (t) => [index("crew_qualifications_person_idx").on(t.person_id)],
);
