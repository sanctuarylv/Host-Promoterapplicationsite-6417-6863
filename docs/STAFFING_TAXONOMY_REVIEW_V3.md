# Sanctuary LV Group — Staffing Taxonomy Review (v3)

Status: **PHASE 3 REVIEW — READ-ONLY. NOTHING IMPORTED. PRODUCTION NOT AUTHORIZED.**

This is the operational review of the 36-role canonical taxonomy that Phase 2 validated
(`STAFFING_TAXONOMY_V2.md`). Every number below is computed by `buildTaxonomyReview()`
(`packages/web/src/api/ops/staffing/review.ts`) from the reviewed source and is served, unchanged, by the
read-only `staffingTaxonomy.preview` procedure and rendered on `/staff/taxonomy`. Nothing here changes a
database, a template, a credential, a training record or the nonprofit Serve Team.

| Baseline | Value |
|---|---|
| Phase 2 commit | `065013bb7c67ec9ae200ca7617204133b9c947cb` |
| Source | `packages/web/data/staffing/sanctuary_lv_group_36_role_canonical_v1.csv` |
| Source sha256 | `36dac8e8c7eb7ac529e25cdb217dc758582e6fecc4556163b81ad0ab35cf8892` — **MATCH** |
| Plan sha256 | `8c22363803999b763305dc8961dcc6b7226271c15c28829ce14aff842cfcd701` — **MATCH** |
| Plan basis | `buildImportPlan(source bytes, kind csv, source_file = canonical path, no target, no existing rows)`; `generated_at` excluded |

The two hashes are pinned in `src/api/ops/staffing/role-map.ts` (`REVIEWED_SOURCE_SHA256`) and
`src/api/ops/staffing/integrity.ts` (`REVIEWED_PLAN_SHA256`). If the source matches but the derived plan does
not, the stage is **Baseline mismatch — re-review required** and every `--apply` is refused (exit 2).

## 1. Final role reconciliation

**36 roles · 66 baseline seats.** The review rows balance against the plan (`plan_roles 36`, `plan_seats 66`,
`balances: true`). Entity `sanctuary_lv_group` and engagement `pending_classification` for every row.
⚑ = supervisor changes from After Dark v1 (6).

| # | Canonical ID | role_key | Display name | Dept | Model | Seats | Match | v1 role (seats) | Reports to | Cred | Training | vNext |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | SLVG-EVT-001 | `event_director` | Event Director / Executive Producer | executive_leadership | required | 1 | rename | `event_director` (1) | founders | mapped | partial | changed 1 |
| 2 | SLVG-EVT-002 | `ops_lead` | Event Operations Manager | event_operations | required | 1 | rename | `ops_lead` (1) | event_director | mapped | partial | changed 1 |
| 3 | SLVG-EVT-003 | `stage_manager` | Stage Manager / Show Caller | production | required | 1 | partial | `stage_manager` (1) | event_director ⚑ | mapped | unresolved | changed 1 |
| 4 | SLVG-EVT-004 | `venue_liaison` | Venue / Site Manager | event_operations | required | 1 | partial | `venue_liaison` (1) | ops_lead | unresolved | mapped | changed 1 |
| 5 | SLVG-EVT-005 | `guest_experience_lead` | Guest Experience Manager | guest_experience | required | 1 | rename | `guest_experience_lead` (1) | ops_lead ⚑ | mapped | partial | changed 1 |
| 6 | SLVG-EVT-006 | `lead_host` | Lead Host | guest_experience | required | 1 | new | — | guest_experience_lead | mapped | partial | new 1 |
| 7 | SLVG-EVT-007 | `host` | Host | guest_experience | scalable | 6 | exact | `host` (6) | lead_host ⚑ | mapped | partial | changed 6 |
| 8 | SLVG-EVT-008 | `registration_lead` | Check-In / Registration Lead | guest_experience | required | 1 | exact | `registration_lead` (1) | guest_experience_lead | mapped | partial | changed 1 |
| 9 | SLVG-EVT-009 | `door_team` | Check-In / Registration Host | guest_experience | scalable | 3 | partial | `door_team` (3) | registration_lead ⚑ | mapped | partial | changed 3 |
| 10 | SLVG-EVT-010 | `seating_floor_lead` | Seating / Floor Lead | guest_experience | required | 1 | new | — | guest_experience_lead | mapped | partial | not_enabled 0 |
| 11 | SLVG-EVT-011 | `seating_floor_host` | Seating / Floor Host | guest_experience | scalable | 4 | new | — | seating_floor_lead | mapped | partial | not_enabled 0 |
| 12 | SLVG-EVT-012 | `vip_host` | VIP / Artist Hospitality Lead | hospitality | event_specific | 1 | partial | `vip_host` (1) | guest_experience_lead | partial | partial | changed 1 |
| 13 | SLVG-EVT-013 | `accessibility_guest_care_host` | Accessibility / Guest Care Host | guest_experience | recommended | 1 | new | — | guest_experience_lead | unresolved | partial | new 1 |
| 14 | SLVG-EVT-014 | `promoter_manager` | Promoter Manager | growth_promotion | required | 1 | exact | `promoter_manager` (1) | event_director | mapped | partial | unchanged 1 |
| 15 | SLVG-EVT-015 | `lead_promoter` | Lead Promoter | growth_promotion | scalable | 2 | new | — | promoter_manager | mapped | partial | new 2 |
| 16 | SLVG-EVT-016 | `promoter` | Promoter | growth_promotion | scalable | 8 | partial | `promoter` (6) | lead_promoter ⚑ | mapped | partial | changed 8 |
| 17 | SLVG-EVT-017 | `community_outreach_street_team_lead` | Community Outreach / Street Team Lead | growth_promotion | event_specific | 1 | new | — | promoter_manager | unresolved | partial | not_enabled 0 |
| 18 | SLVG-EVT-018 | `community_outreach_street_team` | Community Outreach / Street Team | growth_promotion | scalable | 4 | new | — | community_outreach_street_team_lead | unresolved | partial | not_enabled 0 |
| 19 | SLVG-EVT-019 | `production_manager` | Production Manager / Technical Director | production | required | 1 | rename | `production_manager` (1) | event_director | mapped | unresolved | changed 1 |
| 20 | SLVG-EVT-020 | `audio` | Audio Lead / FOH Engineer | production | required | 1 | rename | `audio` (1) | production_manager | mapped | unresolved | changed 1 |
| 21 | SLVG-EVT-021 | `monitor_stage_audio_engineer` | Monitor / Stage Audio Engineer | production | event_specific | 1 | new | — | production_manager | mapped | unresolved | not_enabled 0 |
| 22 | SLVG-EVT-022 | `lighting` | Lighting Director / Operator | production | required | 1 | rename | `lighting` (1) | production_manager | mapped | unresolved | changed 1 |
| 23 | SLVG-EVT-023 | `video_led` | Video / LED / Playback Operator | production | event_specific | 1 | rename | `video_led` (1) | production_manager | mapped | unresolved | changed 1 |
| 24 | SLVG-EVT-024 | `livestream_broadcast_producer` | Livestream / Broadcast Producer | production | event_specific | 1 | new | — | production_manager | mapped | unresolved | not_enabled 0 |
| 25 | SLVG-EVT-025 | `videographer` | Camera Operator | production | scalable | 2 | partial | `videographer` (2) | livestream_broadcast_producer ⚑ | mapped | unresolved | changed 2 |
| 26 | SLVG-EVT-026 | `technical_utility` | Stagehand / Production Technician | production | scalable | 4 | partial | `technical_utility` (1) | production_manager | mapped | unresolved | changed 4 |
| 27 | SLVG-EVT-027 | `talent_artist_relations_manager` | Talent / Artist Relations Manager | talent_backstage | event_specific | 1 | new | — | event_director | mapped | partial | not_enabled 0 |
| 28 | SLVG-EVT-028 | `backstage_green_room_coordinator` | Backstage / Green Room Coordinator | talent_backstage | event_specific | 1 | new | — | talent_artist_relations_manager | mapped | unresolved | not_enabled 0 |
| 29 | SLVG-EVT-029 | `security_manager_venue_security_liaison` | Security Manager / Venue Security Liaison | safety_security | required | 1 | new | — | event_director | unresolved | partial | new 1 |
| 30 | SLVG-EVT-030 | `access_control_credential_lead` | Access Control / Credential Lead | safety_security | required | 1 | new | — | security_manager_venue_security_liaison | unresolved | unresolved | new 1 |
| 31 | SLVG-EVT-031 | `safety_incident_response_coordinator` | Safety / Incident Response Coordinator | safety_security | recommended | 1 | new | — | ops_lead | unresolved | partial | new 1 |
| 32 | SLVG-EVT-032 | `logistics_load_in_lead` | Logistics / Load-In Lead | logistics_facilities | required | 1 | new | — | ops_lead | mapped | unresolved | new 1 |
| 33 | SLVG-EVT-033 | `setup_breakdown_crew` | Setup / Breakdown Crew | logistics_facilities | scalable | 6 | new | — | logistics_load_in_lead | mapped | partial | new 6 |
| 34 | SLVG-EVT-034 | `facilities_housekeeping_lead` | Facilities / Housekeeping Lead | logistics_facilities | required | 1 | new | — | venue_liaison | mapped | partial | new 1 |
| 35 | SLVG-EVT-035 | `event_admin_staff_check_in_coordinator` | Event Admin / Staff Check-In Coordinator | administration | required | 1 | new | — | ops_lead | unresolved | unresolved | new 1 |
| 36 | SLVG-EVT-036 | `cashless_pos_merch_lead` | Cashless POS / Merch Lead | commerce | event_specific | 1 | new | — | ops_lead | mapped | unresolved | not_enabled 0 |

| Headcount model | Roles | Seats |
|---|---|---|
| required | 17 | 17 |
| scalable | 9 | 39 |
| event_specific | 8 | 8 |
| recommended | 2 | 2 |
| **Total** | **36** | **66** |

| Match class | Roles | Seats |
|---|---|---|
| rename | 7 | 7 |
| partial | 7 | 20 |
| new | 19 | 31 |
| exact | 3 | 8 |
| **Total** | **36** | **66** |

| Department | Roles | Seats |
|---|---|---|
| executive_leadership | 1 | 1 |
| event_operations | 2 | 2 |
| production | 9 | 13 |
| guest_experience | 8 | 18 |
| hospitality | 1 | 1 |
| growth_promotion | 5 | 16 |
| talent_backstage | 2 | 2 |
| safety_security | 3 | 3 |
| logistics_facilities | 3 | 8 |
| administration | 1 | 1 |
| commerce | 1 | 1 |
| **Total** | **36** | **66** |

Existing After Dark v1 roles outside the 36 (unchanged by this review): preserved 17 · excluded 1
(`serve_coordinator`, nonprofit) · external 7 (venue/provider) · separate_domain 10 · unresolved 1 (`runner`, §2).

## 2. Runner decision record

| Field | Value |
|---|---|
| Role | `runner` (After Dark v1 "Runner") |
| Classification | **unresolved** |
| Status | **awaiting_human_decision** |
| Decision | **None** (`decision: null`, `decided_by: null`, `decided_at: null`) |
| Decision owner | Sanctuary LV Group event leadership (Event Director / Event Operations Manager) |
| v1 facts | 2 seats · supervisor `ops_lead` · zones `back_of_house` · workforce `unclassified` |
| vNext preview | carried_forward · 2 seats |
| Related canonical role (not a mapping) | Setup / Breakdown Crew (SLVG-EVT-033, `setup_breakdown_crew`), baseline 6, relation `may_absorb_unresolved` |

Question: How should the existing After Dark v1 role `runner` (2 seats) relate to the 36-role canonical taxonomy?

Options on record — fixed reference order, **not a ranking; none preferred or selected**:

1. **Keep `runner` as an existing role outside the canonical taxonomy** (`keep_outside_taxonomy`)
   - Effect: v1 and vNext keep 2 Runner seats as today; the disposition changes from unresolved to a documented class.
   - Requires: Reviewed edit to PLACEHOLDER_DISPOSITIONS; New reviewed plan_hash (baseline re-review)
2. **Map `runner` onto Setup / Breakdown Crew (SLVG-EVT-033)** (`map_to_setup_breakdown_crew`)
   - Effect: SLVG-EVT-033 would continue the Runner seat (match class changes from new); stable role_key and the 2 → 6 seat change must be decided.
   - Requires: Reviewed edit to CANONICAL_ROLE_MAP; Decision on which role_key existing records keep; New reviewed plan_hash; vNext seat totals re-reviewed
3. **Add Runner as its own canonical role in the workbook** (`add_canonical_role`)
   - Effect: The workbook gains a 37th role; the source bytes change.
   - Requires: Workbook revision; New reviewed source sha256 and plan_hash; Full reconciliation re-review
4. **Retire `runner` from future templates only** (`retire_from_future_templates`)
   - Effect: v1 and all historical records keep Runner; a future template version would drop 2 seats (change: removed).
   - Requires: Reviewed vNext rule change; New reviewed plan_hash; Template approval in a separate phase

Preserved until a decision is documented:

- `runner` is not mapped by any canonical role in the reviewed map.
- After Dark v1 Runner seats (2, supervisor ops_lead, zone back_of_house) are unchanged.
- vNext carries Runner forward unchanged (2 → 2); its seats are not added to Setup / Breakdown Crew (baseline 6).
- Existing template roles, assignments and event overrides that reference `runner` are never written by this phase or by the importer.

Phase 3 changes nothing about `runner`: no historical record, template role, assignment or event override that
references it is written, and its seats are not merged into Setup / Breakdown Crew. Any option requires a
reviewed code or workbook change and a new reviewed hash pair, then a fresh review.

## 3. Credential gap report

Counts: mapped 27 · **partial 1 · unresolved 8**. All 9 gaps are listed below (`covers_all_gaps: true`).
`granted: false` on every row — this review grants no access, creates no credential and changes no zone.
Existing zones: `front_of_house`, `back_of_house`, `stage`, `vip`, `all_staff`.

| Canonical ID | role_key | Status | Source credential text | Proposed zones | Unknown / conditional tokens | Current v1 zones | Decision needed |
|---|---|---|---|---|---|---|---|
| SLVG-EVT-004 | `venue_liaison` | unresolved | Operations / Venue | — | `Venue` | all_staff | Add a reviewed zone mapping for "Venue", or confirm it grants no zone. Current After Dark v1 zones for this seat: all_staff (unchanged by this review). |
| SLVG-EVT-012 | `vip_host` | partial | VIP / Hospitality / Backstage as approved | vip | `Backstage as approved` (conditional) | front_of_house, vip | Decide when "Backstage as approved" applies (per event or never) — conditional access is never auto-granted. Current After Dark v1 zones for this seat: front_of_house, vip (unchanged by this review). |
| SLVG-EVT-013 | `accessibility_guest_care_host` | unresolved | Guest Experience / Accessibility | — | — | — (new role) | Choose the access zone(s) for descriptor-only credential "Guest Experience / Accessibility", or confirm it grants none. |
| SLVG-EVT-017 | `community_outreach_street_team_lead` | unresolved | Promoter / Activation | — | — | — (new role) | Choose the access zone(s) for descriptor-only credential "Promoter / Activation", or confirm it grants none. |
| SLVG-EVT-018 | `community_outreach_street_team` | unresolved | Promoter / Activation | — | — | — (new role) | Choose the access zone(s) for descriptor-only credential "Promoter / Activation", or confirm it grants none. |
| SLVG-EVT-029 | `security_manager_venue_security_liaison` | unresolved | Security / All Access as required | — | `All Access as required` (conditional) | — (new role) | Decide when "All Access as required" applies (per event or never) — conditional access is never auto-granted. |
| SLVG-EVT-030 | `access_control_credential_lead` | unresolved | Access Control | — | — | — (new role) | Choose the access zone(s) for descriptor-only credential "Access Control", or confirm it grants none. |
| SLVG-EVT-031 | `safety_incident_response_coordinator` | unresolved | Operations / Safety | — | — | — (new role) | Choose the access zone(s) for descriptor-only credential "Operations / Safety", or confirm it grants none. |
| SLVG-EVT-035 | `event_admin_staff_check_in_coordinator` | unresolved | Staff Check-In / Operations | — | — | — (new role) | Choose the access zone(s) for descriptor-only credential "Staff Check-In / Operations", or confirm it grants none. |

## 4. Training gap report

Counts: mapped 1 · **partial 21 · unresolved 14**. All 35 gaps are listed below (`covers_all_gaps: true`).
`completion_created: false` on every row — this review marks nobody trained and creates no training record.
Only four modules exist: `event_orientation`, `guest_service_fundamentals`, `venue_safety_authority`, `promoter_tracking_accuracy`.

| Canonical ID | role_key | Status | Matched modules | Unresolved phrases |
|---|---|---|---|---|
| SLVG-EVT-001 | `event_director` | partial | event_orientation, venue_safety_authority | Event leadership |
| SLVG-EVT-002 | `ops_lead` | partial | venue_safety_authority | Venue ops; radio protocol |
| SLVG-EVT-003 | `stage_manager` | unresolved | — | Show calling; comms; stage safety; run-of-show |
| SLVG-EVT-005 | `guest_experience_lead` | partial | guest_service_fundamentals, venue_safety_authority | de-escalation; accessibility |
| SLVG-EVT-006 | `lead_host` | partial | guest_service_fundamentals | radio protocol |
| SLVG-EVT-007 | `host` | partial | event_orientation, guest_service_fundamentals, venue_safety_authority | accessibility awareness |
| SLVG-EVT-008 | `registration_lead` | partial | venue_safety_authority | Registration tools; privacy; accessibility |
| SLVG-EVT-009 | `door_team` | partial | guest_service_fundamentals | Registration tools; privacy |
| SLVG-EVT-010 | `seating_floor_lead` | partial | guest_service_fundamentals, venue_safety_authority | Capacity; accessibility |
| SLVG-EVT-011 | `seating_floor_host` | partial | venue_safety_authority | Seating plan; accessibility |
| SLVG-EVT-012 | `vip_host` | partial | guest_service_fundamentals | Confidentiality; access control |
| SLVG-EVT-013 | `accessibility_guest_care_host` | partial | guest_service_fundamentals, venue_safety_authority | Accessibility awareness |
| SLVG-EVT-014 | `promoter_manager` | partial | promoter_tracking_accuracy | Brand standards; compliance; guest conduct |
| SLVG-EVT-015 | `lead_promoter` | partial | promoter_tracking_accuracy, venue_safety_authority | Brand messaging; conduct |
| SLVG-EVT-016 | `promoter` | partial | event_orientation, promoter_tracking_accuracy | Brand standards; conduct |
| SLVG-EVT-017 | `community_outreach_street_team_lead` | partial | venue_safety_authority | Brand conduct; local/site rules |
| SLVG-EVT-018 | `community_outreach_street_team` | partial | venue_safety_authority | Brand messaging; conduct |
| SLVG-EVT-019 | `production_manager` | unresolved | — | Technical safety; power; comms; emergency shutdown |
| SLVG-EVT-020 | `audio` | unresolved | — | Audio system; hearing safety; electrical safety; show cues |
| SLVG-EVT-021 | `monitor_stage_audio_engineer` | unresolved | — | Stage audio; cable safety; artist communication |
| SLVG-EVT-022 | `lighting` | unresolved | — | Lighting console; rigging awareness; electrical safety |
| SLVG-EVT-023 | `video_led` | unresolved | — | Playback systems; signal flow; content handling |
| SLVG-EVT-024 | `livestream_broadcast_producer` | unresolved | — | Broadcast workflow; platform access; privacy/content rules |
| SLVG-EVT-025 | `videographer` | unresolved | — | Camera operation; cable safety; privacy/content rules |
| SLVG-EVT-026 | `technical_utility` | unresolved | — | Manual handling; cable safety; stage safety; PPE as required |
| SLVG-EVT-027 | `talent_artist_relations_manager` | partial | venue_safety_authority | Confidentiality; artist relations; access control |
| SLVG-EVT-028 | `backstage_green_room_coordinator` | unresolved | — | Confidentiality; backstage conduct; access control |
| SLVG-EVT-029 | `security_manager_venue_security_liaison` | partial | venue_safety_authority | incident command; access control; licensing as applicable |
| SLVG-EVT-030 | `access_control_credential_lead` | unresolved | — | Credential policy; privacy; de-escalation; emergency access |
| SLVG-EVT-031 | `safety_incident_response_coordinator` | partial | venue_safety_authority | incident documentation; stop-work/escalation authority |
| SLVG-EVT-032 | `logistics_load_in_lead` | unresolved | — | Manual handling; loading safety; venue routes; radio protocol |
| SLVG-EVT-033 | `setup_breakdown_crew` | partial | venue_safety_authority | Manual handling; safe lifting |
| SLVG-EVT-034 | `facilities_housekeeping_lead` | partial | venue_safety_authority | Chemical/PPE rules as applicable; incident reporting |
| SLVG-EVT-035 | `event_admin_staff_check_in_coordinator` | unresolved | — | Privacy; credential control; staff procedures |
| SLVG-EVT-036 | `cashless_pos_merch_lead` | unresolved | — | POS procedures; inventory control; privacy; financial controls |

Unresolved phrase index (62 phrases) — each needs a module mapping, a new module, or explicit acceptance:

| Unresolved phrase | Roles |
|---|---|
| privacy | `access_control_credential_lead`, `cashless_pos_merch_lead`, `door_team`, `event_admin_staff_check_in_coordinator`, `registration_lead` |
| access control | `backstage_green_room_coordinator`, `security_manager_venue_security_liaison`, `talent_artist_relations_manager`, `vip_host` |
| accessibility | `guest_experience_lead`, `registration_lead`, `seating_floor_host`, `seating_floor_lead` |
| cable safety | `monitor_stage_audio_engineer`, `technical_utility`, `videographer` |
| conduct | `community_outreach_street_team`, `lead_promoter`, `promoter` |
| confidentiality | `backstage_green_room_coordinator`, `talent_artist_relations_manager`, `vip_host` |
| manual handling | `logistics_load_in_lead`, `setup_breakdown_crew`, `technical_utility` |
| radio protocol | `lead_host`, `logistics_load_in_lead`, `ops_lead` |
| accessibility awareness | `accessibility_guest_care_host`, `host` |
| brand messaging | `community_outreach_street_team`, `lead_promoter` |
| brand standards | `promoter`, `promoter_manager` |
| comms | `production_manager`, `stage_manager` |
| de-escalation | `access_control_credential_lead`, `guest_experience_lead` |
| electrical safety | `audio`, `lighting` |
| privacy/content rules | `livestream_broadcast_producer`, `videographer` |
| registration tools | `door_team`, `registration_lead` |
| stage safety | `stage_manager`, `technical_utility` |
| artist communication | `monitor_stage_audio_engineer` |
| artist relations | `talent_artist_relations_manager` |
| audio system | `audio` |
| backstage conduct | `backstage_green_room_coordinator` |
| brand conduct | `community_outreach_street_team_lead` |
| broadcast workflow | `livestream_broadcast_producer` |
| camera operation | `videographer` |
| capacity | `seating_floor_lead` |
| chemical/ppe rules as applicable | `facilities_housekeeping_lead` |
| compliance | `promoter_manager` |
| content handling | `video_led` |
| credential control | `event_admin_staff_check_in_coordinator` |
| credential policy | `access_control_credential_lead` |
| emergency access | `access_control_credential_lead` |
| emergency shutdown | `production_manager` |
| event leadership | `event_director` |
| financial controls | `cashless_pos_merch_lead` |
| guest conduct | `promoter_manager` |
| hearing safety | `audio` |
| incident command | `security_manager_venue_security_liaison` |
| incident documentation | `safety_incident_response_coordinator` |
| incident reporting | `facilities_housekeeping_lead` |
| inventory control | `cashless_pos_merch_lead` |
| licensing as applicable | `security_manager_venue_security_liaison` |
| lighting console | `lighting` |
| loading safety | `logistics_load_in_lead` |
| local/site rules | `community_outreach_street_team_lead` |
| platform access | `livestream_broadcast_producer` |
| playback systems | `video_led` |
| pos procedures | `cashless_pos_merch_lead` |
| power | `production_manager` |
| ppe as required | `technical_utility` |
| rigging awareness | `lighting` |
| run-of-show | `stage_manager` |
| safe lifting | `setup_breakdown_crew` |
| seating plan | `seating_floor_host` |
| show calling | `stage_manager` |
| show cues | `audio` |
| signal flow | `video_led` |
| staff procedures | `event_admin_staff_check_in_coordinator` |
| stage audio | `monitor_stage_audio_engineer` |
| stop-work/escalation authority | `safety_incident_response_coordinator` |
| technical safety | `production_manager` |
| venue ops | `ops_lead` |
| venue routes | `logistics_load_in_lead` |

## 5. Template comparison — After Dark v1 → vNext (preview only)

**51 → 72 seats (Δ +21).** After Dark v1 stays the published,
active template; no template version is created or activated (`no_template_activation` evidence checks the
database for any version > 1).

| Bridge step | Seats | Roles |
|---|---|---|
| After Dark v1 Sanctuary-side seats | 51 | — |
| Count changes on continuing seats (canonical baseline) | +5 | promoter 6→8, technical_utility 1→4 |
| New canonical roles enabled for After Dark | +16 | lead_host +1, accessibility_guest_care_host +1, lead_promoter +2, security_manager_venue_security_liaison +1, access_control_credential_lead +1, safety_incident_response_coordinator +1, logistics_load_in_lead +1, setup_breakdown_crew +6, facilities_housekeeping_lead +1, event_admin_staff_check_in_coordinator +1 |
| Roles outside the taxonomy carried forward unchanged | +0 | runner, serve_coordinator, content_director, photographer, social_creator, music_director, dj, worship_leader, musician_vocalist, prayer_lead, prayer_team, founder |
| Seats removed | +0 | — |
| **vNext total** | **72** | `bridge_balances: true` |

| Workforce | v1 | vNext | Δ |
|---|---|---|---|
| paid_group | 30 | 51 | +21 |
| unclassified | 18 | 18 | +0 |
| nonprofit_serve | 1 | 1 | +0 |
| founder_tbd | 2 | 2 | +0 |
| **Total** | **51** | **72** | **+21** |

Change counts: new 10 · changed 16 · unchanged 1 · carried forward 19 · not enabled 9 · removed 0.

Canonical roles **not enabled** for After Dark vNext (15 seats, not counted):

| role_key | Title | Baseline |
|---|---|---|
| `seating_floor_lead` | Seating / Floor Lead | 1 |
| `seating_floor_host` | Seating / Floor Host | 4 |
| `community_outreach_street_team_lead` | Community Outreach / Street Team Lead | 1 |
| `community_outreach_street_team` | Community Outreach / Street Team | 4 |
| `monitor_stage_audio_engineer` | Monitor / Stage Audio Engineer | 1 |
| `livestream_broadcast_producer` | Livestream / Broadcast Producer | 1 |
| `talent_artist_relations_manager` | Talent / Artist Relations Manager | 1 |
| `backstage_green_room_coordinator` | Backstage / Green Room Coordinator | 1 |
| `cashless_pos_merch_lead` | Cashless POS / Merch Lead | 1 |

Venue / provider allowances (venue authority, **not counted**):

| role_key | Title | Count |
|---|---|---|
| `venue_security_supervisor` | Security Supervisor (venue) | 1 |
| `venue_security_officer` | Security Officers (venue) | 4 |
| `venue_duty_manager` | Duty Manager (venue) | 1 |
| `venue_fnb` | Food & beverage (venue) | as provided |
| `venue_engineering` | Engineering (venue) | as provided |
| `venue_housekeeping` | Housekeeping (venue) | as provided |
| `venue_medical` | Medical coverage (venue/provider) | as provided |

Role-by-role (counted rows):

| Role | Canonical ID | Workforce | v1 | vNext | Δ | Change |
|---|---|---|---|---|---|---|
| Event Director / Executive Producer (`event_director`) | SLVG-EVT-001 | paid_group | 1 | 1 | +0 | changed |
| Event Operations Manager (`ops_lead`) | SLVG-EVT-002 | paid_group | 1 | 1 | +0 | changed |
| Stage Manager / Show Caller (`stage_manager`) | SLVG-EVT-003 | paid_group | 1 | 1 | +0 | changed |
| Venue / Site Manager (`venue_liaison`) | SLVG-EVT-004 | paid_group | 1 | 1 | +0 | changed |
| Guest Experience Manager (`guest_experience_lead`) | SLVG-EVT-005 | paid_group | 1 | 1 | +0 | changed |
| Lead Host (`lead_host`) | SLVG-EVT-006 | paid_group | — | 1 | +1 | new |
| Host (`host`) | SLVG-EVT-007 | paid_group | 6 | 6 | +0 | changed |
| Check-In / Registration Lead (`registration_lead`) | SLVG-EVT-008 | paid_group | 1 | 1 | +0 | changed |
| Check-In / Registration Host (`door_team`) | SLVG-EVT-009 | paid_group | 3 | 3 | +0 | changed |
| Seating / Floor Lead (`seating_floor_lead`) | SLVG-EVT-010 | paid_group | — | 0 | +0 | not_enabled |
| Seating / Floor Host (`seating_floor_host`) | SLVG-EVT-011 | paid_group | — | 0 | +0 | not_enabled |
| VIP / Artist Hospitality Lead (`vip_host`) | SLVG-EVT-012 | paid_group | 1 | 1 | +0 | changed |
| Accessibility / Guest Care Host (`accessibility_guest_care_host`) | SLVG-EVT-013 | paid_group | — | 1 | +1 | new |
| Promoter Manager (`promoter_manager`) | SLVG-EVT-014 | paid_group | 1 | 1 | +0 | unchanged |
| Lead Promoter (`lead_promoter`) | SLVG-EVT-015 | paid_group | — | 2 | +2 | new |
| Promoter (`promoter`) | SLVG-EVT-016 | paid_group | 6 | 8 | +2 | changed |
| Community Outreach / Street Team Lead (`community_outreach_street_team_lead`) | SLVG-EVT-017 | paid_group | — | 0 | +0 | not_enabled |
| Community Outreach / Street Team (`community_outreach_street_team`) | SLVG-EVT-018 | paid_group | — | 0 | +0 | not_enabled |
| Production Manager / Technical Director (`production_manager`) | SLVG-EVT-019 | paid_group | 1 | 1 | +0 | changed |
| Audio Lead / FOH Engineer (`audio`) | SLVG-EVT-020 | paid_group | 1 | 1 | +0 | changed |
| Monitor / Stage Audio Engineer (`monitor_stage_audio_engineer`) | SLVG-EVT-021 | paid_group | — | 0 | +0 | not_enabled |
| Lighting Director / Operator (`lighting`) | SLVG-EVT-022 | paid_group | 1 | 1 | +0 | changed |
| Video / LED / Playback Operator (`video_led`) | SLVG-EVT-023 | paid_group | 1 | 1 | +0 | changed |
| Livestream / Broadcast Producer (`livestream_broadcast_producer`) | SLVG-EVT-024 | paid_group | — | 0 | +0 | not_enabled |
| Camera Operator (`videographer`) | SLVG-EVT-025 | paid_group | 2 | 2 | +0 | changed |
| Stagehand / Production Technician (`technical_utility`) | SLVG-EVT-026 | paid_group | 1 | 4 | +3 | changed |
| Talent / Artist Relations Manager (`talent_artist_relations_manager`) | SLVG-EVT-027 | paid_group | — | 0 | +0 | not_enabled |
| Backstage / Green Room Coordinator (`backstage_green_room_coordinator`) | SLVG-EVT-028 | paid_group | — | 0 | +0 | not_enabled |
| Security Manager / Venue Security Liaison (`security_manager_venue_security_liaison`) | SLVG-EVT-029 | paid_group | — | 1 | +1 | new |
| Access Control / Credential Lead (`access_control_credential_lead`) | SLVG-EVT-030 | paid_group | — | 1 | +1 | new |
| Safety / Incident Response Coordinator (`safety_incident_response_coordinator`) | SLVG-EVT-031 | paid_group | — | 1 | +1 | new |
| Logistics / Load-In Lead (`logistics_load_in_lead`) | SLVG-EVT-032 | paid_group | — | 1 | +1 | new |
| Setup / Breakdown Crew (`setup_breakdown_crew`) | SLVG-EVT-033 | paid_group | — | 6 | +6 | new |
| Facilities / Housekeeping Lead (`facilities_housekeeping_lead`) | SLVG-EVT-034 | paid_group | — | 1 | +1 | new |
| Event Admin / Staff Check-In Coordinator (`event_admin_staff_check_in_coordinator`) | SLVG-EVT-035 | paid_group | — | 1 | +1 | new |
| Cashless POS / Merch Lead (`cashless_pos_merch_lead`) | SLVG-EVT-036 | paid_group | — | 0 | +0 | not_enabled |
| Runner (`runner`) | — | unclassified | 2 | 2 | +0 | carried_forward |
| Serve Team Coordinator (Sanctuary LV nonprofit) (`serve_coordinator`) | — | nonprofit_serve | 1 | 1 | +0 | carried_forward |
| Content Director (`content_director`) | — | unclassified | 1 | 1 | +0 | carried_forward |
| Photographer (`photographer`) | — | unclassified | 1 | 1 | +0 | carried_forward |
| Social Creator (`social_creator`) | — | unclassified | 1 | 1 | +0 | carried_forward |
| Music Director (`music_director`) | — | unclassified | 1 | 1 | +0 | carried_forward |
| DJ (`dj`) | — | unclassified | 1 | 1 | +0 | carried_forward |
| Worship Leader (`worship_leader`) | — | unclassified | 1 | 1 | +0 | carried_forward |
| Musicians / Vocalists (`musician_vocalist`) | — | unclassified | 5 | 5 | +0 | carried_forward |
| Prayer Lead (`prayer_lead`) | — | unclassified | 1 | 1 | +0 | carried_forward |
| Prayer Team (`prayer_team`) | — | unclassified | 4 | 4 | +0 | carried_forward |
| Founders (Erskine and Andrea) (`founder`) | — | founder_tbd | 2 | 2 | +0 | carried_forward |

Notes:

- Preview only: After Dark v1 stays the published, active template. No template version is created or activated.
- Template counts are planning baselines — not assignments, hiring targets or per-event minimums. Event plans keep their own overrides.
- The vNext total includes seats carried forward from v1 that are NOT Group personnel: 1 Sanctuary LV nonprofit Serve Team coordinator seat (serve_coordinator), founder seats and unclassified content / music / ministry seats.
- Venue / provider allowances stay under venue authority and are not counted.

## 6. Nonprofit separation

| Check | Value |
|---|---|
| Canonical entities | `sanctuary_lv_group` only |
| Nonprofit roles in the taxonomy | 0 |
| Excluded nonprofit role | `serve_coordinator` (1 seat, carried forward unchanged in v1 and vNext) |
| Serve Team | Sanctuary LV (nonprofit) Serve Team — volunteer pathway at /serve; unchanged and outside this taxonomy. |

The Sanctuary LV nonprofit Serve Team (`/serve`, its intake, consent and staff page) is not modified in Phase 3.
The browser regression (`tests/browser/taxonomy_review.py`) checks that `/serve` keeps **Sanctuary LV** in its
own identity and names Sanctuary LV Group only as the separate paid operator.

## 7. Readiness evidence vs. human authorization

The approval checklist on `/staff/taxonomy` has three separate lists. They never merge:

- **A. Automated readiness evidence** (12, computed on each request, read-only): source hash, plan hash, plan
  valid, 36/66, runner unresolved, nonprofit separation, write scope, credential coverage, training coverage,
  template bridge, nothing imported, no template activation. All **pass** on the reviewed source.
- **B. Recorded verification evidence** (8): commands run offline (typecheck, lint, unit, integration,
  browser, migration rehearsal, recovery rehearsal, build). Results are in `PRODUCTION_APPROVAL_PACKAGE_V3.md` §5–§7.
- **C. Human authorizations** (10): typed `status: "pending"` with `authorized_by: null`. The type has no other
  value, so no code path — and no amount of passing evidence — can mark one authorized.
  `production_authorized` is the literal `false`. Sign-off is recorded outside the application
  (`PRODUCTION_APPROVAL_PACKAGE_V3.md` §9).

The six panels (`#approval-checklist`, `#role-review`, `#runner-decision`, `#credential-review`,
`#training-review`, `#template-comparison`) contain no buttons, inputs, selects or forms; the page calls only
the read procedures `staffingTaxonomy.preview` and `me.session`.
