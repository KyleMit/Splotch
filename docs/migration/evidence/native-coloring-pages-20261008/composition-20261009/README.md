# Coloring-page source composition

The exact composed source is dc24e2787e719f9d2d756206bd69ed495fc13631. Its merge parents are the
clean page checkpoint 81fe3610ff896df849ae19645585e7ffdbf5571d and published N1
20b51012a9bb3daa1314cab1d8c276cc9eb8a977. The [light-check receipt](light-checks.json) records
source trees, lock hash, commands, outcomes, and provisioning limits. N1 remains unaccepted; the
page unit's original review has not opened.

The source keeps N1's capped-stroke recovery, candidate-owned palette/theme, and maintained Debug
recipe. The page picker adds only consumed scale/scrim values to the local theme projection. Tests
pin those values to the shipping token owner and reject actual mutated scale/scrim fixtures. The
scanner's exact expected inventory adds the three new maintained page source files; its ownership
policy is unchanged.

## Current saved-picture schema

The production model and both storage adapters serialize this shape:

```ts
type PageId = 'blank' | 'sunshine' | 'flower' | 'turtle';
type Drawing = {
  version: 2;
  pageId: PageId;
  strokes: {
    color: PaletteLabel;
    brush: 'pencil' | 'marker';
    points: { x: number; y: number }[];
  }[];
};
```

`parseDrawing` validates the finite page identity, palette identity, brush, finite paper-bound
points, and existing stroke/point budgets. The actual first-slice version-1 shape is read as blank
paper while preserving all Pencil/Marker strokes. This is compatibility with new-app saves; no
retired settings or drawing data is imported. Changing pages commits an empty selected page in one
Undo operation. Selecting the current page is a no-op. Clear retains the page; Undo and captured PNG
snapshots retain the complete page/paint drawing.

The independent Crayon/Magic unit also has genuine version-2 saves, with top-level `rainbow` and
Crayon seed/Magic rainbow metadata. Those are not supported or silently reinterpreted by this
isolated source. The scheduled joint composition must introduce a distinct version 3 carrying
`pageId`, `rainbow`, and the complete stroke union, with validated readers for first-slice v1,
page-v2, and brush-v2. Page-v2/v1 need the brush owner's canonical initial rainbow state; brush-v2
needs blank page identity. Mixed or ambiguous v2 shapes must fail instead of losing fields. Joint
round-trip fixtures must preserve seeds, phases, colors, points, and pages exactly. No v3 schema is
implemented or accepted in this checkpoint.

## Prepared browser execution

The [prepared browser script](browser-smoke.mjs.txt) is not executed. It retains the original real
product assertions, writes to a separate output directory, and refuses a different candidate/source
tree, lock, or dirty candidate source. Documentation-only commits can follow the source pin. After a
coordinated window and owned frozen-lock install, verify port 5310 is free, start the candidate
Metro with at most two workers, copy this file to a `.mjs` path, and execute it. Stop only the
recorded owned server handle. Record exact source, script/output hashes, terminal status, and
screenshots separately from the original capture.

The assertions cover the named picker, every visible choice and checked state, real Green marker ink
under Garden flower, page-change/Undo, Clear/Undo, Blank/Undo, save/reload/reopen exact SVG, PNG
outline plus paint pixels, corrupt-page refusal, denied-save retention, phone bounds, and the
painted scrim. N1's source fix is covered by its inherited cap-recovery test; this does not transfer
that obligation to the page unit.

## Prepared native execution

Native execution remains unrun for this page source. The candidate ID is
`art.splotch.migration.probe`. The N1 owner's observed iPhone 17 Pro/iOS 26.5 flow is retained at
`/private/tmp/splotch-drawing-dev-checkpoint-01a11a00/ios-release-firstslice.yaml`; it is read-only
reference evidence. Page controls change the layout, so drawing gestures must be grounded in the
actual page-source paper bounds after the first native screenshot rather than assuming inherited
percentage coordinates still hit paper.

In the scheduled window, inspect actual labels/checked accessibility state, exercise all four page
choices, and capture the picker and outlines on the phone. Select Garden flower, draw a known color
stroke, and inspect the saved file for exact v2 page/paint fields. Exercise page/Undo, Clear/Undo,
and Blank/Undo and compare screenshots. Save, terminate/relaunch the app, reopen that same file, and
compare both data and visible artwork. Export through the real share adapter and inspect the native
raster for outline and paint; N1 observed a 3x native raster, so use its actual scale rather than
imposing browser pixel dimensions. Finally exercise corrupt page input and a denied save while
checking the live picture is retained. Record native selector failures as actual failures, and
repair page-owned behavior under this same owner.

The applicable full tier and exact composed browser/native observations remain pending the root's
coordinated window. Previous timeout, inherited failures, and earlier product failures remain
preserved. No installability, VoiceOver/TalkBack qualification, architecture selection, source
acceptance, or review budget consumption is claimed.
