# Expanded build — Recruitment, Onboarding & Event Staffing

Source prompt: /home/user/Attachments/prompt_ml7nZl.txt (206 lines)

## Ground rules (from prompt)
- Extend in place; no deploy/push/publish/emails/ad spend/secret rotation/PRODUCTION MIGRATION.
- Turso DB in .env = the project's only (preview/prod-candidate) DB → treat as production. DO NOT migrate it.
  Dev/test runs on local libsql file: /home/user/sanctuary-testdb/crew-test.db (DATABASE_URL override).
- Migrations: drizzle/0000_baseline (current schema) + 0001 additive. Backfill script w/ --dry-run. Runbook.
- Command Center contract unknown → "proposed contract" adapter, strict parsing; pending labels.
- Label every local record authority=local_staging. Never claim connected.

## Status (2026-10-05)
Implemented and tested **locally only**; nothing deployed, nothing connected, no production migration.
Per-item evidence, commands and results: `docs/ACCEPTANCE_V2.md`. Operating procedure: `docs/RUNBOOK_V2.md`.

| Stage | Scope | Status |
|---|---|---|
| S0 | baseline, read-only Turso backup, test DB, baseline migration | done (baseline = HEAD 8e7cffc; no v1 commit exists) |
| S1 | reliability: receipts/409, referrals, pagination, identity, phone policy, analytics, rate limit, outbox | implemented, tested vs mock CC |
| S2 | Group vs nonprofit copy, `/serve`, consent v2 + provenance | implemented, tested; official brand/legal assets pending |
| S3 | Better Auth, staff memberships/scopes, explicit worker linking, legacy admin read-only, grant CLI | implemented, tested; managed Google unverified |
| S4 | recruiter pipeline, terms/offers, training | implemented, tested |
| S5 | worker portal | implemented, tested |
| S6 | org chain, templates, After Dark seed 51/30, events, call sheet, coverage, closeout | implemented, tested; 36-role workbook not supplied |
| S7 | credentials, attendance, promoter links, guest admissions | implemented, tested; live ticketing pending |
| S8 | campaigns and metrics | implemented, tested |
| S9 | integration console | implemented, tested; cutover disabled until the real CC contract |
| S10 | tests, screenshots, acceptance report | done; CC round trip externally blocked |

## Decisions
- Identity: crew_people (email-unique person) + crew_applications per (person, opportunity_key). Legacy rows → opportunity 'general_interest'.
- Phone: not an identity key. Same phone + different email → stored, flagged phone_shared for review (no merge, no reject).
- Legacy status map: submitted→submitted, in_review→reviewed, contacted→screen_invited, orientation→reviewed+flag, active→reviewed+flag ('legacy_active_unverified'), declined→declined, withdrawn→withdrawn.

## Progress log
- 10-04: auth-schema generated (env sourced, DB=test). Schema split: schema-identity/recruiting/ops/campaigns. Migration 0001 generated, DROP of email_uq moved after replacement index; applied OK to copy of legacy snapshot (migrate-test.db, 45 tables, 7 legacy rows intact).
- shared/{ids,audit,settings,permissions}.ts, DB rate limiter, middleware/auth.ts written (unverified).
- 10-05: full verification round: lint clean, 3x tsc, build, unit 33, integration 6 suites, e2e 3 suites, browser 5 suites, migration rehearsal all pass. Fixed: 4 a11y lint errors, unreadable printed call sheet, unlabelled planning-seed campaigns.
