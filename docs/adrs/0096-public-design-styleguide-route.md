# ADR-0096: The design-system reference is the public `/design` route, rendered from source

**Status:** Active **Date:** 2026-08

## Context

An externally-produced design-system package (built by an AI design tool from this repo's code)
arrived as a folder of static artifacts: token specimen cards in hand-authored HTML, React/JSX
re-creations of the shipped Svelte components with `.d.ts` and prompt docs, a generated component
bundle, an interactive mock of the drawing screen, a hand-mirrored copy of the crayon palette, and a
strong prose README (voice, brand narrative, iconography rules). The goal was a design-system
reference that is browsable by humans and discoverable by agents doing UI work.

Two homes were considered:

* **A static collection under `scrapbook/`, published via GitHub Pages.** Rejected. The Pages
  artifact serves only `scrapbook/`, so every reference into `web/` (the generated `tokens.css`, the
  icon SVGs, the paper texture, the font) would need vendored, drift-checked copies — new
  generator + CI machinery whose only job is keeping duplicates honest. The JSX component
  re-creations are parallel implementations of shipped Svelte components, and the palette CSS was a
  "keep in sync with `palette.ts`" mirror — exactly the prose-maintained agreement the root
  conventions ban. And the scrapbook is for *kept run outputs*; a living reference is app surface,
  not a run output.
* **Enrich the existing Svelte styleguide and make it public.** Chosen. `/dev/design` (ADR-0071)
  already rendered every token group and primitive from the real source objects — drift-free by
  construction — and the repo's workflows (token registration, PR screenshots) already pointed at
  it. What it lacked was the brand half (voice, mascot, paper, palette, icons) and a public URL.

## Decision

The dev-gated `/dev/design` route moved to **public `/design`** (`web/src/routes/design/`), with the
salvaged brand content ported into Svelte sections that import the real sources:

* Section partials live in `web/src/lib/components/styleguide/` — `BrandSections.svelte` (voice &
  copy specimens, mascot/wordmark/crayon strip, paper, the crayon palette from `PALETTE_COLORS`, and
  the icon set), `TokenSections.svelte` (every token group, now including weight specimens and
  animated easing lanes), `PrimitiveSections.svelte` — split so each file stays under the
  `max-lines` ratchet.
* The icon grids iterate `ICON_NAMES`, a new module-context export of `Icon.svelte` (the glob and
  name map moved from instance to module scope), split by the existing `COLOR_ICONS` set — a new
  icon appears on the page with no styleguide edit.
* `prerender = false` (`web/src/routes/design/+page.ts`) is the native exclusion: the Capacitor
  static export builds with `strict: false`, which emits no page for a route that opts out of
  prerendering, so the styleguide page never lands in the native export while staying SSR on the
  web. (Its client-side route chunk still rides along in the SPA bundle, as `/dev/design`'s did —
  nothing in the kid-facing apps links to it.) `/design` is in `web/static/sitemap.xml` and scanned
  by `web/tests/a11y.spec.ts`.
* The prose that didn't belong on a page — voice & copy rules, iconography rules, touch-target
  guidance — was folded into the `design` skill (`.ruler/skills/design/SKILL.md`), which now also
  points at `/design`.

The external package's remaining artifacts (JSX components, `.d.ts`/prompt docs, the component
bundle, the UI-kit mock, the mirrored palette CSS, the vendored font) were discarded as drift copies
of things the repo already owns.

## Consequences

* \+ One reference, not two: humans browse <https://splotch.art/design>, agents read the `design`
  skill and the same route source — and neither can drift from the implementation, because the page
  imports `tokens.ts`, `palette.ts`, and the icon glob rather than restating values.
* \+ No new build or publish machinery: no vendored copies, no extra drift gates, no Pages workflow
  changes; the page ships with the ordinary web deploy and updates with it.
* \+ The brand half of the design language (voice, mascot, paper, palette, icon rules) is now
  documented at all — it previously lived nowhere in the repo.
* − The styleguide is on the public origin. That's deliberate (it's the shareable reference), but it
  means its quality bar is production: it's axe-scanned, listed in the sitemap, and a visual
  regression there is user-visible.
* − `/design` is SSR on every request (prerendering it would drag it into the native export); the
  cost is accepted for a low-traffic reference page.
* − The AI-authored static package's interactive drawing-screen mock was dropped rather than kept —
  the live app itself is the demo, so a parallel mock would only rot.
