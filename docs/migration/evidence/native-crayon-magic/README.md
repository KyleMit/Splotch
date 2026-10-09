# Bounded native Crayon and Magic product slice

This is a new, pending product unit on the provisional native drawing candidate. Its starting source
is e836b73ac2731fd7e22853a5b334f7403ea4cfea. The original N1 source/evidence, source-boundary
repairs, review and acceptance remain owned by N1; this unit neither accepts nor repairs that
dependency. Compose the exact published N1 source before native qualification and publication.

No architecture is selected. This unit adds useful Crayon and blank-paper Magic to the current React
Native/SVG candidate while preserving Pencil, Marker, color selection, undo, clear, saving,
reopening and PNG composition. Coloring pages, fill revelation/recode, erasing, width settings,
collector/order qualification, physical fidelity/performance, full services and release acceptance
remain in the migration inventory.

## Implementation and alternatives

The existing artwork composition drives the screen and PNG capture. Crayon uses opaque,
deterministic paper-tooth patterns in sparse rim/dense core bands. Stored phase seeds distinguish
deposition passes; geometric reversal/re-entry starts a fresh pass within a gesture. A
darken/source-over glaze mixes crossing pigments while same-color passes fill holes without
compounding darkness. Native uses the released SVG filter primitives; the browser adapter uses SVG
CSS blending. Both mechanisms need their own actual output checks.

Magic uses a linear rainbow in paper coordinates. A picture owns its rainbow, independent of the
selected palette color or brush switches. Clear advances the rainbow; undo restores it. Saved
version 2 drawings retain the rainbow and Crayon phases. The parser also reads the first slice's
version 1 Pencil/Marker saves, rejects unsupported brush metadata, and copies points before
replacing the live picture.

The bounded choice extends the installed SVG renderer. Sampling a color at each input point would
lose Magic's fixed spatial source and create artificial bands. A new CPU raster canvas or Skia
dependency would add renderer/toolchain ownership before this slice's requirements justify it. This
choice is an implementation probe, not a comparative performance or framework decision.

The source references are [ADR-0043](../../../adrs/0043-magic-brush-color-sheet-reveal.md),
[ADR-0065](../../../adrs/0065-crayon-brush-textured-wax.md),
[ADR-0148](../../../adrs/0148-crayon-per-op-glaze-on-native.md), and the released
[react-native-svg source](https://github.com/software-mansion/react-native-svg/tree/v15.15.4).
Shipping code is studied as a behavior reference; candidate brush code does not import that
renderer.

## Verification ledger

The own frozen installation ran from 2026-10-09 04:15:03 through 04:15:12 UTC with
`pnpm install --frozen-lockfile --ignore-scripts`: exit 0, unchanged lock, 1,441 packages cloned
into this worktree's own `node_modules`. No mutable link to another checkout was used.

Source implementation commit: a77d6e055f054a718b58b1a3d576f68da3fa7ee8.

`npm run check`, `npm run lint`, candidate TypeScript, and `npm run format:check` passed. Lint
reported one inherited unused-variable warning in `candidate-configs.test.mjs`; no brush warning or
error was reported. The focused test set passed 35 tests, including real `Ink` renderer raster
output: paper tooth, same-color buildup, within-gesture backtracking, subtractive blue/yellow
crossing, paper-fixed Magic colors across a stroke and tap, exact save/reopen/undo pixels, invalid
brush/rainbow rejection, and preserved first-slice saves. Full applicable checks and native output
remain pending.

Rejecting controls temporarily changed committed source, ran the actual artwork output suite, and
restored only that source file before the next control. Each failed at a substantive pixel
assertion, and the restored full focused set passed 35 tests. Actual logs live in `controls/`:

| Mutation                                             | Rejection                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Flat solid Crayon in place of the texture renderer   | Coverage became 1; tooth, subtractive crossing and backtracking assertions failed. |
| Every deposition uses the same phase                 | Repeated and backtracking passes could not increase coverage.                      |
| Remove pigment mixing                                | Crossing produced zero green-leading pixels, below the required 30.                |
| Magic gradient anchored to each shape's bounding box | Spatial rainbow and same-position stroke/tap assertions failed.                    |

An exploratory browser window ran from 2026-10-09 04:22:41 through 04:24:08 UTC on the uncommitted
implementation. Expo/Metro used two workers on the selected unused port 5301. An earlier owned
startup on port 5300 was stopped before probing; it was corrected to the returned free port. Both
owned process handles were stopped when the window ended. The probe observed:

* Paper fraction 0.2259 in a Crayon region, with grain contained inside the stroke.
* Seventy green-leading pixels where blue Crayon crossed yellow Crayon.
* Magic colors `[238, 201, 67]` and `[142, 68, 238]` at different paper positions.
* Pixel-identical pictures after clear/undo and save/clear/reopen.
* A real PNG downloaded, containing the Crayon and Magic composition.

These observations are exploratory browser evidence, not exact-head qualification or native
evidence. Actual control/composition screenshots and the downloaded PNG are retained in
`exploratory-browser/`. The repeatable caller is `tools/migration/probe-native-brushes.mjs`; it adds
actual corrupted-save rejection and records source/status, images, PNG and a report. Run it only in
a coordinated window against the source-qualified candidate:

```sh
node tools/migration/probe-native-brushes.mjs \
  --url=http://localhost:<selected-unused-port> \
  --output=<owned-evidence-directory>
```

The caller starts no server. Its Chromium input proves browser mechanics only. Native output,
new-product source acceptance and physical release gates remain pending.
