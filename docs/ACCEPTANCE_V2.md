# Sanctuary Crew v2: acceptance report

This report covers the 16 required verification items from the v2 brief (§12, "Persistence, migration and acceptance"). Every result below comes from a real command run in this sandbox against **local databases only**. Nothing here was run against the production Turso database. Nothing is **deployed**, nothing is **connected** to the Command Center, and no migration has been applied to production.

## Status key

| Status | Meaning |
|---|---|
| **Implemented** | Code exists in this branch. |
| **Tested** | A local automated check exercised it and passed (command and result given). |
| **Externally blocked** | Cannot be verified without an input or environment Sanctuary has not supplied yet. |
| **Deployed** | Running in production. **No item has this status.** |

## Process notes (read first)

- **Skipped plan approval.** The first build round skipped the plan-approval checkpoint, because the brief said "Build the working application". The verification and PR round that followed used a written plan (`plan.md`), and the user approved it before any edits, test writes or GitHub actions.
- **Baseline caveat.** The local git history has only two platform auto-commits (`6801217` and `8e7cffc`, both "Update from Runable"). The root commit already contains most of the v2 code, so no true pre-v2 (v1) commit exists to measure against. The "baseline" in item 1 is therefore HEAD `8e7cffc`, measured in a scratch worktree before this round's changes. For legacy *data* preservation, a separate 7-row v1 snapshot DB was used (see item 3).
- **External inputs.** Everything that depends on them is marked blocked. Nothing was faked to pass.

## Summary

| # | Item | Implemented | Tested | Externally blocked | Deployed |
|---|---|---|---|---|---|
| 1 | Baseline build/typecheck recorded | yes | yes | — | no |
| 2 | Paid Group vs nonprofit separation | yes | yes | Approved legal URLs/copy (placeholders in place) | no |
| 3 | Applications, referral links, consent survive migration | yes | yes (local rehearsal) | Production migration not run | no |
| 4 | Real submission persists; duplicate/concurrent identity | yes | yes | Remote Turso concurrency | no |
| 5 | Malformed / unrelated 409 never mark synced | yes | yes (mock CC) | Real CC contract | no |
| 6 | Idempotent retry, backoff, canonical receipt, reconciliation | yes | yes (mock CC) | Real CC round trip | no |
| 7 | Staff login, explicit linkage, own-only, cross-scope denial | yes | yes | Managed Google sign-in | no |
| 8 | Pipeline persistence, revision-safe decisions, audit | yes | yes | — | no |
| 9 | Terms/training gate readiness; cancel revokes credentials | yes | yes | — | no |
| 10 | 51 slots / 30 core; unknown venue visible; no double count | yes | yes | 36-role staffing workbook | no |
| 11 | Reporting cycles, overlaps, overnight, DST | yes | yes | — | no |
| 12 | Repeat staff/guest scans; promoter re-entry exclusion | yes | yes | Live ticketing | no |
| 13 | Campaign metric scope, spend, denominators; demo separation | yes | yes | — | no |
| 14 | Pagination, CSV, privacy, rate-limit boundary | yes | yes | Trusted edge client-IP header | no |
| 15 | Keyboard, mobile, errors, print call sheet, navigation | yes | yes | — | no |
| 16 | Production build + regressions; CC round trip | yes (build) | yes (build, suites) | **CC round trip (connection not claimed)** | no |

## Commands and results (production-readiness pass, 2026-10-05)

All suite commands run from `packages/web` unless marked *root*. The dev server for e2e and browser suites ran on `:4200` against `file:/home/user/sanctuary-testdb/crew-test.db`. The exact invocations are in `docs/RUNBOOK_V2.md` §3.

| Check | Command | Result |
|---|---|---|
| Lint *(root)* | `bun run lint` | 0 warnings, 0 errors |
| Build *(root)* | `bun run build` / `bunx turbo build --force` | pass (see the bundle note below) |
| Typecheck | `bunx tsc --noEmit -p tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.scripts.json` | 0 errors each |
| Unit | `DATABASE_URL=file:/tmp/crew-unit.db DATABASE_AUTH_TOKEN=local-file bun test tests/` | 53/53 (5 files, incl. `production.test.ts` 15, `workbook.test.ts` 5) |
| Integration | `env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bun tests/integration/<suite>.ts` | `authz` 102/102, `limits` 23/23, `outbox` 69/69, `cutover` 21/21, `campaigns` 40/40, `listing` 25/25 |
| e2e | `bun tests/e2e/<suite>.ts` (local file DB) | `public-api` 47/47, `auth-smoke` 18/18, `workflow` (`KEEP=1`) 51/51 |
| Browser | `python3 tests/browser/<suite>.py` | `console_v2` 34/34, `apply_roles` 70/70, `pipeline_ui` 23/23, `operations` 38/38, `pathways` 29/29 (with `CREW_WORKER_EMAIL`) |
| Migration rehearsal | `bash tests/migration/check.sh legacy-v1-snapshot.db` | PASS: tables 4→45, legacy rows 7 preserved, 0 fields changed, second migrate no-op, backfill and seed idempotent |
| Migration failure | `0001` on a copy with a pre-existing `user` table | exit 1, full rollback: no partial tables, `crew_applications_email_uq` intact, 7 rows intact |
| Remote-write guard | `backfill-v2.ts` / `seed-planning.ts` with a `libsql://` URL, no `--target` | exit 2, nothing written |
| Secret scan | `.env` secret values vs tree + full history; token patterns vs diff | 0 secret hits (only the public `APPLICATION_ID` in platform-managed `packages/mobile/app.json`); no `.env*` tracked |
| Diff hygiene | `git diff --check` | clean |
| Schema drift | `drizzle-kit generate` into a scratch copy of `drizzle/` | "No schema changes, nothing to migrate" |

**Bundle note.** Fixed in code this pass: `vite build` now forces `NODE_ENV=production` even though the root `.env` says `development` (it also neutralises Vite's `VITE_USER_NODE_ENV` promotion). `bunx turbo build --force` with the development `.env`: main chunk **447.42 kB** (gzip 148.94 kB, was 710 kB), CSS 63.60 kB, 30 JS chunks, largest route chunks event-detail 61 kB / portal 60 kB / apply 48 kB, **no >500 kB warning**. The runtime still reads `NODE_ENV`, so the deployed `.env` must set `production` (see below).

**Known limitation found by testing.** Parallel distinct-email submissions against a *local file* SQLite DB can hit `SQLITE_BUSY`. This fails safe: a 500 with "We couldn't save your application. Please try again." and no partial row. Remote Turso behaviour under the same load is unverified.

---

## Item-by-item evidence

### 1. Baseline build/typecheck and existing behaviour: implemented, tested
- **Measured at HEAD `8e7cffc`** in a scratch worktree, before this round's edits:
  - lint found **4 pre-existing errors**, all `jsx-a11y(no-noninteractive-tabindex)`, at `staff/campaign-detail.tsx:110`, `:379` and `staff/integration.tsx:146`, `:188`;
  - `tsc` (app, node) found 0 errors;
  - the build passed, with a 445.53 kB main chunk.
- **All 4 lint errors are fixed.** Lint is now clean.
- The template's `typecheck`/`build` scripts did not type-check scripts. `tsconfig.scripts.json` is now run explicitly.
- Caveat: this is not a v1 baseline (see "Process notes").

### 2. Paid Group vs nonprofit separation: implemented, tested
- **`tests/browser/pathways.py` (25/25)** checks:
  - landing ("operated by Sanctuary LV Group", candidate-interest status, no pay-rate claims);
  - the `#pathways` card linking `/serve` as unpaid and separate;
  - the FAQ volunteer and paid answers;
  - `/serve` eyebrow and title ("Sanctuary LV nonprofit · unpaid");
  - `/sign-in` links to both pathways;
  - `/portal` naming both entities;
  - `/staff/terms` scoped to the Group.
- `apply_roles.py` (70/70) checks that the application's confirm step names the paid operator.
- `public-api`: "serve with paid consent version -> 412" (the consent streams can't be crossed).
- **Blocked:** official brand assets, privacy policy and domain have not been supplied. The copy is the current working text.

### 3. Existing applications, referral links and consent survive migration: implemented, tested locally
- **`tests/migration/check.sh`** runs against a disposable copy of the 7-row v1 snapshot (`legacy-v1-snapshot.db`) and steps through: migrate, backfill dry run, backfill apply, re-apply, seed ×2.
- It compares `id, email, created_at, utm_*, referral_code_used, consent_version, required_consent_at, consent_at` before and after. Result: **7 preserved, 0 changed fields**.
  - The backfill re-apply touched 0 rows; the second seed changed nothing.
- **Referral links:** `pathways.py` checks that:
  - `/r/LEG123?utm_source=flyer` redirects to `/crew?ref=LEG123` with the other params kept;
  - `referralCode=LEG123` is stored as last touch (sessionStorage) and first touch (localStorage, with expiry);
  - the code persists into `/crew/apply`;
  - an invalid code (`/r/<script>`) is not stored.
- **Consent provenance:** `public-api` checks "consent_version stored", "missing consentVersion -> 412", "stale consent -> 412 PRECONDITION_FAILED" and "stale consent not stored". `contracts.test.ts` checks that first-touch retains UTM provenance while dropping private keys.
- **Production DB:** a read-only backup export exists (`turso-pre-v2-1791061708723.json`, 2026-10-03T21:08Z): 0 `crew_applications`, 28 `crew_events`, plus schema and indexes.
- **Not run:** the production migration. It needs review and an explicit go-ahead (`RUNBOOK_V2.md` §4).

### 4. Real submission persists; duplicate/concurrent identity: implemented, tested
- `public-api` (47/47) covers:
  - "row persisted" and reload;
  - "duplicate email -> 200, same shape", "duplicate did not create a row", "duplicate_attempts incremented";
  - "5 concurrent same-email -> all 200 / exactly 1 application / exactly 1 person";
  - "same phone -> 2 separate people" with "both flagged phone_shared" (shared phones are flagged, never merged);
  - "serve duplicate -> still 1 row".
- `apply_roles.py` covers the real UI submit and success state for every role.
- See the SQLITE_BUSY note above.

### 5. Malformed responses and unrelated 409s never mark sync successful: implemented, tested (mock)
- `contracts.test.ts`: "malformed JSON and 204 do not synchronize", "unrelated 409 and mismatched replay hash fail", "verified idempotent 409 succeeds".
- `outbox` (69/69): "3 classified malformed", "3 no receipt stored", "4 non-replay 409 → dead", "4 receipt hash mismatch → dead (non-retryable)", "4 wrong submission_id → malformed".
- **Blocked:** these run against a strict mock of the *proposed* contract (`strict-cc-mock.ts`, `docs/COMMAND_CENTER_CONTRACT_V2.md`), not the real Command Center.

### 6. Idempotent retry, backoff, canonical receipt, reconciliation: implemented, tested (mock)
- `outbox`:
  - "3 backoff scheduled ≥ 24s (30s ±20%)", "5 backoff capped at 6h", "5 Retry-After capped at 1h";
  - "6 canonical is the FIRST receipt for the key (no duplicate)", "2 replay keeps original canonical id";
  - "7 exactly one of 12 concurrent claims wins", "8 three overlapping drains: 3 real sends for 3 rows";
  - "9 stale worker reports lost_claim" / "application mirror not overwritten".
- `cutover` (21/21): "synced audit binds receipt to issuing endpoint", "receipt id not matching the audited receipt is refused", "14 dry run is read-only + flags canonical unavailable", "recordCutover with a valid fingerprint → PRECONDITION_FAILED". Cutover is disabled in this build.
- `console_v2.py`: the integration page reports "Cutover is disabled in this build".
- **Blocked:** a real round trip needs the Command Center contract, a test environment and test identities.

### 7. Staff login, explicit worker linkage, own-only access, cross-scope denial: implemented, tested
- `auth-smoke` (13/13) covers bearer sign-in for admin and a non-staff worker, anonymous and bogus-token denial, and staff-only routes refusing a worker. `authz` covers sign-in throttling ("correct password also throttled in window").
- `authz` (100/100) covers:
  - "anonymous staff route -> UNAUTHORIZED", "recruiter cannot grant staff";
  - "staff account without person link: worker.credential -> FORBIDDEN" (linkage is explicit);
  - "W2 overview lists only own applications / own offers";
  - department-lead scoping ("call sheet excludes other departments", "coverage limited to own department", "cannot propose other department");
  - "revoked recruiter loses access immediately", "sole admin cannot revoke self", "mutual admin revoke race: never zero admins".
- `pipeline_ui.py` covers the portal after explicit linking (screenshot `pipeline-portal-linked.jpg`).
- **Blocked:** verifying managed Google sign-in on the real domain.

### 8. Pipeline persistence, revision-safe decisions, offer acceptance, audit: implemented, tested
- `workflow` (51/51) walks applicant → screen → scorecard → selected → offer → accept → assignment, with the precondition checks: "screen_invited w/o interview", "selected w/o scorecard", "offer with unapproved terms", "expired offer", "respond to cancelled offer", "accept after decline", each → PRECONDITION_FAILED.
- `workflow`: "stale revision -> CONFLICT", "drafter cannot approve own terms". `authz`: "stale offer revision -> CONFLICT", "parallel double-accept: exactly one succeeds".
- `pipeline_ui.py` (23/23) covers the timeline and audit rendering (screenshot `pipeline-applicant-after.jpg`).

### 9. Missing terms/training blocks readiness; cancellation revokes credentials: implemented, tested
- `workflow`: credential issue is refused with PRECONDITION_FAILED "before date confirmed", "before staff training verification", "without supervisor" and "with venue/training/supervisor missing".
- Cancelling sets `credentialsRevoked=1`. "verify after cancel -> revoked", "cancelled credential verifies as revoked", "revoked_reason".
- `operations.py` shows an event-ready worker (screenshot `ops-worker-ready.jpg`).

### 10. Headcounts reconcile to 51 / 30; unknown venue numbers; no double count: implemented, tested
- `scripts/seed-planning.ts` refuses to seed unless template math gives **51 Sanctuary-side slots and 30 core**. `check.sh` runs it twice successfully.
- The local test DB has 30 core + 8 talent + 5 care + 6 promoter + 2 founder = 51. The **7 venue rows have 4 unknown (null)** counts, shown as unknown, never 0.
- `ops-math.test.ts`: "provider fulfillment replaces demand, unknown is not zero", "slots separate venue allowances and unknowns", "peak concurrent uses half-open intervals, not sum of slots".
- **Blocked:** the 36-role staffing workbook was never supplied and is not imported. Seed data is planning-only and labelled "Planning seed".

### 11. Reporting cycles, incompatible shifts, overnight, DST: implemented, tested
- `ops-math.test.ts`:
  - "self and indirect cycles rejected; unrelated branch allowed";
  - "overnight LA milestones persist chronological UTC";
  - "spring-forward nonexistent time rejected";
  - "fall-back ambiguous time requires explicit earlier/later";
  - "invalid clocks and incompatible overlaps".
- `workflow`: "overlapping shift -> CONFLICT".

### 12. Repeat staff/guest scans; promoter re-entry exclusions: implemented, tested
- Staff attendance (`authz`, `ops-math`):
  - "repeat scan -> already_checked_in", "repeat scan appended nothing";
  - "hours after concurrent scans = checkout - FIRST check-in (125 min)";
  - "void preserves original log while excluding entry", "missing checkout and double check-in flagged".
- Guest admission is tested separately:
  - "8 concurrent guest scans: exactly 1 admitted", "8 concurrent guest scans: 7 re-entries";
  - "scan of other event's registration -> NOT_FOUND".
- Promoter attribution:
  - "register with code -> attributed", "same guest again (any case): first registration wins";
  - "revoked link -> unattributed", "link not yet in effect -> unattributed", "event A code at event B -> unattributed", "unknown code -> unattributed";
  - "aggregates: unique admitted counted once", "aggregates: re-entries separate", "aggregates expose no guest identities", "registration stores no raw email";
  - "aggregates: labelled as fixture data".
- Results are evidence only; there are no automatic payouts.
- **Blocked:** live ticketing integration.

### 13. Campaign metrics scope, spend, denominators; demo data separate: implemented, tested
- `campaigns` (40/40):
  - role and date scope, with "date scope label carries timezone" and "every stage shares the scope denominator";
  - "empty scope rates show no fake 0% denominators";
  - "one of two lines recorded → partial", with no cost per outcome;
  - "role scope → spend not allocated, cost hidden";
  - "zero applicants with complete spend → cost undefined, not $0";
  - "event-ready not inferred";
  - department-lead and anonymous denial.
- `console_v2.py` (31/31) covers the UI scope labels, the inverted-range error and clear filters (screenshot `v2-console-campaign-scope.jpg`).
- **Demo separation:** seeded campaigns and events carry `is_planning_seed`. This round added a **"Planning seed" tag** on the campaign list and detail ("planning seed, not live results"); events already had one. `console_v2.py` asserts that the seed is labelled and non-seed campaigns are not. Promoter aggregates in fixtures are labelled as fixture data.

### 14. Pagination, CSV protections, privacy sanitization, rate-limit boundary: implemented, tested
- `listing` (25/25):
  - keyset pagination (3 pages of 5 over 12 rows), "walk has no duplicates (same-second id tie-break)";
  - an exact-fit page returns a null cursor;
  - "undecodable cursor falls back to first page (no error, no leak)";
  - role filter totals, search, LIKE-wildcard stripping, `limit`/`q` bounds;
  - anon and non-staff denial.
- `contracts.test.ts`: "formula payloads neutralized; pure E.164 preserved", "analytics removes arbitrary PII and strips query strings".
- `limits` (23/23):
  - "over limit inside window", "window resets after expiry", "counts are unique 1..N (atomic UPSERT)";
  - proxy modes: "cloudflare: XFF alone not trusted", "xff:2 with too few hops -> untrusted", "malformed value -> untrusted".
- **Blocked:** which client-IP header the production edge actually sets. The default is untrusted, and `RUNBOOK_V2.md` §8 explains how to set it.

### 15. Keyboard, mobile, error states, print call sheet, navigation: implemented, tested
- `pipeline_ui.py` covers keyboard tab order.
- `console_v2.py` covers the `/serve` error summary, focus on the first invalid field and a focused success panel.
- `operations.py` (37/37) covers:
  - mobile overflow at 390 px;
  - the session-error and retry state;
  - a **real print PDF** with background graphics on, rasterized with `pdftoppm`: mean luminance > 230, with "CALL SHEET" and "Milestones" present.
- axe-core runs on the staff, serve, campaign and integration pages, with no violations.
- **Bug fixed this round:** the printed call sheet was unreadable (dark-on-black, mean luminance 13) when background graphics were on. The fix is a `@media print` light colour scheme with a white page in `styles.css`. Luminance is now 252. Screenshot: `ops-call-sheet-print.jpg`.

### 16. Production build and regressions pass; CC round trip: build and suites tested, round trip externally blocked
- Build, lint, three `tsc` configs and every suite listed above pass.
- **Blocked, and not claimed:** a Command Center round trip with real test identities in an authorized test environment. The app reports itself as *not connected* (local system of record + outbox; cutover disabled).

---

## Routes

**Web (`src/web/app.tsx`):**
- `/` and `/crew` (landing)
- `/crew/apply` (nine-step application)
- `/serve` (nonprofit Serve Team)
- `/r/:code` (short referral → `/crew?ref=`)
- `/sign-in`
- `/portal` (worker portal, protected)
- `/staff/*` (console)
- `/crew/admin` (legacy, read-only)

**Staff console (`pages/staff/router.tsx`):**
- `/staff`
- `/staff/applicants` and `/staff/applicants/:id`
- `/staff/terms`
- `/staff/events`, `/staff/events/:id` and `/staff/events/:id/call-sheet`
- `/staff/campaigns` and `/staff/campaigns/:id`
- `/staff/integration`
- `/staff/serve`
- `/staff/access`

**API:**
- oRPC router (`src/api/index.ts`): `ping`, `crew`, `crewAdmin`, `recruiting`, `terms`, `offers`, `training`, `org`, `templates`, `events`, `assignments`, `credentials`, `attendance`, `promoters`, `me`, `worker`, `campaigns`, `integration`, `staff`, `serveTeam`.
- Better Auth: `/api/auth/*`.

## Migrations
- `drizzle/0000_baseline.sql`: the existing v1 schema, unchanged.
- `drizzle/0001_v2_people_pipeline_ops.sql`: additive. It creates 41 tables, including Better Auth's `user`, `session`, `account` and `verification`; re-check that these don't already exist remotely. It also runs 14 `ALTER TABLE crew_applications ADD COLUMN`.
  - The only destructive statement is `DROP INDEX crew_applications_email_uq`. It runs after the replacement unique indexes `crew_applications_email_opp_uq` / `_person_opp_uq` are created.
- There is no `0002`. The schema-drift check confirms that the schema matches `0001`.
- **Neither is applied to production.** See `RUNBOOK_V2.md` §4–5 for the procedure, backups and rollback.

## Files changed in this round (relative to HEAD `8e7cffc`)
- **API:**
  - `src/api/auth.ts`
  - `src/api/crew/{contract,integration,outbox,rate-limit}.ts`
  - `src/api/crew/campaign-metrics.ts` (new)
  - `src/api/database/schema.ts` (comment only)
  - `src/api/ops/attendance.ts`
  - `src/api/routes/{campaigns,credentials,events,integration,terms,worker}.ts`
  - `src/api/shared/permissions.ts`
- **Web:**
  - `src/web/components/console/ui.tsx`
  - `src/web/pages/apply.tsx`
  - `src/web/pages/staff/{access,campaigns,campaign-detail,event-detail,integration}.tsx`
  - `src/web/queries/campaigns.ts`
  - `src/web/styles.css`
- **Scripts (new):** `scripts/{backfill-v2,grant-staff,guard,seed-planning}.ts`
- **Tests:**
  - `tests/contracts.test.ts`
  - new: `tests/integration/*` (`harness`, `pipeline`, `strict-cc-mock` fixtures, plus `authz`, `limits`, `outbox`, `cutover`, `campaigns`, `listing`)
  - new: `tests/browser/{console_v2,apply_roles,operations,pipeline_ui,pathways}.py`
  - new: `tests/migration/check.sh`
- **Root:**
  - `.gitignore`, `.env.template`
  - `docs/COMMAND_CENTER_INTEGRATION.md`
  - new: `docs/COMMAND_CENTER_CONTRACT_V2.md`, `docs/RUNBOOK_V2.md`, `docs/ACCEPTANCE_V2.md`, `docs/evidence/screenshots/*`
  - `task.md`, `design.md`

## Screenshot index (`docs/evidence/screenshots/`, fixture data only)

| File | Shows | Item |
|---|---|---|
| `v2-apply-success.jpg` | Application success state | 4 |
| `v2-console-serve-success-mobile.jpg` | `/serve` success, 390 px | 2, 15 |
| `v2-console-campaign-scope.jpg` | Campaign metrics with role/date scope | 13 |
| `pipeline-applicant-after.jpg` | Applicant detail with decision timeline | 8 |
| `pipeline-portal-linked.jpg` | Worker portal after explicit linking | 7 |
| `ops-event-after.jpg` | Event staffing / coverage | 10 |
| `ops-campaign-after.jpg` | Campaign workspace | 13 |
| `ops-worker-ready.jpg` | Event-ready worker with credential | 9 |
| `ops-call-sheet-print.jpg` | Rendered print PDF of the call sheet | 15 |

## Remaining external blockers
1. The real Command Center contract, a test environment and test identities (items 5, 6, 16).
2. Live ticketing (item 12).
3. The 36-role staffing workbook; not imported (item 10).
4. Managed Google sign-in verification on the real domain (item 7).
5. The trusted edge client-IP header for production rate limiting (item 14).
6. Approved legal URLs/copy and social/brand assets (item 2). The domain is now confirmed: `https://crew.sanctuarylv.org`.
7. Review and approval of the production migration (item 3).

See the production-readiness section below for the full, classified list.

---

## Production readiness — `https://crew.sanctuarylv.org`

Classification for production connection. **Nothing was deployed, pushed, merged or migrated.** PASS means
verified locally in this sandbox (or, for DNS, observed live); it does not mean deployed.

### PASS

| # | Item | Evidence |
|---|---|---|
| P1 | Canonical domain in config and metadata | `CANONICAL_ORIGIN` (`src/api/crew/production.ts`, `vite.config.ts`); built `index.html` has `canonical` + `og:url` = `https://crew.sanctuarylv.org/crew`; `robots.txt`, `sitemap.xml`; browser check `landing: canonical is the production domain` |
| P2 | DNS record present | `crew.sanctuarylv.org` → CNAME `fallback.runable.site`, HTTP 200 (serves an older deployment — see E5) |
| P3 | Production build compiles in production mode | 447.42 kB main chunk with the development `.env`, no >500 kB chunk (`RUNBOOK_V2.md` §2) |
| P4 | Auth origin allow-list | `trustedOrigins` no longer reflects the request Origin; `https://evil.example` → 403 `INVALID_ORIGIN`, no token (`auth-smoke`, unit) |
| P5 | Auth secret fails closed | server refuses to start on the canonical deployment or `NODE_ENV=production` without a 32+ char `BETTER_AUTH_SECRET` (unit) |
| P6 | Google auth values documented | managed auth: no Google Console values exist for the app; start / return / exchange / sign-out URLs in `RUNBOOK_V2.md` §7.2 |
| P7 | Paid Group vs nonprofit separation | acknowledgements, `/serve`, footer operator note, portal; workbook validator rejects cross-entity roles (browser + unit) |
| P8 | Command Center honesty + boundary | "Saved locally — Command Center connection pending"; readiness row can never be PASS; boundary in `COMMAND_CENTER_CONTRACT_V2.md` §8 |
| P9 | Ticketing behind a boundary, demo labelled | fixtures disabled by default on the canonical domain; aggregates `live: false`; event page tag "Demo / test data — live ticketing not connected" (unit, integration, browser) |
| P10 | Staffing data distinguished | planning-seed markers (`source_note`, `confirmation`, `is_planning_seed`); `scripts/workbook-reconcile.ts` dry-run validator |
| P11 | Legal configuration points | 6 `VITE_SANCTUARY_*` keys, visible placeholders at every location (`LEGAL_PLACEHOLDERS_V2.md`); browser checks on footer and `/serve` |
| P12 | Migration validated (local) | forward, idempotent re-run, legacy preservation, atomic failure rollback, remote-write guard, no drift |
| P13 | Production migration checklist | `PRODUCTION_MIGRATION_CHECKLIST_V2.md` (not executed) |
| P14 | IP spoofing protection | `CREW_TRUSTED_PROXY=none` ignores all client-IP headers; `True-Client-IP` never trusted (unit, `limits` 23/23) |
| P15 | Full verification suite | lint, 3× tsc, unit 53, integration 280, e2e 116, browser 194, build, secret scan, diff check |

### BLOCKED — USER INPUT REQUIRED

| # | Item | Exactly what the administrator must provide |
|---|---|---|
| U1 | Legal documents | https URLs for `VITE_SANCTUARY_PRIVACY_URL`, `_TERMS_URL`, `_GROUP_DISCLOSURE_URL`, `_VOLUNTEER_TERMS_URL`, `_COMMUNICATIONS_URL`, `_DATA_RETENTION_URL`; approval (or replacement) of the paid and Serve acknowledgements; which entity/channels the optional marketing opt-in covers; whether SMS will be used (then approved SMS consent wording); retention periods |
| U2 | 36-role staffing workbook | the official workbook as CSV/JSON (columns in `RUNBOOK_V2.md` §11) |
| U3 | Runtime `NODE_ENV` | in the deployed environment, set `NODE_ENV=production` or delete the `NODE_ENV=development` line |
| U4 | `CREW_TOKEN_SECRET` | a dedicated, stable random secret in the deployed environment before any production credential is issued |
| U5 | Production migration | written approval, change window, operator/reviewer, fresh backup per the checklist |
| U6 | Release approval | review of PR #1, authorization to push this pass, and the merge decision |
| U7 | Social and brand links | `VITE_SANCTUARY_INSTAGRAM_URL`, `_TIKTOK_URL`, `_YOUTUBE_URL`, `_WEBSITE_URL` (placeholders shown until set) |

### BLOCKED — EXTERNAL SYSTEM

| # | Item | What is needed, and from whom |
|---|---|---|
| E1 | Command Center | Command Center team: real contract (`COMMAND_CENTER_CONTRACT_V2.md` §7), test environment, test identities and per-environment credentials; then a recorded round trip |
| E2 | Live ticketing | ticketing provider + API contract and credentials; fixtures remain the only data source |
| E3 | Client-IP header on the production path | after deploy, open `/staff/integration` on `crew.sanctuarylv.org` and confirm which IP header arrives (preview edge sets `x-real-ip` / `cf-connecting-ip` and strips client XFF; the fly.io route was not verifiable); then set `CREW_TRUSTED_PROXY` |
| E4 | Managed Google sign-in on the domain | Runable: the managed-auth broker must accept `https://crew.sanctuarylv.org` as a redirect origin for this `APPLICATION_ID`; verify with one real Google sign-in |
| E5 | Custom domain → this build | Runable platform: attach `crew.sanctuarylv.org` to the deployment with `WEBSITE_URL=https://crew.sanctuarylv.org`, and publish an approved build (the domain currently serves an older build with a relative `og:url`) |
| E6 | Remote concurrency | load test against a non-production Turso database: `SQLITE_BUSY` behaviour is verified only on local files |

### NOT STARTED

| # | Item | Depends on |
|---|---|---|
| N1 | Workbook import writer (new template version from a validated export) | U2 |
| N2 | Data-retention purge job | U1 retention periods |
| N3 | Canonical Command Center adapter (`CANONICAL_ADAPTER.implemented = true`) | E1 |

**Tally:** PASS 15 · BLOCKED — USER INPUT REQUIRED 7 · BLOCKED — EXTERNAL SYSTEM 6 · NOT STARTED 3.

`packages/web/website.config.json` keeps the template's placeholder hostnames: it is a platform-managed
template file and the app reads none of it, so it was left unchanged.
