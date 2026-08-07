# ADR-0100: Bake the Paper Grain into Opaque Per-Theme Tiles

**Status:** Proposed — the performance rationale did not replicate; revert is the standing
recommendation (see "Outcome"). Would amend [0052](0052-dark-mode-theme-tokens.md) if accepted.
**Date:** 2026-08

## Context

The drawing paper is a full-container `.paper-sheet` in `DrawingCanvas.svelte` carrying
`background-color: var(--paper)` under a repeating `handmade-paper.webp`. ADR-0052 chose that shape
deliberately: the webp is a **low-alpha grain** (alpha ≈ 0.07–0.29), so swapping only the color
beneath it darkens the paper with the grain intact, and no second asset has to be generated or kept
in sync.

A report of "sporadic tiling" flashing mid-page while the PWA loaded on Android Chrome sent us to
measure what that sheet costs to paint, via `LayerTree.profileSnapshot` over the drawing route's
document layer at 412×915 / DPR 3.

Two findings from that pass are solid, both measured on natively-loaded pages:

* **`.paper-sheet` is not promoted to its own compositor layer.** An identity `matrix()` transform
  does not promote in Chrome, so the sheet paints into the shared document layer.
* **That layer does not repaint while drawing.** Its `paintCount` was 4 after boot and still 4 after
  eight strokes — the canvas composites separately once strokes begin. Any cost here is boot paint,
  never stroke latency, and no interaction claim rests on it.

A third finding drove this ADR and turned out to be an artifact. An isolated variant sweep appeared
to show the grain roughly doubling the layer's paint (0.574 ms against a 0.321 ms untextured floor),
with an opaque baked tile landing at 0.291 ms — at the floor. That sweep swapped `background-image`
by injecting CSS onto an already-loaded page and snapshotting shortly after. The substituted image
was freshly requested, so each "fix" variant was measured **while it was not painting a texture at
all**, which is why every one of them landed at the untextured floor. The comparison never
distinguished texture strategies.

## Decision

**Two opaque tiles, generated from the token.** `scripts/gen-paper-texture.mjs` composites the alpha
grain onto each theme's `--paper` and writes `handmade-paper-{light,dark}.webp` with the alpha
channel removed, losslessly. `npm run gen:paper-texture` regenerates them; `:check` is the CI drift
gate beside `gen:tokens:check`.

The grain source moves to `scripts/assets/handmade-paper-grain.webp` — out of `web/static`, which
then serves only the baked tiles.

A `paperTexture` theme token carries each tile's `url()`, so `tokens.css` emits `--paper-texture` in
the light block, the `data-theme='dark'` block, and the `prefers-color-scheme` block through the
existing generator. `PAPER_TEXTURES` in `tokens.ts` holds the bare paths as the single source both
the token and the JS export compositor read.

Lossy compression of the tiles was rejected on measurement: the grain spans only ~21 levels per
channel and lossy webp's per-pixel error is the same order as the signal (q90 moves pixels up to 8
levels, q100 up to 5), so artifacts stand in for texture rather than softening it.

## Outcome — the change does not deliver a measurable win

Re-measured properly, as two real builds (`origin/main` against this change) profiled by the same
harness on the same machine, median of 11 document-layer paint snapshots:

| theme | before — alpha grain | after — baked opaque tile |
| ----- | -------------------: | ------------------------: |
| light |             0.486 ms |                  0.495 ms |
| dark  |             0.575 ms |                  0.532 ms |

No effect. The two themes disagree in sign, and the sample ranges overlap almost completely (light
before 0.40–1.16 ms, after 0.35–1.20 ms). The `image-rendering: pixelated` result from the original
sweep is the one variant that reused the already-loaded image, and it also showed no change —
consistent with this.

So the optimization this ADR exists to justify is not real. The change costs ~8 KB of extra precache
(25,648 B for the pair against 17,642 B for the grain), a generator plus CI gate, a theme-keyed
export-texture cache, and it reverses a standing ADR-0052 decision — with nothing measured in
return.

**Recommendation: revert.** The parts that could stand on non-performance grounds, if wanted
separately, are moving the alpha grain out of the served tree and replacing four hardcoded
`url('/icons/handmade-paper.webp')` sites with one `--paper-texture` token.

The reported Android load flash remains unexplained. It was never reproduced in a controlled run —
no cold load in any tested viewport, theme, throttle, or service-worker state painted it — and
nothing here should be read as having fixed it.

## Consequences (if accepted rather than reverted)

* `--paper` becomes baked into a binary. The CI drift gate catches a change that wasn't re-baked;
  `scripts/tests/paper-texture.test.mjs` separately asserts the shipped tiles carry no alpha and sit
  on their own theme's color, which the byte-level gate cannot see (it compares tiles against the
  same generator that produced them).
* **ADR-0052's second point stops holding.** "A pre-generated dark texture asset is unnecessary" was
  true of the alpha grain; the paper would ship one asset per theme. Its first, third, and fourth
  points are untouched.
* Any surface showing both papers at once must name each tile explicitly rather than read
  `--paper-texture`, which only ever resolves to the active theme — the `/design` styleguide's paper
  specimens do this, as they already do for their colors.
* The export compositor's texture cache is keyed by theme, so a save right after a theme switch
  cannot composite the other theme's paper.
