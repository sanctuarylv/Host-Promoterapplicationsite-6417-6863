# Sanctuary LV Group — Operational Decision Register V4 (Phase 4)

**Status: 90 decisions, all PENDING. Production: NO-GO.** Nothing in this register has been decided,
recommended, classified, granted, completed or activated.

Source of truth: `packages/web/src/api/ops/staffing/decisions.ts` (`buildDecisionRegister`), served read-only
next to the unchanged plan by `staffingTaxonomy.preview` and rendered on `/staff/taxonomy#decision-register`.
The tables below are generated from that function at the Phase 4 commit; `tests/phase4.test.ts` asserts that
every decision ID appears in §4 of this file.

Baseline (unchanged from Phase 3): source `36dac8e8c7eb7ac529e25cdb217dc758582e6fecc4556163b81ad0ab35cf8892`,
plan `8c22363803999b763305dc8961dcc6b7226271c15c28829ce14aff842cfcd701`, migration 0002
`96317d6dffbb00905b4e15c811bfc03ea7adf9bdec4fa1b84d51a6dde9678a2c`.

## §1 Scope and invariants

- The only status a decision can have in code is `pending` (`DecisionStatus = "pending"`); `decision`,
  `decided_by` and `decided_at` are typed as `null`. The application cannot record a decision.
- Options are listed in a fixed order. **The order is not a ranking and no option is recommended.** Where a
  row points at a reviewer proposal (`proposal_ref`, the resolution matrix), that proposal is input for the
  owner, not a recommendation.
- 89 decisions are in the Sanctuary LV Group (paid) domain. Exactly one (`D-SRV-001`) is in the Sanctuary LV
  nonprofit Serve Team domain; it concerns a behaviour-only focus fix and changes no Serve Team identity,
  copy, route, schema or record.
- Engagement classification (`D-CLS-*`) belongs to Group leadership with HR / legal counsel. The system never
  infers a classification from title, department or pay fields.

| Category | Count | Owner |
|---|---|---|
| Runner (`D-RUN-001`) | 1 | Event leadership |
| Credential gaps (`D-CRED-001..009`) | 9 | Event Operations Manager + Access Control / Credential Lead |
| Zone deltas vs v1 on non-gap roles (`D-ZONE-001..006`) | 6 | Event Operations Manager + Access Control / Credential Lead |
| Training gaps (`D-TRN-001..035`) | 35 | Training owner |
| Engagement classification (`D-CLS-001..036`) | 36 | Group leadership with HR / legal |
| After Dark vNext template (`D-TPL-001`) | 1 | Event Director |
| Public label rename (`D-LBL-001`) | 1 | Group leadership |
| `/serve` focus patch (`D-SRV-001`, nonprofit) | 1 | Serve Team owner + repository owner |
| **Total** | **90** | |

## §2 How a decision is recorded

1. The owner fills in the **Decision (key)**, **Signed by** and **Date** columns in §4 (or in the change
   record, citing the decision ID). Only an option key listed for that row, or `other_*` with the
   mapping written out, is valid.
2. A decision lands **only** as a reviewed code / data change in a later, separately authorized phase.
   Decisions that change the canonical map (runner, credential or training mappings) change the plan hash and
   therefore require a re-baseline of `integrity.ts` and the Phase 3 / 4 hash tests.
3. A signed decision does not open a gate by itself. Each gate also needs its authorizations (§3) and its
   step in the release plan (`docs/RELEASE_PLAN_0002_V4.md`).
4. Do not sign one row to stand in for another, and do not bulk-sign a category.

## §3 Release gates and authorizations

All gates are closed (`open: false` in code). "Blocked by" counts the pending decisions whose `blocks`
include the gate.

| Gate | Description | Blocked by (pending decisions) | Requires authorizations | Open |
|---|---|---|---|---|
| `G1_backup` | Production backup taken and restore verified | 0 | `backup_restore` | **No** |
| `G2_migration` | Production migration 0002 (schema only) | 0 | `backup_restore`, `production_migration` | **No** |
| `G3_deploy` | Deploy the current build after 0002 | 0 | `production_migration`, `release` | **No** |
| `G4_import` | Production import of the 36 canonical roles (ops_canonical_roles only) | 1 | `production_import` | **No** |
| `G5_template` | Create an After Dark vNext template version (future phase; v1 stays active until then) | 52 | `vnext_template`, `runner_decision`, `credential_mappings`, `training_mappings` | **No** |
| `G6_staffing_live` | Engage / pay Group personnel against canonical roles | 36 | `engagement_classification` | **No** |
| `G7_public_label` | Change a public apply label | 1 | `public_rename`, `release` | **No** |
| `G8_serve_patch` | Merge the /serve focus fix | 1 | `serve_focus_patch`, `release` | **No** |

Authorizations (the 10 from Approval Package V3 §9 plus `serve_focus_patch`):

| Key | Authorization | Owner | Decisions covered | Status | Signed by | Date |
|---|---|---|---|---|---|---|
| `runner_decision` | Runner classification decision | Sanctuary LV Group event leadership (Event Director / Event Operations Manager) | D-RUN-001 | PENDING | | |
| `credential_mappings` | Credential mappings (1 partial · 8 unresolved) | Event Operations Manager with Access Control / Credential Lead | D-CRED-001 … D-ZONE-006 (15) | PENDING | | |
| `training_mappings` | Training mappings (21 partial · 14 unresolved) | Training owner (Guest Experience / Event Operations) | D-TRN-001 … D-TRN-035 (35) | PENDING | | |
| `engagement_classification` | Engagement classification for all 36 roles (pending_classification) | Sanctuary LV Group leadership with HR / legal | D-CLS-001 … D-CLS-036 (36) | PENDING | | |
| `vnext_template` | After Dark vNext staffing template (51 → 72 seats; 9 roles not enabled) | Event Director | D-TPL-001 | PENDING | | |
| `public_rename` | Public apply label rename (Guest Experience Lead → Guest Experience Manager) | Sanctuary LV Group leadership | D-LBL-001 | PENDING | | |
| `backup_restore` | Production backup taken and recovery path accepted, incl. unverified rollback assumptions | Platform owner | — | PENDING | | |
| `production_migration` | Production migration 0002 | Platform owner | — | PENDING | | |
| `production_import` | Production import of 36 canonical roles | Platform owner + Event Director | — | PENDING | | |
| `release` | GitHub push, PR #1 merge and deployment | Repository owner | — | PENDING | | |
| `serve_focus_patch` | Behaviour-only /serve focus fix (nonprofit domain) | Sanctuary LV (nonprofit) Serve Team owner + repository owner | D-SRV-001 | PENDING | | |

`backup_restore`, `production_migration`, `production_import` and `release` cover no register decision: they
are platform authorizations governed by `docs/RELEASE_PLAN_0002_V4.md`.

## §4 Sign-off table

All 90 rows are **PENDING**. Leave a row blank until the named owner decides.

| ID | Domain | Subject | Options (unranked keys) | Owner | Blocks | Status | Decision (key) | Signed by | Date |
|---|---|---|---|---|---|---|---|---|---|
| D-RUN-001 | Group | `runner` | `keep_outside_taxonomy`, `map_to_setup_breakdown_crew`, `add_canonical_role`, `retire_from_future_templates` | Sanctuary LV Group event leadership | G4_import, G5_template | PENDING | | | |
| D-CRED-001 | Group | `venue_liaison` | `approve_proposal`, `alternative_1`, `alternative_2`, `other_reviewed_mapping`, `leave_unresolved` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-CRED-002 | Group | `vip_host` | `approve_proposal`, `alternative_1`, `other_reviewed_mapping`, `leave_unresolved` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-CRED-003 | Group | `accessibility_guest_care_host` | `approve_proposal`, `alternative_1`, `other_reviewed_mapping`, `leave_unresolved` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-CRED-004 | Group | `community_outreach_street_team_lead` | `approve_proposal`, `alternative_1`, `other_reviewed_mapping`, `leave_unresolved` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-CRED-005 | Group | `community_outreach_street_team` | `approve_proposal`, `alternative_1`, `other_reviewed_mapping`, `leave_unresolved` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-CRED-006 | Group | `security_manager_venue_security_liaison` | `approve_proposal`, `alternative_1`, `other_reviewed_mapping`, `leave_unresolved` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-CRED-007 | Group | `access_control_credential_lead` | `approve_proposal`, `alternative_1`, `other_reviewed_mapping`, `leave_unresolved` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-CRED-008 | Group | `safety_incident_response_coordinator` | `approve_proposal`, `alternative_1`, `other_reviewed_mapping`, `leave_unresolved` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-CRED-009 | Group | `event_admin_staff_check_in_coordinator` | `approve_proposal`, `alternative_1`, `other_reviewed_mapping`, `leave_unresolved` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-ZONE-001 | Group | `stage_manager` | `accept_plan_zones`, `keep_v1_zones`, `other_reviewed_mapping` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-ZONE-002 | Group | `promoter_manager` | `accept_plan_zones`, `keep_v1_zones`, `other_reviewed_mapping` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-ZONE-003 | Group | `promoter` | `accept_plan_zones`, `keep_v1_zones`, `other_reviewed_mapping` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-ZONE-004 | Group | `production_manager` | `accept_plan_zones`, `keep_v1_zones`, `other_reviewed_mapping` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-ZONE-005 | Group | `audio` | `accept_plan_zones`, `keep_v1_zones`, `other_reviewed_mapping` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-ZONE-006 | Group | `videographer` | `accept_plan_zones`, `keep_v1_zones`, `other_reviewed_mapping` | Event Operations Manager with Access Control / Credential Lead | G5_template | PENDING | | | |
| D-TRN-001 | Group | `event_director` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-002 | Group | `ops_lead` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-003 | Group | `stage_manager` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-004 | Group | `guest_experience_lead` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-005 | Group | `lead_host` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-006 | Group | `host` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-007 | Group | `registration_lead` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-008 | Group | `door_team` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-009 | Group | `seating_floor_lead` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-010 | Group | `seating_floor_host` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-011 | Group | `vip_host` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-012 | Group | `accessibility_guest_care_host` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-013 | Group | `promoter_manager` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-014 | Group | `lead_promoter` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-015 | Group | `promoter` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-016 | Group | `community_outreach_street_team_lead` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-017 | Group | `community_outreach_street_team` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-018 | Group | `production_manager` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-019 | Group | `audio` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-020 | Group | `monitor_stage_audio_engineer` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-021 | Group | `lighting` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-022 | Group | `video_led` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-023 | Group | `livestream_broadcast_producer` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-024 | Group | `videographer` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-025 | Group | `technical_utility` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-026 | Group | `talent_artist_relations_manager` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-027 | Group | `backstage_green_room_coordinator` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-028 | Group | `security_manager_venue_security_liaison` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-029 | Group | `access_control_credential_lead` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-030 | Group | `safety_incident_response_coordinator` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-031 | Group | `logistics_load_in_lead` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-032 | Group | `setup_breakdown_crew` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-033 | Group | `facilities_housekeeping_lead` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-034 | Group | `event_admin_staff_check_in_coordinator` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-TRN-035 | Group | `cashless_pos_merch_lead` | `approve_proposal`, `map_to_existing_only`, `other_reviewed_mapping`, `accept_unresolved` | Training owner | G5_template | PENDING | | | |
| D-CLS-001 | Group | `event_director` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-002 | Group | `ops_lead` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-003 | Group | `stage_manager` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-004 | Group | `venue_liaison` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-005 | Group | `guest_experience_lead` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-006 | Group | `lead_host` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-007 | Group | `host` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-008 | Group | `registration_lead` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-009 | Group | `door_team` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-010 | Group | `seating_floor_lead` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-011 | Group | `seating_floor_host` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-012 | Group | `vip_host` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-013 | Group | `accessibility_guest_care_host` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-014 | Group | `promoter_manager` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-015 | Group | `lead_promoter` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-016 | Group | `promoter` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-017 | Group | `community_outreach_street_team_lead` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-018 | Group | `community_outreach_street_team` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-019 | Group | `production_manager` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-020 | Group | `audio` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-021 | Group | `monitor_stage_audio_engineer` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-022 | Group | `lighting` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-023 | Group | `video_led` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-024 | Group | `livestream_broadcast_producer` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-025 | Group | `videographer` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-026 | Group | `technical_utility` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-027 | Group | `talent_artist_relations_manager` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-028 | Group | `backstage_green_room_coordinator` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-029 | Group | `security_manager_venue_security_liaison` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-030 | Group | `access_control_credential_lead` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-031 | Group | `safety_incident_response_coordinator` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-032 | Group | `logistics_load_in_lead` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-033 | Group | `setup_breakdown_crew` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-034 | Group | `facilities_housekeeping_lead` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-035 | Group | `event_admin_staff_check_in_coordinator` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-CLS-036 | Group | `cashless_pos_merch_lead` | `employee`, `independent_contractor`, `vendor_or_agency_provided`, `not_used_by_group` | Sanctuary LV Group leadership with HR / legal counsel | G6_staffing_live | PENDING | | | |
| D-TPL-001 | Group | `after_dark_vnext` | `approve_for_build`, `approve_with_changes`, `reject` | Event Director | G5_template | PENDING | | | |
| D-LBL-001 | Group | `guest_experience_lead` | `approve_rename`, `keep_current`, `other_label` | Sanctuary LV Group leadership | G7_public_label | PENDING | | | |
| D-SRV-001 | Nonprofit Serve Team | `/serve success focus` | `apply_patch`, `apply_with_changes`, `do_not_apply` | Sanctuary LV | G8_serve_patch | PENDING | | | |

## §5 Decision detail

Generated from `buildDecisionRegister`. Context lines are facts from the reviewed plan, the Phase 3 review
or the resolution matrix.

### Runner (1)

**D-RUN-001** · `runner` · Group · owner: Sanctuary LV Group event leadership (Event Director / Event Operations Manager) · blocks: G4_import, G5_template · source: `review.runner_decision`

How should the existing After Dark v1 role `runner` (2 seats) relate to the 36-role canonical taxonomy?

- v1: Runner × 2, supervisor ops_lead, zones back_of_house
- vNext preview: carried_forward (2 → 2)
- Related canonical role: Setup / Breakdown Crew (SLVG-EVT-033, baseline 6) — may_absorb_unresolved
- Options are listed in a fixed order; the order is not a ranking.
- Options (fixed order, not a ranking): `keep_outside_taxonomy`: Keep `runner` as an existing role outside the canonical taxonomy; `map_to_setup_breakdown_crew`: Map `runner` onto Setup / Breakdown Crew (SLVG-EVT-033); `add_canonical_role`: Add Runner as its own canonical role in the workbook; `retire_from_future_templates`: Retire `runner` from future templates only
- Status: **pending** · decision: none


### Credential gaps (9)

**D-CRED-001** · `venue_liaison` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `review.credential_review` · proposal: `resolution.credentials.rows[0]`

Which access zones should Venue / Site Manager carry in a future template? Source: "Operations / Venue".

- Gap: unresolved · plan zones none · v1 zones all_staff
- Reviewer proposal: front_of_house, back_of_house (confidence low)
- v1 grants all_staff today. Keep all_staff for this seat (requires a reviewed ZONE_TOKENS entry or per-event grant), or accept the narrower proposal?
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposal (front_of_house, back_of_house); `alternative_1`: Alternative: front_of_house, back_of_house, stage; `alternative_2`: Alternative: no zone; `other_reviewed_mapping`: Other reviewed mapping (record zones explicitly); `leave_unresolved`: Leave unresolved (role grants no zone)
- Status: **pending** · decision: none

**D-CRED-002** · `vip_host` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `review.credential_review` · proposal: `resolution.credentials.rows[1]`

Which access zones should VIP / Artist Hospitality Lead carry in a future template? Source: "VIP / Hospitality / Backstage as approved".

- Gap: partial · plan zones vip · v1 zones front_of_house, vip
- Reviewer proposal: front_of_house, vip (confidence medium)
- Conditional "Backstage as approved" — never auto-granted; per-event decision
- Who may approve backstage access for a VIP Host on a given event, and is it recorded on the event plan?
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposal (front_of_house, vip); `alternative_1`: Alternative: vip; `other_reviewed_mapping`: Other reviewed mapping (record zones explicitly); `leave_unresolved`: Leave unresolved (role grants no zone)
- Status: **pending** · decision: none

**D-CRED-003** · `accessibility_guest_care_host` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `review.credential_review` · proposal: `resolution.credentials.rows[2]`

Which access zones should Accessibility / Guest Care Host carry in a future template? Source: "Guest Experience / Accessibility".

- Gap: unresolved · plan zones none · v1 zones no v1 seat
- Reviewer proposal: front_of_house (confidence medium)
- Does accessibility support require escorting guests into VIP or seated areas that need a separate zone?
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposal (front_of_house); `alternative_1`: Alternative: front_of_house, vip; `other_reviewed_mapping`: Other reviewed mapping (record zones explicitly); `leave_unresolved`: Leave unresolved (role grants no zone)
- Status: **pending** · decision: none

**D-CRED-004** · `community_outreach_street_team_lead` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `review.credential_review` · proposal: `resolution.credentials.rows[3]`

Which access zones should Community Outreach / Street Team Lead carry in a future template? Source: "Promoter / Activation".

- Gap: unresolved · plan zones none · v1 zones no v1 seat
- Reviewer proposal: no zone (confidence medium)
- Is there any onsite activation footprint that needs FOH access? (Role is not enabled for After Dark vNext.)
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposal (no zone); `alternative_1`: Alternative: front_of_house; `other_reviewed_mapping`: Other reviewed mapping (record zones explicitly); `leave_unresolved`: Leave unresolved (role grants no zone)
- Status: **pending** · decision: none

**D-CRED-005** · `community_outreach_street_team` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `review.credential_review` · proposal: `resolution.credentials.rows[4]`

Which access zones should Community Outreach / Street Team carry in a future template? Source: "Promoter / Activation".

- Gap: unresolved · plan zones none · v1 zones no v1 seat
- Reviewer proposal: no zone (confidence medium)
- Same as the Street Team Lead. (Role is not enabled for After Dark vNext.)
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposal (no zone); `alternative_1`: Alternative: front_of_house; `other_reviewed_mapping`: Other reviewed mapping (record zones explicitly); `leave_unresolved`: Leave unresolved (role grants no zone)
- Status: **pending** · decision: none

**D-CRED-006** · `security_manager_venue_security_liaison` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `review.credential_review` · proposal: `resolution.credentials.rows[5]`

Which access zones should Security Manager / Venue Security Liaison carry in a future template? Source: "Security / All Access as required".

- Gap: unresolved · plan zones none · v1 zones no v1 seat
- Reviewer proposal: front_of_house, back_of_house (confidence low)
- Conditional "All Access as required" — never auto-granted; per-event decision
- Who authorises all_staff for this role per event, and under which conditions?
- Is the role Group-employed or provided by the venue / a licensed contractor? (engagement classification pending)
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposal (front_of_house, back_of_house); `alternative_1`: Alternative: front_of_house, back_of_house, stage; `other_reviewed_mapping`: Other reviewed mapping (record zones explicitly); `leave_unresolved`: Leave unresolved (role grants no zone)
- Status: **pending** · decision: none

**D-CRED-007** · `access_control_credential_lead` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `review.credential_review` · proposal: `resolution.credentials.rows[6]`

Which access zones should Access Control / Credential Lead carry in a future template? Source: "Access Control".

- Gap: unresolved · plan zones none · v1 zones no v1 seat
- Reviewer proposal: front_of_house, back_of_house (confidence low)
- Where are credential and staff check points located at the After Dark venue?
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposal (front_of_house, back_of_house); `alternative_1`: Alternative: front_of_house; `other_reviewed_mapping`: Other reviewed mapping (record zones explicitly); `leave_unresolved`: Leave unresolved (role grants no zone)
- Status: **pending** · decision: none

**D-CRED-008** · `safety_incident_response_coordinator` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `review.credential_review` · proposal: `resolution.credentials.rows[7]`

Which access zones should Safety / Incident Response Coordinator carry in a future template? Source: "Operations / Safety".

- Gap: unresolved · plan zones none · v1 zones no v1 seat
- Reviewer proposal: front_of_house, back_of_house (confidence low)
- Should incident response include the stage, or does the Stage Manager / venue own stage incidents?
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposal (front_of_house, back_of_house); `alternative_1`: Alternative: front_of_house, back_of_house, stage; `other_reviewed_mapping`: Other reviewed mapping (record zones explicitly); `leave_unresolved`: Leave unresolved (role grants no zone)
- Status: **pending** · decision: none

**D-CRED-009** · `event_admin_staff_check_in_coordinator` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `review.credential_review` · proposal: `resolution.credentials.rows[8]`

Which access zones should Event Admin / Staff Check-In Coordinator carry in a future template? Source: "Staff Check-In / Operations".

- Gap: unresolved · plan zones none · v1 zones no v1 seat
- Reviewer proposal: back_of_house (confidence low)
- Confirm the staff check-in location; if it is at the guest entrance the proposal should be FOH.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposal (back_of_house); `alternative_1`: Alternative: front_of_house, back_of_house; `other_reviewed_mapping`: Other reviewed mapping (record zones explicitly); `leave_unresolved`: Leave unresolved (role grants no zone)
- Status: **pending** · decision: none


### Zone deltas (non-gap roles) (6)

**D-ZONE-001** · `stage_manager` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `resolution.credentials.zone_reconciliation` · proposal: `resolution.credentials.zone_reconciliation[2]`

The reviewed plan maps stage_manager to back_of_house, stage, all_staff; After Dark v1 grants back_of_house, stage. Accept the change for a future template?

- Delta vs v1: expands · adds all_staff
- Nothing changes today: the import writes only ops_canonical_roles; v1 template roles, assignments and issued credentials keep their zones.
- Options (fixed order, not a ranking): `accept_plan_zones`: Accept plan zones (back_of_house, stage, all_staff); `keep_v1_zones`: Keep v1 zones (back_of_house, stage); `other_reviewed_mapping`: Other reviewed mapping
- Status: **pending** · decision: none

**D-ZONE-002** · `promoter_manager` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `resolution.credentials.zone_reconciliation` · proposal: `resolution.credentials.zone_reconciliation[9]`

The reviewed plan maps promoter_manager to front_of_house; After Dark v1 grants no zone. Accept the change for a future template?

- Delta vs v1: expands · adds front_of_house
- Nothing changes today: the import writes only ops_canonical_roles; v1 template roles, assignments and issued credentials keep their zones.
- Options (fixed order, not a ranking): `accept_plan_zones`: Accept plan zones (front_of_house); `keep_v1_zones`: Keep v1 zones (none); `other_reviewed_mapping`: Other reviewed mapping
- Status: **pending** · decision: none

**D-ZONE-003** · `promoter` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `resolution.credentials.zone_reconciliation` · proposal: `resolution.credentials.zone_reconciliation[10]`

The reviewed plan maps promoter to front_of_house; After Dark v1 grants no zone. Accept the change for a future template?

- Delta vs v1: expands · adds front_of_house
- Nothing changes today: the import writes only ops_canonical_roles; v1 template roles, assignments and issued credentials keep their zones.
- Options (fixed order, not a ranking): `accept_plan_zones`: Accept plan zones (front_of_house); `keep_v1_zones`: Keep v1 zones (none); `other_reviewed_mapping`: Other reviewed mapping
- Status: **pending** · decision: none

**D-ZONE-004** · `production_manager` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `resolution.credentials.zone_reconciliation` · proposal: `resolution.credentials.zone_reconciliation[11]`

The reviewed plan maps production_manager to back_of_house, stage, all_staff; After Dark v1 grants back_of_house, stage. Accept the change for a future template?

- Delta vs v1: expands · adds all_staff
- Nothing changes today: the import writes only ops_canonical_roles; v1 template roles, assignments and issued credentials keep their zones.
- Options (fixed order, not a ranking): `accept_plan_zones`: Accept plan zones (back_of_house, stage, all_staff); `keep_v1_zones`: Keep v1 zones (back_of_house, stage); `other_reviewed_mapping`: Other reviewed mapping
- Status: **pending** · decision: none

**D-ZONE-005** · `audio` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `resolution.credentials.zone_reconciliation` · proposal: `resolution.credentials.zone_reconciliation[12]`

The reviewed plan maps audio to front_of_house, back_of_house, stage; After Dark v1 grants back_of_house, stage. Accept the change for a future template?

- Delta vs v1: expands · adds front_of_house
- Nothing changes today: the import writes only ops_canonical_roles; v1 template roles, assignments and issued credentials keep their zones.
- Options (fixed order, not a ranking): `accept_plan_zones`: Accept plan zones (front_of_house, back_of_house, stage); `keep_v1_zones`: Keep v1 zones (back_of_house, stage); `other_reviewed_mapping`: Other reviewed mapping
- Status: **pending** · decision: none

**D-ZONE-006** · `videographer` · Group · owner: Event Operations Manager with Access Control / Credential Lead · blocks: G5_template · source: `resolution.credentials.zone_reconciliation` · proposal: `resolution.credentials.zone_reconciliation[15]`

The reviewed plan maps videographer to back_of_house, stage; After Dark v1 grants no zone. Accept the change for a future template?

- Delta vs v1: expands · adds back_of_house, stage
- Nothing changes today: the import writes only ops_canonical_roles; v1 template roles, assignments and issued credentials keep their zones.
- Options (fixed order, not a ranking): `accept_plan_zones`: Accept plan zones (back_of_house, stage); `keep_v1_zones`: Keep v1 zones (none); `other_reviewed_mapping`: Other reviewed mapping
- Status: **pending** · decision: none


### Training gaps (35)

**D-TRN-001** · `event_director` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[0]`

Resolve 1 unmapped training requirement(s) for Event Director / Executive Producer: Event leadership.

- Gap: partial · plan modules event_orientation, venue_safety_authority
- Proposal: existing — · new (proposed, not created) event_leadership
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-002** · `ops_lead` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[1]`

Resolve 2 unmapped training requirement(s) for Event Operations Manager: Venue ops; radio protocol.

- Gap: partial · plan modules venue_safety_authority
- Proposal: existing — · new (proposed, not created) radio_comms_protocol, venue_operations
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-003** · `stage_manager` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[2]`

Resolve 4 unmapped training requirement(s) for Stage Manager / Show Caller: Show calling; comms; stage safety; run-of-show.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) radio_comms_protocol, show_operations, technical_safety
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-004** · `guest_experience_lead` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[3]`

Resolve 2 unmapped training requirement(s) for Guest Experience Manager: de-escalation; accessibility.

- Gap: partial · plan modules guest_service_fundamentals, venue_safety_authority
- Proposal: existing — · new (proposed, not created) accessibility_awareness, de_escalation
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-005** · `lead_host` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[4]`

Resolve 1 unmapped training requirement(s) for Lead Host: radio protocol.

- Gap: partial · plan modules guest_service_fundamentals
- Proposal: existing — · new (proposed, not created) radio_comms_protocol
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-006** · `host` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[5]`

Resolve 1 unmapped training requirement(s) for Host: accessibility awareness.

- Gap: partial · plan modules event_orientation, guest_service_fundamentals, venue_safety_authority
- Proposal: existing — · new (proposed, not created) accessibility_awareness
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-007** · `registration_lead` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[6]`

Resolve 3 unmapped training requirement(s) for Check-In / Registration Lead: Registration tools; privacy; accessibility.

- Gap: partial · plan modules venue_safety_authority
- Proposal: existing — · new (proposed, not created) accessibility_awareness, privacy_data_handling, registration_checkin_tools
- v1 required guest_service_fundamentals; the canonical text no longer names it
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-008** · `door_team` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[7]`

Resolve 2 unmapped training requirement(s) for Check-In / Registration Host: Registration tools; privacy.

- Gap: partial · plan modules guest_service_fundamentals
- Proposal: existing — · new (proposed, not created) privacy_data_handling, registration_checkin_tools
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-009** · `seating_floor_lead` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[8]`

Resolve 2 unmapped training requirement(s) for Seating / Floor Lead: Capacity; accessibility.

- Gap: partial · plan modules guest_service_fundamentals, venue_safety_authority
- Proposal: existing — · new (proposed, not created) accessibility_awareness, seating_capacity_management
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-010** · `seating_floor_host` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[9]`

Resolve 2 unmapped training requirement(s) for Seating / Floor Host: Seating plan; accessibility.

- Gap: partial · plan modules venue_safety_authority
- Proposal: existing — · new (proposed, not created) accessibility_awareness, seating_capacity_management
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-011** · `vip_host` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[10]`

Resolve 2 unmapped training requirement(s) for VIP / Artist Hospitality Lead: Confidentiality; access control.

- Gap: partial · plan modules guest_service_fundamentals
- Proposal: existing — · new (proposed, not created) access_control_procedures, confidentiality_artist_relations
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-012** · `accessibility_guest_care_host` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[11]`

Resolve 1 unmapped training requirement(s) for Accessibility / Guest Care Host: Accessibility awareness.

- Gap: partial · plan modules guest_service_fundamentals, venue_safety_authority
- Proposal: existing — · new (proposed, not created) accessibility_awareness
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-013** · `promoter_manager` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[12]`

Resolve 3 unmapped training requirement(s) for Promoter Manager: Brand standards; compliance; guest conduct.

- Gap: partial · plan modules promoter_tracking_accuracy
- Proposal: existing — · new (proposed, not created) brand_conduct_standards
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-014** · `lead_promoter` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[13]`

Resolve 2 unmapped training requirement(s) for Lead Promoter: Brand messaging; conduct.

- Gap: partial · plan modules promoter_tracking_accuracy, venue_safety_authority
- Proposal: existing — · new (proposed, not created) brand_conduct_standards
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-015** · `promoter` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[14]`

Resolve 2 unmapped training requirement(s) for Promoter: Brand standards; conduct.

- Gap: partial · plan modules event_orientation, promoter_tracking_accuracy
- Proposal: existing — · new (proposed, not created) brand_conduct_standards
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-016** · `community_outreach_street_team_lead` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[15]`

Resolve 2 unmapped training requirement(s) for Community Outreach / Street Team Lead: Brand conduct; local/site rules.

- Gap: partial · plan modules venue_safety_authority
- Proposal: existing — · new (proposed, not created) brand_conduct_standards
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-017** · `community_outreach_street_team` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[16]`

Resolve 2 unmapped training requirement(s) for Community Outreach / Street Team: Brand messaging; conduct.

- Gap: partial · plan modules venue_safety_authority
- Proposal: existing — · new (proposed, not created) brand_conduct_standards
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-018** · `production_manager` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[17]`

Resolve 4 unmapped training requirement(s) for Production Manager / Technical Director: Technical safety; power; comms; emergency shutdown.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) radio_comms_protocol, technical_safety
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-019** · `audio` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[18]`

Resolve 4 unmapped training requirement(s) for Audio Lead / FOH Engineer: Audio system; hearing safety; electrical safety; show cues.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) production_systems_competency, show_operations, technical_safety
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-020** · `monitor_stage_audio_engineer` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[19]`

Resolve 3 unmapped training requirement(s) for Monitor / Stage Audio Engineer: Stage audio; cable safety; artist communication.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) confidentiality_artist_relations, production_systems_competency, technical_safety
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-021** · `lighting` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[20]`

Resolve 3 unmapped training requirement(s) for Lighting Director / Operator: Lighting console; rigging awareness; electrical safety.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) production_systems_competency, technical_safety
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-022** · `video_led` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[21]`

Resolve 3 unmapped training requirement(s) for Video / LED / Playback Operator: Playback systems; signal flow; content handling.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) privacy_data_handling, production_systems_competency
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-023** · `livestream_broadcast_producer` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[22]`

Resolve 3 unmapped training requirement(s) for Livestream / Broadcast Producer: Broadcast workflow; platform access; privacy/content rules.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) privacy_data_handling, production_systems_competency
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-024** · `videographer` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[23]`

Resolve 3 unmapped training requirement(s) for Camera Operator: Camera operation; cable safety; privacy/content rules.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) privacy_data_handling, production_systems_competency, technical_safety
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-025** · `technical_utility` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[24]`

Resolve 4 unmapped training requirement(s) for Stagehand / Production Technician: Manual handling; cable safety; stage safety; PPE as required.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) manual_handling, technical_safety · external / conditional: PPE as required
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-026** · `talent_artist_relations_manager` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[25]`

Resolve 3 unmapped training requirement(s) for Talent / Artist Relations Manager: Confidentiality; artist relations; access control.

- Gap: partial · plan modules venue_safety_authority
- Proposal: existing — · new (proposed, not created) access_control_procedures, confidentiality_artist_relations
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-027** · `backstage_green_room_coordinator` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[26]`

Resolve 3 unmapped training requirement(s) for Backstage / Green Room Coordinator: Confidentiality; backstage conduct; access control.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) access_control_procedures, confidentiality_artist_relations
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-028** · `security_manager_venue_security_liaison` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[27]`

Resolve 3 unmapped training requirement(s) for Security Manager / Venue Security Liaison: incident command; access control; licensing as applicable.

- Gap: partial · plan modules venue_safety_authority
- Proposal: existing — · new (proposed, not created) access_control_procedures, incident_response_coordination · external / conditional: licensing as applicable
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-029** · `access_control_credential_lead` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[28]`

Resolve 4 unmapped training requirement(s) for Access Control / Credential Lead: Credential policy; privacy; de-escalation; emergency access.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) access_control_procedures, de_escalation, privacy_data_handling
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-030** · `safety_incident_response_coordinator` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[29]`

Resolve 2 unmapped training requirement(s) for Safety / Incident Response Coordinator: incident documentation; stop-work/escalation authority.

- Gap: partial · plan modules venue_safety_authority
- Proposal: existing — · new (proposed, not created) incident_response_coordination
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-031** · `logistics_load_in_lead` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[30]`

Resolve 4 unmapped training requirement(s) for Logistics / Load-In Lead: Manual handling; loading safety; venue routes; radio protocol.

- Gap: unresolved · plan modules none
- Proposal: existing venue_safety_authority · new (proposed, not created) manual_handling, radio_comms_protocol
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-032** · `setup_breakdown_crew` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[31]`

Resolve 2 unmapped training requirement(s) for Setup / Breakdown Crew: Manual handling; safe lifting.

- Gap: partial · plan modules venue_safety_authority
- Proposal: existing — · new (proposed, not created) manual_handling
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-033** · `facilities_housekeeping_lead` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[32]`

Resolve 2 unmapped training requirement(s) for Facilities / Housekeeping Lead: Chemical/PPE rules as applicable; incident reporting.

- Gap: partial · plan modules venue_safety_authority
- Proposal: existing — · new (proposed, not created) — · external / conditional: Chemical/PPE rules as applicable
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-034** · `event_admin_staff_check_in_coordinator` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[33]`

Resolve 3 unmapped training requirement(s) for Event Admin / Staff Check-In Coordinator: Privacy; credential control; staff procedures.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) access_control_procedures, privacy_data_handling, registration_checkin_tools
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none

**D-TRN-035** · `cashless_pos_merch_lead` · Group · owner: Training owner (Guest Experience / Event Operations) · blocks: G5_template · source: `review.training_review` · proposal: `resolution.training.rows[34]`

Resolve 4 unmapped training requirement(s) for Cashless POS / Merch Lead: POS procedures; inventory control; privacy; financial controls.

- Gap: unresolved · plan modules none
- Proposal: existing — · new (proposed, not created) pos_cash_handling, privacy_data_handling
- Approving a mapping never marks anyone trained.
- Options (fixed order, not a ranking): `approve_proposal`: Approve proposed mapping (new modules still need authoring + a separate creation step); `map_to_existing_only`: Map to existing modules only; leave the rest unresolved; `other_reviewed_mapping`: Other reviewed mapping; `accept_unresolved`: Accept as unresolved
- Status: **pending** · decision: none


### Engagement classification (36)

**D-CLS-001** · `event_director` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Event Director / Executive Producer (SLVG-EVT-001) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · executive_leadership · executive · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-002** · `ops_lead` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Event Operations Manager (SLVG-EVT-002) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · event_operations · manager · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-003** · `stage_manager` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Stage Manager / Show Caller (SLVG-EVT-003) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · production · lead · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-004** · `venue_liaison` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Venue / Site Manager (SLVG-EVT-004) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · event_operations · manager · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-005** · `guest_experience_lead` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Guest Experience Manager (SLVG-EVT-005) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · guest_experience · manager · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-006** · `lead_host` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Lead Host (SLVG-EVT-006) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · guest_experience · lead · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-007** · `host` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Host (SLVG-EVT-007) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · guest_experience · team · scalable · baseline 6
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-008** · `registration_lead` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Check-In / Registration Lead (SLVG-EVT-008) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · guest_experience · lead · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-009** · `door_team` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Check-In / Registration Host (SLVG-EVT-009) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · guest_experience · team · scalable · baseline 3
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-010** · `seating_floor_lead` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Seating / Floor Lead (SLVG-EVT-010) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · guest_experience · lead · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-011** · `seating_floor_host` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Seating / Floor Host (SLVG-EVT-011) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · guest_experience · team · scalable · baseline 4
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-012** · `vip_host` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is VIP / Artist Hospitality Lead (SLVG-EVT-012) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · hospitality · lead · event_specific · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-013** · `accessibility_guest_care_host` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Accessibility / Guest Care Host (SLVG-EVT-013) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · guest_experience · specialist · recommended · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-014** · `promoter_manager` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Promoter Manager (SLVG-EVT-014) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · growth_promotion · manager · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-015** · `lead_promoter` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Lead Promoter (SLVG-EVT-015) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · growth_promotion · lead · scalable · baseline 2
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-016** · `promoter` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Promoter (SLVG-EVT-016) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · growth_promotion · team · scalable · baseline 8
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-017** · `community_outreach_street_team_lead` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Community Outreach / Street Team Lead (SLVG-EVT-017) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · growth_promotion · lead · event_specific · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-018** · `community_outreach_street_team` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Community Outreach / Street Team (SLVG-EVT-018) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · growth_promotion · team · scalable · baseline 4
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-019** · `production_manager` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Production Manager / Technical Director (SLVG-EVT-019) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · production · manager · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-020** · `audio` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Audio Lead / FOH Engineer (SLVG-EVT-020) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · production · specialist · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-021** · `monitor_stage_audio_engineer` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Monitor / Stage Audio Engineer (SLVG-EVT-021) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · production · specialist · event_specific · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-022** · `lighting` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Lighting Director / Operator (SLVG-EVT-022) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · production · specialist · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-023** · `video_led` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Video / LED / Playback Operator (SLVG-EVT-023) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · production · specialist · event_specific · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-024** · `livestream_broadcast_producer` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Livestream / Broadcast Producer (SLVG-EVT-024) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · production · lead · event_specific · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-025** · `videographer` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Camera Operator (SLVG-EVT-025) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · production · team · scalable · baseline 2
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-026** · `technical_utility` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Stagehand / Production Technician (SLVG-EVT-026) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · production · team · scalable · baseline 4
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-027** · `talent_artist_relations_manager` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Talent / Artist Relations Manager (SLVG-EVT-027) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · talent_backstage · manager · event_specific · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-028** · `backstage_green_room_coordinator` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Backstage / Green Room Coordinator (SLVG-EVT-028) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · talent_backstage · team · event_specific · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-029** · `security_manager_venue_security_liaison` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Security Manager / Venue Security Liaison (SLVG-EVT-029) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · safety_security · manager · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-030** · `access_control_credential_lead` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Access Control / Credential Lead (SLVG-EVT-030) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · safety_security · lead · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-031** · `safety_incident_response_coordinator` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Safety / Incident Response Coordinator (SLVG-EVT-031) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · safety_security · specialist · recommended · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-032** · `logistics_load_in_lead` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Logistics / Load-In Lead (SLVG-EVT-032) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · logistics_facilities · lead · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-033** · `setup_breakdown_crew` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Setup / Breakdown Crew (SLVG-EVT-033) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · logistics_facilities · team · scalable · baseline 6
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-034** · `facilities_housekeeping_lead` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Facilities / Housekeeping Lead (SLVG-EVT-034) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · logistics_facilities · lead · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-035** · `event_admin_staff_check_in_coordinator` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Event Admin / Staff Check-In Coordinator (SLVG-EVT-035) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · administration · coordinator · required · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none

**D-CLS-036** · `cashless_pos_merch_lead` · Group · owner: Sanctuary LV Group leadership with HR / legal counsel · blocks: G6_staffing_live · source: `review.role_review`

How is Cashless POS / Merch Lead (SLVG-EVT-036) engaged by Sanctuary LV Group?

- Recorded today: pending_classification · commerce · lead · event_specific · baseline 1
- The system never infers a classification from title, department or pay fields. Decision sits with HR / legal.
- Options (fixed order, not a ranking): `employee`: Employee of Sanctuary LV Group; `independent_contractor`: Independent contractor; `vendor_or_agency_provided`: Provided by a vendor / agency / venue under contract; `not_used_by_group`: Not engaged by the Group (role not staffed)
- Status: **pending** · decision: none


### After Dark vNext template (1)

**D-TPL-001** · `after_dark_vnext` · Group · owner: Event Director · blocks: G5_template · source: `review.template_comparison` · proposal: `review.template_comparison`

Approve the After Dark vNext staffing proposal (51 → 72 seats, 9 roles not enabled) for a future template build?

- Approval of the proposal does NOT create or activate a template version; v1 stays the published, active template.
- Depends on: D-RUN-001, D-CRED-*, D-ZONE-*, D-TRN-* (or explicit acceptance of them as unresolved).
- Package: docs/AFTER_DARK_VNEXT_APPROVAL_PACKAGE_V4.md
- Options (fixed order, not a ranking): `approve_for_build`: Approve proposal for a future template-build phase; `approve_with_changes`: Approve with recorded changes; `reject`: Reject; keep v1 only
- Status: **pending** · decision: none


### Public label (1)

**D-LBL-001** · `guest_experience_lead` · Group · owner: Sanctuary LV Group leadership · blocks: G7_public_label · source: `review.approval_checklist.human.public_rename`

Public apply label rename (Guest Experience Lead → Guest Experience Manager)

- Prepared, not applied. Public role keys and existing applications are unchanged by a label change.
- Options (fixed order, not a ranking): `approve_rename`: Approve the rename; `keep_current`: Keep the current public label; `other_label`: Use a different label
- Status: **pending** · decision: none


### Nonprofit behaviour patch (1)

**D-SRV-001** · `/serve success focus` · Nonprofit Serve Team · owner: Sanctuary LV (nonprofit) Serve Team owner + repository owner · blocks: G8_serve_patch · source: `Phase 4 focus root-cause analysis` · proposal: `docs/patches/serve-success-focus.patch`

Apply the behaviour-only fix that moves focus to the /serve success panel reliably (docs/patches/serve-success-focus.patch)?

- Root cause: focus is requested in a requestAnimationFrame callback that can run before React commits the success panel (docs/PHASE4_READINESS_REPORT.md §6).
- Change: focus from an effect after commit. No copy, route, API, identity, schema or record change; Serve Team volunteer records untouched.
- Evidence: current build 24/32 focused (all 8 failures had no panel at lookup time); patched build 33/33 (docs/evidence/phase4/serve-focus).
- Options (fixed order, not a ranking): `apply_patch`: Apply the patch as proposed; `apply_with_changes`: Apply with changes; `do_not_apply`: Do not apply; keep the known intermittent focus failure
- Status: **pending** · decision: none

