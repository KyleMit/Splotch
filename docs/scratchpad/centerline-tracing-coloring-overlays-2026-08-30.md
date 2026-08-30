# Centerline tracing the coloring-book overlays — measured, not adopted

**2026-08-30.** Question asked: would centerline tracing the shipped coloring outlines
(`web/static/coloring/{book}/{page}.overlay.svg`) reduce their drawing ops, keeping any solid region
— an eyeball, a pupil — as a fill shape rather than a line?

Measured across five pages with `tools/centerline-tracing`. **Answer: no, not worth adopting.** The
geometry does shrink, but every shipped metric lands within noise of the current assets while
fidelity drops visibly. Recorded here so the next session does not spend another ~4 hours of tracing
to reach the same place.

## What the overlays already are

They are not hand-drawn line work. `vectorize-coloring-overlays.mjs` traces a reviewed raster
through Vectorizer.AI and `tools/vectorize/postprocess-svg.mjs` runs SVGO over the result. So the
committed overlay is already an optimized vector: **4–13 compound paths** per page carrying arcs
(`a`), quadratics (`q`) and smooth shorthand, at 2-decimal precision. Across all 208 overlays: 1,130
paths, 1.75M coordinates, 7.9 MB.

Re-running SVGO over a shipped overlay recovers **1.3%** — confirmation that the source is already
at its optimized floor, and the reason there is little headroom for anything downstream to win.

## Measurements

Tracer settings that produced the best size result: `--width-mode constant --simplify-epsilon 0.6`.
The tracer emits one `<path>` per stroke with its own `stroke-width`; that is 172–618 paths per
page, so every "centerline" number below is **after** merging strokes into one compound path per
width group. Without that merge centerline output is strictly worse than the original on every axis.

| Page             | gzip orig → centerline | coordinates orig → centerline | IoU   |
| ---------------- | ---------------------- | ----------------------------- | ----- |
| `circle-tall`    | 7,320 → 6,799 (−7%)    | 3,456 → 2,087 (−40%)          | 0.902 |
| `apple-tall`     | 8,216 → 7,461 (−9%)    | 3,781 → 2,282 (−40%)          | 0.910 |
| `astronaut-tall` | 14,156 → 12,801 (−10%) | 6,584 → 4,008 (−39%)          | 0.910 |
| `owl-tall.dark`  | 19,190 → 15,238 (−21%) | 9,179 → 4,747 (−48%)          | 0.874 |
| `owl-tall` (pen) | 17,812 → 16,708 (−6%)  | 7,972 → 5,415 (−32%)          | 0.879 |

Rasterization (resvg, 1024 px wide, 15 interleaved rounds, median): original 27.0 ms, merged
centerline 25.7 ms, unmerged centerline 30.6 ms. The ~40% coordinate saving does **not** show up as
render time — stroke tessellation costs more per segment than filling does, which eats it.

The tracer's own reconstruction error on these inputs is 1.4–19.2, against 0.013–0.025 on the store
drawings it was tuned for. That gap is the honest signal: this art is outside what the measured
defaults were calibrated against.

### Fidelity is tunable, but not into a win

Tight settings (piecewise widths, ε=0.15) on `owl-tall` give IoU 0.926 — but 74.8 KB raw / 25.2 KB
gzip, i.e. **41% larger** than the 17.8 KB original. There is no configuration that beats the
Vectorizer.AI original on both size and fidelity at once.

## The solid-region question specifically

Real, and confirmed: the tracer scribble-fills solid regions with parallel overlapping strokes
rather than keeping them as fills. On `owl-tall` the diff overlay shows the black pupils as
blue/gray stripes while every thin line overlaps cleanly.

But it does not change the verdict. Scoring IoU split by `tools/asset-gen/lib/solid-regions.mjs`'s
solid mask (`solidPx` 9,512 of ~96,000 ink px, ~10% of the page):

| Region        | IoU   |
| ------------- | ----- |
| inside solid  | 0.757 |
| outside solid | 0.891 |
| overall       | 0.879 |

So solid regions really are the worst-reconstructed part — but they are 10% of the ink, and a
*perfect* fill-preserving fix would lift overall IoU only 0.879 → ~0.891. The remaining loss is the
ordinary thin strokes, from the Bézier refit and the loose epsilon the size win depends on. Building
solid-region → fill-shape emission is therefore not the thing standing between this experiment and
adoption.

## Why it does not pay off

The theoretical win — one centerline instead of two boundary sides — is real and shows up as the
~40% coordinate drop. It is then given back by:

* **encoding**: the tracer emits cubics only; the vectorizer emits arcs, quadratics and shorthand,
  which are more compact per unit of curve;
* **structure**: one `<path>` + `stroke-width` per stroke against a handful of compound paths;
* **rasterization**: stroked geometry tessellates more expensively than filled geometry;
* **solid regions**: scribble-filled instead of kept as fills.

Plus the operational cost: ~60 s per page of Python tracing, so ~3.5 h for all 208 overlays, added
to a pipeline that currently gets these directly out of the vectorizer.

## What would change this

* A tracer emitter that fits arcs/quadratics and groups strokes into compound paths by width — that
  is where the 40% coordinate saving currently leaks away.
* Solid-region detection feeding fill emission (`scoreSolidity` in
  `tools/asset-gen/lib/solid-regions.mjs` already produces the mask), which would recover the eye
  regions and let a tighter epsilon be affordable.

Both are real work against a ~6–21% gzip prize. Reopen if overlay payload becomes a live constraint.

## Where the win actually was

The same question asked of the **store drawings** did pay off, because those replay as pointer
strokes where each stroke and each pen switch is a real op. Chaining before quantizing cut 844
strokes to 700 and 439 pen switches to 275. See `tools/store-drawings/DESIGN.md`.
