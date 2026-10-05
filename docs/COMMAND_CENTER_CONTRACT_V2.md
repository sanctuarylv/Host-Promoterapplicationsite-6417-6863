# Command Center contract v2 — PROPOSED, not verified

> **Status: proposed.** Nobody has provided or verified the real Sanctuary Command Center API, and there is no test environment for it. This document describes what this app **sends and accepts today**: contract id `sanctuary-cc.crew.proposed-v2` in `packages/web/src/api/crew/command-center.ts`. Treat it as a request to the Command Center team, not as a description of a live service.
>
> - No production endpoint, path or credential is assumed. Every value is an env var, blank by default.
> - The canonical adapter is **not implemented**: `CANONICAL_ADAPTER.implemented = false` in `src/api/crew/integration.ts`. Because of that, **cutover to "connected" is refused**, and any stored `cc_cutover` setting is ignored.
> - Everything here was tested only against a strict **local mock** of this proposal (`packages/web/tests/integration/strict-cc-mock.ts`). There has been no real round trip.

Replaces `docs/COMMAND_CENTER_INTEGRATION.md` (v1, generic-body contract — obsolete).

## 1. Configuration

| Env var | Meaning |
|---|---|
| `CREW_SUBMISSION_MODE` | `local` (default): store and hold in the outbox. `forward`: the outbox sends. |
| `COMMAND_CENTER_API_BASE_URL` | Origin, no trailing slash. |
| `COMMAND_CENTER_APPLICATIONS_PATH` | Path for `application.create`. |
| `COMMAND_CENTER_STATUS_PATH` | Path for `application.status`. `{id}` is replaced with the submission id. |
| `COMMAND_CENTER_REFERRAL_LOOKUP_PATH` | Referral lookup. `{code}` is replaced, or the code is appended. |
| `COMMAND_CENTER_API_KEY` | Bearer credential. |
| `COMMAND_CENTER_SIGNING_SECRET` | Optional HMAC signing of request bodies. |
| `COMMAND_CENTER_TIMEOUT_MS` | Default 8000. The outbox claim lasts at least `2×timeout + 10 s`. |
| `CREW_REFERRAL_VALIDATION_MODE` | `format` (default) or `command_center`. |

`canForward` requires a base URL, an applications path and a key. Having the configuration in place **is not evidence of connectivity**. See the integration modes in §6.

## 2. Request

`POST {base}{path}` with these headers:

```
Authorization: Bearer <COMMAND_CENTER_API_KEY>
Content-Type: application/json
Accept: application/json
User-Agent: sanctuary-crew/2.0
X-Sanctuary-Contract: sanctuary-cc.crew.proposed-v2
Idempotency-Key: crew:<operation>:<aggregate id>:v<version>
X-Sanctuary-Timestamp: <unix seconds>          (only when a signing secret is set)
X-Sanctuary-Signature: sha256=<hex HMAC-SHA256(secret, "<ts>.<raw body>")>
```

The body is the stored outbox payload plus `operation` and `payload_hash`.

- `payload_hash` is the SHA-256 of a sorted-key JSON serialisation (`stableStringify`). It is computed once, when the operation is enqueued, and never recomputed.
- The idempotency key is stable for the life of the operation, so retries reuse the same key and the same hash.

### Operations

| operation | Key | Payload |
|---|---|---|
| `application.create` | `crew:application.create:<application id>:v1` | `toCommandCenterPayload(row)` — `contract_version`, `source`, `submission_id`, an `application{…}` block (identity, role, availability, answers, `local_status`, `legacy_status`, `status_flags`, consent fields with `consent_version`, `created_at`) and `recruitment_attribution{…}` (referral code and status, campaign, event, QR, `utm_*`, sanitised `referring_url`/`landing_path`, allow-listed `first_touch`). No analytics events and no private scoring notes. |
| `application.status` | `crew:application.status:<application id>:v<revision>` | `{submission_id, revision, status, flags, at}`. One row per (application, revision). Only enqueued once connected mode exists, which it does not yet. |

## 3. Responses that count as synchronised

Parsing is strict. **Anything else is "not synchronised"**: the row stays `failed` or `dead` and is visible in the console.

**200 / 201 — accepted**
```json
{ "status": "created" | "replayed", "submission_id": "<ours>", "receipt_id": "…", "canonical_id": "…", "payload_hash": "<optional, must match>" }
```
This counts only if `submission_id` equals ours. If `payload_hash` is present and differs, the response is classified as `conflict`.

**409 — verified idempotent replay**
```json
{ "error": "idempotent_replay", "submission_id": "<ours>", "receipt_id": "…", "canonical_id": "…", "payload_hash": "<must equal ours>" }
```
Any other 409 (an unrelated record, a payload conflict, or a 409 without a hash) is a `conflict` and is **not** treated as success.

When an operation succeeds:
- the outbox row stores `receipt_id` and `canonical_id`;
- the application mirror gets `external_id`;
- a `crew_audit` row `outbox.synced` records `{receipt, canonical, replay, endpoint}`, where `endpoint` is the fingerprint `base + path` of the target that issued the receipt.

## 4. Errors, retries and backoff

| Response | Class | Retried automatically |
|---|---|---|
| network error / refused | `network` | yes |
| abort / 408 | `timeout` | yes |
| 5xx | `server` | yes (honours `Retry-After`) |
| 429 | `rate_limited` | yes (honours `Retry-After`, capped at 1 h) |
| 2xx without a valid receipt, wrong submission id, 204, malformed JSON | `malformed` | yes |
| 401 / 403 | `auth` | **no** — needs a person |
| 409 other than a verified replay; hash mismatch | `conflict` | **no** |
| other 4xx | `rejected` | **no** |
| not configured | `not_configured` | row stays held |

- **Backoff:** `30 s × 2^(attempts−1)`, ±20 % jitter, capped at 6 h. The delay is never shorter than `Retry-After`.
- **Attempts:** bounded by `max_attempts`, default 3. After that the row is `dead`, and a staff retry grants exactly one more attempt; the retry is audited.
- **Claims:** a claim is an atomic conditional `UPDATE … RETURNING`, so exactly one worker wins.
  - An expired claim can be taken over.
  - A stale worker that lost its claim can't write a receipt, a mirror or an audit row (`lost_claim`).

All of this is covered by `tests/integration/outbox.ts` (69 checks) against the strict mock.

## 5. Referral lookup (proposed)

`GET {base}{referral path}`. The lookup is tri-state, and a generic 2xx is **not** proof of validity.

| Response | Result |
|---|---|
| 200 `{code, status:"active"}` and the code matches (case-insensitive) | `valid` |
| 200 with `status` `inactive` or `revoked` | `invalid` |
| 404 `{error:"referral_not_found"}` | `invalid` |
| anything else, including a network error | `unverified` — the application is still accepted and flagged |

## 6. Integration modes and cutover gate (`getIntegrationState`)

| Mode | When |
|---|---|
| `local` | `CREW_SUBMISSION_MODE=local` (default). The label reads "Saved locally — Command Center connection pending". |
| `pending` | Forward mode is set, but one of these holds: the config is incomplete; no round trip is recorded **for the currently configured endpoint**; or **the canonical adapter is not implemented**. The last one is always true in this build. |
| `connected` | Unreachable in this build. It would need an adapter, a verified round trip, a recorded cutover and healthy recent sends. |
| `degraded` | Unreachable in this build. It would apply when connected and recent sends are failing; canonical mutations would then be paused. |

Recording a round trip (`integration.recordRoundTrip`, admin only) requires:
1. a `synced` outbox row with a receipt; **and**
2. the latest `outbox.synced` audit row for that outbox id, with `data.endpoint === endpointFingerprint()` (the currently configured endpoint) and `data.receipt === row.receipt_id`.

A receipt minted by a different endpoint, such as a local mock, is refused with PRECONDITION_FAILED. Repointing the endpoint also invalidates a previously recorded round trip.

`integration.recordCutover` always returns PRECONDITION_FAILED while `CANONICAL_ADAPTER.implemented` is false. Both behaviours are covered by `tests/integration/cutover.ts` (21 checks, with a negative control).

The reconciliation preview (`integration.reconcile`) is a read-only dry run. It flags that a canonical read endpoint is unavailable.

## 7. What the Command Center team must provide before this can connect

1. The real request and response schemas for create, status and referral lookup. These must confirm, or replace, §2–§5.
2. A **canonical read endpoint**, e.g. `GET /applications/{canonical_id}`, so reconciliation can compare local state with canonical state.
3. Idempotency semantics: how long a key is retained, whether replays return the original receipt, and a hash-mismatch error code.
4. Auth model and scopes (key per environment, rotation), plus whether body signing is required.
5. An authorised **test environment** with test identities, so a real round trip can be recorded. A round trip against the local mock is never accepted as evidence.
6. Canonical ownership rules after cutover: which side owns status, offers and assignments, and how conflicts are resolved.
7. Rate limits and `Retry-After` behaviour.

Then ship the adapter in a reviewed change: set `CANONICAL_ADAPTER.implemented = true` and add tests against the real test environment. Only after that can an admin record a round trip and a cutover.
