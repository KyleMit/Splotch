# ADR-0075: Don't Preload the Web Font — the Drawing Route Paints No Text

**Status:** Active **Date:** 2026-07

## Context

A page-load audit flagged the Quicksand web font as a Speed Index lever: on a bad-variance phone
first-visit run the font wasn't fetched until ~3.9 s (discovered via the `document.fonts.load`
warm-up in `+layout.svelte`'s `onMount`, i.e. after hydration + idle), and the run scored Perf 82 /
SI 4.3 s. The proposed fix was to SSR-render a `<link rel="preload" as="font">` for the latin subset
so the browser fetches the font during the initial HTML parse instead of after hydration.

The intuition — "the font arrives late, so preload it early" — is mechanically sound but rests on an
unchecked premise: that earlier font arrival improves what the user sees. It does not, on this
route.

Alternatives considered:

* **Preload the latin woff2 at the root layout** (the proposal). Built and measured on a Netlify
  branch preview against production, phone-first, 3 runs each (see Decision for numbers).
* **Preload only on the text-bearing routes** (`/privacy`, `/admin`) via their own layouts. Those
  routes aren't page-load-sensitive (prerendered static, rarely a cold entry point), so the added
  complexity buys nothing measurable.
* **Do nothing** (keep the existing idle warm-up). Chosen.

## Decision

**No web-font preload.** `+layout.svelte` keeps only the existing idle `document.fonts.load`
warm-up; no `<link rel="preload">` is added.

The decision is empirical. A `preload` branch preview vs. production (phone portrait, simulated Slow
4G + 4× CPU, 3 runs, medians):

| Metric   | Production (no preload) | Preview (preload) | Verdict                   |
| -------- | ----------------------- | ----------------- | ------------------------- |
| Perf     | 97                      | 97                | flat                      |
| LCP      | 1.54 s                  | 1.68 s            | **~140 ms regression**    |
| TBT      | 171 ms                  | 175 ms            | flat                      |
| SI       | 1.95 s                  | 2.02 s            | not improved              |
| font end | 1950 ms                 | 911 ms            | preload works as intended |

The preload does move the font ~1 s earlier — and that is precisely the problem. The LCP regression
was consistent, not variance: all three preview LCP runs (1.68 / 1.69 / 1.68 s) sat above all three
production runs (1.50 / 1.61 / 1.54 s) with zero overlap. On the ~1.6 Mbps Slow-4G pipe the
VeryHigh-priority 28 KB font fetch competes with the LCP resource (the `.paper-sheet` background
texture) and pushes it later.

Why there is no offsetting Speed Index win — the invariant to remember: **the drawing route paints
no text.** The Lighthouse LCP element is `.paper-sheet`, not text; the `font-display` audit already
scores 1.0 (fontsource ships `font-display: swap`, so text never blocks on the font); and no visible
glyph on the initial viewport uses Quicksand. The font is off the critical *visual* path entirely,
so its fetch timing can't move SI on this route. The "font at 3.9 s / SI 4.3 s" observation that
motivated the change was a single bad-variance run (reproduced here once as SI 3.70 s / font end
3494 ms); typical production runs already fetch the font by ~1.6–1.9 s and score Perf 97.

## Consequences

* \+ No LCP regression on the primary route; production stays at phone-first Perf ~97, LCP ~1.54 s.
* \+ Records the non-obvious constraint so the "just preload the font" idea isn't re-attempted: on a
  text-less route a font preload is a pure cost, and (separately) preloading a resource the initial
  paint never uses is the kind of thing Lighthouse's "preloaded but not used" heuristic exists to
  catch.
* − The font still isn't fetched until the idle warm-up runs (~1.6–1.9 s). Acceptable: the first
  text-bearing surface is a parent-facing dialog (Parent Center, AI prompts) opened well after boot,
  by which point the warm-up has long since resolved.
* − If a future redesign puts Quicksand text on the initial drawing viewport, this decision must be
  revisited — the font would then be on the visual path and a scoped preload could help. Re-measure
  before assuming.

### Related: further idle-boot slicing was also investigated and declined

The same audit proposed slicing the post-load idle long tasks. `perf:mount` traces (3 runs) showed
those tasks are variance-dominated (0–2 tasks per run, 50–154 ms) and attributable to the barrel
module evaluation (~130 ms CPU, intermittent) plus the `AudioContext` sound-decode (17–43 ms each) —
individual overlay mounts measured < 40 ms. [ADR-0049](0049-idle-mount-boot-hidden-overlays.md)
already anticipated and accepted these as the intentional idle warm-up trade-off. No safe, provable
slice was found, so the boot code is unchanged.
