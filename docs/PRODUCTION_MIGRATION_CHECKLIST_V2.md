# Sanctuary Crew v2 — production migration checklist

> **NOT EXECUTED. NOT AUTHORIZED.** This checklist is preparation only. Running any step against the
> production database requires written approval from the Sanctuary administrator and an agreed change
> window. Nobody has run `0000_baseline` or `0001_v2_people_pipeline_ops` against production.

Target: the production Turso database behind `https://crew.sanctuarylv.org` (the root `.env`
`DATABASE_URL`). Details of each command are in [`RUNBOOK_V2.md`](./RUNBOOK_V2.md) §4–5.

## 0. Approvals (all required)

- [ ] Administrator approval to migrate, with named operator and reviewer
- [ ] Change window agreed (low traffic; application form can be paused)
- [ ] PR #1 reviewed and merged by the administrator, and the release build identified (SHA)
- [ ] Rollback owner named

## 1. Backup

- [ ] Fresh export **immediately** before the window, stored outside the repo:
      `turso db shell <db> .dump > pre-0001-<date>.sql` (or the read-only JSON export used for the
      precedent `/home/user/backups/turso-pre-v2-1791061708723.json`, 2026-10-03: 0 `crew_applications`,
      28 `crew_events`)
- [ ] Restore the export into a scratch local file and confirm row counts match production
- [ ] Record table list and row counts for `crew_applications`, `crew_events` (and any other table present)
- [ ] Backup is not committed, not uploaded publicly (the repo is public)

## 2. Preflight (read-only)

- [ ] `select name from sqlite_master where type='table'` — confirm only the v1 tables exist.
      **If `user`, `session`, `account` or `verification` now exist** (platform-created), stop: `0001`
      creates them and will fail. The migration must be adjusted and reviewed outside the window
- [ ] `select * from __drizzle_migrations` — confirm which migrations are recorded (expect `0000` only, or no table at all — the 2026-10-03 export captured only `crew_applications` and `crew_events`, so this is unknown)
- [ ] If `0000_baseline` is not recorded but its tables exist, decide (reviewed) how to mark the baseline
      as applied; do not let it re-create existing tables
- [ ] Duplicate-email check (v1 relied on a unique email index):
      `select email_normalized, count(*) from crew_applications group by 1 having count(*) > 1` → expect 0
- [ ] Rehearse on the fresh backup copy: `env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bash packages/web/tests/migration/check.sh <backup-copy.db>` → `PASS`
- [ ] `bunx drizzle-kit generate` against a copy of `drizzle/` reports "No schema changes" (no drift)
- [ ] Deployed environment set per RUNBOOK §7.1 (`NODE_ENV=production`, `WEBSITE_URL=https://crew.sanctuarylv.org`,
      `BETTER_AUTH_SECRET`, dedicated `CREW_TOKEN_SECRET`)

## 3. Forward migration (window)

1. [ ] Pause public submissions (or accept that writes during the window may need replay)
2. [ ] `cd packages/web && bunx drizzle-kit migrate` with the production `DATABASE_URL` in the operator shell
       (never `bun run db:migrate` from an unreviewed shell)
3. [ ] `bun scripts/backfill-v2.ts --dry-run` → review counts
4. [ ] `bun scripts/backfill-v2.ts --target=<exact host from DATABASE_URL>`
5. [ ] Optional, separately approved: `bun scripts/seed-planning.ts --target=<host>` (planning data only)

Scripts refuse remote writes without the exact `--target` (exit 2, verified).

## 4. Verification

- [ ] Table count 4 → 45 (rehearsal result), `__drizzle_migrations` shows `0001`
- [ ] Every pre-migration `crew_applications` row present with unchanged id, email, created_at, utm_*,
      referral code and consent fields (compare with the backup)
- [ ] Re-running `drizzle-kit migrate` is a no-op; re-running the backfill processes 0 rows
- [ ] `crew_outbox` rows are `held` (nothing sent to the Command Center)
- [ ] `/api/health` 200, public apply form submits, `/staff` sign-in works, `/staff/integration` readiness table reviewed

## 5. Failure behaviour and rollback

- Verified locally: when `0001` fails (e.g. a pre-existing `user` table), drizzle-kit exits non-zero and the
  whole migration rolls back — no partial tables, the v1 email index stays in place. Re-verify on Turso
  in the rehearsal; `SQLITE_BUSY`/remote transaction behaviour on Turso is **not verified**.
- **Migration failed:** stop, keep the old build running (v1 schema untouched), capture the log, review.
- **Backfill failed partway:** it is idempotent (only `person_id IS NULL` rows); fix and re-run, or restore.
- **Full rollback:** export any post-migration writes (`crew_applications`, `crew_people`, `crew_audit`),
  restore the pre-migration dump into a fresh database, repoint `DATABASE_URL`, redeploy the previous build.
- **Partial rollback (keep data, old code):** deploy the previous build; recreate `crew_applications_email_uq`
  only if the duplicate-email query returns 0 rows.

## 6. After

- [ ] Record SHA, operator, times, counts and backup location in the change log
- [ ] Keep the backup for the agreed retention period (see `LEGAL_PLACEHOLDERS_V2.md`, data retention)
