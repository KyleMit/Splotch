# Store screenshot drawings

The free-draw store screenshot is recreated by feeding compiled strokes through a dev-gated API on
the live app's real drawing engine. Runtime drawing never parses or renders SVG. The generated
[`generated/store-drawings.mjs`](generated/store-drawings.mjs) contains static numeric pointer
coordinates and exports one named function per scene, including `drawHouseTall` and `drawHouseWide`.

## Layout

* The capability root contains the conversion, evaluation, and brush-review entry points.
* `lib/` contains the static-scene fitting and replay helper.
* `generated/` contains the committed pointer instructions consumed by store screenshots.
* `samples/` contains the SVG authoring inputs used only by the offline converter and evaluator.
* `tests/` contains the pipeline and generated-drift tests.

See [DESIGN.md](DESIGN.md) for why the pipeline compiles static instructions instead of rendering or
parsing SVGs during screenshot capture, plus the accepted fidelity and runtime tradeoffs.

## Entry points

| Entry point                     | Public command                        | Purpose                                  |
| ------------------------------- | ------------------------------------- | ---------------------------------------- |
| `gen-pointer-instructions.mjs`  | `npm run gen:store-drawings`          | Compile SVGs into static pointer scenes  |
| `evaluate-drawing-fidelity.mjs` | `npm run gen:store-drawings:evaluate` | Compare SVG, points, and live app output |
| `gen-brush-review.mjs`          | `npm run gen:store-drawings:review`   | Capture brush variants for review        |

All commands need installed project dependencies. Conversion is deterministic and browser-free;
evaluation and brush review also need Playwright Chromium and port 4173 either free or already
serving Splotch. The public npm commands, sample paths, generated module, and screenshot output
directories remain stable during the tools naming migration.

## Conversion pipeline

Source SVGs are authoring inputs under `samples/`. Each filename ends in `-tall.svg` or `-wide.svg`;
that suffix selects the store orientation used for color availability and width calibration.

```bash
npm run gen:store-drawings
npm run gen:store-drawings:check
```

The generator accepts only the centerline subset the pointer driver can faithfully reproduce:

* zero-origin `viewBox`;
* unfilled groups with a stroke color and round caps/joins;
* paths composed of absolute `M`, cubic `C`, and closing `Z` commands;
* a `stroke-width` on every path.

Unsupported SVG surface fails instead of silently becoming a different drawing. Cubics are
adaptively flattened, coordinates are quantized after flattening, and the resulting static module
contains no SVG commands or runtime reference to an SVG file.

Colors are matched in OKLab space against both the main palette and the full hex-grid palette. The
candidate set is restricted to controls visible on both store targets for that orientation, so a
generated color never depends on clicking a CSS-trimmed swatch. Palette choices are stored by label;
hex-grid choices are stored by their selectable hex value.

Widths are mapped to the app's five levels (2, 4, 8, 14, and 22 CSS pixels). The generator computes
the source-to-canvas scale over both real portrait or landscape store drawing surfaces and selects
the nearest level per source path. Keeping the selected level in the generated instructions makes
the runtime independent of both the source SVG and converter heuristics.

## Fidelity evaluation

```bash
# All drawings
npm run gen:store-drawings:evaluate

# One or more while iterating
npm run gen:store-drawings:evaluate -- house-wide balloon-tall
```

Output goes to the gitignored `screenshots/store-drawing-eval/` directory. Each drawing gets the
source raster, the static-instruction raster, the pixels captured from Splotch's live tile canvases,
two difference overlays, and `metrics.json`. The root `report.md` summarizes one soft-mask geometry
score and two color-aware coverage scores:

* **SVG→points geometry** compares equal-width centerlines, isolating Bézier flattening and
  coordinate quantization.
* **Points→app runtime** compares the static polylines with the pixels produced through genuine
  Playwright down/move/up input, including their selected RGB colors and isolating engine smoothing
  and pointer delivery.
* **SVG→app visual** compares the original SVG pixels with the final app pixels, including the
  discrete stroke-width and color choices.

The overlays visualize occupancy separately: red-only pixels belong to the reference, blue-only
pixels belong to the converted or runtime image, and overlapping pixels are purple-white.

After reviewing the report and images, `npm run gen:store-assets` uses the named static drawing
functions for the real store captures. Its hero scene passes `{ replay: 'engine' }`; the default
remains pointer replay so this evaluator and the brush-review workflow continue to exercise the
user-input boundary they are designed to measure.

## Brush review captures

```bash
npm run gen:store-drawings:review
```

This replays the same tall and wide static instructions with Pen, Crayon, and Magic and captures
store-sized Google Play phone and tablet screenshots. The gallery is written to the gitignored
`screenshots/store-drawing-review/index.html`; `store-assets/` is never touched. The named drawing
functions accept an optional `{ brush: 'pen' | 'crayon' | 'magic' }` argument. Magic ignores the
stored color changes because its production brush supplies its own color, while Pen and Crayon use
the stored palette and hex-grid selections.

## Failure behavior and maintenance

Unsupported SVG input, invalid filters, stale generated output, unavailable browser/server
prerequisites, and capture failures produce diagnostics and nonzero exits. Generation writes the
committed module only after every selected SVG converts successfully; `--check` compares a fresh
render in memory and never updates it. Evaluation and review write only beneath their gitignored
`screenshots/` directories and never replace `store-assets/`.

`lib/drawing-instructions.mjs` owns scene fitting and both replay paths. Pointer replay delegates to
`tools/app-driver/lib/app-driver.mjs`; engine replay converts the same page-space box to
canvas-local coordinates, expands the driver's shared sample count, and calls the dev-gated engine
seam once per stroke. Keep that ownership edge rather than forking selectors or sample delivery.
Regenerate and commit `generated/store-drawings.mjs` whenever samples or conversion policy change.

Run focused verification with:

```bash
npm run test:store-drawings
npm run gen:store-drawings:check
```
