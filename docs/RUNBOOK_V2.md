# Sanctuary Crew v2 — Runbook

Operating notes for the v2 recruitment, onboarding and event-staffing build. Read with
[`COMMAND_CENTER_CONTRACT_V2.md`](./COMMAND_CENTER_CONTRACT_V2.md) and
[`ACCEPTANCE_V2.md`](./ACCEPTANCE_V2.md).

**Status:** nothing in this build is deployed. Migration `0001` has **not** been applied to
any remote database. The Command Center connection is **not** live, and cutover is disabled in code.

---

## 1. Ground rules

- The root `.env` points at the project's only remote (Turso) database. Treat it as
  production. **Never** run tests, migrations, backfills or seeds against it.
- Every test and rehearsal below uses a local libSQL file (`DATABASE_URL=file:…`).
- The operator scripts in `packages/web/scripts/` refuse to write to a non-`file:` database.
  The only override is `--target=<exact host>` (see §4.4).
- The template-managed files (`__*`), `.runable/` and the mobile and desktop scaffolds are
  untouched. The product is web only.

## 2. Local setup

```bash
bun install
cp .env.template .env        # fill local values only; never commit .env
```

Run the dev server against a **local file DB**, not the `.env` database:

```bash
DATABASE_URL=file:/abs/path/crew-test.db DATABASE_AUTH_TOKEN=local-file bun run dev
# web + API on http://localhost:4200, health at /api/health
```

To create a fresh local DB, migrate it and seed planning data:

```bash
cd packages/web
export DATABASE_URL=file:/abs/path/crew-test.db DATABASE_AUTH_TOKEN=local-file
bunx drizzle-kit migrate          # NOT `bun run db:migrate` — that script loads ../../.env (remote)
bun scripts/seed-planning.ts
```

Staff accounts are created by signing up once in the UI. Then grant a role from the
shell (see §6).

> **Build-size note.** The sandbox root `.env` sets `NODE_ENV=development`, and Vite loads it,
> so `bun run build` there produces React's development bundle (main chunk about 708 kB, plus
> the >500 kB warning). From a clean checkout without that `.env`, the same source builds
> a main chunk of about 445 kB (measured 445.56 kB vs 708.01 kB, same source, uncached
> `bunx vite build`). A shell override does **not** fix this: `vite.config.ts` runs
> `Object.assign(process.env, loadEnv(...))`, so the `.env` value replaces
> `NODE_ENV=production bun run build` (verified: still 708.01 kB). For release builds, make
> sure the build environment's `.env` does not set `NODE_ENV=development`, or remove that line.
> Also note `turbo build` caches; use `bunx turbo build --force` when comparing sizes.

## 3. Test suites

All commands run from `packages/web` unless noted.

| Suite | Command | Needs dev server | DB |
|---|---|---|---|
| Unit (`bun test`) | `DATABASE_URL=file:/tmp/crew-unit.db DATABASE_AUTH_TOKEN=local-file bun test tests/` | no | dummy file |
| Integration (each) | `env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bun tests/integration/<suite>.ts` | no | fresh `/tmp/crew-it-*` per run |
| e2e | `DATABASE_URL=file:<test db> DATABASE_AUTH_TOKEN=local-file bun tests/e2e/<suite>.ts` | yes | the dev server's DB |
| Browser (Playwright) | `python3 tests/browser/<suite>.py` | yes | the dev server's DB |
| Migration rehearsal | `env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bash tests/migration/check.sh <legacy-v1.db>` (from repo root: `packages/web/tests/migration/check.sh`) | no | copy under `/tmp/crew-migcheck-*` |

**Unit tests need `DATABASE_URL`.** `ops-math.test.ts` imports the template DB client. Without
the variable it fails with `LibsqlError: URL_INVALID: The URL 'undefined' is not in a valid
format`. Any `file:` path works; nothing is written.

**Integration suites:** `authz`, `limits`, `outbox`, `cutover`, `campaigns` and `listing`.
`harness.ts`, `pipeline.ts` and `strict-cc-mock.ts` are shared fixtures, not suites. The
harness deletes every `COMMAND_CENTER_*` and `TURSO*` variable and refuses to run against a
non-`file:` DB.

**e2e suites:** `public-api`, `auth-smoke` and `workflow`. Run `workflow.ts` with `KEEP=1` to keep its
fixtures. It prints an event-ready worker (`flow.worker+<run>@example.com`), which
`operations.py` and `pathways.py` need as `CREW_WORKER_EMAIL`.

**Browser suites** (Chrome via Playwright):

| Script | Env |
|---|---|
| `apply_roles.py` | `CREW_TEST_DB` (path of the dev server's DB file), optional `CREW_ROLES`, `CREW_SHOTS` |
| `console_v2.py` | optional `CREW_AXE_PATH`, `CREW_SHOTS` |
| `pipeline_ui.py` | optional consent-version argument (defaults to `CONSENT_VERSION` parsed from `contract.ts`), `CREW_SHOTS` |
| `operations.py` | `CREW_WORKER_EMAIL` (required), `CREW_AXE_PATH` (required), `CREW_SHOTS` (default `/tmp/shots/ops`) |
| `pathways.py` | optional `CREW_WORKER_EMAIL` (portal check is skipped without it) |

Every browser script refuses a non-localhost `CREW_BASE` and exits 1 on any failure.
`axe.min.js` (axe-core 4.x) is not committed; download it and point `CREW_AXE_PATH` at it.

**Throttles during test runs.** Sign-in is limited to 10 attempts per email per 15 min. Better Auth's
own sign-in rule was observed to throttle at about 3 requests per 10 s from one client. Leave about
10–15 s between browser and e2e runs, or you will see 429s that are not product failures.

**Local file DB and concurrency.** A local libSQL file has no busy timeout. Many *distinct*
applications submitted in parallel can hit `SQLITE_BUSY`. The API fails safe: it returns 500 with "We
couldn't save your application. Please try again." and nothing partial is stored. Same-email races are
handled correctly (`public-api`: 5 concurrent → exactly 1 application and 1 person). Remote libSQL
(Turso) serializes writes server-side. That behaviour is **not verified** here because no remote test
DB is authorized.

**Local-only helpers not in the repo:** `/home/user/tests/v2/{console.py, apply_flow.py,
inspect-mobile.py}` were exploratory scripts. Their checks are superseded by the committed browser
suites.

## 4. Migration, backfill and seed

### 4.1 Migrations

| File | What it does |
|---|---|
| `drizzle/0000_baseline.sql` | Snapshot of the v1 schema (`crew_applications`, `crew_events`), already present in v1 databases |
| `drizzle/0001_v2_people_pipeline_ops.sql` | Additive. Creates 41 tables (people, opportunities, pipeline, terms and offers, training, org, templates, events, assignments, credentials, attendance, promoters, campaigns, outbox, audit, rate limits, auth) and runs 14 `ALTER TABLE … ADD COLUMN` on `crew_applications`. The **only** destructive statement is `DROP INDEX crew_applications_email_uq`, which runs *after* its replacement (person, opportunity) unique index is created. |

There is no `0002`. No column or table is dropped, and no v1 value is rewritten by the migration.

The 41 tables include the Better Auth tables (`user`, `session`, `account`, `verification`). The
pre-v2 backup (§5) shows they did not exist in the remote DB on 2026-10-03. **Re-check right before
migrating.** If the platform has created them since, `0001` fails at that `CREATE TABLE` and the
migration must be adjusted and reviewed. Do not edit around it in a change window.

### 4.2 Rehearse on a copy (required before any real run)

```bash
env -u DATABASE_URL -u DATABASE_AUTH_TOKEN \
  bash packages/web/tests/migration/check.sh /abs/path/legacy-v1-copy.db
```

The script copies the DB to `/tmp/crew-migcheck-*` and checks the following:

1. Migrate. Verify a second migrate is a no-op.
2. `backfill-v2.ts --dry-run` writes nothing.
3. The backfill apply runs, and a re-apply processes 0 rows.
4. `seed-planning.ts` run twice is idempotent.
5. Every legacy row is preserved field-by-field, including email, `utm_*`, referral code, consent version and `created_at`.

Last result on the 7-row v1 snapshot: **PASS**.

| Check | Result |
|---|---|
| Tables | 4 → 45 |
| Backfill | 7 processed: `crew_people` 7, `crew_outbox` 7 (held), `crew_audit` 7 |
| Re-apply | 0 processed |
| Seed | `ops_events` 1, `ops_templates` 1 |
| Legacy rows | 7 preserved, 0 changed fields |

### 4.3 Backfill semantics (`scripts/backfill-v2.ts`)

The backfill only touches legacy applications (`person_id IS NULL`). For each one it does the following:

- Find or create a `crew_people` row by normalized email. Phone is never a merge key. A phone
  number shared across different emails sets `phone_shared` on both people for review.
- Map the v1 status through `LEGACY_STATUS_MAP`. The original value is kept in `legacy_status`,
  and `active` and `orientation` get a review flag.
- Sanitize attribution with the same allow-list the public form uses. Dropped key *names* are
  audited; values are not.
- Enqueue a **held** `application.create` outbox row. Nothing is sent.
- Write a `crew_audit` row (actor `cli:backfill-v2`).

### 4.4 Production run (NOT authorized yet)

A run against the remote DB needs an approved change window. In order:

1. Take a fresh backup (§5) and confirm it reloads.
2. Rehearse on a copy of that backup with `check.sh`.
3. `bunx drizzle-kit migrate` with the remote `DATABASE_URL` (operator shell, change window).
4. `bun scripts/backfill-v2.ts --dry-run`, then review the report.
5. `bun scripts/backfill-v2.ts --target=<exact host from DATABASE_URL>`.
6. Optionally `bun scripts/seed-planning.ts --target=<host>`. It seeds planning data only: no
   workers, no approved pay, no venue booking.

`--target` must match the host parsed from `DATABASE_URL` exactly. Otherwise the scripts exit 2
without writing.

## 5. Backups and rollback

- **Existing backup:** `/home/user/backups/turso-pre-v2-1791061708723.json` is a read-only export
  taken on 2026-10-03T21:08Z, holding 0 `crew_applications` and 28 `crew_events` plus schema and indexes. It is
  outside the repo and must not be committed.
- **Before any real migration,** take a new export: `turso db shell <db> .dump > pre-0001.sql`, or the
  read-only JSON export used above. Store it outside the repo.
- **Rollback is restore-based.** `0001` is additive, so v1 code keeps working against a migrated DB
  with one exception: v1 relied on the global unique index on email that `0001` drops. Duplicate
  emails across opportunities are a v2 feature.
- **Full rollback:** restore the pre-migration dump into a fresh database and repoint
  `DATABASE_URL`. Writes made after the migration are lost unless exported first. Export
  `crew_applications`, `crew_people` and `crew_audit` before restoring.
- **Partial rollback without restore** (keep data, return to v1 code): deploy the previous build.
  Recreate `crew_applications_email_uq` only if no duplicate emails exist. Check with
  `SELECT email_normalized, count(*) FROM crew_applications GROUP BY 1 HAVING count(*) > 1`.

## 6. Staff bootstrap and access

There is no public bootstrap. The first admin is granted from the server shell after that
person has signed in once:

```bash
cd packages/web
bun scripts/grant-staff.ts --list
bun scripts/grant-staff.ts --email=person@org --role=admin --operator="Your name"
bun scripts/grant-staff.ts --email=lead@org --role=department_lead --department=guest_experience [--event=<id>] --operator=…
bun scripts/grant-staff.ts --revoke=<membership id> --operator=…
```

- **Roles:** `admin`, `recruiter`, `department_lead`, `event_director`, `promotion_lead`,
  `compensation_approver`, `serve_coordinator`. `recruiter` is org-wide and cannot be pinned to an event.
  `department_lead` requires a department.
- **Separation of duties:** whoever drafts terms cannot approve them, and `admin` cannot approve
  compensation terms. Only the applicant accepts an offer, from their portal. The sole admin
  cannot revoke themselves, and concurrent mutual admin revokes never leave zero admins.
- **Worker linking is explicit.** Staff issue a one-time link code, shown once, and the applicant
  enters it in `/portal`. Accounts are never linked by matching email.
- **Legacy `/crew/admin`:** `CREW_LEGACY_ADMIN_MODE=readonly` gives list and CSV export only, behind the shared key.
  `disabled` turns it off. Move to `disabled` once staff use `/staff`.

## 7. Secrets and configuration

All keys are documented in `.env.template`, with blank secrets.

- **`CREW_TOKEN_SECRET`** signs credential tokens, link codes and guest keys. It falls back to
  `BETTER_AUTH_SECRET`. **It must stay stable.** Rotating it invalidates every issued credential,
  link code and guest key. If rotation is required, plan to re-issue credentials and links.
- **`CREW_SUBMISSION_MODE=local`** stores applications and holds them in the outbox. `forward` is
  accepted by config but the canonical adapter is not implemented, so forwarding and cutover stay
  blocked in-app.
- **`COMMAND_CENTER_*`** describes a *proposed* contract. No production endpoint is known, so leave these blank.
- **`VITE_SANCTUARY_PUBLIC_URL`** is the origin used in campaign tracked links (falls back to
  `WEBSITE_URL`). The official domain is not confirmed.

## 8. Proxy trust and rate limits

`CREW_TRUSTED_PROXY` names the only client-IP header the edge guarantees:

| Mode | Trusted source |
|---|---|
| `none` (default) | nothing. Every request shares one bucket per route, with a higher shared ceiling |
| `cloudflare` | `cf-connecting-ip` |
| `x-real-ip` | `x-real-ip` set by our own reverse proxy |
| `xff:N` | the N-th entry from the right of `x-forwarded-for` (N = proxies we operate) |

Malformed header values are treated as untrusted. **The Runable edge header contract is unverified**,
so keep `none` until it is confirmed.

Application limits are DB-backed and shared across instances:

| Bucket | Per client | Shared ceiling when untrusted | Window |
|---|---|---|---|
| `crew.submit` | 5 | 60 | 10 min |
| `crew.serveInterest` | 5 | 60 | 10 min |
| `crew.track` | 120 | 1200 | 1 min |
| legacy admin | 60 | 300 | 1 min |
| worker link-code redeem | 10 per user | — | 15 min |
| password sign-in | 10 per **email** (independent of IP) | — | 15 min |

Better Auth: global 30 per 60 s. Without a trusted IP header the ceiling is ×20, because all clients
share one bucket. `/get-session` is exempt: limiting it signed real users out.

**Review note:** `trustedOrigins` in `src/api/auth.ts` reflects the request's `Origin` header.
This matches the managed-auth template the platform ships, but it means CSRF protection relies on
bearer tokens and same-site cookies rather than an origin allow-list. Pin it to the official origins
once the domain is confirmed.

## 9. Command Center and cutover

- The integration console (`/staff/integration`) shows the mode (`local` / `connected` / `degraded`), the
  outbox (with cursor pagination), a reconciliation **dry-run**, and recorded round trips.
- Outbox processing classifies errors (network, timeout, server, rate_limited, rejected, auth,
  conflict, malformed). Backoff is bounded (30 s base ±20 %, capped at 6 h; `Retry-After` capped at 1 h).
  Only a strictly valid receipt is stored, and an idempotent 409 is accepted only when its hash matches.
- **A round trip can only be recorded for a receipt from the endpoint that issued it.** The audit binds
  each receipt to an endpoint fingerprint.
- **Cutover is disabled in this build.** The server refuses it and the UI does not offer it. Enabling it
  needs the real contract, a test environment, test identities, and a recorded round trip there.

## 10. External dependencies (blocking)

| Dependency | Blocks |
|---|---|
| Real Command Center contract and an authorized test environment | live sync, round-trip verification, cutover |
| Live ticketing integration | real guest registration and admission data (fixtures only today) |
| 36-role staffing workbook | detailed role import. Only the 51-slot planning counts are seeded |
| Managed Google sign-in verification on the deployed domain | Google sign-in sign-off (email + password verified locally) |
| Trusted edge client-IP header contract | moving `CREW_TRUSTED_PROXY` off `none` |
| Official domain, privacy policy URL, social URLs, brand assets | `VITE_SITE_URL`, `VITE_SANCTUARY_*`, og tags, pinned `trustedOrigins` |
