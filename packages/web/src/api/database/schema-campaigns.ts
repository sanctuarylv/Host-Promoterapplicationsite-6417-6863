/** v2 recruitment marketing workspace (internal planning only — nothing here publishes or spends). */
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

const ms = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = () => new Date();

export const cmpCampaigns = sqliteTable("cmp_campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  concept: text("concept").notNull(),
  code: text("code").notNull().unique(), // utm_campaign value
  start_date: text("start_date").notNull(), // YYYY-MM-DD (editable)
  status: text("status").notNull().default("planning"), // planning | approved | running | closed
  owner_user_id: text("owner_user_id"),
  owner_label: text("owner_label"),
  is_planning_seed: integer("is_planning_seed", { mode: "boolean" }).notNull().default(false),
  revision: integer("revision").notNull().default(1),
  created_at: ms("created_at").notNull().$defaultFn(now),
  updated_at: ms("updated_at").notNull().$defaultFn(now),
});

/** Role targets — planning targets, NOT approved jobs. */
export const cmpGoals = sqliteTable(
  "cmp_goals",
  {
    id: text("id").primaryKey(),
    campaign_id: text("campaign_id").notNull(),
    role_key: text("role_key").notNull(),
    label: text("label").notNull(),
    target: integer("target").notNull(),
    reserve: integer("reserve").notNull().default(0),
    existing_qualified: integer("existing_qualified"), // null = not yet counted
    owner_label: text("owner_label"),
  },
  (t) => [uniqueIndex("cmp_goals_uq").on(t.campaign_id, t.role_key)],
);

export const cmpLinks = sqliteTable(
  "cmp_links",
  {
    id: text("id").primaryKey(),
    campaign_id: text("campaign_id").notNull(),
    label: text("label").notNull(),
    role_hint: text("role_hint"),
    utm_source: text("utm_source").notNull(),
    utm_medium: text("utm_medium").notNull(),
    utm_content: text("utm_content"),
    qr_code: text("qr_code"),
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("cmp_links_campaign_idx").on(t.campaign_id)],
);

export const cmpTasks = sqliteTable(
  "cmp_tasks",
  {
    id: text("id").primaryKey(),
    campaign_id: text("campaign_id").notNull(),
    kind: text("kind").notNull(), // asset | calendar
    phase: text("phase"), // d1_7 | d8_14 | d15_21 | d22_30
    day_offset: integer("day_offset"),
    title: text("title").notNull(),
    channel: text("channel"),
    owner_label: text("owner_label"),
    status: text("status").notNull().default("todo"), // todo | in_progress | done
    created_at: ms("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("cmp_tasks_campaign_idx").on(t.campaign_id, t.kind)],
);

/** Spend lines in cents. proposed ≠ approved ≠ actual; null actual = no spend recorded. */
export const cmpBudgetLines = sqliteTable(
  "cmp_budget_lines",
  {
    id: text("id").primaryKey(),
    campaign_id: text("campaign_id").notNull(),
    category: text("category").notNull(),
    label: text("label").notNull(),
    proposed_cents: integer("proposed_cents").notNull(),
    approved_cents: integer("approved_cents"),
    actual_cents: integer("actual_cents"),
  },
  (t) => [uniqueIndex("cmp_budget_lines_uq").on(t.campaign_id, t.category)],
);
