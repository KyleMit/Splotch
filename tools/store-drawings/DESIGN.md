# Store drawing pointer-instruction design

## Why static pointer instructions

Store screenshots need polished example drawings, but the screenshots are supposed to show the real
Splotch canvas after ordinary drawing input. The authored examples arrived as centerline SVGs. Three
ways to use them were considered:

* render or overlay the SVG at screenshot time, which would produce the desired pixels without
  exercising Splotch's drawing engine;
* parse the SVG every time store screenshots run and translate its curves into pointer input, which
  would exercise the engine but leave SVG parsing and authoring files in the runtime workflow;
* compile the SVGs once into static pointer instructions and replay only those instructions through
  the live app.

Hand-authoring thousands of pointer coordinates was also possible, but it would make fidelity and
future iteration impractical. The source set contains cubic curves, varying widths, and colors that
need deterministic mapping onto the controls Splotch actually offers.

## Approach

`tools/store-drawings/gen-pointer-instructions.mjs` is an offline compiler. It accepts a
deliberately narrow centerline SVG subset (`M`, cubic `C`, and `Z`; round unfilled strokes),
adaptively flattens the curves, and emits `tools/store-drawings/generated/store-drawings.mjs`. The
generated module contains only static numeric pointer coordinates, selected Splotch width levels,
and selectable color tokens. It exports named functions such as `drawHouseTall` and `drawHouseWide`;
no generated drawing reads an SVG at runtime.

Color selection considers both the main palette and the hex-grid colors in OKLab space. Candidates
are limited to swatches visible on both store targets for the drawing's orientation. Width selection
maps each source path to one of the five real app levels after scaling against the measured portrait
or landscape store canvases.

`tools/store-drawings/lib/drawing-instructions.mjs` fits the static coordinates within the canvas
and owns two delivery paths. The default delegates every stroke to
`tools/app-driver/lib/app-driver.mjs`: the driver changes colors and widths through visible controls
and sends Playwright mouse down/move/up input to `#drawingCanvas`. The store hero selects
`replay: 'engine'`, which expands the exact same six intermediate samples and held endpoint, then
calls the dev-gated production engine once per stroke. Both paths therefore reach the same midpoint
smoothing, tiled renderer, and history; neither paints a substitute canvas.

Named drawing functions can select Pen, Crayon, or Magic through the production Brush Menu before
replaying their shared pointer instructions. Magic skips stored color selections because the brush
owns its rendered color. `tools/store-drawings/gen-brush-review.mjs` exercises those variants into a
review-only gallery outside `store-assets/`.

`tools/store-drawings/evaluate-drawing-fidelity.mjs` keeps conversion measurable. It compares
equal-width source and generated centerlines, then captures the live tiled canvas after replay and
compares both pixel coverage and RGB color with the static instructions and original SVG. The
workflow and overlay interpretation are documented in `tools/store-drawings/README.md`.

## Tradeoffs

* \+ Store hero screenshots exercise the production renderer, history, and tiled canvas instead of
  presenting imported art as if it had been drawn; the real final palette selection and app chrome
  remain in the capture.
* \+ Generated scenes remain usable after their SVG authoring inputs are removed; each named
  function contains everything required for replay.
* \+ The converter makes another authored SVG reproducible, and the two-stage evaluator
  distinguishes conversion loss from live-input/rendering loss.
* \+ Color and width compromises are explicit static choices rather than viewport-dependent runtime
  guesses.
* − The generated module is large, machine-authored data and is excluded from Prettier; generator
  drift is enforced separately.
* − Pointer-based fidelity evaluation and brush review remain slow by design. The release-capture
  hero avoids that cost through its measured engine seam, while scenes whose subject is UI or
  gesture behavior remain app-driver flows.
* − SVGs outside the supported centerline subset must be simplified before conversion; failing on
  unsupported surface is preferable to silently producing a different drawing.
* − Splotch has fixed widths and no pressure input, so continuously varying source widths can only
  be approximated by the nearest available level.
