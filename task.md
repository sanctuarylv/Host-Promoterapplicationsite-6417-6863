# Expanded build — Recruitment, Onboarding & Event Staffing

Source prompt: /home/user/Attachments/prompt_ml7nZl.txt (206 lines)

## Ground rules (from prompt)
- Extend in place; no deploy/push/publish/emails/ad spend/secret rotation/PRODUCTION MIGRATION.
- Turso DB in .env = the project's only (preview/prod-candidate) DB → treat as production. DO NOT migrate it.
  Dev/test runs on local libsql file: /home/user/sanctuary-testdb/crew-test.db (DATABASE_URL override).
- Migrations: drizzle/0000_baseline (current schema) + 0001 additive. Backfill script w/ --dry-run. Runbook.
- Command Center contract unknown → "proposed contract" adapter, strict parsing; pending labels.
- Label every local record authority=local_staging. Never claim connected.

## Stages
- [ ] S0 baseline: build/lint/tsc recorded; Turso read-only backup; test DB; baseline migration snapshot
- [ ] S1 reliability: 409/receipt strict; referral strict; cursor pagination+filters+population totals;
      people identity + (person, opportunity) uniqueness; phone policy (flag, not merge); analytics allowlist;
      shared DB rate limit + trusted proxy config; outbox (claim, backoff, classes, bounded, audit)
- [ ] S2 copy: Sanctuary LV Group paid wording; nonprofit Serve Team separate pathway (/serve, own table,
      consent, statuses); event content explained; future-opportunities label; consent v2 + provenance; new fields
- [ ] S3 auth: Better Auth (email/pw + managed Google); staff memberships + scopes; worker link tokens;
      legacy key limited/disabled after cutover; grant CLI
- [ ] S4 recruiter: list/detail/timeline/reviewer/overdue/interviews/scorecards/decisions w/ prerequisites,
      revision checks, audit; terms (approver) + offers; training modules/records
- [ ] S5 worker portal: own apps, offers accept/decline (revision), invitations, training, call sheet, credential, attendance
- [ ] S6 events: org chain (cycle-safe), templates (immutable versions, clone), After Dark seed (51/30),
      venue allowances provisional/unknown, provider fulfillment, events UTC+tz, milestones, assignments w/ overlap,
      readiness blockers, run of show, call sheet print, coverage, closeout
- [ ] S7 credentials (opaque hashed, expiring, revoke), staff attendance append-only, promoter links,
      guest registrations/admissions dedupe, aggregates
- [ ] S8 campaigns: goals, owners, links/UTM/QR, assets, calendar, budget ($750 proposal), metrics w/ denominators
- [ ] S9 integration console: modes local/connected/degraded, outbox view, reconciliation dry-run, cutover
- [ ] S10 tests (16 items), screenshots, acceptance report

## Decisions
- Identity: crew_people (email-unique person) + crew_applications per (person, opportunity_key). Legacy rows → opportunity 'general_interest'.
- Phone: not an identity key. Same phone + different email → stored, flagged phone_shared for review (no merge, no reject).
- Legacy status map: submitted→submitted, in_review→reviewed, contacted→screen_invited, orientation→reviewed+flag, active→reviewed+flag ('legacy_active_unverified'), declined→declined, withdrawn→withdrawn.

## Progress log
- 10-04: auth-schema generated (env sourced, DB=test). Schema split: schema-identity/recruiting/ops/campaigns. Migration 0001 generated, DROP of email_uq moved after replacement index; applied OK to copy of legacy snapshot (migrate-test.db, 45 tables, 7 legacy rows intact).
- shared/{ids,audit,settings,permissions}.ts, DB rate limiter, middleware/auth.ts written (unverified).
