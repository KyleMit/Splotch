# Store drawing data

This offline compiler preserves authored store drawings as deterministic numeric scene data.
[`generated/store-drawings.mjs`](generated/store-drawings.mjs) exports `STORE_DRAWING_SCENES`, with
source dimensions, palette or picker color selections, and strokes containing size levels and
coordinate pairs. It contains no browser driver or callable replay functions.

The authoring handoff is [filled SVG to centerline SVG](../centerline-tracing/README.md), followed
by this compiler. The former live fidelity evaluator and brush-review capture commands retired with
SvelteKit. The preserved data does not recapture the React Native app or replace the committed store
screenshots.

## Layout and commands

| Path                           | Responsibility                                                    |
| ------------------------------ | ----------------------------------------------------------------- |
| `gen-pointer-instructions.mjs` | SVG subset parsing and deterministic scene compilation            |
| `samples/`                     | Committed centerline SVG authoring inputs                         |
| `generated/store-drawings.mjs` | Generated data catalog                                            |
| `lib/drawing-instructions.mjs` | Pure scene fitting and coordinate scaling                         |
| `lib/drawing-fidelity.mjs`     | Pure color-aware overlap metrics                                  |
| `lib/magic-scribbles.mjs`      | Seeded scribble-path construction                                 |
| `tests/`                       | Conversion, fitting, metric, scribble, and generated-drift checks |

```sh
npm run gen:store-drawings
npm run gen:store-drawings:check
npm run test:store-drawings
```

All commands need installed project dependencies. They are browser-free and start no server.
Generation writes the catalog after all SVGs convert successfully. The check command compares a
fresh conversion in memory with the committed module and leaves files unchanged.

## Conversion policy

Each source filename ends in `-tall.svg` or `-wide.svg`, selecting the orientation's preserved
color-candidate and width calibration. Accepted SVGs have a zero-origin `viewBox`, unfilled groups
with hex strokes and round caps and joins, and paths composed of absolute `M`, cubic `C`, and
closing `Z` commands with a positive `stroke-width`. Unsupported tags, attributes, transforms, and
path commands fail explicitly.

Cubics are adaptively flattened and coordinates quantized. Colors are matched in OKLab space against
the palette and hex-grid candidates established for the original store viewports. Those candidate
restrictions preserve the drawings' existing conversion policy; they do not assert that a current
React Native control is visible at the same viewport.

Joined same-color paths are chained before widths are mapped to `STROKE_SIZES`. A chain splits into
the fewest runs whose members fit a shared level's reach, and each run chooses the level nearest its
length-weighted width. Keeping that size in the output makes the catalog independent of the
converter at consumption time.

Regenerate and commit the catalog whenever samples or conversion policy change. The
[historical design record](DESIGN.md) explains the original live capture pipeline and its measured
tradeoffs; the commands and ownership above describe the retained capability.
