# Bounded native Crayon and Magic product slice

This is a new, pending product unit on the provisional native drawing candidate. Its starting source
is e836b73ac2731fd7e22853a5b334f7403ea4cfea. The original N1 source/evidence, source-boundary
repairs, review and acceptance remain owned by N1; this unit neither accepts nor repairs that
dependency. The initial feature composition used the published N1 dependency
20b51012a9bb3daa1314cab1d8c276cc9eb8a977. Three import-only merge conflicts retain the new brush
implementation and use N1's candidate-local palette. The new `Ink` renderer uses that same palette
owner. The N1 projection, native recipes, package declarations and security repairs are unchanged by
the feature composition.

The final dependency composition uses the exact published N1 source
64af9ba7c32b785dcef71ce7d9e3549f392cf5e5 and checkpoint ff248625efa72215354b83c44f892ae9e5ecdfba.
Its single source conflict retains N1's private tuning constants and this unit's four-brush owner
and version 2 save model. N1 remains unaccepted. The original feature commits, browser artifacts and
rejecting controls remain preserved.

The existing positive scanned-source expectation adds only the five actual production brush modules.
The accepted F1 scanner/refusal logic and input boundaries are unchanged. New feature tests make
each added module escape to shipping source, require rejection, restore its actual source, and
require the restored positive. These are feature inventory/ownership controls, not an F1 repair or
additional F1 review round.

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

After the initial N1 composition, candidate TypeScript, `npm run check`, and `npm run lint` passed
with no ESLint warning. The permitted focused composition set passed 109 tests across brush
behavior/output/history, token projections, the real candidate import inventory, and all five new
module escape-and-restore controls. The composed lock SHA256 is
9fed398b8fda5f309d40f35e7d65296bfc70bef356229ec5c44f144ffb0efd57. The security commit
f61f0c842abd2c4d4ab0eb1f3058786d245c444a is an ancestor of the composed N1 dependency.

The final N1 composition was source-only: merge inspection and `git diff --check` passed, and the
lock SHA256 remains unchanged. No installation or execution check ran on that final composition.

The installed dependency tree predated that security lock update during the source-composition
windows. Those windows ran no installation or execution check and did not certify the installed
graph or accept N1. The later execution window below refreshed and checked the owned graph; native
brush output remains pending.

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

## Exact-source execution window

The local window began at 2026-10-09 05:52:15 UTC from clean
beb08769890cccb04d82fdcdd6c3cc431140aa09, with the final N1 dependency and unchanged lock named
above. The initial sandbox process inventory was refused; the host inventory was then recorded
privately. The own `pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile` refresh
passed without lock changes, lifecycle scripts or pnpmfile execution. Both `node_modules` and the
SVG package resolve inside this worktree, without foreign mutable links.

The initial format check rejected ledger wrapping. The first complete tools run rejected two new
feature test specifiers: an extensionless renderer mock and a candidate-context escape embedded as a
test-file import literal. Both failures remain in `current-window/`. The corrected mock names its
`.tsx` source; the escape fixture declares its candidate-relative `.ts` specifier before injecting
it into all five modules. The accepted specifier fence and F1 scanner/refusals remain unchanged. The
focused output, ownership and specifier controls passed 899 tests after repair.

Current source checks, lint, formatting, candidate TypeScript and maintained native-source
qualification passed. The justified complete tools rerun passed 349 files and 8,131 tests with two
workers. Its corrected source is eea3fd64898bc8bc08fc7f67fdfa7c031ca9597d.

The actual browser caller ran that clean source from 05:59:49.509 through 05:59:55.095 UTC on the
selected unused port 5300, using two Metro workers. Grain left 19.6% paper on the first Crayon pass
and 7% after same-color buildup. The blue/yellow crossing had 92 green-leading pixels. Magic samples
differed across the paper and matched the corresponding exported samples. Clear/Undo and save/reopen
produced identical paper screenshots. The real 1024×768 downloaded PNG retained grain, the mixed
crossing and Magic. Its SHA256 is 06e338e48843dcf6c81d9026ea738f6e918a22390cdd90dfbd883ae4f1086968.
Opening a saved picture with a negative Crayon seed was refused, and the existing picture remained
pixel-identical. After settling, the page-error list was empty. Actual images and the source-bound
report are in `current-browser/`.

The browser driver exited 0 and closed its browser. Owned Expo handle 67415, PID/process group
69561, exited 0 after interruption at 06:00:26 UTC. The subsequent process/listener check found
neither that process nor a port 5300 listener. All owned execution handles are closed; no foreign
listener was terminated. The terminal receipt is `current-window/terminal.json`.

Native planning only inspected N1's supported Release recipe and existing qualifying Ruby/Pod,
JDK/SDK and disposable-signing provenance. The next grant must create this unit's own source-bound
generated native project, Pods/cache and outputs, without mutating N1's retained tree. Actual
standalone brush drawing, save/reopen, PNG/share and restart output on both native platforms remain
required before publication or the original new-unit review. No native compile, performance run,
reviewer operation or acceptance merge ran in this window.

## Subsequent source-only composition

The exact published N1 source d82a3b0329558272fa2d3b267d4f9491fcafdda5 composes without source
conflicts. It includes the accepted documentation base and N1's awaited native save commit with
cleanup of that save's original pending URI. The four-brush model, renderer and all prior brush
evidence are unchanged. The lock remains the exact SHA256 named above. This composition ran no
formatter, installation, tests, browser, native build, performance or review operation. Current
execution checks and the forthcoming published permissions change remain pending. N1 remains
unaccepted, and this unit retains its original unopened review and three-round budget.
