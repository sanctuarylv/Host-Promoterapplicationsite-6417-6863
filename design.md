# Sanctuary LV — Crew (Host + Promoter Recruitment) — Design

Public, mobile-first recruitment experience that turns visitors into Host / Promoter applicants.
Feels like joining the team behind a premium live-event brand and creative community — never a
church volunteer form, HR portal or Vegas flyer. Web only.

## Brand & Colors (locked — no accents)

| Token        | Hex      | Use |
|--------------|----------|-----|
| `--sx-black` | #0A0A0A  | Page background (dark-first), primary ink on light |
| `--sx-ink`   | #111111  | Raised dark surfaces, form panels |
| `--sx-white` | #FFFFFF  | Primary text on dark, primary CTA fill |
| `--sx-off`   | #F7F7F7  | Light sections (Why Join, Progression) |
| `--sx-gray`  | #E0E0E0  | Hairlines on light, secondary text on dark |

Opacity steps of white/black (e.g. `white/60`, `white/12`) are used for secondary text and
hairlines. Errors are communicated with text + icon + underline weight, not color alone
(the palette has no red). Photography is fully desaturated.

## Typography

Inter only (Brand Bible 3.0), self-hosted variable font `/fonts/inter-var.woff2`, weights 300–600.
Display scale comes from size, tracking and case — not weight:

- Display: Inter 500, uppercase, `clamp(3rem, 11vw, 10rem)`, tracking -0.04em, line-height 0.9
- Section heading: Inter 500, uppercase, `clamp(2.25rem, 7vw, 5.5rem)`, tracking -0.03em
- Eyebrow / meta: Inter 500, 11–12px, uppercase, tracking 0.24em
- Body: Inter 300/400, 16–18px, line-height 1.6

## Layout & Motion

- Editorial grid with oversized type, generous negative space, hairline rules, numbered sections.
- Alternating dark (#0A0A0A) and light (#F7F7F7) bands for rhythm.
- Subtle SVG film grain overlay, slow hero Ken-Burns, staggered reveal on scroll via
  IntersectionObserver (CSS transitions only — no animation library). Marquee of role statements.
- All motion disabled under `prefers-reduced-motion`.
- Square corners everywhere (radius 0). Buttons: 56px min height, uppercase tracked labels.

## Pages

Public (Sanctuary LV Group, paid roles; candidate interest only, no pay promised):
- `/crew` (and `/`): landing with hero, role choice, promoter challenge, why join, progression, `#pathways` (Group vs nonprofit), FAQ and a final CTA.
- `/crew/apply?role=...`: full-screen multi-step application and success experience.
- `/r/:code`: short referral link. It redirects to `/crew?ref=CODE` (attribution is captured first, last touch in sessionStorage and first touch in localStorage for 30 days).

Separate nonprofit pathway:
- `/serve`: the Sanctuary LV **nonprofit** Serve Team. It is unpaid, with its own form, table, consent version and statuses. It is never mixed with paid Group applications.

Signed in:
- `/sign-in`: Better Auth email/password (managed Google is configured but unverified). It links to both pathways.
- `/portal`: the worker portal, for explicitly linked accounts only. It shows a worker's own applications, offers (accept/decline with revision), training, call sheet, credential and attendance. No coworker contacts, rates or guest lists.
- `/staff/*`: the staff console. Pages: applicants (list, detail and timeline), terms, events (detail, coverage and printable call sheet), campaigns, integration (local / outbox / dry run, cutover disabled), Serve Team and access. Role- and department-scoped.
- `/crew/admin`: legacy v1 applicant list, now **read-only** (`CREW_LEGACY_ADMIN_MODE`). It is retired once a Command Center cutover is recorded.

Console surfaces use the same palette and type, with denser layouts. Planning-seed data is tagged "Planning seed" and unknown counts render as "unknown", never 0. The call sheet prints light (white page, dark ink) whether or not background graphics are on.

## Key Flow

Visitor understands the opportunity and chooses a role. The application then runs up to nine steps, from `getSteps()` in `src/web/components/apply/steps.tsx`:

about → role → social → availability → [promoter] → [host] → experience → motivation → confirm

The promoter step appears for promoter roles and the host step for host roles, so applicants see seven to nine steps. Consent (versioned) is given on the confirm step, which also names the paid operator. After submit, the visitor sees "YOU'RE IN THE PIPELINE". Staff then review it in `/staff` (screen → scorecard → selected → offer → onboarding/training → event-ready). Nothing syncs to the Command Center until a real contract exists; records stay `local_staging`.
