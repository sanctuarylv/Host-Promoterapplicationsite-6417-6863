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

- `/crew` (and `/`) — landing: hero, choose your role, promoter challenge, why join, progression, FAQ-ish fine print, final CTA.
- `/crew/apply?role=host|promoter|both` — full-screen multi-step application + success experience.
- `/r/:code` — short referral link → redirects to `/crew?ref=CODE` (attribution captured first).
- `/crew/admin` — protected applicant list + CSV export (access key, noindex).

## Key Flow

Visitor → understands opportunity → chooses role → 7-step application (conditional steps 5/6) →
consent → submit → "YOU'RE IN THE PIPELINE" success → Sanctuary onboarding pipeline.
