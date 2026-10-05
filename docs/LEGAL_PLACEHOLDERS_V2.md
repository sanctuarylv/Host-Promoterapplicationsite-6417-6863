# Sanctuary Crew v2 — legal and privacy placeholders

This app does **not** contain final legal language. Every point below needs an official URL or
approved wording from Sanctuary LV Group (paid roles) or Sanctuary LV nonprofit (Serve Team volunteers).
Until supplied, the UI shows a visible placeholder (`<label> — pending approval`, attribute
`data-legal-placeholder=<ENV KEY>`). Nothing here is a legal determination.

## 1. Configuration points

Set in the deployment environment (root `.env`). Values must be `https://` URLs; anything else is ignored
and the placeholder stays. They are build-time (`VITE_*`), so a rebuild is needed after changing them.

| Env key | Document | Owner (to confirm) | Shown on |
|---|---|---|---|
| `VITE_SANCTUARY_PRIVACY_URL` | Privacy Policy | Group and nonprofit (one shared or two separate policies — decide) | footer, apply Confirm, `/serve`, portal offer, sign-in |
| `VITE_SANCTUARY_TERMS_URL` | Terms of Use (site) | Group | footer, apply Confirm, `/serve`, sign-in |
| `VITE_SANCTUARY_GROUP_DISCLOSURE_URL` | Paid-role disclosures: employment / contractor status, pay, at-will/engagement terms, background checks if any | Sanctuary LV Group | apply Confirm, portal offer |
| `VITE_SANCTUARY_VOLUNTEER_TERMS_URL` | Volunteer terms / waiver | Sanctuary LV nonprofit | `/serve` |
| `VITE_SANCTUARY_COMMUNICATIONS_URL` | Email and SMS communications terms (frequency, opt-out, carrier notice if SMS is used) | Group and nonprofit | apply Confirm, `/serve` |
| `VITE_SANCTUARY_DATA_RETENTION_URL` | Data-retention notice (how long applications, IDs, credentials and audit records are kept) | Group and nonprofit | footer, apply Confirm, `/serve`, portal offer |

The staff Integration page readiness table shows each key as PASS (linked) or BLOCKED — USER INPUT.

## 2. Locations that need approved language

| # | Location | File | Current state | Needed from the administrator |
|---|---|---|---|---|
| 1 | Paid application, required acknowledgement | `src/api/crew/contract.ts` `ACKNOWLEDGEMENT_V2` (version `CONSENT_VERSION`), shown in `components/apply/steps.tsx` | Operational statements only (Group operates paid roles; no pay/classification set by applying; no guarantee; nonprofit pathway separate; contact + accuracy) | Approval of the five statements, or replacement text. Any change must bump `CONSENT_VERSION` |
| 2 | Paid application, optional marketing opt-in | `components/apply/steps.tsx` `marketingConsent` | "news, event announcements and updates from Sanctuary"; unchecked by default; stored as a boolean | Which entity sends marketing, which channels (email / SMS), approved wording |
| 3 | Paid application, data-use sentence | `components/apply/steps.tsx` | "Your information is used to review your application and coordinate team opportunities." | Approval or replacement; link to privacy policy |
| 4 | Serve Team acknowledgement | `src/api/crew/serve-contract.ts` `SERVE_ACKNOWLEDGEMENT` (`SERVE_CONSENT_VERSION`), `pages/serve.tsx` | Unpaid nonprofit volunteer; separate from paid Group roles; never a condition of paid consideration; contact + accuracy | Nonprofit approval; volunteer waiver/terms if required |
| 5 | Offer acceptance (applicant portal) | `pages/portal.tsx` | Applicant accepts staff-approved terms drafted in `/staff/terms`; links to Group disclosure, privacy, retention | Approved engagement terms per opportunity; Group disclosure document |
| 6 | Compensation terms drafting | `pages/staff/terms.tsx` | States the app "makes no classification or legal determination" | Employment vs contractor classification decided outside the app |
| 7 | Footer (all public pages) | `components/crew/chrome.tsx` | Operator note naming Sanctuary LV Group (paid) and Sanctuary LV nonprofit (Serve Team); privacy / terms / retention links | Approval of the operator note |
| 8 | Staff and worker sign-in | `pages/sign-in.tsx` | Privacy + terms links | — (URLs only) |
| 9 | SMS consent | — | **Not collected.** Phone number is collected for contact only; the app sends no SMS and no email | If SMS will be used: explicit SMS consent wording, and a new consent version |
| 10 | Data retention and deletion | — | **No automated retention or purge exists.** Records stay until deleted by staff/DB operator | Retention periods per record type; then a purge job can be specified |
| 11 | Legacy `/crew/admin` CSV export | `pages/admin.tsx` | Read-only, shared key; exports applicant contact data | Who may export; disable once staff use `/staff` (`CREW_LEGACY_ADMIN_MODE=disabled`) |

## 3. Rules

- Do not paste draft or AI-written legal text into these locations. Link the approved document.
- Changing the wording of items 1 or 4 requires a new consent version so stored consents keep pointing
  at the text that was shown.
- Paid-role text names **Sanctuary LV Group**; volunteer text names **Sanctuary LV nonprofit**. Never mix them.
