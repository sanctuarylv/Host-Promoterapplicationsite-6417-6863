# Sanctuary LV Group — Production Approval Package V3 (Phase 3)

> **NOTHING IN THIS PACKAGE IS AUTHORIZED.** It collects evidence for a human decision. Automated
> checks show the work is *ready for review*. They do not authorize anything. `production_authorized` is
> `false` in the API and on `/staff/taxonomy`, and every item in §9 is **pending**. In Phase 3 nobody migrated,
> imported to, activated a template on, pushed, merged or deployed production.

Companion documents:
- [`STAFFING_TAXONOMY_REVIEW_V3.md`](./STAFFING_TAXONOMY_REVIEW_V3.md): the six review panels in written form.
- [`STAFFING_TAXONOMY_V2.md`](./STAFFING_TAXONOMY_V2.md): the taxonomy design (Phase 2).
- [`STAFFING_IMPORT_RUNBOOK_V2.md`](./STAFFING_IMPORT_RUNBOOK_V2.md): importer commands.
- [`PRODUCTION_MIGRATION_CHECKLIST_V2.md`](./PRODUCTION_MIGRATION_CHECKLIST_V2.md): migration window checklist.

## §1 Scope

Phase 3 adds **read-only** review tooling on top of the Phase 2 taxonomy (`065013b`):

| Area | Change |
|---|---|
| Integrity | Source **and** plan hashes are checked against the Phase 2 baseline. A drifted plan sets stage `baseline_mismatch`, and every apply is refused. |
| Importer CLI | Prints `integrity source_hash / plan_hash: MATCH or MISMATCH`. `--apply` now also needs `--confirm-plan-hash=<baseline>` and refuses a non-baseline source. It still refuses any target other than a local `file:` DB. |
| Preview API | The `staffingTaxonomy.preview` read procedure adds `integrity` and `review` (role reconciliation, runner record, credential and training gaps, template comparison, separation, approval checklist). It is the router's only procedure and is limited to principals with `integration.manage`. |
| UI | `/staff/taxonomy` gains section navigation and six read-only panels. The page has no write controls. |
| Recovery | `tests/migration/recovery.sh` rehearses R1–R4 on disposable copies (§7). |
| Docs | This package and `STAFFING_TAXONOMY_REVIEW_V3.md`. The V2 runbooks and acceptance docs are updated. |

Out of scope, and unchanged in Phase 3:
- DB write routes
- production data
- template versions and activation
- the Sanctuary LV (nonprofit) Serve Team (`/serve`)
- the `runner` record and its staffing allocations
- external integrations
- push, merge and deploy

## §2 Hashes and baseline

| Item | sha256 | Status |
|---|---|---|
| Canonical source `packages/web/data/staffing/sanctuary_lv_group_36_role_canonical_v1.csv` | `36dac8e8c7eb7ac529e25cdb217dc758582e6fecc4556163b81ad0ab35cf8892` | **MATCH** with baseline |
| Dry-run plan (no target, canonical path, `generated_at` excluded) | `8c22363803999b763305dc8961dcc6b7226271c15c28829ce14aff842cfcd701` | **MATCH** with baseline |
| Migration `drizzle/0002_canonical_staffing_taxonomy.sql` | `96317d6dffbb00905b4e15c811bfc03ea7adf9bdec4fa1b84d51a6dde9678a2c` | unchanged since Phase 2 |
| Baseline commit | `065013bb7c67ec9ae200ca7617204133b9c947cb` | Phase 2 reviewed |

The constants live in `src/api/ops/staffing/role-map.ts` (`REVIEWED_SOURCE_SHA256`) and
`src/api/ops/staffing/integrity.ts` (`REVIEWED_PLAN_SHA256`).

The plan hash does not depend on the path the file was read from. It changes whenever the role map, the credential or training tables, the vNext rules or the validation change, even if the source bytes stay the same. If you change any of those, re-review the drift and update both constants in a reviewed commit.

Re-check from `packages/web`:

```
env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bun scripts/workbook-import.ts \
  --file data/staffing/sanctuary_lv_group_36_role_canonical_v1.csv --dry-run --out /tmp/plan.json
# expect: integrity source_hash: MATCH … / integrity plan_hash: MATCH …
```

## §3 What production would change (only if separately authorized)

**Migration 0002** changes the schema only:
- It creates `ops_canonical_roles` with 36 columns and the unique index `ops_canonical_roles_role_key_uq`.
- It adds 5 columns, all nullable or defaulted:
  - `ops_template_roles.canonical_role_id` (text, null)
  - `ops_template_roles.enabled` (default true)
  - `ops_template_roles.required` (default false)
  - `ops_templates.entity_id` (text, null)
  - `ops_templates.updated_at` (integer, null)
- It adds one row to `__drizzle_migrations`.
- It does not rewrite, delete or backfill any existing row.

**Import** (`--apply`) writes to `ops_canonical_roles` only: 36 inserts, each carrying `source_hash = 36dac8e8…`. It does not touch:
- templates or template roles
- assignments
- training completions
- credentials
- the `runner` record
- the Serve Team

**Ordering constraint:** the current application code reads the 0002 columns, as R4 in §7 shows. The release build and migration 0002 must therefore be deployed together, and rolled back together.

## §4 Safeguards

| Safeguard | Evidence |
|---|---|
| `--apply` without `--confirm-plan-hash`, or with the wrong value | exit 2, 0 rows written |
| `--apply --target production` or any non-`file:` URL | exit 2, 0 rows written |
| Non-baseline source | refused (`baseline_mismatch`) |
| Plan drift with an unchanged source | stage `baseline_mismatch`, and the Command Center readiness `staffing_taxonomy` detail explains why |
| Stage type | has no `imported` value. The 5 stages are `not_supplied`, `validation_failed`, `reconciliation_ready`, `baseline_mismatch` and `import_pending_approval` |
| Preview procedure | `staffingTaxonomy` has one procedure, `preview`, which is read-only. Anonymous callers get `UNAUTHORIZED`, and callers without `integration.manage` (non-staff, recruiter) get `FORBIDDEN` (integration `taxonomy.ts`). No mutation procedure exists |
| Human authorizations | typed `status: "pending"` with `authorized_by` and `authorized_at` set to `null`. The application has no code path that sets them |
| `production_authorized` | the literal `false` |
| Automated evidence vs authorization | returned as separate arrays (`automated`, `recorded` vs `human`) and shown in separate UI regions |

## §5 Test evidence (Phase 3 working tree, local only)

| Check | Command | Result |
|---|---|---|
| Typecheck | `bunx tsc -p tsconfig.{app,scripts,node}.json --noEmit` | 0 errors in each config |
| Lint | `bun run lint` (root) | 0 warnings, 0 errors |
| Unit | `DATABASE_URL=file:/tmp/crew-unit.db DATABASE_AUTH_TOKEN=local-file bun test tests/` | **105 / 105 pass** |
| Integration: authz | `env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bun tests/integration/authz.ts` | 102 / 102 |
| Integration: limits | … `limits.ts` | 23 / 23 |
| Integration: outbox | … `outbox.ts` | 69 / 69 |
| Integration: cutover | … `cutover.ts` | 21 / 21 |
| Integration: campaigns | … `campaigns.ts` | 40 / 40 |
| Integration: listing | … `listing.ts` | 25 / 25 |
| Integration: taxonomy | … `taxonomy.ts` | **46 / 46** |
| e2e: public-api | `TEST_DB=<p3 copy>` | 47 / 47 |
| e2e: auth-smoke | | 18 / 18 |
| e2e: workflow | | 51 / 51 |
| Browser: taxonomy_review (new) | `python3 tests/browser/taxonomy_review.py` | **48 / 48** |
| Browser: pathways (incl. branding regression) | | 29 / 29 |
| Browser: console_v2 | | 34 / 34 (one earlier run hit a flaky focus check, "serve: success panel focused"; it passed on 2 reruns) |
| Browser: apply_roles | | 70 / 70 |
| Browser: pipeline_ui | | 23 / 23 steps |
| Browser: operations | | 38 / 38 |
| Build | `bunx turbo build --force` | pass, main chunk 447.60 kB |
| Drift | `drizzle-kit generate` against a temporary copy config | "No schema changes" |
| Recovery | `bash tests/migration/recovery.sh …` | **PASS, 19 checks** (§7) |

New unit coverage:
- the 5-stage readiness, including `baseline_mismatch`
- the path-independent plan hash
- integrity (2 tests)
- Phase 3 review (7 tests): 36 / 66 balance, runner `null`, gap coverage, the 51 → 72 bridge, separation, checklist pending, and fail states for hash drift, stored rows, a v2 template version and unreadable versions (`not_available`)

Browser evidence (`tests/browser/taxonomy_review.py`, 48 checks):
- each of the six panels renders and is display-only (no controls), and the section nav links to all six
- checklist:
  - `data-production-authorized=false`
  - source and plan hashes are shown and match
  - 12 automated items, none failing
  - 8 recorded items in a separate list
  - 10 human authorizations, all pending and none approved
- role review: 36 rows, totals 36 / 66
- runner: `unresolved`, the decision shows "None", 4 options and none recommended
- gap rows: 9 credential, 35 training, plus the phrase index
- comparison: 51 → 72 (+21), bridge rows, a workforce split that includes `nonprofit_serve`, and preview-only
- only the read procedures (`staffingTaxonomy/preview`, `me/session`) are called
- branding regression: Group pages show Sanctuary LV Group; `/serve` stays Sanctuary LV (nonprofit)
- no page errors
- one screenshot per panel

## §6 Migration rehearsal

`env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bash packages/web/tests/migration/check.sh <copy of legacy-v1-snapshot.db>` → **PASS**:
- 46 tables after 0000–0002.
- The dry run plan hash is unchanged before and after migration.
- Apply wrote 36 rows. A re-apply wrote 0 (idempotent).
- `ops_template_roles`, assignments and training are unchanged by the import.
- All 7 legacy rows are preserved.
- The source snapshot file was unchanged (sha `965a9782…`).

## §7 Recovery procedures

Rehearsed command:

```
env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bash packages/web/tests/migration/recovery.sh \
  /home/user/sanctuary-testdb/legacy-v1-snapshot.db /home/user/sanctuary-testdb/crew-test.db
```

Result: **PASS, 19 checks.** Both source files were unchanged:
- `965a9782…` (legacy snapshot)
- `3e33af5d…` (pre-0002)

### R1: file backup and restore (VERIFIED locally)

1. Copy the database to a backup.
2. Migrate 0000–0002, backfill, seed and import 36 roles.
3. Restore by copying the backup back.

Results:
- The restored file hash equals the pre-migration backup.
- `pragma integrity_check` returns `ok`.
- The restored file has no `ops_canonical_roles`.

### R2: import rollback (VERIFIED locally)

```sql
delete from ops_canonical_roles where source_hash = '36dac8e8c7eb7ac529e25cdb217dc758582e6fecc4556163b81ad0ab35cf8892';
```

Results:
- The import touched no other table.
- After the delete, `ops_canonical_roles` has 0 rows and every other table's content and schema are byte-identical to before the import.
- A new dry run plans a fresh import.

### R3: schema rollback of 0002 (VERIFIED locally, SQLite 3.46)

Run in one transaction with `foreign_keys = off`:

```sql
delete from ops_canonical_roles where source_hash = '<reviewed source hash>';
DROP INDEX IF EXISTS `ops_canonical_roles_role_key_uq`;
DROP TABLE `ops_canonical_roles`;
ALTER TABLE `ops_template_roles` DROP COLUMN `canonical_role_id`;
ALTER TABLE `ops_template_roles` DROP COLUMN `enabled`;
ALTER TABLE `ops_template_roles` DROP COLUMN `required`;
ALTER TABLE `ops_templates` DROP COLUMN `entity_id`;
ALTER TABLE `ops_templates` DROP COLUMN `updated_at`;
delete from __drizzle_migrations where hash = '96317d6dffbb00905b4e15c811bfc03ea7adf9bdec4fa1b84d51a6dde9678a2c';
```

Results:
- The schema (columns and indexes) and every table's content equal the pre-0002 copy.
- The journal row count returns to its prior value.
- `foreign_key_check` is empty and `integrity_check` returns `ok`.
- Re-running `drizzle-kit migrate` re-applies 0002 to an identical schema.

### R4: app compatibility after a schema-only rollback (VERIFIED: it fails)

The current code reading `ops_templates` on the pre-0002 schema fails with:

```
SELECT_FAILED LibsqlError: SQLITE_ERROR: no such column: entity_id
```

**So a schema rollback requires an app rollback.** Roll back to a pre-0002 build (`ea93869`, the parent of `8647ac0` which introduced 0002, or earlier; the release owner chooses) **before or together with** R3. The preferred order is:
1. app rollback
2. R2
3. R3 if required

### UNVERIFIED rollback assumptions (must be accepted or verified before §9 `backup_restore`)

| # | Assumption | Why unverified | How to verify |
|---|---|---|---|
| U1 | A Turso / libSQL point-in-time restore or branch restore of the production DB returns the exact pre-window state | No Turso access was used in Phase 3. R1 proves only a local file copy | Restore a Turso branch from a timestamp into a scratch DB. Compare table list, row counts and `__drizzle_migrations` |
| U2 | `ALTER TABLE … DROP COLUMN` behaves on Turso as it does on SQLite 3.46 | Not run on Turso | Run R3 against a scratch Turso branch |
| U3 | Deleting the 0002 row from `__drizzle_migrations` on Turso lets `drizzle-kit migrate` re-apply 0002 | Not run on Turso | Same scratch branch: run R3, then migrate |
| U4 | The previous application build runs correctly against the rolled-back schema | R4 tested only the *current* code (and it fails as expected). The previous build was not started against a rolled-back DB | Check out the release-owner-chosen pre-0002 build, point it at an R3 copy, then smoke-test `/apply`, `/serve` and `/staff` |
| U5 | A `turso db shell .dump` export (Checklist V2 §1) restores cleanly into a fresh DB | The precedent export was read-only JSON. A full dump and restore was not rehearsed | Dump, restore into a scratch DB, compare counts |

## §8 Production blockers

1. **Backup and restore on Turso is unverified** (U1–U5). This is the `backup_restore` authorization.
2. **`runner` is unresolved.** The decision is `None`, with 4 unranked options. Its record and staffing allocations are unchanged. Choosing an option that changes the map will change the plan hash, which forces a re-baseline.
3. **Credential mappings:** 1 partial (`vip_host`) and 8 unresolved. None are granted.
4. **Training mappings:**
   - 1 mapped, 21 partial and 14 unresolved
   - 62 unresolved phrases
   - only 4 modules exist
   - nobody is marked trained
5. **Engagement classification** is `pending_classification` for all 36 roles. It needs HR / legal and is outside system authority.
6. **The After Dark vNext template is not approved.** It is preview only: v1 stays active at 51 seats, and vNext would have 72. Creating or activating a version is a separate phase.
7. **The public rename** (Guest Experience Lead → Guest Experience Manager) is prepared, not applied.
8. **Migration 0002 to production** is not authorized.
9. **The production import** is not authorized.
10. **Release:** push of the Phase 3 commit, PR #1 merge and deploy are not authorized.
11. **Deploy ordering:** the app and 0002 must ship and roll back together (§3, R4).

## §9 Sign-off (outside the application)

All ten items are **PENDING**. The application cannot record them. Sign here, or in the change record. Don't sign one item to stand in for another.

| Key | Authorization | Owner | Status | Signed by | Date |
|---|---|---|---|---|---|
| `runner_decision` | Runner classification decision | Event Director | PENDING | | |
| `credential_mappings` | Credential mappings (1 partial · 8 unresolved) | Event Operations Manager with Access Control / Credential Lead | PENDING | | |
| `training_mappings` | Training mappings (21 partial · 14 unresolved) | Training owner (Guest Experience / Event Operations) | PENDING | | |
| `engagement_classification` | Engagement classification for all 36 roles | Sanctuary LV Group leadership with HR / legal | PENDING | | |
| `vnext_template` | After Dark vNext template (51 → 72; 9 roles not enabled) | Event Director | PENDING | | |
| `public_rename` | Public apply label rename | Sanctuary LV Group leadership | PENDING | | |
| `backup_restore` | Production backup taken and recovery path accepted, including U1–U5 | Platform owner | PENDING | | |
| `production_migration` | Production migration 0002 | Platform owner | PENDING | | |
| `production_import` | Production import of 36 canonical roles | Platform owner + Event Director | PENDING | | |
| `release` | GitHub push, PR #1 merge and deployment | Repository owner | PENDING | | |

The owner shown for `runner_decision` is the `decision_owner` returned by the preview API. If that is wrong, correct it in the change record.
