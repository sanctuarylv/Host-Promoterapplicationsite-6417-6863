/**
 * PLANNING seed — idempotent, local test DB only (see guard.ts).
 *
 *   bun scripts/seed-planning.ts --dry-run
 *   bun scripts/seed-planning.ts
 *
 * Seeds planning data only: org chain, the After Dark staffing template
 * (51 Sanctuary-side slots = 30 core + 8 talent + 5 care + 6 promoters + 2
 * founders, plus provisional/unknown venue allowances), a planning event with
 * NO confirmed date or venue, training modules, the candidate-interest
 * opportunity, and the "Build the Night. Welcome the City." campaign.
 *
 * It creates no workers, approves no pay, books no venue and publishes nothing.
 * Every count marked `proposed` / `provisional` / null (unknown) stays that way.
 * The 36-role staffing workbook was NOT supplied, so it is NOT imported.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/api/database";
import {
  cmpBudgetLines,
  cmpCampaigns,
  cmpGoals,
  cmpLinks,
  cmpTasks,
  crewOpportunities,
  crewTrainingModules,
  opsEvents,
  opsOrgUnits,
  opsReportingLines,
  opsTemplateRoles,
  opsTemplates,
  opsTemplateVersions,
} from "../src/api/database/schema";
import { createsCycle } from "../src/api/ops/org";
import { slotTotals } from "../src/api/ops/coverage";
import { DEFAULT_OPPORTUNITY, PAID_OPERATOR_ENTITY } from "../src/api/crew/contract";
import { setSetting } from "../src/api/shared/settings";
import { assertWritable } from "./guard";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const target = assertWritable(argv, dryRun);
const BY = "cli:seed-planning";
const SEED_ID = (k: string) => `seed_${k}`;

// ── Org chain ──────────────────────────────────────────────────────────────
const UNITS = [
  { key: "founders", name: "Erskine / Andrea (founders)", kind: "leadership", authority_note: "Entity / pay status to confirm" },
  { key: "event_director", name: "Event Director", kind: "leadership", authority_note: null },
  { key: "operations", name: "Operations", kind: "department", authority_note: null },
  { key: "guest_experience", name: "Guest Experience", kind: "department", authority_note: null },
  { key: "promotion", name: "Promotion", kind: "department", authority_note: null },
  { key: "production", name: "Production", kind: "department", authority_note: null },
  { key: "content", name: "Content", kind: "department", authority_note: "Reports through Production" },
  { key: "music", name: "Music", kind: "department", authority_note: null },
  { key: "ministry", name: "Ministry", kind: "department", authority_note: "Operational → Event Director; pastoral supervision → founders" },
  { key: "venue_liaison", name: "Venue Liaison", kind: "liaison", authority_note: null },
  {
    key: "venue_ops",
    name: "Venue operations (venue not confirmed)",
    kind: "external",
    authority_note: "Venue personnel stay under venue/provider authority, including emergency and security. No venue partnership is confirmed.",
  },
] as const;

const LINES: { relation: "operational" | "pastoral" | "coordination"; child: string; parent: string; note?: string }[] = [
  { relation: "operational", child: "event_director", parent: "founders" },
  ...["operations", "guest_experience", "promotion", "production", "music", "ministry"].map((c) => ({ relation: "operational" as const, child: c, parent: "event_director" })),
  { relation: "operational", child: "content", parent: "production" },
  { relation: "operational", child: "venue_liaison", parent: "operations" },
  { relation: "coordination", child: "venue_liaison", parent: "venue_ops", note: "Coordination only — not a reporting line" },
  { relation: "pastoral", child: "ministry", parent: "founders", note: "Pastoral supervision, separate from operational reporting" },
];

// ── After Dark template v1 ─────────────────────────────────────────────────
type R = {
  key: string;
  title: string;
  group: string;
  dept: string;
  cls: "core" | "talent" | "care" | "promoter" | "founder" | "venue";
  wf: "paid_group" | "nonprofit_serve" | "founder_tbd" | "venue_provider" | "unclassified";
  n: number | null;
  conf?: "proposed" | "provisional" | "unconfirmed";
  sup?: string;
  provider?: string;
  zones?: string[];
  training?: string[];
  resp?: string;
};
const GX = ["guest_service_fundamentals", "event_orientation", "venue_safety_authority"];
const ROLES: R[] = [
  // Operations — 6
  { key: "event_director", title: "Event Director", group: "operations", dept: "operations", cls: "core", wf: "unclassified", n: 1, sup: "founders", zones: ["all_staff"] },
  { key: "ops_lead", title: "Operations Lead", group: "operations", dept: "operations", cls: "core", wf: "unclassified", n: 1, sup: "event_director", zones: ["all_staff"] },
  { key: "venue_liaison", title: "Venue Liaison", group: "operations", dept: "operations", cls: "core", wf: "unclassified", n: 1, sup: "ops_lead", zones: ["all_staff"] },
  { key: "runner", title: "Runner", group: "operations", dept: "operations", cls: "core", wf: "unclassified", n: 2, sup: "ops_lead", zones: ["back_of_house"] },
  { key: "serve_coordinator", title: "Serve Team Coordinator (Sanctuary LV nonprofit)", group: "operations", dept: "operations", cls: "core", wf: "nonprofit_serve", n: 1, sup: "ops_lead", zones: ["front_of_house"], resp: "Coordinates unpaid Serve Team volunteers. Separate from paid Group roles." },
  // Guest Experience — 12
  { key: "guest_experience_lead", title: "Guest Experience Lead", group: "guest_experience", dept: "guest_experience", cls: "core", wf: "paid_group", n: 1, sup: "event_director", zones: ["front_of_house"], training: GX },
  { key: "host", title: "Host", group: "guest_experience", dept: "guest_experience", cls: "core", wf: "paid_group", n: 6, sup: "guest_experience_lead", zones: ["front_of_house"], training: GX },
  { key: "vip_host", title: "VIP Host", group: "guest_experience", dept: "guest_experience", cls: "core", wf: "paid_group", n: 1, sup: "guest_experience_lead", zones: ["front_of_house", "vip"], training: GX },
  { key: "registration_lead", title: "Registration Lead", group: "guest_experience", dept: "guest_experience", cls: "core", wf: "paid_group", n: 1, sup: "guest_experience_lead", zones: ["front_of_house"], training: GX },
  { key: "door_team", title: "Door Team", group: "guest_experience", dept: "guest_experience", cls: "core", wf: "paid_group", n: 3, sup: "guest_experience_lead", zones: ["front_of_house"], training: GX, resp: "Welcome and ticket/registration check. Security authority stays with the venue." },
  // Promotion operations — 1
  { key: "promoter_manager", title: "Promoter Manager", group: "promotion_ops", dept: "promotion", cls: "core", wf: "paid_group", n: 1, sup: "event_director", training: ["promoter_tracking_accuracy", "event_orientation"] },
  // Production — 6
  ...(["production_manager:Production Manager", "stage_manager:Stage Manager", "audio:Audio", "lighting:Lighting", "video_led:Video / LED", "technical_utility:Technical Utility"] as const).map(
    (s, i): R => {
      const [key, title] = s.split(":") as [string, string];
      return { key, title, group: "production", dept: "production", cls: "core", wf: "unclassified", n: 1, sup: i === 0 ? "event_director" : "production_manager", zones: ["back_of_house", "stage"] };
    },
  ),
  // Content — 5
  { key: "content_director", title: "Content Director", group: "content", dept: "content", cls: "core", wf: "unclassified", n: 1, sup: "production_manager" },
  { key: "photographer", title: "Photographer", group: "content", dept: "content", cls: "core", wf: "unclassified", n: 1, sup: "content_director" },
  { key: "videographer", title: "Videographer", group: "content", dept: "content", cls: "core", wf: "unclassified", n: 2, sup: "content_director" },
  { key: "social_creator", title: "Social Creator", group: "content", dept: "content", cls: "core", wf: "unclassified", n: 1, sup: "content_director" },
  // Music / talent — 8
  { key: "music_director", title: "Music Director", group: "music", dept: "music", cls: "talent", wf: "unclassified", n: 1, sup: "event_director", zones: ["stage", "back_of_house"] },
  { key: "dj", title: "DJ", group: "music", dept: "music", cls: "talent", wf: "unclassified", n: 1, sup: "music_director", zones: ["stage"] },
  { key: "worship_leader", title: "Worship Leader", group: "music", dept: "music", cls: "talent", wf: "unclassified", n: 1, sup: "music_director", zones: ["stage"] },
  { key: "musician_vocalist", title: "Musicians / Vocalists", group: "music", dept: "music", cls: "talent", wf: "unclassified", n: 5, sup: "music_director", zones: ["stage"] },
  // Ministry — 5
  { key: "prayer_lead", title: "Prayer Lead", group: "ministry", dept: "ministry", cls: "care", wf: "unclassified", n: 1, sup: "event_director", resp: "Optional prayer for guests who ask. No care notes in roster records." },
  { key: "prayer_team", title: "Prayer Team", group: "ministry", dept: "ministry", cls: "care", wf: "unclassified", n: 4, sup: "prayer_lead" },
  // Promoters — 6
  { key: "promoter", title: "Promoter", group: "promoters", dept: "promotion", cls: "promoter", wf: "paid_group", n: 6, sup: "promoter_manager", training: ["promoter_tracking_accuracy", "event_orientation"], resp: "Pre-event outreach; onsite only when assigned." },
  // Founders — 2
  { key: "founder", title: "Founders (Erskine and Andrea)", group: "founders", dept: "leadership", cls: "founder", wf: "founder_tbd", n: 2, conf: "unconfirmed", resp: "Entity / pay status to confirm." },
  // Venue allowances (venue/provider authority) — provisional / unknown
  { key: "venue_security_supervisor", title: "Security Supervisor (venue)", group: "venue", dept: "venue", cls: "venue", wf: "venue_provider", n: 1, conf: "provisional", provider: "venue" },
  { key: "venue_security_officer", title: "Security Officers (venue)", group: "venue", dept: "venue", cls: "venue", wf: "venue_provider", n: 4, conf: "provisional", provider: "venue" },
  { key: "venue_duty_manager", title: "Duty Manager (venue)", group: "venue", dept: "venue", cls: "venue", wf: "venue_provider", n: 1, conf: "provisional", provider: "venue" },
  { key: "venue_fnb", title: "Food & beverage (venue)", group: "venue", dept: "venue", cls: "venue", wf: "venue_provider", n: null, conf: "unconfirmed", provider: "venue" },
  { key: "venue_engineering", title: "Engineering (venue)", group: "venue", dept: "venue", cls: "venue", wf: "venue_provider", n: null, conf: "unconfirmed", provider: "venue" },
  { key: "venue_housekeeping", title: "Housekeeping (venue)", group: "venue", dept: "venue", cls: "venue", wf: "venue_provider", n: null, conf: "unconfirmed", provider: "venue" },
  { key: "venue_medical", title: "Medical coverage (venue/provider)", group: "venue", dept: "venue", cls: "venue", wf: "venue_provider", n: null, conf: "unconfirmed", provider: "venue" },
];

const MILESTONES = [
  { key: "doors", label: "Doors", local_time: "19:00", day_offset: 0 },
  { key: "show", label: "Show", local_time: "20:00", day_offset: 0 },
  { key: "program_end", label: "Program end", local_time: "22:30", day_offset: 0 },
  { key: "guest_close", label: "Guest close", local_time: "23:00", day_offset: 0 },
  { key: "strike_end", label: "Strike end", local_time: "01:00", day_offset: 1 },
];

const MODULES = [
  { key: "event_orientation", title: "Event orientation", summary: "What the night is: live music, a Christian message, worship, and optional prayer for guests who ask. How to explain it plainly.", required: ["*"], ver: "self_attest" },
  { key: "guest_service_fundamentals", title: "Guest service fundamentals", summary: "Welcome, wayfinding, respectful guidance and handing off issues to a lead.", required: ["guest_experience_lead", "host", "vip_host", "registration_lead", "door_team"], ver: "staff_verified" },
  { key: "venue_safety_authority", title: "Venue safety and authority", summary: "Emergency and security decisions stay with the venue. Escalation paths and who to call.", required: ["*"], ver: "staff_verified" },
  { key: "promoter_tracking_accuracy", title: "Promoter tracking and accuracy", summary: "How event links/codes work, honest invitations, no private contact lists.", required: ["promoter", "promoter_manager"], ver: "self_attest" },
];

// ── Campaign ───────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const GOALS = [
  { role_key: "guest_experience_lead", label: "Guest Experience Lead", target: 1, reserve: 0 },
  { role_key: "promoter_manager", label: "Promoter Manager", target: 1, reserve: 0 },
  { role_key: "host", label: "Hosts", target: 6, reserve: 0 },
  { role_key: "promoter", label: "Promoters", target: 6, reserve: 0 },
  { role_key: "reserve", label: "Reserves (Host or Promoter)", target: 0, reserve: 2 },
];
const TASKS: { kind: "asset" | "calendar"; day: number | null; title: string; channel?: string }[] = [
  { kind: "calendar", day: 1, title: "Confirm draft terms are routed to the compensation approver" },
  { kind: "calendar", day: 2, title: "Name the campaign owner and role leads" },
  { kind: "calendar", day: 4, title: "Review the application form and Serve Team page copy" },
  { kind: "calendar", day: 6, title: "Finish the launch asset set (see checklist)" },
  { kind: "calendar", day: 8, title: "Organic launch: Sanctuary-owned social posts (internal draft until approved)", channel: "instagram" },
  { kind: "calendar", day: 10, title: "Referral push to existing community (approved links only)", channel: "referral" },
  { kind: "calendar", day: 15, title: "Schedule screens and assessments for qualified applicants" },
  { kind: "calendar", day: 19, title: "Selection review; offers from approved terms only" },
  { kind: "calendar", day: 22, title: "Assign training modules to accepted crew" },
  { kind: "calendar", day: 28, title: "Roster readiness check against the event template" },
  { kind: "asset", day: null, title: "Host role card (square + story)" },
  { kind: "asset", day: null, title: "Promoter role card (square + story)" },
  { kind: "asset", day: null, title: "Lead roles one-pager" },
  { kind: "asset", day: null, title: "QR flyer for in-person referrals" },
  { kind: "asset", day: null, title: "FAQ update: paid Group roles vs nonprofit Serve Team" },
];
const LINKS = [
  { label: "Instagram bio", role_hint: null, utm_source: "instagram", utm_medium: "organic_social", utm_content: "bio" },
  { label: "Host role card", role_hint: "host" as const, utm_source: "instagram", utm_medium: "organic_social", utm_content: "host_card" },
  { label: "Promoter role card", role_hint: "promoter" as const, utm_source: "instagram", utm_medium: "organic_social", utm_content: "promoter_card" },
  { label: "QR flyer", role_hint: null, utm_source: "flyer", utm_medium: "qr", utm_content: "print_v1" },
];
const BUDGET = [
  { category: "media", label: "Media", proposed_cents: 45000 },
  { category: "creative", label: "Creative", proposed_cents: 15000 },
  { category: "assessment_logistics", label: "Assessment logistics", proposed_cents: 10000 },
  { category: "printed_materials", label: "Printed materials", proposed_cents: 5000 },
];

// ── Report / verify before writing ─────────────────────────────────────────
const totals = slotTotals(ROLES.map((r) => ({ role_key: r.key, group_key: r.group, slot_class: r.cls, workforce: r.wf, planned: r.n })));
const core = totals.byClass.core ?? 0;
console.log(JSON.stringify({ database: target.label, dryRun, totals }, null, 2));
if (totals.sanctuarySlots !== 51 || core !== 30) {
  console.error(`Template math check failed: ${totals.sanctuarySlots} slots / ${core} core (expected 51 / 30).`);
  process.exit(1);
}
{
  const edges: { child: string; parent: string }[] = [];
  for (const l of LINES.filter((x) => x.relation === "operational")) {
    if (createsCycle(edges, l.child, l.parent)) throw new Error(`cycle at ${l.child}→${l.parent}`);
    edges.push(l);
  }
}
const budgetTotal = BUDGET.reduce((s, b) => s + b.proposed_cents, 0);
if (budgetTotal !== 75000) throw new Error("budget proposal must total $750");
if (dryRun) {
  console.log("DRY RUN — no changes written.");
  process.exit(0);
}

await db.transaction(async (tx) => {
  for (const u of UNITS) await tx.insert(opsOrgUnits).values(u).onConflictDoNothing();
  for (const l of LINES)
    await tx
      .insert(opsReportingLines)
      .values({ id: SEED_ID(`line_${l.relation}_${l.child}_${l.parent}`), relation: l.relation, child_key: l.child, parent_key: l.parent, note: l.note ?? null })
      .onConflictDoNothing();

  await tx
    .insert(opsTemplates)
    .values({ id: SEED_ID("tpl_after_dark"), template_key: "after_dark", name: "After Dark", description: "Proposed 250-guest pilot within a 150–300 range. Planning template — not approved staffing." })
    .onConflictDoNothing();
  const [existingV1] = await tx.select({ id: opsTemplateVersions.id }).from(opsTemplateVersions).where(eq(opsTemplateVersions.id, SEED_ID("tpl_after_dark_v1"))).limit(1);
  if (!existingV1) {
    await tx.insert(opsTemplateVersions).values({
      id: SEED_ID("tpl_after_dark_v1"),
      template_id: SEED_ID("tpl_after_dark"),
      version: 1,
      status: "published",
      planning_guests: 250,
      planning_guest_range: "150–300",
      milestones: MILESTONES,
      source_note: "Planning seed from the expanded implementation brief. Milestone times are an EXAMPLE only. 36-role staffing workbook not supplied — not imported.",
      published_at: new Date(),
    });
    let sort = 0;
    for (const r of ROLES)
      await tx.insert(opsTemplateRoles).values({
        id: SEED_ID(`role_v1_${r.key}`),
        template_version_id: SEED_ID("tpl_after_dark_v1"),
        role_key: r.key,
        title: r.title,
        group_key: r.group,
        department_key: r.dept,
        slot_class: r.cls,
        workforce: r.wf,
        provider: r.provider ?? null,
        min_count: null,
        recommended_count: r.n,
        approved_count: null, // nothing is approved by a seed
        confirmation: r.conf ?? "proposed",
        supervisor_role_key: r.sup ?? null,
        responsibilities: r.resp ?? null,
        call_offset_min: null,
        release_offset_min: null,
        dress: null,
        training: r.training ?? ["event_orientation", "venue_safety_authority"],
        qualifications: [],
        zones: r.zones ?? [],
        phase_duties: {},
        sort: sort++,
      });
  }

  await tx
    .insert(opsEvents)
    .values({
      id: SEED_ID("event_after_dark_pilot"),
      name: "After Dark — pilot (planning)",
      template_version_id: SEED_ID("tpl_after_dark_v1"),
      timezone: "America/Los_Angeles",
      local_date: null,
      date_confirmed: false,
      venue_name: null,
      venue_confirmed: false,
      planning_guests: 250,
      is_planning_seed: true,
      created_by: BY,
    })
    .onConflictDoNothing();

  for (const m of MODULES)
    await tx
      .insert(crewTrainingModules)
      .values({ id: SEED_ID(`mod_${m.key}_v1`), module_key: m.key, version: 1, title: m.title, summary: m.summary, required_for: m.required, verification: m.ver })
      .onConflictDoNothing();

  await tx
    .insert(crewOpportunities)
    .values([
      {
        key: "general_interest",
        title: "General interest (v1 legacy applications)",
        operator_entity: "Not specified in v1 wording",
        role_keys: ["host", "promoter", "both", "not_sure"],
        status: "legacy",
        accepts_applications: false,
        description: "Applications collected before the Group / Serve Team separation. Consent predates paid terms.",
      },
      {
        key: DEFAULT_OPPORTUNITY,
        title: "Host, Promoter and lead roles — candidate interest",
        operator_entity: PAID_OPERATOR_ENTITY,
        role_keys: ["host", "promoter", "both", "not_sure", "guest_experience_lead", "promoter_manager"],
        status: "candidate_interest",
        accepts_applications: true,
        description: "Future opportunities. Compensation, duties and terms are provided for each approved opportunity.",
      },
    ])
    .onConflictDoNothing();

  const cid = SEED_ID("cmp_build_the_night");
  await tx
    .insert(cmpCampaigns)
    .values({ id: cid, name: "Build the Night. Welcome the City.", concept: "Recruit the first After Dark crew: hosts, promoters and two leads.", code: "build-the-night", start_date: today, owner_label: null, is_planning_seed: true })
    .onConflictDoNothing();
  for (const g of GOALS)
    await tx.insert(cmpGoals).values({ id: SEED_ID(`goal_${g.role_key}`), campaign_id: cid, ...g, existing_qualified: null, owner_label: null }).onConflictDoNothing();
  const PH = (d: number) => (d <= 7 ? "d1_7" : d <= 14 ? "d8_14" : d <= 21 ? "d15_21" : "d22_30");
  for (const [i, t] of TASKS.entries())
    await tx
      .insert(cmpTasks)
      .values({ id: SEED_ID(`task_${i}`), campaign_id: cid, kind: t.kind, phase: t.day ? PH(t.day) : null, day_offset: t.day, title: t.title, channel: t.channel ?? null, owner_label: null })
      .onConflictDoNothing();
  for (const [i, l] of LINKS.entries()) await tx.insert(cmpLinks).values({ id: SEED_ID(`link_${i}`), campaign_id: cid, ...l }).onConflictDoNothing();
  for (const b of BUDGET) await tx.insert(cmpBudgetLines).values({ id: SEED_ID(`budget_${b.category}`), campaign_id: cid, ...b, approved_cents: null, actual_cents: null }).onConflictDoNothing();
});
await setSetting("planning_seed", { at: new Date().toISOString(), by: BY, workbookImported: false }, null);
console.log(`Seeded planning data on ${target.label}.`);
