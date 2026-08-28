# Crayon native campaign 2 — appearance evidence

Working evidence for [ADR-0148](../../../adrs/0148-crayon-per-op-glaze-on-native.md) and the
[campaign log](../crayon-native2-2026-08-27.md). Kept here rather than in `/scrapbook` because it is
the working behind a decision, not a designed artifact — see `docs/scratchpad/README.md`.

## `crossing-baseline-d4-d5.png`

The three pipelines, drawn on the physical iPad through trusted touch: yellow band, then blue across
it. Left to right — the shipped `planes` baseline, the rejected fully-subtractive `m = 1` candidate,
and the per-op glaze that shipped. The middle one is the 4× win that was **rejected on appearance**
because `min` is a fixed point, so redrawing never reaches the new colour.

## `crayon-glaze-sweep.html`

45 renders: the web pipeline as a reference row, then eight `perOpGlazeReturn` candidates, each
across 1/2/3/5/8 redraws of blue over yellow. Every cell carries the measured crossing colour.

What it shows, and why the decision needed a grid rather than a number: **the first crossing and the
accumulation curve disagree about the best value.** 0.14–0.18 tracks web's first crossing (153);
0.06–0.10 tracks its accumulation. 0.24 and 0.45 saturate by the second redraw and stop moving; 0.04
never arrives. No single value matches web everywhere, which is per-op glazing's speed-dependence
made visible.

Two limits it cannot escape:

* **One stroke speed.** These are fast synthetic strokes (~3 overlapping ops per pixel). A hand
  overlaps more, which shifts the optimum down — the reason the device-tuned value and the sweep's
  nominal optimum differ without contradicting each other.
* **Colour, not cost.** Rendered in desktop WebKit, which reproduces the device's pixels because
  canvas compositing is spec-defined, but says nothing about frame cost.

**These are retained one-off artifacts, not regenerable from this branch.** The tools that produced
them are not here: `gen:crayon-glaze-sheet` arrives with the sibling PR #1449, and
`gen:crayon-glaze-match` lives only on `exp/crayon-glaze-web-match`. Both were run against the
2026-08-27 working tree at `perOpGlazeReturn = 0.16` per band over two density bands, drawing
`Yellow` then `Blue` from the palette through `/dev/engine` in desktop WebKit. Once #1449 lands the
sheet becomes regenerable; until then treat the committed copies as the record.
