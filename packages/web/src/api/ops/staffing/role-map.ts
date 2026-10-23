/**
 * Reviewed, deterministic reconciliation map: canonical Sanctuary LV Group
 * 36-role taxonomy (SLVG-EVT-001..036)  ⇄  After Dark v1 planning-seed roles.
 *
 * This file IS the identity decision. The importer never fuzzy-matches: a
 * canonical row resolves only through an explicit entry here, and an id with
 * no entry is a validation error. Display names may change; `role_key` is the
 * stable internal key that existing records (template roles, assignments,
 * overrides, campaign goals, public apply options) already reference, so
 * mapped roles keep their legacy key.
 *
 * Match classes (canonical side): exact | rename | partial | new.
 * Disposition classes (placeholder side, roles the paid Group workbook does not
 * cover): excluded | external | separate_domain | unresolved. None of them is
 * deleted, converted or imported by this phase.
 *
 * Every entry is a staff-reviewable proposal (docs/STAFFING_TAXONOMY_V2.md §4).
 */

/**
 * sha256 of the canonical workbook export this map was reviewed against
 * (data/staffing/sanctuary_lv_group_36_role_canonical_v1.csv). A different,
 * valid source is "reconciliation ready" — not "pending approval" — until this
 * map is re-reviewed against it and this hash is updated.
 */
export const REVIEWED_SOURCE_SHA256 = "36dac8e8c7eb7ac529e25cdb217dc758582e6fecc4556163b81ad0ab35cf8892";

export type MatchClass = "exact" | "rename" | "partial" | "new";
export type DispositionClass = "excluded" | "external" | "separate_domain" | "unresolved";
export type MappingClass = MatchClass | DispositionClass;

export type CanonicalMapEntry = {
  /** Internal key. Equals `legacy_key` when the role already exists. */
  role_key: string;
  match: MatchClass;
  /** Existing After Dark v1 role this canonical role continues (exact/rename/partial only). */
  legacy_key: string | null;
  note: string;
  /** Optional relationship to an existing role that is NOT an identity mapping. */
  related?: { key: string; relation: string };
};

export const CANONICAL_ROLE_MAP: Record<string, CanonicalMapEntry> = {
  "SLVG-EVT-001": { role_key: "event_director", match: "rename", legacy_key: "event_director", note: "Same seat; title adds 'Executive Producer'." },
  "SLVG-EVT-002": { role_key: "ops_lead", match: "rename", legacy_key: "ops_lead", note: "Same seat; 'Operations Lead' → 'Event Operations Manager'." },
  "SLVG-EVT-003": { role_key: "stage_manager", match: "partial", legacy_key: "stage_manager", note: "Adds show-calling; now reports to the Event Director instead of the Production Manager." },
  "SLVG-EVT-004": { role_key: "venue_liaison", match: "partial", legacy_key: "venue_liaison", note: "Liaison → Venue / Site Manager scope (access, utilities, handback). Venue staff stay under venue authority." },
  "SLVG-EVT-005": { role_key: "guest_experience_lead", match: "rename", legacy_key: "guest_experience_lead", note: "Lead → Manager. Legacy key kept (public apply option, campaign goal). Now reports to the Event Operations Manager." },
  "SLVG-EVT-006": { role_key: "lead_host", match: "new", legacy_key: null, note: "New tier between Guest Experience Manager and Hosts." },
  "SLVG-EVT-007": { role_key: "host", match: "exact", legacy_key: "host", note: "6 → 6. Supervisor becomes Lead Host. Public apply option 'host'." },
  "SLVG-EVT-008": { role_key: "registration_lead", match: "exact", legacy_key: "registration_lead", note: "Title adds 'Check-In'." },
  "SLVG-EVT-009": { role_key: "door_team", match: "partial", legacy_key: "door_team", note: "Door Team (welcome + ticket check) ≈ registration hosts. 3 → 3. Supervisor becomes Registration Lead." },
  "SLVG-EVT-010": { role_key: "seating_floor_lead", match: "new", legacy_key: null, note: "Seated / capacity events." },
  "SLVG-EVT-011": { role_key: "seating_floor_host", match: "new", legacy_key: null, note: "Seated / capacity events." },
  "SLVG-EVT-012": { role_key: "vip_host", match: "partial", legacy_key: "vip_host", note: "VIP Host → VIP + artist hospitality lead in a new Hospitality department." },
  "SLVG-EVT-013": { role_key: "accessibility_guest_care_host", match: "new", legacy_key: null, note: "Accessibility / guest care. Not the ministry care roles." },
  "SLVG-EVT-014": { role_key: "promoter_manager", match: "exact", legacy_key: "promoter_manager", note: "Reports to the Event Director in both. Public apply option 'promoter_manager'." },
  "SLVG-EVT-015": { role_key: "lead_promoter", match: "new", legacy_key: null, note: "New tier between Promoter Manager and Promoters." },
  "SLVG-EVT-016": { role_key: "promoter", match: "partial", legacy_key: "promoter", note: "Baseline 6 → 8 (planning baseline, overridable per event); supervisor becomes Lead Promoter. Public apply option 'promoter'." },
  "SLVG-EVT-017": { role_key: "community_outreach_street_team_lead", match: "new", legacy_key: null, note: "Activation / outreach events." },
  "SLVG-EVT-018": { role_key: "community_outreach_street_team", match: "new", legacy_key: null, note: "Activation / outreach events." },
  "SLVG-EVT-019": { role_key: "production_manager", match: "rename", legacy_key: "production_manager", note: "Adds 'Technical Director'." },
  "SLVG-EVT-020": { role_key: "audio", match: "rename", legacy_key: "audio", note: "Generic 'Audio' → Audio Lead / FOH Engineer." },
  "SLVG-EVT-021": { role_key: "monitor_stage_audio_engineer", match: "new", legacy_key: null, note: "Monitor audio split out of 'Audio'.", related: { key: "audio", relation: "split_from" } },
  "SLVG-EVT-022": { role_key: "lighting", match: "rename", legacy_key: "lighting", note: "'Lighting' → Lighting Director / Operator." },
  "SLVG-EVT-023": { role_key: "video_led", match: "rename", legacy_key: "video_led", note: "Adds playback." },
  "SLVG-EVT-024": { role_key: "livestream_broadcast_producer", match: "new", legacy_key: null, note: "Broadcast events. No placeholder equivalent." },
  "SLVG-EVT-025": { role_key: "videographer", match: "partial", legacy_key: "videographer", note: "2 → 2, but moves Content → Production and reports to the Broadcast Producer instead of the Content Director." },
  "SLVG-EVT-026": { role_key: "technical_utility", match: "partial", legacy_key: "technical_utility", note: "Technical Utility → Stagehand / Production Technician; baseline 1 → 4." },
  "SLVG-EVT-027": { role_key: "talent_artist_relations_manager", match: "new", legacy_key: null, note: "Talent relations. Not the Music Director (musical leadership stays in the Music domain).", related: { key: "music_director", relation: "distinct_from" } },
  "SLVG-EVT-028": { role_key: "backstage_green_room_coordinator", match: "new", legacy_key: null, note: "Green room / backstage coordination." },
  "SLVG-EVT-029": { role_key: "security_manager_venue_security_liaison", match: "new", legacy_key: null, note: "Sanctuary-paid liaison TO venue security. Venue security seats stay venue/provider.", related: { key: "venue_security_supervisor", relation: "coordinates_with_external" } },
  "SLVG-EVT-030": { role_key: "access_control_credential_lead", match: "new", legacy_key: null, note: "Credential policy and access control." },
  "SLVG-EVT-031": { role_key: "safety_incident_response_coordinator", match: "new", legacy_key: null, note: "Coordinator only; medical coverage stays with the venue/provider.", related: { key: "venue_medical", relation: "coordinates_with_external" } },
  "SLVG-EVT-032": { role_key: "logistics_load_in_lead", match: "new", legacy_key: null, note: "Load-in logistics." },
  "SLVG-EVT-033": { role_key: "setup_breakdown_crew", match: "new", legacy_key: null, note: "Load-in / strike crew. 'Runner' is NOT mapped here (unresolved — staff decision).", related: { key: "runner", relation: "may_absorb_unresolved" } },
  "SLVG-EVT-034": { role_key: "facilities_housekeeping_lead", match: "new", legacy_key: null, note: "Sanctuary lead coordinating venue housekeeping (which stays venue/provider).", related: { key: "venue_housekeeping", relation: "coordinates_with_external" } },
  "SLVG-EVT-035": { role_key: "event_admin_staff_check_in_coordinator", match: "new", legacy_key: null, note: "Staff check-in and event admin." },
  "SLVG-EVT-036": { role_key: "cashless_pos_merch_lead", match: "new", legacy_key: null, note: "Commerce events." },
};

export type Disposition = { class: DispositionClass; domain: string; reason: string };

/**
 * After Dark v1 roles that the paid Group workbook does not cover. They stay
 * exactly as they are in v1 (and are carried forward in the vNext preview);
 * nothing here is deleted, remapped or converted into Group personnel.
 */
export const PLACEHOLDER_DISPOSITIONS: Record<string, Disposition> = {
  runner: { class: "unresolved", domain: "event_operations", reason: "Existing general back-of-house role with no approved canonical mapping. Setup / Breakdown Crew (SLVG-EVT-033) may absorb it — staff decision; not remapped." },
  serve_coordinator: { class: "excluded", domain: "sanctuary_lv_nonprofit", reason: "Sanctuary LV nonprofit Serve Team (volunteer). Never imported into the paid Group taxonomy." },
  content_director: { class: "separate_domain", domain: "content", reason: "Content domain — outside the paid event-staffing import unless separately approved." },
  photographer: { class: "separate_domain", domain: "content", reason: "Content domain — outside the paid event-staffing import unless separately approved." },
  social_creator: { class: "separate_domain", domain: "content", reason: "Content domain — outside the paid event-staffing import unless separately approved." },
  music_director: { class: "separate_domain", domain: "music_worship", reason: "Music / Worship domain — outside the paid event-staffing import unless separately approved." },
  dj: { class: "separate_domain", domain: "music_worship", reason: "Music / Worship domain — outside the paid event-staffing import unless separately approved." },
  worship_leader: { class: "separate_domain", domain: "music_worship", reason: "Music / Worship domain — outside the paid event-staffing import unless separately approved." },
  musician_vocalist: { class: "separate_domain", domain: "music_worship", reason: "Music / Worship domain — outside the paid event-staffing import unless separately approved." },
  prayer_lead: { class: "separate_domain", domain: "ministry_prayer", reason: "Ministry / Prayer domain — outside the paid event-staffing import unless separately approved." },
  prayer_team: { class: "separate_domain", domain: "ministry_prayer", reason: "Ministry / Prayer domain — outside the paid event-staffing import unless separately approved." },
  founder: { class: "separate_domain", domain: "founders", reason: "Founders (Erskine / Andrea). The workbook's 'Erskine / Andrea' supervisor resolves to the existing `founders` org unit — no person record is created." },
  venue_security_supervisor: { class: "external", domain: "venue_provider", reason: "Venue-provided. Stays under venue/provider authority — not Group personnel." },
  venue_security_officer: { class: "external", domain: "venue_provider", reason: "Venue-provided. Stays under venue/provider authority — not Group personnel." },
  venue_duty_manager: { class: "external", domain: "venue_provider", reason: "Venue-provided. Stays under venue/provider authority — not Group personnel." },
  venue_fnb: { class: "external", domain: "venue_provider", reason: "Venue-provided. Stays under venue/provider authority — not Group personnel." },
  venue_engineering: { class: "external", domain: "venue_provider", reason: "Venue-provided. Stays under venue/provider authority — not Group personnel." },
  venue_housekeeping: { class: "external", domain: "venue_provider", reason: "Venue-provided. Stays under venue/provider authority — not Group personnel." },
  venue_medical: { class: "external", domain: "venue_provider", reason: "Venue/provider medical coverage. Stays under venue/provider authority — not Group personnel." },
};

/** Workbook `reports_to` values that refer to an org unit rather than a role. */
export const SUPERVISOR_ORG_ALIASES: Record<string, string> = {
  "Erskine / Andrea": "founders",
};

/** Workbook department names → internal department keys (explicit; unknown names are errors). */
export const DEPARTMENT_KEYS: Record<string, string> = {
  "Executive Leadership": "executive_leadership",
  "Event Operations": "event_operations",
  Production: "production",
  "Guest Experience": "guest_experience",
  Hospitality: "hospitality",
  "Growth & Promotion": "growth_promotion",
  "Talent & Backstage": "talent_backstage",
  "Safety & Security": "safety_security",
  "Logistics & Facilities": "logistics_facilities",
  Administration: "administration",
  Commerce: "commerce",
};

/**
 * Public apply roles stay curated (crew/contract.ts ROLE_OPTIONS). The taxonomy
 * never adds options. This is the PREPARED display rename for the one public
 * option whose canonical title changed — not applied in this phase.
 */
export const PUBLIC_ROLE_RENAMES = [
  { role_key: "guest_experience_lead", current_label: "Guest Experience Lead", canonical_label: "Guest Experience Manager", canonical_role_id: "SLVG-EVT-005", status: "prepared_not_applied" as const },
];
