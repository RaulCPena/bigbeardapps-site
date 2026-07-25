# PayoffPilot Roadmap Page — Design

**Date:** 2026-07-24
**Status:** Approved (design), pending implementation plan

## Goal

A read-only, pre-launch "where PayoffPilot is headed" page. Primary purpose is
**showing the vision** — build trust and momentum before v1.0 ships — not collecting
feedback. Feedback is a light, backend-free nudge only.

Success = a visitor understands the direction of the product and feels it has momentum,
without the studio committing to dates or specific version numbers.

## Framing: Now / Next / Later

Three horizon buckets, **no dates, no version numbers**:

- **NOW** — shipping in v1.0 at launch.
- **NEXT** — actively being built (this is where the v1.1 ideas live).
- **LATER** — exploring / directional.

Chosen because it shows direction without committing to timing, and items can move
between buckets freely as plans change. Nothing can "slip."

## Placement

New dedicated page: **`/payoffpilot/roadmap.html`**.

- **Primary link:** a prominent "See the roadmap →" link on the PayoffPilot app page.
- **Footer link:** "PayoffPilot Roadmap" added to the footer's **app-resources row**
  (`.footer-legal`, alongside PayoffPilot Privacy/Terms), NOT the main nav row — it is
  app-specific, not site-wide navigation. Added consistently across pages.
- Built so a Feastmark roadmap (`/feastmark/roadmap.html`) can be added identically later.

## Layout

- **Responsive board:** three columns (NOW · NEXT · LATER) side by side on desktop,
  stacking vertically on mobile (single automatic layout, no separate mobile design).
- **Color:** PayoffPilot's own blue (`#0066cc`) at three intensities to distinguish the
  columns — NOW = solid blue, NEXT = lighter blue, LATER = muted grey. No new colors
  introduced.
- **Column contents:** a labeled header + a stack of item cards. Each **item = short
  title + one-line description.** No badges, no dates, no status pills.
- **Hero:** small dark band (ink + amber glow, matching the site) — eyebrow "PayoffPilot",
  a headline ("Where PayoffPilot is headed"), and one expectation-setting line
  (a living plan; direction, not promises; timing may change).

## Engagement (backend-free)

A single closing line beneath the board: "Want something on this list? Tell me →"
linking to the existing contact form (`/contact.html`). This satisfies the secondary
"gather user input" instinct with **no new backend** (no voting, no forms, no email).

## Content model

The three columns ship **scaffolded with placeholder items marked `EDIT ME`** (same
pattern as the About / build-log page). The studio drops in the real Now/Next/Later
items. If real v1.1 items are provided before build, they are slotted in directly.

## Design system

Reuses `assets/site.css` entirely: standard `.site-nav` (PayoffPilot marked
`aria-current`), standard `.site-footer`, cream page background, white cards, existing
tokens and type. A small page-scoped `<style>` block covers only the board grid and the
three column-intensity accents. Favicon + meta consistent with other pages.

## Non-goals (YAGNI)

- No voting / upvoting.
- No per-item status badges, progress bars, or dates.
- No comments or user submissions on-page.
- No email capture (consistent with the earlier decision).
- No CMS / data file — content is hand-authored HTML like the rest of the site.

## Integration touches (files changed)

- **New:** `payoffpilot/roadmap.html`.
- **Edit:** `payoffpilot/index.html` — add a prominent "See the roadmap →" link.
- **Edit:** the `.footer-legal` row site-wide — add a "PayoffPilot Roadmap" link
  (kept consistent across pages, matching how the other app-resource links are handled).

## Deploy note

Repo auto-publishes on push to `main`. Work lands on `feat/payoffpilot-roadmap`
(branched off `feat/about-page`); not pushed until the studio reviews and deploys.
