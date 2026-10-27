# Sanctuary LV Group — Credential and Training Resolution Matrix V4 (Phase 4)

**Status: PROPOSED ONLY. No credential, zone or permission is granted. No training module is created and no
training completion is recorded. Production: NO-GO.**

Source: `packages/web/src/api/ops/staffing/resolution.ts` (`buildResolutionMatrix`). It is **not** imported by
`plan.ts` (asserted by `tests/phase4.test.ts`), so the plan hash is unchanged. Rendered read-only on
`/staff/taxonomy#resolution-matrix`. Every row carries `status: "proposed"`, `decision: null` and either
`granted: false` (credentials) or `completion_created: false` (training); the matrix carries
`granted_any: false` and `completions_created: 0`. Decisions on these proposals are `D-CRED-*`, `D-ZONE-*`
and `D-TRN-*` in `docs/OPERATIONAL_DECISION_REGISTER_V4.md`.

## §1 Summary

| Item | Count |
|---|---|
| Credential gaps (1 partial · 8 unresolved) | 9 |
| … proposed with zones / proposed no zone | 7 / 2 |
| … conditional tokens never auto-granted (`Backstage as approved`, `All Access as required`) | 2 |
| … proposals that narrow a v1 grant (`venue_liaison`: v1 `all_staff`) | 1 |
| … roles with no v1 seat that would gain access | 5 |
| No credential proposal uses `all_staff` | asserted |
| Zone deltas vs After Dark v1 on roles present in v1 (non-`same`) | 8 of 17 |
| Security flags | 11 |
| Training gaps (21 partial · 14 unresolved) | 35 |
| Unmapped training phrases | 62 → 3 existing module, 56 proposed new module, 3 external / conditional |
| Existing modules | 4 (`event_orientation`, `guest_service_fundamentals`, `venue_safety_authority`, `promoter_tracking_accuracy`) |
| Globally required modules (`required: ["*"]`) | `event_orientation`, `venue_safety_authority` |
| Proposed new modules (none exist) | 17 |
| Roles that would lose a v1 module if the plan were adopted as-is | 1 (`registration_lead` loses `guest_service_fundamentals`) |

Zone vocabulary: `front_of_house`, `back_of_house`, `stage`, `vip`, `all_staff`. In delta calculations
`all_staff` covers every zone.

## §2 Credential proposals (9 gaps)

| Canonical ID | Role | Gap | Source text | v1 zones | Plan zones | Proposed zones | Alternatives | Never automatic | vs v1 | Confidence | Granted |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SLVG-EVT-004 | `venue_liaison` | unresolved | Operations / Venue | `all_staff` | none | `front_of_house`, `back_of_house` | [front_of_house, back_of_house, stage] / [no zone] | — | narrows | low | No |
| SLVG-EVT-012 | `vip_host` | partial | VIP / Hospitality / Backstage as approved | `front_of_house`, `vip` | `vip` | `front_of_house`, `vip` | [vip] | Backstage as approved | same | medium | No |
| SLVG-EVT-013 | `accessibility_guest_care_host` | unresolved | Guest Experience / Accessibility | not in v1 | none | `front_of_house` | [front_of_house, vip] | — | — | medium | No |
| SLVG-EVT-017 | `community_outreach_street_team_lead` | unresolved | Promoter / Activation | not in v1 | none | none | [front_of_house] | — | — | medium | No |
| SLVG-EVT-018 | `community_outreach_street_team` | unresolved | Promoter / Activation | not in v1 | none | none | [front_of_house] | — | — | medium | No |
| SLVG-EVT-029 | `security_manager_venue_security_liaison` | unresolved | Security / All Access as required | not in v1 | none | `front_of_house`, `back_of_house` | [front_of_house, back_of_house, stage] | All Access as required | — | low | No |
| SLVG-EVT-030 | `access_control_credential_lead` | unresolved | Access Control | not in v1 | none | `front_of_house`, `back_of_house` | [front_of_house] | — | — | low | No |
| SLVG-EVT-031 | `safety_incident_response_coordinator` | unresolved | Operations / Safety | not in v1 | none | `front_of_house`, `back_of_house` | [front_of_house, back_of_house, stage] | — | — | low | No |
| SLVG-EVT-035 | `event_admin_staff_check_in_coordinator` | unresolved | Staff Check-In / Operations | not in v1 | none | `back_of_house` | [front_of_house, back_of_house] | — | — | low | No |

Rationale and open questions:

- **`venue_liaison`**: "Operations / Venue": works between the venue and Group operations across public and service areas. "Venue" has no reviewed zone token; proposed as FOH + BOH without stage. Open questions: v1 grants all_staff today. Keep all_staff for this seat (requires a reviewed ZONE_TOKENS entry or per-event grant), or accept the narrower proposal?
- **`vip_host`**: "VIP / Hospitality / Backstage as approved": VIP is mapped; Hospitality is a descriptor. FOH is proposed to match the v1 seat (guests arrive through FOH). "Backstage as approved" stays a per-event decision. Open questions: Who may approve backstage access for a VIP Host on a given event, and is it recorded on the event plan?
- **`accessibility_guest_care_host`**: "Guest Experience / Accessibility": both descriptors; every v1 Guest Experience seat is front_of_house. Open questions: Does accessibility support require escorting guests into VIP or seated areas that need a separate zone?
- **`community_outreach_street_team_lead`**: "Promoter / Activation": off-site / pre-event outreach. v1 Promoter and Promoter Manager seats carry no zone. Proposed: grants no zone. Open questions: Is there any onsite activation footprint that needs FOH access? (Role is not enabled for After Dark vNext.)
- **`community_outreach_street_team`**: "Promoter / Activation": as the Street Team Lead — off-site outreach; no zone proposed. Open questions: Same as the Street Team Lead. (Role is not enabled for After Dark vNext.)
- **`security_manager_venue_security_liaison`**: "Security / All Access as required": Security is a descriptor; "All Access as required" is conditional and is NOT proposed. FOH + BOH covers liaison with venue security at doors and service corridors. Security authority stays with the venue. Open questions: Who authorises all_staff for this role per event, and under which conditions? Is the role Group-employed or provided by the venue / a licensed contractor? (engagement classification pending)
- **`access_control_credential_lead`**: "Access Control": descriptor only. Credential issue / check points sit at guest entry (FOH) and the staff entrance (BOH). Open questions: Where are credential and staff check points located at the After Dark venue?
- **`safety_incident_response_coordinator`**: "Operations / Safety": descriptors only. Responding to incidents requires reaching public and service areas; stage is excluded pending a decision. Open questions: Should incident response include the stage, or does the Stage Manager / venue own stage incidents?
- **`event_admin_staff_check_in_coordinator`**: "Staff Check-In / Operations": descriptors only. Staff check-in is assumed to sit at the staff / service entrance (BOH). Open questions: Confirm the staff check-in location; if it is at the guest entrance the proposal should be FOH.

## §3 Zone reconciliation vs After Dark v1 (security review)

Every canonical role that has a v1 seat, comparing v1 template zones with the reviewed plan's mapped zones.
**Nothing changes today**: the import writes only `ops_canonical_roles`; v1 template roles, event
assignments and issued credentials keep their zones.

| Role | Canonical ID | v1 zones | Plan zones | Delta | Added | Removed |
|---|---|---|---|---|---|---|
| `event_director` | SLVG-EVT-001 | `all_staff` | `all_staff` | same | — | — |
| `ops_lead` | SLVG-EVT-002 | `all_staff` | `all_staff` | same | — | — |
| `stage_manager` | SLVG-EVT-003 | `back_of_house`, `stage` | `back_of_house`, `stage`, `all_staff` | **expands** | `all_staff` | — |
| `venue_liaison` | SLVG-EVT-004 | `all_staff` | none | **narrows** | — | `all_staff` |
| `guest_experience_lead` | SLVG-EVT-005 | `front_of_house` | `front_of_house` | same | — | — |
| `host` | SLVG-EVT-007 | `front_of_house` | `front_of_house` | same | — | — |
| `registration_lead` | SLVG-EVT-008 | `front_of_house` | `front_of_house` | same | — | — |
| `door_team` | SLVG-EVT-009 | `front_of_house` | `front_of_house` | same | — | — |
| `vip_host` | SLVG-EVT-012 | `front_of_house`, `vip` | `vip` | **narrows** | — | `front_of_house` |
| `promoter_manager` | SLVG-EVT-014 | none | `front_of_house` | **expands** | `front_of_house` | — |
| `promoter` | SLVG-EVT-016 | none | `front_of_house` | **expands** | `front_of_house` | — |
| `production_manager` | SLVG-EVT-019 | `back_of_house`, `stage` | `back_of_house`, `stage`, `all_staff` | **expands** | `all_staff` | — |
| `audio` | SLVG-EVT-020 | `back_of_house`, `stage` | `front_of_house`, `back_of_house`, `stage` | **expands** | `front_of_house` | — |
| `lighting` | SLVG-EVT-022 | `back_of_house`, `stage` | `back_of_house`, `stage` | same | — | — |
| `video_led` | SLVG-EVT-023 | `back_of_house`, `stage` | `back_of_house`, `stage` | same | — | — |
| `videographer` | SLVG-EVT-025 | none | `back_of_house`, `stage` | **expands** | `back_of_house`, `stage` | — |
| `technical_utility` | SLVG-EVT-026 | `back_of_house`, `stage` | `back_of_house`, `stage` | same | — | — |

Security flags (all require a human decision; none is applied):

1. stage_manager: reviewed plan would ADD all_staff vs v1 (back_of_house, stage).
2. venue_liaison: reviewed plan would DROP all_staff vs v1 (plan: none).
3. vip_host: reviewed plan would DROP front_of_house vs v1 (plan: vip).
4. promoter_manager: reviewed plan would ADD front_of_house vs v1 (none).
5. promoter: reviewed plan would ADD front_of_house vs v1 (none).
6. production_manager: reviewed plan would ADD all_staff vs v1 (back_of_house, stage).
7. audio: reviewed plan would ADD front_of_house vs v1 (back_of_house, stage).
8. videographer: reviewed plan would ADD back_of_house, stage vs v1 (none).
9. venue_liaison: proposal narrows v1 all_staff to front_of_house, back_of_house — accept the narrowing or keep all_staff by explicit decision.
10. vip_host: conditional "Backstage as approved" is never auto-granted — per-event human decision.
11. security_manager_venue_security_liaison: conditional "All Access as required" is never auto-granted — per-event human decision.

Points for the security reviewer:
- `stage_manager` and `production_manager` would **gain `all_staff`** (D-ZONE-001, D-ZONE-004). This is the
  widest grant in the vocabulary.
- `venue_liaison` is the only proposal that **narrows** a v1 grant (`all_staff` → FOH + BOH, D-CRED-001).
  Keeping `all_staff` is a valid option but needs an explicit decision.
- `vip_host` loses `front_of_house` under the raw plan; the proposal restores it (D-CRED-002).
- Conditional access (`Backstage as approved`, `All Access as required`) is never encoded as a template zone.
  It stays a per-event human grant.

## §4 Training proposals (35 gaps)

| Canonical ID | Role | Gap | Plan modules | Proposed existing | Proposed new (not created) | External / conditional | v1 module dropped | Completion created |
|---|---|---|---|---|---|---|---|---|
| SLVG-EVT-001 | `event_director` | partial | `event_orientation`, `venue_safety_authority` | — | `event_leadership` | — | — | No |
| SLVG-EVT-002 | `ops_lead` | partial | `venue_safety_authority` | — | `radio_comms_protocol`, `venue_operations` | — | — | No |
| SLVG-EVT-003 | `stage_manager` | unresolved | — | — | `radio_comms_protocol`, `show_operations`, `technical_safety` | — | — | No |
| SLVG-EVT-005 | `guest_experience_lead` | partial | `guest_service_fundamentals`, `venue_safety_authority` | — | `accessibility_awareness`, `de_escalation` | — | — | No |
| SLVG-EVT-006 | `lead_host` | partial | `guest_service_fundamentals` | — | `radio_comms_protocol` | — | — | No |
| SLVG-EVT-007 | `host` | partial | `event_orientation`, `guest_service_fundamentals`, `venue_safety_authority` | — | `accessibility_awareness` | — | — | No |
| SLVG-EVT-008 | `registration_lead` | partial | `venue_safety_authority` | — | `accessibility_awareness`, `privacy_data_handling`, `registration_checkin_tools` | — | `guest_service_fundamentals` | No |
| SLVG-EVT-009 | `door_team` | partial | `guest_service_fundamentals` | — | `privacy_data_handling`, `registration_checkin_tools` | — | — | No |
| SLVG-EVT-010 | `seating_floor_lead` | partial | `guest_service_fundamentals`, `venue_safety_authority` | — | `accessibility_awareness`, `seating_capacity_management` | — | — | No |
| SLVG-EVT-011 | `seating_floor_host` | partial | `venue_safety_authority` | — | `accessibility_awareness`, `seating_capacity_management` | — | — | No |
| SLVG-EVT-012 | `vip_host` | partial | `guest_service_fundamentals` | — | `access_control_procedures`, `confidentiality_artist_relations` | — | — | No |
| SLVG-EVT-013 | `accessibility_guest_care_host` | partial | `guest_service_fundamentals`, `venue_safety_authority` | — | `accessibility_awareness` | — | — | No |
| SLVG-EVT-014 | `promoter_manager` | partial | `promoter_tracking_accuracy` | — | `brand_conduct_standards` | — | — | No |
| SLVG-EVT-015 | `lead_promoter` | partial | `promoter_tracking_accuracy`, `venue_safety_authority` | — | `brand_conduct_standards` | — | — | No |
| SLVG-EVT-016 | `promoter` | partial | `event_orientation`, `promoter_tracking_accuracy` | — | `brand_conduct_standards` | — | — | No |
| SLVG-EVT-017 | `community_outreach_street_team_lead` | partial | `venue_safety_authority` | — | `brand_conduct_standards` | — | — | No |
| SLVG-EVT-018 | `community_outreach_street_team` | partial | `venue_safety_authority` | — | `brand_conduct_standards` | — | — | No |
| SLVG-EVT-019 | `production_manager` | unresolved | — | — | `radio_comms_protocol`, `technical_safety` | — | — | No |
| SLVG-EVT-020 | `audio` | unresolved | — | — | `production_systems_competency`, `show_operations`, `technical_safety` | — | — | No |
| SLVG-EVT-021 | `monitor_stage_audio_engineer` | unresolved | — | — | `confidentiality_artist_relations`, `production_systems_competency`, `technical_safety` | — | — | No |
| SLVG-EVT-022 | `lighting` | unresolved | — | — | `production_systems_competency`, `technical_safety` | — | — | No |
| SLVG-EVT-023 | `video_led` | unresolved | — | — | `privacy_data_handling`, `production_systems_competency` | — | — | No |
| SLVG-EVT-024 | `livestream_broadcast_producer` | unresolved | — | — | `privacy_data_handling`, `production_systems_competency` | — | — | No |
| SLVG-EVT-025 | `videographer` | unresolved | — | — | `privacy_data_handling`, `production_systems_competency`, `technical_safety` | — | — | No |
| SLVG-EVT-026 | `technical_utility` | unresolved | — | — | `manual_handling`, `technical_safety` | PPE as required | — | No |
| SLVG-EVT-027 | `talent_artist_relations_manager` | partial | `venue_safety_authority` | — | `access_control_procedures`, `confidentiality_artist_relations` | — | — | No |
| SLVG-EVT-028 | `backstage_green_room_coordinator` | unresolved | — | — | `access_control_procedures`, `confidentiality_artist_relations` | — | — | No |
| SLVG-EVT-029 | `security_manager_venue_security_liaison` | partial | `venue_safety_authority` | — | `access_control_procedures`, `incident_response_coordination` | licensing as applicable | — | No |
| SLVG-EVT-030 | `access_control_credential_lead` | unresolved | — | — | `access_control_procedures`, `de_escalation`, `privacy_data_handling` | — | — | No |
| SLVG-EVT-031 | `safety_incident_response_coordinator` | partial | `venue_safety_authority` | — | `incident_response_coordination` | — | — | No |
| SLVG-EVT-032 | `logistics_load_in_lead` | unresolved | — | `venue_safety_authority` | `manual_handling`, `radio_comms_protocol` | — | — | No |
| SLVG-EVT-033 | `setup_breakdown_crew` | partial | `venue_safety_authority` | — | `manual_handling` | — | — | No |
| SLVG-EVT-034 | `facilities_housekeeping_lead` | partial | `venue_safety_authority` | — | — | Chemical/PPE rules as applicable | — | No |
| SLVG-EVT-035 | `event_admin_staff_check_in_coordinator` | unresolved | — | — | `access_control_procedures`, `privacy_data_handling`, `registration_checkin_tools` | — | — | No |
| SLVG-EVT-036 | `cashless_pos_merch_lead` | unresolved | — | — | `pos_cash_handling`, `privacy_data_handling` | — | — | No |

## §5 Proposed new training modules (17, none exist)

Creating any of these is a separate authoring + creation step after `training_mappings` is authorized. A
mapping decision never marks anyone trained.

| Module key | Title | Summary | Verification | Roles | Exists |
|---|---|---|---|---|---|
| `radio_comms_protocol` | Radio and comms protocol | Channel plan, call signs, priority traffic and hand-offs on show night. | staff_verified | 5: `ops_lead`, `stage_manager`, `lead_host`, `production_manager`, `logistics_load_in_lead` | No |
| `accessibility_awareness` | Accessibility awareness | Assisting guests with access needs respectfully; routes, seating and hand-offs. | staff_verified | 6: `guest_experience_lead`, `host`, `registration_lead`, `seating_floor_lead`, `seating_floor_host`, `accessibility_guest_care_host` | No |
| `de_escalation` | De-escalation | Calm, respectful de-escalation and when to hand off to venue security. | staff_verified | 2: `guest_experience_lead`, `access_control_credential_lead` | No |
| `privacy_data_handling` | Privacy and data handling | Guest / staff personal data, photo & content rules, no private lists. | self_attest | 8: `registration_lead`, `door_team`, `video_led`, `livestream_broadcast_producer`, `videographer`, `access_control_credential_lead`, `event_admin_staff_check_in_coordinator`, `cashless_pos_merch_lead` | No |
| `registration_checkin_tools` | Registration and check-in tools | Guest registration and staff check-in tools and procedures. | staff_verified | 3: `registration_lead`, `door_team`, `event_admin_staff_check_in_coordinator` | No |
| `brand_conduct_standards` | Brand, messaging and conduct standards | Sanctuary LV Group brand standards, honest messaging and conduct. | self_attest | 5: `promoter_manager`, `lead_promoter`, `promoter`, `community_outreach_street_team_lead`, `community_outreach_street_team` | No |
| `confidentiality_artist_relations` | Confidentiality and artist relations | Backstage conduct, artist confidentiality and green-room etiquette. | self_attest | 4: `vip_host`, `monitor_stage_audio_engineer`, `talent_artist_relations_manager`, `backstage_green_room_coordinator` | No |
| `access_control_procedures` | Access control procedures | Credential policy, zone enforcement and emergency access. | staff_verified | 6: `vip_host`, `talent_artist_relations_manager`, `backstage_green_room_coordinator`, `security_manager_venue_security_liaison`, `access_control_credential_lead`, `event_admin_staff_check_in_coordinator` | No |
| `technical_safety` | Technical and electrical safety | Power, cabling, rigging awareness, hearing and stage safety, emergency shutdown. | staff_verified | 7: `stage_manager`, `production_manager`, `audio`, `monitor_stage_audio_engineer`, `lighting`, `videographer`, `technical_utility` | No |
| `manual_handling` | Manual handling and loading safety | Safe lifting, load-in routes and PPE where required. | staff_verified | 3: `technical_utility`, `logistics_load_in_lead`, `setup_breakdown_crew` | No |
| `show_operations` | Show operations | Show calling, run-of-show and cue discipline. | staff_verified | 2: `stage_manager`, `audio` | No |
| `production_systems_competency` | Production systems competency | Role-specific system competency (audio, lighting, video, broadcast) — verified per discipline. | staff_verified | 6: `audio`, `monitor_stage_audio_engineer`, `lighting`, `video_led`, `livestream_broadcast_producer`, `videographer` | No |
| `incident_response_coordination` | Incident response coordination | Incident command, documentation and stop-work / escalation authority (venue authority preserved). | staff_verified | 2: `security_manager_venue_security_liaison`, `safety_incident_response_coordinator` | No |
| `event_leadership` | Event leadership | Running the night: decision rights, escalation and debrief. | self_attest | 1: `event_director` | No |
| `venue_operations` | Venue operations | Working with venue departments: rules, schedules and service routes. | self_attest | 1: `ops_lead` | No |
| `seating_capacity_management` | Seating and capacity management | Seating plans, capacity counts and floor flow. | staff_verified | 2: `seating_floor_lead`, `seating_floor_host` | No |
| `pos_cash_handling` | POS, inventory and financial controls | Cashless / POS procedures, inventory counts and financial controls. | staff_verified | 1: `cashless_pos_merch_lead` | No |

## §6 Phrase resolutions (62)

| Phrase (normalized) | Resolution | Module / requirement | Note |
|---|---|---|---|
| event leadership | proposed_new | `event_leadership` | — |
| venue ops | proposed_new | `venue_operations` | — |
| radio protocol | proposed_new | `radio_comms_protocol` | — |
| comms | proposed_new | `radio_comms_protocol` | — |
| show calling | proposed_new | `show_operations` | — |
| run-of-show | proposed_new | `show_operations` | — |
| show cues | proposed_new | `show_operations` | — |
| stage safety | proposed_new | `technical_safety` | — |
| de-escalation | proposed_new | `de_escalation` | — |
| accessibility | proposed_new | `accessibility_awareness` | — |
| accessibility awareness | proposed_new | `accessibility_awareness` | — |
| registration tools | proposed_new | `registration_checkin_tools` | — |
| staff procedures | proposed_new | `registration_checkin_tools` | — |
| privacy | proposed_new | `privacy_data_handling` | — |
| privacy/content rules | proposed_new | `privacy_data_handling` | — |
| content handling | proposed_new | `privacy_data_handling` | — |
| capacity | proposed_new | `seating_capacity_management` | — |
| seating plan | proposed_new | `seating_capacity_management` | — |
| confidentiality | proposed_new | `confidentiality_artist_relations` | — |
| artist relations | proposed_new | `confidentiality_artist_relations` | — |
| artist communication | proposed_new | `confidentiality_artist_relations` | — |
| backstage conduct | proposed_new | `confidentiality_artist_relations` | — |
| access control | proposed_new | `access_control_procedures` | — |
| credential policy | proposed_new | `access_control_procedures` | — |
| credential control | proposed_new | `access_control_procedures` | — |
| emergency access | proposed_new | `access_control_procedures` | — |
| brand standards | proposed_new | `brand_conduct_standards` | — |
| brand messaging | proposed_new | `brand_conduct_standards` | — |
| brand conduct | proposed_new | `brand_conduct_standards` | — |
| conduct | proposed_new | `brand_conduct_standards` | — |
| guest conduct | proposed_new | `brand_conduct_standards` | — |
| compliance | proposed_new | `brand_conduct_standards` | Scope of "compliance" (marketing law, venue rules, brand) needs confirmation. |
| local/site rules | existing | `venue_safety_authority` | "site safety" / "venue rules" already map to this module. |
| technical safety | proposed_new | `technical_safety` | — |
| power | proposed_new | `technical_safety` | — |
| emergency shutdown | proposed_new | `technical_safety` | — |
| electrical safety | proposed_new | `technical_safety` | — |
| hearing safety | proposed_new | `technical_safety` | — |
| cable safety | proposed_new | `technical_safety` | — |
| rigging awareness | proposed_new | `technical_safety` | — |
| audio system | proposed_new | `production_systems_competency` | — |
| stage audio | proposed_new | `production_systems_competency` | — |
| lighting console | proposed_new | `production_systems_competency` | — |
| playback systems | proposed_new | `production_systems_competency` | — |
| signal flow | proposed_new | `production_systems_competency` | — |
| broadcast workflow | proposed_new | `production_systems_competency` | — |
| platform access | proposed_new | `production_systems_competency` | Platform account access itself is an IT permission, not a training completion. |
| camera operation | proposed_new | `production_systems_competency` | — |
| manual handling | proposed_new | `manual_handling` | — |
| safe lifting | proposed_new | `manual_handling` | — |
| loading safety | proposed_new | `manual_handling` | — |
| venue routes | existing | `venue_safety_authority` | Routes / exits are covered by venue_safety_authority ("evacuation routes"). |
| ppe as required | external_requirement | — | Conditional ("as required") — PPE need is decided per task / venue; never auto-required. |
| chemical/ppe rules as applicable | external_requirement | — | Conditional ("as applicable") — depends on venue chemicals and SDS; decided with the venue. |
| licensing as applicable | external_requirement | — | Conditional ("as applicable") — a state / local licence is a credential held by a person, verified outside this system; never a training completion. |
| incident command | proposed_new | `incident_response_coordination` | — |
| incident documentation | proposed_new | `incident_response_coordination` | — |
| incident reporting | existing | `venue_safety_authority` | "incident escalation" already maps here; documentation depth may need incident_response_coordination. |
| stop-work/escalation authority | proposed_new | `incident_response_coordination` | Any stop-work authority must be agreed with the venue. |
| pos procedures | proposed_new | `pos_cash_handling` | — |
| inventory control | proposed_new | `pos_cash_handling` | — |
| financial controls | proposed_new | `pos_cash_handling` | — |

## §7 Evidence

- `tests/phase4.test.ts`: matrix invariants (9 / 35 rows, no `all_staff` proposal, every row
  proposed / not granted / no completion, 17 modules `exists: false`, phrase split 3 / 56 / 3, zone deltas
  and 11 flags, `registration_lead` the only v1 module loss), `plan.ts` import closure excludes
  `resolution.ts` / `decisions.ts`, baseline hashes unchanged.
- `tests/browser/taxonomy_review.py`: panel renders, display-only, granted No, completions 0,
  9 / 35 / 17 rows, 8 non-same deltas, 11 flags, axe clean.
