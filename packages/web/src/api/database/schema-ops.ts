/**
 * v2 event staffing tables (planning + local staging). Template versions are
 * immutable once published; event-level changes live in overrides.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

const ms = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = () => new Date();

export const opsOrgUnits = sqliteTable("ops_org_units", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // leadership | department | liaison | external
  authority_note: text("authority_note"),
});

/** Reporting relationships, stored per relation type so operational and pastoral lines never mix. */
export const opsReportingLines = sqliteTable(
  "ops_reporting_lines",
  {
    id: text("id").primaryKey(),
    relation: text("relation").notNull(), // operational | pastoral | coordination
    child_key: text("child_key").notNull(),
    parent_key: text("parent_key").notNull(),
    note: text("note"),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("ops_reporting_lines_uq").on(t.relation, t.child_key, t.parent_key)],
);

export const opsTemplates = sqliteTable("ops_templates", {
  id: text("id").primaryKey(),
  template_key: text("template_key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  created_at: ms("created_at").notNull().$defaultFn(now),
});

export const opsTemplateVersions = sqliteTable(
  "ops_template_versions",
  {
    id: text("id").primaryKey(),
    template_id: text("template_id").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"), // draft | published
    planning_guests: integer("planning_guests"),
    planning_guest_range: text("planning_guest_range"),
    milestones: text("milestones", { mode: "json" }).$type<{ key: string; label: string; local_time: string; day_offset: number }[]>().notNull(),
    source_note: text("source_note"),
    published_at: ms("published_at"),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("ops_template_versions_uq").on(t.template_id, t.version)],
);

/** Role slots in a template version. Null counts mean UNKNOWN (never zero). */
export const opsTemplateRoles = sqliteTable(
  "ops_template_roles",
  {
    id: text("id").primaryKey(),
    template_version_id: text("template_version_id").notNull(),
    role_key: text("role_key").notNull(),
    title: text("title").notNull(),
    group_key: text("group_key").notNull(),
    department_key: text("department_key").notNull(),
    slot_class: text("slot_class").notNull(), // core | talent | care | promoter | founder | venue
    workforce: text("workforce").notNull(), // paid_group | nonprofit_serve | founder_tbd | venue_provider | provider | unclassified (ops/coverage.ts WORKFORCE_KINDS)
    provider: text("provider"),
    min_count: integer("min_count"),
    recommended_count: integer("recommended_count"),
    approved_count: integer("approved_count"),
    confirmation: text("confirmation").notNull().default("proposed"), // proposed | provisional | unconfirmed | approved
    supervisor_role_key: text("supervisor_role_key"),
    responsibilities: text("responsibilities"),
    call_offset_min: integer("call_offset_min"), // relative to doors
    release_offset_min: integer("release_offset_min"),
    dress: text("dress"),
    training: text("training", { mode: "json" }).$type<string[]>().notNull().default([]),
    qualifications: text("qualifications", { mode: "json" }).$type<string[]>().notNull().default([]),
    zones: text("zones", { mode: "json" }).$type<string[]>().notNull().default([]),
    phase_duties: text("phase_duties", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("ops_template_roles_uq").on(t.template_version_id, t.role_key)],
);

export const opsEvents = sqliteTable("ops_events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("planning"), // planning | confirmed | live | closed | cancelled
  template_version_id: text("template_version_id").notNull(),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  local_date: text("local_date"), // YYYY-MM-DD — null until a real date is confirmed
  date_confirmed: integer("date_confirmed", { mode: "boolean" }).notNull().default(false),
  /** Resolved milestones (UTC ms + local wall time), only when the date is confirmed. */
  resolved_milestones: text("resolved_milestones", { mode: "json" }).$type<{ key: string; label: string; local: string; utc: number }[]>(),
  venue_name: text("venue_name"),
  venue_confirmed: integer("venue_confirmed", { mode: "boolean" }).notNull().default(false),
  planning_guests: integer("planning_guests"),
  is_planning_seed: integer("is_planning_seed", { mode: "boolean" }).notNull().default(false),
  authority: text("authority").notNull().default("local_staging"),
  revision: integer("revision").notNull().default(1),
  created_by: text("created_by").notNull(),
  created_at: ms("created_at").notNull().$defaultFn(now),
  updated_at: ms("updated_at").notNull().$defaultFn(now),
});

/** Event-level count overrides (separate from the immutable template). */
export const opsEventRoleOverrides = sqliteTable(
  "ops_event_role_overrides",
  {
    id: text("id").primaryKey(),
    event_id: text("event_id").notNull(),
    role_key: text("role_key").notNull(),
    count: integer("count"), // null = unknown
    reason: text("reason").notNull(),
    approved_by: text("approved_by").notNull(),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("ops_event_role_overrides_uq").on(t.event_id, t.role_key)],
);

/** Provider (venue / vendor) fulfillment — replaces corresponding Sanctuary demand. */
export const opsProviderFulfillment = sqliteTable(
  "ops_provider_fulfillment",
  {
    id: text("id").primaryKey(),
    event_id: text("event_id").notNull(),
    role_key: text("role_key").notNull(),
    provider: text("provider").notNull(),
    count: integer("count"), // null = unknown
    status: text("status").notNull().default("provisional"), // provisional | confirmed
    note: text("note"),
    created_by: text("created_by").notNull(),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("ops_provider_fulfillment_uq").on(t.event_id, t.role_key, t.provider)],
);

export const opsAssignments = sqliteTable(
  "ops_assignments",
  {
    id: text("id").primaryKey(),
    event_id: text("event_id").notNull(),
    person_id: text("person_id").notNull(),
    role_key: text("role_key").notNull(),
    department_key: text("department_key").notNull(),
    offer_id: text("offer_id"),
    shift_start_utc: ms("shift_start_utc"),
    shift_end_utc: ms("shift_end_utc"),
    shift_confirmed: integer("shift_confirmed", { mode: "boolean" }).notNull().default(false),
    supervisor_person_id: text("supervisor_person_id"),
    zones: text("zones", { mode: "json" }).$type<string[]>().notNull().default([]),
    concurrent_with: text("concurrent_with"), // assignment id of an approved compatible overlap
    status: text("status").notNull().default("proposed"), // proposed | approved | cancelled
    revision: integer("revision").notNull().default(1),
    created_by: text("created_by").notNull(),
    created_at: ms("created_at").notNull().$defaultFn(now),
    updated_at: ms("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("ops_assignments_event_idx").on(t.event_id, t.department_key), index("ops_assignments_person_idx").on(t.person_id)],
);

export const opsRunOfShow = sqliteTable(
  "ops_run_of_show",
  {
    id: text("id").primaryKey(),
    event_id: text("event_id").notNull(),
    seq: integer("seq").notNull(),
    milestone_key: text("milestone_key"),
    offset_min: integer("offset_min").notNull().default(0),
    title: text("title").notNull(),
    department_key: text("department_key"),
    notes: text("notes"),
  },
  (t) => [index("ops_run_of_show_event_idx").on(t.event_id, t.seq)],
);

/** Opaque staff credentials (no PII). Only the token hash is stored. */
export const opsCredentials = sqliteTable(
  "ops_credentials",
  {
    id: text("id").primaryKey(),
    assignment_id: text("assignment_id").notNull(),
    event_id: text("event_id").notNull(),
    person_id: text("person_id").notNull(),
    token_hash: text("token_hash").notNull(),
    zones: text("zones", { mode: "json" }).$type<string[]>().notNull(),
    issued_by: text("issued_by").notNull(),
    issued_at: ms("issued_at").notNull().$defaultFn(now),
    expires_at: ms("expires_at").notNull(),
    revoked_at: ms("revoked_at"),
    revoked_reason: text("revoked_reason"),
  },
  (t) => [uniqueIndex("ops_credentials_hash_uq").on(t.token_hash), index("ops_credentials_assignment_idx").on(t.assignment_id)],
);

/** Staff attendance — append-only. Corrections are new rows that reference the corrected row. */
export const opsAttendance = sqliteTable(
  "ops_attendance",
  {
    id: text("id").primaryKey(),
    assignment_id: text("assignment_id").notNull(),
    event_id: text("event_id").notNull(),
    person_id: text("person_id").notNull(),
    kind: text("kind").notNull(), // check_in | break_start | break_end | check_out | void
    at_utc: ms("at_utc").notNull(),
    source: text("source").notNull(), // credential_scan | staff_entry | correction
    corrects_id: text("corrects_id"),
    reason: text("reason"),
    recorded_by: text("recorded_by").notNull(),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("ops_attendance_assignment_idx").on(t.assignment_id, t.at_utc)],
);

/** Guest promoter links — event-specific, approved. Distinct from recruitment referral codes. */
export const guestPromoterLinks = sqliteTable(
  "guest_promoter_links",
  {
    id: text("id").primaryKey(),
    event_id: text("event_id").notNull(),
    person_id: text("person_id").notNull(),
    code: text("code").notNull(),
    status: text("status").notNull().default("approved"), // approved | revoked
    valid_from: ms("valid_from").notNull(),
    approved_by: text("approved_by").notNull(),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("guest_promoter_links_code_uq").on(t.code), uniqueIndex("guest_promoter_links_event_person_uq").on(t.event_id, t.person_id)],
);

/** Guest registrations (staging). guest_key = salted hash of normalized email — no raw guest PII here. */
export const guestRegistrations = sqliteTable(
  "guest_registrations",
  {
    id: text("id").primaryKey(),
    event_id: text("event_id").notNull(),
    guest_key: text("guest_key").notNull(),
    promoter_link_id: text("promoter_link_id"),
    registered_at: ms("registered_at").notNull(),
    source: text("source").notNull().default("test_fixture"), // test_fixture | import
  },
  (t) => [uniqueIndex("guest_registrations_event_guest_uq").on(t.event_id, t.guest_key)],
);

/** Guest admission scans — append-only; repeat scans are recorded as reentry, never a second attendee. */
export const guestScans = sqliteTable(
  "guest_scans",
  {
    id: text("id").primaryKey(),
    event_id: text("event_id").notNull(),
    registration_id: text("registration_id").notNull(),
    result: text("result").notNull(), // admitted | reentry
    scanned_at: ms("scanned_at").notNull(),
    scanned_by: text("scanned_by").notNull(),
  },
  (t) => [index("guest_scans_event_idx").on(t.event_id, t.registration_id)],
);

export const opsCloseouts = sqliteTable("ops_closeouts", {
  event_id: text("event_id").primaryKey(),
  status: text("status").notNull().default("draft"), // draft | submitted
  coverage_issues: text("coverage_issues"),
  training_feedback: text("training_feedback"),
  guest_service_feedback: text("guest_service_feedback"),
  content_handoff: text("content_handoff"),
  incident_refs: text("incident_refs"),
  return_availability: text("return_availability", { mode: "json" }).$type<Record<string, "yes" | "no" | "unsure">>().notNull().default({}),
  revision: integer("revision").notNull().default(1),
  updated_by: text("updated_by").notNull(),
  updated_at: ms("updated_at").notNull().$defaultFn(now),
});
