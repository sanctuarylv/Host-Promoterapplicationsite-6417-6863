# Staffing Taxonomy Import — Runbook (v2)

Status: **IMPORTER READY — IMPORT PENDING APPROVAL.** No production import has been run, and this phase does not
authorize one. Model and decisions: `STAFFING_TAXONOMY_V2.md`.

All commands run from `packages/web`. **Never** point any of them at the root `.env` (it holds the production
Turso URL), and never run `bun run db:*` for this work.

## 1. File requirements

- Format **canonical_v1**: the Sanctuary LV Group 36-role workbook exported as CSV (UTF-8, header row, CRLF or LF)
  or as a JSON array of row objects. Detection uses the **complete** header set — a file that satisfies both the
  canonical and the legacy header set, or neither, is rejected.
- Required columns (all 23): `role_id, role_name, department, workstream, reports_to, baseline_headcount,
  headcount_model, opportunity_type, engagement_type, event_applicability, seniority, role_summary, pre_event,
  load_in, live_event, closeout, dress_code, credential_level, training_requirements, status, entity_id,
  import_version, source_system`. Extra columns are reported, not imported.
- Content rules: exactly 36 unique `SLVG-EVT-NNN` IDs, all in the reviewed map; `entity_id = sanctuary_lv_group`;
  `opportunity_type = paid`; `engagement_type = pending_classification`; `headcount_model` one of
  `required | recommended | scalable | event_specific`; `baseline_headcount` a non-negative integer; known
  department; every `reports_to` resolves; `status` `active | inactive`.
- The reviewed file is committed at `data/staffing/sanctuary_lv_group_36_role_canonical_v1.csv`. Do not
  re-save it in a spreadsheet tool: any byte change changes the source hash (§5) and drops the stage back to
  "Reconciliation ready" until the new hash is reviewed.
- **Legacy format** (the six-column template-role export: `role_key, title, department_key, slot_class,
  workforce, count`, optional `supervisor_role_key, notes`) is still accepted, **validated only, never written**.
  The importer reports its findings in `legacy_report` and exits 1 (`ok: false`): a legacy file is never importable.
  `scripts/workbook-reconcile.ts` remains the standalone legacy six-column validator; it does not read the
  canonical format and is not an importer.

## 2. Dry-run command

```bash
# default = dry run; opens NO database
env -u DATABASE_URL -u DATABASE_AUTH_TOKEN \
  bun scripts/workbook-import.ts --file data/staffing/sanctuary_lv_group_36_role_canonical_v1.csv

# also compute insert / update / unchanged against a LOCAL copy (read-only)
DATABASE_URL=file:/tmp/rehearsal.db DATABASE_AUTH_TOKEN=local-file \
  bun scripts/workbook-import.ts --file <path> --dry-run --target local --out /tmp/plan.json
```

Output: a summary on stdout and the full plan at `artifacts/workbook-import-plan.json` (git-ignored) or `--out`.
Exit codes: `0` valid · `1` validation errors · `2` refused / usage.

Expected result for the reviewed file:

```
[workbook-import] DRY RUN — NOTHING IMPORTED
canonical roles 36 (exact 3 · rename 7 · partial 7 · new 19)  entity sanctuary_lv_group
existing roles: preserved 17 · excluded 1 · external 7 · separate_domain 10 · unresolved 1
headcount: canonical baseline 66 · After Dark v1 51 → vNext preview 72 · assignments created 0
supervisor changes 6: ...
credential gaps 9 · training gaps 35
warnings 50 · errors 0
plan_hash 8c22363803999b763305dc8961dcc6b7226271c15c28829ce14aff842cfcd701
RESULT: valid — DRY RUN, nothing written. Import pending approval
```

The dry run is proven to write nothing: unit test (temp DB file hash before/after) and the migration rehearsal
(`tests/migration/check.sh`, DB sha256 compared).

The same plan is visible to staff with `integration.manage` at `/staff/taxonomy` (built from the embedded,
reviewed copy; read-only).

## 3. Validation

Errors (block any apply): `role_count`, `missing_id`, `bad_id`, `duplicate_id`, `unmapped_id`, `duplicate_name`,
`missing_field`, `unknown_entity`, `nonprofit_conversion`, `external_conversion`, `invalid_opportunity`,
`invalid_engagement`, `invalid_headcount`, `invalid_headcount_model`, `invalid_seniority`, `invalid_status`,
`unknown_department`, `unresolved_supervisor`, `supervisor_cycle`, map integrity (`map_bad_id`,
`map_unknown_legacy`, `map_class_conflict`, `duplicate_mapping`, `legacy_key_not_preserved`) and
`target_conflict` (a target row holds the `role_key` under another ID).

Warnings (reviewed, do not block): `credential_gap`, `training_gap`, `external_relation`,
`unresolved_legacy_role`, `source_system`. Reviewed file: 50 warnings (training_gap 35, credential_gap 11,
external_relation 3, unresolved_legacy_role 1), 0 errors.

## 4. Reconciliation

The reviewed map (`src/api/ops/staffing/role-map.ts`, printable with `bun scripts/workbook-role-map.ts`) is the only
source of identity decisions — no fuzzy matching. The plan reports:

- canonical roles by class (exact / rename / partial / new);
- existing v1 roles: preserved / excluded (`serve_coordinator`) / external (7 venue roles) / separate_domain (10) /
  unresolved (`runner`);
- the six supervisor changes;
- credential and training mappings with gaps;
- public-role impact (curated options unchanged; `guest_experience_lead` label rename prepared, not applied);
- the After Dark vNext preview diff.

Changing a mapping means editing `role-map.ts` in a reviewed commit; tests pin the totals.

## 5. Source hash

`source_hash` = sha256 of the exact file bytes, printed by the dry run and stored on every
`ops_canonical_roles` row. The reviewed value is `REVIEWED_SOURCE_SHA256` in `role-map.ts`
(`36dac8e8c7eb7ac529e25cdb217dc758582e6fecc4556163b81ad0ab35cf8892`). The readiness stage reads
**Import pending approval** only when the validated source hash equals that value; otherwise it is
**Reconciliation ready** (valid but unreviewed) or **Validation failed**. An apply requires
`--confirm-source-hash=<sha256>` equal to the plan's hash.

## 6. Plan review

Review `artifacts/workbook-import-plan.json` (or `/staff/taxonomy`) before any approval:

1. `ok: true`, `errors: []`, `import_status: "DRY RUN — NOTHING IMPORTED"`.
2. `source_hash` matches the reviewed hash; `plan_hash` matches the value recorded in the approval.
3. `canonical_roles.total = 36`, `headcount.canonical_baseline_total = 66`, `headcount.promoter_baseline = 8`,
   `headcount.assignments_created = 0`.
4. `supervisor_changes` (6) accepted by operations.
5. `credential_mappings` / `training_mappings` gaps accepted (gaps grant nothing and create no records).
6. `proposed_writes.tables_written_on_apply = ["ops_canonical_roles"]`; `never_written` lists templates, event
   plans, assignments, credentials/permissions, training and people/applications.
7. `proposed_writes.summary` against the target (from `--target local` on a fresh copy of the target):
   on an empty table, insert 36 · update 0 · unchanged 0 · conflict 0.

`plan_hash` is a sha256 over the plan body excluding `generated_at`, so the same file + same target state always
gives the same hash.

## 7. Migration prerequisites

- Migration `drizzle/0002_canonical_staffing_taxonomy.sql` must be applied first. It is **additive**: creates
  `ops_canonical_roles` (+ unique `role_key` index) and adds nullable/defaulted columns
  (`ops_template_roles.canonical_role_id`, `enabled` default true, `required` default false;
  `ops_templates.entity_id`, `updated_at`). No existing row changes value.
- It is part of the production migration covered by `PRODUCTION_MIGRATION_CHECKLIST_V2.md` (approval, change
  window, operator/reviewer, fresh backup). It has **not** been run on production.
- Without the table, `--target local` reports "ops_canonical_roles missing" and `--apply` refuses.
- Rehearsal: `env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bash tests/migration/check.sh <snapshot.db>` (migrate twice,
  backfill, seed, importer dry run / apply / re-apply on a temp copy).

## 8. Approval boundary

In this phase the importer **cannot** write anything except a local `file:` database:

- `--apply` requires `--target local`, a `file:` `DATABASE_URL`, a valid plan, an existing table and
  `--confirm-source-hash`. Any other target (`staging`, `production`, a `libsql://` host) is refused with exit 2.
  There is no override flag.
- Even locally, apply writes only `ops_canonical_roles` (upsert by `canonical_role_id`). It never writes template
  versions, template roles, event plans, assignments, credentials, permissions, training modules or training
  records, people or applications.
- The readiness row `staffing_taxonomy` is always `blocked_user`, and its stage type has no "imported" value.

A production import needs, in writing: approval of the reviewed source hash and plan hash, approval of
migration 0002 on production, a change window, an operator and a reviewer, and a code change that adds a
reviewed production write path (§10). None of these exist yet.

## 9. Rollback considerations

- The apply is a single libSQL `batch(..., "write")` — atomic: all upserts land or none do.
- It is idempotent: re-applying the same file writes 0 rows ("wrote 0"); a changed file updates only the fields
  that differ (`source_hash` alone never forces an update).
- Because nothing else references `ops_canonical_roles` yet, rollback of the data is
  `DELETE FROM ops_canonical_roles WHERE source_hash = '<hash>'` (or restore the pre-import backup). Templates,
  events, assignments and training are untouched, so nothing else needs reverting.
- Rolling back migration 0002 itself is a schema change: restore from the pre-migration backup per
  `RUNBOOK_V2.md` §5 rather than dropping columns by hand.

## 10. Future production import procedure (not authorized now)

1. Confirm the final workbook export; run the dry run (§2); record `source_hash` and `plan_hash`.
2. Staff review of the plan (§6), including the open items: `runner` disposition, credential gaps,
   training gaps.
3. If the file changed: update `REVIEWED_SOURCE_SHA256` / map in a reviewed commit; tests green.
4. Written approval of: source hash, plan hash, migration 0002, change window, operator, reviewer.
5. Take a fresh production backup (`PRODUCTION_MIGRATION_CHECKLIST_V2.md`).
6. Rehearse on a copy of that backup: migrate, `--dry-run --target local` (expect insert 36), `--apply`,
   re-apply (expect wrote 0).
7. A reviewed code change adds the production write path (today it is deliberately absent); add `imported` to
   `TaxonomyStage` in the same change.
8. Run the production migration, then the approved import; verify 36 rows with the approved `source_hash`.
9. Separately, and only with its own approval: publish an After Dark template version from the vNext preview,
   apply the `guest_experience_lead` display rename, and resolve credential / training gaps.
