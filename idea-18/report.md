# Idea 18 — Deterministic fills: model picks the palette, code paints

**Verdict: WORKED** (end-to-end on all three pages, including the "hard" mermaid).
Registration is 100.0% keep / 100.0% localKeep by construction on all six fills
(bar: 92 / 80) — the entire drift/registration failure class vanishes, and light
and night stay perfectly coherent because both palettes paint the same region map.

## Pipeline as built

`code/idea18-deterministic-fill.mjs` (run from repo root; subcommands `segment`,
`plan`, `paint`, `compare`):

1. **Segment** the PEN outline at native 1024×1536: binarize at the pipeline's
   ink bar (luma < 150, same as `punch-fill.mjs`), flood-fill 4-connected
   non-ink components, page border counted as ink. **Hierarchical background
   split:** a second segmentation at morphological close r=12 is used to split
   ONLY the border-touching background region — that seals subjects whose
   outline is deliberately open toward the page edge (circle-tall's grass
   mound) without letting the coarse pass destroy interior detail. Regions
   < 80 px are unlabeled and later bled over.
2. **Plan** (1 Gemini `gemini-2.5-flash` text/vision call per page): render the
   region map — random tints + a number at each region's most-interior point
   (distance-transform argmax, so labels land inside concave regions) — and
   send it with per-region area/centroid stats plus a 31-name curated palette
   (each name carries a matched light hex + night hex). The model returns
   strict JSON `{n, what, color}` per region. One call covers BOTH themes
   because the palette name is theme-neutral.
3. **Paint**: fill each labeled region with its palette hex; every other pixel
   (ink, tiny regions, coarse-split slivers) is inpainted with the same
   direction-neutral ring bleed the punch uses. Light paints/punches against
   the pen, night against the chalk — the output IS the shipped fills-only
   form directly; no separate punch step needed. Regens are instant and free.
4. **Compare/gate**: `lib/outline-match.mjs` on a raw-equivalent (fill + line
   art recomposited); composites via multiply (light) and
   `lib/night-composite.mjs` (night).

## Region counts & seal quality

| Page | regions (big / tiny) | background pieces | gap closing needed |
| --- | --- | --- | --- |
| shapes/circle-tall | 28 / 1 | 1 (+ mound via coarse split) | none for strokes |
| objects/balloon-tall | 34 / 0 | 1 | none |
| creatures/mermaid-tall | 66 / 14 | 1 (+2 pockets split) | none |

**The headline surprise: stroke gap-closure was a non-issue.** All three pens
seal every stroke-bounded region at close radius 0 — the normalized outlines
(normalize-outline-strokes) are watertight. The real enclosure problem is
*compositional*: circle-tall's grass mound is an open arc the raster model
"understood" as a region but flood fill cannot. Fixes that worked / failed:

- Page-border-as-ink: necessary but not sufficient (the mound arcs stop short
  of the edge).
- Global morphological close r=12: seals the mound but swallows eye whites,
  catchlights and bubble highlights — unusable alone.
- **Hierarchical refine (final)**: fine segmentation + coarse close-12 pass,
  splitting only the border-touching background by the coarse partition. First
  version split *every* mixed region and shredded the mermaid's hair (narrow
  strand necks pinch off at coarse scale, and the model then colored the
  fragments inconsistently — some "black"); restricting the split to the
  background fixed it with zero collateral damage on all three pages.

## Color-plan findings (7 useful calls + 3 superseded, ~10 total)

- The vision model identifies regions from a numbered random-tint map very
  reliably at 66 regions (mermaid: hair/face/pupils/catchlights/shell bra/tail
  scales/rock/seaweed/shells all named correctly).
- **Tint bias is real**: the first mermaid plan colored the face "lavender"
  because its random segmentation tint was purple. One prompt line ("tints are
  random labels, carry NO color information") plus an explicit skin rule fixed
  it (face/arm/midriff → skin-peach).
- Structured-output JSON (`responseMimeType: application/json`) parsed clean
  every time; every region number was covered exactly once in every call.
- **Plan variance across calls is nontrivial**: the same mermaid page got
  background sky-blue twice, then tan ("seabed") once; circle's background came
  back coral, sky-blue, then lavender. Quality stays acceptable but a
  regen changes the look — pin plans by committing the JSON (they're tiny and
  human-editable, which is itself a feature: retouching = edit one word).
- Residual quirks a better prompt could fix: mirrored parts colored
  asymmetrically (bow loops leaf-green vs deep-blue; circle's two irises pink
  vs blue — arguably charming), and eye scleras labeled "iris" and tinted
  instead of white-tint.

## Honest visual judgment vs shipped

- **mermaid-tall (hard case): genuinely competitive with the shipped fill.**
  Flat colors read as a clean, vivid coloring-book style; at toddler-app
  fidelity the loss of the model's soft cheek blush and scale shading is
  minor. Night version is coherent and arguably punchier than shipped.
- **balloon-tall: acceptable, more "candy-colored" than shipped** (multicolor
  gift panels and strings where the shipped art is more tasteful). The chalk's
  extra face (eyes exist only in the chalk) flows through automatically since
  night punches/screens against the chalk.
- **circle-tall: weakest.** The final plan's green face + green mound is drab
  next to the shipped cream face, and the flat fill makes the simplest page
  look flattest — ironically the simplest page is where the raster model's
  subtle gradients did the most work.
- Leaks: none after refinement. Coverage: every big region painted; bled seams
  where the mound gap has no line are soft and unobjectionable.
- Night palette calibration needs a pass: my hand-picked night hexes run
  darker than shipped night fills (dark-green face, maroon sky vs shipped's
  luminous peach/navy). That's a palette-tuning problem, not an architecture
  problem — two palettes over one region map is exactly what makes it fixable
  once, globally.

## Limitations

1. **No gradients/soft shading** — the known flatness loss. Deterministic
   candidates: per-region radial/linear ramp (top-lighter), cheap paper-grain
   noise, or a darkened copy of the region color along the ink boundary
   (ambient-occlusion-ish). None attempted here (time-box).
2. **Hybrid shading question**: a single low-strength img2img pass over the
   deterministic base could restore blush/soft shading, but it reintroduces
   the drift risk this idea exists to kill; if tried, it must re-run the punch
   \+ drift gates (the deterministic base at least guarantees the *colors*
   can't wander). The mermaid result suggests the hybrid may not be needed for
   shipping quality; the circle result suggests it would help the simplest
   pages most.
3. **Open compositions** are the real segmentation risk (not stroke gaps).
   The background-only coarse split handled the one instance here; a page with
   an open *interior* shape (e.g. a half-occluded object drawn with open
   strokes) would need per-page attention.
4. Plan quality varies call-to-call; treat the JSON plan as a committed,
   reviewable artifact, not a runtime step.
5. Tiny (<80 px) regions inherit neighbor color via bleed — correct for
   slivers, but would erase a meaningful tiny feature if one ever fell under
   the bar (catchlights on these pages are all comfortably above it).

## Evidence

- `*-regions.webp` — numbered region maps (segmentation quality).
- Per page: `*-shipped-light.webp` vs `*-det-light.webp` (pen multiplied on
  top, same view), `*-shipped-night.webp` vs `*-det-night.webp` (both through
  `lib/night-composite.mjs`).
- Gates: keep=100.0%, localKeep=100.0% for all six deterministic fills.
- `code/*-plan.json` — the exact region→color plans used.
