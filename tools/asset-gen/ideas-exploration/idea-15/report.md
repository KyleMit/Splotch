# Idea 15 — Punch-inpaint quality on dense line work

**Verdict: nearest-bleed is good enough. Per-region mean-color inpaint was implemented and compared; it fixes nothing visible and introduces a new fringe defect on shaded fills. Do not replace the shipped inpaint.**

Fully offline as planned — 0 Gemini calls. Repo left pristine (all experiment code ran from temp scripts, since deleted; outputs written only to this scratch dir).

## 1. Punched-% ranking (recomputed from the punch mask math)

Recomputed for all 188 raw fills by replicating `lib/punch-fill.mjs` exactly (luma < 150 against the pen for light, the chalk for night, at fill resolution) — `code/idea15-rank-punched.mjs`, full list in `rank.txt`. Top 10:

| # | page | punched |
|---|------|---------|
| 1 | vehicles/fire-tall.night | 14.63% |
| 2 | farm/cow-tall.night | 14.48% |
| 3 | vehicles/police-tall.night | 13.50% |
| 4 | nature/spider-wide.night | 13.30% |
| 5 | farm/cow-wide.night | 12.14% |
| 6 | objects/flower-wide.night | 11.69% |
| 7 | space/ship-wide.night | 11.60% |
| 8 | vehicles/monster-tall.night | 11.51% |
| 9 | vehicles/fire-wide.night | 11.19% |
| 10 | shapes/heart-tall.night | 11.10% |

The entire top 18 is night fills — chalk strokes are much fatter than pen strokes, so the night punch dominates. The IDEAS.md numbers match the night variants (flower-wide 11.7%, train-wide 9.8% = rank 15). The suggested space/station-tall is actually mid-pack (night 7.77%, rank 58; light 6.97%). Highest **light** fill: vehicles/fire-tall.light 9.35% (rank 19), train-wide.light 9.27% (rank 22).

## 2. Crop audit at junction hotspots

`code/idea15-hotspots.mjs` finds junction-heavy spots: masked pixels whose surrounding ring (r~8) of unmasked raw-fill pixels contains >=3 mutually-distinct colors (L1 distance >= 70), aggregated into 96-px tiles; top 3 tiles per page. Audited 13 page-variants (the top 10 + train-wide light/night + station-tall night) = 39 hotspots, each rendered as 180x180 native crops at 3x (shipped fill alone, raw fill, and a simulated app composite — pen multiplied for light, negated chalk screened for night, the app.css `--lineart-blend` math).

Findings:

- **The shipped fill viewed in isolation does show exactly what the idea predicted.** Every stroke carries a "zipper" seam where the two sides' bleeds meet (`img/train-light-shipped-fill.png`, `img/monster-night-shipped-fill.png`, `img/fire-night-shipped-fill.png`). Worse than the junction guessing per se: nearest-bleed propagates *rim contamination* — the raw fill's own leftover antialiased line-copy pixels sit just outside the mask (chalk raws leave bright silvery rim pixels, pen raws dark ones) and the bleed's first ring copies them inward, so night strokes fill with a noisy bright-flecked mix rather than plausible fill color. (Those rim pixels themselves are idea #1's territory — both inpaint variants leave them untouched.)
- **None of it is visible in the composite.** At all 39 hotspots the simulated app composite is clean at 3x native zoom — the overlay line covers the seam completely, in light (multiply: line luma < 150 means the covered band is at most 59% brightness of an already-dark stroke) and night (screen toward white) alike. See `img/train-light-shipped-composite.png` (rail/tie/grass junctions), `img/fire-night-shipped-composite.png` (wheel arch, 4-color junction), `img/monster-night-shipped-composite.png` (suspension/frame lattice), `img/flower-night-shipped-composite.png`. No wrong-color smear reaches a visible pixel.

## 3. Per-region mean-color inpaint (the proposed alternative)

Implemented in `code/idea15-region-punch.mjs`: 4-connected component labeling of the unmasked fill (28-102 regions/page), per-region mean color, then the same direction-neutral ring peel as `bleedUnderMask` but propagating **region labels**, painting each masked pixel with its nearest region's mean. Fast: 0.16-0.67 s/page inpaint on top of the punch's usual I/O. Outputs encoded with the shipped settings (webp q85 e6).

Same-spot comparisons:

- **Fill in isolation: mid-stroke looks cleaner** — flat plausible color instead of the zipper (`img/monster-night-regionmean-fill.png` vs `-shipped-fill.png`). If the punch's output were a viewed artifact, region-mean would win.
- **But it introduces a new defect**: on any region with shading/gradient (most of them — the raws carry soft vignettes), the flat global mean mismatches the local color at the mask boundary, leaving a visible lighter/darker fringe hugging every stroke at native zoom — clearly visible as pale-green piping around the rails in `img/train-light-regionmean-fill.png` and as halos in `img/fire-night-regionmean-fill.png`. Nearest-bleed is by construction continuous with its local neighborhood; region-mean is not.
- **In the composite the two are indistinguishable.** Native-zoom composites: `img/train-light-regionmean-composite.png`, `img/fire-night-regionmean-composite.png` vs the shipped versions — no visible difference. Display-scale simulation (fill and line art independently lanczos-resampled to phone width 390 / tablet 844, then app-blended, 4x nearest zoom): `img/train-light-display-shipped.png` vs `img/train-light-display-regionmean.png` — identical to the eye.

Quantified at display scale (`code/idea15-diff.mjs`, max-channel |delta| between the two variants' composites):

| page | mean | max | pixels >15 |
|------|------|-----|------------|
| vehicles/fire-tall.night | 1.49 | 55 | 1.76% |
| farm/cow-tall.night | 1.05 | 54 | 0.85% |
| vehicles/police-tall.night | 1.03 | 51 | 1.35% |
| objects/flower-wide.night | 1.39 | 56 | 1.31% |
| vehicles/monster-tall.night | 1.31 | 47 | 1.46% |
| vehicles/train-wide.light | 1.68 | 49 | 1.20% |
| vehicles/train-wide.night | 1.45 | 52 | 0.25% |
| space/station-tall.night | 1.35 | 52 | 1.65% |

The diff heatmaps (`img/fire-night-diffmap.png`, `img/train-light-diffmap.png`, magenta = delta>15) show every differing pixel lives in a ~1-px band hugging **every** stroke edge — the partial-coverage antialias band — not concentrated at junctions. That is the flat-mean-vs-local-shading mismatch showing through the line's antialias ramp, i.e. the diff measures region-mean's fringe at least as much as any junction fix. Neither variant is "right" there; both are masked by the dark/bright line core and invisible in side-by-side viewing.

File size is a wash: region-mean is ~7% smaller on 6 of 8 pages but **+6.5%** on train-wide.light and **+38%** on train-wide.night (flat means against gradient neighbors create hard edges the encoder pays for).

## 4. Gates

The standard offline gates (`check-coloring-drift.mjs` keep/worstTile, `audit-fill-eyes.mjs`) score the **raw** fills in `fill-src/`, which neither punch variant touches — a punch-inpaint change is gate-invisible by construction; the only check on shipped fills is the human contact-sheet review. Baseline run on the named pages (flower-wide, train-wide, station-tall, fire-tall): drift 100%/100% on all four; eye audit flags **pre-existing** night failures on vehicles/fire-tall and vehicles/train-wide (1 flat eye each) that exist on the untouched repo and are unrelated to the punch (consistent with idea #7's finding that some night-eye issues are raw-regen problems). Region-mean outputs encode/decode cleanly at shipped settings.

## 5. Verdict & recommendation

- **Nearest-bleed is good enough — keep it.** The predicted junction smearing exists in the shipped fill as a standalone image but is never visible through the app composite at native or display scale, on the worst (densest line work) pages in the catalog, including plaid-like lattices (monster suspension), wheels, grilles, and multi-color rail junctions.
- **Per-region mean should not replace it.** Zero visible benefit in the composite; a new native-zoom fringe defect on shaded regions; mixed file-size impact; more code (component labeling) in a hot path that currently has none.
- If the punch output ever becomes a *directly viewed* artifact (e.g. contact-sheet "Color" view aesthetics), region-mean's cleaner mid-stroke could justify an optional flag — but that is cosmetic tooling, not a shipping concern.
- The one real blemish this audit surfaced is not the bleed but the **rim pixels outside the mask** (raw's own antialiased line copy surviving the punch and seeding the bleed) — exactly what idea #1's rim-erase mask extension addresses. If rim-erase ships, the nearest-bleed seeds get cleaner and the case for region-mean weakens further.

## Limitations

- Composites are simulated in sharp (multiply / screen math from app.css, lanczos3 downscale), not browser-rendered; browser resampling and the fill/overlay independent-resample phase issue could differ in fine detail, but the punch decision record already establishes opaque fills make that benign.
- Junction detector samples on a stride of 3 px and picks 3 tiles/page; a pathological single-pixel junction could be missed, but 39 hotspots across the 13 worst pages all told the same story.
- Deep audit covered the top-10 punched pages (all night) + 2 light variants + station-tall; light fills have thinner masks and showed the same covered-seam behavior.
- Region means are computed over whole 4-connected regions including their contaminated rim pixels; for large regions this is negligible, for very small regions (between grille bars) the mean can tilt toward rim color. A rim-excluding erode pass would fix it but was not needed given the verdict.

## Files

- `rank.txt` — full punched-% ranking, 188 fills.
- `hotspots.json` — hotspot coordinates + junction scores per page.
- `code/` — the six experiment scripts (run from `tools/asset-gen/` with `IDEA15_*` env vars).
- `img/` — curated evidence crops (all <=560 px long side); `hotspots/`, `regionmean/`, `compare/` hold the full uncurated set.
