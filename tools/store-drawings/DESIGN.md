# Store drawing scene design

The retained capability compiles centerline SVGs to static scene data. Its active commands and file
ownership are in [README.md](README.md). This record preserves the reasoning behind that format and
the former frontend's capture pipeline; its live replay, fidelity capture, and brush-review tooling
retired with SvelteKit.

## Why static instructions

The original store captures needed polished examples drawn by the real application renderer.
Authored centerline SVGs offered three approaches: overlay the SVG, parse it on every capture, or
compile it once to numeric instructions for replay. Compilation kept SVG parsing and authoring files
outside the capture runtime while preserving deterministic coordinates, colors, and width choices.
Hand-authoring thousands of coordinates would have made iteration and fidelity review impractical.

The generated catalog retains that useful boundary. `gen-pointer-instructions.mjs` accepts a narrow
centerline subset, adaptively flattens cubic curves, quantizes coordinates, and emits dimensions,
color selections, and stroke arrays under `STORE_DRAWING_SCENES`. Consumers need no source SVG or
parser. The catalog carries data rather than browser callbacks.

## Color and width calibration

Color selection considers the main palette and hex-grid shades in OKLab space. Candidate sets
preserve the swatches available on both original store targets for each orientation. This documents
the conversion's calibration; it is not a visibility assertion about the React Native controls.

Widths are scaled against the recorded portrait or landscape drawing surfaces and mapped to the
app's discrete size levels. Joined same-color paths are processed as a chain. One level serves the
chain while each member stays within that level's reach; a genuine change across a full step splits
the chain. The chosen level is nearest the run's length-weighted width.

Choosing a size per chain avoids shattering a line whose traced width hovers near a bucket boundary
into a burst of dabs. Each dab's round cap had produced visible bulges. The compromise is slightly
less local width accuracy against the traced source in exchange for continuous lines. Continuously
varying traced widths remain approximations of discrete levels.

## Preserved geometry and metrics

`lib/drawing-instructions.mjs` contain-fits a scene within a target box and scales its stroke
coordinates. `lib/magic-scribbles.mjs` preserves deterministic row fills and spirals recorded for
the Farm cat scene. Both are pure geometry helpers.

`lib/drawing-fidelity.mjs` preserves color-aware soft intersection/union, precision, and recall. Its
color comparison distinguishes identical silhouettes drawn in different colors, which a simple
occupancy score would miss. The former evaluator also compared equal-width source and converted
centerlines to separate geometry conversion loss from width and color choices.

## Historical delivery and tradeoffs

The SvelteKit pipeline delivered the static scenes either through visible controls and ordinary
mouse input or through a development-gated engine seam that reproduced the same intermediate samples
and held endpoint. The seam accelerated hero capture; the pointer path exercised input handling,
smoothing, renderer, and history. Brush review reused the same scenes for Pen, Crayon, and Magic,
and the live evaluator compared rendered pixels against both instructions and source art. Those
application-specific paths no longer exist.

The retained catalog remains large machine-authored data, excluded from Prettier and protected by a
generator-drift check. Unsupported SVG constructs fail explicitly instead of silently producing a
different drawing. Static choices make conversion reproducible, but they do not prove how a current
brush renders. The marketing renderer separately composes the committed application captures;
recompiling scene data never refreshes those screenshots.
