# ADR-0178: Native Ink Renders Through Skia, With Committed Strokes Flattened

**Status:** Active — amended 2026-10: a cohort's strokes flatten in the order their ops were
painted, not stroke order, and live ink paints op by op onto the committed layer. See the amendment
at the end.\
**Date:** 2026-10

## Context

The React Native app in `experiments/native-architecture` (the migration destination, epic 2690)
draws ink with `react-native-svg`. It has no Skia, Reanimated or gesture-handler dependency. The
migration exists because rendering cost dominated the Capacitor WebView. So the question was whether
SVG ink stays cheap as a drawing grows.

The code says it does not. The full UI has two drawing cores, and neither bounds the scene:

* **Format 6** (`src/drawing/DrawingSurface.tsx`, `RasterInk.tsx`, `checkpoints.ts`) flattens ink
  only at a checkpoint. `FixedInkCapture` calls `toDataURL` and the result is drawn back as one
  `<Image>`. A checkpoint is cut only where a crayon or eraser run starts after a different brush.
  Pen and Magic strokes in a row are never flattened, so every one stays a live SVG node.
* **Format 7** (`RecordedRasterInk7.tsx`, `RecordedSceneContent7.tsx`) never flattens. Every
  recorded op is its own element, and a stroke produces roughly one op per frame. Node count grows
  with drawing time.
* In both formats every pointer move becomes a React state update. Format 6 does one per move event;
  format 7 batches to one per frame. Each update re-renders the whole unflattened scene. Nothing
  takes an imperative path.

One long-drawing check on a physical Galaxy S21 FE (Android 16, release APK, format 6) confirmed it.
The app drew N random pen strokes, then a fixed 1-second probe stroke, and `dumpsys gfxinfo`
measured the probe:

| Committed strokes | Frames rendered | Janky | p50   | p90   |
| ----------------- | --------------- | ----- | ----- | ----- |
| 25                | 119             | 3%    | 9 ms  | 10 ms |
| 50                | 110             | 10%   | 11 ms | 14 ms |
| 100               | 74              | 53%   | 17 ms | 21 ms |
| 150               | 65              | 72%   | 20 ms | 26 ms |
| 200               | 54              | 83%   | 24 ms | 29 ms |

A toddler's picture reaches 200 strokes in minutes, so this is the common case, not an edge.

Crayon fidelity points the same way. ADR-0065 and ADR-0067 require paper-tooth grain, wax buildup at
constant hue, and color mixing. Native crayon approximates the grain with a JS-generated tile drawn
through per-pass `<Pattern>`s of `<Image>` and `<Use>`. It approximates mixing with an SVG
`<Filter>` blending against `BackgroundImage`, and react-native-svg's support for that is
unverified; mixing is reported weak on phones. That is roughly 30 SVG nodes per crayon pass in
format 6 and roughly 60 per op in format 7.

Alternatives considered:

* **Keep SVG and flatten more often**, by checkpointing every stroke through `toDataURL`. Each
  capture is an asynchronous round trip that re-encodes the whole PNG, so the cost moves from frames
  to stalls after each stroke. It also leaves the per-move React re-render and the crayon blend
  problem untouched.
* **Keep the WebView.** Already closed by the migration decision (epic 2690).
* **A custom native view per platform.** It would mean two renderers to write and keep identical,
  for no gain over Skia, which already runs on both.

## Decision

Native ink moves to `@shopify/react-native-skia` behind the existing `DrawingSurface` boundary
(`DrawingSurfaceHandle`: capturePng, captureInk, lockInput, refreshGeometry).

* **Committed ink is flattened at the contact-cohort commit.** Simultaneous contacts already form
  one cohort, which commits only when its last contact ends and is one undo unit
  (`contactCohort.finish()`, `recordedContactCohort7.end()`). When a cohort commits, its strokes are
  drawn once, in their existing order, into an offscreen Skia surface, and that snapshot becomes the
  only committed-ink layer on screen. Flattening one stroke while an earlier overlapping contact is
  still live would move it beneath that contact and flip the overlap. Rendering cost per frame then
  depends on the live cohort, not the drawing's size. Undo keeps its existing history.
* **The committed layer is rebuilt from history when the ink's inputs change**: undo, reopen, a page
  change, and an appearance change such as the theme. Committed ink depends on appearance even when
  history is unchanged: semantic Black becomes white in dark mode, and Magic takes the current
  page's themed fill (`DrawingSurface.tsx` keys `RasterInk` by page and theme for this reason). An
  appearance rebuild adds no undo entry.
* **The live cohort does not go through React state.** Moves update Skia paths through shared
  values, so React re-renders only at cohort boundaries, not on every move.
* **Crayon uses Skia natively.** The grain tile becomes an image shader. Wax buildup uses the same
  binary-tooth deposit as ADR-0065, and mixing uses a real blend mode against the committed layer,
  in place of the SVG `BackgroundImage` filter.
* **One drawing core.** The Skia renderer is built for the single drawing format chosen in issue
  2750; the other core is deleted rather than ported.
* **Web stays on its current renderer** (react-native-web and DOM SVG/canvas) for now. Skia's web
  build ships a CanvasKit WASM payload that would cost startup on the page-load budget. Whether web
  joins is decided separately, with measurements.

Done means the same long-drawing check shows flat probe-stroke frame times from 25 to 200 strokes,
on the physical Android phone and on the iPad.

## Consequences

* \+ Rendering cost stops scaling with the picture, which is the reason the migration exists.
* \+ Crayon gets real blend modes and shaders, the tools ADR-0065 and ADR-0067's grain, buildup and
  mixing need.
* \+ PNG export reads straight from the committed Skia surface, so it needs no SVG `toDataURL`
  capture.
* − A new native dependency adds app size, and it has to be kept in step with Expo and RN upgrades.
* − Native and web renderers diverge until web is decided. Brush appearance needs side-by-side
  checks across targets (issue 2759).
* − The `RasterInk`/`InkScene`/`svgCapture` code and its mounted tests are replaced, not adapted.
  Rendering tests move to asserting on the Skia surface's pixels.

## Amendment (2026-10): live ink paints op by op

Device captures (issue 2978) showed the live cohort still cost its whole length on every packet: one
React commit per input packet, and the stroke so far re-recorded and rasterized each time. On the
Galaxy, skipping only the draft picture took a long pen stroke from 5.58% janky frames to 0.31%. The
decision above stands; how a cohort reaches the committed layer changed.

* **Strokes keep their ops.** A stroke records shipping's op boundaries
  (`web/src/lib/drawing/strokeOps.ts`; natively `inkOps.ts`): a dot at its first point, then one
  path per flush that took samples (one per input packet, which both platforms deliver once per
  display frame, and one as a contact ends), continuing from the previous op's pen. Each op also
  records the frame it was painted in. Drawing version 8 saves them; a stroke saved without ops
  replays as one op, as it was drawn before. A version-5 picture, whose format cannot hold ops,
  keeps its new strokes' ops while it is open and saves those strokes without them. Live ink, every
  committed rebuild (Undo, page, theme, resize, renderer recovery) and capture paint the same ops,
  so they produce the same pixels.
* **"In their existing order" becomes "in the order they were painted."** A cohort's contacts replay
  interleaved by frame, as shipping's stroke-group command does, so a contact that reaches a
  crossing later lies on top. Painting each whole stroke in turn reversed that at every crossing
  between simultaneous contacts. A cohort still commits only when its last contact ends, and is
  still one undo unit.
* **The live cohort paints onto the committed layer.** A flush records every sample since the last
  as ops and paints only those (`skiaInkLayer.ts`). Each packet flushes and hands its picture over
  as it arrives. A packet that reaches JavaScript less than `HANDOFF_SPACING_MS` after the last
  hand-off has queued behind other work, so it waits for the next packet past that spacing or the
  next frame callback (`handoffCadence.ts`); a contact that ends flushes at once. The view draws the
  layer as tiles and re-uploads only the tiles a flush changed; the picture reaches the view through
  Skia's JSI setter, so live ink renders no React. A commit adopts the pixels already painted. Any
  other change to the committed strokes replays them, then replays the live cohort's recorded ops.
* **The view's picture swap is locked.** react-native-skia's picture view replaces its picture on
  the JS thread while its render thread copies it to draw; unsynchronized, a replacement that
  dropped a picture's last reference could free the picture mid-draw. react-native-skia 2.14's
  renderer takes one lock on both sides (2.6.2 needed a pnpm patch to), so the ink layer releases
  each picture as soon as the view holds the next (`skiaViewPicture.ts`).
* **Crayon glazes once per pass, as a group.** A pass's wax accumulates at full opacity and is
  glazed onto the ink beneath it as one group, restamped from the pre-group pixels each frame so
  overlapping chunks never glaze over their own wax. Contacts drawn together share a group, as
  shipping's pass buffer does; a new cohort starts a frame after the last one ends, so a group never
  spans cohorts.
* **Capture reads the committed layer** (resampled to the capture grid) instead of rendering the
  strokes through SVG, which could not reproduce these pixels.

Consequences:

* \+ A frame's live ink costs its new samples, not the stroke so far, and the drawing surface
  renders only when a cohort starts or ends.
* \+ Ink joints and simultaneous-contact overlaps match shipping's op composition. A pixel test
  replays each brush frame by frame against a rebuild and a capture
  (`tools/tests/native-incremental-ink.test.mjs`).
* − A rebuild draws one op per painted frame rather than one path per stroke, so Undo and page or
  theme changes cost more on a long drawing.
* − The layer holds the committed raster, its tile images and, while a Crayon pass is open, a pass
  buffer and a pre-group copy: up to four paper-sized rasters.
* − Live ink depends on react-native-skia ordering the swap with the draw;
  `tools/tests/native-picture-lifetime.test.mjs` reads the installed renderer and fails a version
  that touches the picture outside its lock.
* − Pixels at op joints differ slightly from a single path per stroke: each op's round cap
  antialiases against the one before it, as shipping's do.
