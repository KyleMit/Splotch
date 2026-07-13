# Idea #8 — Light↔night palette coherence

**Verdict: WORKED** (both halves validated: the offline region-hue scorer ranks the catalog and
correctly flags the known offenders; multi-image conditioning produced a gate-passing,
palette-coherent night fill for the canonical case `nature/ant-wide` — with one crucial twist: the
palette reference must be the **punched** light fill, not the raw).

## Part 1 — Region-hue flip scorer (offline, no API)

`code/score-hue-coherence.mjs` (ran from `tools/asset-gen/`, imports `lib/paths.mjs` +
`lib/morphology.mjs`):

1. Segment fillable regions from the PEN outline at 512 px working width: ink = luma < 128, regions
   = 4-connected components of non-ink; the border-connected component is the open background and is
   **excluded** (day-sky → night-sky is an intended flip).
2. Sample only pixels ≥ 2 px clear of ink (dilated ink mask) to dodge anti-aliased line
   contamination and the night raw's white-line glow.
3. Per region, per image (light raw vs night raw from `fill-src/`): chroma-weighted circular mean
   hue. A region only scores if it is **chromatic on both sides** (≥ 35% of sampled px with chroma ≥
   22, and ≥ 40 chromatic px) — whites/greys/near-blacks have no hue family, so clouds,
   chalk-whitened scleras, and dark pupils are ignored.
4. Flip = circular hue distance > 75°, after forgiving up to 25° of rotation **toward blue** (hue
   240°) as legitimate moonlight cooling.
5. Page score = flipped area / scored chromatic area; regions reported worst-first with hue-family
   names.

### Validation

* `nature/ant-wide` flags exactly the known blanket case: `red→cyan (12,076 px, 176°)` — the red
  picnic-blanket squares going teal/navy — plus the yellow flowers going blue/purple. 61.1% flipped
  area.
* Visual spot-checks agreed with the scorer everywhere I looked:
  * `nature/spider-tall` (98.2%, worst in catalog): purple spider → brown spider, cream web cells →
    navy.
  * `objects/teddy-tall` (23.5%): the IDEAS.md guess ("the bow") is actually **coherent** (blue in
    both modes); the real flips are the pink heart → dark green and the block-face colors reshuffled
    (orange→blue etc.).
  * `farm/duck-wide` (5.4%): almost coherent — duck stays yellow; only two small blue→maroon flowers
    flag.

### Catalog ranking (full 96-cell table in `ranking.txt`)

Worst offenders:

| Cell                  | Flip % | Headline flips                                              |
| --------------------- | ------ | ----------------------------------------------------------- |
| nature/spider-tall    | 98.2%  | purple body→red/brown, cream web cells→navy (50/51 regions) |
| shapes/rectangle-wide | 91.8%  | red→cyan 36k px                                             |
| shapes/circle-wide    | 91.5%  | yellow→blue 45k px                                          |
| shapes/triangle-tall  | 90.0%  | orange→green 80k px (one giant region)                      |
| farm/cat-tall         | 79.8%  | orange cat→blue cat                                         |
| space/astronaut-tall  | 78.3%  | orange suit→blue                                            |
| vehicles/garbage-wide | 75.1%  | green truck→blue                                            |
| vehicles/monster-tall | 66.2%  | red truck→blue                                              |
| nature/ant-wide       | 61.1%  | the canonical blanket                                       |
| objects/umbrella-wide | 59.2%  | yellow/red panels→blue/purple                               |

~15 cells score 0.0%; median ≈ 14%. Recurring pattern: warm hues (yellow/orange/red) get repainted
into the night-blue family — the night prompt's "deep and moonlit" pushes the model to paint
everything navy-ish. `farm/cat-tall` (an orange cat turned blue) and the `shapes/*` pages (the
shapes ARE the subject, so recolors are arbitrary) look like the most user-visible offenders after
the blanket.

Interpretation caveats (a first pass, by design):

* Some flags are arguably *legitimate* night art: `cyan→orange` on windows (`objects/house-wide`,
  `space/station-wide`) is windows glowing warm at night; interior sky-through-gap regions read as
  flips when the day sky is cream vs navy at night (spider's web cells straddle this line).
* Regions are pen-segmented on both raws; night raws register on the chalk, but the chalk traces the
  pen (keep gate), so pen regions held up fine in practice.
* The 75° + 25°-cool-credit thresholds were eyeballed, not calibrated on labeled data.

## Part 2 — Multi-image conditioned night generation

Temporary variant `code/gen-coloring-fills-dark-cond.mjs` (copy of `gen-coloring-fills-dark.mjs`):
passes a **second inline image** (the daytime palette reference) after the chalk-negated dark input,
with an appended `PALETTE REFERENCE` prompt block ("same drawing colored as daytime — keep each
object's hue family, dimmed and cooled; background still becomes deep evening; line work must match
the FIRST image"). All four standard gates unchanged (drift, nightness, line-color, composite eyes),
same align/retry machinery. 8 Gemini calls total (the cap).

### Run log (`nature/ant-wide`)

| Attempt   | Reference                                                                                                        | Result                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calls 1–3 | **light RAW** (black outlines intact), t 0.6 ladder                                                              | Palette-perfect (my scorer: **0.0% flip** — red blanket, yellow flowers) but **lineW 75: black outlines**. The model copied the reference's black line work; unshippable. See `failure-night-blacklines.webp`. |
| Calls 4–7 | light RAW + explicit "NEVER copy its black lines", t 0.3, `--dilate-lines 2`                                     | Still black lines (lineW 69). Prompt alone cannot beat the visual evidence of a black-lined reference.                                                                                                         |
| Call 8    | **shipped PUNCHED light fill** (fills-only, outlines inpainted away) as the reference, t 0.3, `--dilate-lines 2` | **All gates pass first try**: drift 0.0000, bgLuma 72, lineW 173, eyes ok. Hue flip **61.1% → 17.3%**: blanket red/white, right flowers gold, ant warm brown, sky deep navy, chalk lines bright white.         |

The key empirical finding: **what the reference image looks like matters far more than what the
prompt says about it.** Handing the model black-lined day art makes it re-ink black lines (7/7 takes
across two prompt strengths, low temp, dilated input lines); handing it the line-art-free punched
fill removed the failure mode in one take. The pipeline already owns the perfect artifact for this —
the shipped `.light.webp` punch.

Residual (17.3%): the two left flowers came back dusty mauve instead of yellow (141°). One take at t
0.3; the normal keep-best-of-N budget would likely shake this out, or a `--notes` ("the flowers are
yellow").

Also observed: conditioned takes trend **brighter** than unconditioned shipped nights (bgLuma 48–72
vs the typical 15–50) — the day reference pulls the mood toward "dimmed day" rather than "deep
night". Passes the ≤ 100 gate, but a batch adopting this should watch nightness and maybe tighten
`--night-luma-max`.

## Evidence

* `before-light.webp` — shipped light raw (red/white blanket, yellow flowers).
* `before-night-shipped.webp` — shipped night raw: blanket navy/green, flowers purple/maroon (the
  hue flip).
* `after-night-conditioned.webp` — call-8 conditioned take, all gates passing: palette-coherent
  night.
* `failure-night-blacklines.webp` — calls 1–3 failure mode: perfect palette, black outlines.
* `code/ant-wide.night.conditioned.fullres.webp` — the full-resolution gate-passing take (would
  still need human contact-sheet review + punch before shipping).

## What was NOT done (budget)

* `objects/teddy-tall` and `farm/duck-wide` conditioned regens (the 8-call cap went to ant-wide);
  Part 1 shows duck-wide barely needs it and teddy-tall's real offenders are the heart + blocks, not
  the bow.
* No punch/composite of the conditioned take into a shipped-style asset (offline and mechanical;
  nothing suggests it would differ).
* No threshold calibration for the scorer against a labeled set.

## Recommendations

1. **Adopt the scorer as an audit** (`gen:coloring-fills:audit:hue` style): offline, free, ranks the
   catalog in ~30 s. Add a "legit night change" allowlist (or per-page notes) for glowing windows
   before treating the % as a hard gate.
2. **Retrofit path (cheap):** regen only the worst offenders (spider-tall, cat-tall, the shapes
   wides, astronaut-tall, garbage/monster, ant-wide, umbrella-wide) with the conditioned generator +
   a palette `--notes`.
3. **If conditioning is folded into `gen-coloring-fills-dark.mjs`:** condition on the **shipped
   punched light fill**, never the raw; keep every existing gate; consider a slightly stricter
   nightness bar; and wire the hue scorer in as a fifth per-take score so the retry loop can hunt
   for coherence too.
4. IDEAS.md's "ant blanket / teddy bow" examples: blanket confirmed; the teddy's bow is actually
   fine — cite the teddy's heart/blocks instead.
