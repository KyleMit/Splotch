# Idea #14 — Local-warp registration check (the shimmer suspect)

**Verdict: WORKED.** The per-tile displacement scorer was built, run over all 188 committed raws
(94 night + 94 light), and it found genuine local warp on shipped pages — including one visible
double-feature in the final dark-mode composite. The headline hypothesis, however, is **refuted**:
big global nudges do NOT correlate with local warp.

## What was built

`warp-scan.mjs` (in `code/`) — a tile-wise cross-correlation scorer:

- Loads the page's source line art (chalk for night raws — the art night fills punch against —
  pen outline for light raws) and the committed raw fill at native resolution (1536×1024).
- Computes polarity-agnostic gradient edge maps for both (same construction as
  `lib/align-to-source.mjs`, so dark light-raw lines and white night-raw lines score identically);
  the fill's edge map gets a 3×3 box blur to smooth the correlation surface.
- Divides the page into ~128px tiles (12×8 on a wide). For each tile with ≥300 strong source-edge
  pixels, searches ±12px for the offset maximizing edge-weighted correlation (offsets visited in
  order of increasing magnitude so plateau ties resolve to the smallest displacement).
- Per tile it records the displacement vector, `gain` (best score / zero-offset score) and `peak`
  (best / mean over all offsets). Per page: the component-wise median tile vector = residual
  global shift; each tile's **local warp** = |tile vector − median vector|; summary =
  max / p90 / median of the local warps.
- Runtime ≈ 1 s/page fully offline; the whole catalog scans in ~3 min. 0 Gemini calls used.

`gain` turned out to be the load-bearing confidence signal:

- `gain ≈ 1.0` + large displacement → correlation plateau (flat background, bottom-edge tile);
  not a warp. (pig-wide's raw 8px tile is this.)
- `gain` huge (≳10, zero-score ≈ 0) → the fill has **no** edges where the source has ink — a
  *missing/whitened feature*, not a displaced one (astronaut-tall's 17.7px tile is the chalk's
  whitened-solid face, the same keep-gate blind spot pipeline.md already documents).
- `1.3 ≤ gain < 10` + displacement ≥ 3px → a genuinely displaced feature. All hand-verified
  positives sit here (gains 1.4–4.6).

## The warp ranking (confident tiles, gain ≥ 1.3, < 10)

Distribution of per-page max confident local warp:

| theme | < 2px | 2–4px | 4–8px | ≥ 8px |
| --- | --- | --- | --- | --- |
| night | 87 | 3 | 0 | 4 |
| light | 82 | 9 | 2 | 1 |

Flagged pages (warpMax ≥ 4 native px ≈ 1.3px at the 512 gate mask):

| page | theme | warpMax | tiles ≥3px | eyeballed |
| --- | --- | --- | --- | --- |
| shapes/star-tall | night | 16.3 | 1 | **GENUINE** — background sparkle drawn ~12px up-left of the chalk's; the simulated composite shows a visible double sparkle (`viz/shapes-star-tall-night-worst-tile{,-composite}.webp`) |
| space/astronaut-tall | night | 15.6 | 3 | false positive — chalk-whitened solid (fill has no edges there); composite renders correctly |
| vehicles/train-wide | night | 11.7 | 4 | mixed — this is the known dark-outline ⚠ page; its re-inked dark lines give noisy edge matches at the track rows; composite crop shows dimmed fill ink inside the chalk lines but no hard double |
| dinosaur/pterodactyl-tall | night | 9.8 | 2 | **GENUINE** — background star filled smaller/offset inside the chalk star outline |
| shapes/triangle-wide | light | 13.4 | 2 | false positive — aperture problem: one long straight diagonal line lets the correlation slide along the line direction; the actual fringe is ~1–2px |
| objects/umbrella-wide | light | 5.0 | 14 | **GENUINE** — corner flower self-drifted ~5–7px (the exact nature/ant-wide failure mode, shipped); also carries a residual global (−2,−1) |
| farm/duck-wide | light | 4.0 | 18 | **GENUINE** — mild systematic ~3–4px warp across the wing region, red/cyan fringing on one side of every line |

Warn band (3–4px): creatures/pegasus-wide + nature/ant-wide (night), nature/bee-wide +
space/station-wide (light) — bee-wide's 14 tiles at 3px is real, borderline fringing.

## The nudge ↔ warp correlation answer: NO

The three big-global-nudge pages from IDEAS.md are among the *cleanest* pages in the catalog:

| page | night rank (of 94) | night warpMax | light rank | light warpMax |
| --- | --- | --- | --- | --- |
| farm/pig-wide (−11,0) | 57 | 0.0 | 62 | 0.0 |
| vehicles/excavator-wide (−9,0) | 34 | 1.0 | 89 | 0.0 |
| dinosaur/stegosaurus-wide (−11,0) | 27 | 1.0 | 53 | 0.0 |

Big-nudge group means sit *below* the population means on every metric (confMax, p90, median).
A big global nudge is evidently just the model translating an otherwise-rigid redraw; local warp
comes from a different failure mode — small **background decorations** (sparkles, stars, corner
flowers) redrawn free-hand rather than traced. That's also why the worst offenders are night
pages: the night fill redraws against the chalk, and tiny background features are the ones it
re-imagines.

## Shimmer-risk assessment

- The worst genuine case (star-tall night) is not "shimmer at reveal edges" but a static double
  feature: the chalk overlay shows the outlined sparkle and the punched fill contributes a
  glowing offset sparkle blob. It shipped because the sparkle tile is small/dim enough that the
  outlineMatch worst-tile gate (80% at 512, ±2px tolerance, 64px tiles) averaged it away.
- duck-wide/bee-wide-style 3–4px systematic fringing is the classic "wrong color just outside
  the line under the magic brush" risk; at 3–4 native px (~1px at the 512 mask) it survives the
  ±2px gate tolerance by design.
- Live run-splotch reveal inspection was skipped (sandbox impractical); the simulated composite
  (`lib/night-composite.mjs`) is the same math the app renders, so the star-tall double is what a
  child sees.

## Limitations

- **Aperture problem**: tiles whose source ink is one straight line are unconstrained along the
  line direction (triangle-wide's 13.4 is inflated this way). A production gate should add an
  edge-orientation-dispersion guard or clamp displacement to the component normal to the
  dominant orientation.
- **Whitened chalk solids** read as huge-gain missing-feature tiles; the `gain < 10` filter
  screens the worst but astronaut-tall still leaks neighbors through. Whitening pen solids out
  of the reference (pipeline.md's own suggested keep-gate fix) would clean this up.
- **Dark re-inked night pages** (train-wide) give noisy fields — the fill's own dark lines and
  the chalk's whites both generate edges.
- Historical per-page nudge values are not recorded anywhere in the repo (raws are committed
  post-alignment; lossy webp + flat margins defeat reconstructing the nudge from the
  `extendWith:'copy'` smear band), so the correlation test used the three known values from
  IDEAS.md against the rest of the population rather than a full regression.

## Recommendations

1. Add a `warpMax` audit (this scorer) beside `gen:coloring-fills:audit`: **fail ≥ 4px**
   confident local warp (gain 1.3–10), **warn ≥ 3px**. On today's catalog that flags 7 pages,
   4 genuine.
2. Regenerate the two genuine night offenders (shapes/star-tall, dinosaur/pterodactyl-tall) and
   consider umbrella-wide + duck-wide light fills.
3. Drop "big global nudge" as a shimmer heuristic — it's exonerated.
4. If productionized: add the orientation-dispersion guard and whiten pen solids out of the
   source reference first.

## Files

- `code/warp-scan.mjs` — the scorer/batch runner (copy into `tools/asset-gen/` to run; imports
  `lib/paths.mjs` + root `sharp`). `node tools/asset-gen/warp-scan.mjs --theme both --out DIR`
- `code/warp-viz.mjs` — heatmap + worst-tile crops + night-composite crop for one page
- `code/analyze-warp.mjs` — ranking + hypothesis test over the scan JSON
- `warp-both.json` — full per-tile displacement fields for all 188 raws
- `viz/` — 32 evidence images (heatmaps, tile crops red=source-only / cyan=fill-only /
  black=aligned, composites)
