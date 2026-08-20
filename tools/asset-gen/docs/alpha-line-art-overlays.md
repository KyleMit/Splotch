# Use Alpha-Native SVGs as Canonical Page Line Art

**Decision record — in force. Date:** 2026-07, amended 2026-08

ADR-0091 established alpha-native, ordinary source-over presentation for coloring pages. ADR-0129
changed the shipped format from generated WebP to invariant SVG, then made those accepted SVGs the
canonical source for every page-line-art consumer.

## Decision

Every page orientation has one light and one dark canonical line-art asset:

```text
{page}-{tall,wide}.overlay.svg       transparent black pen
{page}-{tall,wide}.dark.overlay.svg  transparent white chalk
```

Cover line art remains raster during the cover campaign:

```text
cover.outline.webp
cover.chalk.webp
cover.thumb.webp
cover.chalk.thumb.webp
```

The page SVGs are both runtime presentation assets and authoring sources. Audits, proof sheets,
Gemini inputs, registration scorers, and fill generators call `rasterizeLineArt()` to place their
alpha plane as black ink on white. Dark SVGs are likewise normalized to that ink-on-white analysis
contract; their baked white runtime ink does not change scores.

Fresh, normalized, or chalk redraws first land in review scratch. `--apply` stages the chosen page
or cover raster as an uncommitted trace source:

```text
vectorized/coloring-overlays/{page}.source.webp
vectorized/coloring-dark-overlays/{page}.source.webp
```

`vectorize:coloring` traces that source to the canonical SVG. The source WebP and raw service
response are recovery scratch, not committed masters. Ledger format 2 records the trace-source hash
and bytes as provenance and the canonical SVG hash and bytes as the live drift guard.

The punch reads the canonical alpha directly. Alpha greater than 105 is the exact counterpart of the
retired ink-on-white threshold `luma < 150`. Existing shipped fills were not repunched: the catalog
already passed composite review with the SVGs, and the measured mask differences were limited to
traced edge placement. Future punches always use SVG alpha.

## Required checks after line-art work

```bash
npm run vectorize:coloring:check
npm run vectorize:postprocess:check
npm run check:coloring-outline-quality
npm run check:coloring-fill-drift
npm run check:coloring-golden-scores
npm run gen:assets:manifest
npm run gen:coloring-book-proof-sheet -- <category>
```

Run the relevant generator and punch checks as well. A paid retrace requires explicit credit
authorization and a production-quality visual review; test mode is watermarked and can only rehearse
the request path.

## Consequences

* One committed page-line-art representation replaces the former opaque masters, temporary alpha
  WebPs, and responsive overlay derivatives.
* Runtime and pipeline consumers cannot drift onto different line work.
* Deterministic rasterization keeps existing image-analysis code and Gemini contracts stable.
* A page edit now requires a retrace before it becomes canonical; raster review output is not a
  shippable fallback.
* Cover raster masters remain a deliberate transitional exception until their campaign completes.
