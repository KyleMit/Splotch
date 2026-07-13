# Idea #7 — Catalog-wide residual dark halo audit after the punch

**Verdict: WORKED.** The auditor runs fully offline over all 94 shipped night fills in ~48 s, ranks
pages by a rim-darkness score, produces zoomed hotspot crops for human review, and works as a
byte-stable regression gate (a simulated punch change — idea #1's rim-erase — moves exactly the 4
gated pages' scores and no others). It surfaced at least three previously-unknown real halo pages
(`objects/teddy-wide`, `farm/duck-tall`, the background star on `dinosaur/pterodactyl-tall`). The
one expectation that did NOT hold: the known suspect `vehicles/train-wide` ranks mid-pack (#33), not
worst — its halo is locally severe but small in area, and pages nobody had checked carry more halo
pixels.

Everything ran against baseline `8e471b8`; 0 Gemini calls; the repo is pristine (the three scripts
ran from `tools/asset-gen/` temporarily and were deleted; the archived copies are in `code/`).

## How it works (`code/audit-night-halo.mjs`)

Generalizes idea #1's `analyze-rim.mjs` catalog-wide:

1. Enumerate every `web/static/coloring/**/*.night.webp` (94 pages).
2. Per page: load the raw (`fill-src/<page>.night.raw.webp`), the chalk, and the shipped punch.
   Build the chalk-ink mask exactly like `lib/punch-fill.mjs` (luma < 150).
3. Build a **reference punch**: the mask dilated by 4 px, then the standard neighbor bleed on the
   raw — i.e. "what the collar would look like if the fill color from beyond any plausible rim were
   inpainted all the way in".
4. For every pixel at chebyshev distance 1..3 from the ink,
   `rimΔ = luma(reference) − luma(shipped)`. A residual re-inked rim is a large positive Δ; a legit
   dark fill is ≈0 because the reference is equally dark there.
5. **haloScore** = % of band-1..2 pixels with `rimΔ > 40` **and** shipped luma in `[55, 145)` — idea
   #1's mid-dark penumbra window. The window is load-bearing: without it (the `rawScore` column) the
   ranking is dominated by legit near-black art adjacent to lines (`farm/cow-wide`'s black patches:
   rawScore 3.60 → haloScore 0.63).
6. Hotspots: 64-px tiles ranked by halo-pixel count, reported per page for cropping
   (`code/halo-crops.mjs` renders them through `lib/night-composite.mjs`, nearest-upscaled 4×, long
   side ≤ 560).

Runtime: 47–48 s for the whole catalog on this box (~0.5 s/page), single process. Cheap enough to
run after any punch change.

## Worst 10 (baseline, ranked by haloScore)

Manual verdicts from the crops in `crops/`:

|  # | page                      | haloScore % | lineW | crop verdict                                                                                                           |
| -: | ------------------------- | ----------: | ----: | ---------------------------------------------------------------------------------------------------------------------- |
|  1 | farm/cat-wide             |       2.448 |   165 | FALSE POSITIVE — hay-bale straps are deliberate mid-dark brown hugging lines (known from idea #1)                      |
|  2 | vehicles/police-tall      |       2.213 |   253 | likely deliberate — dark tire ring between concentric white wheel strokes; worth a human glance                        |
|  3 | dinosaur/pterodactyl-tall |       1.431 |   243 | **TRUE POSITIVE** — dark smudges inside a background star hugging the stroke (raw-quality, not punch-reachable)        |
|  4 | shapes/star-tall          |       1.398 |   254 | deliberate — mouth art on white                                                                                        |
|  5 | vehicles/monster-tall     |       1.248 |   240 | deliberate — grey shock-strut shading between lines                                                                    |
|  6 | space/station-tall        |       1.208 |   252 | ambiguous — window glow/vignette; borderline                                                                           |
|  7 | nature/caterpillar-tall   |       1.207 |   254 | deliberate — olive two-tone ring inside body spots                                                                     |
|  8 | creatures/fairy-tall      |       1.041 |   238 | mostly deliberate shading; a few dark specks near the ear strokes                                                      |
|  9 | objects/teddy-wide        |       1.015 |   250 | **TRUE POSITIVE** — obvious dark drop-shadow hugging the white smile/muzzle strokes on brown fur                       |
| 10 | farm/duck-tall            |       0.963 |   173 | **TRUE POSITIVE** — mouth/tongue outline re-inked dark brown around the white chalk strokes (train-wide-style failure) |

Precision in the top 10 is ~30–40% for "actionable halo", but that is the correct trade for an
audit: a human reviews 10 crops in under a minute instead of hand-zooming 94 pages, and every crop
verdict above took seconds.

**`farm/duck-tall` is the headline find**: its page-level lineW is 173 — comfortably above idea #1's
`lineW < 150` gate — because the re-inking is localized to the mouth. The median-based gate
structurally cannot see it; the band-based halo audit can.

`vehicles/train-wide` (the page that motivated the idea) ranks #33 by haloScore (0.269) and #22 by
max-hotspot density (111 halo px in one face tile). Its measured rim share matches idea #1's numbers
(rawScore 0.271 vs the 0.37% band-1 figure measured there), so the metric is consistent — the page
is simply not the catalog's worst, which is exactly the kind of thing a catalog-wide audit exists to
discover.

## Full ranked table (94 pages)

haloScore = % band-1..2 px with rimΔ>40 and luma∈[55,145); haloPx = absolute count; rawScore =
unwindowed rimΔ share; lineW = median max-3×3 raw luma over chalk ink (the idea-#1 gate metric, gate
< 150).

|  # | page                        | haloScore % | haloPx | rawScore % | lineW |
| -: | --------------------------- | ----------: | -----: | ---------: | ----: |
|  1 | farm/cat-wide               |       2.448 |   2547 |      2.959 |   165 |
|  2 | vehicles/police-tall        |       2.213 |   1531 |      2.632 |   253 |
|  3 | dinosaur/pterodactyl-tall   |       1.431 |   1109 |      1.553 |   243 |
|  4 | shapes/star-tall            |       1.398 |    558 |      1.473 |   254 |
|  5 | vehicles/monster-tall       |       1.248 |   1372 |      2.386 |   240 |
|  6 | space/station-tall          |       1.208 |   1097 |      1.528 |   252 |
|  7 | nature/caterpillar-tall     |       1.207 |    879 |      1.226 |   254 |
|  8 | creatures/fairy-tall        |       1.041 |   1204 |      2.421 |   238 |
|  9 | objects/teddy-wide          |       1.015 |    743 |       2.04 |   250 |
| 10 | farm/duck-tall              |       0.963 |    981 |      1.716 |   173 |
| 11 | dinosaur/brachiosaurus-wide |       0.824 |    758 |      0.984 |   239 |
| 12 | objects/balloon-wide        |       0.786 |    572 |      1.101 |   253 |
| 13 | creatures/pegasus-wide      |       0.707 |    724 |       1.04 |   209 |
| 14 | creatures/pegasus-tall      |       0.676 |    688 |      0.826 |   252 |
| 15 | creatures/dragon-wide       |        0.64 |    734 |      1.029 |   176 |
| 16 | farm/cow-wide               |       0.632 |    666 |      3.603 |   199 |
| 17 | space/meteor-wide           |       0.623 |    580 |      1.107 |   246 |
| 18 | space/station-wide          |       0.623 |    498 |      0.692 |   250 |
| 19 | farm/pig-wide               |       0.576 |    588 |      1.194 |   238 |
| 20 | shapes/star-wide            |       0.549 |    226 |      1.922 |   254 |
| 21 | space/ship-tall             |       0.513 |    369 |      0.555 |   251 |
| 22 | shapes/square-wide          |       0.474 |    277 |      0.484 |   252 |
| 23 | farm/dog-wide               |       0.464 |    371 |      0.922 |   214 |
| 24 | space/rover-tall            |       0.458 |    444 |      0.732 |   246 |
| 25 | nature/ant-wide             |       0.451 |    427 |      1.816 |   249 |
| 26 | creatures/mermaid-wide      |       0.445 |    615 |      1.109 |   194 |
| 27 | creatures/owl-tall          |       0.441 |    413 |      1.616 |   201 |
| 28 | creatures/fairy-wide        |       0.422 |    691 |      0.825 |   237 |
| 29 | space/astronaut-wide        |       0.376 |    340 |       0.68 |   190 |
| 30 | creatures/unicorn-tall      |       0.367 |    403 |       0.84 |   249 |
| 31 | creatures/unicorn-wide      |       0.316 |    376 |      0.497 |   168 |
| 32 | nature/ladybug-wide         |       0.287 |    247 |      1.206 |   249 |
| 33 | vehicles/train-wide         |       0.269 |    321 |      0.271 |    75 |
| 34 | creatures/mermaid-tall      |       0.265 |    376 |      0.464 |   225 |
| 35 | dinosaur/pterodactyl-wide   |       0.248 |    212 |      0.379 |   245 |
| 36 | objects/teddy-tall          |       0.222 |    184 |       0.23 |   249 |
| 37 | vehicles/train-tall         |       0.221 |    247 |      0.409 |   254 |
| 38 | space/ship-wide             |        0.22 |    147 |      1.322 |   250 |
| 39 | dinosaur/velociraptor-wide  |       0.218 |    294 |      0.676 |   162 |
| 40 | vehicles/fire-wide          |       0.206 |    268 |      0.477 |   241 |
| 41 | vehicles/excavator-wide     |       0.203 |    216 |      0.384 |   238 |
| 42 | farm/pig-tall               |       0.193 |    140 |      0.509 |   254 |
| 43 | vehicles/garbage-tall       |       0.177 |    175 |      0.252 |   170 |
| 44 | farm/duck-wide              |       0.161 |    159 |      0.344 |   148 |
| 45 | nature/bee-tall             |       0.161 |    126 |      0.451 |   254 |
| 46 | objects/balloon-tall        |        0.16 |     86 |      0.387 |   254 |
| 47 | nature/bee-wide             |       0.159 |    149 |      0.398 |   252 |
| 48 | vehicles/garbage-wide       |       0.159 |    208 |      1.056 |   234 |
| 49 | farm/horse-tall             |       0.156 |    152 |      0.509 |   252 |
| 50 | space/moon-tall             |        0.15 |     67 |      0.687 |   250 |
| 51 | space/moon-wide             |       0.147 |     66 |      0.809 |   224 |
| 52 | nature/caterpillar-wide     |       0.124 |     81 |       0.37 |   127 |
| 53 | shapes/square-tall          |        0.12 |     57 |      0.177 |   253 |
| 54 | nature/snail-wide           |       0.115 |     78 |      0.189 |   252 |
| 55 | dinosaur/trex-wide          |       0.113 |    106 |      0.177 |   148 |
| 56 | farm/cow-tall               |       0.107 |     91 |      0.244 |   218 |
| 57 | creatures/dragon-tall       |       0.101 |    113 |      0.181 |   233 |
| 58 | dinosaur/triceratops-wide   |       0.098 |     98 |      0.167 |   233 |
| 59 | dinosaur/velociraptor-tall  |       0.093 |    100 |      0.333 |   182 |
| 60 | vehicles/police-wide        |       0.087 |     76 |      0.369 |   245 |
| 61 | vehicles/excavator-tall     |        0.08 |     71 |       0.55 |   209 |
| 62 | vehicles/monster-wide       |       0.067 |     79 |      0.488 |   216 |
| 63 | space/rover-wide            |       0.066 |     82 |      0.338 |   211 |
| 64 | farm/dog-tall               |       0.064 |     55 |      0.192 |   254 |
| 65 | creatures/owl-wide          |       0.053 |     66 |      0.101 |   174 |
| 66 | farm/horse-wide             |        0.05 |     54 |      0.199 |   223 |
| 67 | objects/flower-tall         |       0.042 |     26 |      0.114 |   251 |
| 68 | dinosaur/stegosaurus-wide   |       0.038 |     42 |      0.103 |   215 |
| 69 | nature/ant-tall             |        0.03 |     27 |      0.232 |   252 |
| 70 | space/meteor-tall           |       0.025 |     20 |      0.476 |   251 |
| 71 | dinosaur/brachiosaurus-tall |       0.024 |     25 |      0.114 |   214 |
| 72 | farm/cat-tall               |       0.022 |     23 |      0.127 |   251 |
| 73 | objects/house-tall          |       0.019 |     18 |      0.032 |   252 |
| 74 | dinosaur/trex-tall          |       0.017 |     17 |      0.388 |   214 |
| 75 | dinosaur/triceratops-tall   |       0.013 |     12 |      0.092 |   248 |
| 76 | objects/umbrella-wide       |       0.013 |      9 |      0.151 |   240 |
| 77 | dinosaur/stegosaurus-tall   |       0.009 |     10 |      0.102 |   248 |
| 78 | shapes/triangle-wide        |       0.006 |      4 |      0.014 |   253 |
| 79 | objects/apple-tall          |       0.005 |      3 |      0.275 |   253 |
| 80 | shapes/triangle-tall        |       0.005 |      2 |      0.007 |   254 |
| 81 | objects/apple-wide          |       0.002 |      2 |      0.002 |   200 |
| 82 | shapes/circle-wide          |       0.002 |      1 |      0.011 |   251 |
| 83 | objects/flower-wide         |       0.001 |      1 |      0.114 |   242 |
| 84 | nature/ladybug-tall         |           0 |      0 |          0 |   254 |
| 85 | nature/snail-tall           |           0 |      0 |      0.001 |   249 |
| 86 | nature/spider-tall          |           0 |      0 |      0.001 |   254 |
| 87 | nature/spider-wide          |           0 |      0 |       0.02 |   181 |
| 88 | objects/house-wide          |           0 |      0 |      0.003 |   249 |
| 89 | shapes/circle-tall          |           0 |      0 |      0.003 |   254 |
| 90 | shapes/heart-tall           |           0 |      0 |      0.007 |   254 |
| 91 | shapes/rectangle-tall       |           0 |      0 |      0.002 |   254 |
| 92 | shapes/rectangle-wide       |           0 |      0 |          0 |   251 |
| 93 | space/astronaut-tall        |           0 |      0 |          0 |   212 |
| 94 | vehicles/fire-tall          |           0 |      0 |      0.019 |   224 |

Catalog stats: median haloScore 0.21; 20 pages ≥ 0.5; 33 pages ≤ 0.05 (shapes/objects/nature pages
with clean bright lines are effectively zero — the metric does not fire on healthy pages).

## Regression-gate demo (baseline vs simulated punch change)

Ran the identical auditor twice: `--rim-erase` applies idea #1's validated rim-erase (mask + 2 px of
mid-dark collar, luma∈[55,145), only on pages with lineW < 150) before scoring, simulating the
proposed punch change.

| page                    | haloScore before | after | erased px |
| ----------------------- | ---------------: | ----: | --------: |
| vehicles/train-wide     |            0.269 | 0.099 |    53 748 |
| farm/duck-wide          |            0.161 | 0.003 |    51 919 |
| nature/caterpillar-wide |            0.124 | 0.000 |    20 493 |
| dinosaur/trex-wide      |            0.113 | 0.083 |    39 941 |

**Exactly the 4 gated pages moved; the other 90 scores are byte-identical** — the gate both detects
the improvement and proves the change is a no-op elsewhere. (Side discovery: the lineW < 150 gate
currently matches 4 pages, not just train-wide as idea #1's spot-checks suggested — duck-wide 148,
caterpillar-wide 127, trex-wide 148.)

Visual confirmation at the same view (nearest-neighbor 4×):

* `train-wide-mouth.before.webp` / `.after.webp` — the dirty shadow around the train's mouth/chin is
  gone after rim-erase.
* `duck-wide-hotspot.before.webp` / `.after.webp` — subtler; the bill-contour shadow lightens.

Also tested rim-erase **ungated** on the two new true positives (`code/halo-before-after.mjs`
applies it unconditionally):

* `teddy-wide-smile.before/.after.webp` — the smile drop-shadow lightens noticeably but a soft
  remnant survives (the shadow is a wide gradient extending past r=2).
* `duck-tall-mouth.before/.after.webp` — barely changes: the re-inked outline is ~6–10 px thick, far
  beyond the 2-px erase. Fixing duck-tall means regenerating the raw (idea #15 territory), not
  tweaking the punch.

So the audit finds real failures the current fixer cannot reach — which is what you want from the
*detection* half of the loop.

## What didn't work / limitations

* **The naive unwindowed rimΔ score is not shippable as a ranking.** First full run ranked
  `farm/cow-wide` #1 (3.60) purely on its deliberate black patches. The mid-dark window [55,145)
  rescued the ranking; it is copied from idea #1's empirically-derived rim-erase bounds, so the two
  tools stay in agreement about what "halo" means.
* **Deliberate mid-dark art hugging lines is indistinguishable from halo by local statistics alone**
  (cat straps, tire rings, two-tone spot rings, strut shading). The dilate-4 reference bleeds *over*
  any feature thinner than ~4 px, so thin deliberate features look exactly like rim. Crops + 10
  seconds of human eyeball per page is the practical disambiguator; a raw-vs-outline comparison
  (does the PEN outline have a stroke there?) could automate some of it but was out of time-box.
* **Page-level share dilutes localized failures.** train-wide's halo is concentrated in ~6 face
  tiles; by share it ranks #33. The per-page hotspot list compensates (its face tile carries 111
  halo px, rank #22 by that measure) — an audit consumer should look at both columns.
* The metric measures the *punched fill* at asset scale, not the on-screen bilinear-downscaled
  render; a truly display-scale metric would score after resize to device CSS pixels. At 4× zoom the
  crops match what the eye sees, so this refinement wasn't needed to get actionable output.
* `compositeNight` recomputes the punch mask from the chalk, so composite crops of the *shipped*
  fill are exact; for the rim-erased fill the composite screens the same chalk, so before/after
  views are strictly comparable.

## Recommendations

1. **Adopt the auditor as a permanent tool** (`tools/asset-gen/` + an `audit:` npm script): 48 s,
   offline, deterministic. Run it after any change to `lib/punch-fill.mjs`, the chalk generator, or
   a raw regen, and diff the scores JSON — any page whose haloScore moves unexpectedly is a
   regression.
2. **Store the baseline scores JSON** (committed or in CI cache) so the gate is a one-line diff; the
   demo showed unchanged pages reproduce bit-identical scores.
3. **Triage queue for art fixes**: teddy-wide (punch-adjacent, partially fixable), duck-tall +
   pterodactyl-tall's star (raw regen needed). These are shipped visible defects found by this run.
4. If idea #1's rim-erase lands, gate it on this auditor's per-page haloScore rather than (or in
   addition to) page-median lineW — lineW misses localized re-inking (duck-tall, lineW 173).

## Files

* `code/audit-night-halo.mjs` — the catalog auditor (drop into `tools/asset-gen/`).
* `code/halo-crops.mjs` — hotspot crop renderer from a scores JSON.
* `code/halo-before-after.mjs` — same-view before/after composites (ungated rim-erase).
* `scores-baseline.json`, `scores-rimerase.json` — full per-page results (band stats + hotspots
  included).
* `crops/*.webp` — worst-12 hotspot crops (composite, 4× nearest).
* `train-wide-mouth.*`, `duck-wide-hotspot.*`, `teddy-wide-smile.*`, `duck-tall-mouth.*` —
  before/after pairs.
