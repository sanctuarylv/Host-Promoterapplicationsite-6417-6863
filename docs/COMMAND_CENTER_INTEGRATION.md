# Sanctuary Command Center — integration guide

The public Host + Promoter site is built so the Sanctuary Command Center can
become the system of record **without touching any UI code**. Today the site
stores applications in its own database (Turso/libSQL). When the Command
Center API exists, turn on forwarding with environment variables.

> No Command Center endpoint, domain, or credential is assumed anywhere in
> this codebase. Paths such as `/api/public/crew/applications` are
> **illustrative only** — use whatever the real API defines.

---

## 1. Architecture

```
Browser (/crew/apply)
  └─ applicationSchema (zod) — same contract client + server
      └─ oRPC  crew.submit                      src/api/routes/crew.ts
          ├─ rate limit (5 / 10 min / IP)       src/api/crew/rate-limit.ts
          └─ submitApplication()                src/api/crew/submission-service.ts
              ├─ honeypot + min-fill-time drop
              ├─ duplicate check (email OR phone, normalized)
              ├─ resolveReferral()              src/api/crew/referrals.ts
              ├─ INSERT crew_applications       (always — local outbox)
              └─ if CREW_SUBMISSION_MODE=forward
                   └─ forwardApplication()      src/api/crew/command-center.ts  ← ONLY file that talks to the Command Center
```

- The local row is always written first, so a Command Center outage never
  loses an application or fails the applicant's submission.
- Every row carries `sync_status`: `not_configured` → `pending` → `synced` | `failed`,
  plus `sync_attempts`, `sync_error`, `synced_at` and `external_id`.

## 2. Environment variables (root `.env`)

| Variable | Required for | Notes |
|---|---|---|
| `CREW_SUBMISSION_MODE` | always | `local` (default) or `forward` |
| `CREW_REFERRAL_VALIDATION_MODE` | always | `format` (default: any well-formed code stored as `unverified`) or `command_center` |
| `CREW_ADMIN_ACCESS_KEY` | admin view | Long random secret. If blank, `/crew/admin` is disabled. |
| `COMMAND_CENTER_API_BASE_URL` | forward / lookup | Origin only, e.g. `https://<command-center-host>` (no trailing slash needed) |
| `COMMAND_CENTER_APPLICATIONS_PATH` | forward | Path of the create-application endpoint |
| `COMMAND_CENTER_REFERRAL_LOOKUP_PATH` | lookup | Path for referral lookup; `{code}` is replaced, otherwise the code is appended |
| `COMMAND_CENTER_API_KEY` | forward / lookup | Sent as `Authorization: Bearer <key>` |
| `COMMAND_CENTER_SIGNING_SECRET` | optional | Enables HMAC request signing (see §4) |
| `COMMAND_CENTER_TIMEOUT_MS` | optional | Default `8000` |
| `VITE_SITE_URL` | SEO | Absolute production origin; makes `og:image` / `og:url` absolute |
| `VITE_SANCTUARY_INSTAGRAM_URL`, `_TIKTOK_URL`, `_YOUTUBE_URL`, `_WEBSITE_URL` | footer / success screen | Official channels. Blank → "coming soon" placeholder. Must start with `https://`. |
| `VITE_SANCTUARY_PRIVACY_URL` | consent copy | Official privacy policy URL. Blank → "link pending". |

`VITE_*` values are public (bundled into the browser). Everything else is
server-only and must never be prefixed with `VITE_`.

## 3. Payload (`toCommandCenterPayload`)

`POST {COMMAND_CENTER_API_BASE_URL}{COMMAND_CENTER_APPLICATIONS_PATH}`

```jsonc
{
  "contract_version": "crew-application.v1",
  "source": "sanctuary-crew-public-site",
  "application": {
    "id": "uuid — stable, also the Idempotency-Key",
    "first_name": "…", "last_name": "…",
    "email": "normalized lowercase", "phone": "E.164, e.g. +17025550123",
    "city": "…", "state": "NV",
    "role_interest": "host | promoter | both | not_sure",
    "instagram": "handle without @ | null", "tiktok": "… | null", "other_social": "https://… | null",
    "network_types": ["friends", "social_media", "…"],
    "availability": "most_events | one_two_monthly | occasionally | event_specific",
    "evenings_available": true, "weekends_available": false,
    "promoter_invite_range": "1_5 | 6_10 | 11_25 | 26_50 | 50_plus | null",
    "promoter_experience": true, "promoter_experience_notes": "… | null",
    "host_interests": ["check_in", "…"],
    "motivation": "…",
    "referral_source": "sanctuary_event | friend | instagram | …",
    "application_status": "submitted",
    "marketing_consent": false, "marketing_consent_at": null,
    "required_consent_at": "ISO-8601", "consent_version": "2026-10-03.v1",
    "created_at": "ISO-8601", "updated_at": "ISO-8601"
  },
  "attribution": {
    "referral_code_used": "ABC123 | null",
    "referral_code_status": "none | unverified | valid | invalid",
    "campaign": "…", "event_id": "…", "qr_campaign": "…",
    "utm_source": "…", "utm_medium": "…", "utm_campaign": "…", "utm_content": "…", "utm_term": "…",
    "referring_url": "origin + path only (query stripped)",
    "landing_path": "/crew", "entry_point": "hero | role_section | challenge | final | …",
    "first_touch": { "…": "first-touch attribution within 30 days, or null" }
  }
}
```

Promoter-only fields are `null` unless the role is `promoter` or `both`;
`host_interests` is `[]` unless the role is `host` or `both`.
Referral, campaign, event and QR codes are normalized to uppercase.

To change the shape, edit `toCommandCenterPayload` and bump
`CONTRACT_VERSION` in `src/api/crew/contract.ts`.

## 4. Request headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer ${COMMAND_CENTER_API_KEY}` |
| `Content-Type` | `application/json` |
| `Idempotency-Key` | the application `id` (safe to retry) |
| `X-Sanctuary-Timestamp` | unix seconds (only when a signing secret is set) |
| `X-Sanctuary-Signature` | `sha256=` + hex HMAC-SHA256 of `` `${timestamp}.${rawBody}` `` with `COMMAND_CENTER_SIGNING_SECRET` |

Responses: any `2xx` **or** `409` (already received) = success. The external
id is read from `id`, `application_id` or `data.id` if present.
`5xx`, `408`, `429` and network errors are marked retryable.

Referral lookup: `GET {base}{REFERRAL_LOOKUP_PATH}` → `404` = invalid;
`{ "valid": boolean }` or `{ "active": boolean }` honored; any other `2xx` = valid;
anything else = left `unverified` (attribution is never dropped).

## 5. Steps to connect the production Command Center

1. **Get the real contract** from the Command Center team: base URL, create
   path, referral lookup path, auth scheme, success response shape, and whether
   HMAC signing is required.
2. **Adjust the adapter if needed** — only `src/api/crew/command-center.ts`
   (`toCommandCenterPayload`, the auth headers in `request`, and the response
   parsing). Bump `CONTRACT_VERSION` if the payload changes.
3. **Set env in the root `.env`:**
   `COMMAND_CENTER_API_BASE_URL`, `COMMAND_CENTER_APPLICATIONS_PATH`,
   `COMMAND_CENTER_API_KEY` (+ `COMMAND_CENTER_SIGNING_SECRET` if used).
4. **Smoke test in staging** with `CREW_SUBMISSION_MODE=forward`: submit one
   test application, then confirm in `/crew/admin` → Details that the row
   shows `synced` with an external id, and that the Command Center received it.
5. **Backfill** rows stored before forwarding was on: in `/crew/admin`, open a
   row with sync `not_configured`/`failed` and use *Retry Command Center sync*
   (procedure `crewAdmin.retrySync`). Idempotency keys make re-sends safe.
6. **Referral validation** (when the Command Center owns promoter codes): set
   `COMMAND_CENTER_REFERRAL_LOOKUP_PATH` and
   `CREW_REFERRAL_VALIDATION_MODE=command_center`.
7. **Production:** set `CREW_SUBMISSION_MODE=forward`, redeploy, and monitor
   `sync_status = failed` rows in the admin view.
8. Optionally retire the local admin view once the Command Center UI covers
   applicant operations (keep the local table as the outbox).

## 6. Known gaps to close at connection time

- Failed forwards are **not retried automatically** — retry is manual from the
  admin view. Add a scheduled job that calls `syncApplication(id)` for
  `failed` rows if hands-off retry is needed.
- Status changes made in the Command Center are not pulled back. If two-way
  sync is required, add a webhook route (`app.post("/api/webhooks/command-center", …)`)
  that verifies the signature and updates `application_status`.
- The rate limiter is in-memory per server instance; put an edge/WAF limit in
  front for multi-instance production traffic.
