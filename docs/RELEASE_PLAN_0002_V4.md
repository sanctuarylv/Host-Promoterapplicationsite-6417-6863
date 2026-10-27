# Sanctuary LV Group: Migration 0002 App / Schema Release Plan V4 (Phase 4)

**Status: PLAN ONLY. Production: NO-GO.** Every gate below is closed (`RELEASE_GATES`, `open: false`, in
`packages/web/src/api/ops/staffing/decisions.ts`). Every authorization is pending. Nothing in Phase 4
touched production: no backup, migration, import, deploy or Turso access.

| Item | Value |
|---|---|
| Migration | `drizzle/0002_canonical_staffing_taxonomy.sql`, sha256 `96317d6dffbb00905b4e15c811bfc03ea7adf9bdec4fa1b84d51a6dde9678a2c` (unchanged) |
| Release build | the Phase 4 commit on `feat/sanctuary-crew-v2-verified`, or a later reviewed commit (the release owner records the SHA) |
| Previous v2 build used for the compatibility matrix | `ea93869`, the parent of `8647ac0`, which introduced 0002 |
| Production today | v1 schema. Approval checklist V2 §4 expects 4 → 46 tables, so **0001 and 0002 are both pending** in production |

This plan supersedes the ordering constraint in Approval Package V3 §3 ("ship and roll back together") with the
evidence-based ordering in §3. Every other part of V3 still applies.

## §1 Backup (gate G1, authorization `backup_restore`)

Follow `docs/PRODUCTION_MIGRATION_CHECKLIST_V2.md` §1 as written, **immediately** before the window:

1. Take a fresh export, stored outside the repo (the repo is public): `turso db shell <db> .dump > pre-0001-0002-<date>.sql`.
2. Restore it into a scratch local file. Compare the table list, the row counts (`crew_applications`, `crew_events`
   and every other table) and `__drizzle_migrations`.
3. Record the backup location, hash, operator and time in the change record.
4. Additionally take a Turso point-in-time or branch reference, which answers U1, and note its timestamp.

G1 opens only when steps 1–4 are recorded **and** U1 and U5 (§4) are verified or explicitly accepted by the
platform owner.

## §2 Recovery procedures (rehearsed locally: `tests/migration/recovery.sh`, 19 checks PASS)

These are the same procedures as Approval Package V3 §7, summarised:

| ID | Procedure | Local result | Production status |
|---|---|---|---|
| R1 | File backup → migrate / backfill / seed / import → restore the copy | restored hash = backup, `integrity_check ok`, no `ops_canonical_roles` | Turso equivalent is U1 / U5 |
| R2 | Import rollback: `delete from ops_canonical_roles where source_hash = '36dac8e8…'` | the import touched no other table; byte-identical after the delete | not run |
| R3 | 0002 schema rollback: drop the index and table, drop 5 columns, delete the journal row (one transaction, `foreign_keys = off`) | schema and content equal the pre-0002 copy; re-migrate re-applies cleanly | U2 / U3 |
| R4 | Current build on a rolled-back (pre-0002) schema | **fails** (`no such column: entity_id`) | n/a: never run the current build on pre-0002 |

## §3 App / schema compatibility (`tests/migration/compat.sh`, 14 checks PASS)

```
env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bash packages/web/tests/migration/compat.sh \
  /home/user/sanctuary-testdb/legacy-v1-snapshot.db [previous-ref=ea93869]
```

The script runs on disposable copies in `/tmp/crew-compat-*`. The previous build runs from a throwaway git worktree, which is removed on exit. The source snapshot hash was unchanged (`965a9782…`). Evidence: `docs/evidence/phase4/compat-run1.log` and `compat-run2.log`. The second run used a de-duplicated table probe; `schema.ts` re-exports tables, so run 1 listed each table twice: 84 → 43 previous, 86 → 44 current.

| Check | Matrix cell | Result |
|---|---|---|
| C1 | previous build **writes** on post-0002 (its own backfill-v2 + seed-planning) | PASS: 36 template roles written |
| C2 | previous build **reads** every table on post-0002 | PASS: 43 / 43 |
| C3 | current build reads every table, including previous-build rows; those rows carry the 0002 defaults | PASS: 44 / 44; `enabled 1`, `required 0`, `canonical_role_id` / `entity_id` / `updated_at` null |
| C4 | previous build's `drizzle-kit migrate` on post-0002 | PASS: no-op (3 journal rows, fingerprint unchanged) |
| C5 | current importer, then previous build reads again | PASS: 36 canonical roles; previous build reads 43 / 43 |
| C6 | control: previous build on pre-0002 | PASS: 43 / 43 |
| C7 | current build on pre-0002 | **FAILS as expected**: `no such table: ops_canonical_roles`, `no such column: canonical_role_id`, `no such column: entity_id` |

**Conclusions:**
1. **Order: migrate first, then deploy.** The previous build keeps serving, reading and writing correctly on the post-0002 schema (C1, C2, C4, C5). The current build must never serve a pre-0002 schema (C7 / R4).
2. **App-only rollback restores service.** If the release build misbehaves after the deploy, redeploying the previous build is enough. The 0002 schema can stay (C2, C5). R3 is needed only if the schema itself must go, and then always **after** the app rollback.
3. An import (G4) does not break the previous build (C5), so an import never forces an app rollback. R2 removes it.

**Limits (unverified):**
- The matrix ran on local SQLite / libSQL files only, not Turso (U2, U3, U6).
- It exercised the previous build's DB layer (Drizzle reads over every table, plus its own write scripts), not its HTTP surface. §5 gives the procedure.
- For **production**, the build that serves during the window is the live **v1** application, not `ea93869`. Production also has 0001 pending, which drops the v1 global email unique index (RUNBOOK §5). v1 code on a post-0001 + 0002 schema has not been rehearsed. No v1 commit exists in local history (ACCEPTANCE_V2, baseline caveat). This is **U6**.

## §4 Unverified assumptions (must be verified or explicitly accepted before G1 / G2)

| # | Assumption | How to verify |
|---|---|---|
| U1 | A Turso point-in-time or branch restore returns the exact pre-window state | Restore a branch from a timestamp into a scratch DB; compare tables, counts and journal |
| U2 | `ALTER TABLE … DROP COLUMN` behaves on Turso as on SQLite 3.46 | Run R3 on a scratch Turso branch |
| U3 | Deleting the 0002 journal row on Turso lets `drizzle-kit migrate` re-apply 0002 | Same scratch branch: run R3, then migrate |
| U4 | The previous build serves `/apply`, `/serve` and `/staff` over HTTP on a post-0002 (and on an R3-rolled-back) schema | §5 procedure against `ea93869` |
| U5 | A `.dump` export restores cleanly into a fresh DB | Dump, restore into scratch, compare counts |
| U6 | The live v1 production app keeps working on the post-0001 + 0002 schema during the window | Obtain the deployed v1 build from the platform; run §5 against it on a migrated copy of the fresh backup |

## §5 E2E against a previous-build dev server (procedure for U4 / U6, not yet run)

Run this on local copies only. Never point it at the root `.env`.

```
# 1. disposable DB: fresh backup restore (or legacy snapshot) migrated by the CURRENT build
cp <backup-or-legacy>.db /tmp/u4.db
cd packages/web && env -u DATABASE_URL -u DATABASE_AUTH_TOKEN \
  DATABASE_URL=file:/tmp/u4.db DATABASE_AUTH_TOKEN=local-file bunx drizzle-kit migrate
# 2. previous build in a throwaway worktree, sharing node_modules (compat.sh verifies the lockfile matches)
git worktree add /tmp/wt-prev ea93869            # or the deployed v1 build for U6
ln -s "$PWD/node_modules" /tmp/wt-prev/packages/web/node_modules
cd /tmp/wt-prev/packages/web && env -u DATABASE_URL -u DATABASE_AUTH_TOKEN \
  DATABASE_URL=file:/tmp/u4.db DATABASE_AUTH_TOKEN=local-file bunx vite --port 4200
# 3. from the CURRENT tree, the previous build's own e2e + smoke suites against it
DATABASE_URL=file:/tmp/u4.db DATABASE_AUTH_TOKEN=local-file bun tests/e2e/public-api.ts
DATABASE_URL=file:/tmp/u4.db DATABASE_AUTH_TOKEN=local-file bun tests/e2e/auth-smoke.ts
#    run the previous build's copies of the suites (in /tmp/wt-prev) if they differ
# 4. repeat 1–3 on an R3-rolled-back copy (U4, second half)
# 5. git worktree remove --force /tmp/wt-prev && git worktree prune
```

Pass criteria: the previous build's own suites pass with the same counts as at that commit. `/apply` submits, `/serve` renders, and `/staff` sign-in works.

## §6 Ordered release sequence with go / no-go gates

Each step needs every listed authorization signed (Decision Register §3, Approval Package V3 §9) **and** the previous step's verification recorded. A NO-GO at any gate stops the sequence and leaves the system in the last verified state.

| Step | Gate | Action | Requires | GO when | Rollback |
|---|---|---|---|---|---|
| 0 | — | Release owner names the operator, reviewer, rollback owner, window and release SHA | `release` | the change record is complete | — |
| 1 | **G1_backup** | §1 backup + restore check; U1, U5 | `backup_restore` | counts match; U1 / U5 verified or accepted | none needed |
| 2 | **G2_migration** | Checklist V2 §2 preflight, then §3 forward migration (0001 + 0002) **while the current production build keeps serving** | `backup_restore`, `production_migration` | Checklist V2 §4 verification; `ops_canonical_roles` = 0 rows; U6 verified or accepted | migration failure: drizzle rolls back, keep serving (Checklist V2 §5); bad state: restore from G1 |
| 3 | **G3_deploy** | Deploy the release build. Push, PR #1 merge and deploy are the `release` authorization | `production_migration`, `release` | `/api/health` 200, `/apply`, `/serve`, `/staff` smoke, `/staff/taxonomy` integrity MATCH | **app-only**: redeploy the previous build (§3, conclusion 2); the schema stays |
| 4 | **G4_import** | `workbook-import.ts --apply` with both confirm hashes (the CLI currently refuses non-`file:` targets; enabling a remote target is itself a reviewed change) | `production_import`; D-RUN-001 decided | 36 rows, every other table unchanged | R2 |
| 5 | G5_template | Future phase: build an After Dark vNext template version from decided mappings. **v1 stays active until then** | `vnext_template`, `runner_decision`, `credential_mappings`, `training_mappings`; 52 decisions | — | — |
| 6 | G6_staffing_live | Engage / pay Group personnel against canonical roles | `engagement_classification`; 36 D-CLS decisions | — | — |
| 7 | G7_public_label | Public label rename | `public_rename`, `release`; D-LBL-001 | — | revert commit |
| 8 | G8_serve_patch | Apply `docs/patches/serve-success-focus.patch` (nonprofit domain, behaviour only) | `serve_focus_patch`, `release`; D-SRV-001 | — | revert commit |

Steps 5–8 do not depend on each other. Steps 7 and 8 do not depend on 0002 and can ship in any release once authorized.

**NO-GO conditions at any step:** an integrity MISMATCH, any `__drizzle_migrations` row other than the expected ones, `ops_canonical_roles` non-empty before G4, a missing signature, or an unverified U-item that has not been explicitly accepted.
