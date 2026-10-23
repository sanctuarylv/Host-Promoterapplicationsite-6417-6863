/**
 * After Dark staffing template v1 — the PLANNING SEED role set (51 Sanctuary-side
 * slots = 30 core + 8 talent + 5 care + 6 promoters + 2 founders, plus venue
 * allowances) and the four seeded training modules.
 *
 * Moved verbatim out of scripts/seed-planning.ts so the seed, the canonical
 * taxonomy importer and the staff preview all compare against ONE definition.
 * Pure data — no I/O. Changing it changes what the seed writes; the template
 * version it seeds (v1) is published and never edited in place.
 */
export type PlanningRole = {
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
export const GX_TRAINING = ["guest_service_fundamentals", "event_orientation", "venue_safety_authority"];
export const AFTER_DARK_V1_ROLES: PlanningRole[] = [
  // Operations — 6
  { key: "event_director", title: "Event Director", group: "operations", dept: "operations", cls: "core", wf: "unclassified", n: 1, sup: "founders", zones: ["all_staff"] },
  { key: "ops_lead", title: "Operations Lead", group: "operations", dept: "operations", cls: "core", wf: "unclassified", n: 1, sup: "event_director", zones: ["all_staff"] },
  { key: "venue_liaison", title: "Venue Liaison", group: "operations", dept: "operations", cls: "core", wf: "unclassified", n: 1, sup: "ops_lead", zones: ["all_staff"] },
  { key: "runner", title: "Runner", group: "operations", dept: "operations", cls: "core", wf: "unclassified", n: 2, sup: "ops_lead", zones: ["back_of_house"] },
  { key: "serve_coordinator", title: "Serve Team Coordinator (Sanctuary LV nonprofit)", group: "operations", dept: "operations", cls: "core", wf: "nonprofit_serve", n: 1, sup: "ops_lead", zones: ["front_of_house"], resp: "Coordinates unpaid Serve Team volunteers. Separate from paid Group roles." },
  // Guest Experience — 12
  { key: "guest_experience_lead", title: "Guest Experience Lead", group: "guest_experience", dept: "guest_experience", cls: "core", wf: "paid_group", n: 1, sup: "event_director", zones: ["front_of_house"], training: GX_TRAINING },
  { key: "host", title: "Host", group: "guest_experience", dept: "guest_experience", cls: "core", wf: "paid_group", n: 6, sup: "guest_experience_lead", zones: ["front_of_house"], training: GX_TRAINING },
  { key: "vip_host", title: "VIP Host", group: "guest_experience", dept: "guest_experience", cls: "core", wf: "paid_group", n: 1, sup: "guest_experience_lead", zones: ["front_of_house", "vip"], training: GX_TRAINING },
  { key: "registration_lead", title: "Registration Lead", group: "guest_experience", dept: "guest_experience", cls: "core", wf: "paid_group", n: 1, sup: "guest_experience_lead", zones: ["front_of_house"], training: GX_TRAINING },
  { key: "door_team", title: "Door Team", group: "guest_experience", dept: "guest_experience", cls: "core", wf: "paid_group", n: 3, sup: "guest_experience_lead", zones: ["front_of_house"], training: GX_TRAINING, resp: "Welcome and ticket/registration check. Security authority stays with the venue." },
  // Promotion operations — 1
  { key: "promoter_manager", title: "Promoter Manager", group: "promotion_ops", dept: "promotion", cls: "core", wf: "paid_group", n: 1, sup: "event_director", training: ["promoter_tracking_accuracy", "event_orientation"] },
  // Production — 6
  ...(["production_manager:Production Manager", "stage_manager:Stage Manager", "audio:Audio", "lighting:Lighting", "video_led:Video / LED", "technical_utility:Technical Utility"] as const).map(
    (s, i): PlanningRole => {
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

export const PLANNING_TRAINING_MODULES: { key: string; title: string; summary: string; required: string[]; ver: string }[] = [
  { key: "event_orientation", title: "Event orientation", summary: "What the night is: live music, a Christian message, worship, and optional prayer for guests who ask. How to explain it plainly.", required: ["*"], ver: "self_attest" },
  { key: "guest_service_fundamentals", title: "Guest service fundamentals", summary: "Welcome, wayfinding, respectful guidance and handing off issues to a lead.", required: ["guest_experience_lead", "host", "vip_host", "registration_lead", "door_team"], ver: "staff_verified" },
  { key: "venue_safety_authority", title: "Venue safety and authority", summary: "Emergency and security decisions stay with the venue. Escalation paths and who to call.", required: ["*"], ver: "staff_verified" },
  { key: "promoter_tracking_accuracy", title: "Promoter tracking and accuracy", summary: "How event links/codes work, honest invitations, no private contact lists.", required: ["promoter", "promoter_manager"], ver: "self_attest" },
];
