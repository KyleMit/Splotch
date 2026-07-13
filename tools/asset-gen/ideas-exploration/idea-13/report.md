# Idea 13 — Gate colored-shape invention on the open background

**Verdict: WORKED.** The detector was built, validated in both directions, and the catalog sweep
answered the idea's open question: colored-shape invention **did ship** — 11 of the 94 night raws
carry confirmed invented shapes that no existing gate could have caught (23 blobs total). Zero
compact inventions in the 94 light raws. Fully offline; 0 Gemini calls.

## What was built

`code/invented-shape-audit.mjs` (ran as `tools/asset-gen/idea13-invented-shape-audit.mjs`; it must
live inside `tools/asset-gen/` so `sharp` and `lib/*.mjs` resolve). Algorithm:

1. **Flood the open background** from the image border through source pixels brighter than 170 — the
   exact machinery of `scoreNightness` (night fills score against the chalk when forked, pen
   otherwise; light fills against the pen).
2. **Mask source ink**: pixels darker than 110, dilated by 6 px (`lib/morphology.mjs`), same slack
   as `scoreDrift`'s `DRIFT_DILATE`. Candidates = flooded bg minus this mask.
3. **Median background color** over candidates, then mark candidates whose RGB Euclidean distance
   from the median exceeds `DEV_T = 60` as *foreign*.
4. **Connected components** over foreign pixels; per blob record area, mean color, bbox, and
   **anchor fraction** = share of blob pixels adjacent to the dilated ink mask *or* on the image
   border.
5. **Flag** blobs with `60 <= area <= 8000` (at working width 512) and `anchorFrac < 5%`. Floating
   blobs *above* 8000 px are reported separately as "washes" (info, not failures).

Key design insight: **anchoring, not saturation, is the discriminator.** A legit fill that leaks
into the flooded bg (an edge-open region — a road running off the page, the ground under a subject)
always butts against its own source outline or the page edge. An invented star/planet/smoke-puff
floats free of both. Chroma alone fails twice over: real inventions turned out to be mostly *pale*
(smoke, road dashes, rings — exactly the thick-white-blob class `scoreDrift`'s morphological opening
deliberately exempts), and night backgrounds are themselves chromatic navy.

## Sweep results — the shipped-invention catalog

All 188 committed raws (94 light + 94 night) audited in ~40 s. Flagged, each visually confirmed
against its source line art:

| Page (night)           | Blobs           | What the model invented                                                                                          |
| ---------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| shapes/star-tall       | 4 (817–1180 px) | pink + teal 4-point sparkles around the star (source's own sparkles sit elsewhere and are correctly not flagged) |
| vehicles/police-wide   | 1 (1283 px)     | extra white road dashes — source outlines one dash, fill painted three                                           |
| dinosaur/trex-wide     | 1 (1279 px)     | pale eruption smoke puff floating between volcano and cloud                                                      |
| creatures/owl-wide     | 1 (229 px)      | brown three-lobed tuft hanging under the branch                                                                  |
| space/astronaut-tall   | 1 (167 px)      | white ring/bubble in open sky                                                                                    |
| space/station-tall     | 3 (60–108 px)   | free-floating teal glow orbs                                                                                     |
| vehicles/train-tall    | 3 (60–132 px)   | grey pebbles scattered on the open ground                                                                        |
| space/rover-tall       | 5 (64–667 px)   | pale moon/nebula wisps in the sky (a couple may be detached halos of source stars)                               |
| space/rover-wide       | 1 (151 px)      | pale wisp near the ground                                                                                        |
| farm/horse-tall        | 2 (65–195 px)   | ghostly crown-shaped patch painted into the grass                                                                |
| creatures/unicorn-tall | 1 (456 px)      | detached pale halo below the bottom-right plant                                                                  |

The idea's three "try-on" pages behaved as predicted for two of three: trex-wide (the near-threshold
drift keeper) and police-wide both carry real inventions; ship-tall is genuinely clean (its pale
exhaust ground is an edge-anchored wash and is correctly not flagged).

Separately reported washes (floating foreign regions > 8000 px — second background colors, not
shapes): monster/velociraptor/triangle ground bands (intended art) and **nature/caterpillar-tall
(light + night)** — a ~21.7k px branch-colored wash spilling far into open sky, arguably the one
wash worth a human re-look.

## Synthesized positive (both directions proven)

`code/inject-blob.mjs` pastes a saturated orange ringed planet (r=36 px) and a small golden star
(r=16 px) into automatically-located deep-open-background spots of a clean page:

* `space/ship-tall.night` unmodified -> **0 flags** (`img/ship-clean.webp`)
* injected copy -> **2 flags**, exactly the planet (area 1221, rgb 228,150,63) and the star (area
  84, rgb 217,184,79) — `img/ship-injected.webp`, detection overlay `img/ship-injected-detect.webp`.

Detection floor ~= 17x17 px full-res (MIN_BLOB 60 at width 512 on a 1024-wide page); the injected
r=16 star (area 84) clears it comfortably.

## Threshold rationale

* **W=512, SRC_DARK=110, SRC_LIGHT=170, LINE_DILATE=6** — inherited unchanged from
  `scoreDrift`/`scoreNightness` so the gate sees the same geometry they do.
* **DEV_T=60** (RGB distance from bg median): night bg ~ rgb(20–45); real inventions measured 65–230
  per channel off-median. 60 tolerates bg gradients/texture; corner moonbeam vignettes DO exceed it
  but die on anchoring.
* **MIN_BLOB=60**: smallest confirmed real invention (station orb) is exactly 60; below that lies
  glow speckle.
* **MAX_BLOB=8000**: largest confirmed invention 1283 px vs smallest wash 21668 px — the cap sits in
  a 17x gap.
* **ANCHOR_MAX=5%** (line + border contact): confirmed inventions measure 0–3.4%; false-positive
  classes measure: edge-open legit regions 9.4–12.6% (house path, police-light roadside grass), glow
  halos of source shapes 20–40%, corner vignettes 22–56%. Nearest miss is house-wide.night's path at
  9.4% vs the true police dash at 3.2% — a real but workable margin, documented below.

False-flag validation on genuine art: source-drawn moons/stars (owl, moon pages, star-tall's own
bottom sparkles), line glow, corner vignettes, and ground washes all pass. Final false-positive
count on the 188-fill catalog: arguably 0 — every flagged blob is paint the model added with no
source counterpart (a few rover wisps are borderline "mood" a human might keep).

## What didn't work along the way

* **Pure floating rule without border anchoring** flagged the big painted ground washes (monster,
  velociraptor, triangle) — fixed by counting border contact as anchoring plus the MAX_BLOB wash
  split.
* **Absolute border-contact threshold** (borderPx >= 12 => wash) un-flagged the real police-wide
  road dash (it touches the frame bottom with 41 px) while corner vignettes with border 38–102 px
  needed suppression — relative (per-area) anchoring separates them cleanly; absolute does not.

## Limitations

* An invention hugging a source line or the page edge (>5% of its pixels) is missed by design —
  anchoring is the discriminator.
* An invention colored within DEV_T of the bg median (navy-on-navy) is invisible — but nearly
  invisible to the child too.
* Enclosed source regions are never audited (wrong colors *inside* outlines are a different gate's
  job); flood leakage into edge-open regions is handled by anchoring, not prevented.
* Faint wisp-glow sits near the decision boundary (rover-tall); as a generation gate this argues for
  keep-best-of-N on flagged-blob area rather than hard reject.
* Thresholds are calibrated on this catalog + `gemini-2.5-flash-image` output; a model change
  warrants a re-sweep.

## Recommendations

1. **Ship as a standalone audit** beside `gen:coloring-fills:audit` (the script already sweeps
   `fill-src/` offline, no key) and run it before shipping any fill batch.
2. **Wire as a fifth gate** in `gen-coloring-fills-dark.mjs`'s `generateCleanTake`: export
   `detectInventedShapes` from a lib module, score each aligned take, and require
   `flagged.length === 0` for acceptance (fold into the keep-best ranking as tie-breaker on flagged
   area).
3. **Regenerate the blatant shipped cases**: star-tall (4 sparkles), police-wide (road dashes),
   trex-wide (smoke puff), astronaut-tall (ring), owl-wide (tuft), station-tall (orbs), train-tall
   (pebbles) — then re-punch. The subtle ones (horse ghost patch, unicorn halo, rover wisps) are
   contact-sheet judgment calls.

## Files

* `code/invented-shape-audit.mjs` — detector + sweep CLI (`--verbose`, `--overlay`,
  `--file/--page/--theme` for gating arbitrary candidates). Copy into `tools/asset-gen/` to run.
* `code/inject-blob.mjs` — synthesized-positive generator (imports the detector; same placement
  rule).
* `img/` — evidence: `ship-clean` / `ship-injected` / `ship-injected-detect` (synthesized positive),
  `real-*` before/after crops of shipped inventions.
