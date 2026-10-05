/**
 * v2 identity, permissions, audit, outbox and shared infrastructure tables.
 * All rows written by this app are LOCAL STAGING records (authority =
 * "local_staging") until a verified Command Center cutover.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

const ms = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = () => new Date();

/** One row per human (applicant / worker). Identity = normalized email. Phone is NOT an identity key. */
export const crewPeople = sqliteTable(
  "crew_people",
  {
    id: text("id").primaryKey(),
    email_normalized: text("email_normalized").notNull(),
    first_name: text("first_name").notNull(),
    last_name: text("last_name").notNull(),
    phone_normalized: text("phone_normalized"),
    /** Set when another person shares this phone (household numbers) — review flag, never a merge. */
    phone_shared: integer("phone_shared", { mode: "boolean" }).notNull().default(false),
    /** Better Auth user explicitly linked via a one-time link token. Never set from an email match. */
    user_id: text("user_id"),
    linked_at: ms("linked_at"),
    linked_via: text("linked_via"), // link_token:<id>
    authority: text("authority").notNull().default("local_staging"),
    created_at: ms("created_at").notNull().$defaultFn(now),
    updated_at: ms("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("crew_people_email_uq").on(t.email_normalized),
    uniqueIndex("crew_people_user_uq").on(t.user_id),
    index("crew_people_phone_idx").on(t.phone_normalized),
  ],
);

/** One-time person-link tokens (hash only). Created by authorized staff, handed over out-of-band. */
export const personLinkTokens = sqliteTable(
  "person_link_tokens",
  {
    id: text("id").primaryKey(),
    person_id: text("person_id").notNull(),
    token_hash: text("token_hash").notNull(),
    expires_at: ms("expires_at").notNull(),
    used_at: ms("used_at"),
    used_by_user_id: text("used_by_user_id"),
    revoked_at: ms("revoked_at"),
    created_by_user_id: text("created_by_user_id").notNull(),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("person_link_tokens_hash_uq").on(t.token_hash), index("person_link_tokens_person_idx").on(t.person_id)],
);

/**
 * Staff permissions. Accounts alone grant nothing; a membership row does.
 * Rows are granted only by the server-side grant script or by an existing
 * admin membership — there is no public bootstrap.
 */
export const staffMemberships = sqliteTable(
  "staff_memberships",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    role: text("role").notNull(), // admin | recruiter | department_lead | event_director | promotion_lead | compensation_approver
    event_id: text("event_id"), // null = all events (where the role is event-scoped)
    department_key: text("department_key"), // required for department_lead
    granted_by: text("granted_by").notNull(), // user id or "cli:<operator>"
    granted_at: ms("granted_at").notNull().$defaultFn(now),
    revoked_at: ms("revoked_at"),
    revoked_by: text("revoked_by"),
  },
  (t) => [index("staff_memberships_user_idx").on(t.user_id)],
);

/** Append-only audit log for every decision / privileged action. Never updated or deleted by the app. */
export const crewAudit = sqliteTable(
  "crew_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id").notNull(),
    action: text("action").notNull(),
    actor_user_id: text("actor_user_id"),
    actor_label: text("actor_label").notNull(), // "staff:<role>" | "worker" | "applicant" | "system" | "cli"
    from_value: text("from_value"),
    to_value: text("to_value"),
    revision: integer("revision"),
    note: text("note"),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("crew_audit_entity_idx").on(t.entity_type, t.entity_id, t.created_at), index("crew_audit_action_idx").on(t.action, t.created_at)],
);

/** Shared fixed-window rate limit counters (DB-backed so every instance agrees). */
export const crewRateLimits = sqliteTable("crew_rate_limits", {
  key: text("key").primaryKey(),
  window_start: integer("window_start").notNull(), // epoch ms
  count: integer("count").notNull(),
});

/**
 * Durable outbox. One row per (aggregate, operation, version). The
 * idempotency key is stable for the life of the operation; a changed
 * canonical status is a NEW row (operation application.status, version n).
 */
export const crewOutbox = sqliteTable(
  "crew_outbox",
  {
    id: text("id").primaryKey(),
    aggregate_type: text("aggregate_type").notNull(), // application
    aggregate_id: text("aggregate_id").notNull(),
    operation: text("operation").notNull(), // application.create | application.status
    op_version: integer("op_version").notNull().default(1),
    idempotency_key: text("idempotency_key").notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    payload_hash: text("payload_hash").notNull(),
    status: text("status").notNull().default("pending"), // held | pending | processing | synced | failed | dead
    attempts: integer("attempts").notNull().default(0),
    max_attempts: integer("max_attempts").notNull().default(8),
    next_attempt_at: ms("next_attempt_at").notNull().$defaultFn(now),
    claimed_by: text("claimed_by"),
    claim_expires_at: ms("claim_expires_at"),
    last_error: text("last_error"),
    last_error_class: text("last_error_class"), // network | timeout | server | rate_limited | rejected | auth | conflict | malformed | not_configured
    receipt_id: text("receipt_id"),
    canonical_id: text("canonical_id"),
    synced_at: ms("synced_at"),
    created_at: ms("created_at").notNull().$defaultFn(now),
    updated_at: ms("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("crew_outbox_idem_uq").on(t.idempotency_key),
    index("crew_outbox_due_idx").on(t.status, t.next_attempt_at),
    index("crew_outbox_agg_idx").on(t.aggregate_type, t.aggregate_id),
  ],
);

/** Key/value settings (integration mode, cutover boundary, last health probe). Server-only. */
export const crewSettings = sqliteTable("crew_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updated_by: text("updated_by"),
  updated_at: ms("updated_at").notNull().$defaultFn(now),
});

/** Paid opportunities operated by Sanctuary LV Group. status=candidate_interest until terms are approved. */
export const crewOpportunities = sqliteTable("crew_opportunities", {
  key: text("key").primaryKey(),
  title: text("title").notNull(),
  operator_entity: text("operator_entity").notNull(), // "Sanctuary LV Group"
  role_keys: text("role_keys", { mode: "json" }).$type<string[]>().notNull(),
  status: text("status").notNull(), // legacy | candidate_interest | open | closed
  accepts_applications: integer("accepts_applications", { mode: "boolean" }).notNull().default(false),
  description: text("description"),
  created_at: ms("created_at").notNull().$defaultFn(now),
});

/**
 * Sanctuary LV nonprofit Volunteer / Serve Team — a SEPARATE pathway with its
 * own records, consent and approval workflow. Never joined into paid statuses.
 */
export const serveInterest = sqliteTable(
  "serve_interest",
  {
    id: text("id").primaryKey(),
    first_name: text("first_name").notNull(),
    last_name: text("last_name").notNull(),
    email_normalized: text("email_normalized").notNull(),
    phone_normalized: text("phone_normalized"),
    city: text("city"),
    areas: text("areas", { mode: "json" }).$type<string[]>().notNull(),
    availability: text("availability").notNull(),
    notes: text("notes"),
    consent_version: text("consent_version").notNull(),
    consent_at: ms("consent_at").notNull(),
    status: text("status").notNull().default("received"), // received | contacted | approved_to_serve | not_now | withdrawn
    revision: integer("revision").notNull().default(1),
    authority: text("authority").notNull().default("local_staging"),
    created_at: ms("created_at").notNull().$defaultFn(now),
    updated_at: ms("updated_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("serve_interest_email_uq").on(t.email_normalized)],
);
