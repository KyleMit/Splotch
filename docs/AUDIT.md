# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Code audit — Drawing / canvas engine

### [P2][complexity] `renderOp` is a 95-line dispatcher with a 35-line crayon-bbox block inlined

**File(s):** `web/src/lib/drawing/strokeOps.ts:463-557` (`renderOp`), esp. 499-552 — pinned at SHA
f934d43

#### Problem

`renderOp` switches on six op kinds, and the `op.crayon && !op.erase` arm (499-552) is by itself a
50-line block that: sets up the buffer, mirrors the transform, paints, sets `dirty`, then computes
an op bounding box inline (517-537) and repeats the paint+bounds into the paper-space buffer
(542-550). The bbox computation (dot vs path min/max over segs) is buried procedural code inside a
dispatcher.

```ts
let x0: number; let y0: number; let x1: number; let y1: number; let pad: number;
if (op.kind === 'dot') { x0 = x1 = op.x; ... pad = op.radius + 2; }
else { ... for (const s of op.segs) { x0 = Math.min(x0, s.cx, s.x); ... } pad = op.lineWidth / 2 + 2; }
```

#### Proposed solution

Extract two helpers: `function opDeviceBounds(op: DotOp | PathOp): { x0; y0; x1; y1; pad }` (the
517-537 block), and `function renderCrayonOp(target, op): void` (the whole 499-552 arm). `renderOp`
then dispatches in one line per kind. The extracted `opDeviceBounds` also lets `unionCrayonBounds`
be fed a struct instead of six positional args.

#### Verification

`npm run test -- crayonBrush` and the engine crayon E2E stay green; extracted `opDeviceBounds` gets
a direct unit test (dot radius, multi-seg path). Pixel output is unchanged.

---

### [P2][duplication] Extract the two-blit subtractive glaze stamp shared by `flushCrayonBuffer` and `renderOp`

**File(s):** `web/src/lib/drawing/strokeOps.ts:395-413` and `473-489` — pinned at SHA f934d43

#### Problem

The exact "darken at alpha 1, then source-over at alpha `1-mix`" stamp is written twice:

```ts
// flushCrayonBuffer (399-410)
target.globalCompositeOperation = 'darken';
target.globalAlpha = 1;
target.drawImage(buf.ctx.canvas, b.x0, b.y0, w, h, b.x0, b.y0, w, h);
target.globalCompositeOperation = 'source-over';
target.globalAlpha = 1 - getCrayonMix();
target.drawImage(buf.ctx.canvas, b.x0, b.y0, w, h, b.x0, b.y0, w, h);

// renderOp crayonPassRaster (482-488)
target.globalCompositeOperation = 'darken';
target.globalAlpha = 1;
target.drawImage(op.canvas, op.x, op.y);
target.globalCompositeOperation = 'source-over';
target.globalAlpha = 1 - op.mix;
target.drawImage(op.canvas, op.x, op.y);
```

This subtractive-mix formula is the crux of the crayon look (per the long pass-buffer note). Having
it in two places means a fix or tuning must be mirrored, and the two already differ subtly
(device-rect blit vs paper-space draw) — a source of the ±1 rounding reconcile documented in
`undoHistory.ts`.

#### Proposed solution

```ts
function stampGlaze(
  target: CanvasRenderingContext2D,
  source: CanvasImageSource,
  mix: number,
  draw: () => void,
);
```

or simpler, two thin variants sharing a core that sets the two composite/alpha states around a
caller-supplied `drawImage`. Both call sites reduce to one line each and `globalAlpha` is guaranteed
reset.

#### Verification

`npm run test -- crayonBrush` plus the crayon commit/undo E2E; visual parity on `/dev/engine`. A
unit test can assert the composite-op/alpha sequence via a mock 2D context.

---

### [P2][dead-code] `fillDecodePending` is written three times and never read

**File(s):** `web/src/lib/drawing/magicBrush.ts:61, 317, 323, 336` — pinned at SHA f934d43

#### Problem

`fillDecodePending` is assigned in `setColorSheet` (336), `loadSheetImage.onload` (317), and
`onerror` (323), but there is **no read** — the only other occurrence (299) is a comment in
`isMagicSheetUnready` explaining why it is *not* used (`!sheetReady` is the real signal). It is pure
dead state that a maintainer must still reason about ("does the unready check depend on this?").

```ts
let fillDecodePending = false;   // 61 — written, never read
...
fillDecodePending = colorUrl !== null;  // 336
```

#### Proposed solution

Delete the field and its three assignments. Update the parenthetical in the `isMagicSheetUnready`
comment (299-300) that references it.

#### Verification

`grep -n 'fillDecodePending' web/src/lib/drawing/magicBrush.ts` returns only the comment after
removal; `npm run test -- magicBrush` and `npm run check` pass.

---

### [P2][maintainability] `activePointerIds` Set redundantly shadows `activePointers` Map keys

**File(s):** `web/src/lib/drawing/engine.ts:677-678, 760, 796, 932, 970-978` — pinned at SHA f934d43

#### Problem

Two collections track the same pointer identities in lockstep:

```ts
const activePointerIds = new Set<number>();
const activePointers = new Map<number, PointerState>();
```

Every `activePointers.set(id, …)` is paired with `activePointerIds.add(id)` and every delete with a
matching delete. The Set exists only so `releaseAllPointers` can iterate ids *after*
`activePointers.clear()` (965 clears the map, 970 iterates the Set). This is duplicated bookkeeping
that can silently drift (add to one, forget the other) and doubles the mental model of "which
pointers are live."

#### Proposed solution

Drop `activePointerIds`. In `releaseAllPointers`, snapshot keys before clearing:
`const ids = [...activePointers.keys()]; activePointers.clear(); for (const id of ids) { …releaseCaptureSafe(id) }`.
Every other add/delete site loses its second line.

#### Verification

`npm run check` + engine E2E (navigate-away-mid-stroke and multi-touch release cases).
Pointer-capture release count is unchanged.

---

### [P2][complexity] `generateAiImage` bundles six concerns in one 95-line try/catch

**File(s):** `web/src/lib/drawing/aiImage.ts:94-188` — pinned at SHA f934d43

#### Problem

`generateAiImage` opens the modal, exports the canvas, sets the preview, encodes WebP, builds auth
headers, fetches, `switch`es over four response kinds, and drives auto-save — all inside one
function with a trailing `catch`/`finally`. The auth-header construction (135-140) and the response
`switch` (150-169) are each self-contained units that obscure the top-level flow.

#### Proposed solution

Extract:

* `function buildGenerateHeaders(uploadBlob: Blob): Record<string,string>` (135-140),
* `function handleAiResponse(response: AiImageResponse, runId, imageBlob): 'done' | void` — the
  150-174 switch + finish/auto-save.

`generateAiImage` then reads as: launch → export → upload → dispatch. Keeps the same `runId`
ownership checks.

#### Verification

`npm run test -- aiImage` (the existing 387-line suite) must stay green — it already exercises
safety/throttle/error/timeout branches, so an extraction that changes behaviour will fail it.

---

### [P3][duplication] Crayon-buffer allocate-or-resize logic is written three times

**File(s):**
`web/src/lib/drawing/strokeOps.ts:229-252 (`livePaperBufferFor`), 299-322 (`crayonBufferFor`)`; also
engine `resizeCanvas` overlay loop `web/src/lib/drawing/engine.ts:428-437` — pinned at SHA f934d43

#### Problem

The pattern "create a canvas at WxH, set `lineCap/lineJoin='round'`; on later calls, if the size
grew, reassign width/height and re-arm caps and reset `dirty`/`bounds`" appears in both
`livePaperBufferFor` and `crayonBufferFor` almost verbatim, and the cap-arming half repeats again in
the engine's overlay resize loop.

```ts
// crayonBufferFor 313-320 and livePaperBufferFor 240-250 — near-identical bodies
buf.ctx.canvas.width = w;
buf.ctx.canvas.height = h;
buf.ctx.lineCap = 'round';
buf.ctx.lineJoin = 'round';
buf.dirty = false;
buf.bounds = null;
```

#### Proposed solution

`function ensureBufferSize(buf: CrayonPassBuffer, w: number, h: number): void` that grows the
backing canvas, re-arms round caps, and resets `dirty`/`bounds`. A
`function newRoundCanvasCtx(w, h): CanvasRenderingContext2D | null` covers first allocation and the
engine's overlay/snapshot canvases (also duplicated in `undoHistory.ensurePaperCovers`,
`adoptPaperAsSnapshot`, and `engine.snapshotStrokes`).

#### Verification

`npm run test -- crayonBrush` and the resize/rotation E2E. Unit-test `ensureBufferSize` for the grow
and no-op paths.

---

### [P3][duplication] `try { canvas.releasePointerCapture(id) } catch {}` repeated in four handlers

**File(s):** `web/src/lib/drawing/engine.ts:770-772, 798-800, 946-948, 970-976` — pinned at SHA
f934d43

#### Problem

The identical guarded release appears in `startDrawing`, `discardPointer`, `stopDrawing`, and (a
`hasPointerCapture`-checked variant) `releaseAllPointers`. The empty `catch {}` and its rationale
live in four spots.

#### Proposed solution

`function releaseCaptureSafe(id: number): void { try { canvas.releasePointerCapture(id); } catch {} }`
and call it from all four. Fold the `hasPointerCapture` pre-check into it.

#### Verification

`npm run check`; engine E2E pointer lifecycle cases unchanged.

---

### [P3][duplication] The path/dot geometric bounding-box is computed in two modules

**File(s):** `web/src/lib/drawing/strokeOps.ts:522-536` and
`web/src/lib/drawing/undoHistory.ts:326-341` (`opPaddedBounds`) — pinned at SHA f934d43

#### Problem

Both compute an op's bounds by `min/max`-scanning `startX/startY` and each seg's `cx,cy,x,y`, then
padding by half line width (+ AA pad). `strokeOps` uses `pad = op.lineWidth/2 + 2`; `undoHistory`
uses `PATCH_AA_PAD = 2` with a crayon scale. The `2` in strokeOps is the same AA pad, un-named. Two
implementations of one geometric fact will diverge (they nearly have: the crayon width-scale
handling only exists in one).

#### Proposed solution

A single `export function opGeometricBounds(op: DotOp | PathOp): Box` in a shared module, plus a
shared `AA_PAD = 2` constant. `strokeOps.renderOp` and `undoHistory.opPaddedBounds` both derive from
it, applying their own scale/pad on top.

#### Verification

`npm run test -- undoHistory strokeMath`; the `foldRegionsForCommands` rect-math unit tests already
exist — they must still pass with the shared bounds source.

---

### [P3][maintainability] Engine-created overlay CSS duplicates DrawingCanvas's `.crayon-overlay` styles

**File(s):** `web/src/lib/drawing/engine.ts:1261-1268` and
`web/src/lib/components/DrawingCanvas.svelte:477-489` — pinned at SHA f934d43

#### Problem

The engine builds overlay elements with an inline CSS string:

```ts
const overlayCss = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2;';
... crayonOverlay.style.cssText = overlayCss + 'mix-blend-mode:darken;';
```

and the Svelte component re-declares the same geometry + `mix-blend-mode:darken` in
`.crayon-overlay`. The component comment even says "keep the two in sync." Two sources of truth for
the same visual contract; a z-index or blend change must be made twice or the `/dev/engine` harness
silently diverges from production.

#### Proposed solution

Since the harness path constructs elements in JS, keep one source: give the JS-created overlays the
same class names (`crayon-overlay`, `crayon-overlay-top`) and move the styling entirely into a
shared (non-scoped) stylesheet or a `:global` rule the harness also loads, so the `cssText` string
disappears. At minimum, hoist the shared declarations into a single exported constant.

#### Verification

Load `/dev/engine` (harness-created overlays) and `/` (template overlays); crayon preview
compositing is identical. `grep` for the duplicated properties returns one location.

---

### [P3][naming] Hard-coded default color `'#AB71E1'` is an ungreppable magic string

**File(s):** `web/src/lib/drawing/engine.ts:1290` — pinned at SHA f934d43

#### Problem

```ts
currentColor = options.initialColor || '#AB71E1';
```

The engine's fallback color is a bare hex literal with no name. It encodes palette knowledge (a
specific swatch) that lives elsewhere in `state/colors`. A designer changing the default swatch
would never find this, and there is no link between the literal and the palette it came from.

#### Proposed solution

Import/define a named `DEFAULT_STROKE_COLOR` (ideally sourced from the palette module) and use it
here. If the palette can't be imported at this layer, define the constant once with a comment tying
it to the palette entry.

#### Verification

`grep -rn 'AB71E1' web/src` shows a single named definition. `npm run check` passes; first-boot
stroke color unchanged.

---

### [P3][duplication] Op-modifier fields are hand-copied when building `dot` and `path` ops

**File(s):**
`web/src/lib/drawing/engine.ts:529-539 (`renderStrokeStart`) and 557-569 (`strokeSmoothSegments`)` —
pinned at SHA f934d43

#### Problem

Both op constructors copy the same five style modifiers off `PointerState`:

```ts
color: ps.color, erase: ps.erase, magic: ps.magic, crayon: ps.crayon, seed: ps.seed,
```

Adding a future modifier (or renaming one) requires touching both, and it is easy to miss one (they
would then disagree between the start dot and the stroke body).

#### Proposed solution

`function strokeStyleOf(ps: PointerState): { color; erase; magic; crayon; seed }` and spread it:
`{ kind: 'dot', x, y, radius, ...strokeStyleOf(ps) }`. Single definition of "the style fields an op
carries."

#### Verification

`npm run check`; engine E2E stroke replay/undo unchanged (ops are structurally identical).

---

### [P3][type-safety] `listen<K>` uses an unused generic and an `(e: never)` cast

**File(s):** `web/src/lib/drawing/engine.ts:1298-1308` — pinned at SHA f934d43

#### Problem

```ts
function listen<K extends keyof WindowEventMap>(
  target: EventTarget, type: K | string,
  handler: (e: never) => void, options?: ...
) { target.addEventListener(type, handler as EventListener, options); ... }
```

`K` is never used to constrain `handler` (the handler is typed `(e: never)`), and `type: K | string`
collapses to `string`, so the generic buys nothing. `(e: never)` plus `as EventListener` defeats
type-checking at every call site — `listen(canvas, 'pointerdown', startDrawing)` gets no
verification that `startDrawing` accepts a `PointerEvent`.

#### Proposed solution

Drop the generic and type it against the concrete targets, e.g. overloads keyed on
`WindowEventMap`/`HTMLElementEventMap`/`DocumentEventMap`, or minimally
`handler: (e: Event) => void` and let each handler keep its precise param via a typed wrapper. Even
a plain `(e: Event)` is stronger than `never`.

#### Verification

`npm run check` still passes and now catches a mismatched handler signature (introduce one to
confirm it errors, then revert).

---

### [P4][dead-code] `stopDrawing(e?)` — the optional param and `if (!e) return` are unreachable

**File(s):** `web/src/lib/drawing/engine.ts:910-911, 1329-1331` — pinned at SHA f934d43

#### Problem

```ts
function stopDrawing(e?: PointerEvent) {
  if (!e) return;
```

`stopDrawing` is only ever registered as an event listener (pointerup/out/cancel), which always
supplies an event. Nothing calls it with no argument. The optional `?` and guard imply a call path
that does not exist.

#### Proposed solution

Make the parameter required: `function stopDrawing(e: PointerEvent)` and delete the guard.
(Force-stop with no event is already `releaseAllPointers`.)

#### Verification

`grep -n 'stopDrawing(' web/src/lib/drawing/engine.ts` shows only listener registrations.
`npm run check` + engine E2E pass.

---

### [P4][duplication] `repaintAll` triples a command-replay loop that should be one helper

**File(s):** `web/src/lib/drawing/undoHistory.ts:783-795` — pinned at SHA f934d43

#### Problem

```ts
for (const cmd of pendingCommands) for (const op of cmd.ops) renderOp(target, op);
for (const cmd of deferredCommands) for (const op of cmd.ops) renderOp(target, op);
if (activeCommand) { for (const op of activeCommand.ops) renderOp(target, op); }
```

The same "replay these commands' ops through `renderOp`" appears three times, and the identical
double-loop is also implicit elsewhere. Order matters (pending → deferred → active), so the intent
is worth naming.

#### Proposed solution

`function replayCommands(target: CanvasRenderingContext2D, commands: StrokeGroupCommand[]): void`
and call it three times (wrapping `activeCommand` as `activeCommand ? [activeCommand] : []`). The
ordering reads explicitly.

#### Verification

`npm run test -- undoHistory`; mid-stroke resize + magic-pending repaint E2E unchanged.

---

### [P4][naming] `currentLineWidth = 8` and manual `sqrt` distance are un-named / inconsistent

**File(s):** `web/src/lib/drawing/engine.ts:117 (default width), 838 and 861 (manual distance)` —
pinned at SHA f934d43

#### Problem

Two small self-documentation gaps: (a) `let currentLineWidth = 8;` — the interim default before a
component pushes a real width — is a bare literal with no name; (b) distance is computed as
`Math.sqrt(deltaX * deltaX + deltaY * deltaY)` in `restartStrokeIfResumed` (838) and `strokeSpeed`
(861), while the rest of the drawing code (e.g. `crayonBrush`, `advanceEdgeSwipeCandidate` at 816)
uses `Math.hypot`. The inconsistency makes the two forms look intentionally different when they are
not.

#### Proposed solution

Name the default (`const DEFAULT_LINE_WIDTH_PX = 8;`) and replace both manual `sqrt` forms with
`Math.hypot(deltaX, deltaY)` to match the surrounding style.

#### Verification

`npm run check`; `strokeMath` speed tests unaffected (`calculateStrokeSpeed` already takes
precomputed distance).

---

### [P4][maintainability] Group the four crayon-overlay module variables into one nullable struct

**File(s):** `web/src/lib/drawing/engine.ts:141-145, 1194-1201, 428-437` — pinned at SHA f934d43

#### Problem

Five module-level variables — `crayonOverlay`, `crayonOverlayCtx`, `crayonOverlayTop`,
`crayonOverlayTopCtx`, `crayonOverlaysCreated` — represent one thing (the overlay pair) and are
always created together, resized together (428-437), and nulled together in teardown (1194-1201).
Spread across the module they are easy to update partially.

```ts
let crayonOverlay: HTMLCanvasElement | null = null;
let crayonOverlayCtx: CanvasRenderingContext2D | null = null;
let crayonOverlayTop: HTMLCanvasElement | null = null;
let crayonOverlayTopCtx: CanvasRenderingContext2D | null = null;
let crayonOverlaysCreated = false;
```

#### Proposed solution

`let crayonOverlays: { bottom: HTMLCanvasElement; bottomCtx: ...; top: ...; topCtx: ...; created: boolean } | null = null;`
— one atomic value that is set, resized, and cleared as a unit; `syncCrayonOverlayMix`,
`resizeCanvas`, and `teardownEngine` each touch one variable.

#### Verification

`npm run check`; `/dev/engine` and `/` crayon overlays behave identically across
mount/resize/teardown.

---

### [P4][duplication] Speed-sampling reset is copy-pasted in three places

**File(s):**
`web/src/lib/drawing/engine.ts:755 (start), 787-789 (commitEdgeSwipe), 844 (restartStrokeIfResumed)`
— pinned at SHA f934d43

#### Problem

The "start a fresh sliding speed window" reset — `ps.speedSamples = [{ t: now, distance: 0 }]` (plus
`ps.lastTime = now` in two of them) — appears at pointer creation, on edge-swipe commit, and on
stroke resume. The zero-distance-anchor invariant (documented at 754) is re-encoded each time.

#### Proposed solution

`function resetSpeedWindow(ps: PointerState, now: number): void { ps.speedSamples = [{ t: now, distance: 0 }]; ps.lastTime = now; }`
and call it from all three (start can pass its `now`).

#### Verification

`npm run check`; `strokeMath` speed tests + draw-sound E2E unchanged.

---

### [P5][consistency] Two rect shapes (`{x,y,w,h}` literals vs `PatchRect`) describe the same concept

**File(s):**
`web/src/lib/drawing/undoHistory.ts:76-81 (`PatchRect`), 208-217 (`activeCrayonRasterRects`returns inline`{x,y,w,h}`)`;
consumed in `engine.ts:623-634` — pinned at SHA f934d43

#### Problem

`PatchRect { x; y; w; h }` is the named paper-rect type, yet `activeCrayonRasterRects` returns an
inline `{ x: number; y: number; w: number; h: number }[]` for the same idea, and the engine iterates
it as `r.x, r.y, r.w, r.h`. The engine also passes rects to `blitPaperRect(target, x, y, w, h)`
positionally, so three representations of "a paper rectangle" coexist.

#### Proposed solution

Have `activeCrayonRasterRects` return `PatchRect[]`, and consider a
`blitPaperRect(target, rect: PatchRect)` overload so callers pass the struct. One rectangle
vocabulary across the module.

#### Verification

`npm run check`; crayon commit blit-back E2E unchanged.

---

### [P5][readability] `paper.pxW > 0 && paper.pxH > 0` guard repeated in the magic-brush host closures

**File(s):** `web/src/lib/drawing/engine.ts:1281-1283` — pinned at SHA f934d43

#### Problem

```ts
paperSize: () => paper.pxW > 0 && paper.pxH > 0 ? { width: paper.pxW, height: paper.pxH } : null,
sheetBounds: () => (paper.pxW > 0 && paper.pxH > 0 ? sheetBoundsPaper() : null),
```

The "paper has been sized yet" predicate is inlined twice with the raw comparison, obscuring intent.

#### Proposed solution

`function paperIsSized(): boolean { return paper.pxW > 0 && paper.pxH > 0; }` used by both closures
(and reusable anywhere else that gates on an initialized paper).

#### Verification

`npm run check`; magic-sheet init/rasterize E2E unchanged.

---

### [P5][testability] `emptyScan` / `strokeOps` module-singleton scratch state has no reset seam

**File(s):** `web/src/lib/drawing/emptyScan.ts:14-15` (`scratchCanvas`/`scratchCtx`),
`web/src/lib/drawing/strokeOps.ts:190-192, 219` (`bufferByTarget`, `liveBuffer`, `livePaperBuffer`)
— pinned at SHA f934d43

#### Problem

These modules hold process-lifetime mutable singletons (scratch canvas, per-target crayon buffers,
live paper buffer). `strokeOps` exposes `setLiveCrayonBuffer(null, null)` as a partial reset, but
`emptyScan`'s scratch and `strokeOps`' `bufferByTarget`/`livePaperSide` have no teardown/reset. Unit
tests that want a clean slate (and the engine teardown itself) cannot fully reset this state, so
tests can leak buffers between cases and the "outlives teardown" behavior is implicit rather than
expressed.

#### Proposed solution

Add small explicit reset seams where teardown needs them — e.g. `resetEmptyScanScratch()` and ensure
`setLiveCrayonBuffer(null,null)` (already called in `teardownEngine`) also clears `livePaperSide`.
Document which singletons deliberately persist (paper raster, per ADR-0004) versus which should
reset on teardown. This is a seam addition, not a rewrite of the singleton design.

#### Verification

Add a Vitest that renders a crayon op, tears down, and asserts buffer state is clean; it should fail
before the seam and pass after. `npm run test -- strokeOps emptyScan`.

---

That is 24 findings. The three P1 items — the oversized `initDrawingCanvas`, the vestigial
always-true `isDrawing` field, and the pervasive inline point type — are the highest-leverage. Every
finding was verified against the files at SHA `f934d43`; the `isDrawing`, `fillDecodePending`, and
`activePointerIds` dead/redundant-state claims were confirmed by grep (no false-write / no read /
lockstep mutation respectively).

## Source: Code audit — AI image generation

### [P2][complexity] Split the 95-line `generateAiImage` into named phases

**File(s):** `web/src/lib/drawing/aiImage.ts:94-188` (`generateAiImage`) — pinned at SHA f934d43

#### Problem

`generateAiImage` is a single ~95-line function that does: the re-entrancy guard,
`AbortController`/timeout setup, canvas export, preview object-URL creation, WebP transcode
selection, credential-header assembly, endpoint construction, the `fetch`, a four-arm response
`switch` with per-arm logging, commit, auto-save orchestration, catch, and `finally` teardown. The
reader has to hold the whole request lifecycle plus the ownership (`isAiGenerationActive(runId)`)
discipline in their head at once, and the response `switch` (lines 150-169) is buried mid-function.
This is the highest-traffic module in the scope and the hardest to scan.

#### Proposed solution

Extract cohesive helpers within the module, leaving `generateAiImage` as an orchestrator:

* `async function exportUploadImage(blob, runId): Promise<{ preview: Blob; upload: Blob } | null>` —
  wraps lines 111-128 (export, preview set, WebP encode).
* `function buildRequest(uploadBlob, style): { endpoint: string; headers: Record<string,string>; body: Blob }`
  — lines 135-142 (see the auth-header and endpoint findings below).
* `function applyResponse(runId, response): 'committed' | 'failed'` — the `switch` at lines 150-169,
  returning whether it committed so the caller decides on auto-save. Keep the `try/catch/finally`
  skeleton in `generateAiImage`.

#### Verification

`npm run check` passes; `web/src/lib/drawing/aiImage.test.ts` (the ownership, response-handling, and
upload-format suites) stays green unchanged — it exercises `generateAiImage` end-to-end, so
behavior-preserving extraction is proven by an untouched test file.

---

### [P2][testability] Extract the AiDial progress engine out of the component into a testable unit

**File(s):** `web/src/lib/components/AiDial.svelte:13-91` (rAF loop + four `$effect`s) — pinned at
SHA f934d43

#### Problem

The dial's fill model is imperative logic tangled into the component: a mutable
`rafId`/`startTime`/`done` triple (non-`$state`), a `loop()` with three phase branches (lines
24-46), plus **four** separate `$effect` blocks (lines 63-91) that start/stop the loop on different
`ui` combinations, and a fifth destroy-cleanup effect. The lifecycle is spread across five reactive
blocks sharing hidden mutable state, and there is no unit test — the behavior is only covered
indirectly by `web/tests/ai-timer.spec.ts` (an E2E), precisely because the math is unreachable
without a DOM. Any change risks a stuck spinner (the exact class of bug the comments at lines 22-45
and 78-81 are patching around).

#### Proposed solution

Move the pure progress model into `web/src/lib/components/aiDialProgress.ts` (or a `.svelte.ts` rune
module): `createDialProgress(estimateMs: number)` returning
`{ start(), markDone(), stop(), tick(now: number): { progress: number; waiting: boolean; revealed: boolean } }`.
Unit-test the curve, the overrun asymptote, and the done-ramp directly. The component keeps only the
rAF pump and the `ui`→`start/markDone/stop` wiring, ideally collapsed from four effects to one that
maps the `(aiResultOpen, aiGenerating, aiResultUrl, aiError)` tuple to a single command.

#### Verification

New Vitest unit test drives `tick()` with synthetic timestamps and asserts monotonic progress,
`waiting` after `estimateMs`, and `revealed` at completion; `web/tests/ai-timer.spec.ts` still
passes.

---

### [P2][type-safety] Replace the stringly-typed style with a `StyleName` union

**File(s):** `web/src/lib/ai/styles.ts:5,22`; `web/src/lib/ai/prompt.ts:7-8`;
`web/src/lib/drawing/aiImage.ts:95`; `web/src/lib/components/AiImagePrompt.svelte:39` — pinned at
SHA f934d43

#### Problem

The style is untyped end to end: `STYLE_SUFFIXES: Record<string, string>` (styles.ts:5),
`STYLE_NAMES = Object.keys(...)` yields `string[]` (styles.ts:22),
`buildPromptForStyle(style: unknown, …)` (prompt.ts:8),
`generateAiImage({ style = '' }: { style?: string })` (aiImage.ts:95), and
`handleSelectStyle(style: string)` (AiImagePrompt.svelte:39). A typo in a style name compiles fine
and silently falls back to the base prompt. The set of valid styles is a fixed enum but the compiler
enforces nothing.

#### Proposed solution

In styles.ts derive and export `export type StyleName = keyof typeof STYLE_SUFFIXES;` and type
`STYLE_SUFFIXES: Record<StyleName, string>` and `STYLE_NAMES: StyleName[]`
(`Object.keys(...) as StyleName[]`). Thread `StyleName` through `handleSelectStyle`,
`generateAiImage`'s `style`, and the `?style=` param. Keep `buildPromptForStyle`'s parameter as
`string | null | undefined` (see its own finding) since the server receives an untrusted query value
— but the client-side call sites become type-checked.

#### Verification

`npm run check`; deliberately introduce a mistyped style constant in a scratch edit and confirm the
compiler flags it, then revert.

---

### [P3][architecture] Split `aiPreview.ts` — the pinch-zoom engine doesn't belong in a "preview loader" component file

**File(s):** `web/src/lib/components/aiPreview.ts:1-163`; imported by
`web/src/lib/actions/pinchZoom.svelte.ts:1` — pinned at SHA f934d43

#### Problem

`aiPreview.ts` holds two unrelated concerns: `createAiPreviewLoader` (a load-race deduper, lines
1-23) and a full DOM-free pinch-zoom gesture accumulator with its geometry helpers and clamp math
(lines 25-163). They share nothing. Worse for discoverability, the Svelte **action**
`pinchZoom.svelte.ts` reaches into `$lib/components/aiPreview` for `createPinchZoom`/`Point` —
gesture math imported from a file named after image previews. Someone looking for the zoom engine
won't find it; someone reading the loader wades through 140 lines of unrelated geometry.

#### Proposed solution

Split into two modules: keep `createAiPreviewLoader` in `aiPreview.ts` (or `aiPreviewLoader.ts`),
and move lines 25-163 into `web/src/lib/actions/pinchZoomCore.ts` (co-located with its only
consumer, the action). Split the test file `aiPreview.test.ts` accordingly. Update the two import
sites (`AiImagePrompt.svelte`, `pinchZoom.svelte.ts`).

#### Verification

`npm run check` + `npm run test:unit` green; grep confirms no remaining `aiPreview` import
references the zoom exports.

---

### [P3][duplication] Extract credential-header assembly; stop hard-coding the auth header names client-side

**File(s):** `web/src/lib/drawing/aiImage.ts:135-142` — pinned at SHA f934d43

#### Problem

The upload's auth headers are built inline with bare string literals:

```ts
const headers: Record<string, string> = { 'Content-Type': uploadBlob.type || 'image/png' };
if (settings.aiUserApiKey) headers['X-Api-Key'] = settings.aiUserApiKey;
else headers['X-Access-Token'] = settings.aiAccessToken;
```

The header names `X-Api-Key` / `X-Access-Token` also appear as literals in the server CORS list
(`web/src/hooks.server.ts:63`) with no shared source of truth — rename one and the two drift
silently. The BYOK-vs-managed selection is also request-shaping logic that reads cleaner as its own
function.

#### Proposed solution

Add named constants (e.g. in `web/src/lib/ai/limits.ts` or a small `web/src/lib/ai/headers.ts` that
both client and server import):
`export const API_KEY_HEADER = 'X-Api-Key'; export const ACCESS_TOKEN_HEADER = 'X-Access-Token';`.
Extract `function buildAuthHeaders(uploadType: string): Record<string,string>` in aiImage.ts using
those constants, and reference them from the server CORS list too.

#### Verification

`npm run check`; `aiImage.test.ts`'s `uploadedImage()` helper still reads the `Content-Type`; grep
shows the header strings defined once.

---

### [P3][dead-code] `buildPromptForStyle`'s `defaultPrompt` parameter is never overridden, and its `style` is typed `unknown`

**File(s):** `web/src/lib/ai/prompt.ts:7-14` — pinned at SHA f934d43

#### Problem

```ts
export function buildPromptForStyle(
  style: unknown,
  suffixes: Record<string, string>,
  defaultPrompt: string = DEFAULT_PROMPT,
): string;
```

Both call sites (`web/src/routes/api/generate-image/+server.ts:117` and
`tools/asset-gen/bin/gen-style-covers.mjs:30`) call `buildPromptForStyle(style, STYLE_SUFFIXES)`
with two args — the third `defaultPrompt` parameter is dead. It adds an untested branch and misleads
readers into thinking the base prompt is configurable. Separately, `style: unknown` forces the
`typeof style === 'string'` guard on line 12 even though every real caller passes a string.

#### Proposed solution

Drop the `defaultPrompt` parameter and use `DEFAULT_PROMPT` directly inside the function. Narrow
`style` to `string | null | undefined` (the server passes a possibly-absent query param),
simplifying line 12 to `Object.hasOwn(suffixes, style ?? '')`. Also narrow `suffixes` to
`Record<string, string>` unchanged (or `Partial<Record<StyleName,string>>` if the union finding
lands).

#### Verification

`npm run check`; asset-gen tests (`npm run test:asset-gen`) and the generate-image server test still
pass with the two-arg calls.

---

### [P3][maintainability] The dial-mask radius `31` is duplicated across two files, coupled only by a comment

**File(s):** `web/src/lib/components/AiImageResult.svelte:52`;
`web/src/lib/components/AiConfetti.svelte:44-55` — pinned at SHA f934d43

#### Problem

The confetti's circular mask hole must stay aligned with the round dial. The horizontal radius `31%`
is hard-coded in AiConfetti's CSS (`ellipse 31% var(--confetti-ry, 41%)`, lines 44 and 51), while
AiImageResult computes the vertical radius as `31 * imgAspect` (line 52) to match it — the two `31`s
are the same physical quantity split across a component boundary and kept in sync only by prose
comments (AiImageResult:49-52, AiConfetti:34-37). The fallback `41%` on line 44/51 is yet another
copy of "31 × (4/3)". Change the dial size and three literals in two files must move together.

#### Proposed solution

Define the horizontal radius once — e.g. AiImageResult sets both `--confetti-rx` and `--confetti-ry`
CSS vars on `.ai-stage` from a single `DIAL_MASK_RX = 31` constant, and AiConfetti's gradient reads
`ellipse var(--confetti-rx) var(--confetti-ry)`. The default (`41%`) is then computed, not re-typed.

#### Verification

Run the app (`run-splotch` skill), open the AI result modal, confirm the confetti still masks
cleanly around the dial at 4:3 and at a tall portrait aspect; no visual regression.

---

### [P3][readability] Name the opaque progress-curve constants in AiDial's `loop`

**File(s):** `web/src/lib/components/AiDial.svelte:22-46` — pinned at SHA f934d43

#### Problem

`loop()` is dense with unexplained literals: `0.92 * fillCurve(...)`,
`0.92 + 0.06 * (1 - Math.exp(-over / 5000))`, `progress += (1 - progress) * 0.16`,
`progress >= 0.999`, and `fillCurve = t => 0.55 * t + 0.45 * (…)`. The reader can't tell that `0.92`
is "the ceiling the estimate phase creeps toward," `0.06` is "the extra headroom the overrun phase
adds (→0.98)," `5000` is the overrun time-constant in ms, and `0.16` is the reveal-ramp rate. This
is the mechanism most likely to be tuned and most likely to be broken by a stray edit.

#### Proposed solution

Introduce named constants at module top: `ESTIMATE_CEILING = 0.92`, `OVERRUN_HEADROOM = 0.06`,
`OVERRUN_TAU_MS = 5000`, `REVEAL_RATE = 0.16`, `REVEAL_EPSILON = 0.999`, and `LINEAR_MIX = 0.55`
inside `fillCurve`. If the AiDial-engine extraction (P2) lands, do this as part of that module.

#### Verification

`npm run check`; `web/tests/ai-timer.spec.ts` still passes (values unchanged, only named).

---

### [P3][duplication] The `isAiGenerationActive(runId)` ownership guard is threaded ad hoc through both functions

**File(s):** `web/src/lib/drawing/aiImage.ts:66-92,113,118,146-176` — pinned at SHA f934d43

#### Problem

The "am I still the current run?" check appears ~7 times: as `ownsRun()` guards in `autoSaveImages`
(lines 67, 81, 83) plus the signature-write guard reasoning (84-91), and as
`isAiGenerationActive(runId)` at lines 113, 146, 173, 176 in `generateAiImage`. Every state-mutating
helper (`setAiPreview`, `finishAiGeneration`, `failAiGeneration`) *also* re-checks ownership
internally in `ui.svelte.ts`. The concept is load-bearing (it's what makes the latest-request race
correct) but expressed inconsistently — a `boolean` predicate passed one place, an `id` re-checked
another — so a reader can't quickly confirm every early-return path is covered.

#### Proposed solution

Standardize on one shape. Since the state setters already guard by `id`, pass `runId` consistently
and give `autoSaveImages` the `runId` directly (`ownsRun = () => isAiGenerationActive(runId)`
becomes redundant). Document the invariant once ("only the owning run mutates UI or saves") at the
top of `generateAiImage` rather than re-deriving it in scattered comments (lines 84-91).

#### Verification

`aiImage.test.ts`'s ownership suite ("lets only the replacement run commit…", "never auto-saves a
stale run…") must stay green — it is the regression net for this exact logic.

---

### [P4][duplication] The gallery tag strings `'splotch-ai'` / `'splotch'` are duplicated across modules

**File(s):** `web/src/lib/drawing/aiImage.ts:80,85`;
`web/src/lib/components/AiImageResult.svelte:56` — pinned at SHA f934d43

#### Problem

`autoSaveImages` saves with the literal tags `'splotch-ai'` (line 80) and `'splotch'` (line 85), and
`AiImageResult.handleDownload` builds `splotch-ai-${timestamp()}.png` (line 56) with the same
`splotch-ai` prefix as a separate literal. `web/src/lib/drawing/screenshot.ts` also defaults
`baseName = 'splotch'`. The download filename and the auto-save tag are meant to match but are
independent strings; changing the brand prefix means hunting every literal.

#### Proposed solution

Export named constants (e.g. `AI_IMAGE_BASENAME = 'splotch-ai'` and `DRAWING_BASENAME = 'splotch'`)
from `screenshot.ts` and import them at both call sites.

#### Verification

`npm run check`; grep confirms `'splotch-ai'` is defined once; `aiImage.test.ts`'s tag assertions
(`tags.filter(t => t === 'splotch-ai')`) still pass.

---

### [P4][maintainability] Name the HTTP status magic numbers in `readAiImageResponse`

**File(s):** `web/src/lib/drawing/aiImageResponse.ts:19-20`; `web/src/lib/drawing/aiImage.ts:167` —
pinned at SHA f934d43

#### Problem

`if (response.status === 422) return { kind: 'safety' };` and `if (response.status === 429)` (lines
19-20) map bare status codes to domain meanings that are non-obvious — 422 meaning "Gemini safety
refusal" is a project convention shared with the server, not standard semantics. Likewise
`response.status >= 500 ? 'retry' : 'generic'` in aiImage.ts:167 encodes the transient-vs-permanent
rule as a magic `500`.

#### Proposed solution

Add named constants (`const SAFETY_REFUSAL_STATUS = 422; const THROTTLED_STATUS = 429;` in
aiImageResponse.ts, and `const FIRST_SERVER_ERROR_STATUS = 500;` where the retry decision is made).
This also makes the contract greppable against the server that produces these codes.

#### Verification

`aiImageResponse.test.ts` (which drives 200/422/429/502/503) stays green; `npm run check`.

---

### [P4][readability] Manual query-string concatenation for the generate-image endpoint

**File(s):** `web/src/lib/drawing/aiImage.ts:141-142` — pinned at SHA f934d43

#### Problem

```ts
const endpoint = apiUrl('/api/generate-image')
  + (style ? `?style=${encodeURIComponent(style)}` : '');
```

Hand-rolled `?key=` concatenation with a conditional and a manual `encodeURIComponent`. It works,
but it's the kind of string surgery that breaks the moment a second query param is added, and it
mixes "is there a style" branching into the URL literal.

#### Proposed solution

Build with `URLSearchParams`: `const params = style ?`?${new URLSearchParams({ style })}`: '';`.
Minor, but it removes the manual encoding and reads as intent.

#### Verification

`npm run check`; `aiImage.test.ts` upload tests still hit `/api/generate-image`.

---

### [P4][naming] Name the Gemini key prefix in `looksLikeApiKey`

**File(s):** `web/src/lib/aiCredential.ts:5-7` — pinned at SHA f934d43

#### Problem

```ts
export function looksLikeApiKey(value: string): boolean {
  return /^AIza/.test(value);
}
```

The `AIza` prefix is a meaningful, provider-specific magic string embedded in a regex. The comment
above explains it, but the literal itself is un-named and not greppable alongside other Gemini
constants.

#### Proposed solution

`const GEMINI_KEY_PREFIX = 'AIza';` and `value.startsWith(GEMINI_KEY_PREFIX)` (a `startsWith` also
reads clearer than an anchored regex for a literal prefix, and the existing test "false for a value
that merely contains AIza later on" still holds).

#### Verification

`aiCredential.test.ts`'s `looksLikeApiKey` cases all pass unchanged.

---

### [P4][readability] Extract the WebP-upload guard predicate in `encodeWebpUpload`

**File(s):** `web/src/lib/drawing/aiImage.ts:37-43` — pinned at SHA f934d43

#### Problem

The decisive line

```ts
return webp && webp.type === 'image/webp' && webp.size < png.size ? webp : null;
```

packs three distinct conditions (encoder produced something, it's actually WebP not a PNG fallback,
and it's genuinely smaller) into one ternary whose meaning is carried entirely by the preceding
comment. The `'image/webp'` MIME literal is also a magic string that recurs in the test.

#### Proposed solution

Name a local predicate:
`const isSmallerWebp = !!webp && webp.type === 'image/webp' && webp.size < png.size;` (with a
`const WEBP_MIME = 'image/webp'`), then `return isSmallerWebp ? webp : null;`. Self-documents the
three-part contract.

#### Verification

`aiImage.test.ts`'s upload-format suite ("uploads a WebP copy…", "falls back to the PNG…") stays
green.

---

### [P4][maintainability] `lastSavedDrawingSig` is unresettable module-global mutable state

**File(s):** `web/src/lib/drawing/aiImage.ts:52,84-91` — pinned at SHA f934d43

#### Problem

`let lastSavedDrawingSig: string | null = null;` is module-level mutable state that persists for the
life of the tab and across every call to `generateAiImage`. It has no reset path, so its behavior is
only observable through side effects and is impossible to unit-test in isolation (the existing test
"saves the child drawing once across re-rolls" relies on module load order via `vi.resetModules()`).
Hidden cross-call state in a module is a smell that makes the dedupe logic hard to reason about
independently.

#### Proposed solution

Move the dedupe into a tiny stateful helper —
`const drawingSaver = createDrawingDeduper(saveImageBlob)` exposing `save(blob): Promise<void>` — so
the signature lives in an object that a test can construct fresh. Keeps `autoSaveImages` declarative
and makes the "save once per unchanged drawing" rule directly testable.

#### Verification

New focused unit test constructs the deduper and asserts the second identical blob is skipped;
existing re-roll test still passes.

---

### [P4][readability] AiConfetti's deterministic-hash constants are wholly opaque

**File(s):** `web/src/lib/components/AiConfetti.svelte:2-20` — pinned at SHA f934d43

#### Problem

The confetti field is generated from a pile of unexplained literals: `length: 38`, the per-property
seeds `12.9, 57.3, 31.7, 45.1, 8.3, 77.7, 51.3, 27.1`, and the shaping constants (`2 + r*96`,
`-r*9`, `5.5 + r*4.5`, `(16 + r*24)`, `6 + r*6`, `r < 0.4`). The `Math.sin((i+1)*seed) * 10000`
fract-hash is a non-obvious idiom. The WHY comment (deterministic for SSR) is good, but the
constants themselves — count, ranges — are magic. This is decorative, hence low priority, but the
block is unreadable at a glance.

#### Proposed solution

Name the tunables: `const CONFETTI_COUNT = 38;`, and give the derived values ranges via small
helpers or named min/span pairs (`LEFT_MIN/LEFT_SPAN`, `DURATION_MIN/DURATION_SPAN`,
`ROUND_FRACTION = 0.4`). Optionally hoist the fract-hash to a named `hashUnit(i, seed)` local.

#### Verification

Visual: the confetti still animates identically (constants unchanged, only named). `npm run check`.

---

### [P4][readability] `AiImageResult` magic aspect/blur constants

**File(s):** `web/src/lib/components/AiImageResult.svelte:20,47` — pinned at SHA f934d43

#### Problem

`let imgAspect = $state(4 / 3);` (line 20) and `const previewBlur = $derived(`${2 + 16 * (1 -
progress)}px`);` (line 47) carry unexplained literals: `4/3` is the seed aspect, `2` is the min blur
(fully revealed), `16` is the extra blur at zero progress. The blur math in particular reads as
noise without knowing it maps `progress 0→1` to `18px→2px`.

#### Proposed solution

`const DEFAULT_ASPECT = 4 / 3;`, `const MIN_BLUR_PX = 2;`, `const MAX_EXTRA_BLUR_PX = 16;`, then
`${MIN_BLUR_PX + MAX_EXTRA_BLUR_PX * (1 - progress)}px`.

#### Verification

`npm run check`; visual check that the reveal still sharpens from blurred to crisp.

---

### [P4][maintainability] Style-thumbnail path is derived by inline string interpolation

**File(s):** `web/src/lib/components/AiImagePrompt.svelte:76`; cf. `web/src/lib/ai/styles.ts` —
pinned at SHA f934d43

#### Problem

`src="/styles/{s.toLowerCase()}.webp"` couples the on-disk asset path convention (lowercased style
name under `/styles/`, `.webp`) to a template literal in the markup. The same style set drives both
the picker order and these asset paths, but the path rule lives nowhere near `STYLE_SUFFIXES`. If a
style name gains a space or the asset dir moves, this breaks silently (broken thumbnail, no type
error).

#### Proposed solution

Add `export function styleThumbPath(style: StyleName): string` beside `STYLE_SUFFIXES` in styles.ts
(returning `/styles/${style.toLowerCase()}.webp`), and call it in the template. Centralizes the
convention and makes it greppable.

#### Verification

`npm run check`; run the app and confirm all eight style thumbnails still load.

---

### [P4][maintainability] AiDial's `ESTIMATE` is an unexplained 10 s with no link to the real deadline ladder

**File(s):** `web/src/lib/components/AiDial.svelte:13`; cf. `web/src/lib/ai/limits.ts` — pinned at
SHA f934d43

#### Problem

`const ESTIMATE = 10000;` is the dial's assumed generation time, but the module gives no rationale
and no connection to the actual server budget in `limits.ts` (`GENERATE_DEADLINE_MS = 24_000`,
`CLIENT_REQUEST_TIMEOUT_MS = 27_000`). A reader can't tell whether 10 s is a measured median, an
arbitrary feel-good number, or something that should track the deadline. The bare unit-less `10000`
also invites confusion with the ms constants next door.

#### Proposed solution

Rename to `ESTIMATE_MS`, add a one-line WHY comment (e.g. "typical successful generation ≈ 10 s; the
overrun phase covers the tail up to the 24 s server deadline"), and if it is meant to track anything
in `limits.ts`, import that rather than re-literal it.

#### Verification

`npm run check`; `ai-timer.spec.ts` unaffected.

---

### [P5][readability] Duplicated 6-line mask gradient in AiConfetti

**File(s):** `web/src/lib/components/AiConfetti.svelte:44-55` — pinned at SHA f934d43

#### Problem

`-webkit-mask-image` (lines 44-49) and `mask-image` (lines 50-55) are byte-identical six-line
`radial-gradient(...)` blocks. It's the standard vendor-prefix pattern, but the full gradient is
copy-pasted, so a tweak to the mask shape must be made twice and kept in sync by hand.

#### Proposed solution

Hoist the gradient into a CSS custom property on the element
(`--confetti-mask: radial-gradient(...)`) and set both
`-webkit-mask-image: var(--confetti-mask); mask-image: var(--confetti-mask);`. One source, both
prefixes.

#### Verification

Visual: confetti mask hole unchanged in WebKit and non-WebKit; `webkit-smoke` E2E path unaffected.

---

### [P5][type-safety] `AiImageResult` casts in event handlers

**File(s):** `web/src/lib/components/AiImageResult.svelte:42` — pinned at SHA f934d43

#### Problem

`const { naturalWidth: w, naturalHeight: h } = e.target as HTMLImageElement;` casts the event
target. It's safe here (the handler is only on an `<img onload>`), but the `as` bypasses the checker
and would silently mis-type if the handler were ever reused. Minor.

#### Proposed solution

Use `e.currentTarget` with a typed handler (`onload={(e) => handleImgLoad(e.currentTarget)}` where
`handleImgLoad(img: HTMLImageElement)`), removing the cast — `currentTarget` is correctly typed as
the element the listener is bound to.

#### Verification

`npm run check`; the stage still sizes to the loaded image's aspect (run the app, open a result).

---

### [P5][dead-code] `aiPreview` clamp/scale exports exist only for tests

**File(s):** `web/src/lib/components/aiPreview.ts:51-72` (`MIN_SCALE`, `MAX_SCALE`,
`IDENTITY_TRANSFORM`, `clampScale`, `clampTransform`, `Bounds`, `Transform`) — pinned at SHA f934d43

#### Problem

`clampScale`, `clampTransform`, `MIN_SCALE`, `MAX_SCALE`, and the `Bounds`/`Transform` types are
exported but have no non-test consumer (confirmed by grep across `web/src` excluding tests and the
module itself) — only `createPinchZoom` (same file) and `aiPreview.test.ts` use them. That's a
legitimate test seam, but the broad public surface makes it look like shared API and clutters the
module's exports.

#### Proposed solution

This is acceptable as a test seam, so the lightest fix is a one-line comment marking them "exported
for unit testing of the gesture math." If the P3 split lands and these move to `pinchZoomCore.ts`,
revisit whether `clampScale`/`clampTransform` need `export` at all or can be tested via
`createPinchZoom`'s public surface.

#### Verification

Grep confirms no runtime consumer; `aiPreview.test.ts` still imports them.

---

### [P5][maintainability] `VerifyResponse` and `VerifyCredentialResult` overlap without a shared shape

**File(s):** `web/src/lib/aiCredential.ts:11-18` — pinned at SHA f934d43

#### Problem

`VerifyResponse` (`{ ok?; error?; accessCode? }`, line 18) is the wire shape and
`VerifyCredentialResult` (lines 11-16) is the returned shape; they share `error`/`accessCode` fields
declared independently. Small, but the two can drift (e.g. server adds a field) and the
`.catch(() => ({}))` on line 37 means a parse failure yields an untyped `{}` widened to
`VerifyResponse`.

#### Proposed solution

Minor: keep both but derive the overlap
(`type VerifyPayload = { ok?: boolean; error?: string; accessCode?: string }` reused in
`VerifyResponse`), or inline `VerifyResponse` since it's used once. Not urgent.

#### Verification

`aiCredential.test.ts` (success, rejected, ok:false, abort passthrough) stays green;
`npm run check`.

---

That's 24 findings. Highest-value structural work: splitting `generateAiImage` (aiImage.ts:94-188),
extracting the AiDial progress engine into a testable module, introducing a `StyleName` union across
the stringly-typed style plumbing, and relocating the pinch-zoom engine out of
`components/aiPreview.ts`. The rest are named-constant/duplication/type cleanups. All scoped files
were read at SHA `f934d43`; line numbers verified against that revision.

## Source: Code audit — App state (Svelte 5 runes)

### [P1][consistency] Unify the exported `$state` object naming across state modules

**File(s):** `web/src/lib/state/canvas.svelte.ts:6`, `web/src/lib/state/strokeWidth.svelte.ts:26`,
`web/src/lib/state/tool.svelte.ts:54`, `web/src/lib/state/colors.svelte.ts:59`,
`web/src/lib/state/settings.svelte.ts:150`, `web/src/lib/state/ui.svelte.ts:42`,
`web/src/lib/state/layout.svelte.ts:29`, `web/src/lib/state/install.svelte.ts:37`,
`web/src/lib/state/network.svelte.ts:8`, `web/src/lib/state/fullscreen.svelte.ts:31` — pinned at SHA
f934d43

#### Problem

The primary `$state` export follows two different naming conventions with no rule a newcomer can
predict. Three modules use a `…State` suffix:

```ts
export const canvasState = $state({ … });   // canvas.svelte.ts:6
export const strokeState = $state({ … });    // strokeWidth.svelte.ts:26
export const toolState = $state({ … });      // tool.svelte.ts:54
```

Seven use the bare noun:

```ts
export const colors   = $state({ … });   // colors.svelte.ts:59
export const settings = $state({ … });    // settings.svelte.ts:150
export const ui       = $state({ … });    // ui.svelte.ts:42
export const layout   = $state({ … });    // layout.svelte.ts:29
export const install  = $state({ … });    // install.svelte.ts:37
export const network  = $state({ … });    // network.svelte.ts:8
export const fullscreen = $state({ … });  // fullscreen.svelte.ts:31
```

To import a store you must first remember (or grep) whether its module happens to append `State`.
This is pure friction and the single most visible inconsistency in the section.

#### Proposed solution

Pick one convention and apply it repo-wide. The bare-noun form is the majority (7 vs 3) and reads
more naturally at call sites (`settings.soundEnabled`, `colors.activeColor`), so rename
`canvasState → canvas`, `strokeState → stroke` (or `strokeWidth`), `toolState → tool`. Because
`tool.svelte.ts` already exports `BrushType`/`BRUSH_TYPES` and the filename is `tool`,
`toolState → tool` is clean. Do it as a mechanical rename across the ~10 consuming components; the
compiler flags every miss.

#### Verification

`npm run check` passes after the rename; `grep -rn "State = \$state" web/src/lib/state` returns
nothing; every consumer still resolves.

---

### [P1][consistency] Two contradictory store-lifecycle patterns (module-load self-init vs explicit `initX()`)

**File(s):** `web/src/lib/state/layout.svelte.ts:66-79`,
`web/src/lib/state/appearance.svelte.ts:22-41`, `web/src/lib/state/network.svelte.ts:12-34`,
`web/src/lib/state/fullscreen.svelte.ts:38-55`, `web/src/lib/state/install.svelte.ts:45-120` —
pinned at SHA f934d43

#### Problem

Listening/side-effecting stores wire themselves up in two mutually exclusive ways with no stated
rule for which to use:

* **Self-initializing at module load:** `layout.svelte.ts`
  (`if (browser) { syncViewport(); addEventListener(…) }`) and `appearance.svelte.ts` (a top-level
  `systemQuery?.addEventListener` plus an `$effect.root`).
* **Deferred behind an exported `initX()` that `+page.svelte` must remember to call:**
  `initNetwork()`, `initFullscreen()`, `initInstallPrompt()` — each guarded by a private
  `let initialized = false`.

`install.svelte.ts` does *both*: its `beforeinstallprompt`/`appinstalled` listeners run at module
load (lines 82-99) while its state seeding waits for `initInstallPrompt()` (line 103). A contributor
adding a new listening store has no way to know whether to self-init or export an init function, and
if they choose "init function" they must also remember to add a call in `+page.svelte:106-167` — an
unenforced coupling. Forgetting it fails silently (the store just never updates).

#### Proposed solution

Adopt one documented rule. Recommended: **self-init at module load, gated on `browser`** (what
`layout`/`appearance` already do), eliminating the `initX()` exports, the `initialized` flags, and
the five hand-maintained call sites in `+page.svelte`. Where an init must be deferred for a real
reason (e.g. `initInstallPrompt` runs only `!isNative()`), keep it but document the criterion in
`web/src/lib/state/` orientation (a nested `AGENTS.md`/CLAUDE.md note) so the split is a rule, not
folklore. Note `install`'s already-split model (listeners eager, seeding lazy) as the explicit
exception with its rationale.

#### Verification

After consolidating, `grep -rn "initialized = false" web/src/lib/state` shrinks to only the
documented exceptions; `+page.svelte` no longer needs `initNetwork`/`initFullscreen` calls; unit
tests for each store still pass (they can invoke the module in a `browser`-true happy-dom env).

---

### [P2][duplication] The `BOOL_SETTINGS` table pattern doesn't cover the non-boolean settings, defeating its own guarantee

**File(s):** `web/src/lib/state/settings.svelte.ts:60-101` (table), `:150-162` (init), `:197-212`
(setters), `:249-263` (reload) — pinned at SHA f934d43

#### Problem

The `BOOL_SETTINGS` table exists explicitly to make "forgetting the reloadSettings entry …
impossible" (comment, lines 57-59) by generating the `$state` init, setters, and `reloadSettings()`
from one source. But that guarantee only holds for booleans. The four non-boolean settings —
`soundVolume`, `actionButtonScale`, `aiAccessToken`, `theme` — are each hand-wired in **three**
separate places:

```ts
// init (150-162):
soundVolume: clampVolume(readInt(SOUND_VOLUME_KEY, SOUND_VOLUME_DEFAULT)),
actionButtonScale: clampButtonScale(readInt(ACTION_BUTTON_SCALE_KEY, …)),
// setters (197-207): setSoundVolume, setActionButtonScale …
// reload (256-261):
settings.soundVolume = clampVolume(readInt(SOUND_VOLUME_KEY, settings.soundVolume));
settings.actionButtonScale = clampButtonScale(readInt(ACTION_BUTTON_SCALE_KEY, …));
settings.aiAccessToken = readString(AI_ACCESS_TOKEN_KEY, settings.aiAccessToken);
settings.theme = readTheme(settings.theme);
```

`soundVolume` and `actionButtonScale` in particular have the identical shape `[key, default, clamp]`
and are exactly the class of setting the table was built to protect — yet they're the ones still
exposed to the forget-a-reload-line bug.

#### Proposed solution

Add an `INT_SETTINGS` table parallel to `BOOL_SETTINGS`, entries `[key, default, clamp]`:

```ts
const INT_SETTINGS = {
  soundVolume: [SOUND_VOLUME_KEY, SOUND_VOLUME_DEFAULT, clampVolume],
  actionButtonScale: [ACTION_BUTTON_SCALE_KEY, ACTION_BUTTON_SCALE_DEFAULT, clampButtonScale],
} satisfies Record<string, [string, number, (v: number) => number]>;
```

Generate the `$state` int fields, `makeIntSetter(prop)`, and the `reloadSettings` int loop from it,
exactly as the bool path does. `theme`/`aiAccessToken` have bespoke read/apply logic (`readTheme` +
`applyTheme`), so they can stay hand-written but should be called out as the deliberate special
cases.

#### Verification

`settings.svelte.test.ts` still passes; add a test asserting a round-trip (`setSoundVolume` →
`reloadSettings` after a durable restore) recovers the value. Confirm no int setting appears in more
than two locations (table + wrapper export).

---

### [P2][complexity] `settings.svelte.ts` is a god-module bundling four unrelated concerns

**File(s):** `web/src/lib/state/settings.svelte.ts:1-373` — pinned at SHA f934d43

#### Problem

At 373 lines this module mixes four concerns that share nothing but the word "settings":

1. The actual settings store + table (lines 45-207, 249-265).
2. A BYOK Gemini-key **secure-write concurrency queue** — `aiKeyWriteVersion`, `aiKeyWriteQueue`,
   `persistAiUserApiKey`, `setAiUserApiKey`, `hydrateApiKey` (lines 213-287), including the subtle
   "ordered writes so a stale save can't win" logic.
3. **Folder-save lazy-loading** — `folderSaveModule`, `loadFolderSave`, `tryLoadFolderSave`,
   `changeSaveFolder`, `forgetSaveFolder`, `hydrateSaveFolder` (lines 289-362), a self-contained
   dynamic-import memo with its own error handling.
4. URL token capture — `captureAiAccessTokenFromUrl` (364-372).

Concerns 2 and 3 are each ~65-75 lines of intricate, independently-testable logic that a reader
scanning for "where is the soundEnabled default" must scroll past. They also drag
`saveApiKey`/`secureStorage` and `folderSave` imports into the settings module's dependency surface.

#### Proposed solution

Extract two sibling modules under `web/src/lib/state/` (or `web/src/lib/`):

* `aiKey.svelte.ts` — owns `settings.aiUserApiKey` slice or exposes
  `setAiUserApiKey(v, ownsRequest)` + `hydrateApiKey()`; keeps the write-queue local.
* `saveFolder.svelte.ts` — owns `settings.saveFolderName` +
  `changeSaveFolder`/`forgetSaveFolder`/`hydrateSaveFolder` and the `loadFolderSave` memo.

Both can still write into the shared `settings` object (or hold their own `$state` slice).
`settings.svelte.ts` shrinks to the table-driven core + theme/token specials.

#### Verification

`settings.svelte.ts` drops below ~200 lines; `settings.svelte.test.ts` splits cleanly (the existing
`hydrateApiKey` describe block, tests 225-261, moves with the code); `npm run check` + `npm test`
green.

---

### [P2][duplication] `ui.svelte.ts` repeats four identical modal open/close pairs and mixes in the whole AI state machine

**File(s):** `web/src/lib/state/ui.svelte.ts:42-184` — pinned at SHA f934d43

#### Problem

Two smells in one module. First, four structurally identical modal pairs:

```ts
export function openColorPicker(origin) {
  ui.colorPickerOrigin = origin;
  ui.colorPickerOpen = true;
}
export function closeColorPicker() {
  ui.colorPickerOpen = false;
}
// …repeated verbatim for coloringBook, parentCenter, aiPrompt (lines 76-105)
```

Each modal contributes an `xOpen: boolean` + `xOrigin: Origin | null` field and an open/close pair —
pure boilerplate that grows linearly with every new modal.

Second, the module also embeds the entire **AI generation state machine** (lines 34-40 private
`activeAiGeneration`/`nextAiGenerationId`, plus `startAiGeneration`, `setAiPreview`,
`finishAiGeneration`, `failAiGeneration`, `endAiGeneration`, `closeAiResult`,
`isAiGenerationActive`, and `swapObjectUrl` object-URL lifecycle) — ~90 lines that have nothing to
do with modal visibility yet live in the same object as `clearTutorialVisible` and
`resizingActionButtons`.

#### Proposed solution

1. Factor a modal primitive:

```ts
// web/src/lib/state/modal.svelte.ts
export function createModal() {
  const s = $state({ open: false, origin: null as Origin | null });
  return {
    s,
    open: (o: Origin | null) => {
      s.origin = o;
      s.open = true;
    },
    close: () => (s.open = false),
  };
}
```

and build `colorPicker`, `coloringBook`, `parentCenter`, `aiPrompt` from it. 2. Move the
AI-generation machine (fields + the eight functions + `swapObjectUrl`) into
`web/src/lib/state/aiGeneration.svelte.ts`. `ui.svelte.ts` keeps only cross-cutting flags
(`resizingActionButtons`, `clearTutorialVisible`).

#### Verification

`ui.svelte.ts` loses the four duplicated pairs and the AI block; consumers of `ui.aiResultOpen` etc.
update to the new module; existing behavior verified via the AI-flow E2E and any unit coverage;
`npm run check` green.

---

### [P2][maintainability] `TRIM_ORDER` re-lists palette hex literals and silently rots when a swatch color changes

**File(s):** `web/src/lib/state/colors.svelte.ts:20-55` — pinned at SHA f934d43

#### Problem

`PALETTE_COLORS` (lines 20-31) defines each swatch's hex. `TRIM_ORDER` (lines 44-55) then re-types
those same hex strings by hand, in a different order, keyed only by comments:

```ts
export const TRIM_ORDER: string[] = [
  '#B5835A', // Brown  (bonus)
  '#4FC4C0', // Teal   (bonus)
  …
  '#62A2E9', // Blue
  '#AB71E1', // Purple
  BLACK_INK, // Black
];
```

If anyone re-tunes, say, Blue's hex in `PALETTE_COLORS`, `TRIM_ORDER` keeps the old literal and now
contains a string that matches no swatch — the trim logic silently drops or mis-orders a color with
no compile error and no test failure. `TRIM_ORDER` is `string[]`, so there's not even a type link
back to the palette.

#### Proposed solution

Make trim priority a property of the palette rather than a parallel list of magic hexes. Either add
a `trimPriority: number` (or `trimRank`) field to each `PaletteColor` and derive `TRIM_ORDER` by
sorting, or key `TRIM_ORDER` off `label`/a stable id that TypeScript can validate against
`PALETTE_COLORS`. At minimum, add a unit test asserting
`TRIM_ORDER.every(hex => PALETTE_COLORS.some(c => c.hex === hex))` and
`TRIM_ORDER.length === PALETTE_COLORS.length` so a drift fails CI.

#### Verification

The new test fails if you change a palette hex without updating trim; passes at current SHA.
`colors.svelte.test.ts` still green.

---

### [P3][architecture] `actionButtonLayout.svelte.ts` holds no state — it's geometry + a DOM-mutating writer misfiled under `state/`

**File(s):** `web/src/lib/state/actionButtonLayout.svelte.ts:1-145` — pinned at SHA f934d43

#### Problem

Every other file in `state/` owns a `$state` object. This one owns none: it's a bundle of (a)
CSS-mirroring layout constants (lines 16-56), (b) pure geometry functions reading *other* stores —
`visibleActionButtonCount`, `availablePerButton`, `maxActionButtonScale` (58-104), and (c)
`publishActionPanelState` (126-145), which **imperatively mutates the DOM** (`el.style.setProperty`,
`el.toggleAttribute`, `el.setAttribute`). A DOM side-effect writer and screen-geometry math sitting
in the shared-state directory is a category error: the file `.svelte.ts` extension implies runes
state, and a reader looking for "app state" finds neither. It reads from `settings`, `network`,
`layout`, `toolState` but is read-only against them.

#### Proposed solution

Move it out of `state/`. It's Actions-Panel layout logic: relocate to `web/src/lib/components/`
(co-located with `ActionsPanel.svelte`) or a new `web/src/lib/layout/actionButtonLayout.ts`. It has
no `$state`, so it doesn't need the `.svelte.ts` extension unless a consumer relies on rune tracking
of its reads (they read reactive stores, which stay reactive regardless of this file's extension —
verify the `$effect` caller in `ActionsPanel.svelte`). Update the `architecture` skill source map
accordingly.

#### Verification

`npm run check` + the `actionButtonLayout.fallback.test.ts` / `actionButtonLayout.svelte.test.ts`
suites pass after the move (adjust import paths); confirm `publishActionPanelState`'s `$effect` in
`ActionsPanel.svelte` still tracks `settings.*`/`toolState.brush` reads (it will — they're
reactive-source reads, not local state).

---

### [P3][consistency] "Which action buttons exist" is encoded in four places that must stay in lockstep

**File(s):** `web/src/lib/state/actionButtonLayout.svelte.ts:38` (`MAX_ACTION_BUTTON_COUNT`),
`:58-67` (`visibleActionButtonCount`), `:133-138` (`publishActionPanelState` `data-off-*`);
`web/src/lib/state/settings.svelte.ts:60-101` (`BOOL_SETTINGS` toggles) — pinned at SHA f934d43

#### Problem

The set of Actions-Panel buttons is enumerated independently in multiple spots that a reader must
manually reconcile:

* `MAX_ACTION_BUTTON_COUNT = 6` (a bare literal).
* `visibleActionButtonCount()` sums six hand-written conditionals (`strokeWidthControlEnabled`,
  `coloringBookEnabled`, `screenshotEnabled`, `aiAccessToken && aiImageEnabled && network.online`,
  `undoButtonEnabled`, brush).
* `publishActionPanelState` toggles a matching-but-separate list of `data-off-*` attributes
  (`data-off-stroke`, `data-off-coloring`, `data-off-screenshot`, `data-off-undo`, …).
* The underlying toggles live in `BOOL_SETTINGS`. Adding or removing a button means editing all four
  in agreement, with nothing but comments ("Every button the panel can show…") to enforce it.
  `MAX_ACTION_BUTTON_COUNT` in particular is a literal `6` that must equal the count of terms in
  `visibleActionButtonCount`.

#### Proposed solution

Define a single descriptor array — one entry per optional button with `{ settingKey, dataAttr }` —
and derive `MAX_ACTION_BUTTON_COUNT` (`= descriptors.length + 1` for the always-on brush), the
`visibleActionButtonCount` sum, and the `publishActionPanelState` `data-off-*` loop from it. That
collapses four edit sites to one and makes `MAX` self-maintaining.

#### Verification

Add a test asserting `visibleActionButtonCount()` with all toggles on equals
`MAX_ACTION_BUTTON_COUNT`; it should hold now and after any button add/remove. `npm test` green.

---

### [P3][duplication] The idempotent-init idiom (`let initialized`) is copy-pasted across three stores

**File(s):** `web/src/lib/state/fullscreen.svelte.ts:38,43-45`,
`web/src/lib/state/network.svelte.ts:12,14-16`, `web/src/lib/state/install.svelte.ts:46,103-105` —
pinned at SHA f934d43

#### Problem

Three modules repeat the same guard:

```ts
let initialized = false;
export function initX() {
  if (!browser || initialized) return;   // install adds || isNative()
  initialized = true;
  …
}
```

Same shape, same failure mode if a store forgets it. Small, but it's the kind of boilerplate that
invites a subtle divergence (e.g. `install` folds in `isNative()` — easy to miss which guard a given
store uses).

#### Proposed solution

If the P1 lifecycle-consolidation finding lands (self-init at module load), this idiom largely
disappears. Otherwise extract a tiny helper:

```ts
// web/src/lib/state/once.ts
export function once(fn: () => void): () => void {
  let done = false;
  return () => { if (!done) { done = true; fn(); } };
}
export const initNetwork = once(() => { if (!browser) return; … });
```

so the guard is written once and each store declares only its extra conditions.

#### Verification

`grep -rn "initialized = false" web/src/lib/state` returns nothing (or only documented exceptions);
each store's init test still asserts a second call is a no-op.

---

### [P3][consistency] No module uses `$derived`; every reactive-computed value is a getter function

**File(s):** `web/src/lib/state/appearance.svelte.ts:26-28` (`resolvedTheme`),
`web/src/lib/state/strokeWidth.svelte.ts:42-44` (`activeStrokeSize`),
`web/src/lib/state/actionButtonLayout.svelte.ts:58-104` (`visibleActionButtonCount`,
`maxActionButtonScale`) — pinned at SHA f934d43

#### Problem

Every derived value in the section is expressed as a plain function that recomputes on each call
rather than a `$derived`. `resolvedTheme()` re-runs
`resolveTheme(settings.theme, appearance.systemDark)` per call; `activeStrokeSize()` re-branches per
call; `visibleActionButtonCount()` re-sums per call. The section literally contains zero `$derived`
(verified: the only "derived" hit in `strokeWidth.svelte.ts:41` is inside a comment). This is a
legitimate convention choice — module-scope `$derived` has its own caveats — but it's undocumented,
so a newcomer can't tell whether reaching for `$derived` is encouraged, discouraged, or forbidden
here, and may inconsistently introduce one.

#### Proposed solution

Make the convention explicit. Either (a) document in the `state/` orientation that shared derived
values are exposed as getter functions (not module-level `$derived`) and why, so it's a rule; or (b)
convert the pure, dependency-only ones (`resolvedTheme`) to exported `$derived` and standardize.
Given the getter-function form is 100% consistent today, option (a) — codify it — is the lower-risk
fix. The key deliverable is a written rule so the next contributor doesn't guess.

#### Verification

The rule appears in `web/src/lib/state`'s CLAUDE.md/AGENTS.md source; a reviewer can cite it. No
behavior change if documenting.

---

### [P3][consistency] State-mutation ownership is inconsistent: some stores are setter-guarded, others are written directly by components

**File(s):** `web/src/lib/state/canvas.svelte.ts:6-19` (no setters) vs
`web/src/lib/state/settings.svelte.ts:164-212` (setter-only); writers at
`web/src/lib/components/DrawingCanvas.svelte:158,161,164,168` — pinned at SHA f934d43

#### Problem

`.claude/rules/svelte.md` says "Components read state and call setters; they never own shared
state." But `canvasState` exposes no setters and `DrawingCanvas.svelte` mutates it directly
(`canvasState.canUndo = …`, `canvasState.strokeCount++`, `canvasState.paperOrientation = …`), while
`settings` forbids direct writes and routes everything through `setX`. `colors` is a hybrid
(exported functions mutate, but the object is also directly writable). The result: to answer "who
can change `strokeCount`?" you must grep the whole `web/src`, whereas for `soundEnabled` the setter
is the single choke point. Grepability — a stated audit goal — is uneven across the section.

#### Proposed solution

Either (a) accept the engine-bridge exception explicitly: document that `canvas.svelte.ts` is a thin
imperative bridge whose only writer is the engine adoption in `DrawingCanvas.svelte`, and note that
in the module's header comment; or (b) give it setters (`markUndoState`, `markEmpty`,
`incrementStrokeCount`, `setPaperOrientation`) so mutation is greppable like the rest. Given
ADR-0004's imperative-bridge intent, (a) + a one-line "sole writer" note is likely enough, but the
inconsistency should be a deliberate, documented carve-out rather than silent.

#### Verification

Reader can locate every writer of any state field by grepping a setter name or by a documented "sole
writer" note. No functional change under option (a).

---

### [P3][naming] `customColor` default duplicates the Purple swatch hex as a magic literal

**File(s):** `web/src/lib/state/colors.svelte.ts:20-21,62` — pinned at SHA f934d43

#### Problem

```ts
export const PALETTE_COLORS = [{ hex: '#AB71E1', label: 'Purple' }, …];  // line 21
export const colors = $state({ …, customColor: '#AB71E1', … });          // line 62
```

`'#AB71E1'` is hand-copied as the custom-color seed. It also appears a third time in `TRIM_ORDER`
(line 53). Nothing links them, so the "custom color starts at the default swatch" intent is implicit
and drifts if Purple is re-tuned.

#### Proposed solution

Seed from the source of truth: `customColor: PALETTE_COLORS[0].hex`. (The comment at line 6 already
promises "Purple must stay at index 0 — it's the default selection," so this reads correctly.)

#### Verification

`grep -c "#AB71E1" web/src/lib/state/colors.svelte.ts` drops to 1 (the palette definition) plus the
`TRIM_ORDER` occurrence if that finding isn't also addressed; `colors.svelte.test.ts` green.

---

### [P4][duplication] `install.svelte.ts` repeats the oneTap→manual fallback three times

**File(s):** `web/src/lib/state/install.svelte.ts:129,141,149` — pinned at SHA f934d43

#### Problem

The same demotion appears three times across `promptInstall`:

```ts
if (install.mode === 'oneTap') install.mode = manualMode();  // 129 and 141
…
install.mode = manualMode();                                  // 149 (declined branch)
```

Lines 129 and 141 are byte-identical; 149 is the unconditional variant. The "a spent/stale one-tap
prompt drops to the manual hint" rule is scattered.

#### Proposed solution

Extract
`function fallBackToManualHint() { if (install.mode === 'oneTap') install.mode = manualMode(); }`
and call it at the two `'unavailable'` exits; keep the declined branch's unconditional
`manualMode()` (it also calls `dismissInstall()`), or route it through the same helper if the guard
is harmless there.

#### Verification

`install.svelte.test.ts` (the `promptInstall` describe block) passes unchanged; the literal
`if (install.mode === 'oneTap')` appears once.

---

### [P4][naming] Comments point to `storage.js`, but the file is `storage.ts`

**File(s):** `web/src/lib/state/strokeWidth.svelte.ts:32`,
`web/src/lib/state/settings.svelte.ts:248` — pinned at SHA f934d43

#### Problem

```ts
// storage layer recovers values evicted by the native WebView (see storage.js).   // strokeWidth:32
// hydrateDurableStorage in storage.js). A no-op visually when nothing changed.     // settings:248
```

There is no `storage.js` — the module is `web/src/lib/storage.ts` (and `tool.svelte.ts:97` correctly
says `storage.ts`). A reader following the reference greps for a file that doesn't exist. The repo
convention is TypeScript-only (`No plain .js source files in src/`), so `.js` here is stale.

#### Proposed solution

Replace `storage.js` → `storage.ts` in both comments.

#### Verification

`grep -rn "storage\.js" web/src/lib/state` returns nothing.

---

### [P4][type-safety] Stroke sizes are numerically typed (`number`) where a `1|2|3|4|5` union would prevent invalid levels

**File(s):** `web/src/lib/state/strokeWidth.svelte.ts:4,18-24,58-63` — pinned at SHA f934d43

#### Problem

`STROKE_SIZES = [1,2,3,4,5]` is `number[]`, `SIZE_TO_PX: Record<number, number>`, and every function
takes `size: number`. Nothing at the type level constrains a caller to a valid level, so
`getStrokeWidthPx(7)` type-checks and silently falls back
(`SIZE_TO_PX[size] ?? SIZE_TO_PX[DEFAULT_SIZE]`, line 59). The valid domain is a fixed five-value
set — ideal for a union.

#### Proposed solution

```ts
export type StrokeSize = 1 | 2 | 3 | 4 | 5;
export const STROKE_SIZES: readonly StrokeSize[] = [1, 2, 3, 4, 5];
const SIZE_TO_PX: Record<StrokeSize, number> = { 1: 2, 2: 4, 3: 8, 4: 14, 5: 22 };
```

Type `penSize`/`eraserSize`/params as `StrokeSize`. `readInt(..., STROKE_SIZES)` already validates
at the runtime boundary, so the cast lives only where values enter from storage.

#### Verification

`npm run check` passes; passing a literal outside 1-5 to `getStrokeWidthPx` becomes a compile error.
`strokeWidth.svelte.test.ts` green.

---

### [P4][complexity] `setAiUserApiKey`'s version+queue+ownership concurrency logic is dense and untestable in isolation

**File(s):** `web/src/lib/state/settings.svelte.ts:213-244` — pinned at SHA f934d43

#### Problem

`setAiUserApiKey` interleaves three concurrency guards — a monotonically increasing
`aiKeyWriteVersion`, a serializing `aiKeyWriteQueue`, and an `ownsRequest()` re-check that on loss
re-persists the *previous* value (lines 231-233) — inside a single 30-line closure. The correctness
argument ("an older save already in flight cannot finish after a replacement") is subtle and the
branch that restores `settings.aiUserApiKey` on lost ownership is easy to misread. It's buried in
the settings module (see the god-module finding), which makes it hard to unit-test the ordering
guarantees directly.

#### Proposed solution

When extracting the AI-key concern (see the settings god-module finding), lift this into a small
named unit — e.g. an `orderedSecretWriter` that takes
`(persist: (v) => Promise<void>, commit: (v) => void, ownsRequest)` — so the version/queue mechanism
is one testable primitive and `setAiUserApiKey` becomes a thin call. Add tests for the two race
outcomes (superseded write; ownership lost mid-flight).

#### Verification

New unit tests cover "second call supersedes an in-flight first" and "ownership lost → prior
credential restored"; existing `settings.svelte.test.ts` AI-key behavior unchanged.

---

### [P4][duplication] Three near-identical `reloadX` functions each re-derive their init lines

**File(s):** `web/src/lib/state/settings.svelte.ts:249-265`,
`web/src/lib/state/strokeWidth.svelte.ts:33-38`, `web/src/lib/state/tool.svelte.ts:98-103` — pinned
at SHA f934d43

#### Problem

Each persisted store hand-writes a `reloadX()` that re-reads the same keys the `$state` initializer
already read, then registers it via `onDurableRestore`. For `strokeWidth`:

```ts
// init:   penSize: readInt(PEN_SIZE_KEY, DEFAULT_SIZE, STROKE_SIZES)
// reload: strokeState.penSize = readInt(PEN_SIZE_KEY, strokeState.penSize, STROKE_SIZES)
```

The init expression and the reload expression are the same read with a different fallback —
duplicated per field, per store. The `onDurableRestore(reloadX)` registration is likewise
copy-pasted in each module.

#### Proposed solution

For table-driven stores (once `INT_SETTINGS` exists, per the earlier finding), generate
`reloadSettings` entirely from the tables so init and reload share one descriptor — eliminating the
hand-written reload lines. For `strokeWidth`/`tool`, a light `persisted(key, read, apply)` helper
that returns both the initial value and a reloader would collapse the init/reload duplication. At
minimum, note the init↔reload mirroring as a maintenance hazard the tables are meant to solve.

#### Verification

`storage.restore.integration.test.ts` and each store's reload test pass; a durable restore still
refreshes every field.

---

### [P4][readability] `navigator.onLine !== false` is a confusing double-negative

**File(s):** `web/src/lib/state/network.svelte.ts:18` — pinned at SHA f934d43

#### Problem

```ts
network.online = navigator.onLine !== false;
```

`navigator.onLine` is already a boolean; `!== false` treats a hypothetical `undefined` as online.
The intent ("assume online unless the browser says otherwise") is defensible but the expression
reads as an accidental double negative and invites a "why not just `navigator.onLine`?" review
comment every time.

#### Proposed solution

Either `network.online = navigator.onLine ?? true;` (explicit "default online when unknown") or, if
the defensiveness is unwanted, just `navigator.onLine`. Add a one-word comment if the `?? true`
intent (some old WebViews report `undefined`) is load-bearing.

#### Verification

`network`'s init behavior unchanged for the boolean cases; expression reads plainly.

---

### [P4][maintainability] Unnamed luminance threshold `0.15` in `isDarkInk`

**File(s):** `web/src/lib/state/colors.svelte.ts:100-102` — pinned at SHA f934d43

#### Problem

```ts
export function isDarkInk(hex: string): boolean {
  return relativeLuminance(hex) < 0.15;
}
```

`0.15` is a tuned perceptual cutoff (the point below which ink needs the light keyline against dark
cards) with no name — a reader can't tell it's deliberate vs arbitrary, and the sibling `isWhite`
uses a totally different mechanism (string compare), so the two "does this color vanish?" checks
look unrelated.

#### Proposed solution

Name it: `const DARK_INK_LUMINANCE_MAX = 0.15;` with a one-line WHY (mirrors the
`--dark-ink-keyline` trigger, per ADR-0052). Optionally note the intentional asymmetry with
`isWhite`.

#### Verification

`colors.svelte.test.ts` green; the constant is greppable and its rationale visible.

---

### [P5][naming] `isWhite` reimplements a white check instead of reusing `WHITE_INK`, and diverges from `isDarkInk`'s approach

**File(s):** `web/src/lib/state/colors.svelte.ts:91-94` (`isWhite`) vs `:18` (`WHITE_INK`),
`:100-102` (`isDarkInk`) — pinned at SHA f934d43

#### Problem

```ts
export const WHITE_INK = '#ffffff'; // line 18
export function isWhite(hex: string): boolean { // 91-94
  const v = hex.trim().toLowerCase();
  return v === '#ffffff' || v === '#fff' || v === 'white';
}
```

`isWhite` hardcodes `'#ffffff'` rather than referencing `WHITE_INK`, and its "vanishes against the
background" purpose is the light-mode mirror of `isDarkInk` — yet one is a hand-rolled string set
and the other a luminance test. The two conceptually-paired predicates share no implementation
strategy, so a reader can't infer one from the other.

#### Proposed solution

At minimum reference `WHITE_INK` in the comparison. Ideally, unify the pair conceptually: both
answer "does this color disappear against its surface?" — consider expressing `isWhite` via
`relativeLuminance(hex) > <threshold>` (named, symmetric with `DARK_INK_LUMINANCE_MAX`) so the two
are visibly a matched set, unless the multi-format string check (`#fff`/`white`) is genuinely needed
for picker inputs (document that if so).

#### Verification

`colors.svelte.test.ts` green; `WHITE_INK` is the single source for the white literal.

---

### [P5][naming] `install.mode: 'none'` is overloaded (already-installed vs unsupported)

**File(s):** `web/src/lib/state/install.svelte.ts:26-31,65-69` — pinned at SHA f934d43

#### Problem

`'none'` means both "already installed / native shell" and "unsupported browser with no manual path"
— two states a consumer might want to distinguish (e.g. show nothing vs. show a generic "not
available" note). The comment at lines 30 and 69 acknowledges the conflation. Today
`installDeviceOs()` partly compensates, but the mode alone is ambiguous.

#### Proposed solution

If no consumer needs the distinction, leave it but keep the documenting comment. If any does, split
into `'installed'` vs `'none'` (unsupported). Low priority — flag only so a future consumer doesn't
assume `'none'` is unambiguous.

#### Verification

Consumers of `install.mode` reviewed; if none branch on the two meanings, no change needed beyond
the note.

---

### [P5][readability] `SETTLED_IN_STROKES` is re-aliased by every consumer instead of used directly

**File(s):** `web/src/lib/state/canvas.svelte.ts:4`; consumers
`web/src/lib/components/InstallBanner.svelte:11` (`STROKES_BEFORE_PROMPT = SETTLED_IN_STROKES`),
`web/src/lib/pwa/updates.ts:42` (`STROKES_BEFORE_SW_REGISTER = SETTLED_IN_STROKES`) — pinned at SHA
f934d43

#### Problem

`canvas.svelte.ts` exports `SETTLED_IN_STROKES = 3` as a deliberately shared threshold, but both
consumers immediately re-alias it to a local constant (`STROKES_BEFORE_PROMPT`,
`STROKES_BEFORE_SW_REGISTER`). The aliasing obscures that the two features intentionally share one
signal (the whole point of the exported constant, per its comment) — a reader sees two
differently-named thresholds and has to trace both back to confirm they're the same number.

#### Proposed solution

Use `SETTLED_IN_STROKES` directly at each site (it's already descriptively named), or if a local
name aids readability, keep the alias but drop the indirection where the imported name reads fine on
its own. Minor; the finding is really that the shared-signal intent is diluted by renaming.

#### Verification

Behavior identical; `grep SETTLED_IN_STROKES` shows direct use at consumers. Tests unaffected.

---

That's 24 findings against the App-state section. Summary of the highest-leverage themes: (1) two
cross-cutting consistency debts — store naming (`…State` vs bare) and store lifecycle (self-init vs
`initX()`) — that every new state module inherits; (2) the `BOOL_SETTINGS` table's guarantee not
extending to int/string settings, which is the exact duplication it was built to kill; (3) three
modules over-scoped (`settings`, `ui`, and the misfiled `actionButtonLayout`); and (4)
`TRIM_ORDER`'s hand-copied palette hexes as the one silent-rot data hazard worth a guard test.

## Source: Code audit — Parent Center / settings

### [P1][duplication] Extract a shared segmented-control primitive — it now exists three times with drift

**File(s):** `web/src/lib/components/parent/AppearanceSection.svelte:32-47,92-138` ·
`web/src/lib/components/ParentCenter.svelte:222-238,443-490` ·
`web/src/lib/components/parent/ReportForm.svelte:112-125,233-267` (theme picker / orientation
selector / report-kind picker) — pinned at SHA f934d43

#### Problem

Three near-identical "iOS-style segmented control" implementations exist. The code comments admit
the copy-paste: ParentCenter's `.orient-seg` says *"matching the Theme picker in AppearanceSection"*
(`ParentCenter.svelte:440`) and ReportForm's `.report-kind` says *"mirrors the Appearance theme
picker"* (`ReportForm.svelte:232`). The design skill's own rule is *"Extract a new primitive at the
third duplicate"* — this is the third.

They have already drifted, which is exactly the failure the shared list is supposed to prevent:

* Container radius: `var(--radius-md)` (theme picker, `AppearanceSection.svelte:98`) vs raw `10px`
  (orient-seg, `ParentCenter.svelte:448`) vs `10px` (report-kind, `ReportForm.svelte:239`).
* Option radius: raw `9px` (`AppearanceSection.svelte:109`) vs `var(--radius-sm)`
  (`ParentCenter.svelte:460`) vs `7px` (`ReportForm.svelte:250`).
* Active treatment: raised card w/ `box-shadow: 0 1px 4px rgba(0,0,0,0.18)` (theme/orient) vs brand
  fill (report-kind).
* Font size: `var(--font-size-sm)` vs raw `12.5px` (`ParentCenter.svelte:464`).

#### Proposed solution

Add `web/src/lib/components/design/Segmented.svelte` (beside `Button.svelte`) taking
`options: {value,label,icon?,id?}[]`, `selected`, `onSelect`, and a `variant` (`raised` for
theme/orientation, `filled` for report-kind), plus an `allowDeselect` flag for the orientation case.
Style once from tokens (`--radius-md` container, `--radius-sm` option, `--shadow-sm` for the active
card). Replace all three call sites. Register it in the `design` skill's primitives table.

#### Verification

`grep -rn "segmented\|theme-option\|orient-opt\|report-kind-option"` shows only the new primitive's
internals. Visually diff `/dev/design` and each of the three sites in light+dark before/after; the
three should now be pixel-identical modulo variant.

---

### [P2][complexity] `ParentCenter.svelte` is 771 lines with four shells inlined — extract the compact quick-toggles shell

**File(s):** `web/src/lib/components/ParentCenter.svelte:60-86,183-249,405-533` (compact
landscape-phone shell) — pinned at SHA f934d43

#### Problem

This one component holds routing state, four distinct render branches (compact / wide sidebar /
phone hub / drilled section), and a self-contained sub-feature: the compact landscape-phone shell
with its own `LockedOrientation` type, `orientationOptions`, and `lockOrientation()` logic
(`:60-86`), ~65 lines of markup (`:183-249`), and ~130 lines of dedicated CSS (`.quick-toggles`,
`.orient-seg`, `.about-cell`, `.portrait-note`, `:405-533`). None of it is shared with the other
three shells. The `<style>` block alone is 446 lines.

#### Proposed solution

Extract `web/src/lib/components/parent/CompactShell.svelte` owning the orientation-selector state
and the quick-toggles grid, rendered by ParentCenter as
`{#if compact}<CompactShell />{:else if wide}…`. That removes the
`LockedOrientation`/`orientationOptions`/`lockOrientation` block and the
`orient-*`/`about-cell`/`portrait-note`/`quick-toggles` CSS from ParentCenter, leaving it to own
only shell selection and the section list. If the Segmented primitive (P1) lands, `orient-seg`
collapses into it.

#### Verification

`npm run check` clean; ParentCenter drops well under 500 lines. Manually rotate a phone-sized
viewport to confirm the compact shell still mounts and the orientation selector still toggles the
lock.

---

### [P2][duplication] Extract a shared status-message component (`report-message` / `byok-message` are the same block)

**File(s):** `web/src/lib/components/parent/ReportForm.svelte:193-206,439-455` ·
`web/src/lib/components/parent/AiKeyManager.svelte:235-245,470-486` — pinned at SHA f934d43

#### Problem

Both files render an identical inline status/alert region:

```svelte
<p class="X-message" class:error={status==='error'} class:success={status==='success'}
   role={status === 'error' ? 'alert' : 'status'} aria-live="polite">
```

and duplicate the same CSS (`.X-message` + `.X-message.success` → `--success-wash`/`--success-text`,
`.X-message.error` → `--danger-wash`/`--danger-text`). The a11y wiring (role swap by status,
`aria-live="polite"`) is subtle and easy to get subtly wrong on the next copy.

#### Proposed solution

Add `web/src/lib/components/parent/FormMessage.svelte` (or a `design/` primitive) taking
`status: 'idle'|'error'|'success'` and message text via a child snippet (ReportForm needs the
trailing "View your report ↗" link). Both sites render `<FormMessage {status}>…</FormMessage>`.

#### Verification

Trigger a failed and a successful submit in both ReportForm and AiKeyManager; confirm the alert
role/aria-live and the wash colors match in both themes. `grep -rn "message.success\|message.error"`
shows one definition.

---

### [P2][duplication] Extract a disclosure/`<details>` primitive — the chevron idiom is copied three times

**File(s):** `web/src/lib/components/parent/SetupInstructions.svelte:239-253` ·
`web/src/lib/components/parent/AiKeyManager.svelte:378-391` ·
`web/src/lib/components/parent/ReportForm.svelte:357-368` — pinned at SHA f934d43

#### Problem

Three components each hand-roll the same collapsible-`<details>` styling:
`summary { list-style: none }`, `summary::-webkit-details-marker { display: none }`, a
`::after { content: '›' }` chevron, and `[open] summary::after { transform: rotate(90deg) }`.
ReportForm's comment even points at the shared idiom: *"same chevron idiom as the BYOK how-to"*
(`ReportForm.svelte:339`). Any change to the disclosure affordance must be made in three places.

#### Proposed solution

Add `web/src/lib/components/design/Disclosure.svelte` wrapping `<details><summary>` with the chevron
and marker-reset baked in, exposing `summary` text/snippet and body via children. Replace the three
call sites (SetupInstructions' `.help-section`, AiKeyManager's `.byok-howto`, ReportForm's
`.report-device-details`), keeping only their body-specific styles.

#### Verification

`grep -rn "details-marker\|content: '›'" web/src` returns one hit (the primitive). Expand/collapse
each of the three sections and confirm the chevron rotates identically.

---

### [P2][type-safety] `SetupInstructions` passes OS around as bare `string`, losing the `'ios'|'android'` union

**File(s):** `web/src/lib/components/parent/SetupInstructions.svelte:47-58,91,112,136,166-202` —
pinned at SHA f934d43

#### Problem

`setupOsList` is a `$derived` that produces `string[]` (`:47-53`, elements are string literals with
no annotation), and every consumer is typed `os: string`: `lockTitle(os: string)` (`:55`) and the
snippets `installSteps(os: string)` (`:91`), `lockSteps` (`:112`), `exitSteps` (`:136`). The whole
file then branches on `os === 'ios'` string comparisons. A typo (`'IOS'`, `'andriod'`) compiles fine
and silently falls through to the Android branch, and there's no exhaustiveness guarantee.

#### Proposed solution

Introduce `type SetupOs = 'ios' | 'android'`, annotate `setupOsList` as `SetupOs[]` (the
`native ? [...] : [...]` arms already only ever produce those two literals), and change
`lockTitle`/the three snippets to `os: SetupOs`. `InstallDeviceOs` from `install.svelte` may already
be this union — reuse it if so.

#### Verification

`npm run check` passes; changing an `os === 'ios'` to `os === 'iOS'` now produces a type error.

---

### [P3][duplication] Single source of truth for `APP_VERSION` — it's redefined four times

**File(s):** `web/src/lib/components/parent/sections.ts:40` ·
`web/src/lib/components/parent/AboutSection.svelte:6` ·
`web/src/lib/components/ParentCenter.svelte:88` (also `web/src/lib/deviceInfo.ts:5`) — pinned at SHA
f934d43

#### Problem

The exact expression `typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'` is
copy-pasted in four modules. It's low-risk but pure duplication of a compile-time constant guard,
and it's not grep-discoverable as "the app version" — each site reinvents it.

#### Proposed solution

Export `export const APP_VERSION = …` once (e.g. `web/src/lib/appVersion.ts` or add it to
`sections.ts` which already defines it and is imported broadly), and import it everywhere. This
scope's three sites plus `deviceInfo.ts` then share one definition.

#### Verification

`grep -rn "__APP_VERSION__" web/src` returns a single occurrence (the shared module).
`npm run check` clean.

---

### [P3][duplication] The `.setting-group .setting + .setting { margin-top: 6px }` rule is copied into three sections

**File(s):** `web/src/lib/components/parent/AppearanceSection.svelte:75-77` ·
`web/src/lib/components/parent/SavingSection.svelte:65-67` ·
`web/src/lib/components/parent/ControlsSection.svelte:165-167` — pinned at SHA f934d43

#### Problem

The identical adjacent-sibling spacing rule appears verbatim in three section components.
ParentCenter already owns the shared `.setting-group`/`.setting` styling globally
(`ParentCenter.svelte:747-759`, with the comment *"keeps these rules in one place instead of copied
into each section component"*) — this rule contradicts that intent by living copied in the leaves.

#### Proposed solution

Move `.setting-group .setting + .setting { margin-top: var(--space-1) + 2 }` (6px → keep as-is or
promote to a token) into ParentCenter's `.parent-help-content :global(.setting)` block and delete
the three copies.

#### Verification

`grep -rn "setting + .setting" web/src` returns one hit. Sections with stacked `.setting` rows
(Appearance orientation toggles, Saving folder row, Controls) keep their 6px gap.

---

### [P3][duplication] `.slider-label` block duplicated between SoundSection and ControlsSection

**File(s):** `web/src/lib/components/parent/SoundSection.svelte:71-80` ·
`web/src/lib/components/parent/ControlsSection.svelte:177-186` — pinned at SHA f934d43

#### Problem

The `.slider-label` rule (flex, space-between, `gap:12px`, `margin-bottom:8px`, `--font-size-sm`,
`weight 600`, `--text-mid`) is byte-identical in both slider-bearing sections, and both also
duplicate the `.slider-setting` wrapper concept. A slider label + value + `<Slider>` is a recurring
unit.

#### Proposed solution

Extract `web/src/lib/components/parent/SliderRow.svelte` encapsulating the label row
(`<span>name</span><span>value</span>`), the `id`/`labelId` wiring, and the `<Slider>`. Sound and
Controls both render it (Controls needs an optional leading icon slot for "Button Size"). Removes
the duplicated `.slider-label` CSS and the shared `labelId` boilerplate.

#### Verification

`grep -rn "slider-label" web/src` shows one definition. Volume and Button-Size sliders still show
label+percentage and remain operable.

---

### [P3][design-tokens] Hardcoded active-segment shadow `0 1px 4px rgba(0,0,0,0.18)` — no token, duplicated

**File(s):** `web/src/lib/components/parent/AppearanceSection.svelte:131` ·
`web/src/lib/components/ParentCenter.svelte:483` — pinned at SHA f934d43

#### Problem

Both active segmented-control states use the raw literal
`box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);`. The design skill forbids raw shadow literals where a
token exists; `--shadow-sm` (`0 2px 6px rgba(0,0,0,0.12)`) is the intended elevation token. The
literal is also duplicated, so the two "identical" controls could drift.

#### Proposed solution

Either use `var(--shadow-sm)`, or if this specific tight lift is intentional and reused, mint one
elevation token in `tokens.ts` (`--shadow-segment` / reuse an existing step) and reference it. Folds
into the Segmented primitive (P1) if that lands.

#### Verification

`npm run lint:tokens` / `gen:tokens:check` clean; `grep -rn "rgba(0, 0, 0, 0.18)" web/src` returns
nothing.

---

### [P3][design-tokens] `slide={{ duration: 220 }}` magic number repeated across six sections

**File(s):** `web/src/lib/components/parent/AppearanceSection.svelte:61` · `SoundSection.svelte:45`
· `ControlsSection.svelte:109,129,151` · `AiKeyManager.svelte:260,270` (plus
`ReportForm.svelte:146,153` at 180/160) — pinned at SHA f934d43

#### Problem

The section reveal transition uses the bare literal `220` in eight places (and ReportForm uses
ad-hoc `180`/`160`). `220` is not a motion token (`--duration-fast/base/slow` = 150/200/350ms), so
the "standard section expand" timing is an unnamed magic number scattered across the tree; changing
it means editing eight call sites, and ReportForm has already diverged.

#### Proposed solution

Export a shared constant, e.g. `export const SECTION_SLIDE = { duration: 220 }` from `sections.ts`
(or add a `--duration-*` token if 220ms earns a name) and use `transition:slide={SECTION_SLIDE}`
everywhere. Decide deliberately whether ReportForm's 180/160 should join it.

#### Verification

`grep -rn "duration: 220" web/src/lib/components/parent` returns nothing; `npm run check` clean;
section reveals still animate.

---

### [P3][dead-code] `ToggleRow` exposes a `disabled` prop that no caller uses

**File(s):** `web/src/lib/components/parent/ToggleRow.svelte:16,19,123-132` — pinned at SHA f934d43

#### Problem

`ToggleRow`'s `Props` declares `disabled?: boolean` (`:16`), it's destructured (`:19`), wired into
the button, and carries ~10 lines of `:disabled` CSS (`:123-132`). No consumer ever passes it — a
`grep` for `disabled=` in `parent/` finds only ReportForm's submit button, SetupInstructions'
one-tap button, and AiKeyManager's save button, none of which are ToggleRow. It's untested dead
surface area.

#### Proposed solution

Either remove `disabled` (and its CSS) until a real need appears, or — if a disabled toggle is
genuinely coming — leave it but confirm with a call site. Given "don't gold-plate," removal is the
default.

#### Verification

After removal `npm run check` and `npm test` pass; `grep -rn "ToggleRow" web/src` shows no site
relying on `disabled`.

---

### [P3][accessibility] `ToggleRow` help text isn't associated with the switch (`aria-describedby` missing)

**File(s):** `web/src/lib/components/parent/ToggleRow.svelte:27-42` — pinned at SHA f934d43

#### Problem

When `help` is provided, it renders as a sibling `<p class="setting-help">` (`:40-42`) with no `id`,
and the `role="switch"` button (`:27-38`) has no `aria-describedby` pointing to it. A screen-reader
user focusing the switch hears the label but never the explanatory help (e.g. "Saves the current
drawing each time the page is cleared"). The component already threads a unique `id`, so wiring the
description is cheap. This is a maintainability smell too: the `help` prop looks fully supported but
is only half-wired.

#### Proposed solution

Give the help `<p>` `id="{id}-help"` and add `aria-describedby={help ? \`${id}-help\` : undefined}`
to the switch button.

#### Verification

Inspect a help-bearing toggle (e.g. `saveOnDeleteToggle`) in the a11y tree; the switch's accessible
description now includes the help text.

---

### [P3][maintainability] Magic `30px` indent hardcodes "icon width + gap" in two places

**File(s):** `web/src/lib/components/parent/ToggleRow.svelte:52` ·
`web/src/lib/components/parent/SoundSection.svelte:69` — pinned at SHA f934d43

#### Problem

`.setting-help { margin: 6px 0 0 30px }` and `.slider-setting { margin: 12px 0 2px 30px }` both use
`30px` to align sub-content under a toggle's label — a value that only equals icon width (`20px`,
`.setting-icon`) + gap (`10px`, `.setting-info`). If the icon size or gap changes, these silently
misalign, and the coupling is invisible. ControlsSection's `.slider-label-name` uses `gap:10px` for
the same alignment intent but doesn't indent, so the family is already inconsistent.

#### Proposed solution

Derive it from the same tokens/vars (e.g. `calc(20px + 10px)` with a comment, or a shared
`--toggle-indent` custom property set once), or better, have the extracted `SliderRow` (P3 above)
own the indent so it can't drift from the icon.

#### Verification

Change the icon size and confirm help/slider indent tracks it (or the comment/`calc` makes the
dependency explicit). Visual check that help lines still align under labels.

---

### [P4][design-tokens] Magic font sizes in `ParentCenter` headers/nav (24px, 20px, 15px, 12.5px)

**File(s):** `web/src/lib/components/ParentCenter.svelte:396,401,464,697` — pinned at SHA f934d43

#### Problem

Header `h2` is `font-size: 24px` (`:396`), sub-header `h2` is `20px` (`:401`), nav item is `15px`
(`:697`), and `.orient-opt` is `12.5px` (`:464`). None are type tokens (`--font-size-*` =
12/13/14/16/18/22/28); `24`/`20`/`15`/`12.5` are unnamed. The design skill bars raw px font sizes
where a token exists. `12.5px` in particular is a fractional magic number with no rationale.

#### Proposed solution

Map each to the nearest token (`--font-size-2xl` 22 or `-3xl` 28 for the header; `-lg` 16 for nav;
`-xs`/`-sm` for orient-opt), adjusting the value or, if 24px is genuinely needed, add a token. The
`12.5px` should become `--font-size-xs` or `-sm` once inside the Segmented primitive (P1).

#### Verification

`npm run lint:tokens`; visual check headers/nav in both shells.

---

### [P4][design-tokens] Sub-`--font-size-xs` magic sizes: WhatsNew `15px`, ReportForm `11px`

**File(s):** `web/src/lib/components/parent/WhatsNewSection.svelte:57` ·
`web/src/lib/components/parent/ReportForm.svelte:400` — pinned at SHA f934d43

#### Problem

`.whats-new-date { font-size: 15px }` sits between `--font-size-md` (14) and `--font-size-lg` (16)
with no token, and `.report-device-note { font-size: 11px }` is below the smallest token
(`--font-size-xs` = 12) — an off-ramp value with no name. Both are raw px where the type ramp is
meant to be authoritative.

#### Proposed solution

Snap `15px` to `--font-size-md` or `-lg`; snap `11px` to `--font-size-xs` (the device-note is
already the least-important text, so 12px is fine). If a sub-12 size is truly needed, that's a
signal to add a token with a WHY comment per the design skill.

#### Verification

`npm run lint:tokens`; the What's New date and device-info note still render at a sensible size in
both themes.

---

### [P4][duplication] The iOS-zoom input comment + `max(16px, var(--font-size-md))` is copy-pasted

**File(s):** `web/src/lib/components/parent/ReportForm.svelte:281-284` ·
`web/src/lib/components/parent/AiKeyManager.svelte:309-312` — pinned at SHA f934d43

#### Problem

Both text inputs carry the identical four-line comment (*"Never below 16px: iOS Safari / WKWebView
zoom … (ADR-0076)"*) followed by `font-size: max(16px, var(--font-size-md));`. This constraint
applies to every parent-center input; duplicating the rationale invites one copy drifting or a new
input forgetting it entirely.

#### Proposed solution

Promote to a token or shared class: e.g. `--input-font-size: max(16px, var(--font-size-md))` in
`tokens.ts` with the ADR-0076 note once, or a shared `.pc-text-input` class in ParentCenter's global
block. Both inputs reference it; future inputs inherit the safeguard.

#### Verification

`grep -rn "Never below 16px" web/src` collapses to one occurrence; focusing either input on iOS
still doesn't zoom the viewport.

---

### [P4][naming] `section.icon === 'splotchy'` magic-string special-case repeated

**File(s):** `web/src/lib/components/ParentCenter.svelte:264-268,292-296` — pinned at SHA f934d43

#### Problem

The nav and hub renderers each branch on the literal `section.icon === 'splotchy'` to swap in
`<SplotchyIcon>` because the brand mark isn't in the `Icon` name union. The magic string
`'splotchy'` is repeated, and `sections.ts:37` uses it as an `icon` value that isn't actually a real
`IconName` for `<Icon>` — a latent inconsistency (the type says `IconName`, but this value is only
valid for the special-case path).

#### Proposed solution

Introduce a small `SectionIcon.svelte` wrapper that renders `SplotchyIcon` for `'splotchy'` and
`<Icon>` otherwise, used by nav, hub, and (P-independently) AboutSection. Removes both branches and
centralizes the exception. Optionally widen `SectionMeta.icon` to `IconName | 'splotchy'` to make
the exception type-visible.

#### Verification

`grep -rn "'splotchy'" web/src` shows only the wrapper and the section list. Both shells still
render the Splotchy mark on the About row.

---

### [P4][complexity] `AiKeyManager` mixes credential verification, secure persistence, masking, feedback, and three feature toggles

**File(s):** `web/src/lib/components/parent/AiKeyManager.svelte:1-136` (script) — pinned at SHA
f934d43

#### Problem

One component owns: platform detection + storage-note copy (`:47-54`), key masking (`:39-45`), the
async verify→persist→feedback state machine with `latestRequest` guarding (`:71-123`), forget
handlers, *and* the three downstream feature toggles (`:247-282`). It's a lot of unrelated concerns
in a single 488-line file; the toggles at the bottom have nothing to do with credential handling and
only render when `!aiLocked`.

#### Proposed solution

Split the credential panel (`aiLocked`/`byok-active` markup + verify/forget logic) from the
feature-toggle group. Extract `AiFeatureToggles.svelte` (the `.ai-controls` block, `:247-282`)
rendered by `AiKeyManager` when unlocked. Optionally move `maskSecret` and `keyStorageNote` to a
small helper module so the component is presentation + orchestration only.

#### Verification

`npm run check`/`npm test` pass; entering a key, forgetting it, and toggling the three AI features
all still work.

---

### [P4][accessibility] Two identical segmented controls use inconsistent ARIA semantics (radiogroup vs group/pressed)

**File(s):** `web/src/lib/components/parent/AppearanceSection.svelte:32-45` (radiogroup/radio) ·
`web/src/lib/components/ParentCenter.svelte:223-237` (group + aria-pressed) — pinned at SHA f934d43

#### Problem

The theme picker exposes `role="radiogroup"` with `role="radio"` + `aria-checked` children, while
the visually-identical orientation selector uses `role="group"` with `aria-pressed` toggle buttons.
Both are single-select segmented controls (the report-kind picker is a *third* pattern, radiogroup
again). Screen-reader users get inconsistent announcements for the same idiom, and neither
radiogroup implements roving-tabindex/arrow-key navigation the role implies. This intersects
maintainability: whichever pattern the Segmented primitive (P1) standardizes on must be chosen
deliberately.

#### Proposed solution

Decide one semantic for the Segmented primitive: `radiogroup`/`radio` for mandatory single-select
(theme, report-kind) with arrow-key roving, and document that the orientation selector — which
*allows* deselecting to "free rotation" — legitimately differs (toggle buttons). Encode the choice
in the primitive's props (`mode: 'radio' | 'toggle'`).

#### Verification

Navigate each control with a screen reader + keyboard; announcements and arrow-key behavior are
consistent within each mode.

---

### [P4][maintainability] Hardcoded `'Courier New', monospace` font stack in two places

**File(s):** `web/src/lib/components/parent/AboutSection.svelte:156` ·
`web/src/lib/components/parent/AiKeyManager.svelte:455` — pinned at SHA f934d43

#### Problem

The version text (`.version-text`) and the masked/readonly key input
(`.access-code-input[readonly]`) both hardcode `font-family: 'Courier New', monospace`. There's no
monospace token, so the app's mono treatment is defined ad hoc in leaf components; a future third
use (or a brand mono choice) has nothing to reference.

#### Proposed solution

If a monospace face is a real design element, add `--font-mono` to `tokens.ts` and reference it in
both. If it's incidental, at minimum unify on the same string. Prefer the token given it's already
used twice for a semantic ("this is a raw code/version value").

#### Verification

`grep -rn "Courier New" web/src` is empty (token) or single-sourced; version text and masked key
still render monospaced.

---

### [P4][maintainability] `sectionSubtitle('ai')` re-derives AiKeyManager's credential-precedence logic

**File(s):** `web/src/lib/components/parent/sections.ts:64-67` ·
`web/src/lib/components/parent/AiKeyManager.svelte:32-34` — pinned at SHA f934d43

#### Problem

`sections.ts` decides the AI subtitle with
`if (settings.aiUserApiKey) … else if (settings.aiAccessToken) …` (key-over-code precedence), and
`AiKeyManager` independently derives `hasApiKey`/`hasAccessCode`/`aiLocked` from the same fields.
The precedence rule ("a BYOK key wins over an access code") now lives in two places; changing how
credentials resolve requires editing both, and they can silently disagree about what the hub says vs
what the panel shows.

#### Proposed solution

Add derived helpers to the settings state module (e.g.
`aiCredentialKind(): 'apiKey' | 'accessCode' | 'none'`) and have both the subtitle and AiKeyManager
read from it.

#### Verification

Set a key, then an access code; the hub subtitle and the AI panel agree on which credential is
active. `grep` shows the precedence logic in one module.

---

### [P5][naming] Magic `5` for the hidden admin unlock tap count

**File(s):** `web/src/lib/components/parent/AboutSection.svelte:24-29` — pinned at SHA f934d43

#### Problem

`handleVersionClick` compares `versionClicks < 5` with the threshold inlined. The number of taps
that reveals the admin link is a meaningful, testable constant buried as a literal; a test or a
future tweak has to hunt for it.

#### Proposed solution

`const ADMIN_UNLOCK_TAPS = 5;` at module top, used in the guard. Cheap self-documentation.

#### Verification

`grep -rn "ADMIN_UNLOCK_TAPS" web/src`; tapping the version 5× still reveals the admin link.

---

### [P5][readability] `.github-link` overrides shared spacing with `!important`

**File(s):** `web/src/lib/components/parent/AboutSection.svelte:110-112` — pinned at SHA f934d43

#### Problem

`.github-link { margin: 12px 0 !important; }` uses `!important` solely to beat the earlier
`.about-links p { margin: 0 0 8px 0 }` (`:94-96`). `!important` in scoped component CSS to override
a sibling rule in the *same* file is a specificity smell — the two rules fight instead of being
ordered/structured to cooperate.

#### Proposed solution

Reorder or restructure so the override is unnecessary: e.g. drop the blanket `.about-links p` bottom
margin and set per-child spacing, or target `.about-links > p.github-link` for higher specificity
without `!important`.

#### Verification

Remove `!important`; the GitHub link still has its 12px vertical spacing and the other footer links
keep their 8px. Visual check of the About footer.

---

### [P5][type-safety] `buttonChips` uses an inline structural type with stringly-typed ids

**File(s):** `web/src/lib/components/parent/ControlsSection.svelte:44-86` — pinned at SHA f934d43

#### Problem

The `buttonChips` array is declared with a large inline object type
(`{ id: string; label: string; icon: CommonIconName; checked: () => boolean; toggle: (next: boolean) => void }[]`).
The `id: string` is really a DOM/test id (`'strokeWidthToggle'`, etc.) with no constraint, and the
closure-per-chip `checked: () => boolean` pattern is a slightly unusual reactivity workaround worth
a named type so the intent is discoverable and reusable (the ControlsSection chip grid and any
future settings chip grid share the shape).

#### Proposed solution

Hoist a named
`interface SettingChip { id: string; label: string; icon: CommonIconName; checked: () => boolean; toggle: (next: boolean) => void }`
(near `sections.ts` or a local types file) and annotate the array. Improves grepability and makes a
future shared chip-grid extraction straightforward.

#### Verification

`npm run check` clean; the type is referenced by name and the chip grid still toggles each Actions
Panel button.

---

That's 25 findings. Notable cross-cutting theme: the `*Section.svelte` files repeatedly hand-roll
the same three UI idioms (segmented control, status message, disclosure `<details>`) and the same
spacing/motion literals — the highest-leverage fixes (P1–P2) are extracting those into
`lib/components/design/` primitives per the design skill's "third duplicate" rule, and splitting the
oversized `ParentCenter.svelte` (771 lines) and `AiKeyManager.svelte` (488 lines).

## Source: Code audit — Core UI controls

### [P1][duplication] BrushMenu and StrokeWidthMenu duplicate ~90% of their markup and style blocks — extract a shared flyout primitive

**File(s):** `web/src/lib/components/BrushMenu.svelte:27-171`,
`web/src/lib/components/StrokeWidthMenu.svelte:30-191` — pinned at SHA f934d43

#### Problem

The two flyout popovers are near-identical presentational components. Both render
`<div class="flyout-menu … " hidden={!open} style:color={…}>` wrapping an `{#each}` of
`.flyout-option` buttons that report a pick via `onpick`. Their `<style>` blocks are copy-paste: the
entire `.flyout-menu` rule
(position/left/bottom/flex/gap/padding/`--float-surface`/`border-radius:16px`/`--float-shadow-flyout`/`z-index:901`),
the two portrait media queries (`orientation: portrait` and
`(orientation: portrait) and (max-width: 540px)`), `.flyout-menu[hidden]`, and the full
`.flyout-option` rule (width/height `calc(60px * var(--action-btn-scale,1))`, `border-radius:14px`,
padding, transition list, `:hover`, `:active { transform: scale(0.92) }`, `.active`, and
`.active … fill: var(--brand)`) are byte-for-byte the same in both files. Any change to flyout
sizing, the 540px breakpoint, or the active-state ring has to be made twice and kept in sync by
hand.

#### Proposed solution

Extract a `FlyoutMenu.svelte` primitive in `lib/components/` that owns the `.flyout-menu` container,
the positioning/portrait CSS, the shared `.flyout-option` chrome (as a slotted/snippet-rendered
button or exposed via a `.flyout-option` global class in a shared stylesheet), and the
`open`/`onpick` contract. BrushMenu and StrokeWidthMenu keep only what differs: brush vs. size
iteration, the eraser-mode padding override (StrokeWidthMenu:111-119), and their icon rendering.
Alternatively, since the CSS is the bulk of the duplication, move the
`.flyout-menu`/`.flyout-option` rules into `app.css` (like `.corner-button`) and have both
components consume the classes.

#### Verification

Diff the two `<style>` blocks
(`diff <(sed -n '48,171p' BrushMenu.svelte) <(sed -n '59,191p' StrokeWidthMenu.svelte)`) to confirm
the overlap. After extraction, the shared rules exist once; visually verify both flyouts in
`/dev/design` and via `run-splotch` (portrait phone <540px, portrait tablet, landscape) plus the
existing E2E for brush/stroke selection.

---

### [P1][duplication] White/dark ink keyline CSS is triplicated across ActionsPanel, BrushMenu, and StrokeWidthMenu

**File(s):** `web/src/lib/components/ActionsPanel.svelte:772-787`,
`web/src/lib/components/BrushMenu.svelte:155-170`,
`web/src/lib/components/StrokeWidthMenu.svelte:175-190` — pinned at SHA f934d43

#### Problem

The same "ring the currentColor ink with a keyline so white/near-black reads on the buttons" trick
is written out three times, each with the same four declarations:

```css
stroke: #000;              /* white-stroke */  or  var(--dark-ink-keyline);  /* dark-stroke */
stroke-width: 2px;
paint-order: stroke;
vector-effect: non-scaling-stroke;
```

ActionsPanel targets `svg path[fill='currentColor']`, BrushMenu the same, StrokeWidthMenu widens to
`svg path` (single path). The identical comment paragraph explaining the `#000` one-off is pasted in
all three. Changing the keyline width, adding a token for the `#000`, or adjusting the selector
means editing three files that must not drift.

#### Proposed solution

Promote `.white-stroke`/`.dark-stroke` to shared global utility classes in `app.css` (they already
ride on the container element in each case), keyed off
`:where(.white-stroke) svg path[fill='currentColor']` and a dark mirror. Each component keeps only
the class toggle. Fold StrokeWidthMenu's `svg path` variant in by making the selector match both
(`path[fill='currentColor'], svg:has(path):not(:has(path[fill='currentColor'])) path` is overkill —
simpler: tag the single-path icon so `[fill='currentColor']` applies there too, then one selector
covers all three).

#### Verification

Grep `paint-order: stroke` across the components — should collapse to one definition. Select white
ink and near-black ink (dark theme) with each of brush trigger, brush menu, stroke trigger, stroke
menu open, and confirm the keyline still renders in `run-splotch`.

---

### [P1][complexity] ActionsPanel.svelte is 788 lines carrying five unrelated responsibilities

**File(s):** `web/src/lib/components/ActionsPanel.svelte:1-788` (whole file) — pinned at SHA f934d43

#### Problem

This single component owns: (a) the button-size/offset layout math (`leftOffset`, `buttonCount`,
`buttonSpread`, `buttonSize`, lines 59-104), (b) the persisted-state publish effect (123-125), (c)
the ink-keyline flag derivations `inkWhite`/`inkDark`/`whiteStroke`/`darkStroke` (131-150), (d)
flyout open/close + outside-click coordination (40, 159-180, 212-232), (e) the undo end-of-history
nudge state machine (186-195), and (f) the save/AI/coloring-book tap handlers with lazy imports
(202-248). The script alone is 248 lines before a 396-line `<style>`. The layout math is already
partly delegated to `actionButtonLayout.svelte.ts`, but the derived-CSS-string assembly still lives
inline with heavy prose comments, making the reactive surface hard to hold in one's head.

#### Proposed solution

Move the pure layout-string derivations (`leftOffset`, `buttonSpread`, `buttonSize`) into
`actionButtonLayout.svelte.ts` as functions taking `{isPortrait, layout, buttonCount, browser}` so
ActionsPanel just binds their results. Extract the flyout outside-click + open-state coordination
into a small Svelte action or `useFlyout` rune module in `lib/actions/` (the svelte.md rule already
says "dialog wiring are Svelte actions"). Consider lifting the undo-nudge to a tiny
`UndoButton.svelte`. Target: the component becomes markup + thin bindings.

#### Verification

`wc -l` drops substantially; the extracted math is unit-testable in isolation (add cases to the
existing `actionButtonLayout` tests). Full E2E for drawer/flyout/undo must stay green; `run-splotch`
sanity in both orientations.

---

### [P1][design-tokens] ClearButton hardcodes an entire red/coral palette that exists in no token

**File(s):**
`web/src/lib/components/ClearButton.svelte:184,187,209,232,234,254-255,276,389-390,404-405,472,494,518,520`
— pinned at SHA f934d43

#### Problem

The clear button and its accept-zone/coachmark introduce a full color system inline with zero
tokens: `linear-gradient(135deg, #ff6b6b, #ee5a6f)` (button, 184; coachmark button, 404),
`linear-gradient(135deg, #ff3838, #d63031)` (delete-ready, 232), and a dozen `rgba(255, 56, 56, …)`
"alarm red" values (accept-zone border/gradient/threshold, 254-255, 276) alongside
`rgba(255, 107, 107, …)` "friendly coral" (coachmark ring, 389-390) and `rgba(238, 90, 111, …)`
(coachmark ready state, 494, 520). Comments even distinguish the semantics ("the friendlier coral,
not the alarm-red of the live threshold", 384) — two named color roles that never became tokens.
`tokens.css` has only muted `--danger-*` (#b04a4a), nothing vivid. This is the largest concentration
of untokenized color in the scoped files, and the same shades repeat across button, ghost, ring, and
reduced-motion fallbacks.

#### Proposed solution

Add `--clear-red`, `--clear-red-deep` (delete-ready), and `--clear-coral` (+ their alpha-derived
washes via `color-mix`) to `lib/design/tokens.ts`, regenerate `tokens.css`, and replace the
literals. Keep a light-value fallback comment where a pre-`color-mix` fallback is genuinely needed
(the app already does this pattern for `--paper`). This also fixes the button/coachmark drift risk
in the next finding.

#### Verification

Grep `#ff6b6b|#ee5a6f|255, 56, 56|255, 107, 107|238, 90, 111` in ClearButton — should reach zero.
Visual check of rest / dragging / delete-ready / accept-zone / coachmark states via `run-splotch`,
light and dark.

---

### [P2][complexity] The coachmark tutorial should be its own component, not 180 lines inside ClearButton

**File(s):** `web/src/lib/components/ClearButton.svelte:18-99,148-162,359-522` — pinned at SHA
f934d43

#### Problem

ClearButton (540 lines) mixes the actual clear control (button + `dragToClear` wiring, 102-146) with
a self-contained animated tutorial: state (`tutorialVisible`, `tutorialFadeOut`,
`tutorialDismissTimer`, 18-23), imperative geometry positioning of ghost/ring in viewport coords
(`showTutorial`, 29-68), dismiss/reset lifecycle (70-99), its markup (148-162), and ~160 lines of
coachmark CSS + two big keyframe blocks (359-522). None of it is needed to render or operate the
clear button; it's only shown when `dragToClear` calls `onTutorialShow`. The two concerns share
nothing but the button's bounding rect.

#### Proposed solution

Extract `ClearCoachmark.svelte` taking the anchor rect (or the button element) and an imperative
`show()/dismiss()` handle, owning its own state, timer, positioning, and CSS. ClearButton renders
`<ClearCoachmark bind:this={coachmark}/>` and forwards
`onTutorialShow`/`onTutorialDismiss`/orientation-reset to it. This also isolates the
`getAcceptRadius` duplication (next finding) to one place.

#### Verification

ClearButton drops ~250 lines. The tutorial still fires on first-run drag-to-clear and dismisses
after 6s / on orientation change (existing behavior). `run-splotch` first-run flow.

---

### [P2][duplication] Accept-radius factor 0.4 is duplicated as a magic literal instead of importing the named constant

**File(s):** `web/src/lib/components/ClearButton.svelte:26` — pinned at SHA f934d43

#### Problem

`getAcceptRadius()` computes `Math.min(window.innerWidth, window.innerHeight) * 0.4` to size the
coachmark ring so it matches the real accept zone. But `dragToClear.ts:6` already defines
`const ACCEPT_RADIUS_FACTOR = 0.4;` and uses it (`dragToClear.ts:51`) for the *actual* threshold.
The magic `0.4` is copied into the component. If the real threshold factor changes, the coachmark
ring silently misrepresents where the user must drag — a correctness bug hidden as a duplicated
literal.

#### Proposed solution

Export `ACCEPT_RADIUS_FACTOR` (and ideally the whole `getAcceptRadius` computation) from
`dragToClear.ts` and import it in ClearButton (or the extracted ClearCoachmark). One source of truth
for the threshold geometry.

#### Verification

Grep `0.4` / `ACCEPT_RADIUS_FACTOR` — the factor lives in one module. Change the exported constant
and confirm both the live accept zone and the coachmark ring move together.

---

### [P2][maintainability] z-index values are magic numbers scattered across components with no shared scale

**File(s):** `web/src/lib/components/ClearButton.svelte:169,252,289,338,365`, `NotchBand.svelte:75`,
`InstallBanner.svelte:153`, `ActionsPanel.svelte:400`, `BrushMenu.svelte:67`,
`StrokeWidthMenu.svelte:78`, `FullscreenToggle.svelte:33` — pinned at SHA f934d43

#### Problem

Stacking order is coordinated entirely by hand-written literals and prose: ClearButton uses
1000/999/500/400/1001, NotchBand 1000 (collides with ClearButton's container at the same 1000),
InstallBanner 950 with a comment reciting "actions toggle 901, Parent Help 900",
ActionsPanel/BrushMenu/StrokeWidthMenu 901, FullscreenToggle 4. The relationships live only in
comments ("Below clear-container (1000)", "Above the real button (1000)"). There is no z-index token
scale in `tokens.css`. A new overlay author has to grep every component and read comments to find a
safe layer, and the NotchBand/ClearButton 1000 tie is exactly the kind of accidental collision this
invites.

#### Proposed solution

Add a named z-index scale to `lib/design/tokens.ts` (e.g. `--z-canvas-chrome`, `--z-panel`,
`--z-flyout`, `--z-banner`, `--z-clear-button`, `--z-clear-coachmark`, `--z-notch`, `--z-ripple`)
with documented ordering, regenerate `tokens.css`, and replace the literals. The ordering becomes
reviewable in one place.

#### Verification

Grep `z-index:` across `lib/components` — values reference tokens, not integers. Confirm layering
unchanged in `run-splotch` (open a flyout over the banner, drag-to-clear with notch band present).

---

### [P2][design-tokens] InstallBanner uses off-scale font sizes, radius, and an ad-hoc shadow

**File(s):** `web/src/lib/components/InstallBanner.svelte:160,241,257,259,160` — pinned at SHA
f934d43

#### Problem

`.install-copy strong` and `.install-cta` set `font-size: 15px` (241, 259) — 15 is not on the type
scale (`--font-size-md:14`, `--font-size-lg:16`). `.install-cta` uses `border-radius: 14px` (257),
off the radius scale (`--radius-md:12`, `--radius-lg:16`). `.install-banner` uses
`box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18)` (160), a one-off instead of
`--shadow-pop`/`--shadow-sm`. Mixed in are legitimate token usages, which makes the off-scale values
look intentional when they're likely drift.

#### Proposed solution

Round the 15px to `--font-size-lg` (16) or add a token if 15 is deliberate; use `--radius-lg` for
the CTA; replace the banner shadow with a token (or add `--shadow-banner`). Same for the `120`px fly
distance if a motion token is warranted.

#### Verification

Grep `15px|14px|rgba(0, 0, 0, 0.18)` in the file → resolved. Compare banner rendering before/after
in `run-splotch`.

---

### [P2][type-safety] StrokeWidthMenu casts a template-string icon name to CommonIconName, defeating the generated union

**File(s):** `web/src/lib/components/StrokeWidthMenu.svelte:52-54` — pinned at SHA f934d43

#### Problem

```svelte
<Icon name={`${erasing ? 'eraser-size' : 'size'}-${size}` as CommonIconName} class="action-icon" />
```

The whole point of the generated `name` union (svelte.md:23-26) is that a missing or misnamed icon
is a compile error. The `as CommonIconName` cast erases that guarantee: if `size-6` or
`eraser-size-2` is added to `STROKE_SIZES` without a matching icon, `npm run check` stays green and
the icon silently fails to paint at runtime.

#### Proposed solution

Derive the names through a typed lookup instead of a cast — e.g. a
`const SIZE_ICON: Record<number, CommonIconName>` (or two maps for pen/eraser) built once, so a
missing entry is a type error, or a helper `strokeIcon(size, erasing): CommonIconName` with an
exhaustive mapping. Keep `STROKE_SIZES` and the map co-located in `strokeWidth.svelte.ts`.

#### Verification

Remove one icon from `lib/icons/` and rerun `gen:icons` + `npm run check`: with the map, the build
fails; with the cast, it passes. Confirm all sizes still render.

---

### [P3][duplication] Coachmark ghost button re-hardcodes the real button's gradient and shadow

**File(s):** `web/src/lib/components/ClearButton.svelte:184,187` vs `404-405` — pinned at SHA
f934d43

#### Problem

`.coachmark-button` (404-405) repeats `.clear-button`'s `linear-gradient(135deg, #ff6b6b, #ee5a6f)`
and a near-identical `box-shadow`, so the tutorial's ghost stays a faithful mimic of the real
control. But the coupling is by copy: restyle the real button and the ghost silently diverges from
what it's supposed to teach. (Compounds the P1 clear-palette finding.)

#### Proposed solution

Once the clear reds are tokens, both rules reference the same token, so they can't drift.
Alternatively share a `.clear-face` class between the real button and the ghost.

#### Verification

Change the button gradient token and confirm the coachmark ghost updates with it.

---

### [P3][maintainability] Cross-component coupling via the magic string id 'parentHelpButton'

**File(s):** `web/src/lib/components/InstallBanner.svelte:54` — pinned at SHA f934d43

#### Problem

`bannerExit` does `document.getElementById('parentHelpButton')` to fly the banner into a button
owned by a *different* component (`ParentHelpButton.svelte:15`). The linkage is an untyped string
with no compile-time or grep-time guarantee: rename or remove that id and the banner exit silently
falls back to `dy = 120` (57) with no error. This id-string coupling pattern also appears with
`#brushButton`/`#coloringBookButton`/etc. used for CSS in ActionsPanel, but the cross-component
runtime lookup here is the fragile one.

#### Proposed solution

Export the id as a shared constant (e.g. `PARENT_HELP_BUTTON_ID` from a `lib/domIds.ts` or from
`ui.svelte`) consumed by both the button and the banner, or publish the button's rect through the
existing `ui`/`layout` state so the banner reads state instead of the DOM. At minimum, centralize
the id string.

#### Verification

Grep `parentHelpButton` — both producer and consumer reference one constant. Trigger the auto-clear
exit and confirm the banner still homes on the button.

---

### [P3][type-safety] SplotchyIcon's open-ended prop bag spreads arbitrary attributes with an `unknown` index signature

**File(s):** `web/src/lib/components/SplotchyIcon.svelte:2-9` — pinned at SHA f934d43

#### Problem

```ts
interface Props {
  class?: string;
  [key: string]: unknown;
}
let { class: className = '', ...rest }: Props = $props();
```

`...rest` is spread onto the `<span>` with a fully permissive `[key: string]: unknown`, so any
typo'd or invalid attribute passes typechecking and lands on the DOM node. Callers pass
`aria-hidden`, but nothing constrains the surface. Compared with the strongly-typed `Props` in
Slider/Breadcrumb/ErrorScreen, this is the odd one out.

#### Proposed solution

Type `rest` as `SvelteHTMLElements['span']` (or `HTMLAttributes<HTMLSpanElement>`) instead of
`[key: string]: unknown`, giving real attribute checking on the spread.

#### Verification

Add a bogus attribute to a `<SplotchyIcon>` usage and confirm `npm run check` flags it after the
change; existing usages still compile.

---

### [P3][dead-code] ActionsPanel portrait rule re-declares identical left/bottom values

**File(s):** `web/src/lib/components/ActionsPanel.svelte:394-409` — pinned at SHA f934d43

#### Problem

The base `.actions-panel` sets `left: calc(8px + env(safe-area-inset-left))` (396) and
`bottom: calc(8px + env(safe-area-inset-bottom))` (395). The portrait override (403-409) sets
`flex-direction: column-reverse` (the only real change) but then re-declares `left` and `bottom`
with the exact same `calc(...)` values (406-407). Those two lines are inert — noise that suggests a
portrait-specific offset exists when it doesn't.

#### Proposed solution

Drop the redundant `left`/`bottom` from the portrait block; keep only `flex-direction`.

#### Verification

Visually unchanged in portrait (`run-splotch` portrait). Removing the two lines produces no
computed-style diff.

---

### [P3][dead-code] Flyout portrait media query re-sets flex-direction to its base value

**File(s):** `web/src/lib/components/BrushMenu.svelte:70-76`,
`web/src/lib/components/StrokeWidthMenu.svelte:81-87` — pinned at SHA f934d43

#### Problem

The base `.flyout-menu` is `flex-direction: row` (58/66). The `@media (orientation: portrait)` block
changes `left`/`bottom` but also writes `flex-direction: row` again (75/86) — a no-op that's
immediately overridden anyway by the `max-width: 540px` block's `column`. It reads as though
portrait deliberately re-affirms row, obscuring that the meaningful axis switch is the 540px
breakpoint.

#### Proposed solution

Remove `flex-direction: row` from the plain portrait block in both files (it's redundant with the
base). Same fix lands once if these merge into the shared flyout primitive (P1).

#### Verification

No computed-style change at any width; confirm flyout still stacks column only below 540px portrait.

---

### [P3][accessibility] Clearing the canvas is pointer-only — no keyboard or AT path

**File(s):** `web/src/lib/components/ClearButton.svelte:103-137` — pinned at SHA f934d43

#### Problem

`#clearButton` has `aria-label="Clear drawing"` and is a real `<button>`, so keyboard and
screen-reader users can focus and activate it — but the only behavior is wired through
`use:dragToClear` (a pointer-gesture action). There is no `onclick`/keyboard handler, so pressing
Enter/Space on the focused button does nothing; the clear action is unreachable without a pointer
drag. The `aria-label` advertises an action the control can't actually perform for those users.

#### Proposed solution

Add a keyboard/click affordance that triggers the same `onClear` path (with a confirm or the
existing threshold semantics) when activated without a drag — e.g. `dragToClear` reports a plain
activation, or a fallback `onclick` that runs the clear when `matchMedia('(pointer: coarse)')` isn't
the sole modality. At minimum, don't label a drag-only surface as an actionable button.

#### Verification

Tab to the clear button, press Enter, confirm the canvas clears (or that a documented alternative
exists). Axe/keyboard pass.

---

### [P3][design-tokens] NotchBand hardcodes a 250ms transition off the duration scale

**File(s):** `web/src/lib/components/NotchBand.svelte:77` — pinned at SHA f934d43

#### Problem

`transition: background-color 250ms ease;` — 250ms isn't a token (`--duration-base:0.2s`,
`--duration-slow:0.35s`). A one-off duration in an otherwise token-driven codebase.

#### Proposed solution

Use `--duration-slow` (or add the value to the motion scale if 250ms is deliberate).

#### Verification

Grep `250ms` → gone; band color transition still smooth on theme/tool change.

---

### [P3][duplication] NotchBand runs two near-identical status-bar effects that each re-import the plugin

**File(s):** `web/src/lib/components/NotchBand.svelte:40-58` — pinned at SHA f934d43

#### Problem

Two separate `$effect`s both guard on `__IS_CAPACITOR__ && isNative()` and both
`import('@capacitor/status-bar').then(...)` — one to set `Style`, one to `hide()/show()`. The import
boilerplate and the platform guard are duplicated, and the two effects fire independently on the
same `band` recompute. It's more code to read and two places to keep the guard correct.

#### Proposed solution

Merge into one `$effect` that reads `band.statusBarStyle` and `band.statusBarHidden`, imports the
plugin once, and applies both. (Keep them split only if the dependency granularity is deliberately
different — it isn't here; both derive from `band`.)

#### Verification

`grep -c "@capacitor/status-bar"` in the file drops to 1. Native smoke (Maestro) for status-bar
style/visibility across orientation still passes.

---

### [P4][readability] ActionsPanel duplicates the drawer transition list verbatim across two rules

**File(s):** `web/src/lib/components/ActionsPanel.svelte:426-431,462-467` — pinned at SHA f934d43

#### Problem

The four-line
`transition: grid-template-columns 0.28s ease, grid-template-rows 0.28s ease, opacity var(--duration-base) ease, margin 0.28s ease;`
is written in the base `.actions-drawer` (426-431) and again in the closed-state rule (462-467,
which only adds a `visibility 0s 0.28s` segment). The `0.28s` literal appears four+ times and is
flagged "keep in sync with ACTION_BUTTON_GAP"-style comments elsewhere. Editing the drawer timing
means touching multiple identical blocks.

#### Proposed solution

Introduce a `--drawer-collapse: 0.28s` custom property (or a motion token) and reference it; keep
the transition list in the base rule and only append `visibility` in the closed rule rather than
restating the whole list.

#### Verification

Grep `0.28s` → single source. Drawer open/close animation unchanged in both orientations.

---

### [P4][consistency] corner-button consumers use inconsistent sizes (44 vs 48 px)

**File(s):** `web/src/lib/components/FullscreenToggle.svelte:30-34` vs
`web/src/lib/components/ActionsPanel.svelte:522-529` — pinned at SHA f934d43

#### Problem

Both the Fullscreen Toggle and the drawer toggle share `.corner-button` chrome (app.css) and sit in
screen corners, but Fullscreen is `44×44` (30-31) while the drawer toggle is `48×48` (523-524).
Nothing documents why two members of the same visual family differ; it reads as drift. Both also
hardcode `8px` offsets (raw, not `--space-2`).

#### Proposed solution

Pick one corner-button touch-target size (48 to meet the comfortable-target guidance) and apply it
to `.corner-button` in app.css so all members inherit it, overriding only where genuinely required
(documented). Use `--space-2` for the `8px` insets.

#### Verification

Measure both corner buttons in `run-splotch`; confirm they match and clear the palette in both
orientations.

---

### [P4][naming] InstallBanner scatters unexplained magic numbers (auto-clear count, fly distance)

**File(s):** `web/src/lib/components/InstallBanner.svelte:16,54-57,85` — pinned at SHA f934d43

#### Problem

`STROKES_BEFORE_AUTO_CLEAR = 5` (16) is named, but the fly-out distance `120` is a bare literal
repeated three times (`fly({ y: 120 })` at 85, and `dy = … : 120` fallback at 57), and
`PARTING_MESSAGE_MS = 4000` sits beside a separate inline `duration: 550`/`300`/`420` set with no
shared motion vocabulary. The `120` in particular carries meaning ("slide fully below the fold") but
is duplicated as a raw number.

#### Proposed solution

Name the exit distance (`const EXIT_FLY_Y = 120`) and reuse it in both the `fly` and the
`bannerExit` fallback; group the banner's motion constants together.

#### Verification

Grep `120` in the file → single named constant. Banner enter/exit motion unchanged.

---

### [P5][discoverability] SplotchyIcon renders `<img src="/splotchy.svg">`, bypassing the Icon system

**File(s):** `web/src/lib/components/SplotchyIcon.svelte:9-11` — pinned at SHA f934d43

#### Problem

Every other glyph in scope goes through `Icon.svelte` (inline `{@html}` SVG, `data-icon`,
type-checked `name` union, `fill`-based theming). The mascot instead points an `<img>` at a static
`/splotchy.svg`, so it can't be tinted via the icon-ink rules, isn't part of the `name` union, and
won't appear when someone greps the icon set. It carries `class="… icon-color"` and
`data-icon="splotchy"` to *look* like an Icon output without being one. A contributor searching for
how icons work will miss it.

#### Proposed solution

If the mascot is intentionally full-color raster/SVG-as-image, document that in the file (a one-line
WHY comment) and/or register it in the icon pipeline as an `icon-color` entry so it's discoverable
through the same channel. If it can be inlined, route it through `Icon`/`gen:icons`.

#### Verification

A grep for the mascot from the icon catalog finds it; theme/tinting behavior verified in light and
dark.

---

### [P5][design-tokens] ErrorScreen uses bare off-scale sizes for its heading and blob

**File(s):** `web/src/lib/components/ErrorScreen.svelte:35-40,44` — pinned at SHA f934d43

#### Problem

The crash fallback deliberately uses `var(--token, literal)` fallbacks so it renders even if
`tokens.css` failed to load (documented intent, 1-3) — that part is fine. But
`h1 { font-size: 32px }` (44) and the `.error-blob` `96px` box (35-36) are bare literals with no
token and no fallback rationale; `--font-size-3xl` is 28 and there's no 32 token. Low stakes given
the standalone nature, but it's untokenized sizing that could reference the scale where the
component still has token access.

#### Proposed solution

Use `var(--font-size-3xl, 32px)` for the heading (keeping the crash-safe fallback pattern the rest
of the file already uses) and consider a sizing token for the blob, or leave with an explicit
"standalone, intentionally literal" note.

#### Verification

Heading/blob render identically; if tokens load, they now track the scale.

---

### [P5][readability] Slider's snap-band width is an unexplained-magnitude magic fraction

**File(s):** `web/src/lib/components/Slider.svelte:42` — pinned at SHA f934d43

#### Problem

`const snapBand = $derived((max - min) * 0.045);` — the `0.045` ("~4.5% of the track") is a bare
literal. It's commented, but as a tuning constant that governs detent feel it would be clearer and
more grep-able as a named constant, especially since Slider is a reusable primitive backing multiple
settings.

#### Proposed solution

`const SNAP_BAND_FRACTION = 0.045;` at module scope with the rationale, referenced in the derived.

#### Verification

Grep `0.045` → named. Detent still engages within the same band on both the volume (0–100) and
button-size (70–130) sliders.

---

**Scope note:** Findings are confined to the assigned Core UI controls files. The
`rgba(171, 113, 225, …)` values in ActionsPanel/BrushMenu/StrokeWidthMenu and the `#000` keyline are
intentional pre-`color-mix` fallbacks / documented one-offs per `docs/COMPATIBILITY.md`, so I did
not flag them. The CSS literals mirroring `actionButtonLayout` constants (188/208/6) are already
drift-guarded by `actionButtonLayout.fallback.test.ts` and were likewise left alone.

## Source: Code audit — Design system + icons

### [P2][dead-code] `Button` design primitive has no production consumers

**File(s):** `web/src/lib/components/design/Button.svelte:1-105` (whole component); consumers
verified — pinned at SHA f934d43

#### Problem

`Button.svelte` is the only shared design primitive (per the `design` skill it is "the shared chrome
for text-labeled buttons on modal/parent surfaces"), but a repo-wide search shows the *only* file
that imports or renders it is the styleguide harness:

```
=== all <Button usages ===
./routes/dev/design/+page.svelte:58 / :184 / :186
=== import Button (any) ===
./routes/dev/design/+page.svelte:3
```

No modal, parent, or admin surface actually uses it. The real parent/modal buttons (`ParentCenter`,
`AppearanceSection`, etc.) still hand-roll `<button class="...">`. So the primitive is aspirational:
it is maintained, screenshotted, and documented, yet ink on modal surfaces bypasses it — the exact
drift the primitive exists to prevent. A design primitive with zero real callers is worse than none,
because a newcomer assumes it is the sanctioned path and the styleguide implies coverage that
doesn't exist.

#### Proposed solution

Either (a) adopt it: migrate the text-labeled buttons in `ParentCenter.svelte`,
`AppearanceSection.svelte`, and the admin/dialog action buttons to `<Button>`, retiring their
bespoke `.btn`-style blocks; or (b) if the parent surfaces deliberately keep bespoke chrome, delete
`Button.svelte` and its styleguide section and drop the "Primitives" claim from the `design` skill.
Track the decision in the ADR-0071 lineage. Prefer (a) — the variants already map cleanly to the
existing parent-button styles.

#### Verification

`grep -rIn "<Button" web/src --include=*.svelte` should list production surfaces, not just
`routes/dev/design`. If deleted, `npm run check` + `npm test` stay green and `/dev/design` no longer
references it.

---

### [P2][maintainability] Unreferenced icon assets (`trash`, `sweep-icon`) ship in the union and glob

**File(s):** `web/src/lib/icons/trash.svg`, `web/src/lib/icons/sweep-icon.svg`;
`web/src/lib/components/icon-names.d.ts:54,59` — pinned at SHA f934d43

#### Problem

`Icon.svelte` eager-globs every SVG in `lib/icons/` into the bundle and `generate-icon-names.mjs`
emits every filename into the `IconName` union. Two icons are never referenced anywhere in
`web/src`:

```
trash      -> 0 files
sweep-icon -> 0 files
```

(`trash-closed`/`trash-open` are the live pair; `trash` is an orphan.) They inflate the generated
union, the eager glob, and — for `sweep-icon` — sit in the hand-maintained `COLOR_ICONS` set
(`Icon.svelte:22`) as permanent dead weight. Because the union is generated from the directory,
nothing flags an icon that no component consumes.

#### Proposed solution

Delete `trash.svg` and `sweep-icon.svg` (and `sweep-icon` from `COLOR_ICONS`), then
`npm run gen:icons`. To make this self-policing, add a unit test (or extend `test:driver:smoke`)
that scans `.svelte`/`.ts` sources for each `IconName` and fails on any name with zero references —
the same shape as the existing `COLOR_ICONS` guard test.

#### Verification

After deletion + `gen:icons`, `trash` and `sweep-icon` are gone from `icon-names.d.ts`;
`npm run check`/`npm test` pass. The new orphan-icon test fails if either is re-added without a
consumer.

---

### [P2][type-safety] `COLOR_ICONS` is an untyped `Set<string>` — stale/typo entries can't be caught by the compiler

**File(s):** `web/src/lib/components/Icon.svelte:13-42` — pinned at SHA f934d43

#### Problem

```ts
export const COLOR_ICONS = new Set([
  'camera', 'crayon', 'eraser', ...
]);
```

The set is inferred as `Set<string>`, so nothing ties its 24 entries to the `CommonIconName` union.
A misspelled entry (`'camara'`), or an entry for an icon that was later renamed/deleted (see the
`sweep-icon` orphan above), compiles clean and silently does nothing — the icon it was meant to
protect renders wrongly tinted. `COLOR_ICONS.has(name)` on line 68 also accepts any string. The
runtime test (`Icon.svelte.test.ts`) only checks the *forward* direction (every colorful SVG is
present); a stale/typo'd extra entry is invisible to both compiler and test.

#### Proposed solution

Type the set: `export const COLOR_ICONS = new Set<CommonIconName>([...])` (or
`satisfies ReadonlySet<CommonIconName>` via an `as const` tuple). That makes every literal checked
against the union and turns a renamed/deleted icon into a compile error. Optionally add the reverse
test assertion: every `COLOR_ICONS` member exists in the globbed icon set.

#### Verification

Introduce a bogus entry `'camara'` — with the type annotation, `npm run check` fails; without it, it
passes today. Confirm the real set still type-checks after annotation.

---

### [P2][duplication] The icon glob + `splotchy` exclusion is repeated in three places with no shared source

**File(s):** `web/src/lib/components/Icon.svelte:48`,
`web/src/lib/components/Icon.svelte.test.ts:14`, `web/src/lib/components/iconTypes.ts:4` — pinned at
SHA f934d43

#### Problem

The rule "render every icon except `splotchy`" is encoded independently three times:

```ts
// Icon.svelte:48
import.meta.glob(['../icons/*.svg', '!../icons/splotchy.svg'], {...})
// Icon.svelte.test.ts:14
import.meta.glob<string>(['../icons/*.svg', '!../icons/splotchy.svg'], {...})
// iconTypes.ts:4
export type CommonIconName = Exclude<IconName, 'splotchy'>;
```

The test's comment even admits it must "Mirror Icon.svelte's own glob (splotchy is excluded there
too)." Add a second special-cased icon (e.g. another brand asset) and a contributor must remember
all three sites; miss one and the type says an icon is renderable that the glob won't load (or vice
versa), producing an empty `markup` fallback at runtime. The `key`-derivation logic is also
duplicated: `Icon.svelte:56` (`.split('/').pop()...replace('.svg','')`) vs `Icon.svelte.test.ts:20`
(`iconName`).

#### Proposed solution

Centralize the exclusion list in one module, e.g. `iconTypes.ts` exporting
`const NON_RENDERABLE_ICONS = ['splotchy'] as const` and a shared `iconNameFromPath(path)` helper;
derive `CommonIconName` as `Exclude<IconName, typeof NON_RENDERABLE_ICONS[number]>`, and have both
globs reference the same excluded-glob array (import.meta.glob needs literal patterns, so at minimum
share the constant + a comment linking the three, and share the path→name helper).

#### Verification

Grep for `splotchy` in `web/src/lib/components` returns one authoritative definition plus
references, not three parallel string literals. `npm test` still passes.

---

### [P2][design-tokens] `app.css` uses raw px/seconds where tokens exist and is outside the token ratchet

**File(s):** `web/src/app.css:154-245` (`.modal-close-btn`, `.corner-button`), transitions at
`:189,:213,:226` — pinned at SHA f934d43

#### Problem

The `design` skill's hard rule #2 is "no raw values where a token exists," and the same file already
uses tokens elsewhere (`var(--duration-base)` in `.modal-close-btn`'s transition, `:169-172`). Yet a
few lines down the icon-fill transitions are raw:

```css
.modal-close-icon svg { transition: fill 0.2s ease; }      /* :189 */
.corner-button        { transition: opacity 0.2s ease; }   /* :213 */
.corner-button-icon svg { transition: fill 0.2s ease; }    /* :226 */
```

`0.2s` is exactly `--duration-base`. Likewise `.modal-close-btn` hardcodes `top/right: 12px`
(`--space-3`), `padding: 10px`, `.corner-button { padding: 8px }` (`--space-2`). The `lint:tokens`
ratchet only scans **hex** in **`.svelte`** `<style>` blocks (`lint-token-styles.mjs:76`), so
`app.css` — a `.css` file, with non-hex values — is entirely unguarded, which is exactly why this
drift persists.

#### Proposed solution

Swap the covered raw values in `app.css` for tokens: the three `0.2s` → `var(--duration-base)`,
`12px` → `var(--space-3)`, `8px` → `var(--space-2)`. Leave genuine one-offs (`44px` touch target,
`2px` border, `10px`) as-is or mint a `--touch-target`/`--border-width` token only if reused.
Consider extending the ratchet to also scan `app.css` and `--duration-*`/`--space-*` literals so
this class of drift is caught.

#### Verification

Grep `app.css` for `0.2s`/bare `12px`/`8px` returns only intentional exceptions. Visual diff on
`/dev/design` and modal/corner buttons shows zero change (values are equal).

---

### [P3][type-safety] `Icon` `Props` index signature `[key: string]: unknown` defeats prop checking

**File(s):** `web/src/lib/components/Icon.svelte:60-65` — pinned at SHA f934d43

#### Problem

```ts
interface Props {
  name: CommonIconName;
  class?: string;
  [key: string]: unknown;
}
let { name, class: className = '', ...rest }: Props = $props();
```

The catch-all index signature turns every unlisted prop into `unknown`, then `{...rest}` sprays them
onto the `<span>`. A caller can pass `<Icon name="pen" onclik={...} widht={20} />` (typos) and
TypeScript stays silent. It also allows arbitrary attributes with no relation to what a `<span>`
accepts, and weakens the guarantee the generated `name` union is supposed to provide. Compare
`Button.svelte`, which extends the typed `HTMLButtonAttributes` for exactly this reason.

#### Proposed solution

Replace the index signature with the typed element attribute set:
`interface Props extends HTMLAttributes<HTMLSpanElement> { name: CommonIconName; }` (import
`HTMLAttributes` from `svelte/elements`, mirroring Button). That keeps the rest-spread working while
type-checking the passthrough attributes.

#### Verification

`npm run check` passes with the typed interface; passing a bogus attribute (`widht={1}`) now errors.
Existing `<Icon>` call sites still compile.

---

### [P3][consistency] `Icon` builds its class with string concatenation while `Button` uses the class array API

**File(s):** `web/src/lib/components/Icon.svelte:65,68,75` vs
`web/src/lib/components/design/Button.svelte:20,23` — pinned at SHA f934d43

#### Problem

Icon:

```ts
const colorClass = $derived(COLOR_ICONS.has(name) ? ' icon-color' : '');   // leading-space hack
...
<span class="{className}{colorClass}" ...>
```

Button, the sibling component:

```svelte
<button class={['btn', variant, size, className]} ...>
```

Two components in the same design layer solve identical "compose classes" needs two different ways.
The Icon approach relies on a fragile leading-space literal (`' icon-color'`) and defaults
`className = ''` so the concat doesn't produce `undefinedicon-color`; a missed space silently fuses
class names. Svelte 5's array/object `class` prop (used by Button) is the idiomatic, injury-proof
form.

#### Proposed solution

Rewrite Icon's class as `class={[className, COLOR_ICONS.has(name) && 'icon-color']}` and drop the
`colorClass` derived + the `className = ''` default's space dependency. One class-composition idiom
across the design components.

#### Verification

Rendered `class` attribute is unchanged for both color and mono icons (assert via the existing
`data-icon` tests / `/dev/design`); `npm test` green.

---

### [P3][type-safety] `StrokeWidthMenu` fabricates icon names with a template + `as CommonIconName`, escaping the union and grep

**File(s):** `web/src/lib/components/StrokeWidthMenu.svelte:52` — pinned at SHA f934d43

#### Problem

```svelte
name={`${erasing ? 'eraser-size' : 'size'}-${size}` as CommonIconName}
```

This is the one place the whole point of the generated `IconName` union is defeated: the name is
assembled at runtime and force-cast, so the compiler never verifies `size-4`/`eraser-size-3`
actually exist. It also destroys grepability — a newcomer searching for where `size-3` or
`eraser-size-5` is used finds *nothing* (confirmed: `grep 'size-3'` across `.svelte` hits only the
icon file). Ten of the 62 icons are reachable only through this cast. If someone deletes
`size-5.svg`, nothing errors until a toddler picks the widest brush.

#### Proposed solution

Replace the cast with a lookup keyed by an explicit typed map, e.g.
`const SIZE_ICONS: Record<StrokeSize, CommonIconName> = { 1: 'size-1', ... }` and
`ERASER_SIZE_ICONS` similarly (or a single `satisfies` const). Now every `size-N` literal is
greppable and union-checked, and a missing SVG is a compile error.

#### Verification

`grep -rn "'size-3'" web/src` finds the map entry; deleting `size-3.svg` + `gen:icons` makes
`npm run check` fail. Stroke menu renders identically.

---

### [P3][maintainability] `COLOR_ICONS` is a 24-entry hand-maintained allowlist mixing two unrelated concepts

**File(s):** `web/src/lib/components/Icon.svelte:13-42` — pinned at SHA f934d43

#### Problem

The set conflates two distinct reasons an icon skips the monochrome tint: (1) it's genuinely
full-color (derivable — `iconChroma.mjs`/`isSpot` already computes this), and (2) it's a monochrome
preview that self-tints via `currentColor`/theme vars (`size-*`, `eraser-size-*`). Category 1 is
machine-detectable yet is still hand-listed, so the list carries ~14 entries that a build step could
generate, plus a test (`Icon.svelte.test.ts`) whose sole job is to police the hand-list against the
classifier. That's a lot of machinery to keep a derivable set in sync by hand.

#### Proposed solution

Split the concerns: generate the color-icon portion at build time (extend `gen:icons` to emit a
`COLORFUL_ICONS` const from `isSpot`, the classifier already lives in `scripts/lib/iconChroma.mjs`),
and keep only the *self-tinting monochrome opt-outs* (`size-*`, `eraser-size-*`) as a small,
clearly-named hand list (`SELF_TINTING_ICONS`). `Icon.svelte` unions the two. The guard test then
becomes redundant for category 1.

#### Verification

Adding a new spot SVG + `gen:icons` auto-tags it (no manual `COLOR_ICONS` edit); the tint behavior
on `/dev/design` is unchanged for all current icons.

---

### [P3][complexity] `gen-tokens.mjs` emits the dark block via two different call styles

**File(s):** `scripts/gen-tokens.mjs:25-59` — pinned at SHA f934d43

#### Problem

```js
function render() {
  const darkBody = declarations(themes.dark, '  '); // computed…
  return `...
:root[data-theme='dark'] {
  color-scheme: dark;
${darkBody}                                            // …used here
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${declarations(themes.dark, '    ')}                   // …recomputed inline here
  }
}`;
}
```

The dark declarations are produced two ways in one function — a precomputed `darkBody` for one
selector, an inline `declarations(themes.dark, ...)` for the other, differing only in indent string.
It reads as if the two blocks are unrelated when they're the same data at different nesting. The
`'  '`/`'    '` indentation strings are also magic literals scattered through the template.

#### Proposed solution

Iterate over selector descriptors:
`const themedBlocks = [{sel: ":root[data-theme='dark']", tokens: themes.dark, indent: '  '}, {sel: "...", tokens: themes.dark, indent: '    '}]`
and `.map` them, or factor a `block(selector, tokens, indent)` helper and call it uniformly for all
three token blocks. Drop `darkBody`. One code path renders every declaration block.

#### Verification

`npm run gen:tokens` produces a byte-identical `tokens.css` (compare before/after);
`npm run gen:tokens:check` passes.

---

### [P3][architecture] Shared component chrome in `app.css` (`.corner-button`, `.modal-close-btn`) duplicates the primitive layer with raw values

**File(s):** `web/src/app.css:124-245` — pinned at SHA f934d43

#### Problem

`app.css` hosts several reusable UI patterns — `.modal-shell`, `.modal-close-btn`, `.corner-button`
— that are conceptually "primitives" but live as global classes with a mix of tokens and raw values
(see the token finding above). The `design` skill explicitly says global patterns "remain classes in
`app.css` because dialogs and imperative DOM need them," so their existence is intentional — but
they sit outside every guardrail the design system applies to `.svelte` primitives (no ratchet, no
styleguide entry, no token enforcement), so they drift most easily. There's no cross-reference from
the `design` skill's Primitives table to these global classes, so a newcomer doesn't know they're
the sanctioned path for close/corner buttons.

#### Proposed solution

Document these global classes in the `design` skill (a "global primitives" sub-table) and, per the
token finding, bring their covered values onto tokens so they're visibly first-class. No need to
convert them to components — just close the guardrail gap and make them discoverable.

#### Verification

The `design` skill lists `.corner-button`/`.modal-close-btn`/`.modal-shell`; a token audit of
`app.css` shows only intentional one-offs remain raw.

---

### [P3][design-tokens] `Button` hardcodes `font-weight: 600` and a `1px` border with no system token

**File(s):** `web/src/lib/components/design/Button.svelte:36,82` — pinned at SHA f934d43

#### Problem

```css
.btn { ... font-weight: 600; ... }
.ghost { ... border: 1px solid var(--border); }
```

`600` and `1px` are raw. The token vocabulary has no font-weight or border-width scale at all, so
the same magic weight/hairline reappears uncontrolled across components (parent buttons, admin,
etc.). For a design system whose stated rule is "no raw values where a token exists," the gap is
that the tokens *don't* exist for two of the most-repeated values.

#### Proposed solution

If `600` and `1px` recur (they do — grep confirms `font-weight: 600` across many components), mint
`--font-weight-semibold: 600` and `--border-width: 1px` (or `--hairline`) in `scale`, regenerate,
and reference them. If they're deemed genuinely universal constants not worth tokenizing, note that
decision in the `design` skill so the omission is a choice, not an oversight.

#### Verification

`grep -rn "font-weight: 600" web/src` count before/after adoption; `/dev/design` renders unchanged.

---

### [P4][maintainability] `app.css` comment points to `screenshot.js`, which is now `screenshot.ts`

**File(s):** `web/src/app.css:256` — pinned at SHA f934d43

#### Problem

```css
/* ...are created imperatively in src/lib/drawing/screenshot.js and appended... */
```

The file is `web/src/lib/drawing/screenshot.ts` (verified — no `.js` exists). The project mandates
"no plain `.js` source files in `src/`," so the stale `.js` reference both misdirects a reader
following the pointer and implies a convention violation that isn't real.

#### Proposed solution

Update the comment to `screenshot.ts`.

#### Verification

`ls web/src/lib/drawing/screenshot.*` shows only `.ts`; the comment matches.

---

### [P4][dead-code] `generate-icon-names.mjs` carries Windows path-normalization that ADR-0062 made dead

**File(s):** `scripts/generate-icon-names.mjs:13-14` — pinned at SHA f934d43

#### Problem

```js
.map((path) =>
  path
    .replace(/\\/g, '/')   // backslash→slash: only matters on Windows
    .split('/')
```

`node:fs` `globSync` returns POSIX-separated paths on macOS/Linux, the only supported dev platforms
(ADR-0017, Windows dropped in ADR-0062). The `\\`→`/` replace can never fire, and its presence
implies Windows is still a target. (The `scripts/` CLAUDE.md explicitly states Windows support was
dropped.)

#### Proposed solution

Remove the `.replace(/\\/g, '/')` step. If a defensive normalize is still wanted, centralize a
`basenameNoExt(path, ext)` helper in `scripts/lib/utils.mjs` and reuse it here and in the Icon
key-derivation sites rather than re-implementing splitting logic.

#### Verification

`node scripts/generate-icon-names.mjs` produces an identical `icon-names.d.ts`;
`npm run gen:icons:check` (if present) / diff is clean.

---

### [P4][design-tokens] `fontSizeSm` (13px) and `fontSizeMd` (14px) are a 1px-apart near-duplicate ramp step

**File(s):** `web/src/lib/design/tokens.ts:56-57` — pinned at SHA f934d43

#### Problem

```ts
fontSizeSm: '13px',
fontSizeMd: '14px',
```

The `design` skill says "prefer reusing an existing step of a ramp over minting a near-duplicate,"
and a 1px delta between two adjacent type steps is exactly the near-duplicate the guidance warns
about — the two are visually indistinguishable at body sizes and invite arbitrary choice between
them. (The spacing ramp, by contrast, jumps 4→8→12→16, a clean geometric-ish ramp.)

#### Proposed solution

Audit consumers of `--font-size-sm` vs `--font-size-md`; if the 1px difference isn't load-bearing,
collapse to one step and remap references. If both are genuinely needed (e.g. dense admin vs body),
add a one-line rationale in `tokens.ts` so the near-duplicate is defended.

#### Verification

Grep `--font-size-sm`/`--font-size-md` usage; after any merge, `/dev/design` type ramp and consuming
surfaces are reviewed in both themes.

---

### [P4][consistency] `iconTypes.ts` imports `IconName` and separately re-exports it — redundant

**File(s):** `web/src/lib/components/iconTypes.ts:1-4` — pinned at SHA f934d43

#### Problem

```ts
import type { IconName } from './icon-names';
export type { IconName } from './icon-names'; // re-export
export type CommonIconName = Exclude<IconName, 'splotchy'>;
```

`IconName` is both imported (line 1, to build `CommonIconName`) and independently re-exported from
the same module (line 3). It works, but the doubled reference to `./icon-names` is easy to misread
as two different symbols and drifts if the source path changes.

#### Proposed solution

Collapse to `export type { IconName } from './icon-names';` plus
`import type { IconName } from './icon-names';` is unnecessary — TypeScript allows
`export type CommonIconName = Exclude<import('./icon-names').IconName, 'splotchy'>` or simply keep
the single `import type` and add `export type { IconName }` to it: `export { type IconName }` is
fine, but reference `./icon-names` once. Minor tidy.

#### Verification

`npm run check` passes; consumers of both `IconName` and `CommonIconName` still resolve.

---

### [P4][maintainability] Adding an icon touches two hand-edited surfaces with no single onboarding note

**File(s):** `web/src/lib/components/Icon.svelte:13-42`, `.claude/rules/svelte.md:23` — pinned at
SHA f934d43

#### Problem

`svelte.md` documents the happy path ("drop the SVG, run `gen:icons`, use `<Icon>`") but omits that
a **full-color** icon also requires a manual `COLOR_ICONS` edit — otherwise it renders wrongly
tinted on modal surfaces. The test catches the omission in CI, but the contributor learns this only
by failing CI, not from the rule. Grepability of "how do I add a colored icon" is therefore
incomplete.

#### Proposed solution

Extend the `svelte.md` "New icons" bullet with the color-icon step (or, better, adopt the
generated-`COLORFUL_ICONS` approach from the earlier finding, which removes the manual step entirely
and makes the rule accurate by construction).

#### Verification

The rule text describes the exact steps that keep CI green for both mono and color icons; a new
colored icon added per the doc passes `npm test` first try.

---

### [P4][consistency] `toCssVarName` lives in the token data module but is pure generator logic

**File(s):** `web/src/lib/design/tokens.ts:259-262` — pinned at SHA f934d43

#### Problem

`tokens.ts` is documented as "the design-token single source of truth" — a data module the app
imports for JS-side token values (canvas fill, Notch Band). The camelCase→kebab CSS-var name mapping
is build-time concern used only by `gen-tokens.mjs` (and its test), not by any runtime consumer, yet
it ships inside the runtime-imported data module. It's minor coupling, but it means the app bundle
carries a regex helper it never calls, and the "source of truth for values" file also owns "how CSS
var names are spelled."

#### Proposed solution

Move `toCssVarName` to `scripts/gen-tokens.mjs` (or a `scripts/lib/` helper) alongside the only code
that emits CSS, and update `tokens.test.ts`'s import. Keeps `tokens.ts` purely declarative data +
the `ThemeTokens` contract.

#### Verification

`npm run gen:tokens` and `tokens.test.ts` pass after the move; `tokens.ts` no longer exports
build-only functions.

---

### [P4][complexity] `render()` header comment duplicates the emitted `tokens.css` banner

**File(s):** `scripts/gen-tokens.mjs:1-10` and the template banner `:27-35` — pinned at SHA f934d43

#### Problem

The generator has two long explanatory blocks that say nearly the same thing: the module-level
comment (`:1-10`, "dark declarations emitted twice … generator guarantees the two blocks stay
identical") and the emitted banner inside the template literal (`:27-35`, "generator emits the dark
block twice so the two forms can never drift"). Maintaining the same rationale in two prose blocks
invites drift between them.

#### Proposed solution

Keep the rationale in one place — the emitted banner (which ships to readers of `tokens.css`) — and
trim the module comment to a one-line pointer, or vice versa. Not worth a big refactor; just
deduplicate the prose.

#### Verification

Output `tokens.css` unchanged; the two comment blocks no longer restate each other.

---

I reviewed all in-scope files plus the supporting `iconChroma.mjs`/`utils.mjs`. Notable
cross-cutting themes: (1) the icon system's type-safety leaks — an untyped `COLOR_ICONS`, an `Icon`
index signature, and a `StrokeWidthMenu` cast — collectively undercut the generated union that is
the system's whole selling point; (2) the `Button` primitive and two icon assets are effectively
dead; (3) `app.css` sits entirely outside the token guardrails and has drifted to raw values the
tokens already cover.

## Source: Code audit — Admin console + token backend

### [P1][duplication] Login flow (rate-limit + secret verify) is copy-pasted across the two front doors

**File(s):** `web/src/routes/api/admin/login/+server.ts:16-30` and
`web/src/routes/admin/+page.server.ts:89-105` (login handlers) — pinned at SHA f934d43

#### Problem

Both doors independently re-implement the identical login sequence: build the same bucket key,
throttle, extract the credential, and verify it.

```ts
// login/+server.ts
const { limited, retryAfter } = rateLimit(`admin-login:${getClientAddress()}`);
if (limited) return throttled(retryAfter);
const key = typeof body?.key === 'string' ? body.key : '';
if (!verifyAdminSecret(key)) { ... }
```

```ts
// +page.server.ts login action
const { limited, retryAfter } = rateLimit(`admin-login:${getClientAddress()}`);
if (limited) { return fail(429, ...); }
const key = String(form.get('access-key') ?? '');
if (!verifyAdminSecret(key)) { return fail(403, ...); }
```

The `admin-login:${getClientAddress()}` bucket key is a load-bearing shared string (the API skill
and the code both state the two doors *must* share one bucket) yet it exists as a bare literal in
two files. If someone edits one and not the other, the shared-budget guarantee silently breaks with
no test catching the drift. The `verifyAdminSecret` decision is also duplicated, so any future
hardening (e.g. logging failed attempts) has to be added twice.

#### Proposed solution

Extract the throttle-and-verify core into `$lib/server/admin.ts`, returning a discriminated outcome
the transport layer maps to its own response type:

```ts
// admin.ts
export const ADMIN_LOGIN_BUCKET = (ip: string) => `admin-login:${ip}`;
export function attemptAdminLogin(ip: string, key: string):
  | { ok: true; session: string }
  | { ok: false; status: 429; retryAfter: number }
  | { ok: false; status: 403 };
```

The API endpoint maps that to `throttled()`/`json(403)`; the form action maps it to
`fail(429)`/`fail(403)`/`setSession + redirect`.

#### Verification

`grep -rn 'admin-login:' web/src` returns one definition. `npm run test:api:smoke` (login
success/failure/429) and `tests/admin.spec.ts` still pass.

---

### [P1][maintainability] HTTP status is chosen by string-comparing the error message

**File(s):** `web/src/routes/api/admin/tokens/+server.ts:50-55` (`mutationError`) — pinned at SHA
f934d43

#### Problem

The endpoint decides between `409` (retryable CAS conflict) and `400` (bad input) by comparing the
returned message text to a sentinel:

```ts
function mutationError(message: string) {
  return json(
    { ok: false, error: message },
    { status: message === TOKEN_CONFLICT_ERROR ? 409 : 400 },
  );
}
```

The response *status* — a real part of the API contract, asserted by clients and smoke tests —
hinges on an exact-match of a human-readable string that is also shown to users. Reword
`TOKEN_CONFLICT_ERROR` (line `tokens.ts:162`) for UX and every conflict silently becomes a `400`.
The coupling is invisible: nothing links the wording to the status code.

#### Proposed solution

Have the token core classify the failure instead of the route re-deriving it. Change
`MutationResult`'s failure arm to carry a discriminant:

```ts
// tokens.ts
type MutationResult =
  | { ok: true; tokens: string[] }
  | { ok: false; error: string; reason: 'invalid' | 'conflict' };
```

Then `mutationError` maps `reason === 'conflict'` → 409, else 400 — no message comparison. The web
form action (`+page.server.ts`) can use the same `reason` to stop returning `fail(400)` for
conflicts (see separate finding).

#### Verification

`npm run test:api:smoke` conflict path still returns 409; add a unit test asserting `addToken` on a
colliding list returns `reason: 'conflict'`. Grep shows no remaining `=== TOKEN_CONFLICT_ERROR`.

---

### [P2][type-safety] Native page hand-rolls type guards that duplicate the server's response shape

**File(s):** `web/src/routes/admin/native/+page.svelte:45-70`
(`isInvite`/`isSnapshot`/`responseError`), `:113-136` (`login`) — pinned at SHA f934d43

#### Problem

The snapshot contract (`{ ok, tokens, invites, persistent }`) is defined authoritatively where it's
produced (`tokens/+server.ts:44`, `snapshot()`), but the native client re-describes it by hand as
runtime guards plus an inline type annotation:

```ts
function isSnapshot(value: unknown): value is {
  ok: true; tokens: string[]; invites: Invite[]; persistent: boolean
} { ... }
```

and `login` parses the login response with no type at all:

```ts
const data = await response.json().catch(() => null);
if (!response.ok || !data?.ok || typeof data?.session !== 'string') { ... }
```

The shape now lives in three places (server `json(...)`, this guard, the API skill). A field added
server-side won't surface here as a type error — the client just silently ignores it. `data?.ok` /
`data?.session` are untyped property access on `any`.

#### Proposed solution

Define the wire types once next to the endpoint and import them:

```ts
// tokens/+server.ts (or a shared web/src/lib/adminApi.ts)
export interface TokenSnapshot {
  ok: true;
  tokens: string[];
  invites: Invite[];
  persistent: boolean;
}
export interface LoginResponse {
  ok: true;
  session: string;
}
```

Keep the runtime guard, but type it as `value is TokenSnapshot` so a shape change breaks the guard
at compile time; type the login parse against `LoginResponse | { ok: false; error?: string }`.

#### Verification

`npm run check` fails if the server shape and client guard diverge after the change.
`tests/admin.spec.ts` native flow still passes.

---

### [P2][duplication] Add/remove token mutations share an entire retry scaffold

**File(s):** `web/src/lib/server/tokens.ts:167-199` (`addToken`, `removeToken`) — pinned at SHA
f934d43

#### Problem

The two exported mutations are the same read-modify-CAS-retry loop with only the transform
differing:

```ts
for (let attempt = 1; attempt <= MUTATION_ATTEMPTS; attempt++) {
  const read = await readStore();
  if (read.source === 'unconfirmed') return { ok: false, error: TOKEN_CONFLICT_ERROR };
  const { store, list, etag } = read;
  // ...compute `next`...
  if (await persist(store, next, etag)) return { ok: true, tokens: next };
}
return { ok: false, error: TOKEN_CONFLICT_ERROR };
```

The retry count, the unconfirmed-source bailout, the conflict sentinel, and the loop structure are
duplicated. A change to the concurrency strategy (attempt count, backoff, how `unconfirmed` is
handled) must be edited in two spots, and the `removeToken` copy has an extra `deleteUsage` side
effect wired into the middle of the copied loop.

#### Proposed solution

Extract the loop into one internal helper parameterized by a pure transform that returns either the
next list or a validation error:

```ts
async function mutateList(
  transform: (list: string[]) => { next: string[] } | { error: string } | { noop: true },
  afterPersist?: (removed: string) => Promise<void>,
): Promise<MutationResult>;
```

`addToken`/`removeToken` become thin: validate input, then delegate. The `removeToken`
no-op-short-circuit (`next.length === list.length`) becomes a `{ noop: true }` return the helper
honors.

#### Verification

The existing `tokens.test.ts` concurrent-mutation suite (`raceOnce`/`raceAlways`, exhaustion, no-op
remove, usage cleanup) is the regression net — all cases must still pass unchanged.

---

### [P2][maintainability] AdminConsole hardcodes one accent color as a hex literal 8 times

**File(s):**
`web/src/lib/components/admin/AdminConsole.svelte:424,517,528,605,621,632,706 area,720,788`
(`#7c4dcf` occurrences) — pinned at SHA f934d43

#### Problem

The comment at `:378-384` justifies *not* adopting the theme tokens (this is a deliberately
light-only surface). Fair — but it doesn't justify repeating the raw accent value inline. `#7c4dcf`
appears 8 times (`.count`, `.btn-primary`, `.btn-ghost`, `.usage strong`, `.more-menu-item`, badge
gradient, …), its hover shade `#6b3fbe` and `#7c4dcf`-tinted backgrounds (`#f5f0fc`, `#f0e9fb`,
`#ece0fb`) several more, and neutral `#f0f0f0`/`#666`/`#757575` ~10 times. Retuning the console's
accent means a find-replace across the whole `<style>` block with no single source of truth, and
it's easy to miss one (there are already two near-identical purples: `#7c4dcf` and `var(--brand)`).

#### Proposed solution

Define page-local custom properties on `.admin-page` and reference them — this stays fully within
the "raw, un-themed" decision the comment defends, it just names the constants:

```css
.admin-page {
  --admin-accent: #7c4dcf;
  --admin-accent-hover: #6b3fbe;
  --admin-accent-tint: #f5f0fc;
  --admin-hairline: #f0f0f0;
  --admin-ink-muted: #666;
}
```

#### Verification

`grep -c '#7c4dcf' AdminConsole.svelte` → 0 after the change (one definition on `--admin-accent`).
The `tests/a11y.spec.ts` axe scan of `/admin` still passes (contrast unchanged). Visual diff via
`run-splotch` on `/admin`.

---

### [P2][duplication] The three per-invite action groups are triplicated markup

**File(s):** `web/src/lib/components/admin/AdminConsole.svelte:278-304` (full), `:306-323`
(compact), `:338-373` (more-menu) — pinned at SHA f934d43

#### Problem

"Copy code / Copy link / Remove" for one invite is written out three times with slightly different
wrappers: the wide-screen labelled row, the narrow-screen "Copy + ⋯" pair, and the modal sheet. Each
restates `copy(\`${invite.token}:code\`,
invite.token)`, the`class:copied`toggle, and the remove`run(() =>
onremove(...))`wiring. Adding a fourth action (or renaming an existing one) is a three-place edit, and the copies have already drifted — the full row's button label is "Copy code" while the compact one is "Copy", and only the full/compact rows show the`copied`
flash, not the menu.

#### Proposed solution

Extract the action buttons into a small child component (`InviteActions.svelte`) taking `invite`,
`copied`, `busy`, and the `copy`/`onremove` callbacks, rendered in all three layout contexts. Or,
minimally, a `{#snippet actionButtons(invite)}` reused by the full row and the menu. The
compact/full/modal split then only differs in the container, not the buttons.

#### Verification

`tests/admin.spec.ts` copy-code/copy-link/remove assertions pass at both wide and narrow viewports.
`npm run check` clean.

---

### [P2][complexity] `readStore` bundles store-open, read, seed, confirmation-loop, and fallback into one function

**File(s):** `web/src/lib/server/tokens.ts:67-111` — pinned at SHA f934d43

#### Problem

`readStore` is the module's linchpin and carries five distinct responsibilities in one 45-line body:
open the store, read the key, run the env-seed-on-empty branch, run the multi-attempt seed-race
confirmation loop (`:88-98`), and degrade to the memory fallback on transient error. The
deeply-nested confirmation loop (a `for` with an inner `try/catch` inside the outer `try`) is the
subtle, correctness-critical part (ADR-0025 lost-seed-race handling) but it's buried where it's hard
to read or test in isolation.

#### Proposed solution

Split the seed-race confirmation into a named helper the reader can grasp and unit-test directly:

```ts
async function confirmSeedRaceWinner(store: TokenStore): Promise<StoreRead>; // the :88-100 block
```

`readStore` then reads as: open → get → (present ? blobs : seed-then-`confirmSeedRaceWinner`) →
catch → memory. The existing `freshTokensWithSeedRace` test helper can target
`confirmSeedRaceWinner` more pointedly.

#### Verification

The `stale-empty seed races` describe block in `tokens.test.ts` still passes; the extracted helper
is directly unit-testable.

---

### [P3][duplication] Request-field extraction `typeof body?.X === 'string' ? body.X : ''` is repeated across every admin endpoint

**File(s):** `web/src/routes/api/admin/login/+server.ts:25`,
`web/src/routes/api/admin/tokens/+server.ts:68,78` — pinned at SHA f934d43

#### Problem

Every JSON endpoint pulls its one field the same defensive way:

```ts
const key = typeof body?.key === 'string' ? body.key : ''; // login
addToken(typeof body?.token === 'string' ? body.token : ''); // tokens POST
removeToken(typeof body?.token === 'string' ? body.token : ''); // tokens DELETE
```

Three copies of a fiddly type-narrowing expression that's easy to get subtly wrong (e.g. forgetting
the `?.`). It reads as noise around the actual logic.

#### Proposed solution

Add one helper beside `readJsonBody` in `$lib/server/http.ts`:

```ts
export function stringField(body: Record<string, unknown> | null, name: string): string {
  const v = body?.[name];
  return typeof v === 'string' ? v : '';
}
```

Callers become `stringField(body, 'key')` / `stringField(body, 'token')`.

#### Verification

`npm run test:api:smoke` unchanged. Grep for the `typeof body?.` pattern under `routes/api/admin`
returns nothing.

---

### [P3][naming] `ai_access_token` invite param is hardcoded despite an existing named constant

**File(s):** `web/src/lib/server/admin.ts:48-53` (`buildInvites`) vs
`web/src/lib/state/settings.svelte.ts:27` (`AI_ACCESS_TOKEN_PARAM`) — pinned at SHA f934d43

#### Problem

`buildInvites` embeds the query-parameter name as a literal:

```ts
url: `${origin}/?ai_access_token=${encodeURIComponent(token)}`,
```

but the very name the app *reads* that param under is already a named constant elsewhere
(`settings.svelte.ts:27`, `AI_ACCESS_TOKEN_PARAM = 'ai_access_token'`). The producer and consumer of
the same URL contract use different representations of the same string, so a rename on the consumer
side wouldn't be caught by the compiler and every issued invite link would silently stop working.
Grepping `ai_access_token` returns a scatter of literals across server, client, tests, and docs with
no single owner.

#### Proposed solution

Promote the param name to a shared, client-and-server-safe module (e.g. `web/src/lib/inviteLink.ts`
or an existing shared constants file — not `settings.svelte.ts`, which is client state), export
`AI_ACCESS_TOKEN_PARAM`, and import it in both `buildInvites` and `settings.svelte.ts`.

#### Verification

`grep -rn "'ai_access_token'" web/src` shows a single definition. `admin.test.ts` `buildInvites`
assertion still passes; `tests/flows.spec.ts` (which uses the param) still passes.

---

### [P3][maintainability] HMAC label and algorithm are inline literals, re-hardcoded in the test

**File(s):** `web/src/lib/server/admin.ts:20-24` (`sessionToken`), mirrored in
`web/src/lib/server/admin.test.ts:22-23` — pinned at SHA f934d43

#### Problem

```ts
return createHmac('sha256', secret).update('admin-session-v1').digest('hex');
```

The session-derivation label `'admin-session-v1'` is documented (`:12-19`) as a rotation lever —
"bump the label to invalidate every outstanding session at once" — yet it's a bare string the
operator has to know to find. The test re-hardcodes the exact same literal (`admin.test.ts:23`)
rather than importing it, so the "pins the exact algorithm" comment there is aspirational: bump the
label in source and the test keeps passing against its own stale copy only if both are edited.

#### Proposed solution

Name it and export it so the test imports the real value:

```ts
export const SESSION_LABEL = 'admin-session-v1';
const HMAC_ALG = 'sha256';
```

`admin.test.ts` imports `SESSION_LABEL` for its `expectedSession` mirror. The version suffix now has
an obvious home for the next bump.

#### Verification

`npm run test:unit -- admin` passes; changing `SESSION_LABEL` in source makes the test's derived
value track it automatically (the assertion still holds), while a *mismatched* hand-edit would now
fail.

---

### [P3][duplication] Web form actions `add`/`remove` are near-identical and diverge from the API on status

**File(s):** `web/src/routes/admin/+page.server.ts:110-125` — pinned at SHA f934d43

#### Problem

```ts
add: async ({ request, cookies }) => {
  requireAdmin(cookies);
  const form = await request.formData();
  const token = String(form.get('token') ?? '').trim();
  const result = await addToken(token);
  if (!result.ok) return fail(400, { error: result.error });
  return { success: true, message: `Added “${token}”` };
},
remove: async ({ request, cookies }) => { /* same, removeToken, “Removed …” */ },
```

Two responsibilities differ (which core fn, which verb in the message); everything else — auth, form
parse, `.trim()`, the `fail(400)` shape — is duplicated. Worse, both collapse *every* failure to
`fail(400)`, including the retryable CAS conflict that the JSON endpoint deliberately distinguishes
as `409` (`tokens/+server.ts:50-55`). So the two front doors disagree on the semantics of the same
underlying error, and a conflict is mislabeled as a client input error on the web path.

#### Proposed solution

Extract a shared action body:

```ts
async function tokenMutation(
  cookies: Cookies,
  request: Request,
  op: (t: string) => Promise<MutationResult>,
  verb: 'Added' | 'Removed',
);
```

and, once `MutationResult` carries `reason` (see the `mutationError` finding), map
`reason === 'conflict'` to `fail(409, ...)` here too so both doors agree.

#### Verification

`tests/admin.spec.ts` add/remove flows pass; add a case asserting a conflict surfaces distinctly.
`npm run check` clean.

---

### [P3][complexity] AdminConsole is an 868-line component mixing presentation, formatting utilities, clipboard, and modal state

**File(s):** `web/src/lib/components/admin/AdminConsole.svelte:1-867` — pinned at SHA f934d43

#### Problem

One component owns: prop contract + exported interfaces, login/add form handling, an in-flight busy
guard, clipboard-copy feedback state, a relative-time formatter, a usage-tooltip builder, the
overflow-modal open/close/backdrop logic, three action layouts, and ~490 lines of scoped CSS. That's
many independent concerns in a single file; the `<script>` alone spans `:31-161` before any markup.
It's hard to navigate ("where's the copy logic vs the menu logic?") and impossible to unit-test the
pure helpers without mounting the whole component.

#### Proposed solution

Peel off the parts that aren't about *this* component's rendering: move `timeAgo` and `usageDetail`
into a plain `web/src/lib/adminFormat.ts` (unit-testable, no DOM); extract the overflow modal into
its own child (`InviteMenu.svelte`) alongside the `InviteActions.svelte` from the triplication
finding. What remains is the console layout binding props to child components.

#### Verification

`npm run check` clean; `tests/admin.spec.ts` unchanged; new unit tests for `timeAgo`/`usageDetail`
in `adminFormat.test.ts` (`// @vitest-environment node`).

---

### [P3][maintainability] `timeAgo` relative-time formatter and its unit table are trapped inside the component, untested

**File(s):** `web/src/lib/components/admin/AdminConsole.svelte:99-118` — pinned at SHA f934d43

#### Problem

```ts
function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  ...
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000], ['month', 2_592_000], ...
  ];
  ...
}
```

This is general-purpose date logic with real edge cases (NaN fallback, unit thresholds, sign flip)
sitting in a presentational component where it can't be tested without a DOM mount, and can't be
reused by any other surface that shows a timestamp. There is no test covering the threshold
boundaries.

#### Proposed solution

Move to `web/src/lib/adminFormat.ts` (or a shared `web/src/lib/time.ts`) and cover the boundaries
directly (just-now, exactly 1 day, > 1 year, invalid ISO → `''`). See the extraction in the
"868-line component" finding.

#### Verification

New `timeAgo` unit test passes at each unit boundary; component still renders the same labels in
`tests/admin.spec.ts`.

---

### [P3][duplication] Copy-key string `\`${invite.token}:code\`` is rebuilt inline 12 times

**File(s):** `web/src/lib/components/admin/AdminConsole.svelte:282-321, 345-360` (12 occurrences) —
pinned at SHA f934d43

#### Problem

The per-cell copy-feedback key is assembled ad hoc everywhere it's needed:

```ts
class:copied={copied === `${invite.token}:code`}
onclick={() => copy(`${invite.token}:code`, invite.token)}
...
onclick={() => copy(`${invite.token}:url`, invite.url)}
```

The `${token}:code` / `${token}:url` convention is an implicit contract between the `class:copied`
check and the `copy()` call, restated 12 times across three layouts. A typo in one (`:codes`)
silently breaks only that cell's flash with no error.

#### Proposed solution

Give the key a single constructor and let `copy` distinguish by an enum:

```ts
const copyKey = (token: string, what: 'code' | 'url') => `${token}:${what}`;
```

or, cleaner, fold the flash key into the `InviteActions` extraction so the string never appears in
the template at all.

#### Verification

`grep -c ':code`' AdminConsole.svelte`drops to the single constructor.`tests/admin.spec.ts`
copy-feedback assertions pass.

---

### [P3][error-handling] `applySnapshot` conflates transport status, JSON parsing, and four pieces of UI state mutation

**File(s):** `web/src/routes/admin/native/+page.svelte:75-93` — pinned at SHA f934d43

#### Problem

```ts
async function applySnapshot(response: Response) {
  if (response.status === 401) { signOutLocally(...); return false; }
  const data = await response.json().catch(() => null);
  if (!response.ok || !isSnapshot(data)) {
    const text = responseError(data) ?? 'Something went wrong. Please try again.';
    if (authed) flash = {...}; else loginError = text;
    return false;
  }
  invites = data.invites; persistent = data.persistent; authed = true;
  return true;
}
```

One function decides auth-expiry policy, parses the body, branches error routing on whether the user
is `authed`, *and* commits four `$state` writes. The `if (authed) flash else loginError` routing
(which error surface to paint) is a UI concern tangled into what reads like a data-parsing helper,
and the function is called from three different contexts (onMount, login, mutate) that each have
different expectations of that routing.

#### Proposed solution

Split "parse a response into a result" from "apply a result to state". A pure
`parseSnapshot(response): Promise<{ ok: true; snapshot } | { ok: false; expired?: true; error: string }>`,
then a small caller that maps the result onto `invites/persistent/authed` and picks the error
surface. The 401→`signOutLocally` decision moves to the caller that knows the context.

#### Verification

`tests/admin.spec.ts` native flows (login, list, add, remove, expired-session) pass; the parse
function is independently unit-testable with fake `Response`s.

---

### [P4][readability] `snapshot()`'s optional `tokens?` param encodes a subtle read-after-write rule

**File(s):** `web/src/routes/api/admin/tokens/+server.ts:41-45` — pinned at SHA f934d43

#### Problem

```ts
async function snapshot(origin: string, tokens?: string[]) {
  const { tokens: current, persistent } = await getTokensStatus();
  const list = tokens ?? current;
  return json({ ok: true, tokens: list, invites: buildInvites(list, origin), persistent });
}
```

The function *always* reads `getTokensStatus()` (a full Blobs round-trip) but then throws away its
`tokens` when a caller passes the post-mutation list — the read exists only to obtain `persistent`.
The "use the caller's tokens but the fresh persistent flag" invariant is real and
correctness-relevant (read-after-write safety under eventual consistency, per the `:32-40` comment)
but it's expressed only as an optional positional param plus a `??`. A reader can't tell from the
signature why GET omits the arg and the mutations pass it, or that the read is half-wasted.

#### Proposed solution

Make the two intents explicit rather than overloading one param — e.g. a `persistenceFlag()` helper
that fetches only `persistent`, and have mutations build the snapshot from their known `tokens` +
that flag, while GET fetches both. Or rename to `snapshotFrom(origin, { tokens })` with a doc line
stating the read-after-write contract at the signature.

#### Verification

`npm run test:api:smoke` add/remove round-trip returns the mutated list; GET returns the live list.
Behavior identical.

---

### [P4][maintainability] Session cookie name, scope, and 10-year max-age are scattered inline

**File(s):** `web/src/routes/admin/+page.server.ts:28-38, 107` — pinned at SHA f934d43

#### Problem

`SESSION_COOKIE` and `SESSION_MAX_AGE` are named (good), but the cookie *options* —
`path: '/admin'`, `httpOnly`, `sameSite: 'strict'` — are spelled out at the `set` site (`:32-37`)
and the `path: '/admin'` is independently repeated at the `delete` site (`:107`). If the scope ever
changes, `set` and `delete` must stay in lockstep by hand or logout silently fails to clear the
cookie (a delete with a mismatched path is a no-op). The `60 * 60 * 24 * 365 * 10` arithmetic is
fine but the whole option bundle wants to be one constant.

#### Proposed solution

```ts
const SESSION_COOKIE_OPTS = { path: '/admin', httpOnly: true, sameSite: 'strict' } as const;
// set: cookies.set(SESSION_COOKIE, sessionToken(), { ...SESSION_COOKIE_OPTS, maxAge: SESSION_MAX_AGE });
// delete: cookies.delete(SESSION_COOKIE, { path: SESSION_COOKIE_OPTS.path });
```

#### Verification

`tests/admin.spec.ts` logout clears the session (login form reappears). Grep shows `'/admin'` cookie
path defined once.

---

### [P4][architecture] `persistent` defaults to `true` as a magic initial value in three unrelated spots

**File(s):** `web/src/routes/admin/+page.server.ts:68`,
`web/src/routes/admin/native/+page.svelte:18,28`,
`web/src/lib/components/admin/AdminConsole.svelte:52` (prop) — pinned at SHA f934d43

#### Problem

The unauthenticated web loader returns `persistent: true` (`+page.server.ts:67`), native page state
initializes `persistent = $state(true)` (`:18`) and resets it to `true` in `signOutLocally` (`:28`).
Three independent "assume durable until proven otherwise" defaults with a one-line comment only at
the loader. The choice (default *true* so the scary "Blobs unavailable" banner doesn't flash before
the first real read) is a genuine decision, but it's re-encoded as a bare literal in each place;
flip the intent in one and the surfaces disagree.

#### Proposed solution

Name it once — `const ASSUME_PERSISTENT = true` in the shared admin module (or a comment-anchored
constant on `AdminConsole`'s prop default) — and reference it from the three seed points, so the
rationale lives in one place.

#### Verification

`tests/admin.spec.ts` never shows the not-persistent banner on the login screen or before the first
snapshot. Behavior unchanged.

---

### [P4][readability] Bearer-header parsing uses inline magic strings in `requireSession`

**File(s):** `web/src/routes/api/admin/tokens/+server.ts:24-30` — pinned at SHA f934d43

#### Problem

```ts
const auth = request.headers.get('authorization') ?? '';
const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
```

`'Bearer '` appears twice (prefix test and slice length) and `'authorization'` is a bare header
name. The `slice('Bearer '.length)` idiom re-derives the prefix length from the literal, so the two
copies must stay identical. This is exactly the kind of auth-transport detail the API skill flags as
shared across doors, yet it lives as loose literals in one route.

#### Proposed solution

```ts
const BEARER_PREFIX = 'Bearer ';
export function bearerToken(request: Request): string {
  const auth = request.headers.get('authorization') ?? '';
  return auth.startsWith(BEARER_PREFIX) ? auth.slice(BEARER_PREFIX.length).trim() : '';
}
```

Place in `$lib/server/admin.ts` (or `http.ts`) so any future bearer endpoint shares it;
`requireSession` calls `verifySessionToken(bearerToken(request))`.

#### Verification

`npm run test:api:smoke` bearer-gate cases (valid, missing, malformed → 401) pass.

---

### [P4][type-safety] `removeToken` lacks the empty-input guard `addToken` has, and re-annotates the filter callback

**File(s):** `web/src/lib/server/tokens.ts:167-169, 182-192` — pinned at SHA f934d43

#### Problem

`addToken` rejects empty input up front (`:169`,
`if (!t) return { ok: false, error: 'Token cannot be empty' }`), but `removeToken` silently accepts
`''`/whitespace, runs a full read-modify cycle, finds no match, and returns `{ ok: true }`. The
asymmetry isn't wrong but is unexplained — a reader can't tell whether removing "" is intentionally
a no-op or an oversight. Separately, `list.filter((x: string) => x !== t)` (`:186`) carries a
redundant `: string` annotation (`list` is already `string[]`), a small inconsistency with the rest
of the module.

#### Proposed solution

Either add a symmetric early return for empty input in `removeToken` (documented as "nothing to
remove") or add a one-line comment stating the empty-remove no-op is intentional. Drop the redundant
`(x: string)` annotation.

#### Verification

`tokens.test.ts` `removeToken` no-op case still passes; `npm run check` clean.

---

### [P4][duplication] Native page reimplements session-state bookkeeping the cookie flow gets from the server

**File(s):** `web/src/routes/admin/native/+page.svelte:24-32` (`signOutLocally`) — pinned at SHA
f934d43

#### Problem

`signOutLocally` manually resets five reactive fields plus the admin-link visibility and clears
secure storage:

```ts
session = '';
authed = false;
invites = [];
persistent = true;
loginError = message;
setAdminLinkVisible(false);
void clearAdminSession();
```

This "what does a signed-out console look like" definition is the native mirror of what the web
loader's unauthenticated branch returns (`+page.server.ts:63-70`), but expressed as imperative field
resets that must be kept consistent with the initial `$state` declarations (`:15-22`) by hand. The
two lists have already drifted subtly (initial state sets `ready`/`flash`, sign-out doesn't touch
them — correct here, but nothing enforces it). It's easy to add a sixth session field and forget one
of the reset sites.

#### Proposed solution

Define one `signedOutState` object literal and assign from it in both the initial declarations and
`signOutLocally`, so "the empty session" is described once. Keep the side effects
(`setAdminLinkVisible`, `clearAdminSession`) explicit in `signOutLocally`.

#### Verification

`tests/admin.spec.ts` native sign-out returns to the login card with the link hidden;
expired-session (401) path still resets cleanly.

---

### [P5][readability] `secretMatches` name doesn't convey it's a constant-time compare, and its two callers restate the intent

**File(s):** `web/src/lib/server/admin.ts:29-45` — pinned at SHA f934d43

#### Problem

`secretMatches(provided, expected)` reads like an ordinary equality check; the constant-time
property — the entire reason the function exists rather than `a === b` — lives only in a comment
(`:26-28`). A future caller comparing something non-secret might reasonably reuse it (harmless) or,
worse, someone might "simplify" `verifySessionToken`/`verifyAdminSecret` to `===` not realizing the
timing guarantee is load-bearing (the server-api rule mandates `timingSafeEqual`). The two one-line
wrappers `verifyAdminSecret`/`verifySessionToken` (`:38-45`) add little beyond binding an env read.

#### Proposed solution

Rename to `constantTimeEqual` (states the guarantee in the name) so the property is visible at every
call site; keep the two verify wrappers but let their bodies read
`constantTimeEqual(key, env.ADMIN_ACCESS_TOKEN)`. No behavior change.

#### Verification

`admin.test.ts` (`secretMatches` describe block) updated to the new name and passes; grep confirms
no `===` comparison of secrets crept in.

---

That's 24 findings across the admin console + token backend scope.

## Source: Code audit — Routes / app shell / dev pages

### [P1][architecture] The drawing-page shell buries ~140 lines of imperative boot logic inline across three `onMount` and four `$effect` blocks

**File(s):** `web/src/routes/+page.svelte:37-175` (app shell) — pinned at SHA f934d43

#### Problem

`+page.svelte` is the composition root, but its `<script>` mixes composition with a large, unnamed
boot sequence: orientation reactivity (37-41), the app-surface flag (48-51), deferred SW
registration (57-60), Parent Center latching (74-78), the overlay idle-mount pump (80-104), and a
second `onMount` (106-175) that alone does token capture, theme re-stamp, key/folder hydration,
durable-storage recovery, context-menu blocking, wake lock, fullscreen seeding, and PWA/install
init. The boot order is expressed only by block position and long prose comments; there is no named
`boot()` entry point to grep for, and the meaning lives in comments rather than function names. This
is the single biggest maintainability liability in scope.

#### Proposed solution

Extract cohesive units into a `web/src/lib/boot/` module of named, testable `.ts` helpers that the
shell calls in an explicit order, e.g. `installWakeLock(): () => void`,
`installContextMenuGuard(): () => void`, `hydratePersistedState(): void` (wraps
`hydrateApiKey`/`hydrateSaveFolder`/`hydrateDurableStorage`), and
`initWebOnlyServices(): () => void` (PWA + install). The shell's `onMount` then reads as a short
checklist of named calls whose return values are the teardown functions, so the ordering is
self-documenting and each piece is unit-testable in isolation.

#### Verification

`npm run check` + `npm test` stay green; the drawing route still boots (engine accepts strokes, wake
lock requested on first pointerdown, overlays mount at idle). Diff should show the `<script>`
shrinking to imports + composition + a short ordered boot list; grep for the new helper names to
confirm the sequence is now discoverable.

---

### [P1][platform-branching] Web-only PWA code is gated by runtime `isNative()` where a build-time `__IS_CAPACITOR__` branch would tree-shake it out of the native bundle

**File(s):** `web/src/routes/+page.svelte:57-60, 163-167` (app shell);
`web/src/lib/platform.ts:9-11` — pinned at SHA f934d43

#### Problem

`web/src/CLAUDE.md` and the root CLAUDE.md both state the convention: prefer the compile-time
`__IS_CAPACITOR__` constant over a runtime `isNative()` for platform branches, because `isNative()`
"alone can't tree-shake." Two web-only paths violate this:

```js
if (canvasState.strokeCount < STROKES_BEFORE_SW_REGISTER) return;
if (!isNative()) registerDeferredServiceWorker();   // line 59
...
if (!isNative()) {
  teardownPWAUpdates = initPWAUpdates();
  initInstallPrompt();                                // lines 164-167
}
```

Because the guard is a runtime call, the native build still bundles `registerDeferredServiceWorker`,
`initPWAUpdates`, and `initInstallPrompt` (and their imports) even though they can never run there —
dead weight in the Capacitor bundle, and a runtime branch that could be a build-time one.

#### Proposed solution

Replace `!isNative()` with `!__IS_CAPACITOR__` on these purely web-vs-native gates so Rollup drops
the branch and its imports from the native build. Keep `isNative()` only where the distinction is
genuinely runtime (e.g. `@capacitor/core` loaded on the web). Confirm the imports (`initPWAUpdates`,
`initInstallPrompt`, `registerDeferredServiceWorker`) are reachable only through these guards so
they eliminate cleanly.

#### Verification

`CAPACITOR=true npm run build:cap` and inspect the output/chunk graph to confirm the PWA/install
modules no longer appear in the native bundle; web build (`npm run build`) still registers the SW
after `STROKES_BEFORE_SW_REGISTER`. `npm run check` green.

---

### [P1][maintainability] The `app.html` pre-paint boot script re-hardcodes every persisted `localStorage` key, the boolean-setting list, and the scale clamp — kept in sync only by a comment

**File(s):** `web/src/app.html:75-121` (inline boot IIFE); mirrors
`web/src/lib/state/settings.svelte.ts:14-122` — pinned at SHA f934d43

#### Problem

The first-paint script duplicates, as vanilla-JS string literals, the exact keys and bounds that
`settings.svelte.ts` defines as named constants: `splotch-action-button-scale`,
`splotch-advanced-controls`, `splotch-drawer-open`, `splotch-stroke-width-control`,
`splotch-eraser-enabled`, `splotch-coloring-book-enabled`, `splotch-screenshot-enabled`,
`splotch-undo-button-enabled`, `splotch-brush-type`, `splotch-theme`, plus the `70`/`130`/`100`
clamp (settings exports these as `ACTION_BUTTON_SCALE_MIN/MAX/DEFAULT`). The only guard is the
comment "keep them in sync." A rename or added `BOOL_SETTINGS` entry in the TS module silently
breaks first-paint for returning users with no compile-time or test failure — the script just stamps
the wrong (or no) attribute and the UI flashes a default before hydration corrects it.

#### Proposed solution

Since `app.html` can't import TS, close the gap with a test rather than trusting the comment: add a
unit test that reads `app.html`, extracts the `splotch-*` string literals and the numeric clamp from
the boot IIFE, and asserts each key exists in `settings.svelte.ts`'s constant set and the bounds
equal `ACTION_BUTTON_SCALE_MIN/MAX`. (This mirrors the existing `securityHeaders.test.ts` guard that
keeps the `netlify.toml` header copy honest — ADR-0073.) Optionally generate the key list into a
placeholder the template substitutes at build time.

#### Verification

New test fails if you rename a key in `settings.svelte.ts` without updating `app.html`. `npm test`
green with both in sync.

---

### [P2][complexity] The overlay idle-mount pump (recursive `mountNext` + `stopped` flag + queue-by-length) is intricate inline logic that belongs in a named helper

**File(s):** `web/src/routes/+page.svelte:80-104` (app shell) — pinned at SHA f934d43

#### Problem

The first `onMount` hand-rolls a staged mounter: it dynamically imports `bootHiddenOverlays`, builds
a `queue`, and drives a recursion (`mountNext`) that appends `queue[overlays.length]` per idle
callback, guarded by a `stopped` flag because "the cancel handle scheduleIdle returns can't reach
the async import().then continuation." Indexing the queue by `overlays.length` couples the loop's
progress to render state, and the cancellation is a bespoke closure flag. This is real machinery
(perf-motivated, per the comments) but it sits raw in the shell.

#### Proposed solution

Extract to `web/src/lib/boot/mountOverlaysAtIdle.ts`:
`export function mountOverlaysAtIdle(onParentCenter: (c: Component) => void, pushOverlay: (c: Component) => void): () => void`
that owns the import, the queue, the idle recursion, and returns a single cancel function (setting
the internal `stopped` flag). The shell then calls it in `onMount` and returns its canceler — the
intricate part is named and independently testable.

#### Verification

Unit-test the helper with a fake `scheduleIdle` to assert one overlay per tick and that the returned
canceler halts further mounts. In-app, overlays still appear one-per-idle and unmount cleanly on
navigation.

---

### [P2][complexity] `$effect` bodies use bare member-access statements purely to register reactive dependencies — a fragile, non-obvious pattern

**File(s):** `web/src/routes/+page.svelte:37-41` (app shell) — pinned at SHA f934d43

#### Problem

```js
$effect(() => {
  settings.lockRotationEnabled;
  settings.forceLandscapeOrientation;
  applyDeviceOrientationPreference();
});
```

The first two lines are expression statements with no effect other than tripping Svelte's dependency
tracker, because `applyDeviceOrientationPreference()` reads the settings internally and wouldn't
otherwise re-run the effect. This is brittle: a reader (or a `no-unused-expressions` lint pass, or a
"cleanup" commit) can delete the two bare reads and silently break reactivity, with no test catching
it. The dependency is invisible at the call site.

#### Proposed solution

Make the dependency explicit and load-bearing: either have `applyDeviceOrientationPreference(prefs)`
take the two settings as arguments (so reading them is what produces the value passed in), or
compute
`const orientationPrefs = $derived([settings.lockRotationEnabled, settings.forceLandscapeOrientation])`
and reference `orientationPrefs` in the effect. Same for any other effect using this pattern.

#### Verification

Toggling lock-rotation / force-landscape in Parent Center still re-applies orientation. Removing the
argument/derived would now be a type error rather than a silent reactivity loss.

---

### [P2][architecture] Wake-lock lifecycle (request/re-request/teardown) is inlined in `onMount` and should be a self-contained helper

**File(s):** `web/src/routes/+page.svelte:137-154, 169-174` (app shell) — pinned at SHA f934d43

#### Problem

The screen wake-lock — a `WakeLockSentinel | null`, `requestWakeLock()`, a
`pointerdown … {once:true}` acquirer, a `visibilitychange` re-acquirer, and their removals in the
teardown — is a complete, reusable concern threaded through the middle of the omnibus `onMount`. It
shares the block with unrelated context-menu blocking, fullscreen seeding, and PWA init, and its
teardown lines (170-173) are physically separated from its setup. The `'screen'` sentinel string and
the re-request-on-visible rule are buried.

#### Proposed solution

Extract `web/src/lib/boot/wakeLock.ts` exporting `installWakeLock(): () => void` that owns the
sentinel, listeners, and re-request-on-visibility, and returns the teardown. The shell calls
`const teardownWakeLock = installWakeLock()` and includes it in the cleanup return.

#### Verification

On a device/browser supporting the Wake Lock API, the lock is acquired on first pointerdown and
re-acquired after tab-hide/show; navigating away removes both listeners. Unit-test the helper
against a mocked `navigator.wakeLock`.

---

### [P2][maintainability] `hooks.server.ts` `handle` mixes CORS and security-header concerns and repeats the header-copy loop

**File(s):** `web/src/hooks.server.ts:20-46, 57-68` — pinned at SHA f934d43

#### Problem

The single `handle` does two unrelated jobs — CORS for `/api/*` (preflight + response headers) and
stamping `SECURITY_HEADERS` onto non-API SSR responses — and both use the same open-coded pattern:

```js
for (const [key, value] of Object.entries(corsHeaders())) response.headers.set(key, value);
...
for (const [key, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(key, value);
```

`corsHeaders()` is also called twice per preflight-adjacent request, re-allocating the object each
time. As more cross-cutting response logic accretes, one monolithic `handle` gets harder to reason
about.

#### Proposed solution

Split into two named handles — `handleCors` and `handleSecurityHeaders` — composed with SvelteKit's
`sequence()` from `@sveltejs/kit/hooks`, each single-responsibility. Factor the repeated loop into a
local `applyHeaders(response, headers)` helper, and hoist the CORS header object to a module-level
`const` (it's static) instead of a per-call factory.

#### Verification

`npm run test:api:smoke` and `securityHeaders.test.ts` still pass; a preflight `OPTIONS /api/*`
returns 204 with CORS headers, `/admin` SSR responses still carry the full security set, and
CDN/prerendered responses are untouched.

---

### [P3][architecture] The `/dev/*` harnesses have no index and inconsistent chrome — only `ai-timer` has a Breadcrumb; there is no discoverable landing page

**File(s):** `web/src/routes/dev/ai-timer/+page.svelte:92`,
`web/src/routes/dev/design/+page.svelte:48-67`, `web/src/routes/dev/engine/+page.svelte:242-246` —
pinned at SHA f934d43

#### Problem

There is no `/dev` route listing the harnesses, so their existence is only discoverable by reading
`+page.ts` files or knowing the URLs. Their navigation is also inconsistent: `ai-timer` renders
`<Breadcrumb current="AI Timer" />`, `design` has a bespoke `<header>` with no link back to the app
or to sibling harnesses, and `engine` is a bare fixed canvas (defensible — it's a Playwright target
— but a maintainer landing there has no way out). A new contributor can't answer "what dev tools
exist" without grepping.

#### Proposed solution

Add `web/src/routes/dev/+page.svelte` (gated by the same `requireDevHarness()` in its `+page.ts`)
that links to `/dev/design`, `/dev/engine`, `/dev/ai-timer` with one-line descriptions, and give
`design` the shared `<Breadcrumb current="Design tokens" />` for consistency with `ai-timer` (leave
`engine` bare and note why in a comment, since it's an automated harness). Register the index in the
`architecture` skill's route table.

#### Verification

Visiting `/dev` in `vite dev` lists all harnesses; each page has a consistent way home; the route
still 404s in production (`requireDevHarness`). `npm run check` green.

---

### [P3][maintainability] `ai-timer` comments reference `.js` filenames for modules that are `.ts`, contradicting the TypeScript-everywhere convention

**File(s):** `web/src/routes/dev/ai-timer/+page.svelte:20-22` — pinned at SHA f934d43

#### Problem

```js
// We drive AiImageResult.svelte through the exact ui.svelte.js seam the real
// generate flow uses (see src/lib/drawing/aiImage.js): open in the loading
```

The seam is `ui.svelte.ts` and the module is `src/lib/drawing/aiImage.ts` (line 53 of the same file
correctly says `aiImage.ts`). These stale `.js` references are misleading in a repo whose CLAUDE.md
mandates "No plain `.js` source files in `src/`" — a reader may grep for a non-existent file.

#### Proposed solution

Correct the two comment references to `ui.svelte.ts` and `src/lib/drawing/aiImage.ts`.

#### Verification

Grep `dev/ai-timer/+page.svelte` for `.js` returns nothing; the referenced `.ts` files exist.

---

### [P3][naming] `parentCenterWanted` is a one-way latch driven by an `$effect` that writes state — an obscure idiom for "mount on first open"

**File(s):** `web/src/routes/+page.svelte:74-78, 191-193` (app shell) — pinned at SHA f934d43

#### Problem

```js
let parentCenterWanted = $state(false);
$effect(() => {
  if (ui.parentCenterOpen) parentCenterWanted = true;
});
```

An `$effect` whose sole job is to latch another piece of `$state` to `true` and never reset it is a
subtle pattern (state-writing effects are usually a smell), and the name `parentCenterWanted`
doesn't convey "has ever been opened, so keep it mounted." The intent — "mount ParentCenter
permanently after its first open" — is only clear from the surrounding comment.

#### Proposed solution

Rename to `parentCenterEverOpened` (or `parentCenterMounted`) to state the latch's meaning, and
consider replacing the effect with a plain handler at the open site, or a small
`latch(() => ui.parentCenterOpen)` helper that encapsulates the never-reset semantics, so the
write-in-effect isn't open-coded in the shell.

#### Verification

Parent Center still mounts on first tap and stays mounted across subsequent close/open cycles; the
name now reads as the latch it is.

---

### [P3][type-safety] `ai-timer` uses `0` as a sentinel for "no pending timeout" instead of `null`

**File(s):** `web/src/routes/dev/ai-timer/+page.svelte:26, 29-34, 42` — pinned at SHA f934d43

#### Problem

```js
let pending: ReturnType<typeof setTimeout> | 0 = 0; // setTimeout id for the scheduled "finish"
```

`ReturnType<typeof setTimeout>` is `number` in the browser, and `0` is a valid-looking (falsy)
member of that type, so the union `| 0` and the `if (pending)` truthiness check conflate "no timer"
with "a timer whose id is 0." It works only because browser timer ids are positive, an
implementation detail. The idiomatic sentinel is `null`.

#### Proposed solution

`let pending: ReturnType<typeof setTimeout> | null = null;`, guard with `if (pending !== null)`, and
reset to `null`. Removes the reliance on timer-id truthiness.

#### Verification

Play → the scheduled finish still fires; Reset/replay cancels a pending timer; `npm run check`
green.

---

### [P3][maintainability] The `privacy` page hardcodes a full palette of hex colors instead of design tokens, opting out of the token system

**File(s):** `web/src/routes/privacy/+page.svelte:131-225` (`<style>`) — pinned at SHA f934d43

#### Problem

The page hardcodes `#f5f5f5`, `#2b2b33`, `#7c4dcf` (×3), `#6c6c76`, `#6b3fa0`, `#f7f2fd`, `#eadcfa`,
`white`, while inconsistently using `var(--brand)` for the `h1`. Some hardcodes carry contrast
justifications (the `#7c4dcf` link comment), but the page as a whole bypasses `lib/design/tokens` —
the `design` skill's stated source of truth — so a palette change to the token set silently skips
this route, and light/dark theming can't reach it (it's pinned light). It's the one user-facing
route in scope that ignores the token vocabulary.

#### Proposed solution

Map these to design tokens where an equivalent exists (surface/text/brand-text/border tokens),
keeping a hardcoded value only where a documented contrast requirement forces it — and in that case
reference the token it deviates from in the comment (as `Breadcrumb.svelte` does). If the page is
intentionally always-light legal chrome, state that decision once at the top of the `<style>` and
derive the few colors from a small local constant set rather than scattering literals.

#### Verification

Visual check of `/privacy` unchanged; grep for raw hex in the file drops to only the
contrast-justified exceptions; flipping the design tokens now visibly affects the page (or the
always-light decision is documented).

---

### [P3][duplication] Error-log prefix strings (`[client error]`, `[server error]`, `[render error]`) are magic literals scattered across three files with no shared source

**File(s):** `web/src/hooks.client.ts:7`, `web/src/hooks.server.ts:53`,
`web/src/routes/+layout.svelte:28` — pinned at SHA f934d43

#### Problem

The three uncaught-error sinks each invent their own `console.error` prefix as an inline string.
They form a de-facto logging taxonomy (client vs server vs render-boundary) but nothing ties them
together, so the set can drift (e.g. someone adds a fourth path with `[error]`), and there's no
single place to see or change the convention. The user-facing message `'Something went wrong.'` is
likewise duplicated in both hooks.

#### Proposed solution

Introduce a tiny `web/src/lib/errorLog.ts` exporting the prefixes (or a `logUncaught(scope, ...)`
helper) and the shared fallback message string, and have all three sinks use it. Keeps the taxonomy
in one grep-able place.

#### Verification

All three paths still log with their scope prefix; grep for the literals shows a single definition
site. `npm run check` green.

---

### [P3][maintainability] `ai-timer` re-hardcodes the AI failure-mode copy that lives in `aiImage.ts`, so the two can drift

**File(s):** `web/src/routes/dev/ai-timer/+page.svelte:60-62` — pinned at SHA f934d43

#### Problem

```js
const triggerSafety = () => fail("Let's try drawing something else!", 'safety');
const triggerTimeout = () => fail("That's taking too long — please try again.", 'retry');
```

The comment promises these "mirror exactly what src/lib/drawing/aiImage.ts passes to
failAiGeneration()," but the strings are copied by hand. If production copy changes, the harness
silently previews stale text — defeating the harness's purpose of reviewing the real error UI.

#### Proposed solution

Export the canonical failure messages from `aiImage.ts` (or a shared `aiMessages.ts`) as named
constants and import them in both the production flow and the harness, so the harness renders
exactly the shipping copy.

#### Verification

Changing a message constant updates both the app and `/dev/ai-timer` with no second edit; grep shows
the strings defined once.

---

### [P4][readability] The shell's two separate `onMount` blocks have no ordering rationale and could confuse teardown reasoning

**File(s):** `web/src/routes/+page.svelte:80-104, 106-175` (app shell) — pinned at SHA f934d43

#### Problem

Two adjacent `onMount` callbacks run in registration order, but nothing signals why overlay-mounting
is a separate mount from the rest of boot, or that their cleanups are independent. A reader must
know Svelte's mount-ordering semantics to reason about sequence, and splitting boot across two
mounts makes "what runs at startup, in what order" harder to trace than a single ordered entry.

#### Proposed solution

After the P1 extraction, collapse to one `onMount` that calls the named boot helpers in explicit
order and returns a combined teardown, or, if two are kept, add a one-line comment on each stating
why it's separate (e.g. "overlay pump is isolated so its cancel flag can't entangle the main
teardown").

#### Verification

Boot behavior unchanged; the startup sequence is readable top-to-bottom in one place.

---

### [P4][naming] `EFFECTIVE_DATE` is displayed under the label "Last updated" — the constant name and the UI text describe different concepts

**File(s):** `web/src/routes/privacy/+page.svelte:9, 27` — pinned at SHA f934d43

#### Problem

```js
const EFFECTIVE_DATE = 'July 16, 2026';
...
<p class="updated">Last updated: {EFFECTIVE_DATE}</p>
```

"Effective date" and "last updated" are distinct legal concepts; naming the constant one thing and
labeling it the other invites confusion about which date this is meant to be, and the bump
instruction in the header comment says "Bump EFFECTIVE_DATE whenever the wording changes" — i.e.
it's really a last-updated date.

#### Proposed solution

Rename the constant to `LAST_UPDATED` (matching the label and the bump semantics), or change the
label to "Effective date" — pick the one that reflects the intended legal meaning and make name +
label agree.

#### Verification

Name and rendered label match; header comment references the same term.

---

### [P4][complexity] `ai-timer` hotkey bindings are duplicated between the `onKeyDown` switch and the on-screen hint text

**File(s):** `web/src/routes/dev/ai-timer/+page.svelte:72-81, 129-134` — pinned at SHA f934d43

#### Problem

The key→action mapping exists twice: as an `if/else if` chain over `'p'/'f'/'s'/'e'/'t'/'r'` (72-81)
and as hand-written `<kbd>` hints (129-134). Adding or renaming a hotkey requires editing both, and
they can silently disagree.

#### Proposed solution

Define one `const HOTKEYS: { key: string; label: string; run: () => void }[]` and drive both the
handler (look up by `e.key.toLowerCase()`) and the rendered hint (`{#each HOTKEYS …}`) from it.

#### Verification

Every listed hotkey works and every working hotkey is listed, from a single array; adding one
updates both surfaces.

---

### [P4][platform-branching] `app.html` seeds `data-app-surface` with a runtime `location.pathname === '/'` check that duplicates the `/`-page effect and hardcodes the route string

**File(s):** `web/src/app.html:95`; duplicated by `web/src/routes/+page.svelte:48-51` — pinned at
SHA f934d43

#### Problem

```js
el.toggleAttribute('data-app-surface', location.pathname === '/');
```

The immersive-surface flag is set in three places with the drawing route's path expressed as the
bare literal `'/'`: the boot script (app.html), the `/` page's mount effect (sets it), and its
cleanup (removes it on nav away). The seed logic and the page logic must agree on which path is the
app surface, but the coupling is only the shared `'/'` literal and prose comments. A future change
to the drawing route's path would need edits in both files with no compile-time link.

#### Proposed solution

This is inherently split (inline vanilla JS vs component), so at minimum name the route once — e.g.
a documented `DRAWING_ROUTE = '/'` constant referenced by the page effect — and extend the app.html
sync test proposed in the P1 app.html finding to assert the boot script's path literal matches it.

#### Verification

The app-surface locks apply from first paint only on `/`, and the test fails if the page's route
constant and the boot script's literal diverge.

---

### [P4][type-safety] The engine harness types its public API seam as `Record<string, unknown>`, discarding the real engine signatures at the test boundary

**File(s):** `web/src/routes/dev/engine/+page.svelte:28-33, 60` (app shell wiring for the harness) —
pinned at SHA f934d43

#### Problem

```js
interface EngineHarnessWindow {
  __engineState: { canUndo: boolean; canvasEmpty: boolean };
  __engine: Record<string, unknown>;
  __engineReady: boolean;
}
```

`__engine` is assigned a rich object of typed engine functions (`setColor`, `exportCanvasBlob`,
`strokeSync`, …) but typed as `Record<string, unknown>`, so nothing checks that the harness exposes
what the Playwright spec expects, and the spec sees `unknown`. A rename in `engine.ts` won't surface
here.

#### Proposed solution

Type `__engine` as the actual assigned shape — e.g. `typeof engineApi` where `engineApi` is a named
`const` object, or an explicit interface listing the exposed methods — so the seam is checked
against the engine's real exports. This also documents the harness contract.

#### Verification

`npm run check` flags a mismatch if an exposed method's signature changes; the engine Playwright
spec still drives the harness.

---

### [P4][maintainability] CORS allowed-methods/headers are inline magic strings that must track the actual `/api` surface

**File(s):** `web/src/hooks.server.ts:57-67` — pinned at SHA f934d43

#### Problem

`corsHeaders()` hardcodes `'GET, POST, DELETE, OPTIONS'` and
`'Content-Type, Authorization, X-Access-Token, X-Api-Key'`. These are the public CORS contract for
every `/api` route, but they live as bare strings with no link to the endpoints or auth headers they
enable; adding an endpoint method or a new auth header requires remembering to edit this literal,
and there's no test asserting the smoke-tested endpoints are covered.

#### Proposed solution

Hoist to named module constants (`CORS_METHODS`, `CORS_HEADERS`) with a comment tying each header to
its consumer (already partially present), and consider asserting in `test:api:smoke` that the
methods list covers the endpoints it exercises.

#### Verification

`npm run test:api:smoke` green; the CORS contract is defined once as named constants.

---

### [P4][consistency] The engine harness uses `onDestroy` + a top-level `window` read, against the repo's `$effect`-cleanup convention for teardown

**File(s):** `web/src/routes/dev/engine/+page.svelte:33, 237-239` — pinned at SHA f934d43

#### Problem

`.claude/rules/svelte.md` explicitly warns that `onDestroy` (and top-level component init) also run
during SSR and can throw `ReferenceError: window is not defined`, and directs teardown into an
`$effect` cleanup. This page reads `const win = window as …` at top-level script (line 33) and tears
down via `onDestroy` (237-239). It's safe *today* only because `+page.ts` sets `ssr = false` — a
non-local invariant. If someone re-enables SSR for the harness (or another page imports this
component), it breaks in exactly the way the rule describes.

#### Proposed solution

Move `engine?.teardown()` into an `$effect` cleanup (`$effect(() => () => engine?.teardown())`) and
guard/relocate the `window` cast so the component follows the documented SSR-safe pattern regardless
of the route's `ssr` flag; or add an inline comment pinning the `ssr = false` dependency at the
`window` read.

#### Verification

Harness still tears the engine down on navigation; the component no longer relies on `ssr = false`
for correctness (or the dependency is documented). Playwright engine spec passes.

---

### [P5][readability] `+error.svelte` and both `handleError` hooks produce a `{ message }` that nothing ever displays

**File(s):** `web/src/routes/+error.svelte:1-7`, `web/src/hooks.client.ts:6-9`,
`web/src/hooks.server.ts:52-55` — pinned at SHA f934d43

#### Problem

Both hooks return `{ message: 'Something went wrong.' }` (the `App.Error` shape), but
`+error.svelte` renders `<ErrorScreen />` with no props and `ErrorScreen` shows its own hardcoded
"Something went wrong. Let's start a fresh drawing." So the returned `message` is dead data —
computed and typed but never surfaced. A reader reasonably assumes the hook message reaches the UI;
it doesn't.

#### Proposed solution

Either drop the message payload to a comment noting the UI copy is intentionally fixed in
`ErrorScreen`, or wire `page.error?.message` into `ErrorScreen` via a prop so the returned value is
actually used. Pick one so the data flow isn't misleading.

#### Verification

Trigger a load/nav error → `/error` renders; confirm whether the message is shown or intentionally
ignored, and that the code reflects that decision.

---

### [P5][type-safety] `app.d.ts` leaves `App.Error`, `Locals`, `PageData`, `PageState` as commented-out stubs while a concrete error shape is already in use

**File(s):** `web/src/app.d.ts:4-7` — pinned at SHA f934d43

#### Problem

The `App.Error` interface is left commented (defaulting to `{ message: string }`), yet both hooks
return exactly that shape and could return a richer one (e.g. an error id). Leaving the namespace as
default-stub is fine functionally but means the app's error contract isn't declared where SvelteKit
expects it, and a future richer error object would be untyped until someone remembers this file.

#### Proposed solution

Declare `interface Error { message: string }` explicitly (documenting the contract the hooks
satisfy) and remove the other stubs if genuinely unused, so the file states what's intentional
rather than leaving four commented placeholders.

#### Verification

`npm run check` green; the hooks' return types are checked against the declared `App.Error`.

---

### [P5][readability] Font-warm and wake-lock rely on unnamed magic strings (`'1em "Quicksand Variable"'`, `'screen'`)

**File(s):** `web/src/routes/+layout.svelte:23`, `web/src/routes/+page.svelte:143` — pinned at SHA
f934d43

#### Problem

The layout warms the font with the literal `document.fonts.load('1em "Quicksand Variable"')` — the
family name is duplicated from the `@fontsource` import and the CSS `font-family` with no shared
constant, so a font swap must find all copies. Similarly `navigator.wakeLock.request('screen')` uses
the bare API string. Minor, but these are the kind of literals that silently rot.

#### Proposed solution

Export the font-family string as a constant from a shared module (or derive the warm string from it)
so the family is named once; leave `'screen'` as-is or a local `const WAKE_LOCK_TYPE = 'screen'` if
the wake-lock extraction (P2) lands.

#### Verification

Font still warms at boot (Quicksand ready before the first text dialog); grep for the family string
shows a single source.

---

That is 26 findings. The highest-leverage work is the three P1s: decomposing the `+page.svelte` boot
sprawl into named helpers, converting the web-only `isNative()` gates to build-time
`__IS_CAPACITOR__` branches, and closing the untested `app.html` ↔ `settings.svelte.ts` duplication
with a guard test. The dev-harness section is generally solid but under-discovered (no `/dev` index)
and carries a few stale `.js` references and hand-copied strings; the `privacy` route is the one
user-facing page that opts out of the design-token system.

## Source: Code audit — Gestures / Svelte actions / native plugins

### [P1][complexity] Extract the drag-to-clear exit animation out of nested `scheduleReset` callbacks

**File(s):** `web/src/lib/actions/dragToClear.ts:207-235` (`onPointerUp`, commit branch) — pinned at
SHA f934d43

#### Problem

The successful-clear branch choreographs a multi-stage animation entirely in JS by mutating inline
styles inside three nested `scheduleReset` closures:

```ts
node.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
node.style.opacity = '0';
node.style.transform = 'scale(0.8)';
o.pageTurnOverlayEl.classList.add('animating');
scheduleReset(() => {
  stopDrawSound();
}, 300);
scheduleReset(() => {
  o.pageTurnOverlayEl.classList.remove('animating');
  o.containerEl.style.transform = '';
  node.classList.remove('dragging');
  node.style.transition = 'none';
  node.style.transform = 'scale(0.8)';
  scheduleReset(() => {
    o.containerEl.classList.remove('dragging-active');
    node.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    node.style.opacity = '1';
    node.style.transform = '';
  }, 50);
}, 600);
```

Timing (`300`/`600`/`50`), easing, opacity and scale values are all hard-coded and interleaved, so
the animation timeline can only be understood by mentally executing the nested timers. The
transition strings duplicate durations that must stay in sync with `app.css`, and reading the
sequence requires tracking which `node.style.*` is set/unset at each step.

#### Proposed solution

Move the choreography into CSS by toggling classes (`node.classList.add('clearing')`, a
`.clearing-done` state) and driving it with `transitionend`/CSS animations, as the codebase already
does for `pageTurnOverlayEl.animating` and `.clear-preview`. Extract the JS side into a single named
helper:

```ts
function playClearExit(node: HTMLButtonElement, o: DragToClearOptions): void;
```

that adds the class, schedules `stopDrawSound()`, and removes the classes on animation end — no
inline `style.transition`/`opacity`/`transform` string assignments. Keep only the audio timing in
JS.

#### Verification

`dragToClear.test.ts` already exercises the cancel path; add a commit-path test asserting `onClear`
fires and that after the animation window the node's `dragging`/`clearing` classes are cleared. Run
`npm run test:unit -- dragToClear`. Visually verify the clear animation in `run-splotch` still
matches.

---

### [P1][duplication] `pinchTextZoom` reimplements the DOM-free pinch accumulator that `createPinchZoom` already provides

**File(s):** `web/src/lib/actions/pinchTextZoom.svelte.ts:43-114` vs
`web/src/lib/components/aiPreview.ts:91-160` — pinned at SHA f934d43

#### Problem

`pinchZoom.svelte.ts` correctly delegates all pointer bookkeeping to the tested, DOM-free
`createPinchZoom` accumulator (a `Map<number,Point>`, `rebase()` snapshotting base
transform/spread/count, and `spread()` via `Math.hypot`). `pinchTextZoom` hand-rolls the *same*
machinery again:

```ts
const points = new Map<number, { x: number; y: number }>();
let baseZoom = MIN_TEXT_ZOOM;
let baseSpread = 0;
function spread(): number {
  const [a, b] = [...points.values()];
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function rebase() {
  baseZoom = zoom;
  baseSpread = spread();
}
```

This is a second, parallel implementation of two-finger spread tracking and base re-snapshotting —
the exact concern `createPinchZoom` was factored out to own (its comment even says "The Svelte
action wires real PointerEvents to it"). Two copies drift independently and double the surface for
pointer-bookkeeping bugs.

#### Proposed solution

Extract the finger-spread/rebase core from `createPinchZoom` into a shared primitive, e.g.
`createSpreadTracker(): { down, move, up, spread, pointerCount, clear }` in `aiPreview.ts` (or a new
`$lib/gestures/`), and have both `createPinchZoom` and `pinchTextZoom` consume it. `pinchTextZoom`
then keeps only its `zoom`/`baseZoom` math (`nextTextZoom`) and drops its private `points` map and
`spread()`.

#### Verification

`pinchTextZoom.svelte.test.ts` (pure `nextTextZoom`/`clampTextZoom`) and `aiPreview.test.ts`
(`createPinchZoom`) both still pass. Add a tracker unit test.
`npm run test:unit -- pinch aiPreview`.

---

### [P1][naming] Name the drag-to-clear timing/animation magic numbers as constants

**File(s):** `web/src/lib/actions/dragToClear.ts:182-234` (`finishDrag`, `onPointerUp`) — pinned at
SHA f934d43

#### Problem

The file opens with a clean named-constants block (`HOLD_DURATION`, `MOVEMENT_THRESHOLD`, etc.), but
the teardown/animation code then hard-codes a second set of unnamed timings and transforms:

```ts
scheduleReset(() => { if (!isDragging) o.acceptZoneEl.style.display = 'none'; }, 250);
...
scheduleReset(() => { stopDrawSound(); }, 300);
scheduleReset(() => { ... }, 600);
scheduleReset(() => { ... }, 50);
node.style.transform = 'scale(0.8)';
```

`250`, `300`, `600`, `50`, and `0.8` are load-bearing (they must stay coordinated with the CSS
fly-out and page-turn durations) yet carry no name explaining what each governs, and the same
literal `scale(0.8)` appears twice. A future editor changing the page-turn CSS has no signal these
must move together.

#### Proposed solution

Add named constants beside the existing block, e.g. `ACCEPT_ZONE_HIDE_DELAY = 250`,
`DRAW_SOUND_STOP_DELAY = 300`, `PAGE_TURN_DURATION = 600`, `EXIT_SETTLE_DELAY = 50`,
`CLEAR_EXIT_SCALE = 0.8`, and reference them. Ideally fold into the CSS-class approach from the P1
complexity finding so timings live in one place.

#### Verification

Grep confirms no bare timing literals remain in the teardown path.
`npm run test:unit -- dragToClear` stays green.

---

### [P2][complexity] Split `dragToClear.onPointerDown` — it mixes multi-tap detection, hold timer, and accept-zone geometry

**File(s):** `web/src/lib/actions/dragToClear.ts:54-113` (`onPointerDown`) — pinned at SHA f934d43

#### Problem

`onPointerDown` is ~60 lines spanning four unrelated concerns: (1) multi-click/tutorial detection
(`clickCount`/`lastClickTime`), (2) hold-timer arming, (3) drag-state init + pointer capture, and
(4) computing and positioning the circular accept zone (`homeButtonCenter`, `radius`, five
`acceptZoneEl.style.*` writes, an rAF to add `.visible`). The reader must hold all four in mind at
once, and the accept-zone geometry block is the kind of self-contained unit that reads far better
named.

#### Proposed solution

Extract named helpers:

```ts
function registerTap(now: number, o: DragToClearOptions): boolean; // returns true if it triggered the tutorial (caller returns early)
function armAcceptZone(
  o: DragToClearOptions,
  center: { x: number; y: number },
  radius: number,
): void;
```

Leave `onPointerDown` as a short orchestration: tap check → hold timer → drag init →
`armAcceptZone`.

#### Verification

Existing `dragToClear.test.ts` cases (`commits the clear…`,
`does not let a second pointerdown restart…`) cover the behavior; they must stay green after the
extraction. `npm run test:unit -- dragToClear`.

---

### [P2][duplication] Extract the repeated distance-vs-threshold computation in `dragToClear`

**File(s):** `web/src/lib/actions/dragToClear.ts:133-138` (`onPointerMove`) and `198-203`
(`onPointerUp`) — pinned at SHA f934d43

#### Problem

Both handlers recompute the drag distance and the accept threshold with identical code:

```ts
const dx = clientX - startPointerX;
const dy = clientY - startPointerY;
const distance = Math.sqrt(dx * dx + dy * dy);
const threshold = getAcceptRadius();
```

The "have we crossed the accept radius?" test is the gesture's central predicate and is expressed
twice; a change to how distance is measured (e.g. squared-distance to drop the `sqrt`) must be made
in two places.

#### Proposed solution

Add a helper:

```ts
function dragDistance(clientX: number, clientY: number): number {
  return Math.hypot(clientX - startPointerX, clientY - startPointerY);
}
```

and use `dragDistance(...) >= getAcceptRadius()` at both call sites (also switching
`Math.sqrt(dx*dx+dy*dy)` to `Math.hypot`, matching the pinch actions).

#### Verification

`npm run test:unit -- dragToClear` — the commit and cancel-past-radius cases exercise both branches.

---

### [P2][duplication] Fold the duplicated post-drag cleanup in `onPointerCancel` / `onPointerUp` else-branch into one helper

**File(s):** `web/src/lib/actions/dragToClear.ts:236-266` — pinned at SHA f934d43

#### Problem

The non-commit exit is spelled out twice. `onPointerUp`'s else branch:

```ts
o.containerEl.classList.remove('dragging-active');
o.containerEl.style.transform = '';
node.classList.remove('dragging');
```

and `onPointerCancel` repeats those three plus a few more resets. `finishDrag` already exists as the
shared teardown, but these container/node resets live outside it, so the "undo the visible drag"
logic is split between `finishDrag` and each caller.

#### Proposed solution

Move the container/node visual reset (`dragging-active`, `containerEl.style.transform`,
`node.classList` and `node.style` clearing) into `finishDrag` (or a new `resetDragVisuals(o)` it
calls), so both the cancel path and the non-commit up path call one function. The commit path, which
animates instead, stays separate.

#### Verification

The `cancels a drag past the accept radius…` test asserts the full reset; keep it green.
`npm run test:unit -- dragToClear`.

---

### [P2][architecture] Unify the three near-identical ghost-click guards

**File(s):** `web/src/lib/actions/modalDialog.svelte.ts:82-88` (`onClick`),
`web/src/lib/actions/pinchTextZoom.svelte.ts:119-124` (`onClickCapture`),
`web/src/lib/actions/scribbleGuard.ts:60-62` (`click`) — pinned at SHA f934d43

#### Problem

Three actions independently implement the same "swallow the trailing synthesized click" pattern
documented in `svelte.md`, each with the `detail === 0` keyboard/AT carve-out and capture-phase
`preventDefault()`/`stopPropagation()`:

* modalDialog: swallow click if `detail !== 0` and inside a launch zone.
* pinchTextZoom: swallow one click after a two-finger pinch (`pinchedRecently`).
* scribbleTap: treat `detail === 0` as activation, ignore `detail >= 1`.

The `detail === 0 ⇒ keyboard/AT` rule is subtle and re-derived in each file, so a fix to that
heuristic must land in three places.

#### Proposed solution

Extract a small shared helper, e.g. `$lib/gestures/ghostClick.ts` exposing
`isSyntheticPointerClick(e: MouseEvent): boolean` (`e.detail !== 0`) and/or a
`swallowNextClick(node)` primitive, and have all three actions consume it. Even just centralizing
the `detail === 0` predicate removes the re-derivation.

#### Verification

`scribbleGuard.test.ts` (`activates on a keyboard/AT click (detail 0…)`) and pinch/modal behavior
must be unchanged. `npm run test:unit -- scribble pinch modal`.

---

### [P2][maintainability] Collapse the redundant `isDragging` + `activePointerId` drag-state pair

**File(s):** `web/src/lib/actions/dragToClear.ts:26-27, 77-78, 174-175, 194, 249` — pinned at SHA
f934d43

#### Problem

`isDragging` and `activePointerId` are two variables encoding one fact. They are always set and
cleared together (`isDragging = true; activePointerId = e.pointerId` on down;
`isDragging = false; activePointerId = null` in `finishDrag`), and every guard checks
`!isDragging || e.pointerId !== activePointerId`. Two sources of truth for one state invites them
drifting out of sync in a future edit.

#### Proposed solution

Drop `isDragging` and derive it: a drag is active iff `activePointerId !== null`. Replace
`isDragging` reads with `activePointerId !== null` (or a
`const isDragging = () => activePointerId !== null` accessor). The one nuance — `finishDrag`'s
deferred `if (!isDragging)` in the 250ms `scheduleReset` at line 183 — stays correct since
`activePointerId` is nulled synchronously in `finishDrag`.

#### Verification

`npm run test:unit -- dragToClear`; the `does not let a second pointerdown restart an active drag`
and different-pointer cases specifically exercise this guard.

---

### [P3][duplication] Extract a shared `capturePointer`/`releasePointer` wrapper for the repeated empty-catch capture calls

**File(s):** `web/src/lib/actions/dragToClear.ts:79-81,176-178`;
`web/src/lib/actions/pinchZoom.svelte.ts:60-62,79-81`;
`web/src/lib/actions/pinchTextZoom.svelte.ts:90-93,110-112` — pinned at SHA f934d43

#### Problem

All three gesture actions guard pointer capture the same way, with a silent empty catch:

```ts
try { node.setPointerCapture(e.pointerId); } catch {}
...
try { node.releasePointerCapture(e.pointerId); } catch {}
```

Six copies of the same swallow-the-throw idiom. Empty `catch {}` blocks are also a code smell (they
hide any unexpected error), and the reason capture can throw (a released/invalid pointer id) is
undocumented at each site.

#### Proposed solution

Add `$lib/gestures/pointerCapture.ts`:

```ts
export function capturePointer(node: Element, id: number): void {
  try {
    node.setPointerCapture(id);
  } catch {}
}
export function releasePointer(node: Element, id: number): void {
  try {
    node.releasePointerCapture(id);
  } catch {}
}
```

with a one-line comment on *why* it can throw, and call them from all three actions.

#### Verification

Actions behave identically. `npm run test:unit -- dragToClear pinch`; the pinch/drag tests stub
`setPointerCapture`/`releasePointerCapture` so they still assert the calls.

---

### [P3][type-safety] Share one `Origin`/point type instead of redefining `{x,y}` per action

**File(s):** `web/src/lib/actions/launchGuard.ts:41` (`Origin | null`) vs
`web/src/lib/actions/modalDialog.svelte.ts:40` (`origin?: { x: number; y: number } | null`); also
`pinchTextZoom.svelte.ts:43` and `aiPreview.ts:33` `Point` — pinned at SHA f934d43

#### Problem

`guardLaunchZone` takes `Origin | null`, but `modalDialog` declares its `origin` as an inline
`{ x: number; y: number } | null` and passes it straight in (`guardLaunchZone(o.origin ?? null)`).
It compiles only because the shapes coincide. The same `{x:number;y:number}` shape is also
independently spelled as `Point` (`aiPreview.ts`) and as an inline `{ x: number; y: number }` map
value in `pinchTextZoom`. Four spellings of one 2D-point concept.

#### Proposed solution

Have `modalDialog`'s `ModalOptions.origin` reference the same `Origin` type `guardLaunchZone`
consumes (import it), and reuse the existing `Point` type in `pinchTextZoom`'s pointer map.
Consolidate on a single exported point type.

#### Verification

`npm run check` (svelte-check) passes; no behavioral change.

---

### [P3][duplication] Collapse `launchGuard`'s two zone-pruning code paths

**File(s):** `web/src/lib/actions/launchGuard.ts:45,56-68,77-80` — pinned at SHA f934d43

#### Problem

Expired-zone pruning is implemented twice. `guardLaunchZone` calls `zones = liveZones()` (a
`filter(zone.expiresAt > now)`), while `isPointInLaunchZone` prunes inline with the opposite
comparison during its scan:

```ts
for (const zone of zones) {
  if (zone.expiresAt <= now) continue;
  surviving.push(zone);
  ...
}
zones = surviving;
```

Two expressions of "drop lapsed zones" (`> now` vs `<= now … continue`) that must stay logically
consistent.

#### Proposed solution

Keep a single `pruneZones()` (the `liveZones` filter) and call it at the top of both
`guardLaunchZone` and `isPointInLaunchZone`; let the hit-test loop just scan the already-pruned
array. Or drop `liveZones` and reuse the single-pass prune.

#### Verification

`launchGuard.test.ts` covers arm/expire/concurrent/clear; run `npm run test:unit -- launchGuard`.

---

### [P3][lifecycle] `dragToClear.destroy` leaves in-flight visual state on shared DOM

**File(s):** `web/src/lib/actions/dragToClear.ts:273-284` (`destroy`) — pinned at SHA f934d43

#### Problem

`destroy` removes listeners and clears timers/rAF, but does **not** undo any visual state the action
wrote to elements *outside* `node`. If the component unmounts mid-drag, these persist:

* `document.documentElement.style` `--clear-progress` (set on every move, line 143) is left non-zero
  on the global root.
* `o.containerEl.style.transform` / `.dragging-active` class remain applied.
* `o.acceptZoneEl` may be left `display:block`/`.visible`.

Because `--clear-progress` is on `documentElement` (explicitly "any element can read it"), a leaked
value can affect the next-mounted UI, not just the torn-down subtree.

#### Proposed solution

Have `destroy` call the shared reset (see the P2 cleanup finding) when a drag is active — reset
`--clear-progress` to `0`, clear `containerEl` transform/class, hide the accept zone — before
removing listeners.

#### Verification

Add a `dragToClear.test.ts` case: start a drag (`pointerdown` + `pointermove`), call
`action.destroy()`, assert `--clear-progress` is `0` and `containerEl` has no `dragging-active`
class. `npm run test:unit -- dragToClear`.

---

### [P3][maintainability] `dragToClear` mixes two timer-tracking mechanisms

**File(s):** `web/src/lib/actions/dragToClear.ts:32-48,279-282` — pinned at SHA f934d43

#### Problem

The action tracks pending timers two different ways: `holdTimer` and `acceptZoneFrame` as individual
nullable vars, and everything else through a `resetTimers` `Set` fed by `scheduleReset`. `destroy`
must therefore remember to clean up three separate things (`holdTimer`, `acceptZoneFrame`, and the
whole `resetTimers` set). A new timer added by a future editor is easy to forget in `destroy`, and
the split obscures which timers a given path owns.

#### Proposed solution

Route the hold timer through the same `scheduleReset` set (it's cleared on move/finish anyway, and
`destroy` already flushes the set), leaving only `acceptZoneFrame` special-cased for
`cancelAnimationFrame`. Or wrap both a timer-set and the rAF handle in one small `timers` object
with a single `clearAll()` that `destroy` and `finishDrag` call.

#### Verification

`npm run test:unit -- dragToClear`; the fake-timer cancel test asserts deferred callbacks
fire/cancel correctly.

---

### [P3][dead-code] `LaunchGuardOptions` (radius/duration) is never exercised in production

**File(s):** `web/src/lib/actions/launchGuard.ts:34-52`, consumed at
`web/src/lib/actions/modalDialog.svelte.ts:120` — pinned at SHA f934d43

#### Problem

`guardLaunchZone` accepts a `LaunchGuardOptions { radius?, durationMs? }`, but the only production
caller is `modalDialog`, which always calls `guardLaunchZone(o.origin ?? null)` with no options — so
`DEFAULT_RADIUS`/`DEFAULT_DURATION_MS` always win. The per-call override exists solely for
`launchGuard.test.ts`. That's speculative API surface: readers assume some modal tunes the zone, but
none does.

#### Proposed solution

Either (a) drop the `options` parameter and inline the two defaults (tests assert against the
defaults), or (b) if per-modal tuning is genuinely wanted, thread `radius`/`durationMs` through
`ModalOptions` so a real caller can set them. Prefer (a) until a caller needs it.

#### Verification

`launchGuard.test.ts` would need the option calls updated under (a).
`npm run test:unit -- launchGuard`; `npm run check`.

---

### [P3][type-safety] `initPencilEraser` swallows a rejected `addListener` promise

**File(s):** `web/src/lib/plugins/pencilEraser.ts:40-43` — pinned at SHA f934d43

#### Problem

```ts
PencilEraser.addListener('doubleTap', handleDoubleTap).then((h) => {
  if (removed) h.remove();
  else handle = h;
});
```

The `.then` has no `.catch`. If the native `addListener` bridge rejects (plugin not registered,
bridge not ready), it becomes an unhandled promise rejection with no diagnostic, and `handle`
silently stays `undefined` so the returned cleanup is a no-op. The floating promise is also the kind
of thing `no-floating-promises` lint targets.

#### Proposed solution

Add a `.catch` that records/logs the failure (or at least `.catch(() => {})` with a comment on why a
failed subscription is non-fatal off the happy path), and consider `void`-marking the floating
promise for lint clarity.

#### Verification

`pencilEraser.test.ts` covers the web-fallback happy path; add a case where `addListener` rejects
and assert `cleanup()` still doesn't throw. `npm run test:unit -- pencilEraser`.

---

### [P4][performance] `pinchTextZoom.spread()` allocates an array on every pointermove

**File(s):** `web/src/lib/actions/pinchTextZoom.svelte.ts:56-60,103` — pinned at SHA f934d43

#### Problem

```ts
function spread(): number {
  const [a, b] = [...points.values()];
  ...
}
```

`spread()` is called from `onPointerMove` on every move event during a pinch, and each call spreads
the map iterator into a fresh array just to read the first two entries — a per-frame allocation on
the hot gesture path.

#### Proposed solution

Iterate without materializing an array (grab the first two via the iterator directly), or, better,
get this for free by adopting the shared spread tracker from the P1 duplication finding. Minor on
its own; do it as part of that extraction.

#### Verification

Behavior unchanged; `npm run test:unit -- pinchTextZoom`. Optionally spot-check with the `profiling`
harness that pinch moves allocate less.

---

### [P4][readability] Repeated `e.preventDefault(); e.stopPropagation();` tail in every `dragToClear` handler

**File(s):** `web/src/lib/actions/dragToClear.ts:111-112,161-162,244-245,264-265` — pinned at SHA
f934d43

#### Problem

Each of the four pointer handlers ends with the same two-line
`e.preventDefault(); e.stopPropagation();`. It's noise repeated verbatim four times, and because
it's the *last* thing each handler does, an early `return` in a future edit silently skips it (the
multi-click early return at line 63-64 already does, which is intended but non-obvious).

#### Proposed solution

A tiny `function suppress(e: Event) { e.preventDefault(); e.stopPropagation(); }` used at each site
makes the intent named and the early-return exceptions visible by their absence.

#### Verification

Pure readability; `npm run test:unit -- dragToClear` unchanged.

---

### [P4][naming] `dragToClear` computes the button center by hand instead of using rect width/height

**File(s):** `web/src/lib/actions/dragToClear.ts:89-93` — pinned at SHA f934d43

#### Problem

```ts
const rect = node.getBoundingClientRect();
homeButtonCenter = {
  x: (rect.left + rect.right) / 2,
  y: (rect.top + rect.bottom) / 2,
};
```

The `(left+right)/2` / `(top+bottom)/2` form obscures that this is simply the rect center;
`rect.x + rect.width/2` reads as "center" at a glance and matches how `getAcceptRadius` reasons
about width/height.

#### Proposed solution

Use `{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }`, or a `rectCenter(rect)` helper if
reused.

#### Verification

Numerically identical; `npm run test:unit -- dragToClear`.

---

### [P4][architecture] `launchGuard` holds all dead zones in module-global mutable state

**File(s):** `web/src/lib/actions/launchGuard.ts:32` (`let zones: DeadZone[] = []`) — pinned at SHA
f934d43

#### Problem

`zones` is a module-level singleton mutated by
`guardLaunchZone`/`isPointInLaunchZone`/`clearLaunchZones`. It works because there is only ever one
modal-launch context, but module-global mutable state is easy to miss when reasoning about
lifecycle: every test must `clearLaunchZones()` in `beforeEach` (both test files do), and an
SSR/prerender import evaluates and retains this array. It also can't be reset per-action-instance.

#### Proposed solution

This is acceptable given the single-consumer design, so treat as a documentation/boundary note
rather than a rewrite: add a one-line comment stating the singleton is intentional (one global
launch context, `modalDialog` owns its lifecycle via `clearLaunchZones` on `close`). If multiple
independent guard contexts ever appear, promote to a `createLaunchGuard()` factory returning the
three functions closed over a private array.

#### Verification

No behavior change if documented; if factored, update both `modalDialog` and `launchGuard.test.ts`
and run `npm run test:unit -- launchGuard`.

---

### [P4][maintainability] `scheduleReset` returns an id that no caller uses

**File(s):** `web/src/lib/actions/dragToClear.ts:41-48` — pinned at SHA f934d43

#### Problem

```ts
function scheduleReset(fn: () => void, delay: number) {
  const id = setTimeout(...);
  resetTimers.add(id);
  return id;
}
```

Every call site (`scheduleReset(...)` at lines 182, 217, 221, 229) ignores the return value — the
whole point of `resetTimers` is that individual ids need not be tracked by callers. The `return id`
implies a caller might `clearTimeout` a specific reset, which never happens, and invites someone to
start doing so and bypass the set.

#### Proposed solution

Drop `return id` (make it `: void`). If a single reset ever needs individual cancellation, add that
deliberately.

#### Verification

`npm run check` (no unused-value change breaks); `npm run test:unit -- dragToClear`.

---

### [P4][readability] `pinchZoom.onPointerUp` runs even when the gesture is disabled

**File(s):** `web/src/lib/actions/pinchZoom.svelte.ts:77-84` — pinned at SHA f934d43

#### Problem

`onPointerDown` and `onPointerMove` both early-return on `!getOptions().enabled`, but `onPointerUp`
unconditionally calls `zoom.up(e.pointerId)`, `releasePointerCapture`, and
`apply(getOptions().target)`. When `enabled` is false the accumulator never received a matching
`down`, so `zoom.up` is a no-op-ish call, but the asymmetry (two guarded handlers, one unguarded)
reads as an oversight and forces the reader to confirm it's harmless. The `enabled` check is missing
where the other two have it.

#### Proposed solution

Either add the same `if (!getOptions().enabled) return;` guard for symmetry, or add a short comment
explaining `pointerup` is intentionally unguarded so a pointer that went down while enabled still
releases capture if `enabled` flips mid-gesture. Confirm which behavior is intended and make it
explicit.

#### Verification

`npm run test:unit` for pinch; visually confirm in `AiImageResult` that toggling `enabled` mid-pinch
releases capture correctly.

---

### [P5][readability] `scribbleGuard` reuses one `cancel` handler for three events without naming the shared listener options

**File(s):** `web/src/lib/actions/scribbleGuard.ts:17-34` — pinned at SHA f934d43

#### Problem

Minor: `addEventListener` uses `opts = { passive: false }` (correct, since `cancel` calls
`preventDefault`), but `removeEventListener` in `destroy` omits the options entirely. That's
harmless (the capture flag is the only field matched on removal, and it's `false` both times), yet
the asymmetry can read as a bug to someone auditing listener cleanup, since the more common footgun
is a *capture*-flag mismatch. There's also no test asserting the `passive:false`/preventDefault
contract holds under a passive default.

#### Proposed solution

Leave the code as-is (it's correct) but add a one-line comment that `removeEventListener` matches on
type + capture only, so omitting `passive` is intentional — pre-empting a "fix" that adds the
options back and implies they matter for removal.

#### Verification

`scribbleGuard.test.ts`'s `detaches on destroy` already proves removal works; no change needed
beyond the comment.

---

## Summary

22 findings across the gesture actions and native plugins. The concentration is in
**`dragToClear.ts`** (10 findings) — an 285-line action carrying a JS-choreographed exit animation,
two magic-number sets, a too-long `onPointerDown`, duplicated distance/cleanup logic, and redundant
drag-state — and in **cross-action duplication**: `pinchTextZoom` re-rolls the `createPinchZoom`
accumulator, three actions each hand-roll the same ghost-click guard, and six copies of the
empty-catch `setPointerCapture` idiom. `launchGuard` has doubled pruning logic and unused option
surface; `pencilEraser` floats an uncaught promise. `deviceLock.ts`, `pinchZoom.svelte.ts`, and
`modalDialog.svelte.ts` are largely clean (only minor notes). No code was changed — report only.

## Source: Code audit — Color palette & picker

### [P1][maintainability] Hand-computed responsive-trim ladders are a brittle wall of magic numbers

**File(s):** `web/src/lib/components/ColorPalette.svelte:271-433` (trim media queries) and
`web/src/lib/components/ColorPicker.svelte:210-370` (row/column trim ladders) — pinned at SHA
f934d43

#### Problem

Both components encode their responsive behavior as long hand-derived media-query tables whose
thresholds are computed in prose comments from geometry constants, e.g. `.color-palette` "A single
column holds N swatches when height ≥ 72·N + 12 (60px swatch + 12px gap, 24px padding)" then seven
`@media … max-width: 515.98px / 452.98px / …` steps, and ColorPicker's "r rows fit while 90vh ≥
51·r + 50 … stepping at ≈ (51r + 50) / 0.9". Every breakpoint (`515.98`, `452.98`, `674.98`,
`564.98`, …) is a manually evaluated formula. Changing a single input — swatch size `60px`, gap
`12px`, hexagon pitch `51px` — silently invalidates ~15-20 breakpoints that must all be re-derived
by hand, and nothing verifies the arithmetic. This is the single largest maintenance hazard in the
section.

#### Proposed solution

The CSS-only, no-JS-measurement approach is deliberate (ADR-0048) and shouldn't be abandoned, but
the ladder should be *generated*, not hand-maintained. Extract the geometry inputs (swatch size,
gap, padding, row pitch, `0.9` viewport factor) into named constants in a small `.ts` module and
emit the media-query blocks through the existing `gen:*` token/codegen pipeline (same pattern as
`gen:tokens`), so a size change regenerates every threshold. At minimum, add a unit-tested pure
function `trimBreakpoints(count, {swatch, gap, padding})` that returns the ladder, and reference its
output in a checked-in comment so drift is catchable.

#### Verification

`npm run gen:*` reproduces the current `.98px` thresholds exactly (byte-diff against this SHA); a
Vitest for `trimBreakpoints` pins the sequence. Manually bump `swatch` and confirm every media query
updates.

---

### [P2][duplication] Hex-normalize-and-parse logic is duplicated between `relativeLuminance` and `getRingColor`

**File(s):** `web/src/lib/colorRing.ts:3-14` and `:26-44` — pinned at SHA f934d43

#### Problem

Both functions open with byte-identical hex handling:

```ts
let hex = color.replace('#', '');
if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
const r = parseInt(hex.substr(0, 2), 16);
const g = parseInt(hex.substr(2, 2), 16);
const b = parseInt(hex.substr(4, 2), 16);
```

The 3→6 expansion and channel parse appear twice. A fix to one (e.g. validating input, supporting
`#rrggbbaa`) will drift from the other.

#### Proposed solution

Extract `function hexToRgb(color: string): { r: number; g: number; b: number }` at the top of
`colorRing.ts` and call it from both. `relativeLuminance` becomes a one-line weighted sum;
`getRingColor` destructures `{ r, g, b }`.

#### Verification

Existing `colorRing.test.ts` still passes unchanged (it exercises both functions and
shorthand/missing-hash cases). Add a direct `hexToRgb` unit test.

---

### [P2][duplication] `ringShadow` and `gradientRingShadow` differ only in whether the ring color is derived

**File(s):** `web/src/lib/components/ColorPalette.svelte:66-73` — pinned at SHA f934d43

#### Problem

```ts
function ringShadow(color: string) {
  const ringColor = getRingColor(color);
  return `0 0 0 0.5px var(--surface), 0 0 0 4.5px ${ringColor}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
}
function gradientRingShadow(color: string) {
  return `0 0 0 0.5px var(--surface), 0 0 0 4.5px ${color}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
}
```

The entire `box-shadow` template (`0.5px` seam, `4.5px` ring, drop shadow) is duplicated; only the
ring color source differs. A change to the ring geometry must be made in two places.

#### Proposed solution

Keep one builder: `function selectionRingShadow(ringColor: string): string`. Call sites pass
`getRingColor(shown)` for palette swatches and `colors.customColor` for the gradient swatch. Delete
`gradientRingShadow`.

#### Verification

Rendered `box-shadow` strings are identical to before for both an active palette swatch and a ringed
custom swatch; visual check in `/dev/design` or a running instance.

---

### [P2][design-tokens] Hardcoded shadow literals bypass the elevation tokens

**File(s):** `web/src/lib/components/ColorPalette.svelte:68, 72, 167, 184, 296` — pinned at SHA
f934d43

#### Problem

Multiple raw shadow literals sit in a component `<style>`/script that the design system says must
use tokens (`--shadow-sm`, `--float-shadow`, etc.): `0 4px 8px rgba(0, 0, 0, 0.2)` (twice, in the
ring builders), `.color-palette` `box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1)` (line 167),
`.color-swatch` `box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2)` (line 184), and the portrait override
`0 2px 10px rgba(0, 0, 0, 0.1)` (line 296). None of these are documented one-offs. `--shadow-sm` is
`0 2px 6px rgba(0,0,0,0.12)` — close enough that these swatch shadows likely should be tokens or a
new palette-specific token.

#### Proposed solution

Replace with `var(--shadow-sm)` / `var(--float-shadow)` where the value matches; if the swatch drop
shadow is intentionally distinct, mint one token (e.g. `--swatch-shadow`) in `tokens.ts` and
reference it from all four call sites plus the two ring builders. The ring builders can interpolate
`var(--swatch-shadow)` into the string.

#### Verification

`npm run lint:tokens` ratchet does not regress; `/dev/design` diff shows no visual change;
`gen:tokens:check` green.

---

### [P2][maintainability] Magic thresholds/factors in `getRingColor` (0.2, 38, 0.9) are unnamed

**File(s):** `web/src/lib/colorRing.ts:37-40` — pinned at SHA f934d43

#### Problem

```ts
const shift = relativeLuminance(color) < 0.2
  ? (v: number) => Math.min(255, Math.round(v + 38))
  : (v: number) => Math.max(0, Math.round(v * 0.9));
```

`0.2` (dark cutoff), `38` (lighten step), and `0.9` (darken factor) are the whole behavior of the
ring color and are undocumented magic numbers embedded mid-expression. The "~10% darker" intent
lives only in the file-header comment, far from the `0.9`.

#### Proposed solution

Name them: `const DARK_SWATCH_LUMINANCE = 0.2;`, `const LIGHTEN_STEP = 38;`,
`const DARKEN_FACTOR = 0.9;` at module top. The two shift closures then read self-documentingly.

#### Verification

`colorRing.test.ts` unchanged and green (it hard-codes the `+38` and `×0.9` results).

---

### [P2][maintainability] Deprecated `String.prototype.substr` used for channel slicing

**File(s):** `web/src/lib/colorRing.ts:10-12, 33-35` — pinned at SHA f934d43

#### Problem

`parseInt(hex.substr(0, 2), 16)` etc. `substr` is a deprecated (Annex B) API. In a "TypeScript
everywhere" codebase this is a latent lint/tooling flag and the wrong idiom to copy.

#### Proposed solution

Use `hex.slice(0, 2)`, `hex.slice(2, 4)`, `hex.slice(4, 6)`. Folds naturally into the `hexToRgb`
extraction above.

#### Verification

Same parse results; `colorRing.test.ts` passes.

---

### [P2][naming] `relativeLuminance` computes perceived brightness (BT.601 luma), not relative luminance

**File(s):** `web/src/lib/colorRing.ts:1-14` — pinned at SHA f934d43

#### Problem

The function is named `relativeLuminance` but its own comment says "Perceived brightness … ITU-R
BT.601 weights," and it applies `0.299/0.587/0.114` directly to raw 8-bit channels with no sRGB
linearization. WCAG *relative luminance* is a different quantity (BT.709 weights
`0.2126/0.7152/0.0722` over gamma-expanded channels). The name promises a standard metric the code
doesn't implement; a future contributor reaching for "relative luminance" for a contrast-ratio calc
will get wrong numbers. It's imported by `colors.svelte.ts` (`isDarkInk`) too, so the misnomer
propagates.

#### Proposed solution

Rename to `perceivedBrightness` (or `luma601`) and update the three importers (`isLightColor`,
`getRingColor`, `colors.svelte.ts` `isDarkInk`). Keep the comment. This is a mechanical rename with
clear grep coverage.

#### Verification

`rg 'relativeLuminance'` returns zero after rename; `npm run check` and the unit suites pass.

---

### [P2][maintainability] Special-case swatch colors are magic string literals in the picker markup

**File(s):** `web/src/lib/components/ColorPicker.svelte:155-157` — pinned at SHA f934d43

#### Problem

```svelte
class:border={hex === '#ffffff'}
class:border-dim={hex === '#1A1F24'}
class:selected={colors.customColor.toLowerCase() === hex.toLowerCase()}
```

`#ffffff` is literally `WHITE_INK` (already exported from `colors.svelte.ts`), and `#1A1F24` is the
darkest grey shade (defined once in `hexPickerLayout.ts:145`). Both are re-typed as bare literals
with no link back to their definitions, and the white check is case-sensitive (`=== '#ffffff'`)
while the grey ramp's white is coincidentally already lowercase — brittle. `rg '#1A1F24'` won't
connect the CSS-class trigger to the palette entry.

#### Proposed solution

Import `WHITE_INK` and add a named export for the dim-border color (e.g.
`PICKER_DIM_BORDER = '#1A1F24'`) in `hexPickerLayout.ts`; compare via a case-insensitive helper
(`isWhite(hex)` already exists in `colors.svelte.ts`). Reference those constants in the markup.

#### Verification

`rg "'#ffffff'|'#1A1F24'"` in `ColorPicker.svelte` returns nothing; the border/border-dim classes
still apply to the same two hexagons in a running picker.

---

### [P2][duplication] The hexagon `clip-path` polygon is duplicated verbatim

**File(s):** `web/src/lib/components/ColorPicker.svelte:377, 392` — pinned at SHA f934d43

#### Problem

`clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);` appears identically on
`.hexagon` and `.hexagon::after`. The hexagon shape is defined twice; changing the silhouette means
editing both, and the two can silently diverge (element clip vs. fill clip).

#### Proposed solution

Hoist to a custom property on `.picker` (or `:root`): `--hex-clip: polygon(...);` and use
`clip-path: var(--hex-clip)` in both rules. Pairs well with the `60px`/`69px`/`1.15` geometry
constants (next finding).

#### Verification

Both selectors resolve to the same polygon; hexagons render unchanged.

---

### [P3][maintainability] Hexagon geometry constants are scattered and coupled to a JS comment

**File(s):** `web/src/lib/components/ColorPicker.svelte:372-377` (CSS) and `:53-58` (JS comment) —
pinned at SHA f934d43

#### Problem

The hexagon is `width: 60px; height: 69px; /* height = width * 1.15 */`, and the snap logic's
comment (line 55) asserts "a hexagon's farthest edge point is ~35px from its center" and picks
`HEX_SNAP_RADIUS = 40` accordingly. The `35`/`40` in JS depend on the `60/69` in CSS, but the
coupling is only prose — resizing the hexagon in CSS silently makes the snap radius wrong with no
failing check.

#### Proposed solution

Define hex width/height as CSS custom properties (`--hex-w: 60px; --hex-h: 69px`) and derive
`HEX_SNAP_RADIUS` from a documented relation (e.g. read `--hex-w` or centralize the number next to
the size). At minimum move the geometry note to one place both sides cite.

#### Verification

Snap still resolves gap-hits in the E2E picker drag test; changing `--hex-w` visibly scales hexagons
via the single source.

---

### [P3][performance] `getRingColor` is recomputed 2-3× per active swatch in the template

**File(s):** `web/src/lib/components/ColorPalette.svelte:130-132` — pinned at SHA f934d43

#### Problem

For the active swatch the style string calls `ringShadow(shown)` (which internally calls
`getRingColor(shown)`) *and* separately `getRingColor(shown)` again for `--ring-color`:

```svelte
? `box-shadow: ${ringShadow(shown)}; --ring-color: ${getRingColor(shown)};`
```

So `getRingColor` (hex parse + luminance + per-channel math, itself re-parsing hex) runs at least
twice for the selected swatch on every reactive tick that touches this `{#each}`. Minor per-swatch,
but it's pure work recomputed needlessly.

#### Proposed solution

Compute the ring color once. Since only one swatch is active at a time, derive it near the
selection:
`const activeRingColor = $derived(getRingColor(themedSwatchColor(colors.activeSwatch, dark)))` and
reuse it for both `box-shadow` and `--ring-color`. Combined with the `selectionRingShadow`
extraction, the active swatch computes its ring color exactly once.

#### Verification

`box-shadow` and `--ring-color` still match; add a spy/count in a unit-ish harness or just confirm
identical rendered output.

---

### [P3][performance] Every swatch element is captured into `$state`, but only the custom swatch's ref is read

**File(s):** `web/src/lib/components/ColorPalette.svelte:23, 137, 85` — pinned at SHA f934d43

#### Problem

`let swatchEls = $state<Record<string, HTMLButtonElement>>({})` and every palette button does
`bind:this={swatchEls[hex]}` (line 137), but the only consumer is `selectCustomColor` reading
`swatchEls[CUSTOM_SWATCH]` (line 85). All ten color-swatch refs are stored into a reactive `$state`
record that nothing reads, causing needless proxy writes on mount/trim.

#### Proposed solution

Bind only the custom swatch: replace the record with a single
`let customSwatchEl: HTMLButtonElement | undefined` bound at line 153, drop the per-swatch
`bind:this` at line 137, and read `customSwatchEl` in `selectCustomColor`.

#### Verification

Opening the picker still anchors to the custom swatch center (`buttonCenter`); no other code
references `swatchEls` (`rg swatchEls`).

---

### [P3][maintainability] The `4.5px` selection-ring width is a magic number repeated across JS and CSS

**File(s):** `web/src/lib/components/ColorPalette.svelte:68, 72, 208, 211` — pinned at SHA f934d43

#### Problem

The ring width `4.5px` (and the coupled `-4.5px` inset) appears in `ringShadow`,
`gradientRingShadow`, `.color-swatch::before { inset: -4.5px; border: 4.5px … }`. These must move
together (the expand animation must land exactly on the box-shadow ring) but are four independent
literals. Same for the `0.5px` seam.

#### Proposed solution

Introduce `--selection-ring-width: 4.5px` (and `--selection-ring-seam: 0.5px`) as custom properties
on `.color-palette`; reference them in the CSS `::before` and interpolate into the JS shadow strings
via `calc`/`var` where possible, or read from a single JS constant `SELECTION_RING_WIDTH_PX` used by
both builders.

#### Verification

Confirm the animated ring still lands flush on the resting ring; grep shows one definition.

---

### [P3][design-tokens] Honeycomb offset `31px` and picker paddings are un-tokenized repeated literals

**File(s):** `web/src/lib/components/ColorPicker.svelte:237-330` (`margin-left: 31px` ~15×),
`:193-208` (`padding: 16px`, `margin-top: 15px/-15px/-18px`) — pinned at SHA f934d43

#### Problem

`margin-left: 31px` is restated in every trim breakpoint (the honeycomb interlock offset) — over a
dozen copies of the same magic number. The `16px` picker padding equals `--space-4`;
`15px`/`-15px`/`-18px` row overlaps are geometry literals with no name. Changing the honeycomb
offset means editing ~15 lines.

#### Proposed solution

Define `--hex-offset: 31px` (and `--hex-row-overlap`) on `.grid`/`.picker`, and use
`var(--hex-offset)` in every trim rule. Swap the `16px` padding for `var(--space-4)`.

#### Verification

`rg '31px' ColorPicker.svelte` collapses to one definition; honeycomb still interlocks at every
breakpoint; `lint:tokens` unaffected.

---

### [P3][type-safety] The hex-center record type is declared inline twice

**File(s):** `web/src/lib/components/ColorPicker.svelte:23, 61` — pinned at SHA f934d43

#### Problem

`{ color: string; cx: number; cy: number }[]` is written out for both the `hexCenters` field
(line 23) and `snapshotHexCenters`'s local (line 61). The shape is duplicated; a field rename must
touch both.

#### Proposed solution

Declare `interface HexCenter { color: string; cx: number; cy: number }` once and type
`hexCenters: HexCenter[] | null` and the accumulator against it.

#### Verification

`npm run check` passes; behavior unchanged.

---

### [P3][maintainability] `LANDSCAPE_ROWS` transpose keys off `COLOR_FAMILIES[0]` and assumes uniform shade counts

**File(s):** `web/src/lib/hexPickerLayout.ts:162-165` — pinned at SHA f934d43

#### Problem

```ts
export const LANDSCAPE_ROWS = COLOR_FAMILIES[0].shades.map((_, s) => ({
  key: `shade-${s + 1}`,
  colors: COLOR_FAMILIES.map((f) => f.shades[s]),
}));
```

The transpose is driven by the *first* family's shade count. If any family had a different length
(the interface comment only says "Every family has the same count" — nothing enforces it), the
shorter families produce `undefined` entries pushed into `colors: string[]`, typed as `string` but
actually `undefined`, and the picker renders `style="--color: undefined"` swatches with no type
error.

#### Proposed solution

Add a `SHADE_COUNT` constant and either validate
(`COLOR_FAMILIES.every(f => f.shades.length === SHADE_COUNT)` at module load, throwing in dev) or
type the family shades as a fixed-length tuple `[string, string, …]`. Build the transpose from
`SHADE_COUNT`.

#### Verification

`hexPickerLayout.test.ts` already checks 9×9 uniqueness; add an assertion that no `LANDSCAPE_ROWS`
color is `undefined`.

---

### [P3][naming] `9×9` grid dimensions are unnamed magic across the module

**File(s):** `web/src/lib/hexPickerLayout.ts:12-165` — pinned at SHA f934d43

#### Problem

The "9 families × 9 shades" invariant is asserted in the header comment and enforced only by the
literal shape of `COLOR_FAMILIES` and by the test. There is no `FAMILY_COUNT`/`SHADE_COUNT`
constant, so the r/c CSS trim classes in `ColorPicker.svelte` (`.r1..r9`, `.c1..c9`) are coupled to
a count that lives nowhere as a value.

#### Proposed solution

Export `SHADE_COUNT = 9` and `FAMILY_COUNT = COLOR_FAMILIES.length`; use `SHADE_COUNT` in the
transpose and reference the counts in the test instead of the literal `9`/`81`.

#### Verification

`hexPickerLayout.test.ts` derives `81` from `FAMILY_COUNT * SHADE_COUNT`; still green.

---

### [P3][maintainability] `data-trim-rank` numeric coupling between `TRIM_ORDER` and ~15 CSS selectors is invisible

**File(s):** `web/src/lib/components/ColorPalette.svelte:110, 129, 325-433` — pinned at SHA f934d43

#### Problem

`trimRank` maps each hex to its index in `TRIM_ORDER`, stamped as `data-trim-rank`, and the
stylesheet hard-codes `[data-trim-rank='3']` … `='9']` with prose comments naming the color ("rank
3: Red"). The mapping from array position → CSS selector → color name is triple-encoded and
drift-prone: reorder `TRIM_ORDER` (in the out-of-scope `colors.svelte.ts`) and every CSS comment
lies while selectors silently trim the wrong swatch. Nothing links them.

#### Proposed solution

This is inherent to the CSS-only trim, but the risk can be cut: generate the ranked selector blocks
from `TRIM_ORDER` via the codegen pipeline (same as finding P1), or at least add a unit test
asserting `TRIM_ORDER` order/labels so a reorder fails CI with a pointer to the CSS. Replace the
color-name comments with the computed label so they can't rot independently.

#### Verification

A `TRIM_ORDER`-ordering unit test pins Brown/Teal/Pink/Red/…; deliberately reordering fails it.

---

### [P3][maintainability] `#007bff` is an off-palette fallback color repeated in the picker CSS

**File(s):** `web/src/lib/components/ColorPicker.svelte:391, 447` — pinned at SHA f934d43

#### Problem

`background-color: var(--color, #007bff)` (line 391) and
`color-mix(in srgb, var(--color, #007bff), black 20%)` (line 447) fall back to a bootstrap-blue that
is in neither the palette nor the token set. `--color` is always set on `.hexagon` (line 159), so
the fallback is dead — but if it ever fired it would paint a foreign blue, and its presence twice
implies it's meaningful.

#### Proposed solution

Drop the fallback (`var(--color)`), since `--color` is guaranteed set; or if a defensive default is
wanted, use `transparent` (matching the base `.hexagon` background) rather than an arbitrary blue.
De-duplicate either way.

#### Verification

`rg '#007bff'` returns nothing; hexagons render identically (fallback never fired).

---

### [P4][maintainability] Inconsistent hex casing in `COLOR_FAMILIES` (greys use lowercase, rest uppercase)

**File(s):** `web/src/lib/hexPickerLayout.ts:137` (`#ffffff`) vs. the other 80 uppercase entries —
pinned at SHA f934d43

#### Problem

Every shade is uppercase except the greys family's `#ffffff` (and it's the value the picker compares
case-sensitively against at `ColorPicker.svelte:155`). Mixed casing makes `rg '#FFFFFF'` miss it and
invites case-sensitivity bugs like the white-border check.

#### Proposed solution

Normalize all `COLOR_FAMILIES` hexes to one case (uppercase, matching the majority) and make
consumers case-insensitive. The uniqueness test already lower-cases, so it won't catch this.

#### Verification

`hexPickerLayout.test.ts` still green; `rg '#[0-9a-f]{6}'` (lowercase) in the module returns only
intended entries.

---

### [P4][naming] `aria-label={shown === hex ? label : 'White'}` hardcodes the only themed label

**File(s):** `web/src/lib/components/ColorPalette.svelte:133` — pinned at SHA f934d43

#### Problem

The accessible label falls back to the literal `'White'` whenever the shown color differs from the
swatch identity — which today only happens for the Black→white dark-mode flip. The label is derived
from an implicit "the only themed swatch is black, and it becomes white" assumption. If another
swatch ever gets a themed variant (`themedSwatchColor`), the label silently says "White" for it.

#### Proposed solution

Drive the label from data: give the themed swatch an explicit alt-label (e.g. extend `PaletteColor`
with `darkLabel`, or compute from `WHITE_INK`). At minimum comment the coupling and reference
`WHITE_INK` instead of the string `'White'`.

#### Verification

Dark-mode a11y snapshot still labels the black swatch "White"; a second themed swatch would get a
correct label.

---

### [P4][architecture] `$effect` that syncs `activeColor` from theme is derived state written imperatively

**File(s):** `web/src/lib/components/ColorPalette.svelte:35-39` — pinned at SHA f934d43

#### Problem

```svelte
$effect(() => {
  if (colors.activeSwatch === BLACK_INK) {
    colors.activeColor = themedSwatchColor(BLACK_INK, dark);
  }
});
```

This is an effect whose only job is to keep one piece of shared state (`activeColor`) in sync with
another (`activeSwatch` + theme) — a classic "derived-as-effect" smell. It lives in a component but
mutates the shared `colors` module, so the invariant "Black paints white on dark paper" is enforced
only while `ColorPalette` is mounted, and re-runs write on every `dark` toggle.

#### Proposed solution

Model `activeColor` as a `$derived`/getter in `colors.svelte.ts` (out of scope to implement there,
but flag it): the paint color is a pure function of `activeSwatch`, `customColor`, and theme. The
component would then not need the effect. Note in the finding for the App-state agent.

#### Verification

Toggling OS theme while Black is selected still repaints ink white↔black with the effect removed; no
component owns the invariant.

---

### [P4][maintainability] `isLightColor` threshold `0.5` is an unnamed magic number

**File(s):** `web/src/lib/colorRing.ts:18-20` — pinned at SHA f934d43

#### Problem

`return relativeLuminance(color) >= 0.5;` — the light/dark decision boundary is a bare literal with
no name, sitting next to `getRingColor`'s separate `0.2` cutoff (finding P2). Two different
luminance thresholds in one file, both unnamed, invite confusion about which governs what.

#### Proposed solution

`const LIGHT_COLOR_LUMINANCE = 0.5;` at module top; reference it. Keeps it visually distinct from
`DARK_SWATCH_LUMINANCE`.

#### Verification

`isLightColor` behavior unchanged; both thresholds now grep-able and named.

---

### [P4][readability] BT.601 luma weights are inline magic numbers

**File(s):** `web/src/lib/colorRing.ts:13` — pinned at SHA f934d43

#### Problem

`return (0.299 * r + 0.587 * g + 0.114 * b) / 255;` — the three weights are documented in the header
comment but embedded as literals in the expression. Lower severity because the comment names the
standard, but a named tuple would make the standard self-evident at the call site and prevent typo
drift (e.g. someone "fixing" one weight).

#### Proposed solution

`const LUMA_WEIGHTS = { r: 0.299, g: 0.587, b: 0.114 } as const;` and dot the channels. Optional but
tidies the one computational line.

#### Verification

Identical numeric output; `colorRing.test.ts` green.

---

### [P4][readability] `--pop-scale: 1.12` and its `calc(100% / var(--pop-scale))` sizing math is opaque

**File(s):** `web/src/lib/components/ColorPalette.svelte:240, 256-257, 268` — pinned at SHA f934d43

#### Problem

The gradient swatch's selection-pop uses `--pop-scale: 1.12` with resting size
`calc(100% / var(--pop-scale))` so the popped cluster lands on the content box. The reasoning is in
a long comment (lines 245-250) but `1.12` itself is an unexplained constant, and the inverse-scale
trick reads as clever-but-obscure inline geometry.

#### Proposed solution

Keep the mechanism but name the intent: comment `1.12` as "selection pop overshoot, matches
round-swatch ring band" and consider deriving it from the ring width so the "same white band"
invariant (its stated goal, issue #310) is enforced rather than eyeballed.

#### Verification

Ringed hexagon cluster still shows the same white band width as a ringed round swatch in both
themes.

---

That is 27 findings. The dominant structural issue is the two hand-maintained CSS trim ladders (P1);
the highest-value quick wins are the `colorRing.ts` hex-parse/`substr`/magic-number cleanup and the
`ringShadow`/`gradientRingShadow` + clip-path de-duplication.

## Source: Code audit — Storage / persistence

### [P2][architecture] No central storage-key registry — every persisted key is a magic string scattered across modules and re-declared in tests

**File(s):** `web/src/lib/storage.ts:21-25, 96-161` (the `read*/write*` helpers + `managedKeys`) —
pinned at SHA f934d43

#### Problem

`storage.ts` owns persistence but owns none of the key names. Every key is a `splotch-*` string
literal declared in a caller (`settings.svelte.ts:14-43`, `tool.svelte.ts:35`,
`strokeWidth.svelte.ts:15-16`, `install.svelte.ts:17-18`, `folderSave.ts:27`,
`secureStorage.ts:23-27`) and then re-declared, verbatim, in each store's test and in
`storage.restore.integration.test.ts:50-52`, `startup-bundle.spec.ts:23`, `flows.spec.ts`. The
task's "grepability" bar — "can a newcomer find every storage key and what's persisted?" — fails:
the only enumeration of persisted keys is the runtime `managedKeys` Set (line 21), which is empty
until code runs. There is no single source of truth listing what Splotch writes to localStorage.

#### Proposed solution

Add an exported key registry in `storage.ts` (the persistence owner), e.g.:

```ts
export const STORAGE_KEYS = {
  soundEnabled: 'splotch-sound-enabled',
  brushType: 'splotch-brush-type',
  penSize: 'splotch-stroke-width-size',
  // …every persisted key, with a one-line comment on what it holds
} as const;
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
```

Type `read*/write*/removeKey`'s `key` param as `StorageKey`. Callers and tests import the constant
instead of re-typing the literal. This makes the registry the one grep target and turns a typo'd key
into a compile error.

#### Verification

`grep -rn "splotch-" web/src --include=*.ts | grep -v STORAGE_KEYS` returns only the registry;
`npm run check` passes with `read*` keys constrained to `StorageKey`.

---

### [P2][architecture] `managedKeys` is populated as an implicit side effect of the first read/write — durable restore silently depends on import ordering

**File(s):** `web/src/lib/storage.ts:18-25, 169-201` (`track`, `managedKeys`,
`hydrateDurableStorage`) — pinned at SHA f934d43

#### Problem

The set of keys the durable layer restores is built by `track(key)` firing inside every
`read*/write*` call (lines 97, 107, 115, 124, 133, 145, 155). The comment (lines 18-20) concedes the
fragility: *"State stores read their keys at init (before hydrate runs), so this set is complete by
then."* So correctness of native eviction-recovery depends on every persisted key being touched, at
least once, before `hydrateDurableStorage()` runs. A key that is only ever *written conditionally*
(never read at module init) is absent from `managedKeys` and silently will not be restored after a
WebView eviction — with no test able to catch it, because the whole mechanism is data-driven by call
history. `storage.restore.integration.test.ts` exists precisely because this coupling is invisible.

#### Proposed solution

Make the key set explicit rather than observed: derive `managedKeys` from the `STORAGE_KEYS`
registry proposed above (all keys are known statically), and drop `track()` from the hot read/write
path. `hydrateDurableStorage` then iterates the declared registry, not an accumulated Set, removing
the "must be touched before hydrate" invariant entirely.

#### Verification

Remove a store's module-init read; the integration test should still restore its key. After the fix,
restoration is independent of whether the key was read at boot.

---

### [P2][error-handling] `lazyIdbDatabase` memoizes a rejected open promise forever — one transient IndexedDB failure disables persistence for the whole session

**File(s):** `web/src/lib/idb.ts:9-21` (`lazyIdbDatabase`) — pinned at SHA f934d43

#### Problem

```ts
let dbPromise: Promise<import('idb').IDBPDatabase> | null = null;
return () => {
  if (!dbPromise) {
    dbPromise = import('idb').then(({ openDB }) => openDB(...));
  }
  return dbPromise;
};
```

`if (!dbPromise)` treats a *rejected* promise as present (a rejected promise is truthy), so a
one-time `openDB` failure — a transient error, a locked DB during an upgrade, a private-mode hiccup
— is cached and every later call replays the same rejection. This contradicts the deliberate
recover-on-rejection pattern used everywhere else in the same storage layer:
`secureStorage.ts:60-63` nulls `masterKeyPromise` on catch, and `settings.svelte.ts:302-313` nulls
`folderSaveModule` on a failed import. `idb.ts` is the shared foundation for both `secureStorage`
and `folderSave`, so this is the least resilient link backing the most.

#### Proposed solution

Null the memo on rejection so the next call retries:

```ts
dbPromise = import('idb')
  .then(({ openDB }) => openDB(dbName, version, { upgrade(db) { … } }))
  .catch((err) => { dbPromise = null; throw err; });
```

#### Verification

Unit test: make the mocked `openDB` reject once then succeed; assert the second `getDb()` call
resolves. Mirrors the existing "a failed creation is not memoized" test in
`secureStorage.test.ts:117-123`.

---

### [P2][complexity] `hydrateDurableStorage` bundles concurrency orchestration, two-way reconciliation, and store-notification in one function

**File(s):** `web/src/lib/storage.ts:169-201` (`hydrateDurableStorage`) — pinned at SHA f934d43

#### Problem

One function does four separable jobs: (1) gate on native + lazy-load Preferences, (2) fan out
concurrent `Preferences.get` across all keys, (3) a per-key reconciliation loop that both *restores*
localStorage-from-durable and *back-fills* durable-from-localStorage in the same `forEach` with two
branches (lines 179-188), and (4) fire the restore callbacks (lines 197-199). The dual-direction
branch inside the loop is the hard part to read — `restored` tracks only the restore direction while
the backfill quietly mutates the durable store and is deliberately not reported. This is the
"serialization + IO + migration in one function" smell the audit targets.

#### Proposed solution

Extract the per-key decision into a named pure-ish helper and keep the outer function as
orchestration:

```ts
type Reconciliation = { restore?: string; backup?: string };
function reconcile(local: string | null, durable: string | null): Reconciliation;
```

Then the loop reads: `const { restore, backup } = reconcile(local, value);` with restore applied to
`localStorage.setItem` and backup pushed to the `Preferences.set` batch. Move callback-firing to its
own `notifyRestore()` call. The two directions become individually testable.

#### Verification

Unit-test `reconcile()` directly for all four cases (both present, local-only, durable-only,
neither). Existing `storage.test.ts` hydrate tests still pass unchanged.

---

### [P2][type-safety] The secure-storage object store holds two incompatible value shapes under `any` — a `CryptoKey` and `{ iv, data }` payloads with no discriminant

**File(s):** `web/src/lib/secureStorage.ts:67-108` (`loadOrCreateMasterKey`, `webSave`, `webLoad`) —
pinned at SHA f934d43

#### Problem

The single `secrets` store keeps the raw non-extractable `CryptoKey` under `MASTER_KEY_ROW` *and*
every secret as `{ iv, data }` under its name. `idb`'s `db.get` returns `any`, so
`const existing = await db.get(STORE, MASTER_KEY_ROW)` (line 68) is untyped and `record.iv` /
`record.data` (line 103) are unchecked property accesses on `any`. Nothing at compile time stops a
future edit from reading a payload row as a key or vice versa, and the stored payload shape has no
named type despite being the app's on-disk secret format.

#### Proposed solution

Introduce named types and a schema-typed DB:

```ts
interface SecretPayload {
  iv: Uint8Array;
  data: ArrayBuffer;
}
interface SecureDB extends DBSchema {
  secrets: { key: string; value: CryptoKey | SecretPayload };
}
```

Pass the schema through `lazyIdbDatabase<SecureDB>` (see the idb generic finding) and narrow with a
helper (`isSecretPayload(v)`) before decrypt. Even without the schema, declaring `SecretPayload` and
annotating `webSave`/`webLoad` removes the silent `any`.

#### Verification

`npm run check`; grep for `record.iv`/`record.data` and confirm they resolve to `SecretPayload`, not
`any`.

---

### [P3][duplication] The `getPrefs().then(...).catch()` native-Preferences pattern is hand-copied three times

**File(s):** `web/src/lib/storage.ts:88-94, 133-142, 169-189` (`mirror`, `removeKey`,
`hydrateDurableStorage`) — pinned at SHA f934d43

#### Problem

The `__IS_CAPACITOR__ && isNative()` → `getPrefs().then(({ Preferences }) => …).catch(() => {})`
shape appears in `mirror` (set), `removeKey` (remove), and `hydrateDurableStorage` (get/set). Three
copies of the same guard + lazy-load + swallow. Adding a new durable operation means copying the
boilerplate a fourth time.

#### Proposed solution

Extract a single fire-and-forget dispatcher:

```ts
function durable(op: (p: typeof import('@capacitor/preferences').Preferences) => Promise<unknown>) {
  if (__IS_CAPACITOR__ && isNative()) {
    getPrefs().then(({ Preferences }) => op(Preferences)).catch(() => {});
  }
}
```

`mirror` becomes `durable((P) => P.set({ key, value }))`; `removeKey`'s native arm becomes
`durable((P) => P.remove({ key }))`. `hydrateDurableStorage` still needs the awaited variant but can
share the guard.

#### Verification

`storage.test.ts`'s mirror/remove/hydrate suites pass unchanged; the `__IS_CAPACITOR__` guard still
tree-shakes on web (check the web bundle has no `@capacitor/preferences` chunk).

---

### [P3][duplication] `saveSecret` / `loadSecret` / `clearSecret` triplicate the native-vs-web dispatch

**File(s):** `web/src/lib/secureStorage.ts:121-159` — pinned at SHA f934d43

#### Problem

All three functions share the identical skeleton: browser guard, `__IS_CAPACITOR__ && isNative()`
branch, `getPlugin()` + `SecureStorage.<op>` on native, `web<Op>` on web. The only per-function
difference is which method runs. Three copies of the plugin-load + branch means a change to the
native seam (e.g. a plugin API rename) touches three sites.

#### Proposed solution

A single backend selector:

```ts
type SecureBackend = {
  set(name: string, value: string): Promise<void>;
  get(name: string): Promise<string | null>;
  remove(name: string): Promise<void>;
};
async function backend(): Promise<SecureBackend> {/* returns native or web impl */}
```

`saveSecret`/`loadSecret`/`clearSecret` keep only their guard + error policy and delegate to
`(await backend()).set/get/remove`.

#### Verification

`secureStorage.test.ts` round-trip, clear, and race tests pass unchanged.

---

### [P3][error-handling] `loadSecret` and `webLoad` collapse every failure into `null` — a decrypt/plugin error is indistinguishable from "no key stored"

**File(s):** `web/src/lib/secureStorage.ts:97-108` (`webLoad`), `131-144` (`loadSecret`) — pinned at
SHA f934d43

#### Problem

`webLoad` catches a failed `crypto.subtle.decrypt` and returns `null` (line 105-107); `loadSecret`
wraps everything in a `try { … } catch { return null }` (line 141-143), with no log on either. So a
corrupt payload, a rotated master key, a Keychain error, or a genuinely-absent secret all surface
identically as "no credential." For the parent's API key / admin session that means a silent,
unexplained logout with zero diagnostic trail. The comment "master key missing/rotated or payload
corrupt — treat as no value" acknowledges lumping distinct failures together.

#### Proposed solution

Keep the null-return contract (callers rely on it) but distinguish *absent* from *failed*: return
`null` only when `db.get` yields no record; on a decrypt/plugin throw, `console.warn` (once) before
returning null so the failure is observable. Optionally return a discriminated `{ ok: false }` for
callers that could prompt a re-entry. At minimum, add the warn so a wiped-credential incident is
debuggable.

#### Verification

Unit test: store a payload, then swap the master key row; assert `loadApiKey()` returns null *and* a
warning was logged (spy on `console.warn`).

---

### [P3][architecture] `lazyIdbDatabase` exposes a `version` param but its `upgrade` handler can never migrate — the versioning is decorative

**File(s):** `web/src/lib/idb.ts:4-21` — pinned at SHA f934d43

#### Problem

```ts
export function lazyIdbDatabase(dbName, storeName, version = 1) { …
  openDB(dbName, version, { upgrade(db) {
    if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
  }});
```

The signature advertises a `version` knob, but `upgrade` ignores
`oldVersion`/`newVersion`/`transaction` and only ever creates one store idempotently. A caller that
bumps `version` to add a store or migrate data has no hook to do so — the abstraction promises
schema versioning it doesn't deliver. Both current callers pin `version` at 1
(`secureStorage.ts:28`, `folderSave.ts:24`), so the parameter is presently inert but misleading.

#### Proposed solution

Either (a) drop the `version` param and hardcode `1` until a real migration is needed, documenting
that the store is single-version; or (b) accept an `upgrade` callback so callers own their
migration: `lazyIdbDatabase(dbName, version, upgrade: (db, oldV, newV, tx) => void)`. Given YAGNI,
(a) is the honest choice now.

#### Verification

`npm run check`; both callers still open their single store; a code reader can no longer assume
version bumps migrate.

---

### [P3][type-safety] `lazyIdbDatabase` returns an unparameterized `IDBPDatabase`, forcing `any` on every consumer

**File(s):** `web/src/lib/idb.ts:4-8` (return type), consumed at `secureStorage.ts:68,94,99` and
`folderSave.ts:53,63,111` — pinned at SHA f934d43

#### Problem

The factory returns `() => Promise<import('idb').IDBPDatabase>` with no `DBSchema` generic, so
`db.get`/`db.put`/`db.delete` are all `any` at every call site. That `any` is the root of the
secure-storage payload type weakness (separate finding) and the untyped `FileSystemDirectoryHandle`
round-trip in folderSave — the store contents are entirely unchecked.

#### Proposed solution

Add a schema type param threaded to `openDB`:

```ts
export function lazyIdbDatabase<S extends import('idb').DBSchema>(
  dbName: string,
  storeName: string & keyof S,
  version?: number,
): () => Promise<import('idb').IDBPDatabase<S>>;
```

`secureStorage` passes `SecureDB`, `folderSave` passes a
`{ handles: { key: string; value: FileSystemDirectoryHandle } }` schema.

#### Verification

`npm run check` with the typed schemas in place; confirm `db.get` results are no longer `any` (e.g.
hover/`tsc --noEmit` shows the value type).

---

### [P3][duplication] `secureStorage` and `folderSave` each hand-roll the same IndexedDB key-value wrapper

**File(s):** `web/src/lib/secureStorage.ts:26-45, 85-115` and
`web/src/lib/drawing/folderSave.ts:23-29, 44-65, 105-115` — pinned at SHA f934d43

#### Problem

Both modules independently declare `DB_NAME`/`DB_VERSION`/`STORE` constants, call
`lazyIdbDatabase(...)`, and then wrap `db.get`/`db.put`/`db.delete` in ad-hoc helpers
(`webSave`/`webLoad`/`webClear` vs `loadHandle`/`storeHandle` + the inline `db.delete` in
`clearSaveFolder`). The two IndexedDB consumers in the codebase share only `lazyIdbDatabase` and
re-implement the same get/put/delete-by-key boilerplate above it.

#### Proposed solution

Promote a typed KV helper into `idb.ts`:

```ts
export function idbKvStore<V>(dbName: string, storeName: string) {
  const getDb = lazyIdbDatabase(dbName, storeName);
  return {
    get: async (k: string) => (await getDb()).get(storeName, k) as Promise<V | undefined>,
    put: async (k: string, v: V) => void (await getDb()).put(storeName, v, k),
    delete: async (k: string) => void (await getDb()).delete(storeName, k),
  };
}
```

`folderSave` uses `idbKvStore<FileSystemDirectoryHandle>('splotch-fs','handles')`; `secureStorage`
uses `idbKvStore<CryptoKey | SecretPayload>('splotch-secure','secrets')` (its transactional
master-key path stays bespoke).

#### Verification

Both modules' unit tests pass against the shared helper; `openDbCalls`-style memoization assertions
in `folderSave.test.ts:182-190` still hold.

---

### [P3][complexity] `saveBlobToFolder` mixes permission negotiation, unique-naming, the write, and stale-handle recovery in one function

**File(s):** `web/src/lib/drawing/folderSave.ts:147-181` — pinned at SHA f934d43

#### Problem

The function does: support check, load handle, query-then-maybe-request permission (lines 159-163),
unique-name resolution + createWritable + write + close (165-168), and a catch block that performs
*semantic recovery* — detecting a `NotFoundError`, clearing the stored folder, and firing the UI
listener (175-178). The recovery logic (stale folder → forget + notify) is a distinct concern buried
in a catch arm.

#### Proposed solution

Extract two helpers:

```ts
async function ensureWritePermission(handle, allowPrompt): Promise<boolean>;
async function forgetStaleFolder(): Promise<void>; // clearSaveFolder() + folderClearedListener?.()
```

`saveBlobToFolder` becomes: guard → load → `if (!await ensureWritePermission(...)) return false` →
write → `catch` that calls `forgetStaleFolder()` only on `NotFoundError`. The happy path reads
top-to-bottom without the permission ladder inline.

#### Verification

`folderSave.test.ts`'s permission, stale-handle, and suffix tests pass unchanged.

---

### [P3][duplication] `FOLDER_CHOSEN_KEY` is a `splotch-*` storage key that lives outside the storage layer and is re-hardcoded as a build marker

**File(s):** `web/src/lib/drawing/folderSave.ts:27` (`FOLDER_CHOSEN_KEY`) — pinned at SHA f934d43

#### Problem

`'splotch-save-folder-chosen'` is a localStorage flag written via `writeBool`/`removeKey`, so it
belongs to the same key namespace as everything in `settings.svelte.ts` — yet it's declared here,
then re-typed in `folderSave.test.ts:49,150` and, critically, hardcoded as a bundle-content marker
in `startup-bundle.spec.ts:23`. A rename must be coordinated across three files by grep, and the
startup spec silently depends on the literal. This is the grepability problem in miniature: the same
string is a storage key in one file and a "this module is present" fingerprint in another.

#### Proposed solution

Fold it into the central `STORAGE_KEYS` registry (see the P2 registry finding) and import it here
and in the tests. The startup-bundle marker should reference `STORAGE_KEYS.saveFolderChosen` (or an
intentionally distinct, commented marker constant) rather than an inline literal, so the coupling is
explicit.

#### Verification

`grep -rn "splotch-save-folder-chosen"` shows only the registry definition; `startup-bundle.spec.ts`
still fails loudly if the module leaves the marker (its anti-vacuity test at lines 59-73 guards
this).

---

### [P3][readability] `readString`'s generic return type `string | T` is needlessly clever for a two-shape API

**File(s):** `web/src/lib/storage.ts:114-121` — pinned at SHA f934d43

#### Problem

```ts
export function readString<T extends string | null>(key: string, fallback: T): string | T;
```

The only two real uses are "fallback is a string" (→ `string`) and "fallback is null" (→
`string | null`), yet the signature encodes this with a generic constraint plus a `string | T` union
that reads awkwardly and is easy to get subtly wrong when editing. It's more machinery than the two
cases warrant.

#### Proposed solution

Two overloads make intent explicit:

```ts
export function readString(key: string, fallback: string): string;
export function readString(key: string, fallback: null): string | null;
export function readString(key: string, fallback: string | null): string | null { … }
```

#### Verification

`npm run check`; the existing callers (`settings.svelte.ts:159`, `tool.svelte.ts:48`) type-check
with no change.

---

### [P4][error-handling] `readBool` honors the fallback only for a *missing* key, not a *corrupt* value — inconsistent with `readInt`

**File(s):** `web/src/lib/storage.ts:96-104` — pinned at SHA f934d43

#### Problem

```ts
const raw = localStorage.getItem(key);
if (raw === null) return fallback;
return raw === 'true';
```

A garbage value (`'1'`, `'yes'`, a half-written string) yields `false`, not the caller's `fallback`.
`readInt` (lines 144-153) deliberately falls back on unparseable/out-of-range values; `readBool`
does not, so the two helpers disagree on how to treat corruption. For a setting whose default is
`true`, a corrupt value flips it off rather than to the intended default.

#### Proposed solution

Treat any non-`'true'`/`'false'` value as absent:

```ts
if (raw === 'true') return true;
if (raw === 'false') return false;
return fallback;
```

#### Verification

Unit test: `localStorage.setItem('k','garbage'); expect(readBool('k', true)).toBe(true)` — currently
returns `false`.

---

### [P4][naming] `safeLocalStorage` / `safeRead` are an asymmetric name pair for a symmetric read/write guard

**File(s):** `web/src/lib/storage.ts:44-53, 60-70` — pinned at SHA f934d43

#### Problem

The write guard is named after the API (`safeLocalStorage`) and returns void; the read guard is
named after the action (`safeRead`) and returns a value. They're a matched pair (both wrap a
throwing localStorage op) but their names don't signal that, so a reader scanning the module doesn't
see them as counterparts.

#### Proposed solution

Rename to `safeWrite` / `safeRead` (action-named pair), or `guardWrite` / `guardRead`. Purely a
rename.

#### Verification

`npm run check`; all internal call sites updated.

---

### [P4][error-handling] A single `storageWarned` flag silences read *and* write warnings across each other

**File(s):** `web/src/lib/storage.ts:43, 48-51, 64-67` — pinned at SHA f934d43

#### Problem

`storageWarned` is shared by `safeLocalStorage` (write) and `safeRead` (read). The first failure of
*either* kind sets it, so a later failure of the *other* kind is silent. A quota-exceeded write
followed by a security-error read (distinct problems) logs only the first, hiding the second failure
mode from the console entirely.

#### Proposed solution

Either use two flags (`readWarned` / `writeWarned`) so each failure class warns once, or accept the
one-warning-total policy and rename the flag/comment to say so explicitly. Given the two causes are
genuinely different (quota vs. blocked storage), two flags is the clearer fix.

#### Verification

Force a write throw then a read throw in a test; assert `console.warn` fired twice.

---

### [P4][readability] `createUniqueFile` uses an unbounded `for (;;)` probe loop with no iteration cap

**File(s):** `web/src/lib/drawing/folderSave.ts:120-138` — pinned at SHA f934d43

#### Problem

```ts
for (let i = 0;; i++) {
  const candidate = i === 0 ? filename : `${stem} (${i})${ext}`;
  try {
    await dir.getFileHandle(candidate);
  } // exists → keep looking
  catch (err) {
    if (NotFoundError) return create;
    throw err;
  }
}
```

The only exit is a `NotFoundError`. Each iteration is a full async round-trip, and there's no upper
bound — a folder pathology (or a getFileHandle that never throws NotFoundError for a novel name)
spins indefinitely. It also probes O(n) files for the n-th same-second save.

#### Proposed solution

Add a sane cap (e.g. `i < 1000`) after which it falls back to a timestamp/random suffix and returns,
so the loop can't hang the save path. Optionally document the linear-probe cost.

#### Verification

Unit test with a handle whose `getFileHandle` always resolves; assert the function returns (via
fallback) rather than never settling.

---

### [P4][maintainability] `onSaveFolderCleared` stores a single listener slot, silently clobbering any prior registration

**File(s):** `web/src/lib/drawing/folderSave.ts:35-42` — pinned at SHA f934d43

#### Problem

```ts
let folderClearedListener: (() => void) | null = null;
export function onSaveFolderCleared(listener) {
  folderClearedListener = listener;
}
```

A second call replaces the first with no warning and no unregister handle. Compare `storage.ts`'s
`onDurableRestore` (lines 33-36), which uses a `Set` and returns a disposer. Only one caller exists
today (`settings.svelte.ts:304`), but the single-slot design is an easy footgun for a future second
subscriber and is inconsistent with the sibling pattern in the same storage subsystem.

#### Proposed solution

Mirror `onDurableRestore`: hold a `Set<() => void>`, return a disposer, and fire all listeners in
`saveBlobToFolder`'s recovery path. Small change; makes the two notification hooks consistent.

#### Verification

Register two listeners; trigger a stale-handle clear; assert both fired.

---

### [P4][readability] `cachedHandle`'s tri-state `undefined | null | handle` overloads two "nothing" values

**File(s):** `web/src/lib/drawing/folderSave.ts:31-33, 44-60` — pinned at SHA f934d43

#### Problem

`undefined = not read yet`, `null = read, none set`, handle = set. The distinction is load-bearing
(line 45's `cachedHandle !== undefined` is the "have I hit IndexedDB this session" gate) but relies
on the reader remembering which nullish value means which. This is exactly the kind of
non-self-documenting async cache the audit flags.

#### Proposed solution

Make the "loaded" state explicit:
`let loaded = false; let cachedHandle: FileSystemDirectoryHandle | null = null;` and gate on
`if (loaded) return cachedHandle;`. Removes the `undefined`-vs-`null` semantics entirely.

#### Verification

`folderSave.test.ts:182-190` ("reads the handle once, not per save") still asserts
`openDbCalls === 1`.

---

### [P4][architecture] `mirror` wraps an already-`string` value in `String(value)` — dead defensive cast

**File(s):** `web/src/lib/storage.ts:88-92` — pinned at SHA f934d43

#### Problem

```ts
function mirror(key: string, value: string) {
  … Preferences.set({ key, value: String(value) })
```

`value` is typed `string`; `String(value)` can never change it. It's a leftover from a looser
signature and reads as if the parameter might not be a string, which is misleading.

#### Proposed solution

Drop `String(...)`: `Preferences.set({ key, value })`.

#### Verification

`npm run check`; `storage.test.ts` mirror test (lines 154-160) passes.

---

### [P4][architecture] `requestPersistentStorage` lives in `secureStorage` but is a generic IndexedDB-persistence concern

**File(s):** `web/src/lib/secureStorage.ts:174-182` — pinned at SHA f934d43

#### Problem

`navigator.storage.persist()` asks the browser not to evict *any* of the origin's IndexedDB — it
protects `splotch-fs` (folder handles) just as much as `splotch-secure`. Housing it in
`secureStorage` (and calling it from `settings.hydrateApiKey`, line 273) frames a whole-origin
concern as a secrets-only one, so a future reader looking for "do we request persistent storage?"
won't find it near the folder-save DB it also guards.

#### Proposed solution

Move `requestPersistentStorage` to `idb.ts` (or `storage.ts`) as the generic IndexedDB-durability
helper, and have `secureStorage` re-export or the boot code call it once. Purely a relocation.

#### Verification

`npm run check`; boot still calls it once; the web bundle is unchanged.

---

### [P4][error-handling] `saveSecret` silently no-ops on an empty value, coupling "save" to truthiness

**File(s):** `web/src/lib/secureStorage.ts:121-129` — pinned at SHA f934d43

#### Problem

`if (!browser || !value) return;` — calling `saveApiKey('')` does nothing, neither saving nor
clearing. The intended clear path is elsewhere (`settings.setAiUserApiKey` branches to
`clearApiKey`, `settings.svelte.ts:218-221`), so `saveSecret` quietly assumes callers never pass
empty. A future caller expecting `save('')` to persist-or-clear gets a silent nothing.

#### Proposed solution

Either document the contract at the signature ("non-empty only; use clearSecret to remove") or make
it total: on empty value, delegate to `clearSecret(name)` so save/clear can't drift apart.

#### Verification

Unit test: `saveApiKey('')` after a stored key — assert the stored payload is removed (if
delegating) or that the no-op is intentional and documented.

---

### [P4][maintainability] `getMasterKey` memoizes on a module-global promise that ignores which `db` it was created for

**File(s):** `web/src/lib/secureStorage.ts:57-83` — pinned at SHA f934d43

#### Problem

`masterKeyPromise` is module-scoped but `getMasterKey(db)` takes a `db` argument (line 59). The
first caller's `db` wins; every later caller's `db` is ignored because the memoized promise is
returned regardless. Today `getDb` is itself memoized so it's always the same connection — but the
API *looks* like it keys off `db` when it doesn't, which will mislead anyone who later makes `getDb`
return per-call databases (e.g. after a delete/reopen).

#### Proposed solution

Either drop the `db` parameter and have `loadOrCreateMasterKey` call `getDb()` itself (making the
single-connection assumption explicit), or key the memo off the db instance. Removing the misleading
parameter is the smaller fix.

#### Verification

`secureStorage.test.ts` master-key tests (lines 107-146) pass; the cross-tab race test still adopts
the winner key.

---

### [P4][error-handling] IO error responsibility is split inconsistently within `folderSave` — `loadHandle` swallows, `storeHandle` throws

**File(s):** `web/src/lib/drawing/folderSave.ts:44-65` (`loadHandle` vs `storeHandle`) — pinned at
SHA f934d43

#### Problem

`loadHandle` wraps its `db.get` in try/catch and degrades to "no folder" internally (lines 51-57),
but `storeHandle` (62-65) has no internal handling — its caller `chooseSaveFolder` wraps it
(94-100), while `clearSaveFolder` wraps its own inline `db.delete` (109-114). So three IndexedDB
operations in one module use three different error-ownership conventions (callee-swallows,
caller-wraps, caller-wraps-inline). A reader can't infer from a call whether it must guard the IO.

#### Proposed solution

Pick one convention. Simplest: make each IO helper own its degrade policy (all return a success
boolean or degrade internally, like `loadHandle` does), so callers don't each re-implement the
try/catch. The shared `idbKvStore` helper (see that finding) is the natural place to standardize
this.

#### Verification

`folderSave.test.ts` "keeps the folder for the session when persisting it fails" (115-125) and
"degrades to no-folder when IndexedDB is unavailable" (148-154) pass unchanged.

---

### [P5][duplication] The multi-line `__IS_CAPACITOR__` tree-shaking explainer is copy-pasted verbatim across the storage modules

**File(s):** `web/src/lib/storage.ts:73-81, 83-87` and `web/src/lib/secureStorage.ts:32-42, 118-120`
— pinned at SHA f934d43

#### Problem

The same ~5-line comment ("The `__IS_CAPACITOR__` ternary keeps the import() itself out of the web
bundle… the reject arm is unreachable…") is duplicated in `storage.ts` (getPrefs) and
`secureStorage.ts` (getPlugin), and the "isNative() alone is a runtime check it can't tree-shake"
note is repeated at each guard. This is the actual mechanism `lazyPluginModule` exists to
encapsulate, yet the rationale is re-narrated at every use.

#### Proposed solution

State the rationale once on `lazyPluginModule` in `nativePlugin.ts` and reduce each call site to a
one-line pointer (`// see lazyPluginModule`). Keeps the WHY discoverable without four copies
drifting out of sync.

#### Verification

Doc-only; no behavior change. Confirm `nativePlugin.ts` carries the canonical explanation.

---

### [P5][readability] `removeKey`'s native arm re-inlines the Preferences pattern instead of expressing intent

**File(s):** `web/src/lib/storage.ts:133-142` — pinned at SHA f934d43

#### Problem

`removeKey` restates the full `__IS_CAPACITOR__ && isNative()` →
`getPrefs().then(({ Preferences }) => Preferences.remove({ key })).catch(() => {})` block (lines
137-141), a near-clone of `mirror`. Folded into the `durable()` helper proposed in the P3 dedup
finding, `removeKey` would read `durable((P) => P.remove({ key }))` and its intent (delete the
durable mirror too) would be legible at a glance.

#### Proposed solution

Subsumed by the P3 `durable()` extraction; listed separately so the `removeKey` site isn't missed
when that refactor lands.

#### Verification

`storage.test.ts` `removeKey` suite (lines 89-95, 131-142) passes.

## Source: Code audit — Server / API backend

### [P1][duplication] Extract the shared per-IP rate-limit bucket key into one helper

**File(s):** `web/src/lib/server/generationAuthorization.ts:27` and
`web/src/routes/api/verify-access-code/+server.ts:20` (`verify-access-code:${clientAddress}`) —
pinned at SHA f934d43

#### Problem

The verify-access-code oracle and generate-image's managed-token check deliberately share **one**
per-IP budget, but the key string is hand-built in two places:

```ts
// generationAuthorization.ts:27
const guessKey = `verify-access-code:${input.clientAddress}`;
// verify-access-code/+server.ts:20
const key = `verify-access-code:${getClientAddress()}`;
```

Plus every rate-limit key (`generate-image:`, `generate-image-byok:`, `report:`, `csp-report:`,
`verify-key:`) is an inline template literal at its one call site. The shared bucket is a
load-bearing contract (the whole ADR-0014 oracle story depends on both sites producing the identical
key), yet nothing links them — a rename of one silently splits the bucket, and the tests hard-code
the literal (`server.test.ts:16`, `generationAuthorization.test.ts:55`) so they'd stay green. The
prefix is undiscoverable: you can't grep one symbol to see who shares a bucket.

#### Proposed solution

Add a small key-builder module (e.g. `web/src/lib/server/rateLimitKeys.ts`) exporting one function
per bucket:

```ts
export const verifyAccessCodeBucket = (addr: string) => `verify-access-code:${addr}`;
export const generateImageBucket = (token: string) => `generate-image:${token}`;
export const generateImageByokBucket = (addr: string) => `generate-image-byok:${addr}`;
export const reportBucket = (addr: string) => `report:${addr}`;
export const cspReportBucket = (addr: string) => `csp-report:${addr}`;
export const verifyKeyBucket = (addr: string) => `verify-key:${addr}`;
```

Call these everywhere (routes, generationAuthorization, tests). The shared bucket becomes a single
referenced symbol.

#### Verification

`grep -rn 'verify-access-code:'` returns only the helper afterward. Existing
`generationAuthorization.test.ts` / `verify-access-code/*.test.ts` pass unchanged (same string
produced); update their literals to import the helper so a future rename can't desync.

---

### [P1][consistency] Unify the two error-response shapes across the API surface

**File(s):** `web/src/lib/server/http.ts:9-15,22-27`;
`web/src/routes/api/generate-image/+server.ts:17-19,71,72,92,111,143`;
`web/src/lib/server/generationAuthorization.ts:32,60`;
`web/src/routes/api/report/+server.ts:73,78,89,104`;
`web/src/routes/api/verify-access-code/+server.ts:26,30`;
`web/src/routes/api/verify-key/+server.ts:20,24` — pinned at SHA f934d43

#### Problem

Endpoints emit two incompatible JSON error shapes with no rule for which:

* **`{ ok: false, error }`** — `throttled()`, `verify-access-code`, `verify-key`, `report`.
* **SvelteKit `{ message }`** — every `throw error(...)` in
  `generate-image`/`generationAuthorization` (403, 413, 415, 422, 502, 500) and `readJsonBody`'s
  `throw error(400, 'Expected a JSON body')`.

The same endpoint can return both: in `report`, a malformed body yields
`{ message: 'Expected a JSON body' }` (400) while a missing `kind` yields
`{ ok: false, error: 'Please choose bug or feature.' }` (400). A client can't parse a 400 from
`report` without sniffing the shape. The API skill (SKILL.md:31) even advertises "clients surface
the `error` field directly," which is false for every `error()`-thrown response.

#### Proposed solution

Add a single error-builder beside `throttled()` in `http.ts`, e.g.:

```ts
export function fail(status: number, error: string, headers?: HeadersInit): Response {
  return json({ ok: false, error }, { status, headers });
}
```

Replace the client-facing `throw error(400|413|415|422|502|500, msg)` calls (and `readJsonBody`'s
throw, returning the parsed value or a `fail(400, ...)` sentinel) with `fail(...)` so every JSON
error is `{ ok, error }`. Note `readAiImageResponse` reads `.text()` so it tolerates the change;
`aiCredential`/`report` clients already expect `{ ok, error }`.

#### Verification

`grep -rn "throw error(" web/src/routes/api web/src/lib/server` returns only genuinely-unexpected
5xx (which should hit `handleError`). Add a test asserting every documented failure body has
`{ ok:false, error:string }`. Run `npm run test:api:smoke`.

---

### [P2][duplication] Move content-type parsing into a shared `http.ts` helper

**File(s):** `web/src/routes/api/generate-image/+server.ts:33-34` (`contentTypeOf`) and
`web/src/routes/api/csp-report/+server.ts:104-107` — pinned at SHA f934d43

#### Problem

The exact "strip params, trim, lowercase the Content-Type" logic is written twice:

```ts
// generate-image:33
const contentTypeOf = (request: Request) =>
  (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
// csp-report:104
const contentType = (request.headers.get('content-type') ?? '')
  .split(';')[0].trim().toLowerCase();
```

Both endpoints branch on Content-Type for correctness (multipart vs raw; allowed telemetry formats).
Divergence here is a real behavioral bug risk, and the pattern is a natural shared helper next to
`readJsonBody`.

#### Proposed solution

Add to `http.ts`:

```ts
export function contentType(request: Request): string {
  return (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}
```

Use it in both routes (generate-image both for the multipart branch and the raw mimeType at line
93).

#### Verification

`grep -rn "split(';')\[0\]" web/src/routes` returns nothing after. `npm run test:api:smoke` covers
csp-report's two formats + 415.

---

### [P2][duplication] Extract the oversized-body guard shared by generate-image and csp-report

**File(s):** `web/src/routes/api/generate-image/+server.ts:83-92` and
`web/src/routes/api/csp-report/+server.ts:114-122` — pinned at SHA f934d43

#### Problem

Both endpoints implement the same two-stage cap — reject on declared `Content-Length` first, then
re-check the actual byte length after reading — with the same subtle reasoning (a code-unit length
check would under-count multibyte payloads):

```ts
// generate-image
const declaredLength = Number(request.headers.get('content-length'));
if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) throw error(413, ...);
const bytes = Buffer.from(await request.arrayBuffer());
if (bytes.byteLength > MAX_IMAGE_BYTES) throw error(413, ...);
// csp-report
const declaredLength = Number(request.headers.get('content-length'));
if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return new Response(null,{status:413});
const raw = await request.text();
if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return new Response(null,{status:413});
```

Two copies of a security-relevant limit; a fix to one (e.g. handling chunked encoding) won't reach
the other.

#### Proposed solution

Add helpers to `http.ts`:

```ts
export function declaredLengthExceeds(request: Request, maxBytes: number): boolean;
export async function readCappedBuffer(request: Request, maxBytes: number): Promise<Buffer>; // throws error(413)
export async function readCappedText(request: Request, maxBytes: number): Promise<string>; // throws error(413)
```

Route `generate-image`'s raw branch through `readCappedBuffer` and csp-report through
`readCappedText`.

#### Verification

Unit test each helper with declared-vs-actual mismatch and a multibyte payload.
`npm run test:api:smoke` exercises csp-report's cap.

---

### [P2][complexity] Split the long generate-image POST handler into named stages

**File(s):** `web/src/routes/api/generate-image/+server.ts:98-152` (`POST`) — pinned at SHA f934d43

#### Problem

The handler runs five distinct responsibilities in one 54-line body: read request shape (99),
authorize (101-106), read+validate image (108-113), build prompt (117), branch usage logging
(121-133), call provider and shape response (137-151). The usage-logging branch inline in the
handler (121-133), with a `platform?.context?.waitUntil?.` detail and a separate BYOK `console.log`,
is especially out of place — it's audit plumbing sitting in the middle of the request pipeline.

#### Proposed solution

Extract the usage side-effect into one helper and keep the handler as a readable pipeline:

```ts
function recordGenerationUsage(
  auth: GenerationAuthorization,
  style: string | null,
  prompt: string,
  platform,
): void;
```

so `POST` reads:
`readGenerationRequest → authorizeGenerationRequest → readAndValidateImage → buildPromptForStyle → recordGenerationUsage → aiProvider.generateImage → shapeResponse`.
Consider an `validateImage(mimeType, bytes)` helper for lines 108-113.

#### Verification

Handler drops to well under a screen; each helper is independently unit-testable.
`npm run test:api:smoke` covers the auth gate; add/keep a generate-image handler test.

---

### [P2][consistency] Unify how failure responses are constructed (json vs error vs raw Response)

**File(s):** `web/src/routes/api/csp-report/+server.ts:109,117,128,135`;
`web/src/routes/api/generate-image/+server.ts:71,72,91,92,111,143`;
`web/src/lib/server/generationAuthorization.ts:29,32,54,60` — pinned at SHA f934d43

#### Problem

Three different response-construction idioms appear across the surface with no discernible rule:

* `new Response(null, { status })` (csp-report 415/413/204).
* `throw error(status, msg)` (generate-image, generationAuthorization).
* `return json({...}, { status })` / `return throttled(...)` (report, verify-*, throttled).

Worse, `authorizeGenerationRequest` **mixes throw and return within one function**: throttling
`return throttled(...)` (a `Response`), but an invalid token `throw error(403, ...)`. The caller
must then handle both: `if (authorization instanceof Response) return authorization;`
(generate-image:106) alongside SvelteKit catching the throws. This dual control-flow is a
maintenance trap — a new failure path can be added as either and behave differently.

#### Proposed solution

Pick one convention per category and document it in `.claude/rules/server-api.md`: bodied JSON
failures go through the `fail()` helper (see the error-shape finding); empty telemetry responses
(csp-report 204/413/415) stay `new Response(null, …)` but via a tiny `empty(status)` helper for
grep-ability. Make `authorizeGenerationRequest` consistently **return** `Response` for every
rejection (throttle and 403) rather than mixing throw/return, so the caller's single
`instanceof Response` check covers all of them.

#### Verification

`authorizeGenerationRequest` return type stays `GenerationAuthorization | Response` with no
`throw error` inside it. `generationAuthorization.test.ts` updated to assert a `Response` (not a
thrown 403). `npm run test:api:smoke`.

---

### [P2][type-safety] Share request/response contract types between routes and client callers

**File(s):** `web/src/lib/aiCredential.ts:11-18` (`VerifyResponse`/`VerifyCredentialResult`);
`web/src/routes/api/verify-access-code/+server.ts:32`;
`web/src/routes/api/verify-key/+server.ts:28`; `web/src/routes/api/report/+server.ts:101`;
`web/src/lib/drawing/aiImageResponse.ts:1-5` — pinned at SHA f934d43

#### Problem

Every endpoint's response shape is re-declared, loosely, on the client with no compile-time link to
the server. `aiCredential.ts` hand-writes
`type VerifyResponse = { ok?: boolean; error?: string; accessCode?: string }`, while the server
returns `{ ok: true, accessCode }` / `{ ok: false, error }` — nothing enforces they agree. If the
server drops `accessCode` or renames `error`, the client silently reads `undefined`. Same for
`report` (no client type at all) and generate-image.

#### Proposed solution

Define the wire contracts once in a shared, client-safe module (e.g. `web/src/lib/apiTypes.ts` — no
server imports):

```ts
export type VerifyAccessCodeResponse = { ok: true; accessCode: string } | {
  ok: false;
  error: string;
};
export type VerifyKeyResponse = { ok: true } | { ok: false; error: string };
export type ReportResponse = { ok: true; url: string } | { ok: false; error: string };
export type ApiError = { ok: false; error: string };
```

Have each route annotate its return (`json<VerifyAccessCodeResponse>(...)` or a typed helper) and
the client import the same types.

#### Verification

`tsc`/`npm run check` fails if a route's returned object diverges from the shared type. Add a
type-level test importing both.

---

### [P3][maintainability] Centralize the credential header names shared by route, CORS, and client

**File(s):** `web/src/routes/api/generate-image/+server.ts:30-31`
(`ACCESS_TOKEN_HEADER`/`API_KEY_HEADER`); `web/src/hooks.server.ts:63`;
`web/src/lib/drawing/aiImage.ts:138-139` — pinned at SHA f934d43

#### Problem

`X-Access-Token` and `X-Api-Key` are load-bearing in three places that must agree, expressed as
unrelated literals:

* generate-image reads them as consts (lowercased) `x-access-token` / `x-api-key`.
* `hooks.server.ts:63` lists them in
  `Access-Control-Allow-Headers: 'Content-Type, Authorization, X-Access-Token, X-Api-Key'`.
* `aiImage.ts:138-139` sets `headers['X-Api-Key']` / `headers['X-Access-Token']` on the request.

Drop one from the CORS allow-list and cross-origin native requests break, with nothing linking the
three. There's no single symbol for the header contract.

#### Proposed solution

Put the canonical names in a shared client-safe module (they're not server-only — the client sends
them):

```ts
export const ACCESS_TOKEN_HEADER = 'X-Access-Token';
export const API_KEY_HEADER = 'X-Api-Key';
```

Reference from all three sites (route compares case-insensitively, CORS list builds from them,
client sets them).

#### Verification

`grep -rin 'x-access-token\|x-api-key'` shows only the shared constant plus its references.
`npm run test:api:smoke` + the native CORS path still work.

---

### [P3][maintainability] Route all env-var access through a typed, named accessor

**File(s):** `web/src/lib/server/generationAuthorization.ts:43` (`GEMINI_API_KEY`);
`web/src/lib/server/github.ts:10,15,56` (`GITHUB_ISSUE_REPO`, `GITHUB_ISSUE_TOKEN`) — pinned at SHA
f934d43 (admin's `ADMIN_ACCESS_TOKEN`/`ALLOWED_TOKENS_LIST` are out of scope)

#### Problem

Environment variable names are bare string properties on `env` scattered per-module
(`env.GEMINI_API_KEY`, `env.GITHUB_ISSUE_TOKEN`, `env.GITHUB_ISSUE_REPO`). There's no one place that
enumerates the server's required/optional config, no typo protection (`env.GEMINI_API_KEY` vs a
mistyped `GEMINI_APIKEY` both compile to `string | undefined`), and no discoverability of "what must
be configured for the API to work."

#### Proposed solution

Add `web/src/lib/server/config.ts` that reads `$env/dynamic/private` once and exposes typed getters:

```ts
export const config = {
  geminiApiKey: () => env.GEMINI_API_KEY,
  githubIssueToken: () => env.GITHUB_ISSUE_TOKEN,
  githubIssueRepo: () => env.GITHUB_ISSUE_REPO?.trim() || 'KyleMit/Splotch',
};
```

Modules import `config` instead of touching `env` directly.

#### Verification

`grep -rn "\$env/dynamic/private" web/src/lib/server` shows only `config.ts` (plus admin, out of
scope). `npm run check` passes.

---

### [P3][maintainability] Centralize HTTP status codes used across the API

**File(s):** `web/src/routes/api/generate-image/+server.ts:16,71,72,85,91,92,111,143`;
`web/src/routes/api/report/+server.ts:73,78,89,104`;
`web/src/routes/api/csp-report/+server.ts:109,117,128,135`;
`web/src/lib/server/generationAuthorization.ts:32,60` — pinned at SHA f934d43

#### Problem

Only one status code in the whole surface is named — `SAFETY_STATUS = 422` (generate-image:16).
Everything else is an inline literal: `400`, `403`, `413`, `415`, `500`, `502`, `503`, `204`, `429`.
The 4xx/5xx contract (documented at length in the api skill) is spread across five files with no way
to see it in one place, and the meanings (413 = too large, 415 = unsupported type, 422 = safety, 502
= upstream) live only in comments at each call site.

#### Proposed solution

Add a shared `HTTP` constant map (in `http.ts`), naming the codes the API actually uses:

```ts
export const HTTP = {
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE: 422,
  TOO_MANY: 429,
  SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  UNAVAILABLE: 503,
  NO_CONTENT: 204,
} as const;
```

Reference these at each call site. Keeps the endpoint's failure vocabulary greppable and
self-documenting.

#### Verification

`grep -rn "status: [0-9]\|error(4\|error(5" web/src/routes/api` shows only the constant references.
`npm run test:api:smoke`.

---

### [P3][maintainability] Collect the per-endpoint rate-limit budgets into one table

**File(s):** `web/src/lib/server/generationAuthorization.ts:7-9` (`GENERATE_LIMIT=15`,
`GENERATE_WINDOW_MS`, `BYOK_LIMIT=30`); `web/src/routes/api/report/+server.ts:57-58` (`limit:5`);
`web/src/routes/api/csp-report/+server.ts:99-100` (`limit:10`);
`web/src/routes/api/verify-key/+server.ts:15` (default 10);
`web/src/routes/api/verify-access-code/+server.ts` (default 10) — pinned at SHA f934d43

#### Problem

Every endpoint's throttle budget is defined next to its own call, so the tuned relationship between
them (oracles 10/min, report 5/min tighter as a write, generate 15/min per token, BYOK 30/min
generous — all reasoning that ADR-0014 and the api skill describe as a system) is invisible in code.
`report` and `csp-report` also redundantly pass `windowMs: 60_000`, duplicating the module default.
There's no single spot to see or adjust the throttle policy.

#### Proposed solution

Add a `web/src/lib/server/rateLimitPolicy.ts` exporting one object per bucket, e.g.:

```ts
export const RATE_LIMITS = {
  oracle: { limit: 10, windowMs: 60_000 }, // verify-*, managed-token guess
  report: { limit: 5, windowMs: 60_000 },
  cspReport: { limit: 10, windowMs: 60_000 },
  generateToken: { limit: 15, windowMs: 60_000 },
  byok: { limit: 30, windowMs: 60_000 },
} as const;
```

Spread these into the `rateLimit(...)` calls. Drop the redundant `windowMs: 60_000` where it equals
the default only if you don't centralize; centralizing is cleaner.

#### Verification

One file shows the whole throttle policy. `generationAuthorization.test.ts` (which asserts
`{ limit: 15, windowMs: 60_000 }` etc.) still passes. `npm run test:api:smoke`.

---

### [P3][complexity] Extract a type guard for the Reporting-API entry predicate in csp-report

**File(s):** `web/src/routes/api/csp-report/+server.ts:64-84` (`extractViolations`) — pinned at SHA
f934d43

#### Problem

The array-branch predicate casts `item` to `Record<string, unknown>` **four times** inside one
boolean expression to reach `.type` and `.body`:

```ts
.filter((item): item is Record<string, unknown> =>
  typeof item === 'object' && item !== null &&
  (item as Record<string, unknown>).type === 'csp-violation' &&
  typeof (item as Record<string, unknown>).body === 'object' &&
  (item as Record<string, unknown>).body !== null)
.map((item) => fromReportingApiPayload(item.body as Record<string, unknown>, item.url));
```

It's hard to read and the repeated casts signal a missing guard.

#### Proposed solution

Extract a named type guard:

```ts
interface ReportingApiEntry {
  type: 'csp-violation';
  url?: unknown;
  body: Record<string, unknown>;
}
function isReportingApiEntry(item: unknown): item is ReportingApiEntry {
  if (typeof item !== 'object' || item === null) return false;
  const o = item as Record<string, unknown>;
  return o.type === 'csp-violation' && typeof o.body === 'object' && o.body !== null;
}
```

`extractViolations` becomes
`payload.filter(isReportingApiEntry).map((e) => fromReportingApiPayload(e.body, e.url))`.

#### Verification

`geminiSafety`/csp tests + `npm run test:api:smoke` (two payload formats) still classify
identically.

---

### [P3][type-safety] `readJsonBody`'s return type misrepresents `request.json()`

**File(s):** `web/src/lib/server/http.ts:9-15` — pinned at SHA f934d43

#### Problem

`readJsonBody` is typed `Promise<Record<string, unknown> | null>`, but `request.json()` can resolve
to an array, string, number, boolean, or `null`. The `| null` is the only non-object case
acknowledged, and the JSDoc even leans on this ("a JSON primitive or array simply yields no matching
fields") — but the declared type asserts callers get an object-or-null, so `body?.code` on a JSON
*array* body type-checks yet the runtime value isn't what the type implies. It's a soft `any`
dressed as a `Record`.

#### Proposed solution

Type it honestly as `Promise<unknown>` and let each endpoint narrow, or return a small tagged
result. Given every caller already does `typeof body?.x === 'string'`, `unknown` is the accurate
type and forces the guard the callers already perform:

```ts
export async function readJsonBody(request: Request): Promise<unknown> { ... }
```

Callers keep working (they already guard) but the type stops lying. Optionally add
`asRecord(body): Record<string, unknown>` for ergonomics.

#### Verification

`npm run check` — the existing `typeof body?.x === 'string'` guards satisfy `unknown`.
`http.test.ts` unchanged.

---

### [P3][consistency] Two divergent `[ai-usage]` log formats for the same concept

**File(s):** `web/src/routes/api/generate-image/+server.ts:122` (BYOK log) vs
`web/src/lib/server/usage.ts:45-47` (managed log) — pinned at SHA f934d43

#### Problem

The managed path logs via `recordTokenUsage` with a structured line
(`token=… style=… prompt=… at=…`, masked token), but the BYOK path hand-writes a *different*
`[ai-usage]` line inline in the route:

```ts
console.log(`[ai-usage] byok style=${style || 'none'} at=${new Date().toISOString()}`);
```

Same log namespace, two formats, one of them living in route code instead of the usage module that
owns `[ai-usage]` logging. A log consumer parsing `[ai-usage]` lines must handle two schemas, and
the route now knows the audit-log format.

#### Proposed solution

Add `recordByokUsage({ style }: { style: string | null })` to `usage.ts` that emits a line
consistent with `recordTokenUsage` (same field order, a `token=byok` marker). Route calls it instead
of the inline `console.log`, keeping all `[ai-usage]` formatting in one module.

#### Verification

`grep -rn "\[ai-usage\]" web/src` shows all emitters in `usage.ts`. Both lines share field shape.

---

### [P3][consistency] Logical-failure status convention differs (200+{ok:false} vs 4xx) between verify-* and report

**File(s):** `web/src/routes/api/verify-access-code/+server.ts:26,30`;
`web/src/routes/api/verify-key/+server.ts:20,24`; `web/src/routes/api/report/+server.ts:73,78` —
pinned at SHA f934d43

#### Problem

verify-access-code and verify-key return **HTTP 200** with `{ ok: false, error }` for logical
failures (no code, unrecognized code, no key, bad key), while `report` returns proper **4xx** with
`{ ok: false, error }` for its logical failures (missing kind → 400, empty message → 400). Both are
"the request was well-formed but the operation didn't succeed," handled with opposite status
conventions. A caller (or a smoke test) can't rely on status alone; `aiCredential.ts:41` has to
check `res.ok && data.ok === true` precisely because of the 200-on-failure choice.

#### Proposed solution

This is partly intentional (verify-* returning 200 avoids status-based oracle signal), so the fix is
to **document the rule**, not necessarily flip statuses: in `.claude/rules/server-api.md`, state
that credential oracles answer 200+`{ok:false}` deliberately while non-oracle validation uses
4xx+`{ok:false}`. If you'd rather standardize, move verify-* to return `{ ok:false }` with 200
uniformly (they already do) and note report is the exception. The value here is making the
divergence a written decision instead of an accident.

#### Verification

Rule doc updated; `npm run test:api:smoke` already asserts the verify-access-code shape and report's
400s — keep both.

---

### [P4][readability] Rename the terse `str`/`num` coercers in csp-report

**File(s):** `web/src/routes/api/csp-report/+server.ts:30-36` — pinned at SHA f934d43

#### Problem

```ts
function str(value: unknown): string { ... }   // also length-caps to MAX_FIELD_LENGTH
function num(value: unknown): number | null { ... }
```

`str` does more than its name says (it also truncates), and both are one-off abbreviations. In the
mappers they read as `str(report['blocked-uri'])` — the truncation side-effect is invisible at the
call site.

#### Proposed solution

Rename to intent-revealing names: `cappedString(value)` / `finiteNumberOrNull(value)` (or
`field`/`lineNumber`). No behavior change.

#### Verification

`npm run check`; csp tests unchanged in behavior.

---

### [P4][readability] Redundant `typeof style === 'string'` on an already-`string | null` value

**File(s):** `web/src/routes/api/generate-image/+server.ts:114,129` — pinned at SHA f934d43

#### Problem

`source.style` is typed `string | null` (interface `GenerationRequest`, line 42). Line 114 aliases
it `const style = source.style;`, then line 129 re-checks its type:

```ts
style: typeof style === 'string' ? style : null,
```

The guard can never take the `null`-producing branch differently than `style` already is — it's dead
narrowing that implies `style` might be some other type. (`buildPromptForStyle(style, …)` at 117
also accepts `unknown`, further hiding that `style` is already narrow.)

#### Proposed solution

Pass `style` directly:
`recordTokenUsage(authorization.managedToken, { style, prompt: finalPrompt })`. Drop the redundant
check.

#### Verification

`npm run check` passes (types already `string | null`). generate-image handler test unchanged.

---

### [P4][naming] `readImage` thunk field obscures that it also validates size/emptiness

**File(s):** `web/src/routes/api/generate-image/+server.ts:39-96` (`GenerationRequest.readImage`) —
pinned at SHA f934d43

#### Problem

`readImage: () => Promise<{ bytes; mimeType }>` reads as a pure getter, but each implementation also
enforces the 413 cap and the 400-empty/missing checks (lines 71-72, 85-92) and can throw
`error(...)`. The name hides that calling it is where request validation and rejection happen — a
maintainer moving the call (currently line 108, after authorization) could unknowingly change when a
413/400 is emitted relative to auth.

#### Proposed solution

Rename to `readValidatedImage` (or `readImageOrThrow`) and add a one-line comment that it enforces
the size/emptiness caps and may throw 413/400. Purely a clarity change.

#### Verification

`npm run check`; behavior identical.

---

### [P4][maintainability] `GITHUB_API` base is hard-coded and the User-Agent is a bare literal

**File(s):** `web/src/lib/server/github.ts:7,67` — pinned at SHA f934d43

#### Problem

`const GITHUB_API = 'https://api.github.com'` and `'User-Agent': 'splotch-feedback'` are inline in
the seam. The API version `'2022-11-28'` (line 64) and Accept header are also literals. Minor, but
the app-identifying User-Agent and API-version pin are the kind of values that belong to a small
named config block rather than buried in the fetch call — and there's no single place that says
"this is how Splotch identifies itself to GitHub."

#### Proposed solution

Hoist to named module constants at the top of `github.ts`:

```ts
const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const USER_AGENT = 'splotch-feedback';
```

(They're already module-scoped for `GITHUB_API`; add the other two and reference them in the
headers.) Low urgency — this is a single-consumer seam.

#### Verification

`github.test.ts` still passes (asserts headers/shape). No behavior change.

---

### [P4][maintainability] csp-report's caps and formats are undiscoverable from the CSP header source

**File(s):** `web/src/routes/api/csp-report/+server.ts:7-17`; cross-ref
`web/src/lib/server/securityHeaders.ts:28-29,39` — pinned at SHA f934d43

#### Problem

The receiver's accepted Content-Types (`application/csp-report`, `application/reports+json`,
`application/json`) and the `report-uri /api/csp-report` +
`Reporting-Endpoints: csp="/api/csp-report"` directives that *drive* it live in two files with no
link between them. The path `/api/csp-report` is a literal string in `securityHeaders.ts` (28, 39)
and the route folder name; nothing ties the producer (CSP header) to the consumer (route). A rename
of the route silently drops all CSP telemetry with no failing test.

#### Proposed solution

Export the endpoint path as a shared constant (e.g. `CSP_REPORT_PATH = '/api/csp-report'` in a
shared module) and reference it from `securityHeaders.ts` (interpolating into the CSP directive +
`Reporting-Endpoints`). The route folder can't be a variable, but a `securityHeaders.test.ts`
assertion that the CSP `report-uri` equals `CSP_REPORT_PATH` closes the drift gap.

#### Verification

`securityHeaders.test.ts` gains an assertion linking the CSP directive to the constant;
`grep -n "/api/csp-report"` shows the constant plus the route folder only.

---

### [P4][consistency] `report` builds Retry-After manually-shaped via `throttled` but other size/format caps use raw responses

**File(s):** `web/src/routes/api/report/+server.ts:56-60,73,89,104` — pinned at SHA f934d43

#### Problem

Within `report`, the 429 uses the shared `throttled()` (good), but the 400/502/503 hand-build
`json({ ok:false, error }, { status })` inline three times with slightly different messages. It's
the same `{ ok:false, error }`-with-status pattern repeated; combined with the shape-inconsistency
finding, `report` would be the cleanest place to demonstrate a single `fail(status, error)` helper
(three call sites collapse).

#### Proposed solution

After introducing `fail()` (see the P1 shape finding), rewrite report's three inline
`json({ ok:false, error }, { status })` calls as `fail(400, '…')`, `fail(503, '…')`,
`fail(502, '…')`. Pure readability/consistency once the helper exists.

#### Verification

`npm run test:api:smoke` covers report's validation + unconfigured path.

---

### [P5][readability] `requireEffectiveGenerationKey` reads as a getter but throws

**File(s):** `web/src/lib/server/generationAuthorization.ts:58-63` — pinned at SHA f934d43

#### Problem

`requireEffectiveGenerationKey(authorization): string` throws
`error(500, 'Server is missing GEMINI_API_KEY')` when the managed key is absent. The two-step API —
`authorizeGenerationRequest` then a separate `requireEffectiveGenerationKey` at the call site
(generate-image:115) — splits "am I authorized" from "is the server actually configured to serve
me," which is easy to forget to call. The name is fine (`require…` implies it may throw), but the
split responsibility is the smell: authorization succeeds returning a managed result whose
`effectiveKey` may be `undefined`, deferring the real failure to a second call.

#### Proposed solution

Either fold the managed-key presence check into `authorizeGenerationRequest` (return a
`Response`/error there so an authorized result always carries a usable `effectiveKey: string`),
narrowing the union so `requireEffectiveGenerationKey` disappears; or keep the split but document
why (BYOK must not require the server key) at the function. Given BYOK always has a key and managed
always needs `GEMINI_API_KEY`, checking it inside authorize for the managed branch is clean and
removes a call the handler must remember.

#### Verification

`generationAuthorization.test.ts` updated: a managed request with no `GEMINI_API_KEY` yields the 500
(or a `Response`) directly from `authorizeGenerationRequest`. `npm run check`.

---

### [P5][consistency] Provider result `kind` vocab (`refusal`/`error`) differs from classifier `kind` vocab (`safety`/`empty`)

**File(s):** `web/src/lib/server/ai/provider.ts:14-20`;
`web/src/lib/server/ai/geminiSafety.ts:10-13`; `web/src/lib/drawing/aiImageResponse.ts:1-5` — pinned
at SHA f934d43

#### Problem

Three adjacent layers name the same outcomes with three vocabularies:

* classifier: `'image' | 'safety' | 'empty'`
* provider: `'image' | 'refusal' | 'error'`
* client: `'image' | 'safety' | 'throttled' | 'error'`

`safety` (classifier) maps to `refusal` (provider) maps back to `safety` (client); `empty`
(classifier) maps to `error` (provider). The gemini adapter (`gemini.ts:78-82`) exists mostly to
translate one vocab into the other. The renaming across a two-hop path is cognitive overhead and
invites mismapping.

#### Proposed solution

Align the discriminants. Either the classifier adopts `refusal`/`error` to match the provider seam
(then `gemini.ts` just forwards `classified` when `kind !== 'empty'` without renaming), or the
provider adopts `safety` to match classifier and client. Pick the client-facing vocab (`safety`) as
canonical since it's the contract users of the API care about.

#### Verification

`geminiSafety.test.ts` / `gemini.test.ts` updated to the unified `kind` names; `npm run check`;
generate-image still maps to 422/502 correctly.

---

That's 25 findings, ordered P1→P5. All line numbers verified against SHA `f934d43`. The strongest
structural themes: shared helpers that already exist (`http.ts`) should absorb the duplicated
content-type/body-cap/error-shape logic; the rate-limit **key strings** and **budgets** plus
**header names**, **status codes**, and **env-var names** should each become one referenced symbol
instead of scattered literals; and the client/server response contracts should share types so drift
is a compile error.

## Source: Code audit — PWA / service worker

### [P2][platform-branching] Install-prompt module branches on `isNative()` at runtime where it could be a build-time exclusion

**File(s):** `web/src/lib/state/install.svelte.ts:82-120` (module-load listeners +
`initInstallPrompt`); `web/src/routes/+page.svelte:164-167` — pinned at SHA f934d43

#### Problem

The entire install feature is dead in the native build (the Capacitor shell is "already installed"),
yet it ships in the native bundle and is gated purely at runtime:

```ts
if (browser && !isNative()) {
  window.addEventListener('beforeinstallprompt', (e) => { ... });
  window.addEventListener('appinstalled', markInstalled);
}
```

plus `initInstallPrompt()` re-checks `isNative()` (line 104) and the caller *also* guards
`if (!isNative())` (`+page.svelte:164`). CLAUDE.md states: "The `CAPACITOR=true` env var … is the
single signal for all web-vs-native branching. Do not add runtime platform branches that could be
build-time branches instead." `isNative()` cannot tree-shake; `__IS_CAPACITOR__` (the literal
declared in `app.d.ts:24`) can, letting Rollup drop the whole module from the native bundle.

#### Proposed solution

Guard the module-load side effects and `initInstallPrompt`'s early return on the compile-time
literal instead of `isNative()`: `if (browser && !__IS_CAPACITOR__)`. Then the triple-guarding
(`+page.svelte` caller, `initInstallPrompt`, listener block) collapses to one build-time branch and
the native bundle drops the code. Same treatment for the `updates.ts` PWA module (see next finding).

#### Verification

`CAPACITOR=true npm run build:cap` then grep the native bundle for `beforeinstallprompt` /
`splotch-install-dismissed` — should be absent. Web build + `install.svelte.test.ts` still pass
(tests already stub `isNative`; swap to a `__IS_CAPACITOR__` define in vitest.config or keep the
runtime `isNative` fallback inside the build-time branch).

---

### [P2][platform-branching] `updates.ts` ships in the native bundle instead of being build-excluded

**File(s):** `web/src/lib/pwa/updates.ts:58-99` (`serviceWorkerSupported`, `initPWAUpdates`,
`registerDeferredServiceWorker`); `web/src/routes/+page.svelte:57-60,164-165` — pinned at SHA
f934d43

#### Problem

`VitePWA` is excluded from the native build (`vite.config.ts:97-99`), so `/sw.js` never exists there
— yet all of `updates.ts` is still compiled into the native bundle and is only kept dormant at
runtime via `import.meta.env.DEV` / `serviceWorkerSupported()` checks and the caller's
`if (!isNative())` (`+page.svelte:59,164`). This is registration/version-check machinery that is
provably dead on native. Like the install module, it should be dropped at build time via
`__IS_CAPACITOR__`, not merely skipped at runtime.

#### Proposed solution

Early-return `initPWAUpdates`/`registerDeferredServiceWorker` on `if (__IS_CAPACITOR__) return;`,
and drop the redundant `!isNative()` caller guards in `+page.svelte`. Because `__IS_CAPACITOR__` is
a compile-time literal, Rollup eliminates the bodies (and their transitive imports) from the native
build.

#### Verification

`CAPACITOR=true npm run build:cap`; grep native bundle for `SKIP_WAITING` / `version.json` — absent.
Web build unchanged; `updates.test.ts` unaffected (it drives the exported functions directly with
DEV toggled).

---

### [P2][duplication] `'SKIP_WAITING'` service-worker message type is an ungreppable magic string split across producer, config, and (implicit) SW

**File(s):** `web/src/lib/pwa/updates.ts:193`; comments at `updates.ts:44-47,199-204`;
`web/vite.config.ts:101-125` — pinned at SHA f934d43

#### Problem

The SW control protocol hinges on one string:

```ts
sw.postMessage({ type: 'SKIP_WAITING' });
```

The workbox-generated SW listens for this exact value, the vite.config comment
(`registerType: 'prompt'` … "activates it via SKIP_WAITING message") describes it, and the recovery
comment references it — but nothing binds them. A typo or a rename on either side silently breaks
all updates with no type error and no test failure (the test asserts the literal
`{ type: 'SKIP_WAITING' }`, so it would pass against a matching typo). This is the single most
load-bearing string in the update lifecycle and it is un-discoverable.

#### Proposed solution

Export a named constant `export const SW_SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const;`
(or a `SW_MESSAGE.SKIP_WAITING` enum) from a small `web/src/lib/pwa/messages.ts`, and post it by
reference. Reference the constant name in the vite.config comment so the SW-side coupling is
greppable.

#### Verification

`grep -rn SKIP_WAITING web/src` should find one definition + one use. Update the test to import the
constant instead of re-typing the literal, so a rename can't drift.

---

### [P2][complexity] `checkForUpdates` is a 70-line function wrapping a nested `activateWaitingSW` state machine

**File(s):** `web/src/lib/pwa/updates.ts:160-229` (whole function); nested closure `176-210` —
pinned at SHA f934d43

#### Problem

`checkForUpdates` mixes four concerns in one function: the `'deferred'`/`'activating'` guard
(162-169), the registration lookup + `update()` (171-174), a 35-line nested `activateWaitingSW`
closure that owns its own recovery-timer/`controllerchange` state machine (176-210), and the
waiting-vs-installing dispatch (212-225). The nested closure captures `registration`-adjacent state
and is re-created on every call. This is hard to read and impossible to unit-test in isolation (it's
reachable only through `checkForUpdates`).

#### Proposed solution

Extract to module scope: `function activateWaitingSW(sw: ServiceWorker): void` (it already depends
only on `canvasState`, `refreshState`, `ACTIVATION_RECOVERY_MS`). Then `checkForUpdates` reads as a
flat sequence: guard → lookup → `if (registration.waiting) activateWaitingSW(...)` → installing
branch. Consider a second helper `function onInstalledActivate(registration)` for the installing
branch.

#### Verification

`updates.test.ts` exercises this via `checkForUpdates`; behavior is unchanged so the suite is the
regression net. `npm run check` confirms the extracted signature.

---

### [P2][duplication] `manualMode()` and `installDeviceOs()` duplicate device-family sniffing with subtly different results

**File(s):** `web/src/lib/state/install.svelte.ts:48-69` (`isIosSafari`, `installDeviceOs`,
`manualMode`) — pinned at SHA f934d43

#### Problem

Two functions branch over the same iOS/Android device families to slightly different vocabularies:

```ts
export function installDeviceOs(): InstallDeviceOs { // ios | android | desktop
  if (isIosDevice()) return 'ios';
  if (isAndroidBrowser()) return 'android';
  return 'desktop';
}
function manualMode(): InstallMode { // ios | android | none
  if (isIosSafari()) return 'ios';
  if (isAndroidBrowser()) return 'android';
  return 'none';
}
```

They disagree on iOS: `installDeviceOs` uses `isIosDevice()` (any iOS), `manualMode` uses
`isIosSafari()` (real Safari only). A reader can't tell whether that divergence is intentional or a
bug. The near-identical shape invites "fixing" one to match the other and silently breaking the
in-app-browser guard.

#### Proposed solution

Compute the device family once (`installDeviceOs()`), and derive `manualMode` from it plus the
Safari refinement — e.g. `manualMode` returns `'ios'` only when
`installDeviceOs() === 'ios' && isIosSafari()`, `'android'` when `=== 'android'`, else `'none'`. Add
a one-line WHY comment on the iOS divergence so the difference is documented rather than accidental.

#### Verification

`install.svelte.test.ts` covers iOS-Safari→`ios`, iOS-Chrome→`none`, Android→`android`,
desktop→`none`; all must still pass.

---

### [P2][architecture] InstallBanner reaches into another component's DOM by a hard-coded element id for its exit animation

**File(s):** `web/src/lib/components/InstallBanner.svelte:52-66` (`bannerExit`), specifically line
54 — pinned at SHA f934d43

#### Problem

```ts
const target = document.getElementById('parentHelpButton')?.getBoundingClientRect();
```

The banner's "shrink into the Parent Help button" animation depends on a magic string id owned by a
*different* component (`ParentHelpButton`). If that component renames or removes the id, the
transition silently degrades to the `dy = 120` fallback with no error and no test coverage of the
coupling. This cross-component DOM reach-through is exactly the kind of implicit coupling that rots.

#### Proposed solution

Expose the id as a shared constant (e.g. `export const PARENT_HELP_BUTTON_ID = 'parentHelpButton'`
in a UI-ids module or on the ui state), consumed by both `ParentHelpButton.svelte` and here, so a
rename is a compile-time break. Longer term, prefer passing the target rect/ref through shared state
rather than a global `getElementById`.

#### Verification

`grep -rn parentHelpButton web/src` should resolve to one definition + two references. Manually:
draw past the auto-clear threshold and confirm the pill still flies into the Parent Help button.

---

### [P3][naming] `refreshState` machine (`idle`/`activating`/`deferred`) is under-documented and the states aren't self-describing

**File(s):** `web/src/lib/pwa/updates.ts:35,162-169,176-210` — pinned at SHA f934d43

#### Problem

The core update lifecycle is a 3-state variable named `refreshState` with values
`'idle' | 'activating' | 'deferred'`. The actual SW lifecycle (waiting → SKIP_WAITING posted →
`controllerchange` → reload, with a "reload owed but ink present" branch) maps onto these names
non-obviously: `'deferred'` means "controllerchange already happened but a reload is owed until the
canvas next goes empty," which no reader would infer from the name. The transitions are scattered
across the top-of-function guard and the nested closure.

#### Proposed solution

Rename to something intent-revealing (`updateReload: 'none' | 'activating' | 'owed'`) and add a
short state-transition comment block at the declaration enumerating the four transitions.
Alternatively model it as a tiny typed transition table. No behavior change — this is legibility of
the central state machine.

#### Verification

`updates.test.ts` (which references states only through behavior) still passes;
`resetUpdatesForTests` updated to the new name.

---

### [P3][maintainability] Unexplained `100` ms magic delay and un-removed `statechange` listener in the installing branch

**File(s):** `web/src/lib/pwa/updates.ts:217-225` — pinned at SHA f934d43

#### Problem

```ts
registration.installing.addEventListener('statechange', function(this: ServiceWorker) {
  if (this.state === 'installed' && registration.waiting) {
    setTimeout(() => {
      if (registration.waiting) activateWaitingSW(registration.waiting);
    }, 100);
  }
});
```

Three smells: (a) the `100` ms is a bare magic number with no WHY — unlike the sibling
`ACTIVATION_RECOVERY_MS` which is a named, commented constant; (b) the `statechange` listener is
never removed, so repeated `checkForUpdates` calls while a worker installs stack duplicate listeners
on the same worker; (c) the `function (this: ServiceWorker)` style clashes with the arrow-function
style used everywhere else in the file and only exists to read `this.state` when
`registration.installing.state` was available.

#### Proposed solution

Name the delay (`const WAITING_SETTLE_MS = 100` with a comment on why a tick is needed after
`installed`), add `{ once: true }` to the listener (a worker transitions to `installed` once), and
switch to an arrow reading `registration.installing?.state`.

#### Verification

Existing test "rechecks canvas state after an installing worker takes control"
(`updates.test.ts:298-335`) uses `advanceTimersByTimeAsync(100)`; keep it in sync with the named
constant.

---

### [P3][type-safety] `BeforeInstallPromptEvent` requires a cast because `WindowEventMap` isn't augmented

**File(s):** `web/src/lib/state/install.svelte.ts:21-24,83-86` — pinned at SHA f934d43

#### Problem

The event type is declared locally, then the listener callback receives a plain `Event` and casts:

```ts
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;   // cast
```

The `as` cast defeats type-checking at the exact boundary where the shape matters, and
`'appinstalled'` is likewise untyped. `app.d.ts` already augments global types (File System Access
API), so this is the established pattern for exactly this situation.

#### Proposed solution

Move the interface to `app.d.ts` and augment
`interface WindowEventMap { beforeinstallprompt: BeforeInstallPromptEvent }`. The listener parameter
then types automatically and the cast disappears; `deferredPrompt` keeps its precise type.

#### Verification

`npm run check` passes with the cast removed; the listener body still type-checks
`e.prompt`/`e.userChoice`.

---

### [P3][architecture] Auto-clear/dismiss lifecycle policy lives in the banner component, not the install state module

**File(s):** `web/src/lib/components/InstallBanner.svelte:34-47` (auto-clear `$effect`) — pinned at
SHA f934d43

#### Problem

Per `.claude/rules/svelte.md`: "Shared state lives in `src/lib/state/*.svelte.ts`. Components read
state and call setters; they never own shared state." The banner owns a genuine policy decision —
*when* an ignored install prompt should auto-dismiss (`shownAtStroke + STROKES_BEFORE_AUTO_CLEAR`,
then call `dismissInstall()`):

```ts
if (canvasState.strokeCount < shownAtStroke + STROKES_BEFORE_AUTO_CLEAR) return;
parting = true;
dismissInstall();
```

The stroke-count-based auto-dismiss is install-lifecycle logic (it mutates persisted dismissal),
sitting in a component alongside the presentation. `shownAtStroke` bookkeeping is duplicated
conceptually with the state module's `SETTLED_IN_STROKES` gating.

#### Proposed solution

Move the "should auto-clear" decision into `install.svelte.ts` (e.g. a derived/`autoClearDue`
computed from stroke count, or an `armAutoClear(shownAtStroke)` helper), leaving the component to
render `parting` and run the exit animation. Keep the animation (`PARTING_MESSAGE_MS`, `bannerExit`)
in the component — only the persistence-affecting policy moves.

#### Verification

Add/keep a unit test in `install.svelte.test.ts` for the auto-clear threshold (currently untested —
it's only reachable through the component). Playwright banner flow still auto-clears after the
threshold.

---

### [P3][duplication] localStorage key strings are re-hard-coded in the test instead of imported

**File(s):** `web/src/lib/state/install.svelte.ts:17-18`;
`web/src/lib/state/install.svelte.test.ts:12-13` — pinned at SHA f934d43

#### Problem

```ts
// install.svelte.ts
const DISMISSED_KEY = 'splotch-install-dismissed';
const INSTALLED_KEY = 'splotch-install-completed';
// install.svelte.test.ts (copy)
const DISMISSED_KEY = 'splotch-install-dismissed';
const INSTALLED_KEY = 'splotch-install-completed';
```

The keys are `const` (unexported) in source and re-typed verbatim in the test. Renaming the source
key would leave the test asserting the old key — the test would keep passing against
`localStorage.getItem(INSTALLED_KEY)` with its stale copy while production writes a different key.
Silent source/test drift on persisted state.

#### Proposed solution

Export the keys from `install.svelte.ts` (they're already a natural public contract for persistence)
and import them in the test. Or centralize install keys with the other storage keys if such a
registry exists.

#### Verification

`grep -rn "splotch-install-" web/src` should show one definition site. Test imports it; a rename now
breaks compilation, not silently.

---

### [P3][maintainability] Hourly update interval is an inline magic number while its siblings are named constants

**File(s):** `web/src/lib/pwa/updates.ts:120-125` — pinned at SHA f934d43

#### Problem

```ts
const updateCheckInterval = setInterval(() => {
  checkForUpdates();
}, 60 * 60 * 1000);
```

This file already names `ACTIVATION_RECOVERY_MS = 10_000` and `STROKES_BEFORE_SW_REGISTER` with
explanatory comments, but the update cadence — arguably the most policy-relevant number in the file,
and referenced in the module header comment ("Update checks run on init, hourly, …") — is an inline
`60 * 60 * 1000`. Inconsistent and un-tunable-by-name.

#### Proposed solution

`export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;` next to the other constants; the header
comment's "hourly" then has a named anchor.

#### Verification

`npm run check`; behavior identical.

---

### [P3][maintainability] Module-global mutable singletons force a test-only `resetUpdatesForTests` export in production code

**File(s):** `web/src/lib/pwa/updates.ts:34-56` — pinned at SHA f934d43

#### Problem

The module keeps three mutable module-scope singletons (`initialized`, `refreshState`,
`registrationScheduled`) and ships a production export whose sole purpose is un-leaking them between
tests:

```ts
export function resetUpdatesForTests() {
  refreshState = 'idle';
  initialized = false;
  registrationScheduled = false;
}
```

A `*ForTests` symbol in the shipped API surface is a code smell — it signals the module's state is
only testable because it exposes its guts. Every new singleton must be remembered here or tests
couple by execution order (the comment admits this).

#### Proposed solution

Two options: (a) accept it as pragmatic but move the reset behind an `import.meta.vitest`/dev-only
guard so it can't be called in prod; or (b) encapsulate the lifecycle in a factory
(`createPWAUpdates()`) that returns the public functions closing over private state — each test
constructs a fresh instance, no reset export needed, and `+page.svelte` holds the single app
instance. Option (b) also removes the `initialized` idempotency singleton (each instance is
naturally single-use).

#### Verification

`updates.test.ts` drops `resetUpdatesForTests` in favor of a fresh factory per `beforeEach`; all
cases pass without the shared-instance caveats.

---

### [P3][readability] InstallBanner mixes `$state` flags with a plain `let` mutated inside an `$effect`

**File(s):** `web/src/lib/components/InstallBanner.svelte:21-25,45-46,52-53` — pinned at SHA f934d43

#### Problem

```ts
let showHint = $state(false);
let busy = $state(false);
let parting = $state(false);
let shownAtStroke: number | null = null;
let exitIntoParentButton = false; // plain let, no $state
```

`exitIntoParentButton` is a plain `let` written inside the auto-clear `$effect` (line 45) and read
in `bannerExit` (line 53); `shownAtStroke` is similarly a non-reactive `let` written in the effect.
It happens to work because `bannerExit` reads at transition time and the effect doesn't depend on
them — but a reader can't tell at a glance which flags are reactive and which aren't, and a future
edit that *renders* off `exitIntoParentButton` would break with no warning. The inconsistency is a
latent trap.

#### Proposed solution

Either make them `$state` (harmless, uniform) or add a one-line comment on each non-`$state` `let`
explaining it's an imperative transition-time latch deliberately kept out of reactivity. Uniformity
is the cheaper fix.

#### Verification

`npm run check`; banner auto-clear + fly-into-button animation still behave.

---

### [P4][duplication] Reload-side-effect pair (`refreshState = 'idle'; window.location.reload()`) is repeated across three lifecycle paths

**File(s):** `web/src/lib/pwa/updates.ts:164-166,184-186` — pinned at SHA f934d43

#### Problem

The "commit the reload" step appears in the `'deferred'` guard (164-166) and in `onControllerChange`
(184-186):

```ts
refreshState = 'idle';
window.location.reload();
```

plus the inverse "defer instead" pair (`refreshState = 'deferred'; return;`) at 181-183. The reload
discipline (always reset state before reloading) is a rule enforced by copy-paste; a future path
that reloads without resetting would strand the state machine.

#### Proposed solution

Extract `function reloadForUpdate() { refreshState = 'idle'; window.location.reload(); }` and
`function deferReload() { refreshState = 'deferred'; }`, and call them from all paths. The invariant
becomes a single definition.

#### Verification

`updates.test.ts` reload-count assertions (e.g. `toHaveBeenCalledTimes(1)`) still hold.

---

### [P4][type-safety] Save-Data `connection` type is cast inline instead of shared

**File(s):** `web/src/lib/pwa/updates.ts:62-65`; duplicated shape in `updates.test.ts:344-352` —
pinned at SHA f934d43

#### Problem

```ts
const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } };
```

The `NetworkInformation` shape is declared ad-hoc at the use site, and the test re-declares the same
shape when stubbing `navigator.connection`. The non-standard API has no shared type, so the two
definitions can drift and neither is discoverable.

#### Proposed solution

Add a minimal `interface NetworkInformation { saveData?: boolean }` and
`interface Navigator { connection?: NetworkInformation }` augmentation in `app.d.ts` (same pattern
as the File System Access API already there). The cast becomes
`navigator.connection?.saveData === true`.

#### Verification

`npm run check`; `updates.test.ts` Save-Data cases (`skips registration when Save-Data is on`, etc.)
pass unchanged.

---

### [P4][maintainability] `'/sw.js'` and `'/version.json'` paths are magic strings scattered across module and tests

**File(s):** `web/src/lib/pwa/updates.ts:75,147` — pinned at SHA f934d43

#### Problem

`navigator.serviceWorker.register('/sw.js')` (line 75) and `fetch('/version.json', …)` (line 147)
hard-code paths that the build pipeline also owns — `version.json` is emitted by the
`emit-version-json` vite plugin (`vite.config.ts:87-96`) and `sw.js` by VitePWA. These
cross-boundary contracts (build emits ⇄ runtime fetches) live as bare strings on both sides with
nothing binding them, and the test re-types `'/sw.js'` / `'/version.json'` again.

#### Proposed solution

Name them (`const SW_URL = '/sw.js'`, `const VERSION_MANIFEST_URL = '/version.json'`) and, for
`version.json`, reference the constant name in the vite plugin comment so the emit/fetch pair is
greppable. Lower priority than SKIP_WAITING because these paths are more conventional, but the same
discoverability argument applies.

#### Verification

`grep -rn "version.json" web` shows the emit site and the single fetch constant.

---

### [P4][maintainability] Manifest icons are a second source of truth, already drifted from the PWA plugin's asset list

**File(s):** `web/static/site.webmanifest:7-32`; `web/vite.config.ts:112-118` (`includeAssets`,
`manifest: false`) — pinned at SHA f934d43

#### Problem

`VitePWA` is configured `manifest: false` (line 118), so the manifest is authored by hand in
`static/site.webmanifest` and linked from `app.html:47`, while the plugin's `includeAssets`
separately lists icons (`favicon-96x96.png`, `apple-touch-icon.png`) and the manifest references a
different set (`web-app-manifest-192x192.png`, `web-app-manifest-512x512.png`). Two disjoint icon
inventories with no cross-check means a renamed/removed icon breaks install visuals silently
(nothing fails the build). The PWA surface (manifest ⇄ precache ⇄ app.html links) is spread across
three files with no single map.

#### Proposed solution

At minimum, add a comment in `vite.config.ts` (or `static/ICONS-README.md`) pointing at
`site.webmanifest` as the manifest source of truth and enumerating why `manifest: false`. Better: a
small build/test assertion that every manifest icon `src` and every `includeAssets` entry resolves
to a real file in `static/`.

#### Verification

`npm run build`, then confirm each referenced icon exists in the build output; a deleted icon should
fail the added check rather than 404 at install time.

---

### [P4][complexity] `initPWAUpdates` bundles cache-bust URL cleanup, version check, re-registration, and listener wiring in one function (with a redundant `getRegistration`)

**File(s):** `web/src/lib/pwa/updates.ts:95-143` — pinned at SHA f934d43

#### Problem

`initPWAUpdates` does five loosely related things: strips the `?v=` cache-bust param (101-106),
kicks a version-mismatch check (109), calls `checkForUpdates()` (108) *and then* independently calls
`getRegistration()` again to decide whether to re-register (113-118) — two `getRegistration`
round-trips per init — then wires the interval + two listeners (120-135). The `?v=` cache-bust
cleanup is a distinct concern from the SW update lifecycle but shares the function.

#### Proposed solution

Extract `consumeCacheBustParam(): string | null` (the `?v=` strip + `replaceState`) and
`scheduleRepeatVisitReregister()` (the `getRegistration().then` block). `initPWAUpdates` then reads
as a short orchestration list. Optionally have `checkForUpdates` return the registration it looked
up so the second `getRegistration` is avoided.

#### Verification

`updates.test.ts` `initPWAUpdates` describe block (URL strip, cache-bust loop guard, idempotency,
teardown) covers all paths — must stay green.

---

### [P4][readability] `bannerExit` inline transition is ~14 lines of geometry with a duplicated fallback distance

**File(s):** `web/src/lib/components/InstallBanner.svelte:52-66` — pinned at SHA f934d43

#### Problem

`bannerExit` computes a FLIP-style translate from the banner's rect to the Parent Help button's rect
inline in the component script, including a `translateX(-50%)`-restating `css` callback. The
fallback vertical distance `120` is repeated here (57) and in the plain-exit branch
(`fly(node, { y: 120 … })` line 53 and the entrance `y: 120` at line 85) as an unnamed magic number
appearing four times across the file.

#### Proposed solution

Name the travel distance (`const BANNER_FLY_Y = 120`) and reuse it for entrance, plain exit, and the
fallback. Optionally extract the geometry math to a small helper
`flyToElement(node, targetId, fallbackY)` in `lib/actions/` or a local function, keeping the
transition declaration a one-liner. Per `.claude/rules/svelte.md`, non-trivial transition wiring is
a reasonable extraction target.

#### Verification

`npm run check`; visually confirm both exit paths (manual dismiss → plain fly-down; auto-clear →
shrink into button) still animate.

---

### [P5][readability] Deferred-prompt bookkeeping is spread across the listener, `markInstalled`, and `promptInstall`

**File(s):** `web/src/lib/state/install.svelte.ts:45,71-76,86,132-133,144-149` — pinned at SHA
f934d43

#### Problem

`deferredPrompt` is set in the `beforeinstallprompt` listener (86), nulled in `markInstalled` (72),
nulled again in `promptInstall` (133), and its absence re-derives `manualMode()` in three places
(129,141,149). The one-shot lifecycle of the stashed event ("captured → consumed once → gone → fall
back to manual") is real but reconstructing it requires reading all five sites; the "on spent
prompt, drop `oneTap` → manual" fixup is copy-pasted three times.

#### Proposed solution

Add a single private helper `function consumeDeferredPrompt() { deferredPrompt = null; }` and
`function fallBackToManualHint() { if (install.mode === 'oneTap') install.mode = manualMode(); }`,
replacing the three inline `if (install.mode === 'oneTap') install.mode = manualMode()` repetitions.
Centralizes the one-shot semantics.

#### Verification

`install.svelte.test.ts` `promptInstall` cases (accepted / declined / unavailable /
cannot-replay-twice / throws / stale-oneTap) all pass unchanged.

## Source: Code audit — Coloring books

### [P1][duplication] Book id is re-typed as a string argument on every `page()` call, silently generating asset paths on mismatch

**File(s):** `web/src/lib/state/books.ts:92-122` (`page()` factory) and `124-237` (`BOOKS`) — pinned
at SHA f934d43

#### Problem

`page()` takes the book id as its first positional arg, so every entry repeats the enclosing book's
`id` as a bare string:

```ts
{ id: 'farm', name: 'Farm', ... pages: [
    page('farm', 'cat', 'Cat'),
    page('farm', 'cow', 'Cow'),   // 'farm' repeated 6× per book, 48× total
```

The book id lives in two independent places (`Book.id` and each `page(book, …)` call) that must
agree by hand. `page('farm', …)`, `id`, `name`, and the exceptions object are all
strings/loosely-typed positionals, so a copy-paste slip (`page('farm', …)` pasted into the
`dinosaur` block) compiles cleanly and silently emits `/coloring/farm/...` paths under the Dinosaurs
book. Nothing in the type system ties a page to its book.

#### Proposed solution

Bind the book id once. Give `page()` a curried/closure form per book, e.g. a
`defineBook(id, name, platforms, pages: (p) => …)` builder where the inner `page(id, name, opts)`
closes over the book id, or a `book('farm','Farm', ['cat','cow',…])` helper that maps ids→pages.
Then `Book.id` is the single source and `page` can't reference a foreign book. Signature sketch:

```ts
function defineBook(
  id: string,
  name: string,
  platforms: BookPlatform[],
  pages: Array<[id: string, name: string, opts?: PageExceptions]>,
): Book;
```

#### Verification

`npm run test:unit -- books` still green; add a test asserting every `page.images.portrait` in a
book starts with `/coloring/${book.id}/`. Grep confirms the book id literal now appears once per
book, not per page.

---

### [P1][architecture] `coloringBookState` stores four URLs that are pure functions of `(page, orientation)`, kept in sync by a manual re-invocation effect

**File(s):** `web/src/lib/state/coloringBook.svelte.ts:15-47` and
`web/src/lib/components/ColoringBook.svelte:50-54` — pinned at SHA f934d43

#### Problem

`overlayUrl`, `chalkUrl`, `colorSheetUrl`, `nightSheetUrl` are all derivable from `overlayPage` +
orientation via the existing `pageImage`/`pageChalkImage`/`pageColorImage`/`pageNightImage`
accessors. `setOverlayPage` snapshots all four:

```ts
coloringBookState.overlayUrl = pageImage(page, orientation);
coloringBookState.chalkUrl = pageChalkImage(page, orientation);
coloringBookState.colorSheetUrl = pageColorImage(page, orientation);
coloringBookState.nightSheetUrl = pageNightImage(page, orientation);
```

Because orientation can change after selection, the component needs a dedicated effect to re-push
the snapshot:

```ts
$effect(() => {
  if (coloringBookState.overlayPage) setOverlayPage(coloringBookState.overlayPage, orientation);
});
```

This is denormalized state maintained by a hand-written sync effect — exactly what `$derived` exists
to eliminate. The URLs can drift from `overlayPage` for one frame, and every new derived asset
variant (a 5th URL) means touching the interface, the `$state` initializer, `setOverlayPage`,
`clearOverlay`, and this effect.

#### Proposed solution

Store only the source-of-truth pair `{ overlayPage, orientation }` in the rune state (add an
`orientation` field set by the same effect, or pass orientation in). Expose the four URLs as
`$derived` (or plain accessor functions the component reads) computed from
`overlayPage`+`orientation`. Delete the sync effect at `ColoringBook.svelte:50-54` — the derivations
react automatically. `DrawingCanvas` already re-derives theme on top, so it keeps working.

#### Verification

`coloringBook.svelte.test.ts` should still pass after adapting to the new shape; assert that
changing orientation updates all four URLs without an intervening `setOverlayPage` call. Manual:
rotate with an applied page and confirm the overlay swaps.

---

### [P1][maintainability] Asset filename grammar (suffixes + portrait→tall / landscape→wide) is scattered as string literals with no single mapping

**File(s):** `web/src/lib/state/books.ts:100-118` (`page()`), `264-271`
(`thumbPath`/`chalkThumbPath`) — pinned at SHA f934d43

#### Problem

The whole asset naming convention documented in the 44-line header exists only as inline literals
repeated across the module:

```ts
portrait: `/coloring/${book}/${id}-tall.outline.webp`,
landscape: `/coloring/${book}/${id}-wide.outline.webp`,
...
if (night.includes('portrait')) nightImages.portrait = `/coloring/${book}/${id}-tall.night.webp`;
```

The `portrait ⇒ "tall"`, `landscape ⇒ "wide"` mapping is hardcoded eight times inside `page()`; the
suffixes `.outline.webp`/`.light.webp`/`.night.webp`/`.chalk.webp`/`.thumb.webp`/`.chalk.thumb.webp`
are spread across `page()`, `thumbPath`, and `chalkThumbPath`. Renaming any asset variant (or the
`/coloring/` root) means hunting down every literal, and there is nothing greppable that says
"orientation slug." `thumbPath` and `chalkThumbPath` encode the same suffix knowledge as regexes
independently of `page()`.

#### Proposed solution

Introduce named constants/maps at the top of the module and build every path through one helper:

```ts
const COLORING_ROOT = '/coloring';
const ORIENTATION_SLUG: Record<BookOrientation, 'tall' | 'wide'> = {
  portrait: 'tall',
  landscape: 'wide',
};
const VARIANT_SUFFIX = {
  outline: 'outline.webp',
  light: 'light.webp',
  night: 'night.webp',
  chalk: 'chalk.webp',
  thumb: 'thumb.webp',
  chalkThumb: 'chalk.thumb.webp',
} as const;
function assetPath(
  book: string,
  id: string,
  o: BookOrientation,
  v: keyof typeof VARIANT_SUFFIX,
): string;
```

`thumbPath`/`chalkThumbPath` then derive from the same `VARIANT_SUFFIX` table instead of standalone
regexes.

#### Verification

`books.test.ts`/`coloringBook.svelte.test.ts` (which assert exact literal paths) still pass — proves
the generated strings are byte-identical. Grep for `-tall.` / `-wide.` returns only the constant
definitions.

---

### [P2][duplication] `page()` builds `nightImages` and `chalkImages` with two copy-pasted filter+branch blocks

**File(s):** `web/src/lib/state/books.ts:92-122` (`page()`) — pinned at SHA f934d43

#### Problem

The night and chalk stanzas are structurally identical, differing only in the suffix and the
exception list:

```ts
const night = ALL_ORIENTATIONS.filter((o) => !nightExcept.includes(o));
const chalk = ALL_ORIENTATIONS.filter((o) => !chalkExcept.includes(o));
const nightImages: Partial<Record<BookOrientation, string>> = {};
if (night.includes('portrait')) nightImages.portrait = `/coloring/${book}/${id}-tall.night.webp`;
if (night.includes('landscape')) nightImages.landscape = `/coloring/${book}/${id}-wide.night.webp`;
const chalkImages: Partial<Record<BookOrientation, string>> = {};
if (chalk.includes('portrait')) chalkImages.portrait = `/coloring/${book}/${id}-tall.chalk.webp`;
if (chalk.includes('landscape')) chalkImages.landscape = `/coloring/${book}/${id}-wide.chalk.webp`;
```

Two orientations × two variants = four near-identical `if` lines plus two parallel scaffolds; adding
a third optional variant would triple the block.

#### Proposed solution

Extract a helper that turns an "except" list + variant into a
`Partial<Record<BookOrientation,string>>` (using the `ORIENTATION_SLUG`/`VARIANT_SUFFIX` tables from
the P1 grepability finding):

```ts
function optionalVariant(
  book: string,
  id: string,
  except: BookOrientation[],
  v: 'night' | 'chalk',
): Partial<Record<BookOrientation, string>>;
```

Then `page()` is `nightImages: optionalVariant(book, id, nightExcept, 'night')`,
`chalkImages: optionalVariant(book, id, chalkExcept, 'chalk')`.

#### Verification

Existing exact-path unit tests stay green; the "every page ships night+chalk for both orientations"
test in `books.test.ts:14-21` still passes.

---

### [P2][maintainability] The state field set is hand-enumerated in four places that must stay in lockstep

**File(s):** `web/src/lib/state/coloringBook.svelte.ts:15-55` — pinned at SHA f934d43

#### Problem

The same five fields are written out four times: the `ColoringBookState` interface (15-31), the
`$state({...})` initializer (33-39), every-field assignment in `setOverlayPage` (41-47), and
every-field null-out in `clearOverlay` (49-55):

```ts
export function clearOverlay() {
  coloringBookState.overlayUrl = null;
  coloringBookState.chalkUrl = null;
  coloringBookState.colorSheetUrl = null;
  coloringBookState.nightSheetUrl = null;
  coloringBookState.overlayPage = null;
}
```

Adding or removing a tracked URL means editing all four; forgetting `clearOverlay` leaves a stale
URL after a clear. This is the same denormalization pressure as the P1 architecture finding, and
mostly disappears if the URLs become derived. Absent that, the reset is duplicated boilerplate.

#### Proposed solution

Define a single `EMPTY_STATE` constant and reset with
`Object.assign(coloringBookState, EMPTY_STATE)` in `clearOverlay`, initialize the `$state` from the
same constant, so the field list has one authoritative definition. (Preferred: fold the four URLs
into `$derived` per the architecture finding, leaving only `{ overlayPage, orientation }` to reset.)

#### Verification

`coloringBook.svelte.test.ts:30-38` (clearOverlay nulls all five) still passes.

---

### [P2][complexity] `bookAssetPaths` inlines four labeled `flatMap` blocks that read as named sub-lists

**File(s):** `web/src/lib/state/books.ts:288-323` (`bookAssetPaths`) — pinned at SHA f934d43

#### Problem

The function is one ~35-line expression whose four segments (`lineArt`, `lightFills`, `nightFills`,
`chalkOutlines`) each need a comment to explain what they are, and two of them repeat the same
inline orientation loop with a cast:

```ts
const nightFills = book.pages.flatMap((page) =>
  (['portrait', 'landscape'] as BookOrientation[])
    .map((o) => page.nightImages[o])
    .filter((p): p is string => !!p));
const chalkOutlines = book.pages.flatMap((page) =>
  (['portrait', 'landscape'] as BookOrientation[])   // same block, chalkImages
    ...
```

The comments are doing the naming that extracted functions would do for free.

#### Proposed solution

Extract each segment to a small named function — `lineArtPaths(book)`, `lightFillPaths(book)`,
`nightFillPaths(book)`, `chalkOutlinePaths(book)` (the last two share
`presentVariantPaths(book, 'night'|'chalk')`) — and have `bookAssetPaths` compose them plus the
thumbnails. `bookAssetPaths` becomes a short assembly of self-describing calls.

#### Verification

`bookAssetPaths` tests in both test files (exact set membership + thumb counts,
`books.test.ts:59-108`) stay green.

---

### [P2][architecture] The `armHoverOnMouseMove` gesture action is defined inline instead of in `lib/actions/`

**File(s):** `web/src/lib/components/ColoringBook.svelte:75-88` — pinned at SHA f934d43

#### Problem

A Svelte action wiring pointer listeners lives inline in the component:

```ts
function armHoverOnMouseMove(node: HTMLElement) {
  function onMove(e: PointerEvent) {
    if (e.pointerType === 'mouse') hoverArmed = true;
  }
  node.addEventListener('pointermove', onMove);
  return { destroy: () => node.removeEventListener('pointermove', onMove) };
}
```

`.claude/rules/svelte.md` states: "Complex gestures and dialog wiring are Svelte actions in
`src/lib/actions/` … not inline component logic." This "arm hover only after a real mouse move"
pattern is exactly the pointer-activation gotcha the rules call out, and it's a reusable primitive
(any tile grid that opens under the pointer wants it), not ColoringBook-specific.

#### Proposed solution

Move it to `src/lib/actions/armHoverOnMouseMove.ts` as a reusable action that takes a callback or
toggles a returned rune. Keep the closure over `hoverArmed` by having the action accept a setter
param: `use:armHoverOnMouseMove={() => (hoverArmed = true)}`.

#### Verification

`npm run check`; visually confirm a tap on a hover-capable touchscreen doesn't leave a tile stuck in
hover chrome (the behavior this guards).

---

### [P2][design-tokens] Spacing and font sizes are raw px while colors/radii/durations use tokens

**File(s):** `web/src/lib/components/ColoringBook.svelte:190,194-198,206-228,254-269,341-372` —
pinned at SHA f934d43

#### Problem

The stylesheet correctly tokenizes color (`var(--surface-2)`, `var(--brand)`), radius
(`var(--radius-md)`), and motion (`var(--duration-*)`), but hardcodes every spacing and type value
even though `--space-1…8` and `--font-size-xs…3xl` exist:

```ts
.coloring-book-content { padding: 32px; }
.coloring-book-content h2 { margin: 0 0 20px 0; font-size: 24px; }
.coloring-book-header { gap: 12px; margin-bottom: 20px; }
.coloring-back-button { width: 36px; height: 36px; padding: 8px; }
.coloring-grid { gap: 12px; }
```

`--font-size-md` is used for the tile label (line 369), proving the tokens are in scope — so the raw
`font-size: 24px` on the h2 and the 8/12/20/32px spacing are inconsistent with the design system the
same file otherwise follows.

#### Proposed solution

Map each raw value to the nearest `--space-*` / `--font-size-*` token (e.g.
`padding: var(--space-8)` for 32px, `font-size: var(--font-size-2xl)` for the h2,
`gap: var(--space-3)` for 12px). Where an exact token doesn't exist, that's a signal to reconcile
with the design skill's scale rather than invent a px value.

#### Verification

`/dev/design` styleguide + visual diff of the picker before/after; values should be visually
unchanged if tokens are chosen to match.

---

### [P3][dead-code] `PLATFORMS` is exported and re-exported but never consumed; the catalog uses raw string literals instead

**File(s):** `web/src/lib/state/books.ts:76`, `124-237`;
`web/src/lib/state/coloringBook.svelte.ts:13` — pinned at SHA f934d43

#### Problem

`export const PLATFORMS = { WEB: 'web', MOBILE: 'mobile' } as const;` is defined and re-exported
through `coloringBook.svelte.ts`, but a repo-wide grep shows zero consumers — the `BOOKS` entries
all write `platforms: ['web', 'mobile']` as raw strings, and `booksForPlatform`/callers pass the
literals `'web'`/`'mobile'` (`ColoringBook.svelte:22`). The constant that exists to prevent
stringly-typed platform values is bypassed by the very data it was meant to guard.

#### Proposed solution

Either delete `PLATFORMS` (and its re-export) as dead code, or actually use it:
`platforms: [PLATFORMS.WEB, PLATFORMS.MOBILE]` and
`booksForPlatform(isNative() ? PLATFORMS.MOBILE : PLATFORMS.WEB)`. Given `BookPlatform` already
type-checks the literals, deletion is the simpler win.

#### Verification

Remove it, run `npm run check` + `npm run build:cap` — no reference breaks. Grep for `PLATFORMS`
returns nothing.

---

### [P3][type-safety] `Book.id`, `ColoringPage.id`, and `page()`'s `book`/`id`/`name` are bare `string`

**File(s):** `web/src/lib/state/books.ts:51-74,92-97` — pinned at SHA f934d43

#### Problem

`id: string` on both `Book` and `ColoringPage`, and the three positional strings on
`page(book, id, name, …)`, are an open type over a closed, hand-maintained set.
`BOOKS.find((b) => b.id === 'space')` (used in tests and `ColoringBook`) has no compile-time
guarantee `'space'` exists, and `setOverlayPage`/lookup code can't be narrowed. Combined with the P1
duplication of book id, nothing prevents a typo'd id from type-checking.

#### Proposed solution

At minimum brand the ids (`type BookId = string & { readonly __book: unique symbol }`) or, better,
derive a `BookId` union from the catalog (`type BookId = typeof BOOKS[number]['id']`) and type
lookups against it. If a full union is impractical because the catalog is data-first, a runtime
`bookById(id): Book | undefined` accessor at least funnels lookups through one greppable function.

#### Verification

`npm run check`; a deliberately misspelled `BOOKS.find(b => b.id === 'spce')` should fail to
type-check (or the accessor returns `undefined` at a single guarded call site).

---

### [P3][duplication] Four near-identical page accessors differ only by field and null-handling

**File(s):** `web/src/lib/state/books.ts:244-261` — pinned at SHA f934d43

#### Problem

```ts
export function pageImage(page, orientation) {
  return page.images[orientation];
}
export function pageColorImage(page, orientation) {
  return page.colorImages[orientation];
}
export function pageNightImage(page, orientation) {
  return page.nightImages[orientation] ?? null;
}
export function pageChalkImage(page, orientation) {
  return page.chalkImages[orientation] ?? null;
}
```

Four one-line functions, two guaranteed (`Record`) and two optional (`Partial<Record>`), each just
indexing a field. The asymmetry (string vs string|null) is meaningful but the repetition is
boilerplate that grows with each new asset variant.

#### Proposed solution

Keep the four public names (they read well at call sites and encode the return-type contract), but
note this is a symptom of the data model: a single
`variants: Record<VariantKind, Partial<Record<BookOrientation,string>>>` per page with one accessor
`pageAsset(page, kind, orientation): string | null` would collapse them. If the
guaranteed-vs-optional distinction is worth keeping, leave as-is but document why four exist. Low
urgency — flag rather than force.

#### Verification

If consolidated, existing accessor-based tests (`coloringBook.svelte.test.ts:49-81`) confirm
behavior parity.

---

### [P3][dead-code] `booksForPlatform`'s `?? ['web', 'mobile']` default is unreachable — every book sets `platforms`

**File(s):** `web/src/lib/state/books.ts:239-242`; every `BOOKS` entry sets `platforms`
(128,142,156,170,184,198,213,227) — pinned at SHA f934d43

#### Problem

```ts
return BOOKS.filter((book) => (book.platforms ?? ['web', 'mobile']).includes(platform));
```

The "omitting the field ⇒ ships everywhere" fallback (also documented in the header, lines 43-44) is
never exercised because all eight books declare `platforms: ['web', 'mobile']` explicitly. The
default is documented behavior with no test and no data path, so it can silently rot (e.g. the
`strip-native-assets` side that must agree may not honor the same default).

#### Proposed solution

Either make `platforms` required on `Book` and drop the `??` (removes a "both" magic literal
duplicated from the header), or keep the optional field and add one catalog entry / unit test that
omits `platforms` to lock the default. Prefer required unless the default is genuinely used.

#### Verification

Make `platforms` required → `npm run check` still passes (all books already set it), confirming the
branch was dead.

---

### [P3][readability] `ALL_ORIENTATIONS` exists but `bookAssetPaths` re-inlines `['portrait','landscape'] as BookOrientation[]` twice

**File(s):** `web/src/lib/state/books.ts:78,304,311` — pinned at SHA f934d43

#### Problem

`const ALL_ORIENTATIONS: BookOrientation[] = ['portrait', 'landscape'];` is defined and used in
`page()`, yet `bookAssetPaths` writes the array literal with an inline cast twice more:

```ts
(['portrait', 'landscape'] as BookOrientation[]).map((o) => page.nightImages[o]);
```

The cast is only needed because the literal isn't the typed constant. Two representations of "all
orientations" can diverge (add a `'square'` orientation and one gets missed).

#### Proposed solution

Reuse `ALL_ORIENTATIONS` in both `flatMap` blocks, dropping the casts. If a third orientation is
ever added, one edit covers `page()` and `bookAssetPaths`.

#### Verification

`npm run check`; `bookAssetPaths` tests unchanged.

---

### [P3][type-safety] The `'light' | 'dark'` theme union is re-typed in `pageThumb` instead of a shared `ResolvedTheme`

**File(s):** `web/src/lib/state/books.ts:279-283`; `web/src/lib/state/appearance.svelte.ts:26` —
pinned at SHA f934d43

#### Problem

`resolvedTheme(): 'light' | 'dark'` and `pageThumb(page, orientation, theme: 'light' | 'dark')` each
spell the union inline; `DrawingCanvas` compares `resolvedTheme() === 'dark'` in several places.
There's no `type ResolvedTheme`, so the two-value theme vocabulary isn't greppable and can't be
extended in one place.

#### Proposed solution

Export `type ResolvedTheme = 'light' | 'dark'` from `appearance.svelte.ts`, have `resolvedTheme`
return it and `pageThumb`'s `theme` param use it.

#### Verification

`npm run check`; grep for `'light' | 'dark'` collapses to the single type definition.

---

### [P3][readability] Header comment claims the module is "plain JS" when it is TypeScript

**File(s):** `web/src/lib/state/books.ts:2-4` — pinned at SHA f934d43

#### Problem

```ts
// where each one is allowed to ship. This file is intentionally plain JS (no
// Svelte runes) so it can be imported both by the app and by Node build scripts
```

The file is `.ts` with interfaces and typed exports throughout — not "plain JS." The intended point
is "no Svelte runes, so Node build scripts can import it," but "plain JS" is factually wrong and
could mislead someone into thinking they can't add types here.

#### Proposed solution

Reword to "intentionally rune-free (no `.svelte.ts`) so Node build scripts … can import it."

#### Verification

Doc-only; read-through confirms accuracy.

---

### [P3][duplication] `hoverArmed = false` reset duplicated across both navigation handlers

**File(s):** `web/src/lib/components/ColoringBook.svelte:89-96` — pinned at SHA f934d43

#### Problem

```ts
function selectBook(book: Book) {
  activeBook = book;
  hoverArmed = false;
}
function goToBooks() {
  activeBook = null;
  hoverArmed = false;
}
```

Every view transition must remember to disarm hover; the coupling ("changing the visible grid resets
hover") is implicit and repeated, so a future third navigation path can forget it and reintroduce
the stuck-hover bug the arming logic exists to prevent.

#### Proposed solution

Route both through a single `showView(book: Book | null)` that sets `activeBook` and always resets
`hoverArmed`, or make `hoverArmed` reset a `$derived`/effect keyed on `activeBook` so it can't be
forgotten. `selectBook`/`goToBooks` become one-liners calling `showView`.

#### Verification

`npm run check`; tap a book tile then back out on a touchscreen and confirm no tile is stuck armed.

---

### [P4][design-tokens] Hardcoded brand RGB `171,113,225` fallback will silently drift from `--brand`

**File(s):** `web/src/lib/components/ColoringBook.svelte:296-298` — pinned at SHA f934d43

#### Problem

```ts
box-shadow: 0 4px 12px rgba(171, 113, 225, 0.25);
box-shadow: 0 4px 12px color-mix(in srgb, var(--brand) 25%, transparent);
```

The rgba line is the documented pre-`color-mix` fallback (same pattern as the label at 365-368), so
it's intentional — but it bakes `--brand`'s literal RGB into the component. If the brand token is
retuned, this fallback keeps the old color on browsers that hit it, and nothing links the two. The
`4px`/`12px` offsets are also raw.

#### Proposed solution

If the compat floor still needs a color-mix fallback (per `docs/COMPATIBILITY.md`), centralize a
`--brand-shadow` token (or a `--brand-rgb` triple) so the literal lives once beside `--brand`;
otherwise drop the fallback if the floor now supports `color-mix` unconditionally. Tokenize the
offsets against the elevation scale.

#### Verification

Check `docs/COMPATIBILITY.md` for whether the color-mix fallback is still required at the current
floor; visual diff of tile hover shadow.

---

### [P4][maintainability] Comment hardcodes "eight full covers" — drifts as the catalog grows

**File(s):** `web/src/lib/components/ColoringBook.svelte:32-34` — pinned at SHA f934d43

#### Problem

```ts
// paints instantly instead of fetching eight full covers on demand.
$effect(() => scheduleIdle(() => prefetchImages(books.map((book) => thumbPath(book.cover)))));
```

There are currently eight books, but the count is derived from `BOOKS`. The comment will silently
lie the moment a ninth book ships, and it also says "full covers" when the code prefetches
`thumbPath(book.cover)` (the thumbnail, not the full cover).

#### Proposed solution

Drop the count and correct "covers" → "cover thumbnails": "…instead of fetching every book's cover
thumbnail on demand."

#### Verification

Doc-only read-through.

---

### [P4][readability] Stale migration comment references a `.js` module that no longer exists

**File(s):** `web/src/lib/state/coloringBook.svelte.ts:1-3` — pinned at SHA f934d43

#### Problem

```ts
// Re-exported here so existing `$lib/state/coloringBook.svelte.js` imports
// keep working.
```

The comment justifies the re-export by a `.js` import path from a prior migration. If no source
still imports the `.js` path (the codebase is TS-only per CLAUDE.md), the rationale is historical
noise that misleads a reader into thinking a JS consumer exists.

#### Proposed solution

Verify no `.svelte.js` import remains; if none, reword to state the real reason (this rune module is
the app-facing surface that re-exports the rune-free catalog), or drop the sentence.

#### Verification

Grep `coloringBook.svelte.js` across the repo → if zero hits, the comment is stale.

---

### [P4][design-tokens] Magic breakpoints and modal max-width are unshared literals

**File(s):** `web/src/lib/components/ColoringBook.svelte:183,341` — pinned at SHA f934d43

#### Problem

`max-width: min(920px, calc(100vw - 32px))` and `@media (max-width: 520px)` embed layout constants
with no shared source. Other components almost certainly define their own `520px`/`920px`-ish
breakpoints, so the app's responsive thresholds aren't coordinated and can't be adjusted centrally.

#### Proposed solution

Pull the breakpoint into a shared value (CSS custom media / a documented breakpoint token in the
design system) and the modal max-width into a modal sizing token, per the design skill. At minimum,
name the `520px` threshold consistently with other components.

#### Verification

Grep other components for the same px thresholds to confirm the duplication before consolidating;
visual check at the boundary widths.

---

### [P5][readability] Page-grid column counts are restated across three breakpoints

**File(s):** `web/src/lib/components/ColoringBook.svelte:263-269,341-357` — pinned at SHA f934d43

#### Problem

`.coloring-pages-grid` (2 cols), `.portrait-pages` (3 cols), then the `max-width: 520px` block
resets both back to 2:

```ts
.coloring-pages-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.coloring-pages-grid.portrait-pages { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 520px) {
  .coloring-pages-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }        /* same as base */
  .coloring-pages-grid.portrait-pages { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

The non-portrait override inside the media query is a no-op (identical to the base rule), and the
column counts (2/3/2) are scattered magic numbers describing one responsive intent.

#### Proposed solution

Drop the redundant `.coloring-pages-grid` rule inside the media query (base already sets 2), and
express the intent via a single `--page-cols` custom property flipped by orientation/breakpoint, so
`grid-template-columns: repeat(var(--page-cols), minmax(0,1fr))` appears once.

#### Verification

Visual check of the pages grid at desktop portrait/landscape and at ≤520px; column counts unchanged.

## Source: Code audit — Misc lib utilities + Audio

### [P2][architecture] Scatter of platform/device utilities across `lib/` root hurts grepability — group under one folder

**File(s):** `web/src/lib/platform.ts`, `deviceInfo.ts`, `deviceReport.ts`, `orientation.ts`,
`safeArea.ts`, `haptics.ts`, `notchBand.ts` (whole files) — pinned at SHA f934d43

#### Problem

Seven closely-related "what device / platform am I on and how do I adapt to it" modules sit loose in
the `lib/` root, interleaved with unrelated utilities (`idle.ts`, `latestRequest.ts`, `storage.ts`,
`imagePrefetch.ts`, …). They form a natural cluster — `deviceInfo.ts` imports `platform.ts`;
`orientation.ts` imports `platform.ts`; `notchBand.ts` imports `platform`'s `Platform` type;
`safeArea.ts` feeds `notchBand`/`layout`; `haptics.ts` imports `platform.ts`. Someone trying to
answer "where does the app detect iOS / read insets / lock rotation?" has to already know each
filename. The task brief flags grepability/discoverability as a primary theme and this is its
clearest instance.

#### Proposed solution

Move the platform/device cluster into a `web/src/lib/platform/` (or `device/`) barrel:
`platform/detect.ts` (current `platform.ts`), `platform/deviceInfo.ts`, `platform/deviceReport.ts`,
`platform/orientation.ts`, `platform/safeArea.ts`, `platform/haptics.ts`, `platform/notchBand.ts`,
plus an `index.ts` re-export. Update the `architecture` skill's file map and the `$lib/...` import
paths. Colocated tests move with their modules. This is a pure move (no behavior change); ignore the
one-time churn per the brief.

#### Verification

`npm run check` + `npm test` green after the move; `git grep "from '\$lib/platform'"` and friends
resolve; the `architecture` skill map lists the new folder.

---

### [P2][duplication] `Orientation = 'portrait' | 'landscape'` is redeclared in ~8 places

**File(s):** `web/src/lib/notchBand.ts:38`, `web/src/lib/state/layout.svelte.ts:4`,
`web/src/lib/orientation.ts:5` (`OrientationLockType`), plus inline copies in
`web/src/lib/state/books.ts:49`, `state/canvas.svelte.ts:18`, `drawing/engine.ts:258`,
`components/ParentCenter.svelte:60`, `tests/global.d.ts:48` — pinned at SHA f934d43

#### Problem

The literal union `'portrait' | 'landscape'` is defined independently as `Orientation` in
`notchBand.ts` and `layout.svelte.ts`, as `OrientationLockType` in `orientation.ts`, as
`BookOrientation` in `books.ts`, and inlined anonymously in at least four more spots. `notchBand.ts`
even imports `Platform` from `platform.ts` but redefines `Orientation` locally instead of sharing
one. Any change (e.g. adding a `'square'`/`'auto'` case) touches every copy, and there's no single
grep target for "the orientation type."

#### Proposed solution

Export one canonical `export type Orientation = 'portrait' | 'landscape'` from the platform module
(naturally alongside `Platform` in `platform.ts` / the proposed `platform/detect.ts`), and have
`layout.svelte.ts`, `notchBand.ts`, `orientation.ts` (`OrientationLockType = Orientation`),
`books.ts`, `engine.ts`, `canvas.svelte.ts`, and `ParentCenter.svelte` import it. Keep
semantically-distinct aliases (e.g. `BookOrientation`) as `type BookOrientation = Orientation` if
the name adds meaning.

#### Verification

`git grep "'portrait' | 'landscape'"` returns only the single definition (plus deliberate value
literals); `npm run check` passes.

---

### [P2][duplication] Three uncoordinated writers to `<meta name="theme-color">`; NotchBand re-inlines the setter

**File(s):** `web/src/lib/theme.ts:50-54` (`updateThemeColorMeta`),
`web/src/lib/components/NotchBand.svelte:31-34`, `web/src/app.html:24` — pinned at SHA f934d43

#### Problem

`theme.ts` owns a pure setter `updateThemeColorMeta()` that does
`document.querySelector('meta[name="theme-color"]')?.setAttribute('content', …)`, driven by
`appearance.svelte.ts` to reflect the resolved light/dark theme. But `NotchBand.svelte:33` writes
the *same* meta element directly with the active drawing color, re-inlining the exact
`querySelector('meta[name="theme-color"]')?.setAttribute(...)` string rather than reusing a shared
setter:

```js
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', band.themeColor);
```

Two reactive sources fight over one DOM element with no defined precedence (last effect to run
wins), and the selector/attribute logic is duplicated. A future change to the meta mechanism (e.g. a
second meta for `media`) must be made in two places that don't know about each other.

#### Proposed solution

Extract a single low-level `setThemeColorMeta(color: string)` in `theme.ts` and have both
`updateThemeColorMeta` and NotchBand call it, so the DOM write lives in one place. Document the
ownership rule (NotchBand's active-color write is the intended override while drawing; appearance's
resolved-theme write is the baseline) in a comment or ADR reference, since ADR-0052 already notes
"the only JS followers are the theme-color meta and the Notch Band."

#### Verification

`git grep "meta\[name=\"theme-color\"\]"` in `src/` (excluding tests) resolves to one setter;
`appearance.svelte.test.ts` still passes; manual check that drawing color still reaches the
Android-web status bar.

---

### [P2][maintainability] `drawingSound.ts` audio graph is five module-level mutable globals — untestable singleton

**File(s):** `web/src/lib/audio/drawingSound.ts:13-17` (module state), `19-104` (all functions) —
pinned at SHA f934d43

#### Problem

The entire Web Audio lifecycle hangs off module-scope `let`s: `audioContext`, `buffers`,
`loadStarted`, `currentSource`, `currentGain`. Every function mutates them by side effect. There is
no unit test for this file (unlike its neighbors), and there can't easily be one — you can't
construct an isolated instance, reset state between cases, or inject a fake `AudioContext`. It also
means two consumers (the canvas and `SoundSection.svelte`'s preview) share one graph, so a preview
during an active stroke would stomp `currentSource`.

#### Proposed solution

Wrap the state in a factory returning a small object, mirroring `createLatestRequest()`'s pattern:

```ts
export function createDrawingSound(deps?: { audioContext?: () => AudioContext | null }): {
  preload(): void;
  play(speed: number): void;
  stop(): void;
};
```

Export a default singleton (`export const drawingSound = createDrawingSound()`) plus the named
functions for back-compat, or migrate the two callers. This makes the node lifecycle testable
(assert one buffer source per stroke, gain disconnect on stop) and lets the preview own its own
graph.

#### Verification

Add a Vitest suite with a stubbed `AudioContext` asserting: `play` creates exactly one source per
start, `stop` ramps to 0 and disconnects, volume scales with `speed`. Existing `dragToClear.test.ts`
mock of `stopDrawSound` still works.

---

### [P3][duplication] `volumeMultiplier()` re-clamps a value `settings` already clamped, with magic `/ 50`

**File(s):** `web/src/lib/audio/drawingSound.ts:19-21` and `81`;
`web/src/lib/state/settings.svelte.ts:108-111` — pinned at SHA f934d43

#### Problem

```ts
function volumeMultiplier() {
  return Math.max(0, Math.min(settings.soundVolume, 100)) / 50;
}
```

`settings.soundVolume` is already clamped to `0..100` by `clampVolume()` on every read/write, so the
`Math.max(0, Math.min(…, 100))` is dead defensiveness. The `/ 50` is an unexplained magic number —
it means "50 is the authored/normal volume, so 50→1.0×, 100→2.0×", but nothing says so (the
equivalent constant `SOUND_VOLUME_DEFAULT = 50` lives in `settings`). Combined with
`SOUND_VOLUME = 0.2` at line 5, the final gain math `SOUND_VOLUME * volumeMultiplier() * …` is three
magic numbers deep.

#### Proposed solution

Drop the redundant clamp (`return settings.soundVolume / NORMAL_VOLUME`), and name the divisor:
`const NORMAL_VOLUME = SOUND_VOLUME_DEFAULT;` (import from settings) or a local
`const NORMAL_SOUND_VOLUME = 50` with a one-line WHY. Rename `SOUND_VOLUME` (line 5) to something
like `BASE_SCRATCH_GAIN` since it's a base gain, not a "volume" in the settings sense.

#### Verification

`npm run check`; the new drawingSound unit test (above) asserts gain at `soundVolume=50` equals
`BASE_SCRATCH_GAIN` at full speed.

---

### [P3][duplication] User-agent OS/device parsing duplicated between `deviceInfo.ts` and `platform.ts`

**File(s):** `web/src/lib/deviceInfo.ts:64-78` (`osFromUserAgent`), `web/src/lib/platform.ts:38-49`
(`isIosDevice`, `isAndroidBrowser`) — pinned at SHA f934d43

#### Problem

`platform.ts` sniffs the UA for iOS (`/iPad|iPhone|iPod/`) and Android (`/android/i`);
`deviceInfo.ts` independently re-parses the same UA for `Android ([0-9.]+)`,
`(?:iPhone|iPad|iPod).*?OS ([0-9_]+)`, etc. Two modules own UA-regex knowledge, so a UA quirk (e.g.
the iPadOS-masquerades-as-Mac case that `platform.ts` handles at line 42 but `osFromUserAgent` does
not) is fixed in one and missed in the other.

#### Proposed solution

Centralize UA parsing in the platform module: expose the raw sniff helpers plus a
`osLabelFromUserAgent(ua)` and let `deviceInfo.ts` import it, so there's one place that knows how to
read a UA. At minimum, move `osFromUserAgent` next to `isIosDevice`/`isAndroidBrowser` in
`platform.ts`.

#### Verification

`git grep -n "iPhone|iPad|iPod"` in `src/lib` shows UA regexes in one module; `npm run check`.

---

### [P3][performance] `measureSafeAreaInsets()` creates + appends + reflows a probe on every resize/orientation event

**File(s):** `web/src/lib/safeArea.ts:16-37`; caller
`web/src/lib/state/layout.svelte.ts:55-64,68-78` — pinned at SHA f934d43

#### Problem

Each call does `createElement` → `appendChild` → `getBoundingClientRect` (a forced synchronous
layout) → `remove`. `layout.svelte.ts` calls it from `syncViewport`, which is wired to `resize`,
`orientationchange`, and `visibilitychange`. `resize` can fire many times per second during a
drag/rotate animation, so every burst churns DOM nodes and forces a reflow mid-frame — exactly the
kind of jank the `profiling` skill warns about.

#### Proposed solution

Reuse one persistent hidden probe element (create lazily, keep it in the body, never remove it) so
each measurement is just a `getBoundingClientRect` read; or debounce/rAF-coalesce `syncViewport`'s
`resize` handling. The probe can stay `visibility:hidden;pointer-events:none` permanently at zero
cost.

#### Verification

Profile a rotate/resize with the `profiling` harness before/after; assert no forced-reflow spike
from `safeArea`. Insets still resolve correctly on a notched device.

---

### [P3][type-safety] `playDrawSound`'s param is a loose inline type named `movementData` — should share the engine's `DrawSoundData`

**File(s):** `web/src/lib/audio/drawingSound.ts:57`, `80`; `web/src/lib/drawing/engine.ts:96-98`
(`DrawSoundData`), `905` (call site) — pinned at SHA f934d43

#### Problem

```ts
export function playDrawSound(movementData: { speed?: number } = {}) { … const { speed = 0 } = movementData; … }
```

The engine defines `interface DrawSoundData { speed: number }` and always calls
`onDrawSoundCallback({ speed })`, but `playDrawSound` accepts a *different*, looser inline shape
(`speed?` optional, whole arg optional) and re-defaults `speed`. The two definitions can drift
silently, and the name `movementData` overpromises — the object carries only a speed. It reads as a
leftover from a richer former signature.

#### Proposed solution

Export `DrawSoundData` from the engine (or a shared type module) and type the param
`playDrawSound(data: DrawSoundData)`. Rename the param to `data` or destructure directly:
`playDrawSound({ speed }: DrawSoundData)`. Keep the `= { speed: 0 }` default only if
`SoundSection.svelte`'s preview needs a no-arg call — it currently passes
`{ speed: PREVIEW_SPEED }`, so the default is unused and can go.

#### Verification

`npm run check`; grep call sites (`DrawingCanvas.svelte:155`, `SoundSection.svelte:20`) still
typecheck.

---

### [P3][type-safety] `getPlatform()` casts an arbitrary string to `Platform` without validating

**File(s):** `web/src/lib/platform.ts:53-56` — pinned at SHA f934d43

#### Problem

```ts
export function getPlatform(): Platform {
  if (!browser) return 'web';
  return (globalThis.Capacitor?.getPlatform?.() ?? 'web') as Platform;
}
```

`Capacitor.getPlatform()` is typed `string`; the `as Platform` promises it's one of
`'android' | 'ios' | 'web'` with no runtime check. A future Capacitor platform (or a shimmed
environment) would be silently mistyped, and downstream `PLATFORM_LABEL[platform]` / branch logic
would be reasoning about a lie.

#### Proposed solution

Validate:
`const p = globalThis.Capacitor?.getPlatform?.() ?? 'web'; return p === 'android' || p === 'ios' ? p : 'web';`.
This also removes the cast.

#### Verification

`npm run check`; unit test asserts an unexpected platform string collapses to `'web'`.

---

### [P3][type-safety] `PLATFORM_LABEL` typed `Record<string, string>` defeats exhaustiveness against `Platform`

**File(s):** `web/src/lib/deviceInfo.ts:7`, used `24` — pinned at SHA f934d43

#### Problem

```ts
const PLATFORM_LABEL: Record<string, string> = { web: 'Web', ios: 'iOS', android: 'Android' };
```

Keyed by `string`, so TypeScript won't flag a missing platform or a typo'd key, and the
`?? platform` fallback at line 24 silently papers over a gap. The union `Platform` already exists
two imports away.

#### Proposed solution

`const PLATFORM_LABEL: Record<Platform, string> = { web: 'Web', ios: 'iOS', android: 'Android' };`.
Now adding a `Platform` member without a label is a compile error, and the `?? platform` fallback
becomes dead (can drop or keep as belt-and-suspenders).

#### Verification

`npm run check` errors if a `Platform` member is unlabeled.

---

### [P3][naming] `supportsOrientationLock` hides its tablet cutoff behind a bare `600`

**File(s):** `web/src/lib/platform.ts:90-94` — pinned at SHA f934d43

#### Problem

```ts
return Math.min(window.screen.width, window.screen.height) < 600;
```

The `600` is the phone/tablet split (a device with a short side ≥ 600 CSS px is treated as a tablet
that owns its own orientation). It's a load-bearing heuristic explained at length in the doc comment
above, but the actual threshold is an unnamed literal buried in the return, so a reader scanning the
code (not the essay) sees a magic number and grepping for the tablet cutoff finds nothing.

#### Proposed solution

`const TABLET_MIN_SIDE_PX = 600;` (with a one-line WHY pointing at the doc comment) and use it in
the comparison.

#### Verification

`npm run check`; the constant is greppable.

---

### [P3][complexity] `collectDeviceInfo` is a ~40-line function mixing web + native collection

**File(s):** `web/src/lib/deviceInfo.ts:20-60` — pinned at SHA f934d43

#### Problem

The function seeds base fields, then branches into a native path (dynamic-import
`@capacitor/device`, merge OS/model/language, UA fallback) and a web path (display mode, UA OS, full
UA), all inline. The two collection strategies are logically separable but interleaved, and the
`try/catch` + fallback nesting makes the native arm the densest part of the file.

#### Proposed solution

Extract `async function collectNativeDeviceInfo(info: DeviceInfo): Promise<void>` and
`function collectWebDeviceInfo(info: DeviceInfo): void`, leaving `collectDeviceInfo` as the ~10-line
orchestrator (seed → `browser` guard → common screen/viewport fields → branch). Keep the
`__IS_CAPACITOR__` gate at the call site so tree-shaking is unaffected.

#### Verification

`npm run check`; `ReportForm.svelte` still gets the same payload; add a node-env unit test for the
web arm (UA→OS mapping) which currently has none.

---

### [P3][naming] `haptics.ts` web-fallback vibrates for a magic `15` ms

**File(s):** `web/src/lib/haptics.ts:31` — pinned at SHA f934d43

#### Problem

```ts
navigator.vibrate?.(15);
```

`15` is the fallback vibration duration (ms) that's meant to approximate the native
`ImpactStyle.Medium` "click." It's undocumented and un-named; anyone tuning the feel has to know
this line exists.

#### Proposed solution

`const WEB_IMPACT_MS = 15;` at module top with a comment tying it to the native Medium impact it
mimics.

#### Verification

`npm run check`; greppable constant.

---

### [P4][performance] `playDrawSound` calls `preloadDrawSounds()` on every pointermove

**File(s):** `web/src/lib/audio/drawingSound.ts:57-59`; engine call site `drawing/engine.ts:905` —
pinned at SHA f934d43

#### Problem

`onDrawSoundCallback({ speed })` fires on every `pointermove` (engine line 905), and `playDrawSound`
starts with `preloadDrawSounds()`. Preload early-returns on `loadStarted`, but it's still a function
call + branch on the hottest path in the app (every move of every stroke). It reads as defensive
coupling — preload is already triggered from `DrawingCanvas.svelte:215` via `scheduleIdle` and on
the first `pointerdown`.

#### Proposed solution

Move the `preloadDrawSounds()` call into the stroke-start branch (inside `if (!currentSource)`),
where it's needed at most once per stroke, rather than per move. The `if (!ctx || !buffers) return`
guard already handles the not-yet-loaded case.

#### Verification

`profiling` harness shows the per-move path unchanged in behavior; sound still starts on first
stroke of a fresh load.

---

### [P4][maintainability] `orientation.ts` memoizes through a module-level `lastRequested` — hidden global, hard to reset

**File(s):** `web/src/lib/orientation.ts:12`, `27-29` — pinned at SHA f934d43

#### Problem

`let lastRequested` at module scope caches the last requested lock target to skip redundant plugin
calls. Like `drawingSound`'s globals, this is invisible mutable state: it can't be reset for tests,
and a hot-reload / re-entrant scenario carries stale state. There's no unit test for this module
(the notchBand pure layer exists precisely to avoid this pattern, but
`applyDeviceOrientationPreference` keeps the impure state inline).

#### Proposed solution

Either accept it as pragmatic (document why) or lift the pure decision — `settings → target` mapping
and the "changed since last?" check — into a testable helper, leaving only the plugin call impure.
Given `notchBand.ts` set the precedent of a pure decision layer for exactly this file family, a
`resolveOrientationTarget(settings): 'portrait'|'landscape'|'unlocked'` pure function would be
consistent and testable.

#### Verification

`npm run check`; if extracted, a node-env unit test covers the
`lockRotationEnabled × forceLandscape` matrix.

---

### [P4][type-safety] Loose feature-detection casts for `navigator.standalone` and screen-orientation lock

**File(s):** `web/src/lib/platform.ts:29` (`window.navigator as { standalone?: boolean }`),
`web/src/lib/orientation.ts:7-10`, `50` (`LockableScreenOrientation`) — pinned at SHA f934d43

#### Problem

Both files hand-roll ad-hoc structural casts to reach non-standard/optional web APIs:
`(window.navigator as { standalone?: boolean }).standalone`, and
`window.screen.orientation as LockableScreenOrientation | undefined`. These are the classic "the
lib.dom types don't know about this API" casts, scattered and repeated (the `standalone` cast in
particular is the same shape `deviceInfo.ts` and `platform.ts` both need for iOS PWA detection).

#### Proposed solution

Declare the augmentations once in `web/src/app.d.ts` (a `Navigator.standalone?: boolean` and
`ScreenOrientation.lock?/unlock?` global interface merge), so call sites read `navigator.standalone`
and `screen.orientation.lock` without inline casts. This is the idiomatic home given `app.d.ts`
already augments `globalThis.Capacitor`.

#### Verification

`npm run check` with the inline casts removed; behavior unchanged.

---

### [P4][naming] `THEME_COLOR_LIGHT` hardcodes `'#ffffff'` while its dark twin reads from a token

**File(s):** `web/src/lib/theme.ts:30-31` — pinned at SHA f934d43

#### Problem

```ts
const THEME_COLOR_LIGHT = '#ffffff';
const THEME_COLOR_DARK = themes.dark.appBg;
```

ADR-0071 made design tokens the single source of truth and the dark value dutifully reads
`themes.dark.appBg`, but the light value is a hand-typed `'#ffffff'` with a comment saying it
matches "app.html's original white." If `themes.light.appBg` (or app.html's meta) ever changes, this
silently drifts — the exact failure mode ADR-0071 set out to kill.

#### Proposed solution

Source it from the token: `const THEME_COLOR_LIGHT = themes.light.appBg;` (verify that token is
`#ffffff` today). If light theme-color is deliberately app-bg-white rather than paper, name that
intent; otherwise unify with the dark path.

#### Verification

`appearance.svelte.test.ts` still asserts the light meta value; `npm run check`.

---

### [P4][maintainability] `stopDrawSound` disconnects the gain node but never the source node

**File(s):** `web/src/lib/audio/drawingSound.ts:85-95` — pinned at SHA f934d43

#### Problem

```ts
currentSource.stop(now + STOP_RAMP_S);
const gain = currentGain;
currentSource.onended = () => gain.disconnect();
```

On stop, only the `GainNode` is disconnected (via `onended`); the `AudioBufferSourceNode` is stopped
but never explicitly `disconnect()`-ed. A stopped source is GC-eligible once `onended` fires, so
this isn't a hard leak, but the asymmetric cleanup (gain handled, source not) is a lifecycle smell —
and if `onended` never fires (e.g. context already closed), the gain stays connected. One stroke
starts exactly one source + gain, so over a long session this is the only teardown path.

#### Proposed solution

In the `onended` handler disconnect both:
`currentSource.onended = () => { source.disconnect(); gain.disconnect(); }` (capture `source` like
`gain` is captured). Fold this into the `createDrawingSound` factory refactor above and assert it in
the new test.

#### Verification

New drawingSound unit test asserts both nodes disconnected after `stop` + `onended`.

---

### [P4][naming] `deviceInfo.ts` vs `deviceReport.ts` split isn't self-evident from the names

**File(s):** `web/src/lib/deviceInfo.ts`, `web/src/lib/deviceReport.ts` — pinned at SHA f934d43

#### Problem

Two files whose names both say "device + noun" own different halves: `deviceInfo.ts` *collects* a
snapshot (browser/native, client-only), `deviceReport.ts` holds the *shared shape + label ordering +
server-side sanitizer* (dependency-free, used by both client and `/api/report`). Nothing in the
names conveys "collector" vs "shared schema," so a reader looking for where the `DeviceInfo` type
lives, or where sanitization happens, has to open both. The `DeviceInfo` interface actually living
in `deviceReport.ts` (not `deviceInfo.ts`) is a mild surprise.

#### Proposed solution

Rename for role clarity, e.g. `collectDeviceInfo.ts` (or `deviceInfo.client.ts`) for the collector
and `deviceReport.ts` / `deviceInfo.shared.ts` for the schema — or merge the schema into a
`deviceReport` that the collector imports, and note the split in a one-line header on each. Low
urgency; do it if the platform-folder move (P2) is done anyway.

#### Verification

`npm run check`; imports in `ReportForm.svelte` and `api/report/+server.ts` updated.

---

### [P4][type-safety] `currentGain!` non-null assertion in `playDrawSound`

**File(s):** `web/src/lib/audio/drawingSound.ts:82` — pinned at SHA f934d43

#### Problem

```ts
rampGainTo(currentGain!.gain, target, ctx.currentTime, GAIN_RAMP_S);
```

The `!` asserts `currentGain` is set. It's true today (the `if (!currentSource)` block always
assigns `currentGain` alongside `currentSource`, and the early `if (!ctx || !buffers) return` guards
the rest), but the invariant "`currentSource` set ⟺ `currentGain` set" is implicit across two
branches — a refactor that sets one without the other would crash at runtime past the compiler. It's
the kind of coupled-nullable pair the factory refactor (P2 above) would let you model as a single
non-null object.

#### Proposed solution

In the `createDrawingSound` refactor, hold `{ source, gain }` as one nullable object so the pair is
atomically set/cleared and the `!` disappears. Short term, pull `currentGain` into a local after the
start block: `const gain = currentGain; if (!gain) return;`.

#### Verification

`npm run check` with no non-null assertion; new unit test exercises the start-then-ramp path.

---

### [P5][dead-code] `osFromUserAgent` carries a Windows-only branch the app can't reach meaningfully

**File(s):** `web/src/lib/deviceInfo.ts:72-74` — pinned at SHA f934d43

#### Problem

`osFromUserAgent` maps `Windows NT 10` → `'Windows 10/11'` and other `Windows NT` versions, but this
is a toddler drawing app whose web target is overwhelmingly mobile/tablet, and the function's own
comment notes the raw UA is *always* sent alongside on web, so a Windows miss "loses nothing." The
Windows branches add parsing surface for a value that is redundant (raw UA present) on the only
platform (web) where a Windows UA can appear — native builds are Android/iOS only.

#### Proposed solution

This is minor; either keep it (harmless) or trim the OS map to the platforms the app actually
targets (Android/iOS/macOS/ChromeOS/Linux), relying on the always-attached raw UA for the desktop
long tail. Not worth churn on its own — fold into the P3 `collectDeviceInfo` extraction if touched.

#### Verification

`deviceReport`/web-arm unit test still maps mobile UAs correctly; raw UA still attached on web.

## Source: Code audit — tools/asset-gen · bin (pipeline CLIs)

### [P1][duplication] Extract the six near-identical Gemini `generateContent` wrappers into `lib/gemini.mjs`

**File(s):** `tools/asset-gen/bin/gen-coloring-fills.mjs:75-97` (`generateColoredPage`);
`gen-coloring-fills-dark.mjs:119-141` (`generateDarkPage`); `gen-coloring-chalk.mjs:253-278`
(`drawChalk`); `normalize-outline-strokes.mjs:111-136` (`editLineArt`);
`gen-coloring-outlines-fresh.mjs:84-97` (`generateOutline`); `gen-style-covers.mjs:29-52`
(`generateStyledImage`) — pinned at SHA f934d43

#### Problem

Every generator hand-rolls the same call: build
`contents: [{ role:'user', parts:[{inlineData:{mimeType, data: Buffer.from(...).toString('base64')}}, {text: prompt}] }]`,
set
`config: { abortSignal: AbortSignal.timeout(120_000), ...(temperature === undefined ? {} : { temperature }) }`,
then `classifyGeminiResponse(response)` and
`if (classified.kind !== 'image') throw new Error(\`${classified.kind}:
${classified.reason}\`)`. Six copies differ only in the prompt, the webp quality, and (fresh) an`imageConfig.aspectRatio`/ text-only contents. This is the single largest duplicated block in the directory, and the`120_000`
timeout plus the base64 dance is repeated verbatim each time.

#### Proposed solution

Add `lib/gemini.mjs`:

```
export const IMAGE_MODEL = 'gemini-3.1-flash-image';
export const GENERATE_TIMEOUT_MS = 120_000;
export function makeClient() // reads GEMINI_API_KEY, throws via fail if absent
export async function generateImage(ai, { imageBytes, mimeType, prompt, temperature, aspectRatio })
  // builds contents (text-only when imageBytes omitted), applies timeout + optional temperature/imageConfig,
  // classifies, returns { bytes, mimeType } or throws the refusal reason
```

Each bin then calls `generateImage(ai, { imageBytes, mimeType, prompt: FILL_PROMPT, temperature })`.
Keep the per-script prompt constants; only the transport moves.

#### Verification

`grep -c 'AbortSignal.timeout' bin/*.mjs` drops from 6 to 0; `grep -rl classifyGeminiResponse bin/`
shows only imports of the new helper. Re-run `npm run gen:style-covers -- --style Crayon` (or any
generator with a key) and confirm identical output bytes.

---

### [P1][duplication] Extract the keep-best-of-N retry ladder shared by all five generators

**File(s):** `gen-coloring-fills.mjs:170-219` (`passes`/`rank`/`renderClean`);
`gen-coloring-fills-dark.mjs:253-325` (`generateCleanTake`); `gen-coloring-chalk.mjs:296-411`
(`passes`/`rank` + attempt loop); `gen-coloring-outlines-fresh.mjs:152-219`;
`normalize-outline-strokes.mjs:151-297` — pinned at SHA f934d43

#### Problem

Every generator implements the same control structure: a `passes(cand)` predicate, a `rank(cand)`
tie-breaker, then a loop `for (attempt = 0..maxAttempts)` computing
`const temperature = Math.min(2, base + attempt * 0.15)` (0.1 in fresh, `(attempt-1)*0.15` in dark),
generating, scoring, `if (!best || rank(cand) > rank(best)) best = cand;` and
`if (passes(cand)) break;`. The `Math.min(2, base + attempt*0.15)` clamp alone is copy-pasted in
five files (confirmed at fills:186, dark:271, chalk:400, fresh:164, normalize:270). This is the #1
structural pattern in the directory and is reimplemented each time with subtle drift (dark tracks
`bestAccept` vs `best`; the increment differs).

#### Proposed solution

Add `lib/attempt-ladder.mjs`:

```
export function ladderTemperature(base, attempt, step = 0.15) { return Math.min(2, base + attempt * step); }
export async function keepBestOfN({ maxAttempts, baseTemp, step, render, score, passes, rank })
  // loops, tracks best by rank, breaks on passes, returns { best, attemptsRun }
```

The generators supply their own `render`/`score`/`passes`/`rank` closures. dark's two-tier
accept/fallback can be modeled by having `rank` fold acceptability in (as chalk/fills already do),
or by an optional `accept` predicate.

#### Verification

Unit-test `ladderTemperature`. Re-run `gen:coloring-fills -- <page>` and confirm the same attempt
count and scores print; diff a golden freeze (`npm run gen:coloring-golden:diff`) shows no
regression.

---

### [P2][duplication] Centralize the `MODEL`, `WEBP_QUALITY`, and timeout constants

**File(s):** `MODEL = 'gemini-3.1-flash-image'` at gen-coloring-fills.mjs:47,
gen-coloring-fills-dark.mjs:76, gen-coloring-chalk.mjs:69, normalize-outline-strokes.mjs:52,
gen-coloring-outlines-fresh.mjs:32, gen-style-covers.mjs:21; `WEBP_QUALITY` at fills:48 (90),
dark:78 (90), chalk:70 (92), normalize:53 (92), fresh:33 (90), covers:24 (75) — pinned at SHA
f934d43

#### Problem

The model id is duplicated in six files. When the catalog migrates models again (there is already a
`docs/gemini-3.1-migration.md` run record for exactly this), all six must change in lockstep — a
grep-and-replace hazard, and nothing enforces they stay equal. `WEBP_QUALITY` is likewise scattered
with two different values (90 vs 92) and no named rationale for the split.

#### Proposed solution

Export `IMAGE_MODEL` and encode settings from `lib/gemini.mjs` (or a small `lib/encode.mjs`): e.g.
`export const LINE_ART_WEBP_QUALITY = 92; export const FILL_WEBP_QUALITY = 90;` with a one-line WHY
for why line art wants the higher quality. Import everywhere.

#### Verification

`grep -rn "gemini-3.1-flash-image" bin/` returns zero after refactor (only the lib defines it).
Golden diff stays clean (quality values unchanged, just named).

---

### [P2][duplication] Three hand-rolled arg→target resolvers duplicate `resolveOutlineTargets`

**File(s):** `audit-invented-shapes.mjs:84-105` (`targetsUnder`/`resolveArg`);
`audit-night-halo.mjs:70-86` (`pagesUnder`/`resolveArg`); `punch-fill-outlines.mjs:28-46`
(`rawsUnder`/`resolveArg`) — pinned at SHA f934d43

#### Problem

`lib/outline-targets.mjs` exists precisely to turn `["nature", "nature/ant-wide"]` into resolved
paths, and the five generators plus two audits use it. But three scripts that walk `fill-src/**` or
`**/*.night.webp` instead each re-implement the identical "arg is a category dir, or a page, else
fail" logic with their own glob + `existsSync`/`statSync().isDirectory()` branch. They diverge in
error wording and in how a themed page (`space/ship-tall.night`) is handled. A newcomer cannot tell
these three resolvers are meant to behave like the shared one.

#### Proposed solution

Generalize `resolveOutlineTargets` to accept a `root`, a `suffixPattern` (e.g.
`**/*.{light,night}.raw.webp`, `**/*.night.webp`, `**/*.raw.webp`), and a `stripSuffix`, or add a
sibling `resolveAssetTargets({ root, pattern, toKey })` in `lib/outline-targets.mjs`. Route all
three scripts through it.

#### Verification

`npm run gen:coloring-punch -- nature/ant-wide`, `gen:coloring-fills:audit:halo -- vehicles`, and
`gen:coloring-fills:audit:shapes -- space/ship-tall.night` produce the same target lists as today;
delete the three local resolvers.

---

### [P2][duplication] Extract the `pageRel(path)` derivation repeated in seven files

**File(s):** `relative(COLORING_DIR, page).replace(/\.outline\.webp$/, '').replace(/\\/g, '/')` (or
the two-step variant) at gen-coloring-fills.mjs:224-226, gen-coloring-fills-dark.mjs:347-349,
gen-coloring-chalk.mjs:320-322, audit-golden.mjs:58-60, review-orb-eyes.mjs:39-41, plus the
`\\`-less variants audit-fill-eyes.mjs:38, audit-outline-solidity.mjs:27,
check-coloring-drift.mjs:51 — pinned at SHA f934d43

#### Problem

Turning a resolved outline path back into a category/page key (`nature/ant-wide`) is done ad hoc in
nine places, and inconsistently: some strip the Windows backslash (`.replace(/\\/g,'/')`), some
don't — a latent cross-platform bug given ADR-0017 requires macOS+Linux parity and forward-slash
keys.

#### Proposed solution

Export `pageRelFromOutline(path)` from `lib/paths.mjs` (it already owns `COLORING_DIR`):
`relative(COLORING_DIR, path).replace(/\.outline\.webp$/, '').replaceAll('\\', '/')`. Replace all
nine call sites.

#### Verification

`grep -rn "replace(/\\\\.outline" bin/` returns only the lib. Audits print identical page keys.

---

### [P2][duplication] Extract the "score against chalk when forked, else pen" source-selection

**File(s):** `audit-golden.mjs:101-103`; `audit-invented-shapes.mjs:121-123`;
`audit-night-halo.mjs:40-43`; `audit-fill-eyes.mjs:49-55`; `gen-coloring-fills-dark.mjs:378-380` —
pinned at SHA f934d43

#### Problem

The load-bearing rule "a night fill scores/composites against the chalk outline when the page has
forked, otherwise the pen" is re-derived in five places with slightly different shapes:
`chalk ?? pen` (golden, dark), `theme === 'night' && existsSync(chalk) ? chalk : pen` (invented),
`existsSync(chalk) ? chalk : pen` (halo), `const chalked = existsSync(chalkPath)` then branch
(fill-eyes). Because it is copy-pasted, a future change to the fork convention (or the composite
step) must be found and fixed in five spots — exactly the kind of pipeline rule the docs stress is
easy to get subtly wrong.

#### Proposed solution

Add to `lib/paths.mjs` or a new `lib/line-art.mjs`:

```
export function chalkPathFor(outlinePath)      // path swap
export async function nightSource(outlinePath) // returns { source, chalk|null } reading chalk when present, else pen
```

Callers use `const { source, chalk } = await nightSource(page)`; the `compositeNight(raw, chalk)` vs
`raw` branch can also live behind a helper.

#### Verification

Golden freeze/diff unchanged. `grep -rn 'chalk ?? pen\|existsSync(chalkPath)' bin/` collapses to the
lib.

---

### [P2][complexity] Wrap the top-level procedural page loops in a `main()`

**File(s):** `gen-coloring-fills-dark.mjs:327-440`; `gen-coloring-chalk.mjs:318-455`;
`normalize-outline-strokes.mjs:196-336`; `gen-coloring-fills.mjs:221-283` — pinned at SHA f934d43

#### Problem

These scripts run 100–140 lines of imperative work (target resolution, the per-page loop, gating,
writing, the summary) at module top level with `let failures = 0` module globals and top-level
`await`. There is no `main()` and no single place a reader can see the shape of the program; the
per-page body (e.g. dark:346-437) is a ~90-line block mixing lever resolution, file reads, the
attempt ladder, encode, and a multi-branch status-string assembly. This is the "procedural `main`
blob" pattern flagged as the top CLI smell.

#### Proposed solution

Introduce `async function main()` and, within it, factor the loop body into named steps:
`resolvePageInputs(page, cfg)`, `writeCandidate(...)`, `formatStatusLine(take, cfg)`. Call
`main().catch(err => fail(err.message))` at the bottom. This also gives one place to own the exit
code.

#### Verification

Behavior identical (same stdout, same exit code on `--dry-run`); the diff is pure extraction.
`node --check` passes and a dry-run prints the same lever report.

---

### [P2][consistency] Unify CLI argument parsing — three different mechanisms in one directory

**File(s):** `parseArgs` in most files; `process.argv.slice(2)` in audit-fill-eyes.mjs:23 and
audit-outline-solidity.mjs:16; `process.argv[2]` in audit-golden.mjs:175; env vars
`QUALITY`/`LOSSLESS` in png-to-webp.mjs:11-12; bare `process.argv.slice(2)` as dir list in
gen-coloring-thumbs.mjs:47 — pinned at SHA f934d43

#### Problem

Five scripts opt out of `node:util` `parseArgs` that the rest of the directory standardizes on.
`png-to-webp` uniquely takes options through environment variables (`QUALITY=90 LOSSLESS=1`),
`gen-coloring-thumbs` treats every positional as a category with no flag support, and `audit-golden`
reads a single positional `process.argv[2]` for its `--freeze`/`--diff` mode. A newcomer cannot
predict how any given script takes options, and `--help`-style discoverability is nonexistent.

#### Proposed solution

Standardize on `parseArgs` everywhere. Convert `png-to-webp` to `--quality`/`--lossless` flags (env
can stay as a fallback if desired), give `gen-coloring-thumbs` an `allowPositionals` parse, and
parse `audit-golden`'s mode via `options` or at least document it. A tiny `lib/cli.mjs`
`parse(spec)` wrapper could carry the shared `allowPositionals: true` default.

#### Verification

Each script's usage comment matches its parser. `npm run info` descriptions still hold; smoke-run
each audit with no args.

---

### [P3][consistency] Duplicated, divergent numeric-flag validators

**File(s):** temperature/samples/max-attempts/non-negative checks at gen-coloring-fills.mjs:126-133,
gen-coloring-fills-dark.mjs:211-235, gen-coloring-chalk.mjs:229-247,
normalize-outline-strokes.mjs:92-104, gen-coloring-outlines-fresh.mjs:70-74,
gen-style-covers.mjs:68-70 — pinned at SHA f934d43

#### Problem

The same validations are re-written with inconsistent wording:
`--temperature must be between 0 and 2` (chalk, fresh, normalize) vs
`--temperature must be a number between 0 and 2, got "…"` (fills, covers);
`--samples must be a positive integer` with vs without the offending value. dark alone repeats four
`>= 0` guards inline. Each is a hand-rolled `if (!(Number.isInteger(x) && x >= 1)) fail(...)`.

#### Proposed solution

Add `lib/cli.mjs` validators: `parsePositiveInt(raw, name, fallback)`,
`parseTemperature(raw, name, fallback)` (0–2), `parseNonNegative(raw, name, fallback)`. Each returns
the parsed number or calls `fail` with one canonical message. The
`nightSettings`/`chalkSettings`/`normalizeSettings` builders shrink to a table of these.

#### Verification

Feed each script `--temperature 9` / `--samples 0` and confirm one consistent error string.
Unit-test the validators.

---

### [P3][duplication] The `GEMINI_API_KEY` guard is copy-pasted six ways

**File(s):** gen-coloring-fills.mjs:135, gen-coloring-fills-dark.mjs:239,
gen-coloring-chalk.mjs:224, normalize-outline-strokes.mjs:88, gen-coloring-outlines-fresh.mjs:61,
gen-style-covers.mjs:72 — pinned at SHA f934d43

#### Problem

`if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.')` appears six times, and three
scripts additionally repeat the guarded-construct idiom
`const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: … }) : null` (dark:341-343,
chalk:249-251, normalize:107-109) with an extra `--dry-run`/`--rescore` escape hatch bolted on
inconsistently.

#### Proposed solution

`lib/gemini.mjs` `makeClient({ optional = false })`: returns a client, calls `fail` when the key is
missing and `optional` is false, returns `null` when optional (for `--dry-run`/`--rescore`).
Replaces both idioms.

#### Verification

Unset the key and run each generator; confirm the same failure message. Run
`gen:coloring-chalk -- nature --dry-run` with no key and confirm it still previews.

---

### [P3][maintainability] Prompt strings and the transport live tangled in the bin scripts

**File(s):** `FILL_PROMPT` gen-coloring-fills.mjs:52-70; `darkFillPrompt`/`EYES_*`
gen-coloring-fills-dark.mjs:84-117; `INSTRUCTION` gen-coloring-chalk.mjs:190-204; `INSTRUCTION`
normalize-outline-strokes.mjs:61-74; `STYLE_PROMPT` gen-coloring-outlines-fresh.mjs:35-41 — pinned
at SHA f934d43

#### Problem

The multi-paragraph model prompts are the actual product of this pipeline and the thing most often
tuned, yet each is embedded mid-file between imports and control flow. Finding "the dark-fill
prompt" means opening a 441-line CLI and scrolling past scoring code. There is no single surface
where a prompt-tuner can see and diff all of them (contrast the app side, which has
`web/src/lib/ai/prompt.ts`).

#### Proposed solution

Move the prompt constants to `lib/prompts.mjs` (or one file per prompt under `lib/prompts/`),
exporting `FILL_PROMPT`, `darkFillPrompt(chalked)`, `CHALK_INSTRUCTION`, `NORMALIZE_INSTRUCTION`,
`FRESH_STYLE_PROMPT`. The bins import them; the transport and scoring stay in bin. This also makes
the prompts unit-referenceable.

#### Verification

Golden diff clean (byte-identical prompts, just relocated). `grep -n 'You are given' bin/` returns
nothing.

---

### [P3][duplication] Repeated status-line assembly at the end of each generator loop

**File(s):** gen-coloring-fills.mjs:242-263; gen-coloring-fills-dark.mjs:414-432;
gen-coloring-chalk.mjs:429-441; normalize-outline-strokes.mjs:310-322 — pinned at SHA f934d43

#### Problem

Each generator ends its per-page block with the same shape: build a `warn`/`flags` array from failed
gates, compute `tries = attempt > 0 ? \` (${attempt+1} tries)\` : ''`,`nudge = shift.dx||shift.dy ?
\` shift ${dx},${dy}\` : ''`, a`stats`string of`keep/local/…`, and`${warn.length ? \` ⚠
${warn.join(' + ')}\` : ''} -> ${relative(REPO_ROOT, out)}`. The scaffolding (tries/nudge/⚠
join/arrow) is identical; only the gate names differ.

#### Proposed solution

Add `lib/report.mjs` `formatCandidateLine({ stats, warnings, attempt, shift, outPath })` returning
the assembled string (owning the tries/nudge/⚠/arrow formatting and `relative(REPO_ROOT, …)`). Each
generator passes its gate-specific `stats` and `warnings[]`.

#### Verification

Console output for a re-run is byte-identical; the four inline assemblies collapse to one call each.

---

### [P3][duplication] Number/percent formatting reinvented per script

**File(s):** `round(v, digits)` audit-golden.mjs:51-54; `pct` check-coloring-drift.mjs:68;
`Math.round(keep*1000)/10` gen-coloring-book-proof-sheet.mjs:161; ad-hoc `(v*100).toFixed(1)` across
fills, dark, chalk, normalize, audit-fill-eyes — pinned at SHA f934d43

#### Problem

"Format a 0–1 ratio as a percentage" and "round to N digits" are each implemented several times with
different precision and padding. The proof sheet's `Math.round(keep*1000)/10` and
check-coloring-drift's `pct` compute the same keep percentage two different ways, risking display
drift between the audit and the review sheet that are supposed to agree.

#### Proposed solution

`lib/format.mjs`: `pct(ratio, digits = 1)`, `round(v, digits)`. Replace the scattered inline
formatting; the proof sheet and drift audit then render keep identically by construction.

#### Verification

Audit tables and the proof-sheet badge show the same keep % for a given page.

---

### [P3][error-handling] Audits abort the whole run on one unreadable/missing asset

**File(s):** `check-coloring-drift.mjs:50-62`; `audit-fill-eyes.mjs:37-72`;
`audit-outline-solidity.mjs:26-42`; `audit-golden.mjs:57-134` (`scorePage`) — pinned at SHA f934d43

#### Problem

The generators wrap each page in `try/catch` and tally `failures` so one bad page doesn't kill a
category run (e.g. chalk:413-417, dark:433-436). The audits do not: a single corrupt webp or a race
with a half-written file throws out of the loop and aborts the entire catalog pass with a raw stack
trace, losing all results computed so far. For tools meant to double as CI checks over ~94 pages,
that's a fragile failure mode and gives no indication which page broke.

#### Proposed solution

Wrap each audit's per-page body in `try/catch`, print `<page>  ERROR (<msg>)`, increment a failure
counter, and set `process.exitCode = 1` at the end if any page errored — mirroring the generators'
convention.

#### Verification

Point one audit at a directory containing a truncated `.webp`; confirm it reports that page and
still scores the rest, exiting non-zero.

---

### [P3][consistency] `png-to-webp` configured by env vars instead of flags

**File(s):** `png-to-webp.mjs:11-12` — pinned at SHA f934d43

#### Problem

`const quality = Number(process.env.QUALITY ?? 80); const lossless = process.env.LOSSLESS === '1';`
is the only script in the directory that takes its options through environment variables. It's
undiscoverable (no `parseArgs`, no validation — `QUALITY=abc` silently yields `NaN`), and
inconsistent with the `namespace:variant` + flag conventions everywhere else.

#### Proposed solution

Switch to `parseArgs` with `--quality <n>` (validated via the shared `parseNonNegative`) and
`--lossless`. Keep reading the env var only as a documented fallback if existing muscle-memory
matters.

#### Verification

`node bin/png-to-webp.mjs --quality 90 --lossless` works; `--quality abc` fails loudly instead of
writing `NaN`-quality webps.

---

### [P3][duplication] Two base64 data-URI helpers with different names

**File(s):** `review-orb-eyes.mjs:36` (`b64`); `gen-coloring-book-proof-sheet.mjs:82-85` (`dataUri`)
and `:94-105` (`gitDataUri`) — pinned at SHA f934d43

#### Problem

`review-orb-eyes` defines
`const b64 = (buf) => \`data:image/png;base64,${buf.toString('base64')}\``; the proof sheet defines`dataUri(p)`(reads a file, webp mime) and`gitDataUri`.
Both are "bytes → embeddable data URI" for the two HTML-review generators, named and shaped
differently, so the shared concept isn't grepable.

#### Proposed solution

Add `lib/data-uri.mjs` `bytesToDataUri(buf, mime = 'image/webp')` and `fileToDataUri(path, mime)`
(null on missing). Both HTML generators import them; `gitDataUri` keeps its git-specific read but
returns via the shared formatter.

#### Verification

Both `review-orb-eyes` and the proof sheet still render inline images; the HTML output is unchanged.

---

### [P3][consistency] Inconsistent exit-code conventions across the CLIs

**File(s):** `process.exitCode = 1` at audit-golden.mjs:226, check-coloring-drift.mjs:90,
audit-invented-shapes.mjs:160, audit-fill-eyes.mjs:81; `process.exit(0)` at png-to-webp.mjs:20 and
gen-asset-manifest.mjs:61; `fail()`→`process.exit(1)` throughout; `audit-night-halo.mjs` sets no
exit code at all — pinned at SHA f934d43

#### Problem

Some tools signal "found problems" via `process.exitCode = 1` (lets the event loop drain), some
hard-`process.exit(0)` mid-file, and `audit-night-halo` — explicitly described in its header as a
ranking, but still a catalog audit — never sets a non-zero code even conceptually. A caller/CI
cannot rely on a uniform "non-zero = something to look at" contract, and the mixed `process.exit()`
vs `process.exitCode` styles risk truncating buffered stdout.

#### Proposed solution

Adopt one rule: audits set `process.exitCode = 1` on findings and never call `process.exit()`;
generators keep `fail()` for hard errors. Document the "which audits gate CI" contract (halo is
advisory by design — say so in code, not just prose).

#### Verification

Run each audit against a known-flagged page and check `echo $?`; confirm buffered output isn't cut
off.

---

### [P3][maintainability] `describeLevers` settings object rebuilt by hand in three generators

**File(s):** `gen-coloring-fills-dark.mjs:354-371`; `gen-coloring-chalk.mjs:327-342`;
`normalize-outline-strokes.mjs:202-215` — pinned at SHA f934d43

#### Problem

Each generator manually maps its `cfg` back into the flag-keyed object `describeLevers` expects
(`{ temperature: cfg.baseTemp, 'max-attempts': cfg.maxAttempts, … }`). The `cfg` was itself built
from those same flag keys moments earlier (in `nightSettings`/`chalkSettings`/`normalizeSettings`),
so the code round-trips key→field→key by hand, and a new lever must be added in three synchronized
spots (the settings builder, the `describeLevers` mapping, the validation).

#### Proposed solution

Have the settings builders keep (or expose) the flag-keyed shape, e.g. return `{ settings, flags }`
where `flags` is already keyed for `describeLevers`, so the call site passes `settings: cfg.flags`
with no manual remap.

#### Verification

`--dry-run` lever reports are identical for a page with registry entries; adding a hypothetical
lever touches one object.

---

### [P4][dead-code] `export` on generator functions that are never imported

**File(s):** `gen-coloring-fills.mjs:75` (`export async function generateColoredPage`);
`gen-style-covers.mjs:29` (`export async function generateStyledImage`) — pinned at SHA f934d43

#### Problem

Both are `export`ed with a comment ("Kept free of file/CLI concerns so it can be reused (batch,
samples, or eventually in-app)"), but a repo-wide grep shows each is only ever called within its own
file (fills:187, covers:86) — no importer exists. The export is aspirational dead surface that
implies a shared API that isn't there, and `generateDarkPage`/`drawChalk`/`editLineArt` in sibling
files are (correctly) not exported, so the pattern is inconsistent anyway.

#### Proposed solution

Drop the `export` keyword (make them file-local) — or, better, subsume them into the
`lib/gemini.mjs` `generateImage` from finding 1, which is the actual reuse point the comments
anticipate.

#### Verification

`grep -rn "import.*generateColoredPage\|import.*generateStyledImage" .` (excluding
`ideas-exploration/`) returns nothing; removing the export doesn't break `node --check` or the
scripts.

---

### [P4][duplication] Working-resolution and threshold magic numbers scattered across pixel scans

**File(s):** `gen-coloring-fills.mjs:102` (`WHITE_LEVEL = 248`) & `:104` (`resize(360, 360)`);
`gen-coloring-outlines-fresh.mjs:124` (`>= 235` border white), `:136` (`resize(360,360)`), `:140`
(`< 150` ink); `gen-coloring-chalk.mjs:82-83` (`INK_W = 512`, `INK_DARK = 110`) — pinned at SHA
f934d43

#### Problem

Down-sampling to a working resolution before a pixel loop is done at `360×360` in two files and
`512×512` in a third, and the "is this pixel white/ink" luma thresholds (248, 235, 150, 110) are
bare literals inside each scan function. Some are named (`WHITE_LEVEL`, `INK_DARK`), some are inline
(`>= 235`, `< 150`). A reader can't tell whether the differing working sizes are deliberate
(accuracy vs speed) or accidental, and the luma cutoffs that must roughly agree with
`lib/outline-match.mjs`'s ink bar (chalk:81 says "same ink bar") aren't traceably linked.

#### Proposed solution

Name every threshold at the top of its file (or share `INK_LUMA_MAX`/`WHITE_LUMA_MIN`/`SCAN_EDGE`
from a `lib/pixels.mjs` where the value genuinely must match `outline-match`). Add a one-line WHY
where 360 vs 512 is a real speed/accuracy choice.

#### Verification

Golden diff clean (values unchanged, only named). The chalk↔outline-match agreement is now a shared
import, not a comment.

---

### [P4][consistency] Progress written to `stderr` in one audit, `stdout` in the rest

**File(s):** `audit-night-halo.mjs:98-100` and `:111` (`console.error` for progress and timing) vs
the `console.log`/`process.stdout.write` progress in every other audit and generator — pinned at SHA
f934d43

#### Problem

`audit-night-halo` prints its per-page progress counter and final timing via `console.error`, while
its ranked table goes to `console.log`. The intent (keep the pipeable table on stdout, chatter on
stderr) is defensible but undocumented and unique — no other tool in the directory splits streams,
so it reads as an inconsistency rather than a deliberate choice, and `--out` already exists for
machine consumption.

#### Proposed solution

Either document the stdout/stderr split with a one-line comment and adopt it as the convention for
audits that emit a pipeable table, or move progress to `console.log` for consistency with the
sibling audits. Pick one and note it.

#### Verification

`node bin/audit-night-halo.mjs vehicles 1>table.txt` yields only the table in `table.txt`; the
chosen convention is stated in the header.

---

### [P4][complexity] Settings builders called once purely for their validation side-effect, then discarded

**File(s):** `gen-coloring-fills-dark.mjs:238` (`nightSettings(values, 'cli')`);
`gen-coloring-chalk.mjs:247` (`chalkSettings(values, 'cli')`); `normalize-outline-strokes.mjs:105`
(`normalizeSettings(values, 'cli')`) — pinned at SHA f934d43

#### Problem

Each script calls its settings builder at top level and throws the result away, relying on the
function's `fail()` side effects to validate the raw CLI flags early; the real per-page settings are
rebuilt later inside the loop (dark:353, chalk:326, normalize:201). This "call for side effects,
ignore return" is a smell — the function name implies it produces settings, but here it's used as a
validator, and the double invocation means validation logic and construction logic are entangled in
one function.

#### Proposed solution

Split validation from construction: a `validateFlags(values)` that only checks the raw CLI, called
once up front, and a pure `buildSettings(merged)` used per page. (Composes naturally with the shared
validators in finding 9.)

#### Verification

Invalid CLI flags still fail before any API call; the per-page path no longer re-runs top-level
validation. Dry-run output unchanged.

---

### [P4][naming] Amber overlay color and dim factor are unexplained literals

**File(s):** `audit-invented-shapes.mjs:44-56` (`* 0.55` base dim; `r=255,g=210,b=0` "amber";
red-rect `stroke-width="3"`, `x0-3`/`+6` insets) — pinned at SHA f934d43

#### Problem

`overlayImage` hard-codes the 0.55 dim multiplier for the background and the `(255,210,0)`
deviant-pixel color inline (the trailing `// deviant bg pixel = amber` helps, but the numbers aren't
named), plus the SVG rect padding (`-3`/`+6`). These are presentation constants a reviewer may want
to tune, buried in a triple pixel loop.

#### Proposed solution

Hoist named constants at the top of the file:
`const OVERLAY_DIM = 0.55; const DEVIANT_RGB = [255, 210, 0]; const RECT_PAD = 3;`. Minor, but it
makes the one visual-tuning surface in the audit legible.

#### Verification

Regenerate an overlay with `--overlay`; the image is pixel-identical, the constants are now
discoverable.

---

I reviewed all 18 scripts in `tools/asset-gen/bin/` against the shared `lib/`. The dominant themes
are cross-script duplication of the Gemini transport, the keep-best-of-N retry ladder, arg/target
resolution, and the chalk-fork source selection — each reimplemented 5–6 times — plus inconsistent
CLI parsing, validation, and exit-code conventions. The audit scripts also lack the per-page error
isolation the generators already have. All findings are report-only; no code was changed.

## Source: Code audit — tools/asset-gen · lib (pipeline core)

### [P2][duplication] Every module reimplements RGB decode + luma; the luma coefficients live in six files

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:41-50,217-218` (`inkMask`),
`night-scores.mjs:90,133`, `punch-fill.mjs:124`, `solid-regions.mjs:171-172`, `night-halo.mjs:31-36`
(`loadRgb`/`lumaOf`), `composite-eye.mjs:80-88` (`grayResized`) — pinned at SHA f934d43

#### Problem

The Rec.601 weighting `0.299*R + 0.587*G + 0.114*B` is hand-written in at least six modules, and the
`sharp(buf).removeAlpha().raw().toBuffer({resolveWithObject:true})` decode preamble is copy-pasted
into nearly all of them. `eye-fill.inkMask`, `night-halo.loadRgb`, and `solid-regions.scoreSolidity`
each open with a byte-identical decode-and-luma loop:

```js
const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
```

Any future change to the luma definition (or a bug in one copy) silently forks the pipeline's notion
of "brightness" — the exact class of drift the CLAUDE.md warns about with "the mask math can never
fork between them."

#### Proposed solution

Add `lib/pixels.mjs` exporting `async function loadRgb(buf)` → `{ rgb, width, height }`,
`luma(rgb, p)` (index into an interleaved RGB buffer), and `lumaAt(r,g,b)`. Replace each module's
private decode+luma with imports. `night-halo.mjs`'s `loadRgb`/`lumaOf` are already the right shape
— promote them.

#### Verification

`grep -c "0\.299" lib/**` drops to 1. Re-run `npm test` (the per-module unit tests under `tests/`)
and `npm run gen:coloring-golden:diff` — scores must be byte-identical since the arithmetic is
unchanged.

---

### [P2][duplication] Background flood-fill is written twice in lib (and a third time in bin)

**File(s):** `tools/asset-gen/lib/night-scores.mjs:57-83` (`scoreNightness`) and
`tools/asset-gen/lib/invented-shapes.mjs:55-82` (`detectInventedShapes`) — pinned at SHA f934d43

#### Problem

Both modules flood the open background from the border through source-light pixels with the same
`push(x,y)` closure, the same four border-seeding loops, and the same `while(stack.length)`
pop-and-spread. `invented-shapes.mjs:14` even documents the copy: "the same machinery as
scoreNightness." `bin/gen-coloring-chalk.mjs:113` reimplements it a third time. Three copies of a
border flood-fill, each with its own `SRC_LIGHT`/`NIGHT_SRC_LIGHT` constant (both 170).

#### Proposed solution

Extract `export function floodBackground(gray, w, h, lightThreshold)` → `Uint8Array` into
`lib/pixels.mjs` (or a new `lib/regions.mjs`). Both scorers call it; `invented-shapes` keeps its own
`cand` post-filter. Fold the two `170` constants into one exported `BG_LIGHT_THRESHOLD`.

#### Verification

`tests/night-scores.test.mjs` and `tests/invented-shapes.test.mjs` still pass; the `bgFrac`/`bgLuma`
outputs are unchanged on fixtures.

---

### [P2][duplication] `solid-regions.mjs` reimplements the erode/dilate that `morphology.mjs` already exports

**File(s):** `tools/asset-gen/lib/solid-regions.mjs:46-85` (`erode`, `dilate`) vs
`tools/asset-gen/lib/morphology.mjs:7-42` (`morph`/`erodeMask`/`dilateMask`) — pinned at SHA f934d43

#### Problem

`morphology.mjs` exists precisely to be "shared" (its header names two callers) and provides
separable `erodeMask`/`dilateMask`. Yet `solid-regions.mjs` defines its own `erode` (separable,
breaks on first unset) and `dilate` (invert→erode→invert) that compute the identical opening. A
*third* erosion — Set-based — appears in `composite-eye.mjs:211-231`. Three morphology
implementations for one concept; `solid-regions`'s copy is a near-verbatim duplicate of the exported
one.

#### Proposed solution

Delete `solid-regions.mjs`'s local `erode`/`dilate`; import `erodeMask`/`dilateMask` from
`morphology.mjs` and call them in `scoreSolidity` (lines 181-182) and `whitenSolidRegions` (line
224). Verify the border-handling matches (both treat out-of-bounds as unset for erode); if
`whitenSolidRegions`'s rim relies on the invert-based dilate's border behavior, add a `border`
option to `morph` rather than keeping a fork.

#### Verification

`tests/solid-regions.test.mjs` and `tests/morphology.test.mjs` pass; `scoreSolidity` on the golden
fixtures returns the same `interiorPx`/`biggestBlob`.

---

### [P2][maintainability] The ink-luma threshold `150` is redeclared in four modules with "keep in sync" comments

**File(s):** `tools/asset-gen/lib/punch-fill.mjs:35` (`OUTLINE_LUMA_THRESHOLD`),
`solid-regions.mjs:23` (`SOLID_LUMA_THRESHOLD`), `eye-fill.mjs:24` (`INK_LUMA`),
`composite-eye.mjs:10` (`PUNCH_LUMA`) — pinned at SHA f934d43

#### Problem

Four constants all equal `150` and all mean "line-art pixel this dark = outline ink." Each carries a
comment tying it back to `punch-fill.mjs`:

```js
export const SOLID_LUMA_THRESHOLD = 150; // Same ink bar as the punch mask (lib/punch-fill.mjs OUTLINE_LUMA_THRESHOLD)
const PUNCH_LUMA = 150; // lib/punch-fill.mjs OUTLINE_LUMA_THRESHOLD
```

`night-halo.mjs` and the punch itself already import `OUTLINE_LUMA_THRESHOLD` — proving the
canonical source exists — but three other modules copy the literal instead. If the punch bar moves,
three gates silently keep the old value and the "solid = the pixels the punch would cut" invariant
breaks.

#### Proposed solution

Import `OUTLINE_LUMA_THRESHOLD` in `composite-eye.mjs` (replace `PUNCH_LUMA`) and `eye-fill.mjs`
(replace `INK_LUMA`). `solid-regions.mjs` may keep a re-export alias for its public API but should
define it as `export const SOLID_LUMA_THRESHOLD = OUTLINE_LUMA_THRESHOLD;`.

#### Verification

`grep -rn "= 150" lib/` returns only the single definition (plus unrelated `EYE_LIGHT_MIN`). Golden
diff unchanged.

---

### [P2][complexity] `scoreEyeFill` is a 100-line function mixing resize, per-core sampling, annulus geometry, and the liveliness verdict

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:208-307` — pinned at SHA f934d43

#### Problem

One function decodes+resizes the fill and builds a luma plane (211-218), then per core: collects
core pixels (226-229), builds a geometric annulus while running an inner 3×3 near-ink exclusion
(231-279), computes p15/p85 band stats (282-288), and evaluates the tri-branch liveliness ladder
(289-294). The annulus loop alone is a 30-line quadruple-nested block with a `nearInk` inner scan.
The reader must hold all of it to follow one core's verdict.

#### Proposed solution

Extract named steps:

* `function coreLuma(luma, w, core, label)` → median core value,
* `function sampleAnnulus(luma, ink, label, w, h, core, cx, cy, r)` →
  `{ bandVals, annulusInkFrac }`,
* `function judgeLively(coreLuma, bandDark, bandLight)` → boolean (the 289-294 ladder).
  `scoreEyeFill` then loops cores calling the three. Keep the dense per-page-tuning comments on
  `sampleAnnulus`.

#### Verification

`tests/eye-fill.test.mjs` passes unchanged (pure refactor); the returned `cores[]` shape is
identical.

---

### [P2][complexity] `detectInventedShapes` is a 155-line function whose five numbered comments are begging to be functions

**File(s):** `tools/asset-gen/lib/invented-shapes.mjs:40-195` — pinned at SHA f934d43

#### Problem

The body is literally sectioned `// 1. flood…`, `// 2. dilated source-ink mask`,
`// 3. median background color`, `// 4. foreign pixels`, `// 5. connected components + anchoring`.
Step 5 alone (129-179) is a 50-line inline connected-components scan with per-blob bbox, color sums,
and border/anchor accounting. Numbered-comment steps in a long function are the canonical
extract-into-named-function signal.

#### Proposed solution

Extract `floodBackground` (shared, see the flood-fill finding), `foreignPixels(t, cand, med, DEV_T)`
→ `Uint8Array`, and `labelBlobs(dev, nearLine, t, w, h)` → `blobs[]`. The top-level function becomes
the five one-line calls plus the `flagged`/`washes` partition (180-183).

#### Verification

`tests/invented-shapes.test.mjs` passes; `flagged`/`washes`/`blobs` arrays match on fixtures.

---

### [P2][duplication] `STRONG_LIGHT_SIDE = 180` is declared in two eye modules instead of imported

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:326` and `tools/asset-gen/lib/composite-eye.mjs:47` —
pinned at SHA f934d43

#### Problem

`composite-eye.mjs:36` already imports `BAND_BLIND_INK_FRAC` and `scoreEyeFill` from `eye-fill.mjs`,
and its own comments (46) reference "judgeNightEyes's own reference test." Yet it redeclares
`const STRONG_LIGHT_SIDE = 180;` — the same "strong light side" bar `judgeNightEyes` uses at
`eye-fill.mjs:351`. The two checks are documented as complementary halves of the same eye-reference
oracle; a change to one 180 silently desynchronizes them.

#### Proposed solution

`export const STRONG_LIGHT_SIDE = 180;` from `eye-fill.mjs` and import it in `composite-eye.mjs` (it
already imports two symbols from that file).

#### Verification

`grep -n "STRONG_LIGHT_SIDE = 180" lib/` returns one line. `tests/composite-eye.test.mjs` and
`tests/eye-fill.test.mjs` pass.

---

### [P2][performance] `scoreEyeRings` and `findEyeCores` each re-run the ink mask + full region labeling on the same buffer

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:117-136` (`findEyeCores`) and `153-184`
(`scoreEyeRings`) — pinned at SHA f934d43

#### Problem

Both functions open with `await inkMask(sourceBuf)` then `labelRegions(ink, w, h)` — a full
4-connected labeling of every non-ink pixel at native resolution.
`bin/normalize-outline-strokes.mjs` (lines 225 + 277) and `bin/gen-coloring-outlines-fresh.mjs`
(lines 178-180) call *both* on the same page, so the most expensive step in the module — decode +
connected-component labeling of a multi-megapixel page — runs twice per candidate. `scoreEyeRings`
also re-walks the parent chain that `findEyeCores` already established.

#### Proposed solution

Factor a `labelPage(sourceBuf)` → `{ ink, label, regions, w, h }` and have both `findEyeCores` and
`scoreEyeRings` accept either a buffer or a pre-labeled page. Add a combined
`export async function scoreEyes(sourceBuf)` returning `{ cores, rings }` from one labeling, and
switch the two bin callers to it.

#### Verification

Add a labeling call-counter in a test; assert one labeling per `scoreEyes`. Golden
ring-depth/eye-core numbers unchanged; wall-clock of `normalize`/`fresh` measurably drops.

---

### [P3][performance] `outlineMatch` always encodes a 512×512 overlay PNG even when the caller discards it

**File(s):** `tools/asset-gen/lib/outline-match.mjs:87,129-132` — pinned at SHA f934d43

#### Problem

`outlineMatch` allocates `rgb = Buffer.alloc(MASK_W*MASK_W*3, 255)`, paints it throughout the scan,
and always `await sharp(rgb…).png().toBuffer()` before returning. But
`bin/check-coloring-drift.mjs:55-60` uses `overlay` only under `if (values.overlay && failed)`, and
the generator gate at `bin/gen-coloring-fills.mjs:199` uses `keep`/`localKeep` for the pass/fail
decision. Every gate evaluation pays a full PNG encode purely for a diagnostic image most calls
throw away — on the hot batch path.

#### Proposed solution

Add an options arg: `outlineMatch(sourceBuf, filledBuf, { overlay = false } = {})`. Only paint `rgb`
and encode when `overlay` is true; return `overlay: null` otherwise. Callers that want it pass
`{ overlay: true }`.

#### Verification

`tests/outline-match.test.mjs` passes with `{overlay:true}`; time a batch drift check without
`--overlay` before/after — the PNG encodes disappear from the profile.

---

### [P3][architecture] `golden-catalog.mjs` bundles a composite eye scorer with the golden-diff registry and has no header

**File(s):** `tools/asset-gen/lib/golden-catalog.mjs:1-16` (`scoreGoldenNightEyes`) vs `18-80`
(`GOLDEN_METRICS`/`GOLDEN_VERDICTS`/`diffGoldenPage`) — pinned at SHA f934d43

#### Problem

This file holds two unrelated responsibilities: (a) `scoreGoldenNightEyes`, which composes
`judgeNightEyes` + `scoreCompositeEyes` into a night-eye verdict, and (b) the golden regression
comparison engine (metric noise/direction table, verdict list, `diffGoldenPage`). It is also the
only lib module with no top-of-file header comment explaining what it is — every sibling opens with
a paragraph. A reader grepping for "how the golden diff decides regression vs info" has no signpost.

#### Proposed solution

Split into `lib/golden-diff.mjs` (metrics/verdicts/`diffGoldenPage`) and `lib/golden-eyes.mjs`
(`scoreGoldenNightEyes`), or at minimum add a header comment. `audit-golden.mjs` imports both
symbols already, so the split is a two-line import change.

#### Verification

`tests/golden-catalog.test.mjs` re-pointed at the new module(s); `npm run gen:coloring-golden:diff`
output unchanged.

---

### [P3][maintainability] "Source dark = a line" (`110`) is a magic number copied across four scorers

**File(s):** `tools/asset-gen/lib/outline-match.mjs:23` (`THRESHOLD`), `night-scores.mjs:21`
(`DRIFT_SRC_DARK`) & `:160` (`LINE_SRC_DARK`), `invented-shapes.mjs:28` (`SRC_DARK`) — pinned at SHA
f934d43

#### Problem

Four constants equal `110`, all meaning "a source line-art pixel darker than this is an outline
stroke." `invented-shapes.mjs:28` even comments `// … (as scoreDrift)` to flag the coupling. Unlike
the ink-150 case there is no canonical export — the value floats independently in each file, so the
modules that must "see the same picture the gates do" (invented-shapes' stated goal) can drift apart
on a tuning change.

#### Proposed solution

Export a single `SOURCE_LINE_DARK = 110` (from `lib/pixels.mjs` or `night-scores.mjs`) and import it
in the four sites. Keep `LINE_SRC_DARK`/`DRIFT_SRC_DARK` as local aliases only if a comment
justifies why they might diverge (none currently do).

#### Verification

`grep -rn "= 110" lib/` collapses to one definition. `tests/night-scores.test.mjs`,
`tests/outline-match.test.mjs`, `tests/invented-shapes.test.mjs` pass.

---

### [P3][complexity] `scoreCompositeEyes` is a 100-line function with an inline pupil-shape validator

**File(s):** `tools/asset-gen/lib/composite-eye.mjs:158-259` — pinned at SHA f934d43

#### Problem

Inside the `for (const ref of refs)` loop, three distinct rejection stages are inlined: bounding-box
fill + aspect ratio (194-206), a Set-based erosion survival test (211-232), and centroid +
disc-stats measurement (235-243). The blob-is-a-pupil decision spans ~50 lines mixed with the
measurement, and the erosion here is a fourth ad-hoc morphology implementation.

#### Proposed solution

Extract `function isPupilDisc(blob, w, h)` → boolean (the bbox-fill, aspect, and erosion checks,
194-232, reusing `erodeMask` from `morphology.mjs`) and `function blobCentroid(blob, w)`. The loop
body reduces to: grow blob → `if (!isPupilDisc) continue` → measure disc → push.

#### Verification

`tests/composite-eye.test.mjs` (calibrated on stego/horse/17-overflag fixtures) passes;
`coreDarkFrac`/`blankOrb` verdicts identical.

---

### [P3][performance] Every night scorer independently decodes and resizes the same source buffer

**File(s):** `tools/asset-gen/lib/night-scores.mjs:44-53,99-108,164-173` (three scorers) plus
`outline-match.mjs:42-47`, `eye-fill.mjs` — pinned at SHA f934d43

#### Problem

`scoreNightness` resizes source to width 384, `scoreDrift` to 512, `scoreLineColor` to 512,
`outlineMatch` to 512×512, `scoreEyeFill` decodes at native. When the dark-fill gate runs all of
them on one candidate (`bin/gen-coloring-fills-dark.mjs`), the same source webp is decoded from
scratch 4-5 times, and `scoreDrift`+`scoreLineColor` both resize source to 512 independently.
`sharp` decode+resize is the dominant cost per gate.

#### Proposed solution

Since two scorers already share the 512 working width, have the gate decode the source once to a raw
512 grayscale plane and pass it in (an optional `preDecoded` arg keeps the "buffers-in for offline
re-scoring" contract). Unify `DRIFT_W`/`LINE_W`/`MASK_W` (all 512) into one `WORK_W`.

#### Verification

Instrument `sharp()` call count per candidate in `gen-coloring-fills-dark`; assert the source is
decoded at 512 once. Golden scores unchanged.

---

### [P3][architecture] `fail()` (console.error + process.exit) lives in `paths.mjs`, unrelated to path resolution

**File(s):** `tools/asset-gen/lib/paths.mjs:29-32` — pinned at SHA f934d43

#### Problem

`paths.mjs` is documented as "path + tree resolution," but it also exports a CLI-exit helper
`fail(message)`. Nine bin scripts import it *from paths*
(`import { …, fail } from '../lib/paths.mjs'`), coupling a process-terminating side-effect to the
pure path-constants module and making `paths.mjs` un-importable in a context that shouldn't be
allowed to `process.exit`.

#### Proposed solution

Move `fail` to a `lib/cli.mjs` (or `lib/log.mjs`). Update the nine bin imports. Keep `paths.mjs`
side-effect-free (pure constants).

#### Verification

`grep -rn "fail" lib/paths.mjs` returns nothing; bin scripts still exit(1) on bad input (existing
CLI tests like `tests/light-fill-cli.test.mjs`, `tests/outline-targets.test.mjs` pass).

---

### [P4][type-safety] Scorer return shapes are undocumented ad-hoc objects with no JSDoc typedefs

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:295-304`, `composite-eye.mjs:245-253`,
`night-halo.mjs:127-136`, `outline-match.mjs:132` — pinned at SHA f934d43

#### Problem

These `.mjs` modules return richly-structured objects (`scoreEyeFill` →
`{ eyes, cores: [{ x, y, coreLuma, bandDark, bandLight, contrast, lively, annulusInkFrac }] }`) that
downstream code and `golden-catalog.mjs` index by convention (`pupil.coreDarkFrac`,
`lightCore.annulusInkFrac`). Nothing declares these shapes, so a renamed field or a `null` vs `0`
mismatch (e.g. `judgeNightEyes` reading `nightCore.contrast`) is caught only at runtime, and callers
can't discover the contract without reading the whole function.

#### Proposed solution

Add JSDoc `@typedef` blocks for the core result shapes (`EyeCoreScore`, `PupilScore`, `HaloScore`)
at the top of each module and annotate the exported functions with `@returns`. `svelte-check`/`tsc`
in the repo's checkJs mode would then validate the golden-catalog indexing.

#### Verification

`npm run check` (if it covers `tools/asset-gen`) surfaces any mismatched field access; editors
autocomplete the fields.

---

### [P4][performance] `ringBands` recomputes the dilation from the base mask at r=1,2,3 instead of growing incrementally

**File(s):** `tools/asset-gen/lib/night-halo.mjs:53-64` — pinned at SHA f934d43

#### Problem

```js
for (let d = 1; d <= maxD; d++) {
  const grown = dilateMask(mask, w, h, d);   // full radius-d dilation from scratch
  …
  prev = grown;
}
```

Each iteration runs a fresh separable dilation of radius `d` over the whole page; the r=3 pass
redoes the work of r=1 and r=2. Three full-page morphological passes where one incremental
single-pixel dilation per ring (reusing `prev`) would do.

#### Proposed solution

Grow one ring at a time: `grown = dilateMask(prev, w, h, 1)` inside the loop (radius-1 each step),
so total work is 3 radius-1 passes instead of radius-1+2+3.

#### Verification

`tests/night-halo.test.mjs` band pixel counts unchanged (radius-d from base == d successive radius-1
dilations for box morphology).

---

### [P4][naming] Hotspot tile geometry uses bare `64` and a `*1000` key-packing with no named constants

**File(s):** `tools/asset-gen/lib/night-halo.mjs:111-125` — pinned at SHA f934d43

#### Problem

```js
const k = Math.floor(Math.floor(p / w) / 64) * 1000 + Math.floor((p % w) / 64);
…
left: (k % 1000) * 64,
top: Math.floor(k / 1000) * 64,
```

`64` (tile size) and `1000` (row-stride packing multiplier) are magic literals repeated across pack
and unpack. The `*1000` scheme also silently breaks if a page ever exceeds 1000 tile-columns
(64000px). Nothing names or bounds this.

#### Proposed solution

`const HOTSPOT_TILE_PX = 64;` and use a `Map` keyed on `` `${col},${row}` `` (or a documented
`col * COLS_STRIDE + row` with an assertion), eliminating the fragile decimal packing.

#### Verification

`tests/night-halo.test.mjs` hotspot coordinates unchanged on fixtures.

---

### [P4][naming] `alignToSource`'s edge-strength cutoff `60` is an unnamed inline literal

**File(s):** `tools/asset-gen/lib/align-to-source.mjs:47` — pinned at SHA f934d43

#### Problem

```js
if (srcE[i] > 60) {
  idx.push(i);
  wt.push(srcE[i]);
}
```

The gradient-magnitude threshold that decides which source pixels are "edges worth correlating" is a
bare `60`, sitting in a module whose other tuning values (`ALIGN_MAX`, `ALIGN_W`) *are* named
constants. It reads as noise next to them.

#### Proposed solution

`const EDGE_MIN = 60; // min |gradient| to treat a source pixel as a registration edge` alongside
the existing constants at the top.

#### Verification

No behavior change; `grep "EDGE_MIN" lib/align-to-source.mjs` confirms extraction. Any align unit
test still passes.

---

### [P4][maintainability] Windows backslash-normalization is sprinkled across three modules despite Windows support being dropped

**File(s):** `tools/asset-gen/lib/punch-fill.mjs:99` (`.replace(/\\/g,'/')`), `page-notes.mjs:39`
(`.replaceAll('\\','/')`), `outline-targets.mjs:18-20` (`normalizeTarget`) — pinned at SHA f934d43

#### Problem

Three modules defensively convert `\` → `/` in relative paths. Per the repo CLAUDE.md, ADR-0062
dropped Windows dev support (macOS/Linux only), so `path.relative`/CLI args never contain backslash
separators. The conversions are dead defensiveness that adds noise and implies a portability
contract the project no longer honors.

#### Proposed solution

Either remove the backslash handling (cleanest, matches ADR-0062) or, if kept for pasted-path
robustness, centralize it as one `toPosix(rel)` helper in `lib/paths.mjs` rather than three private
variants.

#### Verification

`tests/outline-targets.test.mjs` still passes on POSIX inputs; `grep -rn "\\\\\\\\" lib/` shows at
most one shared helper.

---

### [P4][dead-code] `GOLDEN_METRICS` is exported but consumed only inside its own module

**File(s):** `tools/asset-gen/lib/golden-catalog.mjs:18-41` — pinned at SHA f934d43

#### Problem

`GOLDEN_METRICS` is `export const`, but the only reader is `diffGoldenPage` in the same file (line
70). A repo-wide grep shows no external import (`audit-golden.mjs` imports `GOLDEN_VERDICTS` and
`diffGoldenPage`, not `GOLDEN_METRICS`). The `export` overstates the module's public surface and
invites a future caller to depend on an internal table.

#### Proposed solution

Drop `export` from `GOLDEN_METRICS` (keep it module-private) unless a test needs it — in which case
leave a one-line comment noting the test as the only external consumer.

#### Verification

`grep -rn "GOLDEN_METRICS" bin/ tests/` — if empty, remove the export;
`tests/golden-catalog.test.mjs` still passes.

---

### [P4][duplication] Percentile/median selection is reimplemented inline in every scorer

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:186-190,287-288`, `night-scores.mjs:95`,
`night-halo.mjs:88`, `solid-regions.mjs:121`, `invented-shapes.mjs:111` — pinned at SHA f934d43

#### Problem

The pattern "sort then index a fraction" recurs everywhere with slightly different spellings:
`vals[vals.length >> 1]` (median), `vals[Math.floor(vals.length * 0.9)]` (p90),
`vals[Math.floor(vals.length * 0.15)]` (p15), `deltas[Math.floor(f*(deltas.length-1))]`
(night-halo's variant subtracts 1). The inconsistency (`>>1` vs `*0.5`, `len` vs `len-1`) is itself
a bug surface, and `invented-shapes.mjs:111` hides it in a comma-operator one-liner:
`const med = (a) => (a.sort((x,y)=>x-y), a[a.length>>1]);`.

#### Proposed solution

Add `export function quantile(vals, f)` and `median(vals)` to a shared `lib/stats.mjs` (sort a copy,
index consistently). Replace the inline selectors. Decide one convention for the index
(`Math.floor(f*(n-1))`) and apply uniformly.

#### Verification

Unit-test `quantile` directly; re-run all scorer tests — any that shift reveal a pre-existing
off-by-one the consolidation now makes visible/consistent.

---

### [P5][maintainability] "Median" via `>>1` is the upper-middle element, and luma definitions differ between modules that compare against shared thresholds

**File(s):** `tools/asset-gen/lib/composite-eye.mjs:80-88` (`grayResized`, sharp `.grayscale()`) vs
`eye-fill.mjs:216-218` (manual Rec.601) — pinned at SHA f934d43

#### Problem

Two subtle inconsistencies compound. (1) Nearly every "median" is `vals[vals.length >> 1]` — the
upper of the two middles for even-length arrays, not a true median; harmless in isolation but
undocumented. (2) `composite-eye.scoreCompositeEyes` derives luma via `sharp(...).grayscale()`
(libvips' weighting) while `eye-fill.scoreEyeFill` — which produces the very cores `composite-eye`
re-measures — uses manual `0.299/0.587/0.114`. The two modules threshold the same conceptual "luma"
(`DARK=90`, `WHITE=200` vs `EYE_DARK_MAX`, `EYE_LIGHT_MIN`) against values computed two different
ways, so calibration constants tuned under one luma are applied to the other.

#### Proposed solution

Standardize on the shared `luma()` helper (see the first finding) everywhere thresholds are
compared, replacing `.grayscale()` in `composite-eye`'s `grayResized`. Add a one-line note that
`>>1` is a deliberate cheap upper-median.

#### Verification

Re-run `tests/composite-eye.test.mjs` against its calibrated fixtures; if verdicts shift, the
calibration was silently luma-dependent and the constants should be re-pinned under the unified
luma.

---

### [P5][readability] `strokeWidthP90`'s two-pass chamfer distance transform is dense and unnamed

**File(s):** `tools/asset-gen/lib/solid-regions.mjs:90-122` — pinned at SHA f934d43

#### Problem

`strokeWidthP90` inlines a full forward+backward chamfer distance transform (the `1`/`1.414`
neighbor weights, two 20-line directional sweeps) then a p90 selection, all in one function whose
name advertises only the percentile. The distance-transform machinery is reusable image math buried
as a private implementation detail with no separation between "compute distance-to-light" and "take
2×p90."

#### Proposed solution

Extract `function chamferDistance(mask, w, h)` → `Float32Array` (the two sweeps) and let
`strokeWidthP90` call it and apply `2 * quantile(dists, 0.9)` (reusing the shared `quantile`). Names
the two concepts separately and makes the distance transform available to other morphology-adjacent
code.

#### Verification

`tests/solid-regions.test.mjs` `strokeWidth` values unchanged; the extracted `chamferDistance` can
get a direct unit test.

## Source: Code audit — tools/asset-gen · tests / samples / legacy

### [P2][duplication] `capture-current.mjs` reimplements the shared `chromiumExecutablePath` helper instead of importing it

**File(s):** `tools/asset-gen/crayon-brush-samples/capture-current.mjs:26-46` (Chromium resolver) —
pinned at SHA f934d43

#### Problem

The file already imports from `scripts/lib/` (line 16, `scrapbook-chrome.mjs`), yet it hand-rolls a
20-line copy of the exact Playwright-Chromium fallback that already exists as an exported helper in
`scripts/lib/utils.mjs:82` (`chromiumExecutablePath(chromium)`), whose body is a near-identical
`readdirSync(base).filter(/^chromium-\d+$/)…` walk over `/opt/pw-browsers`. The local copy even
carries the same explanatory comment ("Cloud sessions cache a Chromium whose revision can drift…").
Two copies of cloud-environment plumbing drift independently — when the pinned-browser logic changes
(as it has before per the comment referencing `web/playwright.config.ts`), this copy is silently
left behind.

```js
function chromiumExecutablePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  try { if (existsSync(chromium.executablePath())) return undefined; } catch {}
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  ...
```

Note the two variants have already diverged: `utils.mjs` takes `chromium` as a parameter (it lives
in a browser-agnostic lib); the local copy closes over the module-level `chromium` import and also
honors `PLAYWRIGHT_CHROMIUM` — the drift this finding warns about is already visible.

#### Proposed solution

Import `chromiumExecutablePath` from `scripts/lib/utils.mjs` and pass the `chromium` browser type:
`executablePath: chromiumExecutablePath(chromium)`. If the `PLAYWRIGHT_CHROMIUM` env override is
worth keeping, add it to the shared helper so every caller benefits. Delete lines 26-46.

#### Verification

`grep -n "PLAYWRIGHT_BROWSERS_PATH" tools/asset-gen/crayon-brush-samples/capture-current.mjs`
returns nothing after the fix. Run `node capture-current.mjs` against a running `/dev/engine`
harness and confirm it still launches and screenshots.

---

### [P2][test-quality] `light-fill-cli` gate-result arrays are magic sequences silently coupled to `MAX_ATTEMPTS = 5`

**File(s):** `tools/asset-gen/tests/light-fill-cli.test.mjs:122,150,164,189` (per-test
`state.gateResults`) — pinned at SHA f934d43

#### Problem

The mock outline-match gate (lines 30-43) `shift()`s from a shared queue `state.gateResults`; each
test seeds that queue with a bare boolean array whose length silently encodes the CLI's retry count:

```js
state.gateResults = [false, false, false, false, false, true]; // line 122
```

That is exactly `MAX_ATTEMPTS` (5, defined at `bin/gen-coloring-fills.mjs:157`) failures for
`first-tall` followed by one pass for `second-tall`. Nothing in the test names or explains the count
of five — a reader must cross-reference the CLI's retry constant to understand why six entries
produce "1 failed". Other tests use `state.gateResults = []` (lines 164, 189) with a
`// every attempt misses a gate` comment, relying on `shift()` on an empty array returning
`undefined` (falsy). If `MAX_ATTEMPTS` changes to 4 or 6, line 122's array is wrong and the test
breaks or, worse, passes for the wrong reason (page 2 consuming a `false` meant for page 1's
attempts).

#### Proposed solution

Import `MAX_ATTEMPTS` from the CLI (or have the CLI export it) and build the sequences
programmatically: `Array(MAX_ATTEMPTS).fill(false)` for an exhausted page, `.concat([true])` for a
following pass. Add a helper `const allFail = () => Array(MAX_ATTEMPTS).fill(false)` so intent is
named. The empty-array "misses every gate" cases should use the same named helper rather than
relying on `undefined`.

#### Verification

Temporarily change `MAX_ATTEMPTS` in the CLI and confirm the tests still pass (they should, once the
arrays are derived from it) rather than breaking on a hardcoded length.

---

### [P2][architecture] `light-fill-cli` tests exercise the CLI through import side effects and match error strings, making them brittle

**File(s):** `tools/asset-gen/tests/light-fill-cli.test.mjs:86-90,124,193` (`runCli` + error
assertions) — pinned at SHA f934d43

#### Problem

The suite runs the CLI by mutating `process.argv`, calling `vi.resetModules()`, and dynamically
`import()`-ing `bin/gen-coloring-fills.mjs` purely for its top-level side effects:

```js
async function runCli(...args) {
  process.argv = ['node', 'gen-coloring-fills.mjs', ...args];
  vi.resetModules();
  return import('../bin/gen-coloring-fills.mjs');
}
```

Failure is then asserted by string-matching a thrown message:
`.rejects.toThrow('1 render(s) failed.')` (lines 124, 193). This couples the test to (a) the module
having no idempotent entry point — eleven `vi.mock` calls plus `vi.resetModules` are needed to
re-run it — and (b) the exact prose of a log/throw string that is not a stable contract. A reworded
error message ("1 page failed to render.") silently fails the suite even when behavior is correct.

#### Proposed solution

Have `bin/gen-coloring-fills.mjs` export an `async function run(argv)` that returns a structured
result (`{ failed: number, shipped: [...] }`) and throws a typed error, with the
`if (isMainModule) run(process.argv)` guard calling it. Tests then call `run([...])` directly and
assert on `result.failed === 1` rather than a message string, dropping the `resetModules`/`argv`
dance.

#### Verification

The tests no longer reference `process.argv` or `import('../bin/...')`;
`grep -n "toThrow('1 render" tools/asset-gen/tests/light-fill-cli.test.mjs` returns nothing. Suite
still passes.

---

### [P2][duplication] Proof-sheet client hardcodes `OUTLINE_LUMA = 150`, duplicating the punch threshold that can drift out from under it

**File(s):**
`tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js:8` (constant)
— pinned at SHA f934d43

#### Problem

```js
const OUTLINE_LUMA = 150; // asset-gen's punch threshold (lib/punch-fill.mjs)
```

This is a copy of `OUTLINE_LUMA_THRESHOLD = 150` exported from
`tools/asset-gen/lib/punch-fill.mjs:35` and used at line 125 there. The proof sheet's whole purpose
is to faithfully approximate the shipped punch (see the `buildFills` comment at lines 36-43); if the
pipeline's punch threshold is retuned, this client keeps masking at 150 and the proof sheet lies
about what ships. The comment binding the two is not enforcement. The client is a browser script
with no build step so it cannot `import` the constant directly — but the generator already injects
`window.__COLORING_BOOK_PROOF_SHEET__` (line 6), so the value can travel in that blob.

#### Proposed solution

Have `bin/gen-coloring-book-proof-sheet.mjs` import `OUTLINE_LUMA_THRESHOLD` from
`lib/punch-fill.mjs` and include it in the injected JSON (`{ cells, source, outlineLuma }`); read
`SOURCE`-side `outlineLuma` in the client instead of the literal `150`. Same treatment removes the
drift for any other pipeline constant the client mirrors.

#### Verification

Change `OUTLINE_LUMA_THRESHOLD` in `punch-fill.mjs`, regenerate a proof sheet, and confirm the
client's masking follows without editing the client.

---

### [P3][duplication] The `--flag=value` `arg()` parser is copy-pasted across the crayon-sample scripts, and `build-sheet` re-inlines it

**File(s):** `tools/asset-gen/crayon-brush-samples/build-compare-sheet.mjs:20-21`,
`capture-current.mjs:21-22`, `build-sheet.mjs:133-135` — pinned at SHA f934d43

#### Problem

Two files carry a byte-identical helper:

```js
const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
```

`build-sheet.mjs` then parses `--artifact=` a *third* way inline
(`process.argv.find(a => a.startsWith('--artifact='))?.slice('--artifact='.length)`), so the same
folder resolves the same flag three different ways. The `name.length + 3` in the shared copy is
itself an unexplained magic offset (`--` + `=` = 3 chars).

#### Proposed solution

Add a small `argFlag(name, fallback)` to `scripts/lib/scrapbook-chrome.mjs` (already imported by all
three) or a sibling `scripts/lib/args.mjs`, computing the prefix once (`const p = \`--${name}=\`;
…slice(p.length)`) so the offset is derived, not magic. Route all three call sites through it.

#### Verification

`grep -rn "startsWith(\`--\${name}"
tools/asset-gen/crayon-brush-samples/`returns no local definitions; each script still honors`--renders=`,`--out=`,`--artifact=`.

---

### [P3][duplication] `buildHalf` repeats the same "create span, set class + text, append" block five times

**File(s):**
`tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js:136-204`
(function), esp. 152-179 (note spans) — pinned at SHA f934d43

#### Problem

`buildHalf` is a 68-line DOM builder in which the caption chips are hand-assembled by near-identical
five-line blocks:

```js
const note = document.createElement('span');
note.className = 'note';
note.textContent = 'no night fill';
cap.appendChild(note);
```

repeated verbatim for "no night fill" (159-163), "no chalk (inverted pen)" (164-169), "raw fill
(pre-fork fallback)" (170-175), plus structurally-identical variants for the keep chip (152-157) and
the NIGHT/LIGHT pill (176-179). The boilerplate buries the actual branching logic (which notes apply
to which theme).

#### Proposed solution

Extract
`const chip = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; cap.appendChild(s); };`
and collapse the body to guarded one-liners:
`if (theme === 'dark' && !cell.night) chip('note', 'no night fill');`. Cuts the function roughly in
half and makes the note conditions scannable.

#### Verification

Regenerate a proof sheet and confirm the caption chips (keep %, notes, NIGHT/LIGHT pill) still
render identically in both halves.

---

### [P3][maintainability] `legacy/retouch-line-art.mjs` documents a wrong invocation path and pins a superseded model

**File(s):** `tools/asset-gen/legacy/retouch-line-art.mjs:25-28` (usage), `:40` (model) — pinned at
SHA f934d43

#### Problem

The header's own usage line omits the `legacy/` segment the file was moved into:

```js
//   node --experimental-strip-types --disable-warning=ExperimentalWarning \
//     tools/asset-gen/retouch-line-art.mjs <cat/page-orient...> ...
```

The real path is `tools/asset-gen/legacy/retouch-line-art.mjs` (the sibling `legacy/README.md:15`
gets it right, so the two disagree). The `legacy/night-fills.md` runbook repeats the same wrong
path. Separately, this "kept runnable as a template" tool pins `MODEL = 'gemini-2.5-flash-image'`
(line 40) while the live pipeline and even the neighboring scratch generator
(`crayon-brush-samples/gen.mjs:19`) moved to `gemini-3.1-flash-image` — anyone who takes the file up
on its "still a handy template" offer runs it against a stale model.

#### Problem matters because

The whole reason the file was kept (not deleted) is to be an accurate one-off template; a template
with a copy-paste path that doesn't resolve and an obsolete model constant fails at its only
remaining job.

#### Proposed solution

Fix the header path to `tools/asset-gen/legacy/retouch-line-art.mjs`, and either bump `MODEL` to the
current `gemini-3.1-flash-image` or add one explicit line stating the model is intentionally frozen
at 2.5 for era fidelity. Whichever the maintainer intends, make it deliberate rather than stale.

#### Verification

Copy the header's invocation verbatim and confirm Node resolves the file.
`grep -rn "gemini-2.5" tools/asset-gen/` to see whether any live path still pins it.

---

### [P3][complexity] `render()` and `buildHalf()` are long, multi-branch functions carrying the proof sheet's whole draw model

**File(s):**
`tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js:84-125`
(`render`), `136-204` (`buildHalf`) — pinned at SHA f934d43

#### Problem

`render` (42 lines) interleaves reference-image selection, canvas sizing, a `color`-view early
return, the paper fill, and a nested `combined`-view punch-vs-draw-as-is decision (lines 112-122)
whose condition (`SOURCE === 'samples' || tile.rawFill`) re-encodes the same rawFill logic that
`buildHalf` computes separately at line 187. `buildHalf` mixes synchronous DOM scaffolding with an
async `imgsP.then` that pushes tiles and wires a click handler. Both are the kind of function where
a reader must hold the entire layer/theme/view matrix in their head at once.

#### Proposed solution

Extract the view branches of `render` into `drawColorView(ctx, tile, w, h)` and
`drawCombinedView(ctx, tile, w, h)`; hoist the "does this fill need punching" test into one named
predicate `needsPunch(tile)` used by both `render` and `buildHalf` so the rule lives once. Split
`buildHalf` into `buildCaption(cell, theme)` (sync) and `attachTile(...)` (the async wiring).

#### Verification

Regenerate a proof sheet, click through outline/color/combined on both a shipped-fill and a
samples-mode cell, and confirm the punch-vs-as-is behavior is unchanged.

---

### [P4][duplication] Two base64 image-inliners (`uri` / `dataUri`) do the same job under different names

**File(s):** `tools/asset-gen/crayon-brush-samples/build-compare-sheet.mjs:27-33` (`uri`),
`build-sheet.mjs:65-68` (`dataUri`) — pinned at SHA f934d43

#### Problem

Both scripts inline images as `data:` URIs for a self-contained scrapbook page;
`build-compare-sheet` calls it `uri` (and resizes via sharp), `build-sheet` calls it `dataUri` (and
passes through, MIME-mapped). Same concept, two names, two implementations — a reader comparing the
two sheets can't tell whether the difference is intentional. The shared scrapbook chrome lib
(`scripts/lib/scrapbook-chrome.mjs`) is the natural home and already the common import.

#### Proposed solution

Add one `inlineImage(path, { width } = {})` to `scrapbook-chrome.mjs` that resizes when `width` is
given and passes through otherwise, returning a data URI. Both scripts call it; drop the local
copies. Pick one name.

#### Verification

Rebuild both sheets and diff the emitted HTML — image `src` data URIs should be equivalent (modulo
the intended resize).

---

### [P4][test-quality] `composite-eye` hardcodes fixture-name arrays and a `length === 5` that duplicate `manifest.json`

**File(s):** `tools/asset-gen/tests/composite-eye.test.mjs:42,56,89` — pinned at SHA f934d43

#### Problem

The suite loads `manifest.json` (which already lists all five fixtures with `expectBlankOrb` flags
and `worstCoreDarkFrac` values), yet the true-positive and over-flag cases are driven by literal
arrays hardcoded in the test:

```js
for (const name of ['stegosaurus-tall', 'horse-tall']) { ... }        // line 42
for (const name of ['unicorn-tall', 'owl-tall', 'square-tall']) {...} // line 56
```

and the manifest check asserts a magic `expect(manifest.length).toBe(5)` (line 89). Add a sixth
fixture and you must update the manifest, the two arrays, and the count — three places that silently
disagree until someone notices. The manifest is the source of truth but isn't used to drive the
parametrized cases.

#### Proposed solution

Derive the two loops from the manifest: `manifest.filter(e => e.expectBlankOrb)` and
`manifest.filter(e => !e.expectBlankOrb)`. Drop the magic `5` (or assert against `manifest.length`
dynamically elsewhere). The manifest's `worstCoreDarkFrac` values can also feed the margin
assertions instead of recomputing.

#### Verification

Add a dummy manifest entry (with fixtures) and confirm the parametrized tests pick it up without
editing the test body.

---

### [P4][duplication] The comp/light/pen fixture-loading trio is duplicated between two eye test suites

**File(s):** `tools/asset-gen/tests/composite-eye.test.mjs:24-33` (`FIXTURES` + `score`),
`tools/asset-gen/tests/golden-catalog.test.mjs:8-20` (`FIXTURES` + `scoreFixture`) — pinned at SHA
f934d43

#### Problem

Both suites compute the same
`FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/composite-eye')` and both open
the identical `${name}.comp/.light/.pen.webp` trio with a `Promise.all([readFile…])` before scoring.
The read boilerplate (the load, not the scoring) is copy-pasted; a change to the fixture layout
(e.g. adding a `.chalk` sidecar) touches two files.

#### Proposed solution

Add `tests/fixtures/composite-eye/load.mjs` exporting
`loadTrio(name) => Promise<{comp, light, pen}>` (and the `FIXTURES` dir constant). Both suites
import it and layer their own scoring on top.

#### Verification

Both suites still pass; `grep -rn "fixtures/composite-eye')" tools/asset-gen/tests/*.test.mjs` shows
the path defined once.

---

### [P4][naming] `build-sheet.mjs` documents a spurious `--experimental-strip-types` invocation it doesn't need

**File(s):** `tools/asset-gen/crayon-brush-samples/build-sheet.mjs:6` (header usage) — pinned at SHA
f934d43

#### Problem

```js
//   node --experimental-strip-types --disable-warning=ExperimentalWarning build-sheet.mjs
```

Those flags exist only to let Node import TypeScript. `build-sheet.mjs` imports
`scrapbook-chrome.mjs` and `./samples.mjs` — both plain ESM, no `.ts` anywhere. The flags are
cargo-culted from the sibling `gen.mjs:5`, which genuinely needs them (it imports
`geminiSafety.ts`). A reader copying the documented command runs `build-sheet.mjs` with meaningless
flags and may assume it depends on TS tooling it doesn't.

#### Proposed solution

Change the header to `node build-sheet.mjs [--artifact=<path>]`. Audit the other crayon scripts:
`capture-current.mjs` and `build-compare-sheet.mjs` likewise import no TS and should document a
plain `node …` invocation; only `gen.mjs` keeps the strip-types flags.

#### Verification

`node tools/asset-gen/crayon-brush-samples/build-sheet.mjs` (with an `out/` dir present) runs
without the flags. `grep -l "geminiSafety.ts\|\.ts'" tools/asset-gen/crayon-brush-samples/*.mjs`
shows only `gen.mjs` importing TS.

---

### [P4][naming] `keepClass` uses unexplained 99/96 buckets that disagree with the actual keep gate

**File(s):**
`tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js:132-134` —
pinned at SHA f934d43

#### Problem

```js
function keepClass(keep) {
  return keep >= 99 ? 'good' : keep >= 96 ? 'ok' : 'warn';
}
```

The two magic thresholds have no named constant or comment, and they silently disagree with the
pipeline's real bar: `KEEP_THRESHOLD = 0.92` (92%) in `lib/outline-match.mjs:38`. A page that
*passed* the gate at 93% renders as a red `warn` chip in the proof sheet, which reads as a failure
to a reviewer. Whether that stricter review bar is intentional is undocumented.

#### Proposed solution

Name the thresholds (`const KEEP_GOOD = 99, KEEP_OK = 96;`) with a one-line comment explaining they
are *review* buckets deliberately stricter than the 92% ship gate — or align/inject them from the
pipeline constant if they were meant to match. Either way, make the relationship explicit.

#### Verification

Regenerate a proof sheet for a category with a low-90s keep score and confirm the chip color matches
the documented intent.

---

### [P4][naming] `outline-targets` test still frames backslash handling as "Windows-style" after Windows support was dropped

**File(s):** `tools/asset-gen/tests/outline-targets.test.mjs:115-122` — pinned at SHA f934d43

#### Problem

```js
test('normalizes Windows-style target separators', async () => {
  await expect(resolveOutlineTargets(['nature\\ant-tall'], options())).resolves.toEqual([...]);
```

Per the root `CLAUDE.md`, Windows dev support was dropped (ADR-0062). The behavior under test —
normalizing a backslash a user typed into a target argument — may still be desirable, but naming it
"Windows-style separators" now points at a platform the project no longer supports, misleading a
reader into thinking this guards a live cross-platform concern.

#### Proposed solution

If backslash normalization is still wanted, rename the test to describe the actual contract
("normalizes backslash separators in target args") and drop the Windows framing. If it was only
there for Windows, consider whether the case (and the normalization code it guards in
`lib/outline-targets.mjs`) is now dead.

#### Verification

Confirm with the maintainer whether backslash targets are still a supported input; rename or delete
accordingly. The assertion behavior is unaffected by a rename.

---

### [P5][readability] Inconsistent `test(` vs `it(` across the pipeline test suite

**File(s):** `tools/asset-gen/tests/light-fill-cli.test.mjs`,
`tools/asset-gen/tests/outline-targets.test.mjs` (use `test`) vs the other 11 suites (use `it`) —
pinned at SHA f934d43

#### Problem

Eleven of the thirteen `.test.mjs` files use `it(...)`; only `light-fill-cli.test.mjs` and
`outline-targets.test.mjs` use `test(...)`. Both are valid Vitest aliases, but the split is
arbitrary — it tracks nothing meaningful (both styles cover CLI and gate tests) and adds a small
grep/consistency tax when scanning the suite.

#### Proposed solution

Pick one (the `it(...)` majority) and convert the two outliers, or codify the choice in the testing
rule so it's a decision rather than an accident.

#### Verification

`grep -c "\btest(" tools/asset-gen/tests/*.test.mjs` shows zero after conversion (or a documented,
uniform choice).

---

### [P5][readability] Typo "PIXEL GEOMTRY" in the synthetic-fixtures rationale comment

**File(s):** `tools/asset-gen/tests/fixtures/synthetic.mjs:4` — pinned at SHA f934d43

#### Problem

```js
// gates score PIXEL GEOMTRY (solid-region area, ring-nesting depth, ...
```

"GEOMTRY" → "GEOMETRY". This comment is the load-bearing explanation for *why* the whole fixture
file is synthetic rather than recovered assets, so it's read often; the typo in an emphasized
all-caps phrase is more visible than most.

#### Proposed solution

Fix to `PIXEL GEOMETRY`.

#### Verification

`grep -n GEOMTRY tools/asset-gen/tests/fixtures/synthetic.mjs` returns nothing.

---

**Note on `legacy/` scope:** the subtree is *not* orphaned dead code — `legacy/README.md`
deliberately archives it as retired-technique history, and the root/asset-gen `CLAUDE.md` documents
it as a kept reference ("borrow from legacy, don't follow it"). `retouch-line-art.mjs` is
unreferenced by any live code path or npm alias (confirmed via grep), which is consistent with that
intent. So the only actionable legacy finding is the stale header path + model constant above, not
deletion.

## Source: Code audit — tools/asset-gen · ideas-exploration (R&D scratch)

### [P1][discoverability] README scoreboard and "do first" list are stale — most ideas already graduated into the live pipeline, but nothing here says so

**File(s):** `tools/asset-gen/ideas-exploration/README.md` (lines 28–75, the scoreboard + "What a
follow-up session should probably do first") — pinned at SHA f934d43

#### Problem

The README presents all 25 ideas as an open backlog "intended for a follow-up session to review and
decide what to promote," with a prioritized list of patches to "land." But that follow-up already
happened: at least ~20 of the 25 have shipped into `tools/asset-gen/bin/` and `lib/`. Concrete
evidence at this SHA:

* idea-7 → `bin/audit-night-halo.mjs` + `lib/night-halo.mjs`
* idea-13 → `bin/audit-invented-shapes.mjs` + `lib/invented-shapes.mjs`
* idea-23 → `bin/audit-golden.mjs` + `lib/golden-catalog.mjs` + `lib/night-scores.mjs`
* idea-25 → `bin/gen-asset-manifest.mjs`
* idea-10 → `lib/page-notes.mjs`
* idea-12 → `bin/audit-fill-eyes.mjs`
* idea-6 → `bin/audit-outline-solidity.mjs`, `bin/normalize-outline-strokes.mjs`
* idea-22 → `lib/night-composite.mjs`
* idea-17 → became the default model, documented in `tools/asset-gen/docs/gemini-3.1-migration.md`
* idea-11, idea-4, idea-19, idea-21, idea-24 → all recorded as landed in
  `docs/gemini-3.1-migration.md`

A newcomer reading this README today would re-do work that is already done. The document reads as a
live TODO but is actually a historical record whose recommendations were all executed.

#### Proposed solution

Add a **Status** column to the scoreboard table (lines 30–56): one of `LANDED → <path>` /
`SUPERSEDED` / `NOT PROMOTED`, with the graduated ideas pointing at their live `bin/`/`lib/` file or
the `gemini-3.1-migration.md` run record. Replace the "What a follow-up session should probably do
first" section (lines 58–75) with a short "What landed" retrospective, or delete it and defer to
`area:asset-gen` GitHub issues for anything still open. `docs/gemini-3.1-migration.md` already has
the landing facts — cross-link it from this README.

#### Verification

For each idea claimed LANDED, confirm the named `bin/`/`lib/` file exists at this SHA (it does — see
the `ls bin/ lib/` output) and that `docs/gemini-3.1-migration.md` names the idea number. Confirm no
scoreboard row still implies pending work that has in fact shipped.

---

### [P1][duplication] Graduated `idea-N/code/*.mjs` files are now drifted ancestors of live `bin/`/`lib/` files, with no pointer marking them frozen

**File(s):** `tools/asset-gen/ideas-exploration/idea-25/code/gen-asset-manifest.mjs`,
`idea-10/code/page-notes.mjs`, `idea-7/code/audit-night-halo.mjs` (and the other graduated code
dirs) — pinned at SHA f934d43

#### Problem

Several exploration scripts share a filename with the live version but have already drifted from it:

* `idea-25/code/gen-asset-manifest.mjs` (88 lines) vs `bin/gen-asset-manifest.mjs` (92 lines) —
  differs
* `idea-10/code/page-notes.mjs` (82 lines) vs `lib/page-notes.mjs` (90 lines) — differs
* `idea-7/code/audit-night-halo.mjs` vs `bin/audit-night-halo.mjs` — differs

These are legitimately-frozen snapshots, but nothing in the file or its directory says "this is a
frozen ancestor; the maintained copy is `lib/page-notes.mjs`." A `grep`/search for a function will
surface both, and someone could edit or copy the stale exploration version thinking it's current. No
`report.md` records where its code graduated (`grep -li 'graduated|now live|promoted'` across all
reports returns nothing).

#### Proposed solution

Add a one-line "Landed as: `../../bin/gen-asset-manifest.mjs`" (or "Superseded by …") banner to the
top of each graduated `report.md`, and/or a `LANDED.md` stub in each graduated `code/` dir. The
README status column (previous finding) is the systemic fix; this is the per-idea backstop so the
pointer survives even when someone lands directly in a `code/` dir.

#### Verification

`diff ideas-exploration/idea-10/code/page-notes.mjs lib/page-notes.mjs` shows drift today; after the
fix, each graduated report/dir names its live counterpart. Spot-check that every idea in the
scoreboard marked LANDED has a matching back-pointer.

---

### [P2][dead-code] `build-review.mjs` output claims "nothing here is committed" and references the deleted `IDEAS.md` — both false now

**File(s):** `tools/asset-gen/ideas-exploration/build-review.mjs` (lines 213, 224) — pinned at SHA
f934d43

#### Problem

The generated dashboard (the primary review surface per the README and parent `CLAUDE.md`) prints
two stale claims baked into `build-review.mjs`:

* Line 213 subtitle: "One subagent per idea from `tools/asset-gen/IDEAS.md`…" and "${done} of 25
  ideas explored **so far**" — `IDEAS.md` no longer exists (moved to `area:asset-gen` GitHub issues,
  per the README's own header note), and "so far" implies in-progress when all 25 are done.
* Line 224 footer: "Repo state was reverted to baseline (8e471b8) after every attempt — **nothing
  here is committed**." The entire folder is committed; this line is now self-contradicting.

The committed `ideas-review.html` embeds these strings verbatim (`grep` confirms "nothing here is
committed" and one `tools/asset-gen/IDEAS.md` reference in the HTML), so anyone opening the
dashboard sees the false claims.

#### Proposed solution

Update the subtitle to describe the burn-down as complete and historical (drop "so far", point at
`area:asset-gen` issues instead of `IDEAS.md`), and rewrite the footer to say the folder is a
committed frozen record whose per-attempt repo state was reverted. Then regenerate
`ideas-review.html` with `node build-review.mjs`.

#### Verification

After editing and regenerating, `grep -a 'nothing here is committed' ideas-review.html` returns
nothing and `grep -a 'IDEAS.md' ideas-review.html` returns nothing (or only a deliberate historical
mention).

---

### [P2][organization] 2.4 MB `idea-14/warp-both.json` is a raw per-tile coordinate dump that dwarfs its report — prune or summarize

**File(s):** `tools/asset-gen/ideas-exploration/idea-14/warp-both.json` (2.4 MB) — pinned at SHA
f934d43

#### Problem

`warp-both.json` is a 2.4 MB intermediate scan dump — per-page, per-theme, per-tile grid data with
absolute machine paths (`/home/user/Splotch/…`). It is the single largest non-image file in the
folder and accounts for most of the ~198k lines of JSON here. It is a regenerable intermediate of
`warp-scan.mjs`, not evidence a reviewer reads; the report's conclusion ("4 genuinely warped pages")
is a handful of page names. Committing it bloats the repo and embeds absolute paths that are
meaningless on any other machine.

#### Proposed solution

Delete `warp-both.json` (it regenerates from `idea-14/code/warp-scan.mjs`), or replace it with a
small `warp-summary.json` holding only the 4 flagged pages + scores. Same treatment merits a look
for the other large raw dumps: `idea-7/scores-baseline.json` + `scores-rimerase.json` (~92 KB each),
`idea-3/disagreement*.json` (~85 KB), `idea-2/whitened-inventory.json` (69 KB) — keep the ones a
reviewer actually consults, drop pure intermediates.

#### Verification

`find ideas-exploration -name '*.json' ! -name meta.json -printf '%s %p\n' | sort -rn | head` no
longer shows a multi-MB file; `du -sh ideas-exploration` drops meaningfully from 66 MB. Confirm
`warp-both.json` is not referenced by any `report.md` or `meta.json` before deleting.

---

### [P2][organization] Committed 5.2 MB `ideas-review.html` is fully regenerable from `build-review.mjs` + the `meta.json` files

**File(s):** `tools/asset-gen/ideas-exploration/ideas-review.html` (5.2 MB) — pinned at SHA f934d43

#### Problem

`ideas-review.html` is a build product: `build-review.mjs` re-derives it from every
`idea-N/meta.json` plus the evidence webp/png (which are themselves already committed). The 5.2 MB
HTML re-encodes all those images as inline base64 — a second copy of already-committed assets — and,
as the previous finding shows, it goes stale the moment `build-review.mjs`'s hardcoded strings
change. It is the biggest single file in the section.

#### Proposed solution

Decide explicitly, and record the decision in the README: either (a) gitignore `ideas-review.html`
and document `node build-review.mjs` as the one-step regen (the README already documents the command
at line 20–21), accepting a build step before viewing; or (b) keep it committed for zero-friction
browser viewing but add a note that it is generated — do not hand-edit — and treat it as needing a
regen whenever `build-review.mjs` or any `meta.json` changes. Given the folder is frozen, (b) with a
stale-output guard, or (a), are both defensible; the current state (committed, silently stale) is
the worst of both.

#### Verification

Either `.gitignore` lists `ideas-exploration/ideas-review.html` and it's untracked, or the
README/file header states it is generated and it matches a fresh `node build-review.mjs` run
(byte-diff modulo the image re-encode).

---

### [P3][organization] Full-resolution `.webp` outputs committed *inside* `code/` directories (idea-8, idea-9)

**File(s):**
`tools/asset-gen/ideas-exploration/idea-8/code/ant-wide.night.conditioned.fullres.webp`,
`idea-9/code/dragon-wide.light.conditioned.fullres.webp` — pinned at SHA f934d43

#### Problem

Every other idea keeps evidence images at the idea root and downsized (≤560 px per the README layout
contract at line 135), and reserves `code/` for scripts, patches, and small JSON. These two
full-resolution generated images live inside `code/`, breaking the "code/ holds code" convention and
smuggling large binaries past the ≤560 px evidence norm. They read as leftover generation output
that was never moved or downsized.

#### Proposed solution

Move them up to their idea root alongside the other evidence and downsize to the ≤560 px convention
(or drop them if the report's other evidence already makes the point), so `code/` contains only
scripts/patches/registries.

#### Verification

`find ideas-exploration -path '*/code/*' \( -name '*.webp' -o -name '*.png' \)` returns nothing.

---

### [P3][duplication] idea-2 ships three near-identical `motif-registry*.json` with no note on which is canonical

**File(s):** `tools/asset-gen/ideas-exploration/idea-2/code/motif-registry.json`,
`motif-registry-after.json`, `motif-registry-final.json` (also `idea-2/motif-registry-after.json`,
`motif-registry-final.json` at idea root) — pinned at SHA f934d43

#### Problem

idea-2 carries three registry snapshots under `code/` (md5-distinct: `…dc9`, `…327`, `…4cf`) plus
two more at the idea root, with names — `registry` / `-after` / `-final` — that imply an edit
sequence but don't say which one a reader should trust or which fed the final result. It's the kind
of "keep every intermediate" scratch accretion that makes the experiment hard to re-follow.

#### Proposed solution

Keep the one that represents the validated end state (presumably `-final`), delete or clearly label
the intermediates, and have `report.md` name the canonical file in one sentence.

#### Verification

`ls idea-2/code/motif-registry*.json` shows a single canonical file (or clearly-suffixed
before/after pair explicitly referenced by the report).

---

### [P3][naming] Inconsistent script naming across idea dirs — `idea{N}-` prefix vs descriptive vs `tmp-`

**File(s):** e.g. `idea-11/code/idea11-*.mjs`, `idea-12/code/idea12-*.mjs`,
`idea-15/code/idea15-*.mjs`, `idea-5/code/idea5-*.mjs`, `idea-17/code/*-idea17.mjs` vs
`idea-1/code/analyze-rim.mjs`, `idea-4/code/normalize-night-sky.mjs`, `idea-21/code/tmp-rects.mjs`,
`idea-21/code/tmp-shoot-sheet.mjs` — pinned at SHA f934d43

#### Problem

21 of the 60 exploration `.mjs` files embed a redundant `idea{N}` in the filename (already implied
by the directory), while 39 use plain descriptive names, and idea-17 uses a `-idea17` suffix instead
of a prefix. idea-21 additionally has two `tmp-`prefixed scripts (`tmp-rects.mjs`,
`tmp-shoot-sheet.mjs`) — the classic "throwaway I never renamed" marker — committed as if permanent.
The inconsistency is low-stakes for frozen scratch but adds friction for the "several carry finished
patches waiting to be promoted" ideas a maintainer may revisit.

#### Proposed solution

Don't churn all 60 files. As a light touch, note in the README that the `idea{N}` prefix is
incidental, and at minimum rename the two `idea-21/code/tmp-*.mjs` to describe what they do (they
generated the comparison sheets) or delete them if superseded by the landed
`contact-sheet-git-source-and-compare.patch` in the same dir.

#### Verification

`find ideas-exploration -name 'tmp-*'` returns nothing; the README notes the naming convention.

---

### [P3][discoverability] `report.md` files carry no back-reference to their outcome (landed / open issue) or to the live code

**File(s):** all `tools/asset-gen/ideas-exploration/idea-*/report.md` — pinned at SHA f934d43

#### Problem

`grep -li 'graduated|now live|landed in|promoted to'` across all 25 reports returns nothing. Each
report is a self-contained narrative of what was tried, but has no header line stating the final
disposition — whether it shipped (and where), was superseded, or remains an open `area:asset-gen`
issue. Combined with the stale README (P1), a reader has to reverse-engineer each idea's real-world
status by cross-referencing `bin/`/`lib/` and `docs/gemini-3.1-migration.md` themselves.

#### Proposed solution

Add a one-line status banner to the top of each `report.md`:
`Status: LANDED as bin/audit-golden.mjs (see docs/gemini-3.1-migration.md)` /
`Status: OPEN — area:asset-gen #NNN` / `Status: NOT PROMOTED`. This is the per-file complement to
the README status column and survives README churn.

#### Verification

Every `report.md` opens with a `Status:` line; the LANDED ones name a file that exists at this SHA.

---

### [P3][architecture] Ad-hoc scoring/audit logic in exploration scripts was only partially extracted into `lib/` — some remains duplicated per-idea

**File(s):** `tools/asset-gen/ideas-exploration/idea-8/code/score-hue-coherence.mjs`,
`idea-9/code/score-orient-coherence.mjs`, `idea-3/code/chalk-fill-disagreement.mjs`,
`idea-14/code/analyze-warp.mjs` + `warp-scan.mjs` — pinned at SHA f934d43

#### Problem

The burn-down's biggest architectural win was extracting scoring gates into reusable libs (idea-23 →
`lib/night-scores.mjs`, idea-7 → `lib/night-halo.mjs`, idea-13 → `lib/invented-shapes.mjs`). But
several scorers that the README's cross-cutting learnings call out as real signal never graduated:
the hue-coherence scorer (idea-8, "ranks catalog"), the tall↔wide orientation-coherence scorer
(idea-9), the chalk/fill disagreement scorer (idea-3, "a dozen new flags"), and the
warp-registration scorer (idea-14, "4 genuinely warped pages"). Their logic — bgLuma, region-mean,
hue-angle math — is reimplemented inline in each script rather than sharing `lib/` primitives, and
there's no live `bin/audit-*` for these four failure classes despite each surfacing confirmed
shipped defects.

#### Proposed solution

This is a promotion decision, not a rename: for each of the four, either file/confirm an
`area:asset-gen` issue to extract it into `lib/` + a `bin/audit-*.mjs` (mirroring how idea-7/13/23
landed), or record in the report why it was deliberately not promoted. At minimum, note in the
README status column that these four are the un-promoted scorers so they don't get silently
forgotten.

#### Verification

Each of idea-3/8/9/14 has an explicit disposition (open issue link or "not promoted, because…") in
its report; any promoted scorer appears under `bin/audit-*` + `lib/`.

---

### [P4][maintainability] `build-review.mjs` silently drops any idea whose `meta.json` fails to parse

**File(s):** `tools/asset-gen/ideas-exploration/build-review.mjs` (lines 52–60, 117–119) — pinned at
SHA f934d43

#### Problem

The one maintained tool in this folder logs a bad `meta.json` to stderr and continues (`ideas.push`
skipped), so a parse error silently produces a dashboard missing that idea while `console.log` still
reports "wrote … (N ideas)". `done` (line 117) is derived from whatever survived, and the header
hardcodes "of 25" — so a dropped idea shows as "24 of 25" with no error surfaced to the viewer. All
25 `meta.json` files parse and share an identical key set today, so this is latent, not active.

#### Proposed solution

Since 25 is the known fixed count of a frozen set, have `build()` assert `ideas.length === 25` (or
compare against the `idea-*` directory count) and exit non-zero on mismatch, so a future edit that
breaks a `meta.json` fails loudly rather than quietly shrinking the dashboard.

#### Verification

Temporarily corrupt one `meta.json`, run `node build-review.mjs`, and confirm it now errors instead
of writing a 24-idea page.

---

### [P4][organization] Absolute machine paths (`/home/user/Splotch/…`) baked into committed JSON evidence

**File(s):** `tools/asset-gen/ideas-exploration/idea-14/warp-both.json`, and any other committed
intermediate JSON capturing `source`/`fill` paths — pinned at SHA f934d43

#### Problem

`warp-both.json` (and likely other scan dumps) records absolute paths like
`/home/user/Splotch/web/static/coloring/creatures/dragon-tall.outline.webp`. These are
environment-specific, meaningless on another contributor's machine, and a minor privacy/portability
smell in committed evidence.

#### Proposed solution

Largely subsumed by the P2 prune of `warp-both.json`. For any intermediate JSON that is kept, store
repo-relative paths (strip `REPO_ROOT`) — and prefer keeping only summarized evidence over full
path-laden dumps.

#### Verification

`grep -rl '/home/user/' ideas-exploration --include=*.json` returns nothing (or only files
explicitly retained with a documented reason).

---

## Summary

`tools/asset-gen/ideas-exploration/` is unusually well-documented for scratch — a consistent
`meta.json` schema across all 25 ideas, per-idea `report.md`, and a self-contained dashboard. It
earns its place in the repo as a frozen R&D record. The dominant problem is **staleness of
disposition**: the burn-down succeeded and ~20 of 25 ideas shipped into `bin/`/`lib/`, but the
README, the reports, and the generated dashboard all still read as an open backlog awaiting
promotion (P1×2, P2, P3 discoverability). The second theme is **weight**: a committed 5.2 MB
regenerable HTML, a 2.4 MB raw JSON dump, and full-res images misfiled in `code/` dirs push the
folder to 66 MB (P2×2, P3). Highest-value fixes: add a graduation/status column to the README
scoreboard and a `Status:` banner to each report, and prune the regenerable/intermediate large
files. No code was changed — report only.

## Source: Code audit — scripts · root build/dev drivers

### [P1][maintainability] Two competing Chromium-path mechanisms — one brittle and hardcoded

**File(s):** `scripts/lib/model-eval.mjs:50-51` (CHROMIUM_PATH) vs `scripts/lib/utils.mjs:82-100`
(chromiumExecutablePath); consumed by `scripts/model-eval-run.mjs:117,252`,
`scripts/model-eval-gen-inputs.mjs:63`, `scripts/model-eval-fixtures.mjs:423` vs
`scripts/driver-smoke.mjs:68`, `scripts/gen-large-image.mjs:108`, `scripts/store-shots.mjs:122` —
pinned at SHA f934d43

#### Problem

The repo has two ways to point Playwright at Chromium. The robust one,
`chromiumExecutablePath(chromium)`, self-heals when the pinned browser revision drifts (its own
comment documents exactly this failure: "the env installed 1223 while this Playwright wants 1228").
The model-eval scripts instead import a hardcoded constant:

```js
export const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
```

That pins a single revision (`chromium-1194`) and a single sub-dir (`chrome-linux`, never
`chrome-linux64`) — the precise brittleness `chromiumExecutablePath` was written to fix. When the
browser bumps, every `model-eval*` script breaks with "Executable doesn't exist" while the smoke/gen
scripts keep working, and a reader can't tell why two scripts resolve Chromium differently.

#### Proposed solution

Delete `CHROMIUM_PATH` from `lib/model-eval.mjs` and have all five model-eval call sites use
`chromiumExecutablePath(chromium)` from `lib/utils.mjs`, matching the other browser-driving scripts.
Keep `PLAYWRIGHT_CHROMIUM_PATH` support by folding it into the existing `PLAYWRIGHT_CHROMIUM`
override in `chromiumExecutablePath` (or aliasing it).

#### Verification

`grep -rn CHROMIUM_PATH scripts/` returns nothing after the change; run
`npm run model-eval:fixtures` (no network needed for fixtures) and confirm the browser launches.
Simulate drift by pointing `PLAYWRIGHT_BROWSERS_PATH` at a dir with a different `chromium-<n>` and
confirm both model-eval and driver-smoke still resolve a binary.

---

### [P1][duplication] Release-bundle `.aab` path hardcoded three times

**File(s):** `scripts/release.mjs:155-164` (aab), `scripts/android-verify.mjs:17-26` (AAB),
`package.json` `android:open` script (`android/app/build/outputs/bundle/release`) — pinned at SHA
f934d43

#### Problem

The path to the signed Android bundle is spelled out independently in at least three places:

```js
// release.mjs
const aab = join(
  ROOT,
  'android',
  'app',
  'build',
  'outputs',
  'bundle',
  'release',
  'app-release.aab',
);
// android-verify.mjs
const AAB = join(
  ROOT,
  'android',
  'app',
  'build',
  'outputs',
  'bundle',
  'release',
  'app-release.aab',
);
```

plus the directory literal in the `android:open` npm script. A Gradle output-path change (or a
variant flavor) means editing three disconnected spots; miss one and `android:verify` checks a stale
path while `release` attaches a different file. `lib/android.mjs` already exists as the home for
Android path constants but doesn't hold this one.

#### Proposed solution

Add to `scripts/lib/android.mjs`:

```js
export const RELEASE_BUNDLE_DIR = join(
  ROOT,
  'android',
  'app',
  'build',
  'outputs',
  'bundle',
  'release',
);
export const RELEASE_AAB = join(RELEASE_BUNDLE_DIR, 'app-release.aab');
```

(import `ROOT` from `lib/utils.mjs`). Use `RELEASE_AAB` in `release.mjs` and `android-verify.mjs`;
point `android:open` at a tiny wrapper or have `open-path.mjs` accept a named target so the
directory isn't re-typed in `package.json`.

#### Verification

`grep -rn "outputs.*bundle.*release" scripts package.json` shows only the constant's definition. Run
`npm run android:verify` against a built bundle to confirm the resolved path still finds
`app-release.aab`.

---

### [P1][complexity] `model-eval-fixtures.mjs` embeds an 80-line browser program as a template string

**File(s):** `scripts/model-eval-fixtures.mjs:333-415` (`PAGE_JS`) — pinned at SHA f934d43

#### Problem

The entire in-page canvas renderer — `paper`, `crayon`, `strokePaths`, `drawOutline`, `revealFill`,
`revealGradient`, the `SCENES` map, `renderFixture` — lives inside one giant backtick string
assigned to `PAGE_JS` and injected via `page.evaluate(PAGE_JS)`. It's ~80 lines of dense JavaScript
with no syntax highlighting, no linting, no type checking, and no editor help; a typo surfaces only
as a runtime `pageerror`. It also silently duplicates the node-side RNG (`makeRng`/`jit`, lines
31-38) as page-side `rnd`/`jit` (lines 337-338) with the same LCG constants.

#### Proposed solution

Move the renderer to a real committed asset, e.g. `scripts/lib/model-eval-fixture-renderer.js`
(plain browser JS), and load it with `await page.addScriptTag({ path: rendererPath })` instead of
`page.evaluate(PAGE_JS)`. Now it lints/highlights like normal code. Optionally share one seeded-RNG
definition by injecting it the same way rather than maintaining two copies.

#### Verification

`npm run model-eval:fixtures` regenerates the corpus; diff a couple of output PNGs against the
pre-change versions to confirm byte-identical rendering. Confirm the file is picked up by
Prettier/eslint (no longer a string).

---

### [P1][complexity] `api-smoke.mjs` is one 320-line `run()` with ~24 inline fetch/check blocks

**File(s):** `scripts/api-smoke.mjs:25-346` (`run`) — pinned at SHA f934d43

#### Problem

`run()` is a single function that sequentially exercises admin login, the tokens auth gate, tokens
CRUD, verify-access-code, report (validation/honeypot/unconfigured/throttle), csp-report (five
formats + throttle), generate-image (raw + legacy multipart), and the shared 429 contract — all as
flat inline `await fetch(...)` + `check(...)` pairs. There are no section functions, so a reader
can't run/skim one contract in isolation, and shared request shapes (the JSON POST, the bearer
header) are re-typed at every call.

#### Proposed solution

Split into named async suites called from `run()`: `checkAdminAuth(base)`,
`checkTokensCrud(base, auth)`, `checkVerifyAccessCode`, `checkReport`, `checkCspReport`,
`checkGenerateImage`, `checkThrottling`. Hoist the repeated request helpers
(`postJson(path, {headers, body})`, `authHeader(session)`) to the top or to `lib/`. Each suite still
calls the shared `check()`/`fatal()` reporter, so totals are unaffected.

#### Verification

`npm run test:api:smoke` prints the same pass/fail tally and exit code as before. The section
functions make it possible to comment one out and see only that block skipped.

---

### [P2][duplication] Run-id timestamp format duplicated across report scripts

**File(s):** `scripts/redteam-run.mjs:33`, `scripts/model-eval-run.mjs:47-49` — pinned at SHA
f934d43

#### Problem

Both scripts mint a filesystem-safe run id the same way:

```js
new Date().toISOString().replace(/[:.]/g, '-'); // redteam-run
new Date().toISOString().replace(/[:.]/g, '-') + (OUT_TAG ? `-${OUT_TAG}` : ''); // model-eval-run
```

Same regex, same intent, independently maintained.

#### Proposed solution

Add
`export const runId = (tag) => new Date().toISOString().replace(/[:.]/g, '-') + (tag ?`-${tag}`: '');`
to `scripts/lib/utils.mjs` and use it in both scripts.

#### Verification

`grep -rn "replace(/\[:.\]/g" scripts/` shows only the helper. Run both scripts (or the
fixture/report-only paths) and confirm output dirs are still named `2026-...`.

---

### [P2][duplication] OS "open a file" logic implemented twice, differently

**File(s):** `scripts/open-path.mjs:16` and `scripts/redteam-run.mjs:266-275` (`openInBrowser`) —
pinned at SHA f934d43

#### Problem

The `darwin ? open : xdg-open` branch — which `scripts/CLAUDE.md` explicitly says belongs "behind a
branch in `scripts/lib/`" — appears in two places with divergent behavior: `open-path.mjs` runs it
through `run()` (blocking, exits on failure), while `redteam-run.mjs` re-derives the same branch and
spawns detached+unref best-effort:

```js
const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
```

The platform knowledge is duplicated and will drift.

#### Proposed solution

Add one helper to `lib/utils.mjs`, e.g. `openInОS(target, { detached = false } = {})` that owns the
`open`/`xdg-open` selection and both spawn modes. `open-path.mjs` calls it blocking;
`redteam-run.mjs` calls it detached. Single source for the opener.

#### Verification

`grep -rn "xdg-open" scripts/` shows only the helper. Run `npm run android:open` (reveals a folder)
and `npm run redteam` end (opens the report) on Linux and macOS.

---

### [P2][consistency] Playwright imported from two different packages

**File(s):** `scripts/model-eval-run.mjs:17`, `scripts/model-eval-gen-inputs.mjs:13`,
`scripts/model-eval-fixtures.mjs:22` (`from 'playwright'`) vs `scripts/driver-smoke.mjs:10`,
`scripts/gen-large-image.mjs:14`, `scripts/store-shots.mjs:12` (`from '@playwright/test'`) — pinned
at SHA f934d43

#### Problem

Half the browser-driving scripts import `chromium` from `playwright`, the other half from
`@playwright/test`. They resolve to the same runtime, but the split is arbitrary, invites confusion
about which package is the dependency, and pairs with the CHROMIUM_PATH inconsistency above (the
`playwright` importers are exactly the ones using the brittle path). It also matters for the
inverted deps rule (ADR-0070): whichever package the web build doesn't need should be consistent.

#### Proposed solution

Pick one import specifier for all script-side Chromium launches (align with whatever
`web/playwright.config.ts` and the deps split intend) and apply it across all six scripts.

#### Verification

`grep -rn "import { chromium }" scripts/` shows a single specifier. Run `npm run test:driver:smoke`
and `npm run model-eval:fixtures`.

---

### [P2][architecture] Red-team HTML report built inline; model-eval's equivalent was extracted to lib

**File(s):** `scripts/redteam-run.mjs:113-263`
(`esc`/`dataUri`/`outputCell`/`rowHtml`/`sectionHtml`/`writeReport`) vs
`scripts/lib/model-eval-report.mjs` — pinned at SHA f934d43

#### Problem

`model-eval-run.mjs` cleanly delegates report generation to `lib/model-eval-report.mjs`
(`buildReport(...)`), keeping the runner about running. The sibling `redteam-run.mjs` instead
carries ~150 lines of report machinery — inline HTML, a full `<style>` block, escaping, data-URI
embedding — mixed into the runner. Two near-identical tools diverge in structure, and the redteam
runner is much harder to read as a result.

#### Proposed solution

Extract the report code into `scripts/lib/redteam-report.mjs` exporting
`buildReport({ runId, outDir, results })`, mirroring `model-eval-report.mjs`. `redteam-run.mjs`
shrinks to orchestration + calling it.

#### Verification

`npm run redteam` (or a stubbed run) still writes `report.html`/`report.json`; diff the HTML against
a pre-change run to confirm identical output.

---

### [P2][duplication] Maestro smoke flow duplicated across Android and iOS runners

**File(s):** `scripts/android-emulator-smoke.mjs:77-80` and `scripts/ios-simulator-smoke.mjs:57-63`
— pinned at SHA f934d43

#### Problem

Both device runners hardcode the same three-step flow with the same literal flow path:

```js
await sh('npm run cap:sync');
// …platform-specific build/install…
await sh(`"${maestroPath()}" [--device …] test .maestro/smoke.yaml`);
```

The `cap:sync` step, the `.maestro/smoke.yaml` path, and the maestro invocation shape are
copy-pasted; a change to the flow file name or a `cap:sync` prerequisite must be edited in two
files.

#### Proposed solution

Add `export const SMOKE_FLOW = '.maestro/smoke.yaml';` and a helper like
`runMaestroSmoke({ device } = {})` (does `sh('npm run cap:sync')` is arguably per-platform, but at
minimum share the flow constant + the maestro command builder) to `lib/smoke.mjs` or a new
`lib/native-smoke.mjs`. Both runners call it after their platform-specific install step.

#### Verification

`grep -rn "smoke.yaml" scripts/*.mjs` shows the constant only. Run `npm run test:android` (and
`test:ios` on a Mac) to confirm the flow still executes.

---

### [P2][dead-code] Windows backslash path conversions are vestigial after ADR-0062

**File(s):** `scripts/generate-icon-names.mjs:14`, `scripts/image-audit.mjs:39`,
`scripts/publish-scrapbook.mjs:100-101`, `scripts/android-setup.mjs:79` — pinned at SHA f934d43

#### Problem

Several scripts still normalize Windows separators although Windows dev support was dropped
(ADR-0062) and `scripts/CLAUDE.md` states scripts run only on macOS/Linux, where
`globSync`/`relative` never emit backslashes:

```js
.replace(/\\/g, '/')                       // generate-icon-names
const posix = (p) => relative(ROOT, p).split('\\').join('/');   // image-audit
rel.split('\\').join('/')                  // publish-scrapbook (×2)
ANDROID_HOME.replaceAll('\\', '/')         // android-setup local.properties
```

These are unreachable no-ops that imply a platform matrix the project no longer supports, and they
mildly obscure the real logic.

#### Proposed solution

Remove the backslash handling. In `image-audit.mjs` reduce `posix` to `relative(ROOT, p)`. In
`publish-scrapbook.mjs` drop the `.split('\\').join('/')`. Keep a one-line note only where a path is
written into a file that a human might open on any OS if genuinely warranted (`android-setup`
local.properties) — but per ADR-0062 it can go too.

#### Verification

`grep -rn "\\\\\\\\" scripts/*.mjs` (excluding legitimate regex escapes) is clean. Run
`npm run gen:icons`, `npm run img:audit`, `npm run scrapbook:index`, `npm run android:setup` and
confirm identical output.

---

### [P2][consistency] Missing-API-key guard written three different ways

**File(s):** `scripts/redteam-run.mjs:278` (`fail(...)`), `scripts/model-eval-run.mjs:138-141`
(`console.error`+`process.exit(1)`), `scripts/model-eval-gen-inputs.mjs:57-60`
(`console.error`+`process.exit(1)`) — pinned at SHA f934d43

#### Problem

Three scripts guard `GEMINI_API_KEY`, each with a different idiom and message shape — one uses the
shared `fail()` helper, two hand-roll `console.error` + `process.exit(1)`. The same inconsistency
appears for other required env (`REDTEAM_FIXTURE_KEY`, `ADMIN_ACCESS_TOKEN`, `TUNNEL_AUTH` in
`cloud-tunnel.mjs:22-32` with its own `die()`). Readers get inconsistent exit codes and message
formats for the identical "required env missing" case.

#### Proposed solution

Add `export const requireEnv = (name, hint) => { if (!process.env[name]) fail(`Missing ${name}${hint
? `— ${hint}` : ''}`); return process.env[name]; };` to `lib/utils.mjs`. Replace the ad-hoc guards
(including `cloud-tunnel`'s `die`) with it.

#### Verification

Unset `GEMINI_API_KEY` and run `npm run model-eval` / `npm run redteam`: both exit non-zero with the
same message shape. `grep -rn "Missing GEMINI" scripts/` shows uniform wording.

---

### [P3][duplication] Gradle-wrapper path resolved in two places

**File(s):** `scripts/gradle.mjs:15-17` and `scripts/android-emulator-smoke.mjs:78-79` — pinned at
SHA f934d43

#### Problem

`gradle.mjs` is the canonical Gradle-wrapper runner, yet `android-emulator-smoke.mjs` re-derives the
wrapper path and shell-quotes it by hand:

```js
const gradlew = join(ROOT, 'android', 'gradlew');
await sh(`"${gradlew}" :app:installDebug`, join(ROOT, 'android'));
```

The `android/gradlew` location and the `android/` cwd are now knowledge in two files.

#### Proposed solution

Export `GRADLEW` and `ANDROID_DIR` from `lib/android.mjs` and reuse them in both `gradle.mjs` and
the smoke runner. (The smoke runner needs the rejecting `sh()` rather than exiting `run()`, so it
can't call `gradle.mjs` directly, but it can share the path constants.)

#### Verification

`grep -rn "'gradlew'" scripts/` shows only the constant. Run `npm run android:apk` and
`npm run test:android`.

---

### [P3][consistency] Two different "am I the main module?" idioms

**File(s):** `scripts/gha-versions.mjs:192` (`fileURLToPath(import.meta.url) === process.argv[1]`)
vs `scripts/lint-token-styles.mjs:121` (`import.meta.url === pathToFileURL(process.argv[1]).href`) —
pinned at SHA f934d43

#### Problem

Both scripts export helpers for unit tests and guard their CLI entry, but each converts URL↔path in
the opposite direction to compare. Two idioms for one check makes the pattern harder to copy
correctly into the next testable script (and the guards are subtly different if `process.argv[1]` is
undefined).

#### Proposed solution

Add
`export const isMain = (url) => Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === url;`
to `lib/utils.mjs`; call `if (isMain(import.meta.url)) main();` in both scripts (and any future
testable one).

#### Verification

`npm run deps:gha` and `npm run lint:tokens` still run; the corresponding unit tests
(`lint-token-styles.test.ts`) still import the helpers without triggering the CLI.

---

### [P3][duplication] Admin-API client duplicated between the two smoke tests

**File(s):** `scripts/api-smoke.mjs:26-106` and `scripts/blobs-smoke.mjs:44-135` — pinned at SHA
f934d43

#### Problem

Both smoke tests hit the identical admin surface — `POST /api/admin/login` → `{session}`, then
`GET/POST/DELETE /api/admin/tokens` with a `Bearer` header — and each reimplements the request
plumbing (`blobs-smoke` has `post()`/`del()`/`login()`; `api-smoke` inlines the same calls). The
login-and-get-session dance and the tokens JSON shapes are maintained twice.

#### Proposed solution

Extract a tiny client to `lib/`, e.g. `adminClient(base)` returning
`{ login(secret), listTokens(auth), addToken(auth, t), delToken(auth, t) }`. Both smoke scripts
build their assertions on top of it; the retry-through-429 login in `blobs-smoke` can be a flag.

#### Verification

`npm run test:api:smoke` and (against a deploy) `npm run test:blobs:smoke` produce the same
assertions; the shared client is exercised by both.

---

### [P3][maintainability] `store-shots.mjs` uses raw app selectors that bypass the rot-guarded driver

**File(s):** `scripts/store-shots.mjs:148,150,164,166,179,189` — pinned at SHA f934d43

#### Problem

`scripts/CLAUDE.md` explains that `app-driver.mjs` is the selector-facing layer, guarded against
markup rot by `test:driver:smoke`. But `store-shots.mjs` reaches into the DOM with its own raw
locators — `#coloringBookButton`, `button[aria-label="Farm coloring book"]`,
`button[aria-label="Farm coloring page"]`, `.color-swatch[data-color="custom"]`, `#parentHelpButton`
— that the driver doesn't own and the smoke test never touches. When that markup changes,
`gen:shots` silently breaks exactly the way the driver rot-guard was built to prevent, but for
selectors it can't see.

#### Proposed solution

Add driver functions for these interactions (`openColoringBook(page)`, `pickBook(page, name)`,
`pickPage(page, name)`, `openColorPicker(page)`, `openParentCenter(page)`) to `lib/app-driver.mjs`,
and have `store-shots.mjs` call them. Then extend `driver-smoke.mjs` to exercise at least the
coloring-book entry so CI catches the rot.

#### Verification

`grep -n "aria-label\|color-swatch\|Button'" scripts/store-shots.mjs` shows no raw locators.
`npm run test:driver:smoke` passes and now covers the coloring-book path; `npm run gen:shots` still
produces all five scenes.

---

### [P3][complexity] `store-shots.mjs` five scenes inline in a loop with magic waits

**File(s):** `scripts/store-shots.mjs:130-195` (scene loop), sleeps at `150,152,164,167,182,190` —
pinned at SHA f934d43

#### Problem

The per-target loop body is five anonymous `{ … }` blocks (draw / coloring-book / color-page /
color-picker / parent-center), each opening a page, doing UI steps, screenshotting, and closing —
interleaved with bare `sleep(450)`, `sleep(500)`, `sleep(400)`, `sleep(700)` whose values are
unexplained "wait for animation/overlay" guesses. It's hard to run or reason about one scene, and
the magic delays are the kind of thing that flakes.

#### Proposed solution

Extract each scene to a named async function `sceneFreeDraw(browser, base, device, dir)`, …, and
drive them from a small array so the loop reads as `for (const scene of SCENES) await scene(...)`.
Replace magic sleeps with explicit waits (`page.waitForSelector`, `waitForFunction` on the overlay
image) or named constants (`OVERLAY_LOAD_MS`) with a comment.

#### Verification

`npm run gen:shots` regenerates all `store-assets/screenshots/**` files; visually compare a couple.
Each scene function is independently callable for debugging.

---

### [P3][naming] Brand palette hex values hardcoded in generators, duplicating the source of truth

**File(s):** `scripts/store-shots.mjs:41-49` (`C`), `scripts/gen-large-image.mjs:42-49`
(`COLOR_MAP`) vs `web/src/lib/state/colors.svelte.ts:21-53` — pinned at SHA f934d43

#### Problem

`store-shots.mjs` hardcodes `{ purple:'#AB71E1', blue:'#62A2E9', … }` and `gen-large-image.mjs`
hardcodes a `COLOR_MAP` of the same brand hexes, both re-stating the palette that already lives
authoritatively in `web/src/lib/state/colors.svelte.ts`. `model-eval` does this right — it imports
`PALETTE` from `lib/model-eval.mjs`. If a brand color is retuned, these generators silently paint
the old hue (and `pickColor` may fail to find a matching swatch).

#### Proposed solution

Import the palette from the app source (these scripts already import `.ts` via
`--experimental-strip-types` elsewhere in the repo, e.g. `check-assets.mjs`), or centralize it once
in `lib/` and have both generators plus `model-eval` consume it. At minimum add a comment
cross-linking `colors.svelte.ts` (like `gen-large-image` partially does).

#### Verification

Change a palette hex in `colors.svelte.ts`, run `npm run gen:shots` / `npm run gen:large-image`, and
confirm the output uses the new color (or that a build-time check flags the mismatch).

---

### [P3][duplication] HTML-escaping helper reimplemented per script

**File(s):** `scripts/redteam-run.mjs:113-117` (`esc`) vs `scripts/lib/scrapbook-chrome.mjs` (`esc`,
imported by `gen-icons-sheet.mjs:18`) and `lib/model-eval-report.mjs` — pinned at SHA f934d43

#### Problem

Every script that emits HTML needs the same `& < > "` escape. `gen-icons-sheet` imports `esc` from
`lib/scrapbook-chrome.mjs`; `redteam-run` hand-rolls its own `esc`; the model-eval report presumably
has a third. Three copies of one trivial-but-security-relevant function.

#### Proposed solution

Promote a single `esc()` to `lib/utils.mjs` (or a `lib/html.mjs`) and import it everywhere HTML is
generated, retiring the per-file copies.

#### Verification

`grep -rn "replace(/\[&<>" scripts/` shows one definition. Regenerate the redteam and icon-sheet
HTML and confirm identical escaping.

---

### [P4][complexity] `release.mjs` is a 150-line top-level procedure

**File(s):** `scripts/release.mjs:25-176` — pinned at SHA f934d43

#### Problem

The whole release flow runs at module top level in numbered comment sections (resolve versionCode,
bump versions, regenerate, cleanliness guard, commit+tag, publish). It's readable thanks to the
comments, but it's untestable and can't be reasoned about in pieces; the stray-file guard (96-123)
in particular is meaty logic embedded mid-script.

#### Proposed solution

Decompose into named functions — `resolveVersionCode(releaseFile)`, `bumpVersions(version, code)`,
`assertOnlyReleasePaths()`, `commitAndTag(version)`, `publish(version, body)` — invoked from a small
`main()`. The stray-path filter becomes an independently testable pure function.

#### Verification

`node scripts/release.mjs <ver> --dry-run` produces the same file changes as before; `--no-publish`
still commits+tags locally. Behavior-preserving refactor.

---

### [P4][consistency] `--check`/flag parsing done ad hoc in every gate script

**File(s):** `scripts/gen-tokens.mjs:69`, `scripts/image-audit.mjs:37`,
`scripts/publish-scrapbook.mjs:37,47`, `scripts/gha-versions.mjs:108-110` — pinned at SHA f934d43

#### Problem

Each script re-implements flag detection inline: `process.argv.includes('--check')`,
`args[0] === '--index-only'`, `args.includes('--check-latest')`, `--json`, etc. It's fine at one
flag each, but there's no shared convention, so `--check` means "CI drift gate" in three scripts
with three separate parses, and a reader can't predict how a given script reads its args.

#### Proposed solution

A minimal shared `parseFlags(argv, names)` (or adopt `node:util` `parseArgs`) in `lib/utils.mjs`,
returning `{ flags, positionals }`. Not worth a heavy CLI framework, but one helper standardizes the
`--check` gate idiom the repo uses repeatedly.

#### Verification

Each gate (`gen:tokens:check`, `img:audit:check`, `scrapbook:check`, `deps:gha --check-latest`)
still behaves identically. Consistent parsing visible in a grep.

---

### [P4][consistency] Smoke/dev port numbers scattered as bare literals

**File(s):** `scripts/api-smoke.mjs:14` (5199), `scripts/redteam-run.mjs:26` (5198),
`scripts/driver-smoke.mjs:23` (4173), `scripts/gen-large-image.mjs:32` /
`scripts/store-shots.mjs:31` (4173), `scripts/cloud-tunnel.mjs:18` (5173), `scripts/blobs-smoke.mjs`
(n/a) — pinned at SHA f934d43

#### Problem

Throwaway-server ports are hardcoded per script (`5199`, `5198`, `4173`, `5173`) with
`Number(process.env.SMOKE_PORT ?? …)` wrappers duplicated. The distinct values are deliberate
(collision avoidance) but undocumented, so nothing stops a future script from reusing `4173` while
`store-shots` is running, and the `Number(env ?? default)` boilerplate repeats.

#### Proposed solution

Centralize the port registry (and a `port(name, fallback)` env helper) in `lib/`, or at least add a
one-line comment table of which script owns which port. Low urgency but improves grepability and
prevents accidental collisions.

#### Verification

`grep -rn "SMOKE_PORT\|4173\|519" scripts/` maps every port to a named owner. Smoke scripts still
boot on their ports.

---

### [P5][readability] `featureGraphicHtml` used before its declaration

**File(s):** `scripts/store-shots.mjs:205` (call) and `:218-255` (declaration) — pinned at SHA
f934d43

#### Problem

The feature-graphic block calls `featureGraphicHtml(iconB64)` at line 205, but the function is
declared at line 218 — after the top-level `await browser.close()` and the `ALL DONE` log. It works
only because `function` declarations hoist; reading top-to-bottom, the helper appears to be defined
after the script has finished.

#### Proposed solution

Move `featureGraphicHtml` (and the `shot`/`drawScene`/`colorInLines` helpers if reorganizing) above
the top-level orchestration, so definitions precede use.

#### Verification

`npm run gen:shots` still writes `feature-graphic.png`; purely a source-ordering change.

---

### [P5][duplication] Generic regex-escape helper defined locally

**File(s):** `scripts/gen-icons-sheet.mjs:35` (`escapeRe`) — pinned at SHA f934d43

#### Problem

`const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');` is a standard "escape a string
for use in a RegExp" utility defined ad hoc in one script. It's the kind of helper that gets
re-pasted; if a second script needs it, it'll be copied.

#### Proposed solution

If/when a second consumer appears, promote it to `lib/utils.mjs` as `escapeRegExp`. Low priority
while it has a single user — flagged so it's centralized rather than copied next time.

#### Verification

`npm run gen:icons-sheet` still produces the gallery with correct color remapping.

---

**Summary of highest-value themes:** the strongest wins are the cross-script duplication findings
that map onto the repo's own stated conventions — the brittle `CHROMIUM_PATH` vs
`chromiumExecutablePath` split (P1), the `.aab`/gradlew/palette/opener path constants that
`lib/android.mjs` and `scripts/CLAUDE.md` already say should be centralized (P1-P3), and the two
long procedural scripts (`api-smoke.mjs`, `model-eval-fixtures.mjs`'s embedded browser program) that
resist reading and testing. No dead *scripts* were found — every `.mjs` maps to a `package.json`
entry — but there is dead Windows-path *code* (P2) left over from ADR-0062.

## Source: Code audit — scripts · perf profiling harness

### [P1][duplication] Extract the copy-pasted CLI `flag()`/`args` parser shared by every perf entry script

**File(s):** `scripts/perf/scenario.mjs:23-32`, `scripts/perf/mount.mjs:38-47`,
`scripts/perf/ios.mjs:25-33`, `scripts/perf/undo-scenarios.mjs:39-46`,
`scripts/perf/replay-scenario.mjs:27-36` (module-scope arg parsing) — pinned at SHA f934d43

#### Problem

The exact same argument-parsing helper is defined five times:

```js
const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
```

Each site then re-derives the same flags by hand — `--no-throttle`, `--throttle`, `--no-build`,
`--device`, `--port` — with subtle divergence (e.g. `throttle` defaults to `'4'` in
scenario/mount/undo but `'0'` in replay; ios omits throttle entirely). Any fix to arg handling (e.g.
`--throttle` with no `=`, or a typo'd flag warning) has to be made in five places, and the drift is
already visible.

#### Proposed solution

Add `scripts/perf/args.mjs` exporting a parser, e.g.
`export function parsePerfArgs(argv = process.argv.slice(2))` returning
`{ flag, has, device, throttle, port, build }` with the shared defaults, and
`export const flag = (name, def, argv) => …` for the raw case. Have each entry import it instead of
re-declaring. Keep `HZ`/`long-seconds`/`scenarios`/`recording` (script-specific flags) reading
through the returned `flag`.

#### Verification

`grep -rn "const flag = (name, def)" scripts/perf` returns zero after the change; run
`npm run perf:web -- --no-build --device=tablet` and
`npm run perf:undo -- --scenarios=mixed --no-throttle` and confirm identical flag behavior.

---

### [P1][duplication] De-duplicate the `DEVICES` viewport map (triplicated verbatim)

**File(s):** `scripts/perf/scenario.mjs:17-21`, `scripts/perf/mount.mjs:20-24`,
`scripts/perf/ios.mjs:19-23` — pinned at SHA f934d43

#### Problem

The identical device table is copied into three entry files:

```js
const DEVICES = {
  phone: { width: 412, height: 915, deviceScaleFactor: 2.6 },
  tablet: { width: 1024, height: 1366, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};
```

`undo-scenarios.mjs:37` and `replay-scenario.mjs:55` hardcode their own `1024×1366 @ dsf 2` variants
of the same "iPad Pro" device separately again. If the phone viewport (the primary throttled-phone
approximation) is ever retuned, three-to-five files must change in lockstep or the targets silently
diverge.

#### Proposed solution

Move the map to `scripts/perf/devices.mjs`: `export const DEVICES = { phone, tablet, desktop }` plus
`export const IPAD_PRO = { width: 1024, height: 1366, deviceScaleFactor: 2, label: 'ipad-pro-12.9' }`.
Import in all five. Optionally
`export const resolveDevice = (name) => DEVICES[name] || DEVICES.phone` to also fold in the
`DEVICES[deviceName] || DEVICES.phone` fallback repeated in scenario/mount/ios.

#### Verification

`grep -rn "width: 412" scripts/perf` returns one hit after the change; `npm run perf:web`,
`perf:mount`, `perf:ios` still produce the same `viewport` in their `metrics.json`/`settings`.

---

### [P1][complexity] Split the 90-line `driveSession` orchestrator into named stages

**File(s):** `scripts/perf/session.mjs:122-212` (`driveSession`) — pinned at SHA f934d43

#### Problem

`driveSession` does everything in one function: `mkdirSync`, observer injection, heap sampling,
trace start, the entire nine-`beat` interaction script with inline drawing-coordinate math (lines
138-181), observer/heap read, screenshot, then assembling and writing four artifact files
(`trace.json`, `metrics.json`, `summary.json`, `report.md`) and logging. The interaction
choreography (what a "toddler session" *is*) is tangled with capture plumbing and artifact I/O, so
you cannot read the scenario without wading through trace mechanics, and the drawing constants
(`box.width * 0.15`, `arcPts(... 0, Math.PI)`, etc.) are buried mid-function.

#### Proposed solution

Extract three named stages that `driveSession` calls in sequence:

* `async function runToddlerSession(page, box)` — the nine `beat(...)` calls (138-181), owning the
  scenario shape only.
* `function buildMetrics({ settings, useTrace, t0, obs, heapBefore, heapAfter })` → the `metrics`
  object (191-201).
* `function writeProfileArtifacts(outDir, { traceEvents, metrics, summary, report })` → the four
  `writeFileSync` calls + screenshot (188-207).

`driveSession` then reads as: setup → `runToddlerSession` → read observers →
`writeProfileArtifacts`. See the shared-artifact-writer finding (P2) for reusing the writer across
undo/replay.

#### Verification

`npm run perf:web -- --no-build` produces the same four files with identical structure; the
extracted `runToddlerSession` has no reference to `cdp`/`writeFileSync`.

---

### [P1][complexity] Break up `undo-scenarios.mjs main()` (170 lines) into per-scenario + artifact stages

**File(s):** `scripts/perf/undo-scenarios.mjs:306-478` (`main`) — pinned at SHA f934d43

#### Problem

`main()` runs env setup, browser launch, trace start, the full scenario loop (352-432) with dense
inline metric extraction, then ~40 lines of settings/metrics/artifact assembly (440-473). Inside the
loop, one block (374-424) pulls `engine.draw/commit/snapshot/undo` measures, computes
`historyRasterMB`, and pushes a 25-field result object — that's a distinct unit ("measure one
scenario") wedged inside the driver. The reader cannot see the scenario lifecycle without also
parsing trace-artifact bookkeeping.

#### Proposed solution

Extract:

* `async function runUndoScenario(page, base, sc, geom)` → resets engine, marks draw/undo phases,
  settles cold tier, returns the `results.push(...)` object (354-424).
* `function buildUndoSettings({ throttle, build, geom, t0 })` → the `settings` object (440-453).
* reuse the shared `writeProfileArtifacts` helper for
  `trace.json`/`metrics.json`/`summary.json`/`report.md`, leaving only the bespoke
  `undo-scenarios.{json,md}` writes here.

`main` becomes: launch → `for (sc of scenarios) results.push(await runUndoScenario(...))` → write
artifacts.

#### Verification

`npm run perf:undo -- --no-build --scenarios=short-marks` emits the same `undo-scenarios.json`
fields; `runUndoScenario` is independently callable and contains no `writeFileSync`.

---

### [P2][duplication] Collapse the repeated output-dir / timestamp / throttle-tag construction

**File(s):** `scripts/perf/scenario.mjs:41-43`, `scripts/perf/mount.mjs:50-52`,
`scripts/perf/ios.mjs:42-43`, `scripts/perf/android.mjs:114-115`,
`scripts/perf/undo-scenarios.mjs:316-318`, `scripts/perf/replay-scenario.mjs:59-61` — pinned at SHA
f934d43

#### Problem

Every entry rebuilds the profile directory the same way:

```js
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const throttleTag = throttle > 1 ? `${throttle}x` : 'raw';
const outDir = join(ROOT, 'perf-profiles', `${stamp}-web-${deviceName}-${throttleTag}`);
```

The `stamp` regex appears in all six files, and the `throttleTag` triplet in three. The
`perf-profiles/` path root is likewise hardcoded six times, so relocating the output root (or
changing the timestamp format the analyzer parses out of the suffix) is a six-file edit.

#### Proposed solution

Add to `scripts/perf/args.mjs` (or a `paths.mjs`):
`export const profileStamp = () => new Date().toISOString().replace(/[:.]/g, '-')`,
`export const throttleTag = (t) => (t > 1 ?`${t}x`: 'raw')`, and
`export const profileDir = (...suffixParts) => join(ROOT, 'perf-profiles', [profileStamp(), ...suffixParts].join('-'))`.
Replace the six sites.

#### Verification

`grep -rn "toISOString().replace" scripts/perf` returns one hit; each command still writes to
`perf-profiles/<timestamp>-<target>-…`.

---

### [P2][duplication] Replace the copy-pasted `main().catch` bootstrap with a shared runner

**File(s):** `scripts/perf/scenario.mjs:81-84`, `scripts/perf/mount.mjs:128-131`,
`scripts/perf/ios.mjs:75-78`, `scripts/perf/android.mjs:132-135`,
`scripts/perf/undo-scenarios.mjs:566-569`, `scripts/perf/replay-scenario.mjs:318-321` — pinned at
SHA f934d43

#### Problem

Six identical epilogues:

```js
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

`scripts/lib/utils.mjs` already centralizes `fail()`/`run()`; there is no reason each perf entry
hand-rolls its top-level rejection handling. A future improvement (stack trimming, exit-code
conventions, always calling `stop()`) would have to touch six files.

#### Proposed solution

Add
`export function runMain(main) { main().catch((err) => { console.error(err); process.exit(1); }); }`
to `scripts/lib/utils.mjs`, and end each entry with `runMain(main);`.

#### Verification

`grep -rn "main().catch" scripts/perf` returns zero; a forced throw inside any `main` still exits
non-zero.

---

### [P2][duplication] Factor out the PERF_MARKS-missing warning (five near-identical copies)

**File(s):** `scripts/perf/scenario.mjs:35-39`, `scripts/perf/ios.mjs:36-40`,
`scripts/perf/android.mjs:83-87`, `scripts/perf/undo-scenarios.mjs:310-314`,
`scripts/perf/replay-scenario.mjs:47-51` — pinned at SHA f934d43

#### Problem

The same guard is pasted five times, differing only in the suggested command:

```js
if (process.env.PERF_MARKS !== 'true') {
  console.warn(
    '! PERF_MARKS is not "true" — engine.* marks will be absent. Use `npm run perf:web`.',
  );
}
```

The wording drifts between "will be absent" and "rebuild may omit engine.* marks" (android), so the
messages are inconsistent for the same condition.

#### Proposed solution

Add
`export function warnIfNoPerfMarks(command) { if (process.env.PERF_MARKS !== 'true') console.warn(`!
PERF_MARKS is not "true" — engine.* marks will be absent. Use \`${command}\`.`); }` to
`scripts/perf/args.mjs` and call `warnIfNoPerfMarks('npm run perf:web')` etc.

#### Verification

`grep -rn "PERF_MARKS is not" scripts/perf` returns one hit (the helper); running any command
without `PERF_MARKS=true` still prints one warning.

---

### [P2][duplication] Unify the three copies of the async `undoAll` drain loop

**File(s):** `scripts/perf/undo-scenarios.mjs:241-260` (`undoAll`),
`scripts/perf/replay-scenario.mjs:260-272` (undo-drain block in `replayInPage`),
`scripts/perf/ipad-console-driver.js:112-127` (`undoAll`) — pinned at SHA f934d43

#### Problem

All three implement the same "click undo, wait for the `engine.undo` measure to land, cap the stall"
pattern with the same magic `5000` ms stall cap and `60`-iteration ceiling:

```js
for (let i = 0; i < 60; i++) {
  if (!window.__engineState.canUndo) break;
  const before = completed();
  window.__engine.undo();
  const t0 = performance.now();
  while (completed() === before && performance.now() - t0 < 5000) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  ...
}
```

The comments explaining *why* the wait exists (async blob-decode restores outrunning the loop) are
duplicated too. A bug in the drain logic must be fixed in three engines (two Node in-page evaluates,
one console snippet).

#### Proposed solution

The console snippet is a standalone paste (can't import), but the two `page.evaluate` sites in
`undo-scenarios.mjs`/`replay-scenario.mjs` can share a single in-page function string. Extract
`export const UNDO_DRAIN_FN = function () { … }` (or a `pageFns.mjs` exporting the source) with
named constants `UNDO_STEP_STALL_MS = 5000` / `MAX_UNDO_STEPS = 60`, injected via `page.evaluate`.
Keep the console-driver copy but add a `// keep in sync with undo-scenarios.mjs UNDO_DRAIN_FN`
marker.

#### Verification

Both `perf:undo` and `perf:replay` drain history identically (compare `undoSteps`/`undos` counts
before and after); the two Node sites reference one source.

---

### [P2][duplication] Extract a shared `writeProfileArtifacts` for the trace/metrics/summary/report quartet

**File(s):** `scripts/perf/session.mjs:190-207`, `scripts/perf/undo-scenarios.mjs:460-465`,
`scripts/perf/replay-scenario.mjs:131-136` — pinned at SHA f934d43

#### Problem

Three drivers assemble and write the same four files with the same shapes:

```js
writeFileSync(join(outDir, 'trace.json'), JSON.stringify({ traceEvents }));
writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
const summary = analyze(traceEvents, metrics);
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(outDir, 'report.md'), renderReport(summary));
```

Plus each builds the
`metrics = { settings, longTasks: obs.longTasks, frames: obs.frames, heap: {...} }` object
identically (session 191-201, undo 454-459, replay 125-130). The `analyze`+`renderReport`+write
sequence is exactly what `analyze.mjs`'s own `main()` (lines 509-515) also does, a fourth copy.

#### Proposed solution

Add to `analyze.mjs` (or a `report-io.mjs`):
`export function writeAnalysisArtifacts(outDir, traceEvents, metrics) { const summary = analyze(traceEvents, metrics); writeFileSync(join(outDir,'trace.json'), …); …; return { summary, report }; }`
and `export function buildMetrics({ settings, obs, heapBefore, heapAfter })`. Call from all four
sites.

#### Verification

`grep -rn "renderReport(summary)" scripts/perf` collapses to the helper; each command's four files
are byte-compatible in structure.

---

### [P2][maintainability] Name the bytes→MiB conversion (`1048576` literal appears 10×)

**File(s):** `scripts/perf/analyze.mjs:485,489,490,493`,
`scripts/perf/undo-scenarios.mjs:396,420,421,450,458`,
`scripts/perf/ipad-console-driver.js:41,204,205` — pinned at SHA f934d43

#### Problem

The magic constant `1048576` is scattered across the harness for byte→MB math, e.g.
`debug.blobBytes / 1048576`, `(s.heap.afterBytes - s.heap.beforeBytes) / 1048576`,
`geom.bytesPerRaster / 1048576`. Nothing names it "bytes per MiB"; a reader has to recognize 2^20,
and the unit label ("MB" vs "MiB") is applied inconsistently in the reports while the divisor is
binary.

#### Proposed solution

Add `export const BYTES_PER_MIB = 1024 * 1024;` and
`export const toMiB = (bytes) => bytes / BYTES_PER_MIB;` to `scripts/perf/args.mjs` (importable by
the `.mjs` files). Replace the Node-side occurrences; the browser snippet (`ipad-console-driver.js`)
can define a local `const MIB = 1024*1024` at the top since it can't import.

#### Verification

`grep -rn "1048576" scripts/perf` returns only the console-snippet local (or zero); `perf:undo`
history-MB figures are unchanged.

---

### [P2][duplication] The undo-scenario stroke generators + `agg` are re-implemented in the console driver

**File(s):** `scripts/perf/undo-scenarios.mjs:69-134,194-210` vs
`scripts/perf/ipad-console-driver.js:43-107` — pinned at SHA f934d43

#### Problem

`longSquiggle`, `scribble`, `multiFingerGesture`/`multiGesture`, and the engine-measure aggregator
(`engineMeasuresIn` / `agg`) are near-identical between the Node harness and the pasteable console
driver, down to the `sweeps = 8`, `Math.PI * 12`, `amp = (H - 2*M)/14`, and `MARGIN/M = 160`
constants. The two are meant to run "the same scenarios" (the console driver's comment even says
so), but nothing enforces it — the shapes have already diverged slightly (`undo-scenarios`
parameterizes `points`; the console driver hardcodes `HZ * 10`). A change to the canonical scenario
shape silently desyncs on-device numbers from CI numbers.

#### Proposed solution

Author the scenario-shape functions once as a plain string module
(`scripts/perf/scenario-shapes.js`) with a header saying it's dual-use (imported by
`undo-scenarios.mjs`, and its body pasted into the console driver's build step or documented as the
source of truth). At minimum add cross-reference
`// canonical source: scripts/perf/undo-scenarios.mjs longSquiggle` comments and the shared
constants (`SWEEPS`, `MARGIN`) so drift is auditable.

#### Verification

Diff the generated point arrays for `longSquiggle(0)` between the two files at the same `pts`; they
must match. A shape edit updates both.

---

### [P3][maintainability] Promote scattered magic thresholds to named constants

**File(s):** `scripts/perf/capture.mjs:73` (`> 32`), `scripts/perf/mount.mjs:113,114` (`- 50`,
`> 50 ms`), `scripts/perf/session.mjs:91` (`i < 12`), `scripts/perf/undo-scenarios.mjs:138,245`
(`'22'`, `i < 60`), `scripts/perf/replay-scenario.mjs:208` (`250`) — pinned at SHA f934d43

#### Problem

Key thresholds are inline literals with the meaning only in prose comments or nowhere:

* `capture.mjs:73` `intervals.filter((d) => d > 32)` — the long-frame budget (33 ms ≈ 30 fps) as a
  bare `32`, while `analyze.mjs` names its sibling `LONG_TASK_US`.
* `mount.mjs:113` `Math.max(0, t.duration - 50)` and the `>50 ms` label reimplement the 50 ms
  long-task floor that `analyze.mjs:57` already names `LONG_TASK_US`.
* `session.mjs:91` `for (let i = 0; i < 12; i++)` — an undo-click cap with no name.
* `undo-scenarios.mjs:138` `STROKES = 22` is explained ("two past the depth-20 cap") but the `20`
  (`MAX_UNDO_DEPTH`) it depends on is never a constant, so the `22` and the `+2` intent are
  unchecked against the engine.

#### Proposed solution

Introduce `LONG_FRAME_MS = 32` (capture.mjs), reuse a shared `LONG_TASK_MS = 50` in mount.mjs,
`MAX_UNDO_CLICKS = 12` (session.mjs), and in undo-scenarios make the depth relationship explicit:
`const MAX_UNDO_DEPTH = 20; const STROKES = Number(flag('strokes', String(MAX_UNDO_DEPTH + 2)));`.

#### Verification

`grep -n "> 32" scripts/perf/capture.mjs` and `grep -n "duration - 50" scripts/perf/mount.mjs`
return nothing; frame/long-task counts are unchanged on a re-run.

---

### [P3][error-handling] Give `loadInputs` and the replay/webinspector loaders friendly failures on missing/malformed input

**File(s):** `scripts/perf/analyze.mjs:79-92,503-518`, `scripts/perf/replay-scenario.mjs:53,91`,
`scripts/perf/analyze-webinspector.mjs:37` — pinned at SHA f934d43

#### Problem

`analyze.mjs:80` calls `statSync(target)` on the raw CLI arg — a nonexistent path throws a raw
`ENOENT` stack, not the usage message the function otherwise prints for a missing arg.
`JSON.parse(readFileSync(tracePath …))` (line 83) throws an unhelpful `SyntaxError` on a truncated
trace. `analyze-webinspector.mjs:37` does `JSON.parse(readFileSync(path)).recording` — a
valid-JSON-but-wrong-shape file yields `Cannot read properties of undefined (reading 'markers')`
downstream. `replay-scenario.mjs:53` parses the recording and immediately dereferences
`recording.events.length` (line 91) with no check that `events` is an array.

#### Proposed solution

In `loadInputs`, wrap `statSync`/`JSON.parse` and rethrow with context:
`Trace not found / not valid JSON: ${tracePath}`. In `analyze-webinspector.mjs`, assert `rec` exists
(`if (!rec) fail('Not a Web Inspector export: no .recording')`). In `replay-scenario.mjs`, validate
`Array.isArray(recording.events)` after parse and `fail()` with the file path otherwise. Use
`fail()` from `scripts/lib/utils.mjs`.

#### Verification

`node scripts/perf/analyze.mjs /nope` prints a one-line "not found" instead of a stack; a `{}`
recording file yields a clear "no events array" message.

---

### [P3][type-safety] `jsSelfTime` keys functions by tab-joined string, then splits on tab

**File(s):** `scripts/perf/analyze.mjs:161-197` (`jsSelfTime`) — pinned at SHA f934d43

#### Problem

Self-time is aggregated by building `const key =` ${name}\t${loc}`` (line 185) and later recovered
with `const [name, loc] = key.split('\t')` (line 190). If a `functionName` from the CPU profile ever
contains a tab (or the split yields more than two parts), the name/location are silently mis-split.
The contract on the parsed V8 profile is also loose: `profile.nodes`, `profile.samples`,
`e.args?.data?.timeDeltas` are read positionally (`samples[i]` ↔ `deltas[i]`) with only
`Math.max(0, deltas[i] || 0)` guarding a length mismatch, so a short `timeDeltas` array under-counts
without warning.

#### Proposed solution

Key by a composite object instead of a delimited string: accumulate into `Map<id, {name, loc, us}>`
keyed by the callFrame identity, or use a `Map` of `Map`. Avoids the round-trip entirely. Add a
guard that `samples.length === deltas.length` (or note the divergence in the summary) so a malformed
chunk is visible rather than silently truncated.

#### Verification

Re-run `perf:analyze` on the committed baseline trace in `scrapbook/perf/2026-07-22-draw-profile/`
and confirm the top-self-time table is unchanged; a synthetic node name containing `\t` no longer
corrupts the row.

---

### [P3][maintainability] `HARNESS_SYMBOLS` name-matching can silently drop real app functions

**File(s):** `scripts/perf/analyze.mjs:63-77,194` — pinned at SHA f934d43

#### Problem

The self-time table excludes any function whose lowercased name is in `HARNESS_SYMBOLS`, which
includes generic tokens like `mark`, `measure`, `query`, `evaluate`, `serialize`, `computebox`. In a
minified production build (the profiled target), an app function minified to — or legitimately named
— `query`/`mark`/`measure` would be dropped from the report as "harness overhead," hiding a real
hotspot. The exclusion is name-only with no url/source discrimination, and the skill doc even warns
readers that driver plumbing "that isn't in HARNESS_SYMBOLS yet … can still appear," acknowledging
the list is a fragile denylist.

#### Proposed solution

Where possible, discriminate by `callFrame.url` (harness symbols come from Playwright's injected
context / no app URL) rather than by bare name, or narrow the denylist to the fully-qualified
injected names (`__perfframetick` is already unambiguous; `mark`/`measure` are not). At minimum,
keep the excluded rows in `summary.json` under a separate `excludedSelfTime` array so a suspicious
drop is auditable.

#### Verification

Confirm an app function named `query` in `web/src/` (if any) still appears; excluded entries are
recoverable from `summary.json`.

---

### [P3][naming] Rename obscure `beat` and consolidate the terse formatter helpers

**File(s):** `scripts/perf/session.mjs:35-43` (`beat`), `scripts/perf/analyze.mjs:326` (`ms`),
`scripts/perf/undo-scenarios.mjs:480` (`f1`), `scripts/perf/replay-scenario.mjs:278` (`f1`),
`scripts/perf/analyze-webinspector.mjs:59-68` (`stat`,`q`,`fmt`),
`scripts/perf/ipad-console-driver.js:93` (`agg`) — pinned at SHA f934d43

#### Problem

`beat(page, label, fn)` is the scenario-step runner but the name carries no meaning ("beat" of
what?) — `runPhase`/`step` would be self-documenting, especially since it wraps `markPhase`.
Meanwhile the number formatter is re-invented per file:
`ms = (n) => n == null ? 'n/a' :`${n.toFixed(1)} ms`` in analyze,
`f1 = (n) => n == null ? 'n/a' : n.toFixed(1)` twice (undo + replay), and `fmt`/`stat`/`q` in the
webinspector analyzer. Three files ship the same "null → n/a, else fixed(1)" logic under three
names.

#### Proposed solution

Rename `beat` → `runPhase` (or `step`). Export `f1`/`ms` from a shared `report-fmt.mjs`
(`export const f1 = …; export const ms = (n) => n == null ? 'n/a' :`${f1(n)} ms`;`) and import in
analyze/undo/replay. The console snippet keeps its own copy (can't import).

#### Verification

`grep -rn "const f1 =" scripts/perf` collapses to one non-snippet definition; reports render
identical numbers.

---

### [P3][maintainability] Encapsulate the scattered "effective throttle" idiom

**File(s):** `scripts/perf/scenario.mjs:30,42,71`, `scripts/perf/mount.mjs:45,51,85`,
`scripts/perf/undo-scenarios.mjs:44,317,337,444`, `scripts/perf/replay-scenario.mjs:33,84,113` —
pinned at SHA f934d43

#### Problem

The concept "a throttle > 1 is real; 1 or 0 means none" is expressed three different ways at every
site: the tag `throttle > 1 ?`${throttle}x`: 'raw'`, the settings value
`throttle > 1 ? throttle : 0`, and the CDP guard
`if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', …)`. Because the raw default
differs (`'4'` vs replay's `'0'`) and `args.includes('--no-throttle') ? 1 : …` normalizes to 1, the
"is it throttled" test `> 1` is duplicated four+ times per file and easy to get subtly wrong (e.g.
someone writing `>= 1`).

#### Proposed solution

Parse throttle once into a small value object:
`const throttle = resolveThrottle(args); // { rate, active, tag, forSettings }` where
`active = rate > 1`. Replace the three idioms with `throttle.active`, `throttle.tag`,
`throttle.forSettings`. Put `resolveThrottle` in `args.mjs`.

#### Verification

`grep -rn "throttle > 1" scripts/perf` returns zero; `perf:web` (4×) and `perf:web:raw` still tag
output dirs `4x`/`raw` and set the CPU rate correctly.

---

### [P4][dead-code] `breakdown.longTasksFromTrace` is computed but never surfaced

**File(s):** `scripts/perf/analyze.mjs:130-155,304-324,335-501` — pinned at SHA f934d43

#### Problem

`categoryBreakdown` computes `longTasksFromTrace: { count, longestMs }` (line 153) and `analyze()`
includes it in the returned `breakdown` object. But `renderReport` reads only
`b.mainThreadBusyMs/scriptingMs/renderingMs/paintingMs` (lines 393-398) and the long-task section
uses `s.longTasks` from `metrics.json` instead (line 368). So `longTasksFromTrace` lands only in
`summary.json`, redundant with `metrics.longTasks`, and no consumer reads it (`grep` confirms one
definition, zero reads). It's dead weight that also invites confusion about which long-task count is
authoritative.

#### Proposed solution

Either surface it (use `longTasksFromTrace` as the fallback in the Frame-health section when
`metrics.longTasks` is absent — useful for bare exported traces) or drop it from
`categoryBreakdown`'s return. Given the mount/webinspector paths lack `metrics.longTasks`, surfacing
it as a documented fallback is the higher-value fix.

#### Verification

`grep -rn "longTasksFromTrace" scripts/perf` shows it either consumed in `renderReport` or removed;
`summary.json` no longer carries an unread field.

---

### [P4][error-handling] A single scenario's `settleColdTier` timeout aborts the whole undo run

**File(s):** `scripts/perf/undo-scenarios.mjs:275-291,352-432` — pinned at SHA f934d43

#### Problem

`settleColdTier` throws when the cold tier never settles (line 282). It's called inside the scenario
loop (line 363) with no per-scenario try/catch, so one flaky scenario (a slow blob encode on a
loaded CI box) throws straight out of the `for (const sc of scenarios)` loop and skips artifact
writing for every scenario — including the ones that already completed. A multi-minute run is lost
to one late tier settle.

#### Proposed solution

Wrap each scenario body in try/catch: on failure, log `console.warn(`[${sc.key}] skipped:
${err.message}`)` and push a partial/`null`-flagged result (mirroring how `beat` in session.mjs
already downgrades a failed step to "skipped"), so surviving scenarios still write artifacts. Keep
the throw's diagnostic message.

#### Verification

Force a short `settleColdTier` timeout (small `timeoutMs`) and confirm the run still writes
`undo-scenarios.json` with the other scenarios present and the failed one marked skipped.

---

### [P4][type-safety] Inconsistent null-guarding of `getUndoDebug()` fields

**File(s):** `scripts/perf/undo-scenarios.mjs:393,396,511,553`,
`scripts/perf/replay-scenario.mjs:299-301`, `scripts/perf/ipad-console-driver.js:204,209` — pinned
at SHA f934d43

#### Problem

The `getUndoDebug()` shape is dereferenced with mixed guarding within the same file.
`undo-scenarios.mjs:393` reads `debug.rasterBytes ?? debug.liveRasters * geom.bytesPerRaster` and
`+ debug.blobBytes` (no `?? 0`), while the render pass at line 511/553 uses
`s.debug?.blobBytes ?? 0` and `Math.round((s.debug.blobBytes ?? 0) / 1024)`. So the compute path
assumes `blobBytes` is always present but the render path defends against it being absent —
contradictory contracts on one object. A build that predates `blobBytes` (the very case the `??`
guards imply exists) would produce `NaN` history-MB from line 396 while the table cell reads `0`.

#### Proposed solution

Normalize `getUndoDebug()` once at the boundary:
`const debug = normalizeUndoDebug(await undoDebug(page))` returning a fully-defaulted shape
(`{ snapshots: 0, liveRasters: 0, blobBytes: 0, rasterBytes: null, pendingCommands: 0 }`), then drop
the ad-hoc `?? 0`/`?.` downstream. Define the shape once so both the compute and render paths agree.

#### Verification

Run `perf:undo` against a build whose `getUndoDebug` omits `blobBytes` (stub it) and confirm
`historyRasterMB` is a number, not `NaN`, and matches the table.

---

### [P4][maintainability] Undocumented magic in the recorder: `ALPHA_STRIDE = 4 * 61` and the `SIZE_PX` map

**File(s):** `scripts/perf/ipad-recorder.js:128`, `scripts/perf/replay-scenario.mjs:25` — pinned at
SHA f934d43

#### Problem

`ipad-recorder.js:128` declares `const ALPHA_STRIDE = 4 * 61;` used to stride the canvas
`getImageData` alpha scan. The `4` (RGBA) is clear but the `61` (a prime, presumably to avoid
aliasing with pixel-row periodicity) is unexplained — a reader can't tell whether the stride is
load-bearing or arbitrary, and changing it silently changes every recorded `probe.alpha` magnitude
(breaking comparisons against older recordings). Separately, `replay-scenario.mjs:25`
`const SIZE_PX = { 1: 4, 2: 8, 3: 14, 4: 22, 5: 32 }` duplicates the app's stroke-size mapping with
only a comment ("Approximate … override here if the real mapping is ever needed") and no pointer to
the app source of truth, so it rots when the app's size ramp changes.

#### Proposed solution

Add a one-line WHY comment to `ALPHA_STRIDE` (prime stride to decorrelate from pixel-row stride;
magnitude is relative-only) and name the `4`. For `SIZE_PX`, cite the app constant it approximates
(e.g. `web/src/lib/state/…`) in the comment so a future editor knows where the real mapping lives.

#### Verification

The constants carry a rationale a reviewer can check; `SIZE_PX` comment names a real file that still
defines the size ramp.

Note: the `4 * 61` decorrelation stride is a plausible intent but unverified against the pixel-row
width; treat the WHY comment as the deliverable, not a stride change.

---

### [P4][complexity] `analyze.mjs` makes five separate full passes over the event array

**File(s):** `scripts/perf/analyze.mjs:97-155,161-217,225-302` — pinned at SHA f934d43

#### Problem

`userTimingMeasures`, `categoryBreakdown`, `jsSelfTime`, `phaseWindows`, `perPhase`, and
`attributeLongTasks` each iterate the entire `events` array independently, and
`perPhase`/`attributeLongTasks` additionally re-`filter` events into `tasks`/`commits`/`nested`
sub-arrays (lines 226-231, 272-286) then loop again per window (O(events × windows)). For a large
Android trace this is several redundant O(n) scans plus an O(n×w) attribution. Beyond cost, it hurts
readability: the "what is a RunTask, a Commit, a phase" classification is re-expressed in each
function rather than derived once.

#### Proposed solution

Do one classifying pass that partitions events into
`{ userTimings, runTasks, commits, profileChunks, buckets }`, then have the summarizers consume
those pre-filtered arrays. This also removes the repeated
`e.ph === 'X' && typeof e.dur === 'number'` predicate copied into five functions.

#### Verification

`analyze` output on the committed baseline trace is byte-identical; a `console.time` around
`analyze()` shows fewer full scans (single classify pass).

---

### [P4][naming] Entry-point `main` functions aren't exported, hurting grepability/testability

**File(s):** `scripts/perf/scenario.mjs:34`, `scripts/perf/mount.mjs:49`, `scripts/perf/ios.mjs:35`,
`scripts/perf/android.mjs:79`, `scripts/perf/undo-scenarios.mjs:306`,
`scripts/perf/replay-scenario.mjs:45` — pinned at SHA f934d43

#### Problem

Every driver defines a bare, unexported `async function main()` invoked by the `main().catch(...)`
epilogue. `analyze.mjs` alone gates its `main()` behind the
`import.meta.url === pathToFileURL(process.argv[1]).href` guard (line 518) and exports
`analyze`/`renderReport` for reuse; the drivers do neither, so importing one for a test (or reusing
`getWebviewPage`/`findWebviewSocket` from android.mjs) forces a full run. The identical local name
`main` across six files also means a symbol search can't distinguish them.

#### Proposed solution

Apply the `analyze.mjs` pattern uniformly: adopt the shared `runMain(main)` (see P2) which can
incorporate the `import.meta` "run only if invoked directly" guard, and export the reusable pieces
(e.g. `export { findWebviewSocket, readWebviewSocket }` from android.mjs) so a smoke test or another
script can import them without launching a browser.

#### Verification

Importing `android.mjs` in a test does not start adb/Playwright; each entry still runs standalone
via `npm run perf:*`.

---

### [P4][error-handling] `getWebviewPage`/`findWebviewSocket` use unlabeled retry magic and a fragile URL heuristic

**File(s):** `scripts/perf/android.mjs:42-77` — pinned at SHA f934d43

#### Problem

`getWebviewPage` loops `for (let i = 0; i < 20; i++)` with a hardcoded `sleep(500)` and picks the
page via `pages.find((p) => !p.url().startsWith('about:')) || pages[0]` — the `20`/`500` (a 10 s
budget) are unnamed, and the `about:` filter silently falls back to `pages[0]` when every page is
`about:` (e.g. the WebView still booting), so it can hand `driveSession` a not-yet-navigated page
that then fails later at `waitForSelector('#drawingCanvas')` with a less clear error.
`findWebviewSocket` (25 s) and `getWebviewPage` (10 s) also express the same "poll with deadline"
pattern two different ways (deadline timestamp vs iteration count).

#### Proposed solution

Name the constants (`WEBVIEW_PAGE_TIMEOUT_MS`, `WEBVIEW_POLL_MS`) and reuse a single
`pollUntil(fn, { timeoutMs, intervalMs })` helper (a sibling of `waitForUrl` in
`scripts/lib/utils.mjs`) for both the socket and page waits. Have `getWebviewPage` reject with a
clear message when only `about:` pages exist at deadline rather than returning a blank page.

#### Verification

With no app foregrounded, `perf:android` fails with "No navigated WebView page" at the page-wait
step, not a downstream selector timeout; the poll budgets are named.

## Source: Code audit — scripts · lib shared helpers

### [P1][architecture] Two competing Chromium-resolution mechanisms; the model-eval one is a brittle hardcoded path

**File(s):** `scripts/lib/model-eval.mjs:50-51` (`CHROMIUM_PATH`) vs `scripts/lib/utils.mjs:82-100`
(`chromiumExecutablePath`) — pinned at SHA f934d43

#### Problem

Two helpers resolve the Playwright Chromium binary, and they disagree. `utils.mjs` has a
self-healing resolver whose whole reason to exist (per its own comment) is that "the pinned revision
can drift from what playwright-core resolves … `chromium.launch()` fails with 'Executable doesn't
exist'":

```js
export const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
```

The model-eval scripts (`model-eval-run.mjs`, `model-eval-fixtures.mjs`,
`model-eval-gen-inputs.mjs`) launch with this hardcoded `chromium-1194` path, while
`store-shots.mjs` and `driver-smoke.mjs` use the resilient `chromiumExecutablePath(chromium)`. The
hardcoded revision (`1194`) is exactly the drift the other helper was written to survive — so the
model-eval harness breaks the moment the cloud env installs a different Chromium build, which the
comment in `utils.mjs` says already happens.

#### Proposed solution

Delete `CHROMIUM_PATH` from `model-eval.mjs`. Have the three model-eval consumers import
`chromiumExecutablePath` from `utils.mjs` and launch with
`chromium.launch({ executablePath: chromiumExecutablePath(chromium) })` like the other browser
scripts. If a hard override is still wanted, `chromiumExecutablePath` already honours
`PLAYWRIGHT_CHROMIUM`.

#### Verification

`grep -rn CHROMIUM_PATH scripts/` returns nothing after the change; run `npm run model-eval:*` in an
env whose installed Chromium revision ≠ 1194 and confirm launch succeeds (it fails today).

---

### [P2][cross-platform] `bumpAndroidGradle` / `bumpIosPbxproj` regexes are unanchored and global — they corrupt sibling lines

**File(s):** `scripts/lib/native-version.mjs:28-53` (`bumpAndroidGradle`, `bumpIosPbxproj`) — pinned
at SHA f934d43

#### Problem

The version bumpers match with bare, greedy, global regexes:

```js
.replace(/versionName.*/g, `versionName "${version}"`)
.replace(/versionCode.*/g, `versionCode ${versionCode}`);
```

`versionName.*` also matches a `versionNameSuffix ".debug"` line (it starts with `versionName`) and
any comment mentioning `versionName`, and `/g` rewrites *every* match — silently clobbering those
lines with `versionName "x.y.z"`. Same hazard for `versionCode` vs `versionCodeOverride`, and for
the iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` variants. The header comment claims
byte-identical output "matching the upstream behaviour on files that carry the pair once," but
nothing guarantees the project files stay single-occurrence, and a future Gradle edit that adds a
suffix would produce a corrupt build file with no error.

#### Proposed solution

Anchor to the assignment and preserve indentation, e.g. `/^(\s*)versionName\s+".*"/m` →
`` `$1versionName "${version}"` `` and `/^(\s*)versionCode\s+\d+/m`. Drop `/g` in favour of
asserting exactly one match (the guard checks already require presence; extend them to reject >1).
For pbxproj keep `MARKETING_VERSION =` but require the trailing `;`:
`/MARKETING_VERSION = [^;]*;/g`.

#### Verification

Add a fixture `build.gradle` containing both `versionName "0.0.1"` and `versionNameSuffix ".debug"`;
assert only the `versionName` line changes. Existing release flow (`npm run release` dry path) still
produces the same diff on the real files.

---

### [P2][cross-platform] `quoteArg` wraps args in double quotes without escaping `$`, backtick, `\`, or embedded `"`

**File(s):** `scripts/lib/utils.mjs:20-37` (`quoteArg`, `shellJoin`, `run`) — pinned at SHA f934d43

#### Problem

Every `run()`/`capture()` command is joined into a shell string and executed with `shell: true`.
Non-word args are "quoted" by wrapping in double quotes only:

```js
const quoteArg = (arg) => (/^[\w./:=-]+$/.test(arg) ? arg : `"${arg}"`);
```

Inside double quotes the shell still expands `$VAR`, `$(...)`, backticks, and processes `\`; an arg
containing any of those is mis-executed, and an arg containing a literal `"` breaks the quoting
entirely (splitting the command). Args flowing in from filenames, AVD names, or `input` prompts can
carry these. It is both a correctness bug and a shell-injection surface.

#### Proposed solution

Prefer avoiding the shell: pass `cmd` + `args` array to `spawnSync` with `shell: false` where PATH
resolution isn't needed. Where the shell is genuinely required for PATH shims, single-quote and
escape: `` `'${arg.replace(/'/g, `'\\''`)}'` ``. Single quotes suppress all expansion; the replace
handles embedded single quotes.

#### Verification

`run('node', ['-e', 'console.log(process.argv[1])', 'a$(echo hi)b'])` should print the literal
string, not `ahib`. Add a unit test around `shellJoin` for `$`, backtick, `"`, and space.

---

### [P2][duplication] Dark-theme token blocks in `CHROME_CSS` are duplicated and have already drifted

**File(s):** `scripts/lib/scrapbook-chrome.mjs:51-85` (`@media (prefers-color-scheme:dark)` vs
`:root[data-theme=dark]`) — pinned at SHA f934d43

#### Problem

The dark palette is written twice — once in the media query, once in `:root[data-theme=dark]` — and
the two copies disagree:

| token           | `@media dark` (L53-55) | `[data-theme=dark]` (L77-79) |
| --------------- | ---------------------- | ---------------------------- |
| `--card`        | `#1d1f27`              | `#1c1e24`                    |
| `--card-2`      | `#181a20`              | `#191b20`                    |
| `--muted`       | `#a8a4af`              | `#a19da8`                    |
| `--hair`        | `#34373f`              | `#2b2e36`                    |
| `--hair-strong` | `#464a55`              | `#3a3e48`                    |
| `--faint`       | `#807d89`              | `#797682`                    |

So a viewer in OS-dark sees different chrome than one who hit the explicit dark toggle. The light
palette is likewise triplicated (`:root` L34-49, `:root[data-theme=light]` L64-73) but there
identical — pure copy risk. This is a single-source-of-truth failure the drift already proves.

#### Proposed solution

Define each palette once as a JS object (`const LIGHT = {...}; const DARK = {...}`) and generate the
three selector blocks from a `vars(obj)` serialiser, so `:root`, the media query, and both
`[data-theme]` selectors emit byte-identical declarations. Decide the intended dark values once.

#### Verification

After refactor, `grep -c '#1d1f27\|#1c1e24' scripts/lib/scrapbook-chrome.mjs` shows a single
canonical value; render `/scrapbook` in OS-dark and via the toggle and confirm the chrome matches.

---

### [P2][maintainability] `PALETTE` / `PAPER` are copied from app source with no drift assertion, unlike the prompts

**File(s):** `scripts/lib/model-eval.mjs:29-46` (`PALETTE`, `PAPER`) and `77-85`
(`assertProductionConfig`) — pinned at SHA f934d43

#### Problem

The harness copies four things from the app to "measure what production actually sends":
`DEFAULT_PROMPT`, `SAFETY_SYSTEM_INSTRUCTION`, `PALETTE`, and `PAPER`. Only the first two are
guarded — `assertProductionConfig()` reads the app source and throws on drift. `PALETTE` (a
comment-claimed mirror of `web/src/lib/state/colors.svelte.ts`) and `PAPER` (`web/src/app.css`) are
unverified, so a palette or paper-color change in the app silently makes the eval inputs unfaithful
while every guard stays green. The comment even names the exact source files, implying the same
drift risk was recognised but only half-covered.

#### Proposed solution

Extend `assertProductionConfig()` (or add `assertPaletteConfig()`) to parse the hexes out of
`colors.svelte.ts` / `app.css` and assert set-equality with `PALETTE`/`PAPER`, throwing with the
offending file name like the prompt checks do.

#### Verification

Change one palette hex in `colors.svelte.ts`, run any `model-eval:*` script, confirm it now throws;
revert and it passes.

---

### [P2][architecture] `utils.mjs` is a grab-bag mixing generic, Playwright, release, and app-domain concerns

**File(s):** `scripts/lib/utils.mjs:1-148` (whole file) — pinned at SHA f934d43

#### Problem

The header says "Generic helpers … App-specific logic stays in the script that owns it," but the
file holds at least five unrelated responsibilities: process runners (`run`/`sh`/`capture`/`fail`),
network polling (`waitForUrl`), Playwright binary resolution (`chromiumExecutablePath`),
command/tool discovery (`hasCommand`, `maestroPath`, `maestroInstalled`), release/markdown parsing
(`parseFrontmatter`, `compareSemverDesc`, `writeFileDeep`), and outright app-domain logic
(`webOnlyBooks`). A change to any one drags an unrelated import graph; `perf/` scripts importing
`sleep` pull in `scrypt`-free but still Playwright- and Maestro-flavoured code. This is the
"grab-bag `utils`" the audit brief calls out.

#### Proposed solution

Split by concern: `lib/proc.mjs` (`run`/`sh`/`capture`/`fail`/`sleep`/`hasCommand`), `lib/net.mjs`
(`waitForUrl`), `lib/playwright.mjs` (`chromiumExecutablePath`), `lib/maestro.mjs` (Maestro paths —
or fold into `android.mjs`'s sibling), `lib/frontmatter.mjs` (`parseFrontmatter`,
`compareSemverDesc`). Re-export from a thin `utils.mjs` barrel for one migration cycle, then update
imports.

#### Verification

`npm test` (unit + driver:smoke) green; each new module has a single-sentence header describing one
responsibility.

---

### [P3][architecture] `webOnlyBooks` is app-domain logic sitting in the "generic helpers" file

**File(s):** `scripts/lib/utils.mjs:143-147` (`webOnlyBooks`) — pinned at SHA f934d43

#### Problem

```js
export const webOnlyBooks = (books) =>
  books.filter((book) => !(book.platforms ?? ['web', 'mobile']).includes('mobile'));
```

This encodes the app's book-platform filtering rule (mirroring `booksForPlatform()` in
`src/lib/state/books.ts`) and directly contradicts the file's own header ("App-specific logic stays
in the script that owns it"). Only two scripts use it (`check-assets.mjs`,
`strip-native-assets.mjs`), both native-asset concerns.

#### Proposed solution

Move it to a purpose-named module, e.g. `scripts/lib/native-assets.mjs` alongside where the strip
logic conceptually lives, or export it from a shared books helper. Keep the cross-check comment
pointing at `books.ts`.

#### Verification

`grep -rn webOnlyBooks scripts/` shows both consumers importing from the new location;
`npm run check:assets` still passes.

---

### [P3][architecture] Three command runners with inconsistent contracts and error behaviour

**File(s):** `scripts/lib/utils.mjs:27-72` (`run`, `sh`, `capture`) — pinned at SHA f934d43

#### Problem

`run(cmd, args[], opts)` takes an argv array and `process.exit()`s on failure;
`capture(cmd, args[], opts)` also takes an array and `process.exit()`s; but `sh(command, cwd)` takes
a *pre-joined string* and *rejects* instead of exiting. So callers must remember which runner takes
an array vs a string, and which aborts the process vs throws — a foot-gun the brief flags as
"loose/inconsistent helper signatures." The array-vs-string split also means `sh` bypasses
`quoteArg` entirely, so the two families quote differently.

#### Proposed solution

Unify on one signature `exec(cmd, args[], { cwd, input, echo, mode })` where `mode` is
`'exit' | 'throw' | 'capture'`, or at minimum make all three take `(cmd, args[])` and document the
exit-vs-throw axis in one place. Have `sh` accept an argv array and share `shellJoin`.

#### Verification

Signatures line up across the three; consumers compile; `test:driver:smoke` and the smoke suite
pass.

---

### [P3][duplication] Missing `openInFileManager` helper — the open/xdg-open branch is duplicated

**File(s):** `scripts/lib/*` (absent) vs `scripts/open-path.mjs:16` and
`scripts/redteam-run.mjs:268` — pinned at SHA f934d43

#### Problem

The macOS-vs-Linux opener branch that `scripts/CLAUDE.md` explicitly says should live "behind a
branch in `scripts/lib/`" is instead written twice in consumers:

```js
// open-path.mjs
run(process.platform === 'darwin' ? 'open' : 'xdg-open', [path]);
// redteam-run.mjs:268
const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
```

This is exactly the kind of platform difference the lib exists to centralise, and it is duplicated.

#### Proposed solution

Add to `utils.mjs` (or a `lib/opener.mjs`):
`export const openInOs = (target) => run(process.platform === 'darwin' ? 'open' : 'xdg-open', [target]);`.
Both consumers call it.

#### Verification

`grep -rn "xdg-open" scripts/` matches only the new helper.

---

### [P3][duplication] `ROOT` is defined identically in two lib modules

**File(s):** `scripts/lib/utils.mjs:11` and `scripts/lib/model-eval.mjs:12` — pinned at SHA f934d43

#### Problem

Both files compute the repo root the same way:

```js
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
```

`model-eval.mjs` re-exports its own `ROOT`, and consumers import `ROOT` from *either* module
(`store-shots.mjs` from utils, `model-eval-*` from model-eval), so there are two "canonical" roots
that only coincidentally agree. If either file moves depth, they diverge.

#### Proposed solution

`model-eval.mjs` should `import { ROOT } from './utils.mjs'` and re-export if needed, rather than
recomputing. One definition.

#### Verification

`grep -rn "fileURLToPath(import.meta.url)" scripts/lib` returns a single site.

---

### [P3][architecture] `spawnViteServer` doesn't cover the dev-with-visible-output case, so `cloud-tunnel.mjs` re-implements it and can orphan vite

**File(s):** `scripts/lib/vite-server.mjs:29-56` (`spawnViteServer`) — pinned at SHA f934d43

#### Problem

`spawnViteServer` exists specifically to run vite in a detached group so `stop()` can't orphan the
esbuild grandchild — but it hardcodes `stdio: ['ignore','ignore','inherit']` and only merges `env`.
`cloud-tunnel.mjs:63` needs stdout inherited and a `TUNNEL_HOST` env, so it hand-rolls
`spawn('npx', ['vite','dev',...])` — reintroducing the exact npx-wrapper + non-detached shape the
helper warns against ("wrapper spawns (`npx vite`) would add another layer … a plain child.kill()
can orphan the process that holds the port"). The one consumer that most needs the anti-orphan
guarantee bypasses it.

#### Proposed solution

Widen `spawnViteServer(port, { env, command, stdout })` to accept a stdout mode
(`'ignore' | 'inherit'`), then have `cloud-tunnel.mjs` use it. Its `stop()`/detached-group logic
then covers the tunnel path too.

#### Verification

`cloud-tunnel.mjs` no longer imports `spawn` directly; Ctrl-C during a tunnel leaves no vite/esbuild
process (`pgrep -f vite` empty after exit).

---

### [P3][cross-platform] `freePort` depends on `lsof`, which is not present on many Linux/CI hosts

**File(s):** `scripts/lib/vite-server.mjs:15-27` (`freePort`) — pinned at SHA f934d43

#### Problem

```js
const out = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
```

`lsof` ships by default on macOS but is frequently absent on minimal Linux containers (Debian/Alpine
CI images). When missing, `spawnSync` returns an error result, `out.stdout` is undefined → the
function silently no-ops, and any stale server then trips vite's `--strictPort`. The "best-effort"
comment hides a platform gap the repo's macOS+Linux contract cares about.

#### Proposed solution

Fall back to a portable probe when `lsof` is unavailable — e.g. try `fuser -k ${port}/tcp` or
`ss -ltnp` on Linux, or detect the missing binary via `hasCommand('lsof')` and warn. Simplest robust
option: attempt a connect to the port in Node and, if listening, log that a manual kill is needed
rather than silently continuing.

#### Verification

On a container without `lsof`, `freePort(5173)` with a stale server should either free it or emit a
clear message, not silently no-op.

---

### [P3][maintainability] App-driver selectors and timing constants are scattered string/number literals

**File(s):** `scripts/lib/app-driver.mjs:49-106` (selectors + `sleep(...)` calls) — pinned at SHA
f934d43

#### Problem

The module `scripts/CLAUDE.md` warns "rots silently when app markup, element IDs, or show/hide
mechanics change" — yet the element IDs are inline literals spread across functions
(`'#drawingCanvas'`, `'.drawer-toggle'`, `'#coloringBookButton'`, `'#strokeWidthButton'`,
`.color-swatch[data-color=...]`) and every gesture ends in a bare `await sleep(400)` / `350` / `220`
/ `150` / `40` / `200`. There is no single place to update an ID after a markup change, and the
sleep durations (several tied to real app guards, e.g. the "100ms post-color-change guard") are
undocumented magic numbers. This directly worsens the rot the CLAUDE.md flags.

#### Proposed solution

Hoist a
`const SEL = { canvas: '#drawingCanvas', drawerToggle: '.drawer-toggle', coloringBook: '#coloringBookButton', strokeButton: '#strokeWidthButton' }`
and named timing constants (`COLOR_CHANGE_GUARD_MS = 220`, `DRAWER_ANIM_MS = 350`, …) at the top,
referenced everywhere. One edit site per selector.

#### Verification

`grep -c "#drawingCanvas" scripts/lib/app-driver.mjs` → 1; `npm run test:driver:smoke` passes.

---

### [P3][naming] `hasCommand` uses `which`, whose absence is silently treated as "command missing"

**File(s):** `scripts/lib/utils.mjs:102` (`hasCommand`) — pinned at SHA f934d43

#### Problem

```js
export const hasCommand = (cmd) => spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0;
```

If `which` itself isn't installed (some minimal Linux images ship without it), `spawnSync` errors
and `.status` is `null !== 0`, so *every* command probe reports "missing" — cascading into
misleading "install X" failures in `android-setup.mjs`/`check-netlify-cli.mjs`. The POSIX-guaranteed
builtin is `command -v`.

#### Proposed solution

`spawnSync('sh', ['-c',`command -v ${cmd}`], { stdio: 'ignore' }).status === 0` (guard `cmd` against
spaces), or check both. `command -v` is a shell builtin, always present.

#### Verification

On an image without `which`, `hasCommand('node')` returns true.

---

### [P4][complexity] `imageDims` JPEG scanner is a dense loop of unnamed byte offsets

**File(s):** `scripts/lib/model-eval.mjs:143-160` (`imageDims`) — pinned at SHA f934d43

#### Problem

The JPEG branch walks segment markers with bare literals (`buf.readUInt16BE(i + 7)`, `i + 5`, the
`0xc0..0xcf` SOF range minus `0xc4/0xc8/0xcc`) and no explanation of what offsets 5/7 are
(height/width within an SOFn segment). It reads as magic; a reviewer can't tell correct from
off-by-one.

#### Proposed solution

Name the constants (`const SOF_HEIGHT_OFFSET = 5, SOF_WIDTH_OFFSET = 7`) or add a one-line WHY
comment ("SOFn payload: [precision][height u16][width u16]"). Optionally extract `readJpegSize(buf)`
/ `readPngSize(buf)` so `imageDims` reads as a dispatch.

#### Verification

Add a unit test feeding a known 640×480 JPEG and PNG header; assert `"640x480"`.

---

### [P4][duplication] PNG/JPEG magic-byte sniff is repeated in `imageDims` and `imageFormat`

**File(s):** `scripts/lib/model-eval.mjs:143-167` (`imageDims`, `imageFormat`) — pinned at SHA
f934d43

#### Problem

Both functions open with the same signature checks:

```js
if (buf[0] === 0x89 && buf[1] === 0x50) // png
if (buf[0] === 0xff && buf[1] === 0xd8) // jpeg
```

The magic pairs are duplicated with no shared `isPng`/`isJpeg`, so a format added in one place can
be forgotten in the other.

#### Proposed solution

`const isPng = (b) => b?.[0] === 0x89 && b?.[1] === 0x50;` and
`const isJpeg = (b) => b?.[0] === 0xff && b?.[1] === 0xd8;`, used by both.

#### Verification

Both functions reference the shared predicates; existing report format table unchanged.

---

### [P4][naming] `chromiumExecutablePath` uses `slice(9)` and a duplicated `/opt/pw-browsers` literal

**File(s):** `scripts/lib/utils.mjs:87-98` (`chromiumExecutablePath`) and
`scripts/lib/model-eval.mjs:51` — pinned at SHA f934d43

#### Problem

`Number(b.slice(9))` strips the literal `"chromium-"` (9 chars) — a magic length tied to a string
that appears nowhere near it, so a rename of the prefix breaks the sort silently. The browsers-path
default `'/opt/pw-browsers'` is also hardcoded here and again as the `chromium-1194` prefix in
`model-eval.mjs`, two independent copies of the same cloud path.

#### Proposed solution

`const PREFIX = 'chromium-'; Number(b.slice(PREFIX.length))`, and
`const DEFAULT_BROWSERS_PATH = '/opt/pw-browsers'` exported once and reused (also removes the
`model-eval` copy once that file adopts `chromiumExecutablePath` per the P1 finding).

#### Verification

`grep -rn "/opt/pw-browsers" scripts/lib` → one definition; sort still orders revisions descending.

---

### [P4][maintainability] iconChroma hue thresholds are unnamed magic numbers

**File(s):** `scripts/lib/iconChroma.mjs:30-33` (`isHue`) — pinned at SHA f934d43

#### Problem

```js
return c.s >= 0.35 && c.l >= 0.14 && c.l <= 0.93;
```

`0.35`, `0.14`, `0.93` are the classification boundary between a "spot" (colorful) icon and a
monochrome glyph — the single most important tuning knob in the file, shared with the `COLOR_ICONS`
guard test — yet they're bare literals. Because this classifier must not drift from the Svelte test,
the thresholds deserve to be named and, ideally, exported so the test asserts against the same
constants.

#### Proposed solution

`const MIN_SATURATION = 0.35, MIN_LIGHTNESS = 0.14, MAX_LIGHTNESS = 0.93;` (export them; have
`iconChroma.d.mts` type them). The `.svelte.test.ts` can then import rather than re-encode.

#### Verification

`npm run check` + the Icon guard test pass with identical classification.

---

### [P4][architecture] Point generators live inside the Playwright app-driver module

**File(s):** `scripts/lib/app-driver.mjs:108-136` (`circlePts`, `arcPts`, `zigzag`) — pinned at SHA
f934d43

#### Problem

The file header scopes the module to "dev-server lifecycle, page setup, and the UI gestures … the
app needs," but the bottom third is pure geometry (parametric circle/arc/zigzag point lists) with no
Playwright dependency. Mixing a stateless math concern into a browser-driving module means a script
wanting only the geometry pulls in the whole Playwright surface.

#### Proposed solution

Move the three generators to `scripts/lib/stroke-geometry.mjs` (or `points.mjs`); `app-driver.mjs`
and `store-shots.mjs` import from there.

#### Verification

`app-driver.mjs` no longer exports geometry; `gen:shots` / `gen:large-image` still render.

---

### [P4][maintainability] `median`/`mean` are generic stats buried in the report module

**File(s):** `scripts/lib/model-eval-report.mjs:55-62` (`median`, `mean`) — pinned at SHA f934d43

#### Problem

Two reusable numeric reducers are private to the report file. `mean` silently `Math.round`s (a
reporting choice, not a general mean) while `median` doesn't — a subtle inconsistency for anyone
reusing them. The perf scripts under `scripts/perf/` compute similar aggregates independently.

#### Proposed solution

Move raw `median`/`mean` to a `lib/stats.mjs`; keep the rounding at the call site in the report
(`Math.round(mean(...))`) so the helper stays honest and reusable.

#### Verification

Report numbers unchanged; `grep -rn "function mean" scripts` shows one definition.

---

### [P4][readability] `card()` entry-existence check reaches up-and-back-down through the type dir

**File(s):** `scripts/lib/scrapbook-index.mjs:143-148` (`card`) — pinned at SHA f934d43

#### Problem

```js
const entryExists = existsSync(join(dir, '..', meta.entry));
const href = entryExists ? meta.entry : `${type}/${files.find((f) => f.endsWith('.html')) ?? ''}`;
```

`dir` is `<scrapbook>/<type>`, and `meta.entry` already starts with `<type>/…`, so the check climbs
to `<scrapbook>` then descends again — correct but confusing, and the fallback silently yields
`type/` (trailing slash, no file) when no HTML exists, producing a dead card link.

#### Proposed solution

Compute against the scrapbook root directly: pass `scrapbookDir` into `card()` and use
`existsSync(join(scrapbookDir, meta.entry))`. Guard the fallback so a card with no resolvable page
is dropped (or routed through `fallbackCard`) rather than linking to `type/`.

#### Verification

Point `meta.entry` at a missing file in a fixture scrapbook; the generated card either links to a
real page or is omitted, never to `type/`.

---

### [P4][naming] `REGISTRY.icons.count` is `null` while siblings use `() => null` — inconsistent contract

**File(s):** `scripts/lib/scrapbook-index.mjs:91` (and `55`, `68`, `77`) — pinned at SHA f934d43

#### Problem

Every registry entry's `count` is a function except `icons`, where it's the bare value `null`.
`card()` only survives this via a `typeof meta.count === 'function'` guard — but the type of a
registry field silently varying (function vs null) is a loose contract that invites a future
`meta.count(files)` call to crash.

#### Proposed solution

Make `count` always a function: `count: () => null` for `icons`, matching `model-eval`. Then
`card()` can call it unconditionally.

#### Verification

All four entries have `count: (files?) => …`; index renders identically.

---

### [P4][maintainability] Smoke reporter keeps pass/fail tally in module-global mutable state

**File(s):** `scripts/lib/smoke.mjs:5-26` (`passed`, `failed`, `summarize`) — pinned at SHA f934d43

#### Problem

```js
let passed = 0;
let failed = 0;
```

The tally is module-level singleton state, so two smoke suites imported into one process share a
counter, and `summarize()` calls `process.exit()` — a library function that terminates the process,
preventing composition. Fine for today's one-suite-per-process usage, but a hidden constraint no
signature communicates.

#### Proposed solution

Expose a `createReporter()` factory returning `{ check, fatal, summarize }` over closed-over
counters, and have `summarize()` return the exit code (let the caller `process.exit`). Keep the
current module-level exports as a default reporter for back-compat.

#### Verification

Two reporters in one script keep independent counts; `api-smoke`/`blobs-smoke` still exit non-zero
on failure.

---

### [P4][readability] `parseFrontmatter` silently drops non-`[A-Za-z]`-leading keys and never signals malformed lines

**File(s):** `scripts/lib/utils.mjs:118-127` (`parseFrontmatter`) — pinned at SHA f934d43

#### Problem

The key regex `^([A-Za-z]\w*):\s*(.*)$` silently ignores any frontmatter line it can't parse (e.g. a
key with a leading digit or a `-`, or a genuinely malformed line). A release author who mistypes a
key gets no error — the value just vanishes and downstream `meta.foo` is `undefined`. The comment
says "flat — we never need nested YAML," which is fine, but the silent-skip behaviour is
undocumented and bug-prone for the release pipeline that depends on it.

#### Proposed solution

Either broaden the key charset to match real frontmatter keys, or collect unparsed non-blank lines
and expose them (or throw) so a typo surfaces. At minimum document the flat-key constraint in the
comment.

#### Verification

Feed frontmatter with a mistyped key; the parser reports it rather than silently omitting.

---

### [P4][maintainability] `esc` is re-implemented in the asset-gen proof sheet with no shared source

**File(s):** `scripts/lib/scrapbook-chrome.mjs:15-19` (`esc`) — pinned at SHA f934d43

#### Problem

`scrapbook-chrome.mjs` is documented as "the single source of truth for the scrapbook look," and
`tools/asset-gen/bin/gen-coloring-book-proof-sheet.mjs` re-implements HTML escaping independently
(the header even notes it "may not import across that boundary" and mirrors tokens "by eye"). The
escaper is small, but a security-relevant helper mirrored by eye across a module boundary is a
latent XSS-consistency risk in the committed Pages output.

#### Proposed solution

Not fixable inside `scripts/lib` alone given the boundary, but worth surfacing: extract `esc` (and
the crayon token set) into a tiny dependency-free module both trees may import, or add a test
asserting the two escapers agree on a shared vector list. Track as a cross-boundary follow-up.

#### Verification

A shared escaping test over `&<>"'` passes for both generators.

---

## Source: Code audit — web/tests · E2E + integration specs

### [P1][duplication] Extract the retry-to-open dialog pattern into a shared helper — it is reimplemented four times

**File(s):** `web/tests/flows.spec.ts:27-60` (retryOpen/openParentCenter),
`web/tests/parent-zoom.spec.ts:12-20` (openParentCenter), `web/tests/a11y.spec.ts:68-76` (inline),
`web/tests/webkit-smoke.spec.ts:35-42` (inline) — pinned at SHA f934d43

#### Problem

The "click a lazily-wired control, retry until its sentinel is visible, skip the click when already
open" primitive exists as `retryOpen` in `flows.spec.ts:27-36` but is **not shared**.
`openParentCenter` alone is re-written independently in four files. The three copies outside
`flows.spec.ts` are structurally identical:

```ts
// parent-zoom.spec.ts, a11y.spec.ts, webkit-smoke.spec.ts all repeat:
await expect(async () => {
  if (!(await modal.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Parent Center' }).click({ timeout: 3000 });
  }
  await expect(modal).toBeVisible({ timeout: 1500 });
}).toPass({ timeout: 10_000 });
```

Grep confirms `isVisible().catch(() => false)` appears in four spec files. The flake-resistance
contract (ADR-0049 idle-mount handling) is thus maintained in four places; a fix to the retry shape
must be made four times, and a newcomer adding a fifth dialog copy-pastes the incantation rather
than calling a named helper.

#### Proposed solution

Move `retryOpen(ready, open, opts?)` and `openParentCenter(page)` into `web/tests/helpers.ts`
(already the WebKit-portable shared module — it contains no CDP, so `webkit-smoke.spec.ts` can
import it). Have all four specs import `openParentCenter`; delete the three inline copies and the
`flows.spec.ts` local definition. Keep
`openDrawer`/`openStrokeMenu`/`openBrushMenu`/`openColoringDialog` as one-liners over the shared
`retryOpen`, also moved to `helpers.ts`.

#### Verification

`grep -rn "isVisible().catch" web/tests` returns only `helpers.ts` after the change. Run
`npm run test:e2e -- parent-zoom.spec.ts a11y.spec.ts webkit-smoke.spec.ts flows.spec.ts --repeat-each=10`
to confirm the shared helper holds under contention.

---

### [P1][complexity] Split the two mega-spec files (engine 1980 LOC, flows 1636 LOC) by feature area

**File(s):** `web/tests/engine.spec.ts:1-1980`, `web/tests/flows.spec.ts:1-1636` — pinned at SHA
f934d43

#### Problem

`engine.spec.ts` is 1980 lines and `flows.spec.ts` is 1636 lines. Each bundles many unrelated
feature areas into one file. `engine.spec.ts` covers: basic strokes/undo, undo-cap, clear, eraser,
pen-merge recovery, edge-swipe guards, rotation/paper-view (its own section banner at line 858),
backgrounded re-entry (line 1113), teardown/re-init (line 1191), the crayon brush (line 1299), and
the snapshot memory tier (line 1715). `flows.spec.ts` covers palette, brushes, scribble-guard, undo
gating, persistence, Parent Center layouts, AI key flow, AI generation, coloring book, magic brush,
and brush ring. A reader looking for "the rotation tests" or "the coloring-book tests" must scroll a
2000-line file, and helper functions are interleaved between tests throughout (see the pixel-reader
finding below).

#### Proposed solution

Split along the section banners the files already contain. For engine: `engine-undo.spec.ts`,
`engine-eraser.spec.ts`, `engine-pointer-recovery.spec.ts`, `engine-rotation.spec.ts`,
`engine-crayon.spec.ts`, `engine-snapshot-tier.spec.ts`, sharing a new `engine-harness.ts` (see next
finding). For flows: `flows-palette.spec.ts`, `flows-parent-center.spec.ts`, `flows-ai.spec.ts`,
`flows-coloring.spec.ts`, `flows-magic-brush.spec.ts`. This also lets Playwright's 4 workers
parallelize across files rather than serializing the big two.

#### Verification

`npm test` green; `wc -l web/tests/*.spec.ts` shows no file over ~500 LOC. Grepping a feature name
(e.g. `rotation`) points to one file.

---

### [P2][duplication] The `/dev/engine` readiness `beforeEach` and state readers are duplicated verbatim across engine and multitouch specs

**File(s):** `web/tests/engine.spec.ts:24-40`, `web/tests/multitouch.spec.ts:15-55` — pinned at SHA
f934d43

#### Problem

`multitouch.spec.ts:46-55` copies the `engine.spec.ts:27-40` `beforeEach` navigate-and-poll block
character-for-character (both even carry the same explanatory comment). The `count` reader is
defined identically in both (`engine.spec.ts:25`, `multitouch.spec.ts:15`), and `state`/`alphaAt`
overlap. `grep "__engineReady === true"` shows the poll logic living in three files (`engine`,
`multitouch`, `global-setup`). Any change to how the harness signals readiness (e.g. a new
`__engineReady` gate) must be edited in lockstep in multiple places.

#### Proposed solution

Create `web/tests/engine-harness.ts` exporting `gotoEngine(page)` (the navigate + poll `beforeEach`
body), plus `count(page)`, `state(page)`, `alphaAt(page, x, y)`, `pixelAlpha(page, x, y)`. Both
specs import them; `beforeEach(({ page }) => gotoEngine(page))` replaces both inline blocks. Keep it
out of `helpers.ts` since it depends on the dev-harness `window.__engine` globals (which
`helpers.ts` must stay free of per its WebKit-portability note).

#### Verification

`grep -c "__engineReady" web/tests/*.spec.ts` returns 0 (only in `engine-harness.ts` and
`global-setup.ts`). `npm run test:e2e -- engine.spec.ts multitouch.spec.ts` green.

---

### [P2][duplication] `helpers.ts:draw` and `engine.spec.ts:drawStroke` are two near-identical mouse-stroke drivers

**File(s):** `web/tests/helpers.ts:15-22` (draw), `web/tests/engine.spec.ts:10-22` (drawStroke) —
pinned at SHA f934d43

#### Problem

`draw(page, points)` in `helpers.ts` and `drawStroke(page, box, points)` in `engine.spec.ts` do the
same thing — move to `points[0]`, `mouse.down()`, iterate `mouse.move`, `mouse.up()`. The only
difference is that `draw` resolves the canvas box itself from `#drawingCanvas` while `drawStroke`
takes a pre-fetched box (and targets `#engineCanvas`). Two copies of the pointer-drag loop drift
independently (`draw` uses `points.slice(1)` in a `for…of`; `drawStroke` uses the same but they are
maintained separately).

#### Proposed solution

Parameterize a single `dragStroke(page, points, { canvas = '#drawingCanvas' } = {})` in `helpers.ts`
that resolves the box internally, and have the engine harness pass `{ canvas: '#engineCanvas' }`.
Delete `engine.spec.ts:drawStroke`; callers that pre-fetched `box` only did so to reuse it across
the same test, which `dragStroke` can do internally per call.

#### Verification

`grep -rn "mouse.down()" web/tests` shows the loop in one helper only (plus intentional low-level
synthetic-event tests). `npm run test:e2e -- engine.spec.ts` green.

---

### [P2][duplication] The inline `fire()` PointerEvent dispatcher is re-declared ~7 times with divergent signatures

**File(s):** `web/tests/engine.spec.ts:335, 400, 434, 1232`, `web/tests/flows.spec.ts:411`,
`web/tests/ai-timer.spec.ts:59`, `web/tests/parent-zoom.spec.ts:48` — pinned at SHA f934d43

#### Problem

A local `const fire = (…) => target.dispatchEvent(new PointerEvent(…))` closure is written inside
`page.evaluate` seven times. The signatures are gratuitously inconsistent: `engine.spec.ts:335` is
`(type, x, y, buttons)`, `engine.spec.ts:400` is `(target, type, x, y, buttons)`,
`ai-timer.spec.ts:59` is `(name, id, x, y)`, `parent-zoom.spec.ts:48` is `(name, id, x, y)` with
`pointerType` closed over. Each hand-rolls the same `PointerEvent` option bag
(`bubbles: true, cancelable: true`, etc.). A reader must re-parse the argument order every time, and
a fix to (say) add `pressure` handling touches seven blocks.

#### Proposed solution

Because these run inside `page.evaluate`, they can't import a Node-side helper directly, but the
option-bag construction can be centralized as a stringifiable factory injected via
`page.addInitScript`, or — simpler — standardize on one signature
`fire(target, type, {id, x, y, buttons, pointerType})` and paste that one canonical form (a single
documented shape) so at least the divergence stops. Given the `evaluate` boundary, the pragmatic win
is: define the synthetic-pointer sequences (merged-pen-stream, hover-only, pinch-spread) as named
exported string-builders used across engine/flows, since those anatomies (finding: the pen-merge
tests) are themselves duplicated.

#### Verification

`grep -c "const fire = " web/tests/*.spec.ts` drops materially; the remaining declarations share one
signature. Synthetic-pointer tests still pass under `--repeat-each=10`.

---

### [P2][duplication] Canvas pixel-scanning readers duplicate getImageData boilerplate across ~10 functions with no shared module

**File(s):** `web/tests/helpers.ts:25-34` (firstOpaquePixel), `web/tests/flows.spec.ts:158-195`
(canvasInkStats), `1166-1180` (distinctOpaqueColors), `1331-1344` (revealedNearBlackFraction),
`1371-1380` (opaquePixelsInLeftBand), `1408-1417` (opaquePixelsInTopBand), `1498-1506`
(opaqueCount), plus inline blocks at `flows.spec.ts:300-317, 542-549, 1542-1549` and
`engine.spec.ts:1586-1600, 1792-1801` — pinned at SHA f934d43

#### Problem

At least ten functions plus several inline `page.evaluate` blocks each re-open the canvas,
`getContext('2d')`, call `getImageData`, and loop `for (let i = …; i < data.length; i += 4)`
counting alpha/opaque pixels. `opaqueCount` (1498), `opaquePixelsInLeftBand` (1371), and
`opaquePixelsInTopBand` (1408) differ only in the region rectangle and the `> 200` threshold.
`distinctOpaqueColors` and `revealedNearBlackFraction` share the same `data[i+3] < 200 continue`
scaffold. The alpha-threshold constant (`200`, `128`, `8`, `220`) is a magic number re-chosen per
function. This is the single largest source of near-duplicate code in the suite.

#### Proposed solution

Add `web/tests/canvas-pixels.ts` exporting `scanCanvas(page, {canvasId, region?, alphaMin?})`
returning `{ opaqueCount, distinctColors, nearBlackFraction, meanRgb }`, plus thin wrappers
`opaqueCount`, `opaquePixelsInBand(page, edge, frac)`. Name the thresholds (`STRONG_ALPHA = 200`,
`FAINT_ALPHA = 8`). Replace the per-test pixel readers and the inline blocks. Because the reader
runs in-page, pass the canvasId and region as `evaluate` args (the existing pattern).

#### Verification

`grep -c "getImageData" web/tests/*.spec.ts` collapses to the shared module plus a handful of
genuinely bespoke crayon samplers. Pixel-count assertions unchanged; `npm run test:e2e` green.

---

### [P2][duplication] Crayon-brush tests re-derive point generators and region samplers inline in every test

**File(s):** `web/tests/engine.spec.ts:1309-1354` (crayonScene line/region), `1393-1428`,
`1445-1488` (seg), `1493-1512`, `1521-1560` (pts+coverage), `1569-1607`, `1610-1621`, `1644-1701`,
`1763-1802` — pinned at SHA f934d43

#### Problem

The crayon section (roughly `engine.spec.ts:1299-1802`, ~500 lines) has, in nearly every test's
`page.evaluate`, a locally-defined horizontal-line generator (`line`/`pts`/`seg`:
`for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1-x0)*i)/40, y })`) and a region coverage
sampler. The `E.clearCanvas(); E.setCrayonMode(true); E.setColor('#…'); E.setStrokeWidth(…)`
preamble repeats verbatim in eight tests. The 40-segment interpolation formula alone appears ~9
times.

#### Proposed solution

In the new `engine-harness.ts` (or a `crayon-harness.ts`), export in-page string builders / a single
injected helper providing `interpolateLine(x0,x1,y,segments=40)`,
`regionCoverage(g, x0, x1, yMid, h)`, and a `setupCrayon(color, width)` preamble. Since these run in
`evaluate`, expose them by injecting a small helper object onto `window.__testkit` via
`addInitScript` on the `/dev/engine` route, then call `window.__testkit.line(...)` inside each
`evaluate`. Reduces the crayon section by a few hundred lines and pins the interpolation math in one
place.

#### Verification

The interpolation formula `((x1 - x0) * i) / 40` appears once.
`npm run test:e2e -- engine.spec.ts -g crayon --repeat-each=5` green.

---

### [P2][maintainability] Color hex literals are magic strings in flows.spec.ts while palette-trim.spec.ts already has a named palette map

**File(s):** `web/tests/flows.spec.ts:200, 221, 250, 267(purple), 507, 557, 1267, 1534`, vs the
canonical map in `web/tests/palette-trim.spec.ts:9-22` — pinned at SHA f934d43

#### Problem

`palette-trim.spec.ts:9-22` defines a clean
`C = { purple: '#AB71E1', blue: '#62A2E9', red: '#EC534E', … }`. But `flows.spec.ts` hardcodes the
same hexes as bare strings scattered through selectors and comments: `data-color="#62A2E9"` (blue,
appears 5×), `data-color="#AB71E1"` (purple), `data-color="#EC534E"` (red), and the comment-decoded
intent "`#62A2E9` is blue-dominant" is repeated at lines 217, 453. `webkit-smoke.spec.ts:50`
hardcodes `#2ECC71`. If a palette color changes, these silently rot (the selector just stops
matching, and the test fails opaquely).

#### Proposed solution

Promote the `C` map (and the `data-color="custom"` sentinel) into `web/tests/helpers.ts` as
`PALETTE`, and export a `swatch(page, color)` locator factory
(`page.locator(\`button.color-swatch[data-color="${color}"]\`)`). Replace the literals in`flows.spec.ts`,`webkit-smoke.spec.ts`, and`palette-trim.spec.ts`(which imports the same map). Add a named`isBlueDominant(px)`/`isRedDominant(px)`to replace the`px![2]

> px![0]` idiom (see separate finding).

#### Verification

`grep -rn "#62A2E9\|#EC534E\|#AB71E1" web/tests/*.spec.ts` returns only `helpers.ts`. Selectors
still resolve; `npm run test:e2e -- flows.spec.ts webkit-smoke.spec.ts palette-trim.spec.ts` green.

---

### [P2][test-quality] A single Parent-Center test asserts ~six distinct behaviors across 60 lines

**File(s):** `web/tests/flows.spec.ts:853-914` ('parent center shows quick toggles on a landscape
phone') — pinned at SHA f934d43

#### Problem

This one test verifies: (1) compact class renders, (2) quick toggles present / hub+sidebar absent,
(3) the orientation-lock cell occupies the last slot, (4) the advanced-controls quick toggle drives
its setting, (5) the portrait/landscape lock selector cycles through select→move→release→re-select
(four sub-assertions), and (6) rotating to portrait carries the setting into the full hub. A failure
in the lock-cycle sub-flow reports as a failure of "shows quick toggles," obscuring which behavior
broke, and the test cannot be run in isolation for the rotation-carry concern.

#### Proposed solution

Split into: `'landscape phone renders compact quick toggles'` (assertions 1-3),
`'a quick toggle drives the persisted setting'` (4+6 rotation-carry), and
`'the orientation lock selector cycles portrait/landscape/off'` (5). Share a
`openParentCenterCompact(page)` fixture that sets the 852×390 viewport and opens the modal.

#### Verification

Three focused tests each fail with a title that names the broken behavior.
`npm run test:e2e -- flows.spec.ts -g "quick toggle"` green.

---

### [P2][flakiness] generate-image.spec.ts relies on implicit declaration-order execution and shared limiter buckets

**File(s):** `web/tests/generate-image.spec.ts:11-14, 105-154` — pinned at SHA f934d43

#### Problem

The file opts out of parallel mode (`test.describe.configure({ mode: 'default' })`) because every
BYOK request shares one per-IP limiter bucket and the burst test (line 139) must run last. This
ordering coupling is enforced only by source position and a comment (line 12-13). The BYOK burst
test (`139-154`) even acknowledges "Earlier tests in this file used a few BYOK hits from this IP, so
the 429 can arrive slightly before the full BYOK_LIMIT" — i.e. its assertion window is loosened to
absorb cross-test state bleed. A reordering or an added BYOK test silently shifts the bucket count
and can flip the burst test red.

#### Proposed solution

Isolate the rate-limiter state per test by giving each test its own credential where possible (the
throttle tests already do this for managed tokens via `daycare-club*`), or move the two burst tests
into their own describe block with an explicit comment contract and a
`test.describe.configure({ mode: 'serial' })` so a mid-file failure skips the dependent rather than
cascading. At minimum, replace the "runs in declaration order" comment with a `serial` mode
declaration that the runner actually enforces.

#### Verification

Reorder the non-burst tests locally and confirm the burst tests still pass;
`npm run test:e2e -- generate-image.spec.ts --repeat-each=5`.

---

### [P3][maintainability] The color-change debounce sleep `waitForTimeout(150)` is an unnamed, duplicated magic number

**File(s):** `web/tests/flows.spec.ts:208, 1536` — pinned at SHA f934d43

#### Problem

```ts
await page.waitForTimeout(150); // clear the post-color-change draw debounce
```

appears twice with the same literal `150`. The engine's actual debounce is `< 100ms` (documented in
`engine.spec.ts:277` "same synchronous tick … < 100ms"). The `150` is a hand-picked margin over that
threshold; if the engine's `requiredDelay` changes, these two sleeps must be found and updated by
hand, and there is no single source tying the test constant to the engine constant.

#### Proposed solution

Define `const COLOR_CHANGE_DEBOUNCE_MS = 150;` at the top of `flows.spec.ts` (or in `helpers.ts`)
with a comment linking it to the engine's `requiredDelay`, and use it in both places. This is a
legitimate "idle past a known threshold" sleep per the testing rules, so keeping it as a sleep is
fine — only the magic number and duplication are the issue.

#### Verification

`grep -n "waitForTimeout(150)" web/tests` returns nothing; both call sites reference the named
constant.

---

### [P3][maintainability] The 1×1 PNG base64 buffer is duplicated across three test surfaces

**File(s):** `web/tests/flows.spec.ts:1033-1036`, `web/tests/generate-image.spec.ts:17-20` — pinned
at SHA f934d43

#### Problem

The identical base64 string
`'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='`
is decoded into a `Buffer` in both `flows.spec.ts` (as the mocked generate-image response) and
`generate-image.spec.ts` (as `TINY_PNG`). A test-fixtures module should own this once.

#### Proposed solution

Add `web/tests/fixtures.ts` exporting `TINY_PNG_BASE64` and `tinyPngBuffer()`. Import in both specs.
This also gives a home for the `web/tests/artifacts/*.jpeg` fixtures referenced by the ai-timer
harness.

#### Verification

`grep -rn "iVBORw0KGgo" web/tests/*.spec.ts` returns nothing; both specs import the fixture.
`npm run test:e2e -- generate-image.spec.ts flows.spec.ts -g "AI"` green.

---

### [P3][duplication] `ADMIN_KEY = 'test-admin-secret'` is redeclared in two specs instead of shared

**File(s):** `web/tests/admin.spec.ts:12`, `web/tests/a11y.spec.ts:13` — pinned at SHA f934d43

#### Problem

Both specs hardcode `const ADMIN_KEY = 'test-admin-secret'` with the same "set in
playwright.config.ts webServer.env" comment. The value is actually authored in
`playwright.config.ts` (`ADMIN_ACCESS_TOKEN=test-admin-secret`). Three copies of the same secret
literal must be kept in sync; a change to the config value silently breaks whichever spec wasn't
updated.

#### Proposed solution

Export `ADMIN_KEY` from a shared `web/tests/admin-helpers.ts` (which could also host the duplicated
`signIn`-style login used by both `admin.spec.ts:14-19` and `a11y.spec.ts:47-52`), or read it from
`process.env.ADMIN_ACCESS_TOKEN` with the literal as a fallback so the config remains the single
source.

#### Verification

`grep -rn "test-admin-secret" web/tests` returns one definition.
`npm run test:e2e -- admin.spec.ts a11y.spec.ts` green.

---

### [P3][readability] Blue/red-dominance pixel assertions hide their intent behind index math repeated across tests

**File(s):** `web/tests/flows.spec.ts:217, 453-454, 1542-1549`, `web/tests/helpers.ts:25-34` —
pinned at SHA f934d43

#### Problem

The idiom `expect(px![2]).toBeGreaterThan(px![0])` (blue channel > red channel ⇒ "painted blue")
recurs with an explanatory comment each time (`flows.spec.ts:217` "`#62A2E9` is blue-dominant — the
painted pixel should be more blue than red"). The red-detection at `flows.spec.ts:1542-1549` inlines
`data[i]>200 && data[i+1]<120 && data[i+2]<120`. The reader must decode raw `[r,g,b,a]` index
arithmetic to understand what color is being asserted, and `firstOpaquePixel` returns an untyped
`number[]` (not a named `Rgba` tuple), so nothing prevents an off-by-one channel index.

#### Proposed solution

In `helpers.ts`, type the return as `type Rgba = [number, number, number, number]` and add
predicates `isBlueDominant(px: Rgba)`, `isRedDominant(px: Rgba)`. Replace the index comparisons and
inline red-scans with named predicates. Assertions read `expect(isBlueDominant(px!)).toBe(true)`.

#### Verification

`grep -rn "px!\[2\]" web/tests` returns nothing.
`npm run test:e2e -- flows.spec.ts webkit-smoke.spec.ts` green.

---

### [P3][maintainability] CDP viewport-rotation setup is duplicated in flows.spec.ts and diverges from the engine harness's rotation approach

**File(s):** `web/tests/flows.spec.ts:1142-1149, 1435-1442` — pinned at SHA f934d43

#### Problem

The exact
`cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 1280, deviceScaleFactor: 1, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 90 } })`
block is pasted in two coloring-book rotation tests. Separately, `engine.spec.ts:870-878` rotates
via a harness override (`setScreenAngleOverride` + `resizeTo`) — so the codebase has two unrelated
"rotate the viewport" mechanisms with no shared naming, making it non-obvious which to reach for.

#### Proposed solution

Extract `rotateViewportViaCdp(page, { width, height, angle })` into `helpers.ts` (CDP is
Chromium-only, but `helpers.ts` is imported by webkit-smoke only for CDP-free functions — keep the
CDP helper in a separate `web/tests/cdp.ts` to preserve the WebKit-portability boundary noted in
`web/tests/CLAUDE.md`). Use it in both flows tests. Add a one-line comment cross-referencing the
engine harness's `setScreenAngleOverride` so the two rotation paths are discoverable from each
other.

#### Verification

`grep -c "setDeviceMetricsOverride" web/tests/*.spec.ts` shows one definition.
`npm run test:e2e -- flows.spec.ts -g rotat` green.

---

### [P3][readability] Helper functions are scattered between tests throughout flows.spec.ts instead of grouped

**File(s):** `web/tests/flows.spec.ts:328-333` (activateWithKey), `492-500`
(stylusTouchStartPrevented), `1075-1081` (openColoringDialog), `1105-1117` (applyFarmPage),
`1166-1180` (distinctOpaqueColors), `1331-1344, 1371-1380, 1408-1417, 1498-1506` (pixel readers) —
pinned at SHA f934d43

#### Problem

Unlike the disciplined "── helpers ──" banner at the top (`flows.spec.ts:10-195`), many helpers are
defined lower down, immediately before the first test that uses them, interleaved with tests.
`openColoringDialog` sits at line 1075 (between the AI test and the coloring tests);
`distinctOpaqueColors` at 1166 (after the magic-brush test that references it via `drawMagicReveal`
at line 130, ~1000 lines earlier). Grepping for a helper definition is unpredictable, and a reader
scrolling sees `function` declarations breaking up the test narrative. `drawMagicReveal` (line 126)
forward-references `distinctOpaqueColors` (line 1166), so the file cannot be read top-to-bottom.

#### Proposed solution

When splitting the file (P1 finding above), move each area's helpers to the top of its new spec, or
into the shared `canvas-pixels.ts`/`helpers.ts` modules. If the file stays monolithic short-term,
hoist all `function`/`const … =>` helpers into the existing top-of-file helpers section so tests
read as an uninterrupted sequence.

#### Verification

All `function`/helper `const` declarations precede the first `test(` in each spec.
`npm run test:e2e` green.

---

### [P3][maintainability] Viewport dimensions and interaction timeouts are unnamed magic numbers repeated across specs

**File(s):** `web/tests/flows.spec.ts:743, 771-776, 827, 854, 903, 930, 1615, 1630`; timeouts
`10_000`/`1500`/`1000`/`3000` throughout `flows.spec.ts`, `ai-timer.spec.ts:15,30`,
`parent-zoom.spec.ts`, `webkit-smoke.spec.ts` — pinned at SHA f934d43

#### Problem

Breakpoint-sensitive viewport sizes appear as bare literals with the meaning only in prose:
`460×852` (phone portrait, lines 743, 827), `852×390` (landscape phone, 854), `390×852` (portrait
rotate-target, 903), `740×360` (short landscape, 776), `900×600`/`600×900` (rotation pair,
1615/1630). The retry timeout `10_000` and settle `1500`/`1000` are re-typed at nearly every
`retryOpen`/`toPass` call. A newcomer can't tell which `460` is "just below the tablet breakpoint"
(load-bearing) versus arbitrary, and moving a CSS breakpoint requires hunting bare numbers.

#### Proposed solution

Add a `web/tests/viewports.ts` with named presets (`PHONE_PORTRAIT = { width: 460, height: 852 }`,
`LANDSCAPE_PHONE`, `SHORT_LANDSCAPE`, …) tied by comment to the CSS breakpoints they probe, and an
`OPEN_TIMEOUT`/`SETTLE_TIMEOUT` constants pair. `palette-trim.spec.ts` and `picker-trim.spec.ts`
already parameterize viewport tables (`PORTRAIT`/`LANDSCAPE`/`CASES`) — extend that discipline to
`flows.spec.ts`.

#### Verification

`page.setViewportSize({ width: 460` no longer appears as a bare literal in flows.
`npm run test:e2e -- flows.spec.ts` green.

---

### [P3][test-quality] page.spec.ts hand-parses PNG IHDR bytes — fragile and unexplained magic offsets

**File(s):** `web/tests/page.spec.ts:111-119` — pinned at SHA f934d43

#### Problem

```ts
expect(png.readUInt32BE(16)).toBe(declaredWidth);
expect(png.readUInt32BE(20)).toBe(declaredHeight);
```

The offsets `16`/`20` are the PNG IHDR width/height fields; the comment explains, but any
non-standard chunk ordering or a future WebP OG image would read garbage and assert a confusing
mismatch rather than "not a PNG." The test also silently assumes `/large-image.png` is a PNG.

#### Proposed solution

Guard the magic bytes first: assert `png.subarray(0,8)` equals the PNG signature
(`\x89PNG\r\n\x1a\n`) before reading IHDR, and extract a small
`pngDimensions(buffer): {width, height}` helper into `web/tests/fixtures.ts` so the offset
arithmetic is named and reusable. Fail loudly ("not a PNG") if the signature check fails.

#### Verification

Corrupt the signature locally and confirm a clear failure message;
`npm run test:e2e -- page.spec.ts` green.

---

### [P4][readability] multitouch STROKES/SAMPLES rely on positional index coupling between two separate arrays

**File(s):** `web/tests/multitouch.spec.ts:31-44` — pinned at SHA f934d43

#### Problem

`STROKES[3]` (pointer 4, leftward) is verified by `SAMPLES[3]` (`{ x: 90, y: 190 }` "on pointer 4's
leftward path"). The correspondence is maintained only by array position and comments; inserting a
stroke without inserting its sample at the same index silently mis-pairs the assertion (a sample
could land on the wrong line and still be opaque, passing vacuously).

#### Proposed solution

Merge into one array of `{ stroke, sample }` objects so each line and its verification point are
lexically adjacent and cannot drift:
`const LINES = [{ stroke: horizontalStroke(1,50,40,260), sample: {x:150,y:50} }, …]`, then
`multiStrokeSync(LINES.map(l => l.stroke))` and loop `LINES.map(l => l.sample)`.

#### Verification

`npm run test:e2e -- multitouch.spec.ts` green; the pairing is now structurally enforced.

---

### [P4][test-quality] Scribble-guard `evaluate` probes are duplicated between engine and flows and could share one fixture

**File(s):** `web/tests/flows.spec.ts:463-500` (fingerPrevented / stylusTouchStartPrevented),
`web/tests/engine.spec.ts:461-479` (Scribble touch-cancel probe) — pinned at SHA f934d43

#### Problem

Both files build synthetic `TouchEvent`/stubbed-`changedTouches` probes to assert the Scribble
guard's `preventDefault` behavior. `flows.spec.ts:492-500` and `engine.spec.ts:464-476` construct
the same touch-event scaffolding independently. The pattern (dispatch a cancelable touch and read
`defaultPrevented`) is a reusable primitive.

#### Proposed solution

Extract `touchStartPrevented(page, selector, { touchType })` into `helpers.ts` (no CDP, WebKit-safe)
covering both the real-`Touch` finger case and the stubbed-`changedTouches` stylus case. Both specs
import it.

#### Verification

`grep -rn "changedTouches" web/tests/*.spec.ts` shows one helper.
`npm run test:e2e -- flows.spec.ts engine.spec.ts -g Scribble` green.

---

### [P4][test-quality] Tests reach deep into engine internals via the harness, coupling specs to implementation details

**File(s):** `web/tests/global.d.ts:6-66` (the `window.__engine` surface), consumed throughout
`web/tests/engine.spec.ts` (e.g. `getUndoDebug` at 673, 699, 1739; `inkBounds` at 751, 910;
`pixelAt` pervasively) — pinned at SHA f934d43

#### Problem

The `window.__engine` harness exposes 25+ methods including internals like `getUndoDebug()`
(`{ snapshots, liveRasters, blobBytes, pendingCommands }`) and `getCrayonParams()`. Tests like
`engine.spec.ts:1918-1978` assert on `liveRasters`/`blobBytes` tier counts — implementation details
of the snapshot memory tier (ADR-0066). If the tiering strategy is refactored (e.g. a third tier),
these tests fail even when user-visible undo behavior is unchanged. Some coupling is inherent to an
engine harness, but the memory-tier assertions test the mechanism, not the behavior.

#### Proposed solution

Keep behavior-level tests (undo restores the right pixels) and clearly segregate the tier-internals
tests into a `engine-snapshot-tier.spec.ts` (per the split finding) with a header comment stating
they intentionally assert internal invariants and are expected to change with ADR-0066 refactors —
so a future maintainer knows these are white-box by design and doesn't mistake a churn failure for a
regression. Consider trimming `pendingCommands`/`getCrayonParams` from `global.d.ts` if no spec
reads them (grep to confirm).

#### Verification

`grep -rn "pendingCommands\|getCrayonParams" web/tests/*.spec.ts` — if zero, remove from the harness
type. Tier tests carry the white-box header.

---

### [P4][naming] `engine.spec.js` referenced in a comment but the file is `.ts`

**File(s):** `web/tests/flows.spec.ts:6` — pinned at SHA f934d43

#### Problem

The header comment reads "the engine-level spec (engine.spec.js) deliberately bypasses" — but the
file is `engine.spec.ts` (TypeScript everywhere, per CLAUDE.md). A reader grepping for
`engine.spec.js` finds nothing; the stale `.js` reference predates the TS migration.

#### Proposed solution

Change `engine.spec.js` to `engine.spec.ts` in the comment.

#### Verification

`grep -rn "\.spec\.js" web/tests` returns nothing.

---

### [P4][maintainability] Duplicated undo-cap-of-20 test exists in two forms without cross-reference

**File(s):** `web/tests/engine.spec.ts:110-134` ('the undo stack caps at 20') and
`web/tests/engine.spec.ts:1722-1755` ('depth caps at 20 and deep entries restore from encoded
blobs') — pinned at SHA f934d43

#### Problem

Two tests both draw 22 strokes and assert the stack caps at 20 (`engine.spec.ts:116` and `1723` use
the identical `for (let i = 0; i < 22; i++) … y = 14 + i * 12` loop and the same 30/270
x-coordinates). The first checks the cap via `canUndo` iteration; the second checks the memory-tier
demotion. The shared 22-stroke setup is copy-pasted, and neither references the other, so a reader
can't tell they're deliberately complementary vs. accidentally redundant.

#### Proposed solution

Extract the `draw22Strokes(page)` (or `drawNStrokes(page, n)`) setup into the engine harness, use it
in both, and add a one-line comment in each pointing to the other ("cap behavior; see also the tier
test at …"). Confirms the redundancy is intentional and DRYs the fixture.

#### Verification

`grep -c "i < 22" web/tests/engine.spec.ts` drops to reference the shared helper.
`npm run test:e2e -- engine.spec.ts -g "caps at 20"` green.

---

### [P4][readability] `firstOpaquePixel` and `draw` in helpers.ts lack input guards and precise types

**File(s):** `web/tests/helpers.ts:15-34` — pinned at SHA f934d43

#### Problem

`draw(page, points)` indexes `points[0]` (line 18) with no guard for an empty array — an empty
`points` throws an unhelpful `undefined` deref rather than a clear "draw called with no points."
`firstOpaquePixel` returns `Promise<number[] | null>` — an untyped array where callers rely on
positional channels (`px![2]`), so a caller reading the wrong index gets no type help.

#### Proposed solution

Add `if (points.length === 0) throw new Error('draw requires at least one point');` and type the
pixel reader as `Promise<Rgba | null>` with `type Rgba = readonly [number, number, number, number]`.
Pairs with the `isBlueDominant` predicate finding.

#### Verification

`npm run check` passes with the tighter type; `npm run test:e2e` green.

---

That is 26 findings. The two structural themes worth prioritizing: (1) there is no shared test-utils
layer beyond the thin `helpers.ts` — the engine harness readers, dialog-open retries, pixel
scanners, palette constants, and synthetic-pointer builders all want extraction into
`engine-harness.ts` / `canvas-pixels.ts` / `fixtures.ts` modules; and (2) `engine.spec.ts` (1980
LOC) and `flows.spec.ts` (1636 LOC) should be split by the feature banners they already contain,
which also unlocks better parallelism and grepability.

## Source: Code audit — web · build/test configuration

### [P1][duplication] Browser-support floor is duplicated across `vite.config.ts` and root `browserslist` with only a comment enforcing sync

**File(s):** `web/vite.config.ts:72-78` (build target) — pinned at SHA f934d43; cross-references
`package.json:304-310` (browserslist)

#### Problem

The supported-browser floor is hand-maintained in two places that must stay identical:

```ts
// web/vite.config.ts:78
build: { target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'] },
```

```json
// package.json:305-309
"chrome >= 111", "edge >= 111", "firefox >= 114", "safari >= 16.4", "ios_saf >= 16.4"
```

The only thing keeping them in sync is the prose comment ("Keep in sync with `browserslist`… both
are documented in docs/COMPATIBILITY.md"). Drift here is not cosmetic: esbuild's `target` governs
which JS/CSS syntax is down-leveled, so if someone bumps `browserslist` (e.g. via
`npm run update:browserslist`) but not this array, the bundle can ship syntax the declared floor
can't run. The comment also encodes a hard INVARIANT (ios/safari ≥ native
`IPHONEOS_DEPLOYMENT_TARGET`) that nothing checks. Three separate sources of truth (this array,
browserslist, the Xcode target) are coupled only by comments.

#### Proposed solution

Derive the esbuild `target` array from `browserslist` programmatically rather than restating it.
Either (a) read the root `package.json` `browserslist` field in `vite.config.ts` and map
`"chrome >= 111"` → `"chrome111"`, or (b) use a small helper (e.g. `browserslist-to-esbuild`) so the
single source is the `browserslist` field. If a runtime dependency is undesirable, add a cheap
assertion test (or a `scripts/` check wired into `npm run check`) that parses both and fails on
mismatch, plus a check that the safari/ios floor ≥ the Xcode `IPHONEOS_DEPLOYMENT_TARGET`.

#### Verification

Bump one entry in `browserslist` only and confirm the build (or a new sync test) fails. After the
fix, `npm run build` should produce identical `target` behavior; grep `git grep -n "16.4"` should
show one authoritative definition, not three uncoordinated ones.

---

### [P2][duplication] The `define` compile-time constants are restated in `vite.config.ts` and `vitest.config.ts` and have already drifted

**File(s):** `web/vite.config.ts:65-71` and `web/vitest.config.ts:11-19` (define blocks) — pinned at
SHA f934d43

#### Problem

Both configs declare the `__APP_VERSION__` / `__BUILD_TIME__` / `__NATIVE_API_BASE__` /
`__IS_CAPACITOR__` / `__PERF_MARKS__` compile-time globals, independently:

```ts
// vite.config.ts:65-71 — five keys
__APP_VERSION__, __BUILD_TIME__, __NATIVE_API_BASE__, __IS_CAPACITOR__, __PERF_MARKS__;
```

```ts
// vitest.config.ts:11-19 — only four keys, __PERF_MARKS__ omitted
```

The set has already diverged: `vitest.config.ts` is missing `__PERF_MARKS__`. It happens to work
only because `web/src/lib/drawing/perf.ts:5` guards it with `typeof __PERF_MARKS__ !== 'undefined'`
— a coincidental safety net, not a designed one. The two lists of magic global names (declared a
third time in `web/src/app.d.ts`) have no shared source, so a newly added define can compile in prod
but be `undefined`/differently-valued under test with no error.

#### Proposed solution

Extract the define keys into one shared module (e.g. `web/build/defines.ts` exporting a factory
`buildDefines({ isCapacitor, appVersion, ... })`) imported by both configs, so the key set is
defined once and each config only supplies environment-specific values. At minimum, add
`__PERF_MARKS__` to `vitest.config.ts` for parity so the guard in `perf.ts` isn't load-bearing.

#### Verification

`git grep -n "__PERF_MARKS__\|__APP_VERSION__"` should show the key names in exactly one config
source after refactor. Add a test importing every `__*__` name under Vitest and asserting it is
defined.

---

### [P2][consistency] Production origin `https://splotch.art` and the Capacitor origins are hardcoded string literals scattered across configs

**File(s):** `web/vite.config.ts:55` (`NATIVE_API_BASE`) and `web/svelte.config.js:40`
(`csrf.trustedOrigins`) — pinned at SHA f934d43

#### Problem

The app's own origin and the two native WebView origins appear as bare literals in separate files:

```ts
// vite.config.ts:55
const NATIVE_API_BASE = isCapacitor ? 'https://splotch.art' : '';
```

```js
// svelte.config.js:40
csrf: { trustedOrigins: ['https://localhost', 'capacitor://localhost'] },
```

`https://splotch.art` also recurs in the root `netlify.toml` HSTS/CSP commentary and (per the `api`
skill) in the server CORS allow-list. There is no named constant, so a domain change or an added
native origin requires finding every literal by memory. A newcomer searching "where is the API
origin configured" finds several disconnected spots.

#### Proposed solution

Define these as named constants in one shared module (e.g. `web/build/origins.ts`: `PROD_ORIGIN`,
`CAPACITOR_ORIGINS`) and import them into both configs. Reference the same constants from the server
CORS code so the allow-list and the native base URL cannot disagree.

#### Verification

`git grep -n "splotch.art\|capacitor://localhost"` under `web/` should collapse to a single
definition site plus imports. Build both web and `CAPACITOR=true` targets and confirm
`__NATIVE_API_BASE__` and CSRF origins are unchanged.

---

### [P3][duplication] `playwright.config.ts` and `playwright.webkit-scratch.config.ts` duplicate the whole webServer/PORT/env setup

**File(s):** `web/playwright.webkit-scratch.config.ts:6-27` vs `web/playwright.config.ts:5-6,93-109`
(shared config) — pinned at SHA f934d43

#### Problem

The scratch config copy-pastes `PORT = 4173`, `baseURL`, `testDir`, `globalSetup`, the
`vite build && vite preview` command, `timeout: 180_000`, and the
`{ PUBLIC_ENABLE_DEV_HARNESS, ADMIN_ACCESS_TOKEN: 'test-admin-secret' }` env verbatim from the main
config:

```ts
// webkit-scratch:22-26
command: `npx vite build && npx vite preview --port ${PORT}`,
...
env: { PUBLIC_ENABLE_DEV_HARNESS: 'true', ADMIN_ACCESS_TOKEN: 'test-admin-secret' },
```

If the port, the secret, the harness flag, or the webServer command changes in the main config, the
scratch config silently rots. The magic secret `'test-admin-secret'` is duplicated in two files (and
is coupled to `.claude/rules/testing.md`).

#### Proposed solution

Extract the shared pieces (PORT, baseURL, globalSetup, webServer command/env/timeout) into a small
`web/playwright.shared.ts` and have both configs import and spread them, overriding only what
differs (the scratch config's `projects` and `reuseExistingServer`). Define `ADMIN_ACCESS_TOKEN`
test value and the harness env as named exports there.

#### Verification

Change PORT in the shared module and confirm both configs pick it up. Run
`node scripts/web.mjs playwright test -c playwright.webkit-scratch.config.ts` and the normal
`npm run test:e2e` and confirm both still boot the server.

---

### [P3][consistency] `vite.config.ts` exports an untyped plain object instead of using `defineConfig`

**File(s):** `web/vite.config.ts:57` (`export default { ... }`) — pinned at SHA f934d43

#### Problem

`vitest.config.ts:9` and both Playwright configs use `defineConfig(...)`, but `vite.config.ts`
exports a bare object literal:

```ts
export default {
  server: { ... },
  build: { ... },
  ...
};
```

Only one nested plugin is typed (`satisfies import('vite').Plugin`, line 96); the top-level object
has no `UserConfig` type, so typos in keys (`buld`, `plugin`), invalid option values, or a mistyped
`build.target` entry are not caught by `svelte-check`. This is an inconsistency across sibling
configs and loses the editor autocomplete every other config file here enjoys.

#### Proposed solution

Import `defineConfig` from `vite` and wrap the export: `export default defineConfig({ ... })`. This
types the whole object and lets the inline `satisfies` on the plugin be dropped.

#### Verification

Introduce a deliberately invalid option (e.g. `build: { targett: [...] }`) and confirm
`npm run check` now flags it. Confirm `npm run build` output is byte-identical.

---

### [P3][maintainability] Git-based version derivation is ~35 lines of imperative logic embedded in `vite.config.ts` and is untestable there

**File(s):** `web/vite.config.ts:16-49` (`git`, `webVersion`, `PKG_VERSION`) — pinned at SHA f934d43

#### Problem

The config file carries non-trivial branching logic — `git describe` parsing with a regex, a
two-level try/catch fallback chain, and version-string assembly:

```ts
function webVersion(pkg: string): string {
  const [major, minor] = pkg.split('.');
  try {
    const match = git('describe --tags --long --match "v*"').match(/-(\d+)-g[0-9a-f]+$/);
    if (match) return `${major}.${minor}.${match[1]}`;
  } catch { ... }
  try { return `${major}.${minor}.0+${git('rev-parse --short HEAD')}`; }
  catch { return pkg; }
}
```

This encodes the ADR-0030 versioning contract but lives inside a config module, so it cannot be
unit-tested and mixes "what the build is" with "how versions are computed." The regex and fallback
semantics are exactly the kind of logic that should have tests.

#### Proposed solution

Move `git`, `webVersion`, and the `PKG_VERSION`/`BUILD_TIME` derivation to a `scripts/` helper (e.g.
`scripts/web-version.mjs` or `web/build/version.ts`) exporting pure functions (take the
`git describe` output as an argument so it's mockable). `vite.config.ts` imports and calls it. Add a
Vitest spec covering the tag-present, no-tag, and no-git branches.

#### Verification

New unit test passes for all three branches. `npm run build` on a checkout with tags still yields
`major.minor.<n>`; on a shallow/tagless checkout yields `major.minor.0+<sha>`.

---

### [P3][consistency] The `CAPACITOR` "single signal" is re-derived independently in every config with a repeated literal comparison

**File(s):** `web/vite.config.ts:8`, `web/svelte.config.js:10`, `web/vitest.config.ts:18`
(isCapacitor) — pinned at SHA f934d43

#### Problem

`CLAUDE.md` calls `CAPACITOR=true` "the single signal," yet each config recomputes it:

```ts
const isCapacitor = process.env.CAPACITOR === 'true'; // vite.config.ts:8
const isCapacitor = process.env.CAPACITOR === 'true'; // svelte.config.js:10
```

and `vitest.config.ts:18` hardcodes the opposite (`__IS_CAPACITOR__: JSON.stringify(true)`) with its
own inline rationale. The `=== 'true'` comparison (easy to get wrong, e.g.
`Boolean(process.env.CAPACITOR)` which is truthy for `"false"`) is duplicated. There's no single
named export representing the platform signal, so "the single signal" is really three call sites.

#### Proposed solution

Add a tiny shared module (`web/build/platform.ts` / `.mjs`) exporting
`export const isCapacitor = process.env.CAPACITOR === 'true'` and import it into `vite.config.ts`
and `svelte.config.js`. This makes the "single signal" literally single and removes the risk of one
file using a laxer comparison.

#### Verification

`git grep -n "CAPACITOR === 'true'"` should return one hit. Build both targets and confirm adapter
selection and PWA inclusion are unchanged.

---

### [P3][documentation] Stale/incorrect comment: `vitest-setup.ts` says "jsdom" but the environment is happy-dom

**File(s):** `web/vitest-setup.ts:3-5` (comment) — pinned at SHA f934d43

#### Problem

```ts
// The storage + state layers gate browser-only work behind `browser` from
// `$app/environment`. Under vitest (jsdom) we always want the browser code
```

The Vitest environment is `happy-dom` (`vitest.config.ts:21`), and both `.claude/rules/testing.md`
and ADR-0009 explicitly state the suite uses happy-dom, "not jsdom." A newcomer reading this setup
file is told the wrong DOM implementation — exactly the sort of detail (happy-dom vs jsdom API gaps)
that matters when debugging a test-only DOM failure.

#### Proposed solution

Replace "(jsdom)" with "(happy-dom)". Optionally cite ADR-0009 for why.

#### Verification

`git grep -in jsdom web/` returns nothing after the fix (confirm no other stale references).

---

### [P4][documentation] Undocumented magic values in the PWA/webServer config (networkTimeoutSeconds, timeout, BUILD_TIME slice)

**File(s):** `web/vite.config.ts:27,137` and `web/playwright.config.ts:104` — pinned at SHA f934d43

#### Problem

Several load-bearing numbers have no WHY comment, which is exactly the case the project convention
says warrants one:

* `web/vite.config.ts:137` `networkTimeoutSeconds: 5` — the NetworkFirst fallback window for
  navigation requests; nothing explains why 5s (vs the child waiting on a stalled network).
* `web/vite.config.ts:27` `new Date().toISOString().slice(0, 16)` — `16` is the magic length that
  trims to `YYYY-MM-DDTHH:MM`; the comment above explains BUILD_TIME's purpose but not the slice.
* `web/playwright.config.ts:104` `timeout: 180_000` — the webServer boot budget (build + preview);
  no rationale for 3 minutes, and it's duplicated in the scratch config.

#### Proposed solution

Add one-line rationale comments (or named constants like `NAV_NETWORK_TIMEOUT_SECONDS`,
`WEBSERVER_BOOT_TIMEOUT_MS`). For the BUILD_TIME slice, a named helper or a comment
`// slice(0,16) → "YYYY-MM-DD HH:MM"` suffices.

#### Verification

Review confirms each magic number now carries either a name or a WHY. No behavior change.

---

### [P4][consistency] `.env.example` mixes placeholder conventions and has a redundant/misleading entry

**File(s):** `web/.env.example:11-13,41` — pinned at SHA f934d43

#### Problem

The file uses three different conventions for "fill this in":

```
# GEMINI_API_KEY=        (commented, empty)
GEMINI_API_KEY=replace   (uncommented, "replace")
ADMIN_ACCESS_TOKEN=replace
...
REDTEAM_FIXTURE_KEY=replace
```

`ALLOWED_TOKENS_LIST` gets a real working value (`"abc,daycare-club"`), others get `replace`, and
`GEMINI_API_KEY` is both commented-out (line 12 as documented-optional) *and* set to `replace` on
the next line — contradictory. Worse, `ADMIN_ACCESS_TOKEN=replace` implies it's consumed, but the
E2E web server hardcodes `ADMIN_ACCESS_TOKEN: 'test-admin-secret'` (`playwright.config.ts:108`),
overriding anything in `.env` — so copying this file with `replace` is silently ineffective for the
admin specs, which is confusing.

#### Proposed solution

Pick one placeholder convention (e.g. `KEY=` empty, or `KEY=<your-token>`), remove the duplicate
commented `# GEMINI_API_KEY=` above the active line, and add a note that `ADMIN_ACCESS_TOKEN` is
only used by `npm run dev:netlify` (the E2E suite injects its own).

#### Verification

`cp web/.env.example web/.env` then run `npm run dev:netlify` and `npm run test:e2e`; confirm the
doc comments now match which var each command actually reads.

---

### [P4][maintainability] Port `5173` is coupled across `vite.config.ts` and `web/netlify.toml` as bare literals

**File(s):** `web/vite.config.ts:59` (`port: 5173`) and `web/netlify.toml:25` (`targetPort = 5173`)
— pinned at SHA f934d43

#### Problem

The dev proxy target and the Vite dev port must match, but both are unnamed literals in different
files/formats:

```ts
server: { port: 5173, strictPort: true, ... }   // vite.config.ts:59
```

```toml
targetPort = 5173                                 // web/netlify.toml:25
```

`5173` is also hardcoded in several root `package.json` scripts (`dev:kill`, `adb:reverse`,
`android:live`). With `strictPort: true`, a change to one side without the other makes
`npm run dev:netlify` fail to proxy. Nothing links them; grepping `5173` returns many disconnected
hits.

#### Proposed solution

This is inherently cross-format (TOML can't import a TS constant), so the pragmatic fix is a
cross-reference comment on each (`# must match vite server.port (web/vite.config.ts)` /
`// dev port; mirrored in web/netlify.toml targetPort and dev:* scripts`). If stronger coupling is
wanted, drive the Vite port from an env var that `scripts/web.mjs` and netlify.toml share.

#### Verification

Change the Vite port and confirm the added comments point a maintainer to every mirror.
`npm run dev:netlify` proxies correctly when both match.

---

### [P4][readability] `playwright.config.ts` browser-fallback logic uses a bare magic index and three silent empty catches

**File(s):** `web/playwright.config.ts:15-49` (`chromiumExecutablePath`, `webkitAvailable`) — pinned
at SHA f934d43

#### Problem

```ts
.filter((d) => /^chromium-\d+$/.test(d))
.sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));   // line 23
```

`9` is the unexplained length of the `"chromium-"` prefix (a classic off-by-one hazard if the prefix
ever changes). The function also has three bare `} catch {}` blocks (lines 19, 31, 44) that swallow
all errors with no comment on why silence is correct — a reader can't tell intentional-fallback from
accidental error-hiding. This is dense environment-probing logic sitting in a config file.

#### Proposed solution

Replace `slice(9)` with a captured regex group (`d.match(/^chromium-(\d+)$/)?.[1]`) or a named
`const PREFIX = 'chromium-'` so intent is explicit. Add a short comment on each empty catch
("missing/unreadable path → fall through to next candidate"). Consider extracting both helpers to a
`scripts/` module so they can be unit-tested independently of Playwright.

#### Verification

Run E2E on a checkout where `chromium.executablePath()` is missing but a `chromium-<rev>` dir
exists; confirm the resolved path still selects the highest revision.

---

### [P4][documentation] Temporal wording in config comments will age ("now", "is now TypeScript")

**File(s):** `web/tsconfig.json:5-6` and `web/vite.config.ts:16` — pinned at SHA f934d43

#### Problem

```jsonc
// All of src/ is now TypeScript. Config files ... are unaffected by this.  (tsconfig.json:5)
```

Comments phrased as "now" / "is now" describe a transition rather than a stable state; a year on,
"now" is meaningless and the reader can't tell whether it still holds. The tsconfig comment's real
intent is "`allowJs: false` — src is TS-only." Similar transitional phrasing appears in the version
comment block.

#### Proposed solution

Reword to timeless statements of the invariant:
`// src/ is TypeScript-only; allowJs:false enforces it. Root config/build scripts live outside src/ and are exempt.`
Prefer describing the rule, not the migration.

#### Verification

Review; no behavior change. `npm run check` still passes.

---

### [P5][documentation] Misleading "matching PORT above" comment on the Playwright webServer

**File(s):** `web/playwright.config.ts:93-101` (webServer command) — pinned at SHA f934d43

#### Problem

```ts
// ... `vite preview` defaults to 4173, matching PORT above.
...
: `npx vite build && npx vite preview --port ${PORT}`,
```

The comment leans on `vite preview`'s *default* being 4173 "matching PORT above," but the command
actually passes `--port ${PORT}` explicitly — so the default is irrelevant and the note misleads a
reader into thinking the port coincidence is load-bearing (it isn't; the explicit flag governs). It
plants a false coupling to Vite's default that a Vite upgrade changing the default would appear to
threaten but wouldn't.

#### Proposed solution

Drop the "defaults to 4173, matching PORT above" clause; the `--port ${PORT}` flag is
self-documenting. If keeping context, say "served on PORT via the explicit `--port` flag."

#### Verification

Read-through; run `npm run test:e2e` to confirm the server still binds 4173.

---

### [P5][consistency] `PORT`/`baseURL` naming and `defineConfig` usage differ between the two Playwright configs and the reporter shape is inconsistent

**File(s):** `web/playwright.config.ts:64` vs `web/playwright.webkit-scratch.config.ts:13`
(reporter) — pinned at SHA f934d43

#### Problem

The two Playwright configs, which are otherwise near-identical, differ in small unexplained ways
beyond their intended purpose: the main config's `reporter: [['list'], ['html', { open: 'never' }]]`
vs the scratch config's `reporter: [['list']]` (reasonable, but undocumented), and
`reuseExistingServer: !process.env.CI` vs a flat `true`. Combined with the duplication flagged
above, a maintainer can't quickly tell which differences are intentional (scratch = local-only, no
HTML report) versus accidental drift.

#### Proposed solution

Once the shared base is extracted (see the P3 duplication finding), the scratch config should
express only its *intentional* deltas (webkit-only project, list-only reporter, always reuse server)
as explicit overrides on top of the shared config, making every difference a deliberate, visible
line.

#### Verification

Diff the two effective resolved configs after refactor; every difference should map to a documented
scratch-mode override.

---

### [P5][dead-config] `vitest.config.ts` omits `__PERF_MARKS__`, silently relying on a `typeof` guard in source

**File(s):** `web/vitest.config.ts:11-19` (define) — pinned at SHA f934d43; consumer
`web/src/lib/drawing/perf.ts:5`

#### Problem

Unlike the four other `__*__` defines, `__PERF_MARKS__` is absent from the Vitest `define`. It only
avoids a `ReferenceError` under test because `perf.ts:5` reads it as
`typeof __PERF_MARKS__ !== 'undefined' && __PERF_MARKS__`. So the config relies on a defensive guard
in application source rather than declaring the constant — an implicit coupling that will bite the
moment any test imports a module referencing `__PERF_MARKS__` bare. (Overlaps the P2 define-drift
finding; called out separately because the fix is a one-liner even if the broader refactor is
deferred.)

#### Proposed solution

Add `__PERF_MARKS__: JSON.stringify(false)` to the Vitest `define` block so all five compile-time
globals are declared in every config, and the `typeof` guard in `perf.ts` becomes
belt-and-suspenders rather than required.

#### Verification

Add a test importing a module that references `__PERF_MARKS__` directly; it should pass without the
guard. `npm run test:unit` stays green.

## Source: Code audit — Native shells (android + ios + fastlane)

### [P2][dead-config] Stray `</content></invoke>` tokens leaked into a shipped Play Store changelog

**File(s):** `fastlane/metadata/android/en-US/changelogs/4.txt:15-18` (fastlane metadata) — pinned
at SHA f934d43

#### Problem

The end of the v4 Android changelog contains leftover tool/markup tokens that were never meant to
ship:

```
• App updates no longer leave stale content.
  </content>
  </invoke>
```

`fastlane supply` uploads these `.txt` files verbatim as the Google Play "What's new" text, so this
release's store listing literally shows `</content>` and `</invoke>` to parents. It is a copy-paste
artifact from an AI/editor session that escaped review. Every other changelog ends cleanly; only
`4.txt` is polluted.

#### Proposed solution

Delete the two trailing lines (`</content>` and `</invoke>`) so the file ends at "…no longer leave
stale content." Add a lightweight guard so this can't recur — e.g. a test or lint step that fails if
any `fastlane/metadata/**/*.txt` contains `<` / `>` markup tokens.

#### Verification

`grep -RnE '</?(content|invoke|parameter)' fastlane/metadata` returns nothing after the fix. Confirm
the changelog reads as clean prose end-to-end.

---

### [P2][single-source-of-truth] The app id `art.splotch.app` is hardcoded in six+ native files

**File(s):** `capacitor.config.json:2`, `android/app/build.gradle:12,25`,
`android/app/src/main/res/values/strings.xml:5-6`, `ios/App/App.xcodeproj/project.pbxproj:320,341`
(native identity) — pinned at SHA f934d43

#### Problem

The bundle identifier is repeated as a literal string in at least six places with no single source:

* `capacitor.config.json` → `"appId": "art.splotch.app"`
* `android/app/build.gradle` → `namespace = "art.splotch.app"` **and**
  `applicationId
  "art.splotch.app"`
* `android/app/src/main/res/values/strings.xml` → `package_name` **and** `custom_url_scheme`, both
  `art.splotch.app`
* `ios/.../project.pbxproj` → `PRODUCT_BUNDLE_IDENTIFIER = art.splotch.app` (Debug **and** Release)

`capacitor.config.json` already declares `appId`, which is conceptually the source of truth, yet the
native files each repeat the literal rather than deriving it. A rename (or a build-variant suffix
like `.dev`) requires a coordinated edit across three languages, and there is no test asserting the
copies agree. Note `strings.xml` even repeats it twice for two different keys.

#### Proposed solution

At minimum, document the canonical location (`capacitor.config.json.appId`) and add a check (a
Vitest/asset-pipeline assertion or a `scripts/` guard) that all native copies equal it. Where the
build system allows, derive instead of duplicate — e.g. Android `namespace`/`applicationId` can
share a single `ext` value, and `strings.xml`'s `package_name`/`custom_url_scheme` can be generated.

#### Verification

Grep the tree for `art.splotch.app`; every occurrence should trace back to one declared value or be
covered by an equality assertion. Change the id in one place in a scratch branch and confirm the
guard flags the drift.

---

### [P2][dead-config] Capacitor template smoke-tests assert the wrong package and would fail if run

**File(s):**
`android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java:24`,
`android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java:12-18` (Android tests) —
pinned at SHA f934d43

#### Problem

Both files are unmodified Capacitor scaffolding left in the app package `com.getcapacitor.myapp`
(not `art.splotch.app`). `ExampleUnitTest` only asserts `2 + 2 == 4`. `ExampleInstrumentedTest`
asserts:

```java
assertEquals("com.getcapacitor.app", appContext.getPackageName());
```

The real package is `art.splotch.app`, so this instrumented test is guaranteed to **fail** if it is
ever executed — it is stale boilerplate that only survives because the native test tasks aren't run
in CI (the repo's testing strategy uses Maestro smoke tests instead — see the `testing` skill).
Their presence is misleading: a newcomer running `./gradlew test`/`connectedCheck` gets a red build
from dead sample code, and the wrong `com.getcapacitor.myapp` package clutters `git grep`.

#### Proposed solution

Delete both `ExampleUnitTest.java` and `ExampleInstrumentedTest.java` (and the empty
`com/getcapacitor/myapp` dirs). If any native JVM test is genuinely wanted, add a real one under
`art/splotch/app` asserting the correct package id.

#### Verification

`git rm` the files; `./gradlew :app:testDebugUnitTest` still succeeds (nothing to run) and no source
references `com.getcapacitor.myapp`.

---

### [P3][dead-config] google-services / Firebase scaffolding is wired up but the app has no push

**File(s):** `android/build.gradle:11`, `android/app/build.gradle:70-77` (Android Gradle) — pinned
at SHA f934d43

#### Problem

The root build script adds the Google Services classpath:

```groovy
classpath 'com.google.gms:google-services:4.4.4'
```

and the app script conditionally applies the plugin, logging about push notifications:

```groovy
try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, ... Push Notifications won't work")
}
```

Splotch is an offline-first, privacy-first kids' app: there is **no** push plugin in the Capacitor
plugin set (secure-storage, media, device, filesystem, haptics, network, preferences,
screen-orientation, status-bar), no `google-services.json` (not tracked, not in `.gitignore`'s
active list), and no messaging permission in the manifest. This is dead Capacitor template
scaffolding that pulls in a Google dependency and implies a push capability the app deliberately
doesn't have — a real concern for a Families-policy app whose data posture is scrutinized.

#### Proposed solution

Remove the `com.google.gms:google-services` classpath from `android/build.gradle` and the
`google-services.json` try/apply block from `android/app/build.gradle`. If push is ever added, wire
it back deliberately (and document it in the `mobile` skill's compliance checklist).

#### Verification

`grep -rin 'google.services\|google-services\|firebase' android` returns nothing; a release build
(`bundleRelease`) still succeeds.

---

### [P3][dead-config] iOS requires the obsolete `armv7` capability on a 64-bit-only (iOS 16.4) app

**File(s):** `ios/App/App/Info.plist:35-38` (iOS Info.plist) — pinned at SHA f934d43

#### Problem

```xml
<key>UIRequiredDeviceCapabilities</key>
<array>
    <string>armv7</string>
</array>
```

`armv7` is the 32-bit ARM instruction set. The project's `IPHONEOS_DEPLOYMENT_TARGET` is `16.4`
(pbxproj) and SPM `platforms: [.iOS(.v16)]`; iOS 11+ dropped all 32-bit devices, so every device
that can install this app is `arm64`. Requiring `armv7` is stale template cruft — at best a no-op,
at worst it advertises a false capability. It should read `arm64` (or the key should be omitted).

#### Proposed solution

Change the required capability from `armv7` to `arm64`, or remove the `UIRequiredDeviceCapabilities`
key entirely (the deployment target already constrains eligible devices).

#### Verification

Archive/validate the app; App Store Connect accepts the build and device eligibility is unchanged
(arm64-only).

---

### [P3][dead-config] pbxproj injects a `COCOAPODS` compile flag, but the project uses SPM not CocoaPods

**File(s):** `ios/App/App.xcodeproj/project.pbxproj:319` (Xcode build settings) — pinned at SHA
f934d43

#### Problem

The Debug config sets:

```
OTHER_SWIFT_FLAGS = "$(inherited) \"-D\" \"COCOAPODS\" \"-DDEBUG\"";
```

The `-DCOCOAPODS` conditional-compilation flag is a CocoaPods artifact, but this project migrated to
Swift Package Manager (the `mobile`/`ios` guidance explicitly says "SPM not CocoaPods", `.gitignore`
ignores `App/Pods`, and dependencies come from `CapApp-SPM/Package.swift`). Any `#if COCOAPODS`
branch in a dependency would now compile down the wrong (Pods) path in Debug, and the flag misleads
anyone reading the build settings into thinking Pods are in play.

#### Proposed solution

Drop the `\"-D\" \"COCOAPODS\"` tokens from `OTHER_SWIFT_FLAGS` (leaving
`"$(inherited) \"-DDEBUG\""`, or just `$(inherited)` since
`SWIFT_ACTIVE_COMPILATION_CONDITIONS =
DEBUG` already defines DEBUG).

#### Verification

Clean-build the Debug scheme; it compiles with no CocoaPods define.
`grep COCOAPODS
ios/App/App.xcodeproj/project.pbxproj` returns nothing.

---

### [P3][consistency] PencilEraserPlugin comment claims iOS 15 deployment target; it is actually 16.4

**File(s):** `ios/App/App/PencilEraserPlugin.swift:27-28` (iOS plugin) — pinned at SHA f934d43

#### Problem

```swift
// The classic delegate callback is the only one available down to iOS 15 (the project's
// deployment target); it still fires on newer iPadOS, so we always interpret a tap as
```

The project's deployment target is **16.4** (`IPHONEOS_DEPLOYMENT_TARGET = 16.4` in all four pbxproj
configs; `Package.swift` pins `.iOS(.v16)`). The comment's "(the project's deployment target)" is
factually wrong and, since the newer `preferredTapAction` API is available from iOS 16, the stated
rationale for using only the classic callback no longer holds as written. A future contributor
trusting this comment could make the wrong availability decision.

#### Proposed solution

Correct the parenthetical to iOS 16.4 (or remove the "project's deployment target" clause) and, if
the classic callback is still deliberately preferred over `preferredTapAction`, restate the actual
reason (it fires reliably regardless of the user's system tap-action preference — which the next
sentence already says).

#### Verification

Confirm against the pbxproj/Package.swift target; the comment's version matches the real deployment
target.

---

### [P3][dead-config] Unused `AppTheme.NoActionBar` style

**File(s):** `android/app/src/main/res/values/styles.xml:12-16` (Android theme) — pinned at SHA
f934d43

#### Problem

`styles.xml` defines three themes: `AppTheme`, `AppTheme.NoActionBar`, and
`AppTheme.NoActionBarLaunch`. The manifest only references `@style/AppTheme` (application) and
`@style/AppTheme.NoActionBarLaunch` (activity). `AppTheme.NoActionBar` is never referenced anywhere
in the tree — leftover Capacitor template boilerplate.

```xml
<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
    ...
</style>
```

Dead resource that invites confusion about which theme is "the" app theme.

#### Proposed solution

Remove the `AppTheme.NoActionBar` style block (verify no `res/` or manifest reference first).

#### Verification

`grep -rn 'NoActionBar\b' android/app/src` shows only `NoActionBarLaunch` remains; the app builds
and looks identical.

---

### [P3][dead-config] Unused `activity_main.xml` layout — BridgeActivity never inflates it

**File(s):** `android/app/src/main/res/layout/activity_main.xml:1-12` (Android layout) — pinned at
SHA f934d43

#### Problem

This layout defines a `CoordinatorLayout` wrapping a bare `<WebView/>`:

```xml
<androidx.coordinatorlayout.widget.CoordinatorLayout ...>
    <WebView android:layout_width="match_parent" android:layout_height="match_parent" />
</androidx.coordinatorlayout.widget.CoordinatorLayout>
```

`MainActivity extends BridgeActivity`, which builds and manages its own Capacitor `WebView` in code
and never calls `setContentView(R.layout.activity_main)`. The layout is unused Capacitor template
scaffolding. Its presence is the only reason the `androidx.coordinatorlayout` dependency in
`app/build.gradle:59` appears "used", so it also masks a possibly-removable dependency.

#### Proposed solution

Delete `activity_main.xml`. Check whether `androidx.coordinatorlayout:coordinatorlayout` is then
still needed (Capacitor's bridge layout may pull it transitively); if not, drop that
`implementation` line and its `variables.gradle` version entry.

#### Verification

Build and launch on device — the canvas renders unchanged.
`grep -rn 'activity_main\|R.layout'
android/app/src` returns nothing.

---

### [P3][duplication] Android changelog 5 and the iOS release notes are byte-identical, maintained by hand in two files

**File(s):** `fastlane/metadata/android/en-US/changelogs/5.txt`,
`fastlane/metadata/en-US/release_notes.txt` (fastlane metadata) — pinned at SHA f934d43

#### Problem

`changelogs/5.txt` (Android) and `en-US/release_notes.txt` (iOS) contain the exact same "What's new"
copy for the current release, but live in two separate files with no shared source. The next release
requires editing both by hand and keeping them in sync; the `4.txt` markup-leak bug above shows how
easily one copy drifts or gets corrupted without the other noticing. There is no note explaining the
relationship or which file is authoritative.

#### Proposed solution

Either generate the per-platform files from one source (e.g. the `release` skill/script writes both
from a single release-notes input), or document in the fastlane metadata dir that the current
release's Android `N.txt` and iOS `release_notes.txt` must match, backed by an equality check.

#### Verification

`diff fastlane/metadata/android/en-US/changelogs/5.txt fastlane/metadata/en-US/release_notes.txt` is
empty and stays empty via generation or a guard.

---

### [P3][single-source-of-truth] Version (`5` / `1.3.0`) duplicated across gradle and four pbxproj settings with no in-file pointer

**File(s):** `android/app/build.gradle:28-29`,
`ios/App/App.xcodeproj/project.pbxproj:311,318,333,340` (native version) — pinned at SHA f934d43

#### Problem

`versionCode 5` / `versionName "1.3.0"` (Android) are mirrored by `CURRENT_PROJECT_VERSION = 5` and
`MARKETING_VERSION = 1.3.0` in **both** the Debug and Release pbxproj configs (four literals). The
`android/CLAUDE.md` notes these are set by `capacitor-set-version` during `npm run release`, so the
source of truth is really `package.json`, but none of the native files say so — a contributor
opening `build.gradle` or the pbxproj sees a hand-editable literal with no breadcrumb, and the
`android/CLAUDE.md` warning ("Don't hand-edit versionCode/versionName") has no iOS counterpart in
the `mobile`/`ios` guidance.

#### Proposed solution

Add a short comment at each native version literal pointing to the canonical source and the
`capacitor-set-version` flow (or reference it from the `ios` skill as the `android` one does). The
two duplicated pbxproj configs could also be hoisted into an `.xcconfig` so `MARKETING_VERSION`/
`CURRENT_PROJECT_VERSION` are declared once instead of per-config.

#### Verification

Run `npm run release` in a scratch branch; confirm all four pbxproj values and the two gradle values
move together, and that the new comments/pointers match reality.

---

### [P4][documentation] `android:allowBackup="true"` is unexplained for a privacy-first kids app

**File(s):** `android/app/src/main/AndroidManifest.xml:4` (Android manifest) — pinned at SHA f934d43

#### Problem

```xml
android:allowBackup="true"
```

This is the template default and is the one manifest attribute with a real privacy dimension:
`allowBackup=true` lets Android Auto Backup copy the app's data (including anything the
secure-storage / preferences plugins persist) to the user's Google account. Every other manifest
entry here carries a rationale comment (INTERNET, ACCESS_NETWORK_STATE, WRITE_EXTERNAL_STORAGE), but
this security-relevant flag has none. For a Families-policy app, whether child-created content and
any stored state should leave the device is a deliberate decision, not a default to inherit
silently.

#### Proposed solution

Decide intentionally and document it: either keep `allowBackup="true"` with a comment stating that
only non-sensitive local drawing state is backed up, or set it to `false` (and/or add
`fullBackupContent`/`dataExtractionRules`) if child content should never leave the device. Note the
choice in the `mobile` skill's kids-compliance checklist.

#### Verification

Manifest reflects an explicit, commented decision; if changed to `false`, `adb backup` produces no
app data.

---

### [P4][maintainability] FileProvider paths expose entire external + cache roots with template names

**File(s):** `android/app/src/main/res/xml/file_paths.xml:2-5` (Android FileProvider) — pinned at
SHA f934d43

#### Problem

```xml
<external-path name="my_images" path="." />
<cache-path name="my_cache_images" path="." />
```

`path="."` grants the FileProvider access to the **whole** external-files root and the **whole**
cache dir, and the entry names (`my_images`, `my_cache_images`) are unmodified Capacitor sample
names. Scoping a content provider to the entire root is broader than a "save one screenshot to the
gallery" flow needs, and the generic names give no hint of what actually shares files. This is the
provider referenced by `AndroidManifest.xml:23-29`.

#### Proposed solution

Narrow the shared paths to the specific subdirectory the media/filesystem export uses (e.g. a
`shared_images/` subpath) and rename the entries to something descriptive (`shared_drawings`). If
the wide scope is genuinely required by `@capacitor-community/media`, add a comment saying so.

#### Verification

Save-to-gallery / share still works on device; the provider no longer exposes unrelated files.

---

### [P4][duplication] The DeviceLock "Parent Center" rationale comment is duplicated verbatim across Java and Swift

**File(s):** `android/app/src/main/java/art/splotch/app/DeviceLockPlugin.java:12-15`,
`ios/App/App/DeviceLockPlugin.swift:5-6` (native plugins) — pinned at SHA f934d43

#### Problem

Both plugins carry the same hand-maintained sentence explaining the feature ("Surfaces whether …
lock is … engaged so the Parent Center can confirm the lock is on (green check) and swap its
'enable' steps for 'unpin'/'exit' steps."). The shared user-facing behavior lives in two
implementation comments that must be edited in lockstep to stay accurate; there is no single place
that documents the DeviceLock contract (JS name `DeviceLock`, method `isLocked` → `{locked}`).

#### Proposed solution

Document the cross-platform DeviceLock contract once — in the web-side plugin interface/TypeScript
definition that calls `DeviceLock.isLocked()`, or in the `mobile`/`architecture` skill — and reduce
the two native comments to a pointer plus platform-specific notes (Android lock-task state vs. iOS
Guided Access).

#### Verification

The behavioral description exists in exactly one canonical location; the native files reference it.

---

### [P4][dead-config] `AppDelegate.swift` is wall-to-wall empty template lifecycle stubs

**File(s):** `ios/App/App/AppDelegate.swift:14-34` (iOS app delegate) — pinned at SHA f934d43

#### Problem

Five lifecycle methods (`applicationWillResignActive`, `applicationDidEnterBackground`,
`applicationWillEnterForeground`, `applicationDidBecomeActive`, `applicationWillTerminate`) have
empty bodies containing only the stock Apple template prose ("Sent when the application is about to
move from active to inactive state… Games should use this method to pause the game."). None of it
applies to Splotch, and the noise buries the two methods that *do* carry real logic (`open url` and
the `supportedInterfaceOrientationsFor` override at lines 42-60). A reader has to wade through
boiler comments to find the one intentional customization.

#### Proposed solution

Delete the empty stub methods and their template comments (they are optional protocol methods; the
default behavior is identical). Keep `didFinishLaunchingWithOptions`, the
`open url`/`continue
userActivity` proxies, and the orientation override with its existing
explanatory comment.

#### Verification

Build and run on device — background/foreground/rotation behavior is unchanged; the file now shows
only methods that do something.

---

### [P4][maintainability] App-local iOS plugins were added via hand-crafted sequential pbxproj UUIDs

**File(s):** `ios/App/App.xcodeproj/project.pbxproj:14-16,28-30,168-170` (Xcode project) — pinned at
SHA f934d43

#### Problem

The three app-local Swift sources (`DeviceLockPlugin`, `MainViewController`, `PencilEraserPlugin`)
were registered by hand-editing the pbxproj with obviously synthetic, sequential object IDs:

```
DE1CE10C0000000000000001 /* DeviceLockPlugin.swift in Sources */ ...
DE1CE10C0000000000000005 /* MainViewController.swift in Sources */ ...
DE1CE10C0000000000000007 /* PencilEraserPlugin.swift in Sources */ ...
```

Xcode normally emits random 24-hex UUIDs; these zero-padded counters signal a manual/scripted edit.
That's workable but fragile: it isn't obvious to a newcomer that these files are wired in by hand
(not by Xcode's UI or `cap sync`), and a future `cap` project regeneration could clobber them
silently. There's no comment or doc noting that these three files must be re-added if the project is
regenerated.

#### Proposed solution

Add a short note (in the `ios` skill or a comment where the plugins are registered in
`MainViewController.swift`) stating that these app-local sources are wired into the pbxproj by hand
and must be re-added after any Capacitor project regeneration. Optionally regenerate the refs
through Xcode so they carry normal UUIDs.

#### Verification

The manual-wiring caveat is documented where a contributor regenerating the iOS project would see
it; a fresh checkout still builds all three sources into the App target.

---

### [P4][consistency] `Info.plist` `CAPACITOR_DEBUG` resolves to empty in Release with no explanation

**File(s):** `ios/App/App/Info.plist:5-6`, `ios/debug.xcconfig:1`,
`ios/App/App.xcodeproj/project.pbxproj:307,199` (iOS config) — pinned at SHA f934d43

#### Problem

`Info.plist` embeds `<key>CAPACITOR_DEBUG</key><string>$(CAPACITOR_DEBUG)</string>`. The
`CAPACITOR_DEBUG = true` value comes from `debug.xcconfig`, which is set as the
`baseConfigurationReference` **only** on the two Debug configs (pbxproj lines 199 and 307). The
Release configs have no base xcconfig, so `$(CAPACITOR_DEBUG)` expands to an empty string in shipped
builds. That is almost certainly intended (debug flag off in Release), but nothing states it, and
the asymmetry (xcconfig wired to Debug only) is easy to misread as a mistake or to break by
"helpfully" adding the base config to Release.

#### Proposed solution

Add a one-line comment in `debug.xcconfig` (or the `ios` skill) explaining that `CAPACITOR_DEBUG` is
deliberately Debug-only and expands empty in Release, so the intent is discoverable.

#### Verification

Archive a Release build and confirm `CAPACITOR_DEBUG` is empty; the documented intent matches
behavior.

---

### [P5][documentation] `ExportOptions.plist` lacks a pointer to who consumes it and when teamID matters

**File(s):** `ios/App/ExportOptions.plist:11-15` (iOS export config) — pinned at SHA f934d43

#### Problem

The file carries a commented-out `teamID` block with decent inline guidance, but nothing says which
command consumes `ExportOptions.plist` (`xcodebuild -exportArchive` / the `build` skill's IPA lane)
or that `method = app-store-connect` requires an authenticated App Store Connect session. A newcomer
finds a bare plist with no breadcrumb to the release flow it belongs to. The commented `teamID` also
duplicates a value that, if ever needed, would then live here *and* in signing config.

#### Proposed solution

Add a leading comment naming the consumer (the export/archive step in the `build`/`release` tooling)
and linking to the `mobile`/`ios` release checklist, so the plist is self-locating.

#### Verification

The plist header points a reader to the release lane; no behavior change.

---

### [P5][naming] Example-test package `com.getcapacitor.myapp` misrepresents ownership

**File(s):** `android/app/src/androidTest/java/com/getcapacitor/myapp/`,
`android/app/src/test/java/com/getcapacitor/myapp/` (Android test packages) — pinned at SHA f934d43

#### Problem

Even setting aside that these tests are dead (see the P2 finding), the directory/package name
`com.getcapacitor.myapp` places project files under the Capacitor framework's namespace rather than
`art.splotch.app`. It's inconsistent with every other source file in the app and pollutes package
search. This is subsumed by the delete recommended above, but flagged separately in case any native
test is retained rather than removed.

#### Proposed solution

If any native test survives cleanup, move it to `art/splotch/app` so test code shares the app's
package namespace.

#### Verification

No tracked source or test lives under `com/getcapacitor/` after cleanup.

## Source: Code audit — .claude / .codex config (hooks, rules, settings)

### [P2][dead-config] Overly broad allow rules grant destructive commands without a prompt

**File(s):** `.claude/settings.json:48,59,54,62-64` (permissions.allow) — pinned at SHA f934d43

#### Problem

Several allow-list entries are read-only in intent but permit destructive or file-writing operations
with no confirmation:

```json
"Bash(git rm *)",     // line 48 — deletes tracked files, no prompt
"Bash(sed *)",        // line 59 — `sed -i` rewrites files in place
"Bash(find *)",       // line 54 — `find . -delete` / `-exec rm` deletes
"Bash(curl -s * http://localhost:*)",  // line 62 — the middle `*` matches `-o /path`, letting curl write arbitrary files
```

The surrounding block (lines 50-60) is clearly meant to be the "safe read-only tools" group (`grep`,
`ls`, `cat`, `head`, `tail`, `wc`, `echo`, `jq`), but `sed *`, `find *`, and `git rm *` are filed
alongside them despite each having a well-known destructive mode. `Bash(git rm *)` in particular is
a standalone destructive git command sitting in the git group; the rest of that group (`git status`,
`git log`, `git diff`, `git show`, `git branch`, `git stash list`) is all read-only.

#### Proposed solution

Tighten each to its read-only shape, or drop it from the auto-allow list so the operator confirms:

* Remove `Bash(git rm *)` — deletions should prompt.
* Replace `Bash(sed *)` with the actual usage pattern if any (Claude rarely needs `sed` given
  Edit/Grep tools; consider removing it entirely — the repo convention discourages
  `sed`/`cat`/`echo` in favor of dedicated tools).
* Replace `Bash(find *)` with a narrower form, or remove; `Glob`/`Grep` tools cover discovery.
* Narrow the curl entries to a fixed flag prefix, e.g. `Bash(curl -s http://localhost:*)` and
  `Bash(curl -s -i http://localhost:*)`, so the wildcard can't inject `-o`.

#### Verification

For each entry, in a scratch clone run the destructive form (`git rm README.md`, `sed -i s/a/b/ f`,
`find . -name x -delete`) and confirm Claude currently executes it without a permission prompt;
after tightening, confirm the destructive form now prompts while the intended read-only use still
passes.

---

### [P2][error-handling] `session-start.sh` final `svelte-kit sync` is unguarded under `set -e`, contradicting the hook's best-effort intent

**File(s):** `.claude/hooks/session-start.sh:2,30-33,42` — pinned at SHA f934d43

#### Problem

The hook opens with `set -euo pipefail` (line 2) and deliberately wraps the fragile `npm install`
step in a fallback so a failed lifecycle script "doesn't kill this hook silently, leaving the
session with no deps at all" (lines 25-33). But the final step is bare:

```bash
node scripts/web.mjs svelte-kit sync   # line 42 — no || guard
```

Under `set -e`, if `svelte-kit sync` exits non-zero (e.g. a transient generate failure, or a partial
`node_modules` from the `--ignore-scripts` fallback path just above), the whole SessionStart hook
exits non-zero. That is inconsistent with the philosophy the file itself states two steps earlier,
and with the sibling `.codex/cloud/*.sh` scripts, which `|| warn` every step. A missing
`.svelte-kit` types dir degrades `npm run check`/`dev` but shouldn't abort session startup.

#### Proposed solution

Guard the final command so a failure is surfaced but non-fatal, matching the npm-install treatment:

```bash
node scripts/web.mjs svelte-kit sync \
  || echo "session-start.sh: svelte-kit sync failed — run 'node scripts/web.mjs svelte-kit sync' before 'npm run check'"
```

#### Verification

Temporarily make `scripts/web.mjs` exit non-zero (or point it at a bad subcommand), run
`CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start.sh; echo "exit=$?"`,
and confirm the hook currently exits non-zero; after the fix it prints the warning and exits 0.

---

### [P2][duplication] The npm@11 pin (logic + multi-line rationale) is copy-pasted across four shell files and has already drifted

**File(s):** `.claude/hooks/session-start.sh:12-19`, `.claude/cloud/setup.sh:14-23`,
`.codex/cloud/setup.sh:37-44`, `.codex/cloud/maintenance.sh:29-33` — pinned at SHA f934d43

#### Problem

The same decision — pin npm to 11 because `package-lock.json` is authored by npm 11 and other majors
dirty the tree on optional-peer entries — is re-explained at length in four places, with the command
`npx -y npm@11 install -g npm@11` repeated in three of them. The prose has already drifted:

* `.claude/cloud/setup.sh:15` says "the container image ships npm 10"
* `.codex/cloud/setup.sh:38` says "the Codex image ships npm 11.4.2"
* `session-start.sh:15-19` gives yet a third framing ("npm 10 and 11 disagree on optional-peer
  entries")

Four copies of a rationale means four places to update when the npm story changes, and they are
already telling slightly different stories.

#### Proposed solution

Collapse the rationale to one canonical home (it partly lives in `docs/CLOUD/Claude.md` /
`docs/CLOUD/Codex.md` already) and have each script carry a one-line comment plus a doc pointer
instead of the full paragraph, e.g.
`# Pin npm@11 to match package-lock.json's authoring major — see docs/CLOUD/Codex.md.` The command
itself can't be factored into a shared sourced file (the cloud scripts are pasted into web dialogs
and must be standalone), so keep the command inline but stop duplicating the multi-line explanation.

#### Verification

`grep -rn "optional-peer\|npm@11 install -g npm@11" .claude .codex` currently returns the rationale
in four files; after the change each file has a single-line comment and the long explanation exists
in exactly one doc.

---

### [P2][consistency] Codex `setup.sh` and `maintenance.sh` are ~90% identical and have already diverged in ways that look accidental

**File(s):** `.codex/cloud/setup.sh:46-51`, `.codex/cloud/maintenance.sh:35-40` — pinned at SHA
f934d43

#### Problem

The two Codex scripts share the same header, `warn()` helper, npm pin, `npm ci`, Playwright install,
and `svelte-kit sync` — but the shared steps differ in ways that read as drift, not intent:

* `setup.sh:48` runs `playwright install --with-deps chromium`; `maintenance.sh:37` runs
  `playwright install chromium` (no `--with-deps`). If the OS deps are needed at setup they're
  presumably still needed after a maintenance refresh on a rebuilt container.
* `setup.sh:27-33` runs a Node-version check (`major !== 22 || minor < 12`); `maintenance.sh` has no
  equivalent, so a maintenance run on a bumped image silently skips the guard.

Nothing in the comments explains why maintenance intentionally omits `--with-deps` or the Node
check, so a reader can't tell whether the difference is deliberate.

#### Proposed solution

Either (a) make the shared steps identical unless a divergence is intentional and commented, or (b)
if they must stay separate UI-pasted scripts, add a one-line comment at each divergence stating why
(e.g. "`--with-deps` omitted — maintenance runs on an image that already has the apt deps"). Align
the Playwright flag and decide whether the Node check belongs in both.

#### Verification

`diff <(sed -n '26,60p' .codex/cloud/setup.sh) <(sed -n '26,49p' .codex/cloud/maintenance.sh)` shows
the current divergences; after the fix each remaining difference is either removed or has an
adjacent comment justifying it.

---

### [P3][dead-config] `Bash(node scripts/*)` is fully redundant with `Bash(node scripts/**)`

**File(s):** `.claude/settings.json:37-38` — pinned at SHA f934d43

#### Problem

```json
"Bash(node scripts/*)",
"Bash(node scripts/**)",
```

In gitignore-style matching `**` matches across path separators, so `scripts/**` already matches
everything `scripts/*` does (and more, e.g. `scripts/sub/x.mjs`). The `scripts/*` entry adds
nothing.

#### Proposed solution

Delete line 37; keep only `Bash(node scripts/**)`.

#### Verification

Confirm `node scripts/sub/anything.mjs` is still auto-allowed with only the `**` entry present, and
that removing line 37 changes no observable permission behavior.

---

### [P3][dead-config] `Bash(afplay *)` is a dead (and macOS-only) permission with no consumer in the repo

**File(s):** `.claude/settings.json:72` — pinned at SHA f934d43

#### Problem

`afplay` is macOS's audio player. A repo-wide grep finds it only in `settings.json` — no hook,
skill, script, or `.ruler` source invokes it:

```
$ grep -rn "afplay" .claude .ruler scripts
.claude/settings.json:72:      "Bash(afplay *)",
```

It looks like a leftover from a since-removed notification/Stop-hook sound. It also can't work on
the Linux dev/cloud environments the project supports (ADR-0017). Dead config in the allow list
makes the real, load-bearing entries harder to audit.

#### Proposed solution

Remove line 72. If a completion sound is still wanted, wire it through a Stop hook and a
cross-platform helper (per ADR-0017's "platform tools via Node helpers" rule), then re-add a scoped
permission for that helper.

#### Verification

`grep -rn afplay` returns only `settings.json` today; after removal it returns nothing and no
workflow regresses (nothing invoked it).

---

### [P3][maintenance] `cloud-branch-preview.sh` embeds a dated, mutable "CURRENT MODE" fact that is injected into every cloud session

**File(s):** `.claude/hooks/cloud-branch-preview.sh:24-31` — pinned at SHA f934d43

#### Problem

The heredoc hard-codes a Netlify preview-mode fact with a date:

```
CURRENT MODE: restricted (as of 2026-07-09). Assume a plain `feat/*` push
produces NO live preview.
```

This is exactly the kind of fast-moving operational state that goes stale silently: if the site
flips back to "Full" mode, every cloud session is told the wrong thing until someone remembers this
string lives inside a shell hook (not in a doc, not in config). Embedding a `(as of DATE)` marker in
a script is a smell that the value doesn't belong in the script.

#### Proposed solution

Move the current-mode fact to a single source of truth (a line in `docs/CLOUD/Claude.md`, which the
heredoc already cites) and have the hook reference it rather than restating it, or read it from an
env var set on the cloud environment. At minimum, add a comment reminding editors that the mode
string must be updated here when Netlify config changes.

#### Verification

Confirm the mode currently appears verbatim only in this hook; after the change the authoritative
value lives in one place and the hook points at it.

---

### [P3][duplication] `cloud-branch-preview.sh` restates ~37 lines of the branching/preview convention already in `docs/CLOUD/Claude.md`

**File(s):** `.claude/hooks/cloud-branch-preview.sh:12-49` — pinned at SHA f934d43

#### Problem

The heredoc (lines 13-49) is a full prose walkthrough of the cloud branching workflow, preview
modes, and slug-URL derivation — content that the file itself says lives in `docs/CLOUD/Claude.md`
("See docs/CLOUD/Claude.md", lines 7, 24). Two hand-maintained copies of the same multi-step
procedure will drift; the hook is the copy most likely to go unnoticed when the doc is updated.

#### Proposed solution

Trim the injected text to the actionable essentials the model needs at session start (branch off
`origin/main` as `feat/<feature>`; restricted mode → no preview for plain `feat/*`; how to get a
`feature/*` preview on demand) and defer the full explanation to the doc via a single pointer. Keep
injected context lean — it costs tokens every cloud session.

#### Verification

Compare the heredoc against `docs/CLOUD/Claude.md`'s "Two preview modes" section for overlap; after
trimming, the operational steps exist in one authoritative place with the hook citing it.

---

### [P3][consistency] Claude cloud `setup.sh` uses `#!/bin/bash` while the Codex scripts use `#!/usr/bin/env bash`

**File(s):** `.claude/cloud/setup.sh:1`, `.claude/hooks/*.sh:1`, `.codex/cloud/setup.sh:1`,
`.codex/cloud/maintenance.sh:1` — pinned at SHA f934d43

#### Problem

The `.claude` shell files use `#!/bin/bash`; the `.codex` files use `#!/usr/bin/env bash`. Both are
reasonable, but the split is arbitrary and undocumented. `#!/usr/bin/env bash` is the more portable
choice (macOS ships an ancient `/bin/bash` 3.2; a Homebrew bash lands on PATH), and ADR-0017
requires scripts to run on both macOS and Linux, so the env form is the better house style to
standardize on.

#### Proposed solution

Pick one shebang convention repo-wide for these hand-authored shell scripts (prefer
`#!/usr/bin/env bash`) and apply it to all six files.

#### Verification

`head -1 .claude/hooks/*.sh .claude/cloud/setup.sh .codex/cloud/*.sh` shows a mix today; after the
change all lines match.

---

### [P3][consistency] Claude `setup.sh` swallows every step with `|| echo` but, unlike the Codex scripts, never summarizes what was skipped

**File(s):** `.claude/cloud/setup.sh:22-45` vs `.codex/cloud/setup.sh:14-59` — pinned at SHA f934d43

#### Problem

Both cloud setups are best-effort (`set -uo pipefail`, no `-e`). The Codex scripts accumulate a
`warnings=()` array and print a "finished with N warning(s)" summary at the end (`setup.sh:53-60`),
so a partially-provisioned environment is obvious in the log. The Claude `setup.sh` instead prints a
one-off `echo` at each failing step (lines 23, 35, 44) with no roll-up, so a session that had npm,
Playwright, and chisel all fail scatters three lines through a long log with nothing tying them
together. Two setup scripts solving the same "best-effort with visible failures" problem in two
different shapes is avoidable inconsistency.

#### Proposed solution

Adopt the Codex `warn()`/summary pattern in `.claude/cloud/setup.sh` (or, conversely, agree the
inline-echo style is sufficient and simplify the Codex scripts) so both cloud setups report failures
the same way.

#### Verification

Force all three optional installs to fail and run each setup script; confirm today only Codex emits
a consolidated summary, and after the change both do.

---

### [P3][maintenance] Claude `setup.sh` hard-codes a Playwright fallback version that duplicates `package.json` and diverges from the Codex approach

**File(s):** `.claude/cloud/setup.sh:33-34` — pinned at SHA f934d43

#### Problem

```bash
PW_VERSION="$(node -p "require('./package.json').devDependencies['@playwright/test'].replace(/^[^0-9]*/, '')" 2>/dev/null || true)"
npx --yes "playwright@${PW_VERSION:-1.61.1}" install --with-deps chromium
```

The literal fallback `1.61.1` duplicates the version already pinned in `package.json`
(`"@playwright/test": "^1.61.1"`). When the dependency is bumped, this fallback silently goes stale
— exactly the "hard-coded version drifts silently" failure the comment two lines up warns about. The
Codex scripts avoid the literal entirely by delegating to `node scripts/web.mjs playwright install`,
which resolves the installed version. Two cloud setups derive the Playwright version two different
ways, one of which reintroduces the drift the other eliminates.

#### Proposed solution

Prefer the Codex approach (`node scripts/web.mjs playwright install --with-deps chromium`) so the
version is always the resolved one and no literal exists to drift; or if the explicit
`npx
playwright@<version>` is needed for the CDN allowlist reason, drop the literal fallback and
fail loudly when the version can't be derived rather than pinning a number that will rot.

#### Verification

Bump `@playwright/test` in `package.json` and re-read the script: the derived path stays correct
while the `1.61.1` fallback does not; confirm the chosen fix leaves no literal version to maintain.

---

### [P3][maintenance] The audit-routine cron schedule table can silently drift from the actual Claude Routines with no automated check

**File(s):** `.claude/audit-conventions.md:150-172` — pinned at SHA f934d43

#### Problem

The "Scheduled runs (Claude Routines)" section declares itself "the source of truth for that
automation" and holds a six-row cron table (lines 161-168) plus the instruction "if a routine is
added, retired, or rescheduled, update this table in the same change." But the actual triggers live
in the Routines backend, not in the repo, so nothing enforces that the table matches reality —
unlike the `ruler:check` / `dprint check` gates that guard other generated/formatted content. A
rescheduled or deleted routine leaves this table wrong with no CI signal.

#### Proposed solution

Acknowledge the limitation explicitly (a note that this table is manually mirrored and can drift),
or add a lightweight reconciliation step — e.g. a documented periodic `list_triggers` cross-check,
or folding the cadence into the routines' own definitions so the doc points at them rather than
restating cron strings.

#### Verification

Confirm no script or CI job references this table's cron values; decide on a mirroring note or a
check and confirm the doc no longer claims unenforced "source of truth" status without a caveat.

---

### [P4][documentation] `settings.json` permission groups are unlabeled and unreferenced from any doc

**File(s):** `.claude/settings.json:29-78` — pinned at SHA f934d43

#### Problem

The allow list is visually grouped by blank lines (npm/node, git, read-only tools, curl-localhost,
mobile toolchain, skills, reads) but JSON can't carry comments, so the grouping intent is implicit,
and no doc explains what is auto-allowed or why. CLAUDE.md documents the hooks and rules but says
nothing about the permission policy, so a newcomer wondering "why did that command not prompt?" has
no pointer. The mobile-toolchain group in particular (`adb`, `xcrun simctl`, `xcode-select`,
`xcodebuild`, `pod`, `ruby`, lines 66-72) is non-obvious without the `mobile` skill context.

#### Proposed solution

Add a short "Auto-allowed commands" note to the appropriate doc (e.g. `docs/CONTRIBUTING.md` or a
line in CLAUDE.md's config section) pointing at `.claude/settings.json` and summarizing the intent
of each group, so the policy is discoverable and reviewable. Optionally split truly
environment-specific entries (the Apple-only mobile tools) into `settings.local.json` if they aren't
needed by all contributors.

#### Verification

A newcomer can locate the permission policy from the docs without opening `settings.json` blind;
confirm each group's purpose is stated somewhere in prose.

---

### [P4][dead-config] `node --check` / `node --input-type=module -e` allows have no repo consumer and are undocumented

**File(s):** `.claude/settings.json:39-40` — pinned at SHA f934d43

#### Problem

```json
"Bash(node --check *)",
"Bash(node --input-type=module -e *)",
```

Neither pattern appears in any script, hook, or skill
(`grep -rn "node --check\|input-type=module"
.claude .ruler scripts` returns only `settings.json`).
They're presumably for ad-hoc syntax checks / one-liners Claude runs, which is legitimate, but as
unexplained standalone allows they read like possibly-stale entries. `node --input-type=module -e *`
in particular grants arbitrary module evaluation, which is broad.

#### Proposed solution

If these support a real ad-hoc workflow, keep them but add them to the permission-policy note
proposed above so their purpose is on record; if they're leftovers, remove them. Consider whether
arbitrary `-e` evaluation should be auto-allowed at all.

#### Verification

Confirm no committed tooling depends on these; decide keep-and-document vs. remove and confirm no
workflow regresses.

---

### [P4][documentation] `Read(//tmp/**)` uses non-obvious double-slash absolute-path syntax with no explanation

**File(s):** `.claude/settings.json:77` — pinned at SHA f934d43

#### Problem

```json
"Read(//tmp/**)"
```

The leading `//` is Claude Code's syntax for a filesystem-absolute path (so this grants reads under
`/tmp`, where the session scratchpad lives), but it reads like a typo (`/tmp` double-slashed) to
anyone not steeped in the permission grammar. A reviewer could "fix" it to `/tmp/**` and change its
meaning. It's the only absolute-path entry in the file and carries no context.

#### Proposed solution

Leave the syntax as-is (it's correct) but cover it in the permission-policy doc note, or if the
project prefers, verify whether the intended path is the session scratchpad specifically and scope
it tighter than all of `/tmp`.

#### Verification

Confirm `Read(//tmp/**)` currently permits reading `/tmp/...` files and that `Read(/tmp/**)` would
not (validating the `//` is load-bearing), then ensure the distinction is documented.

---

### [P4][dead-config] `npm install *` auto-allows installing arbitrary packages without a prompt

**File(s):** `.claude/settings.json:31,33-35` — pinned at SHA f934d43

#### Problem

```json
"Bash(npm run *)",
"Bash(npm test*)",
"Bash(npm ci)",
"Bash(npm install)",
"Bash(npm install *)",
```

`Bash(npm install *)` lets any `npm install <pkg>` run with no confirmation — arbitrary package
addition (a supply-chain surface) is auto-approved. Given the repo's careful `dependencies` vs
`devDependencies` policy (ADR-0070) where getting a package's placement wrong breaks the Netlify
deploy, silently auto-installing arbitrary packages is a poor default; a human should at least see
the package name.

#### Proposed solution

Consider dropping `Bash(npm install *)` (keep bare `Bash(npm install)` for lockfile-driven installs
and `Bash(npm ci)`), so adding a new dependency prompts. If unattended installs are needed for the
cloud audit routines, scope them there rather than in the shared allow list.

#### Verification

Confirm `npm install some-package` currently runs without a prompt; after removal confirm it prompts
while `npm install` / `npm ci` still pass.

---

### [P4][documentation] `session-start.sh` and `cloud-branch-preview.sh` aren't discoverable from the primary config/instruction files

**File(s):** `.claude/settings.json:14-27`, `CLAUDE.md` (config section) — pinned at SHA f934d43

#### Problem

CLAUDE.md documents the PostToolUse `format-edited-file.sh` hook by name but never mentions the two
SessionStart hooks. They are described in `docs/CLOUD/Claude.md`, but a contributor reading the main
instructions or `settings.json` has no in-place signal that two scripts run at every session start
(one of which injects a whole workflow prompt into context). The `settings.json` registration is
just two bare command paths (lines 19, 23) with no comment (JSON limitation).

#### Proposed solution

Add a one-line mention of the SessionStart hooks (and their `CLAUDE_CODE_REMOTE` guard) to the
config-overview area that already names `format-edited-file.sh`, pointing at `docs/CLOUD/Claude.md`
for detail, so all three hooks are discoverable from one place.

#### Verification

From CLAUDE.md alone a reader can enumerate all registered hooks and find where each is documented;
confirm the SessionStart pair is now referenced.

---

## Source: Code audit — .github CI workflows

### [P1][consistency] Issue templates apply labels (`bug`, `enhancement`) that don't exist in the declarative taxonomy

**File(s):** `.github/ISSUE_TEMPLATE/bug_report.md:5`, `.github/ISSUE_TEMPLATE/feature_request.md:5`
— pinned at SHA f934d43

#### Problem

`bug_report.md` sets `labels: bug` and `feature_request.md` sets `labels: enhancement`:

```yaml
# bug_report.md
labels: bug
# feature_request.md
labels: enhancement
```

But the single source of truth for labels, `.github/labels.yml`, defines **`type:bug`** and
**`type:feature`** — there is no `bug` or `enhancement` label in the taxonomy (lines 7-30). Since
`label-sync.yml` runs with `skip-delete: true`, GitHub's default `bug`/`enhancement` labels are
never pruned, so every issue opened through these templates lands with an off-taxonomy label. This
directly undermines the automation and skills keyed on `type:*` (`docs/ISSUE-WORKFLOW.md`,
`burn-down-backlog`, `vet-audits`, the `reviewed`→ToDo move) — a bug filed via the template is not
`type:bug`, so `area:*`/`type:*` filtering silently misses it. The `task.md` template (`labels: ''`)
is at least honest about carrying no label, but leaves the same gap.

#### Proposed solution

Change the template front-matter to the real taxonomy labels: `labels: type:bug` and
`labels: type:feature` (multiple allowed, e.g. `type:bug, needs-triage`). Preset `task.md` to
`labels: type:chore`. Optionally add the two GitHub defaults as explicit entries in `labels.yml` and
flip `skip-delete` for a one-time prune — but aligning the templates to `type:*` is the correct fix.

#### Verification

`grep -R "^labels:" .github/ISSUE_TEMPLATE` and confirm every value appears as a `name:` in
`.github/labels.yml`. Open a test issue from each template and confirm the applied label matches the
taxonomy.

---

### [P1][security] Test/deploy/smoke workflows declare no `permissions:` block — they run with the default (write-capable) token

**File(s):** `.github/workflows/test.yml:1-11`, `.github/workflows/android-deploy.yml:10-17`,
`.github/workflows/ios-deploy.yml:11-18`, `.github/workflows/blobs-smoke.yml:14-24` — pinned at SHA
f934d43

#### Problem

`pages.yml` (18-22), `label-sync.yml` (17-18), and `label-to-todo.yml` (9-10) each scope their
`GITHUB_TOKEN` with an explicit `permissions:` block. The four remaining workflows — `test.yml`,
`android-deploy.yml`, `ios-deploy.yml`, `blobs-smoke.yml` — declare **none**, so they inherit the
repository/org default, which for many repos is the legacy read-write token. These workflows run
untrusted PR code (`test.yml` triggers on `pull_request`), download and execute a piped installer
(`curl … | bash` for Maestro), and handle `secrets.ADMIN_ACCESS_TOKEN` (`blobs-smoke.yml`). A
compromised dependency or action step would have write access to contents, issues, and more.

#### Proposed solution

Add a least-privilege top-level `permissions:` block to each. `test.yml`, `android-deploy.yml`, and
`ios-deploy.yml` only need `contents: read`. `blobs-smoke.yml` needs `contents: read`. Set the
default org-wide to read-only as defense in depth. This also makes "what can this workflow touch"
grepable and consistent with the other three workflows.

#### Verification

Every workflow file contains a `permissions:` block;
`grep -L "permissions:" .github/workflows/*.yml` returns nothing. Re-run a PR build to confirm no
step needs a write scope that was removed.

---

### [P2][duplication] The checkout + setup-node@24 + `npm ci` preamble is copy-pasted across five jobs

**File(s):** `.github/workflows/test.yml:18-26` and `:89-97`,
`.github/workflows/android-deploy.yml:27-49`, `.github/workflows/ios-deploy.yml:25-33`,
`.github/workflows/blobs-smoke.yml:34-38` — pinned at SHA f934d43

#### Problem

Six jobs repeat some subset of this identical block:

```yaml
- uses: actions/checkout@v7
- uses: actions/setup-node@v6
  with:
    node-version: 24
    cache: npm
- name: Install dependencies
  run: npm ci
```

Any change (node version, cache strategy, adding `always-auth`, pinning to a SHA) must be edited in
five places and is already drifting (see the node-version and checkout-version findings below).

#### Proposed solution

Extract a composite action, e.g. `.github/actions/setup/action.yml`, that runs checkout +
setup-node + `npm ci`, with an input like `install: true|false` (so `blobs-smoke.yml`, which
deliberately skips `npm ci`, can pass `install: false`). Each job becomes
`- uses: ./.github/actions/setup`. Centralizes the node version and cache config in one file.

#### Verification

`grep -rc "actions/setup-node" .github/workflows` drops to the composite action only; all workflows
still install deps and pass CI.

---

### [P2][versioning] Node version `24` is hard-coded in five places with no single source of truth (and disagrees with the docs)

**File(s):** `.github/workflows/test.yml:22` and `:93`, `.github/workflows/android-deploy.yml:31`,
`.github/workflows/ios-deploy.yml:29`, `.github/workflows/blobs-smoke.yml:38` — pinned at SHA
f934d43

#### Problem

`node-version: 24` is a magic constant repeated five times. There is no `.nvmrc`, and `package.json`
`engines` isn't consulted (`node-version-file:` is unused). Bumping Node means editing five lines
and hoping none is missed. It also **conflicts with the documented floor**: the `testing` skill and
`mobile` skill state "Node ≥ 22" / "Node ≥ 22 … JDK 21", so CI silently runs a version different
from what the docs promise contributors.

#### Proposed solution

Add a `.nvmrc` (or `.node-version`) at the repo root as the single source, and switch every
`setup-node` to `node-version-file: .nvmrc` (folded into the composite action above). Reconcile the
docs to name the exact CI version. Local dev, CI, and docs then read one number.

#### Verification

`grep -rn "node-version" .github/workflows` shows only `node-version-file`; `cat .nvmrc` is the one
place the version lives. `nvm use` in a fresh checkout selects it.

---

### [P2][maintainability] CI rebuilds the debug APK inline instead of calling the committed `android:apk` script

**File(s):** `.github/workflows/android-deploy.yml:55-61` (Build debug APK) — pinned at SHA f934d43

#### Problem

The step reimplements, in inline shell, exactly what an npm script already does:

```yaml
- name: Build debug APK
  run: |
    npm run cap:sync
    cd android
    chmod +x gradlew
    ./gradlew :app:assembleDebug
```

`package.json` defines
`"android:apk": "npm run cap:sync && node scripts/gradle.mjs :app:assembleDebug"`, and
`scripts/gradle.mjs`'s header explicitly exists "to keep the npm scripts free of an inline
`cd android && ./gradlew` shell dance" (ADR-0017). CI bypasses both the script and the helper,
duplicating logic and directly violating the repo convention that the Gradle wrapper is invoked via
a Node helper, never inline `cd android && ./gradlew`. If the build command changes (task name,
extra flags), the script and this workflow drift.

#### Proposed solution

Replace the whole step with `run: npm run android:apk`. If the debug artifact path is needed later,
it is deterministic (`android/app/build/outputs/apk/debug/app-debug.apk`, already referenced at line
77). Drop the manual `chmod +x gradlew` — `gradle.mjs` spawns the wrapper by absolute path.

#### Verification

`npm run android:apk` locally produces the same APK; the tag workflow still installs and smokes it.
`grep -rn "gradlew" .github/workflows` returns nothing.

---

### [P2][consistency] `actions/checkout` pinned to `@v4` in one workflow and `@v7` in every other

**File(s):** `.github/workflows/label-sync.yml:25` (`actions/checkout@v4`) vs
`.github/workflows/test.yml:18`, `android-deploy.yml:27`, `ios-deploy.yml:25`, `blobs-smoke.yml:34`,
`pages.yml:37`, `label-to-todo.yml:34` (all `@v7`) — pinned at SHA f934d43

#### Problem

Six workflows are on `actions/checkout@v7`; `label-sync.yml` alone is stuck on `@v4`. This is stale
drift — nothing about label sync needs the older major. Inconsistent pins make "what version do we
run" un-grepable and mean a security advisory or Node-runtime bump has to be tracked per-file.

#### Proposed solution

Bump `label-sync.yml` to `actions/checkout@v7` (or, better, pin all of them to a single SHA and let
the composite action own it — see the duplication finding). Sweep for any other lagging pins at the
same time.

#### Verification

`grep -rn "actions/checkout@" .github` shows a single version everywhere. Re-run `label-sync` via
`workflow_dispatch` and confirm it still reconciles labels.

---

### [P2][duplication] The Maestro CLI install step is duplicated verbatim between the Android and iOS workflows

**File(s):** `.github/workflows/android-deploy.yml:62-65`, `.github/workflows/ios-deploy.yml:35-38`
— pinned at SHA f934d43

#### Problem

Both workflows contain the identical block:

```yaml
- name: Install Maestro CLI
  run: |
    curl -fsSL "https://get.maestro.mobile.dev" | bash
    echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
```

The `testing` skill even documents a footgun here (`get.maestro.mobile.dev`, not `get.maestro.dev`).
Duplicating a curl-pipe-bash installer across two files means a URL fix or a version pin lands in
one and is forgotten in the other. It's also unpinned — every run installs whatever Maestro is
latest.

#### Proposed solution

Extract to a composite action `.github/actions/install-maestro/action.yml` used by both jobs.
Consider pinning a Maestro version there for reproducibility. This also gives the URL-footgun
comment a single home.

#### Verification

Both tag workflows still run the Maestro smoke; `grep -rn "get.maestro" .github/workflows` returns
nothing (moved into the composite action).

---

### [P2][duplication] The "Upload Maestro report" artifact step is near-identical across the two native workflows

**File(s):** `.github/workflows/android-deploy.yml:82-89`, `.github/workflows/ios-deploy.yml:47-54`
— pinned at SHA f934d43

#### Problem

Both jobs end with the same upload-artifact step; only the artifact `name` (`maestro-report` vs
`maestro-ios-report`) differs. Path (`~/.maestro/tests/`), `retention-days: 7`,
`if-no-files-found: ignore`, and the `if: ${{ !cancelled() }}` guard are duplicated. Drift risk on
retention/path changes.

#### Proposed solution

Fold into the same composite action as the Maestro install (or a dedicated `upload-maestro-report`
composite) taking the artifact name as an input. Retention and path then live once.

#### Verification

Both workflows still upload their report artifact with distinct names; the retention/path values
exist in a single file.

---

### [P2][maintainability] Missing `timeout-minutes` on the two label-automation jobs — a hung `gh api` call runs for the 6-hour default

**File(s):** `.github/workflows/label-sync.yml:22-26` (sync job),
`.github/workflows/label-to-todo.yml:17-31` (move-to-todo job) — pinned at SHA f934d43

#### Problem

Every other job in the repo sets a `timeout-minutes` (test 10/15, android/ios 40, blobs 5, pages 5).
The `sync` job in `label-sync.yml` and the `move-to-todo` job in `label-to-todo.yml` set none, so a
stuck GraphQL call (rate-limit, network hang) in `label-to-todo.sh` or the labeler action can burn
up to the 360-minute default per run, and `label-to-todo` fires on every `issues: labeled` event.

#### Proposed solution

Add `timeout-minutes: 5` (generous for a couple of `gh api` calls) to both jobs. Makes the timeout
convention uniform across all workflows.

#### Verification

`grep -L "timeout-minutes" .github/workflows/*.yml` returns nothing meaningful; force a
`workflow_dispatch` of label-sync and confirm it completes well under the limit.

---

### [P3][security] Third-party actions are pinned to mutable major tags, not commit SHAs

**File(s):** `.github/workflows/android-deploy.yml:68`
(`reactivecircus/android-emulator-runner@v2`), `.github/workflows/label-sync.yml:26`
(`crazy-max/ghaction-github-labeler@v5`), plus every `actions/*@vN` — pinned at SHA f934d43

#### Problem

All actions — first-party (`actions/checkout@v7`, `actions/setup-node@v6`, `actions/cache@v6`,
`actions/upload-artifact@v7`) and third-party (`reactivecircus/android-emulator-runner@v2`,
`crazy-max/ghaction-github-labeler@v5`) — are pinned to floating major-version tags. A tag is
mutable: a compromised or repointed tag executes new code in CI with the workflow's token (see the
missing-`permissions` finding for how much that token can do). Third-party actions like the
emulator-runner and the labeler are the higher-risk cases.

#### Proposed solution

Pin actions to full commit SHAs with a trailing `# vX.Y.Z` comment, and let Dependabot (next
finding) propose bumps. At minimum, SHA-pin the two third-party actions.

#### Verification

`grep -rnE "uses: .+@v[0-9]+$" .github/workflows` returns only first-party actions you consciously
choose to leave on tags; third-party uses show a 40-char SHA.

---

### [P3][dead-config] No `dependabot.yml` — nothing keeps the pinned actions or npm deps updated

**File(s):** `.github/` (absent `dependabot.yml`) — pinned at SHA f934d43

#### Problem

There is no `.github/dependabot.yml`. Combined with the tag-pinned (or, if SHA-pinned, frozen)
actions above and the hand-maintained npm tree, action and dependency updates are entirely manual.
Security patches to `android-emulator-runner`, `checkout`, etc. land only if someone notices.

#### Proposed solution

Add `.github/dependabot.yml` with a `github-actions` ecosystem (weekly) and, if desired, an `npm`
ecosystem scoped to the root `package.json`. Group patch/minor action bumps to keep PR noise down.

#### Verification

File exists and validates; Dependabot opens its first "bump actions" PR on the next scheduled run.

---

### [P3][maintainability] Playwright version is resolved by a brittle inline `node -p` reaching into `package-lock.json` internals

**File(s):** `.github/workflows/test.yml:105-107` (Resolve Playwright version) — pinned at SHA
f934d43

#### Problem

```yaml
run: echo "version=$(node -p "require('./package-lock.json').packages['node_modules/@playwright/test'].version")" >> "$GITHUB_OUTPUT"
```

This nests double-quotes inside a `run:` string, hard-codes the lockfile's internal
`packages['node_modules/…']` key shape (a lockfile-v3 detail that changed across npm majors), and is
the sole consumer of a value used only to build the cache key. Any lockfile-format change or an
added quoting layer breaks it silently (cache key becomes `playwright-…-` with an empty version,
quietly disabling the WebKit-aware cache).

#### Proposed solution

Move the resolution into a committed helper (e.g. `scripts/playwright-version.mjs`) that reads the
installed `@playwright/test/package.json` version and prints it, called as
`node scripts/playwright-version.mjs >> "$GITHUB_OUTPUT"`. Testable and robust to lockfile-format
churn.

#### Verification

`node scripts/playwright-version.mjs` prints the same version the inline expression does; the cache
key in a CI run contains a non-empty version.

---

### [P3][consistency] Android emulator API level is a second source of truth for the `Pixel_7_Pro_API_33` AVD

**File(s):** `.github/workflows/android-deploy.yml:70-74` (`api-level: 33`, `target: google_apis`,
`arch: x86_64`, long `emulator-options` string) — pinned at SHA f934d43

#### Problem

CI hard-codes `api-level: 33` (and `target`/`arch`) in the emulator-runner inputs, while the local
smoke path (`scripts/android-emulator-smoke.mjs`, `scripts/lib/android.mjs`) targets an AVD named
`Pixel_7_Pro_API_33`. The API level "33" now lives in two unrelated places; a bump to API 34 must be
made in both or CI and local diverge. The `emulator-options` value is also a long undocumented magic
string (`-no-snapshot-save -no-window -noaudio -no-boot-anim -camera-back none`) with no named
constant or comment explaining each flag.

#### Proposed solution

Derive the API level from a single source (an env/constant shared with `scripts/lib/android.mjs`, or
at least a workflow `env:` used to interpolate both the runner input and any reference). Add a brief
comment naming why each `emulator-options` flag is present (headless/perf).

#### Verification

Changing the API level in one place updates both CI and local smoke; a comment documents the
emulator flags.

---

### [P3][maintainability] `label-to-todo.sh` caps project items and fields at `first: 100` with no pagination

**File(s):** `.github/scripts/label-to-todo.sh:23` (`projectItems(first: 100)`), `:37`
(`fields(first: 100)`), `:47`? — pinned at SHA f934d43

#### Problem

The GraphQL query fetches the issue's `projectItems(first: 100)` and the project's
`fields(first:
100)` with no pagination. If the issue is already in more than 100 projects
(unlikely) or, more plausibly, the project grows many single-select fields, the `Status` field or
the existing item can fall outside the first page and the script will silently "add it now"
(line 118) as a duplicate or fail to find the field. It's a latent correctness edge on an otherwise
careful script.

#### Proposed solution

For a single-owner project this is low-risk, so at minimum add a comment documenting the 100-item
assumption. If robustness matters, page the `fields` connection or query the field by name directly.

#### Verification

Confirm the target project has <100 fields; add a comment or paginate. Trigger the `reviewed` label
on a test issue and confirm it moves to ToDo.

---

### [P3][consistency] Concurrency control is applied unevenly — only two of seven workflows declare a group

**File(s):** `.github/workflows/test.yml:8-10` (cancel), `pages.yml:24-26` (no-cancel),
`label-to-todo.yml:12-14` (cancel); absent in `android-deploy.yml`, `ios-deploy.yml`,
`blobs-smoke.yml`, `label-sync.yml` — pinned at SHA f934d43

#### Problem

`test`, `pages`, and `label-to-todo` set `concurrency`; the other four don't. `label-sync.yml` can
double-run if two `labels.yml` pushes land close together (two labelers racing the same label set),
and `blobs-smoke` can run overlapping instances across rapid `deployment_status` events. There's no
documented rationale for which workflows opt in.

#### Proposed solution

Add a `concurrency` group to `label-sync` (`group: label-sync`, `cancel-in-progress: false` — don't
cancel a partial reconcile) and to `blobs-smoke` keyed on the deploy URL. Leave the tag-triggered
native smokes without cancel (each tag is a distinct release). Add a one-line comment on each
explaining the cancel/no-cancel choice, mirroring `pages.yml`'s existing comment.

#### Verification

Each workflow either has a `concurrency` block with a rationale comment or is intentionally exempt;
two quick label pushes no longer run two overlapping `label-sync` jobs.

---

### [P4][duplication] The `chromium webkit` browser list is repeated across the two Playwright install steps

**File(s):** `.github/workflows/test.yml:122` (install `chromium webkit`), `:128` (install-deps
`chromium webkit`) — pinned at SHA f934d43

#### Problem

```yaml
- run: npx playwright install --with-deps chromium webkit   # cache miss
- run: npx playwright install-deps chromium webkit           # cache hit
```

The browser set `chromium webkit` is hard-coded in two mutually-exclusive steps. Adding a browser
(e.g. firefox) or dropping WebKit means editing both, and the cache-key comment on line 118 is a
third place that encodes the same WebKit assumption. Easy to update one and desync coverage.

#### Proposed solution

Hoist the browser list into a job-level `env: PW_BROWSERS: "chromium webkit"` and reference
`${{ env.PW_BROWSERS }}` in both steps, so the set is defined once. (Or collapse the two steps —
`install-deps` on a cache hit and `install --with-deps` on a miss — behind a small script.)

#### Verification

`grep -c "chromium webkit" .github/workflows/test.yml` drops to one definition; CI still installs
and runs both browser projects with `REQUIRE_WEBKIT: 1`.

---

### [P4][maintainability] `ALLOWED_TOKENS_LIST` hard-codes retry-indexed values tightly coupled to `retries: 2` in a different file

**File(s):** `.github/workflows/test.yml:143` — pinned at SHA f934d43

#### Problem

```yaml
ALLOWED_TOKENS_LIST: daycare-club,daycare-club-retry1,daycare-club-retry2
```

The `-retry1`/`-retry2` suffixes exist solely because `web/playwright.config.ts` sets `retries: 2`
in CI (one token per attempt, per the comment). This is an invisible cross-file coupling: bump
retries to 3 and the burst spec's third attempt has no allowlisted token, producing a confusing
rate-limit failure with no signal pointing back here. The magic list lives in a workflow env, far
from the config that dictates its length.

#### Proposed solution

Derive the token list from the retry count in one place — e.g. generate it in `playwright.config.ts`
(or a shared constant the spec and config both read) so the list length tracks `retries`
automatically, or add a comment at the `retries` definition pointing at this env. At minimum,
cross-reference both sides so a future retry bump updates the token list.

#### Verification

Changing `retries` in `playwright.config.ts` no longer requires a manual edit here (or a
lint/comment flags the coupling); the rate-limit burst spec passes on every retry attempt.

---

### [P4][consistency] `upload-artifact` steps disagree on `if-no-files-found` handling

**File(s):** `.github/workflows/test.yml:151-157` (no `if-no-files-found`) vs
`android-deploy.yml:82-89` and `ios-deploy.yml:47-54` (`if-no-files-found: ignore`) — pinned at SHA
f934d43

#### Problem

The Playwright report upload omits `if-no-files-found`, so it defaults to `warn` and emits an
annotation when `web/playwright-report/` is empty (e.g. a build that failed before Playwright ran).
The two Maestro uploads set `if-no-files-found: ignore`. No stated reason for the difference — it's
just inconsistency that produces noisy warnings on some failed runs.

#### Proposed solution

Decide one policy. A missing Playwright report on a passing-up-to-that-point run is worth a warning,
so `warn` may be intentional — if so, add a comment. Otherwise set all three to the same value.

#### Verification

All three `upload-artifact` steps set `if-no-files-found` explicitly (or a comment explains the
default); a run that produces no report doesn't emit an unexplained warning.

---

### [P4][naming] Redundant workflow/job naming: workflow "Tests" contains a job named "Tests"

**File(s):** `.github/workflows/test.yml:1` (`name: Tests`), `:84-85` (job `test`, `name: Tests`) —
pinned at SHA f934d43

#### Problem

The workflow is named `Tests` and its second job is also displayed as `Tests`, so the GitHub checks
list shows `Tests / Tests` alongside `Tests / Quality`. The `test.yml` file actually runs a
`quality` gate (type-check, lint, format, SVG/ruler/token/asset/scrapbook drift, `npm audit`) plus
the test suites — the filename and workflow name undersell that it's the whole push/PR gate.
`Tests / Tests` is a poor, un-scannable check name.

#### Problem grepability

Someone searching required-status-check config for "the CI gate" sees `Tests / Quality` and
`Tests / Tests` and can't tell what the second covers (unit + asset + E2E + driver smoke).

#### Proposed solution

Rename the second job's display name to something distinct (`Unit & E2E`, `Test suites`), or rename
the workflow to `CI` so the checks read `CI / Quality` and `CI / Tests`. Keep the filename or rename
to `ci.yml` for grepability.

#### Verification

The GitHub checks list shows two distinctly-named jobs; branch-protection required checks still
resolve.

---

### [P5][dead-config] `label-sync` comment references toggling `dry-run` that is already off

**File(s):** `.github/workflows/label-sync.yml:7-8` and `:28-30` — pinned at SHA f934d43

#### Problem

The header comment says "flip dry-run off / skip-delete as needed for a full sync," but the workflow
already sets `dry-run: false` (line 29). The comment describes a state that doesn't match the
config, so a reader has to reconcile "flip it off" against "it's already off." Minor staleness on an
otherwise well-documented file.

#### Proposed solution

Reword to reflect reality: dry-run is off (it does apply changes); the knob left conservative is
`skip-delete: true` (won't prune hand-made labels) — flip that to `false` for a full reconcile.

#### Verification

The comment matches the actual `dry-run`/`skip-delete` values.

---

### [P5][consistency] Repo owner casing is inconsistent across `.github` URLs (`kylemit` vs `KyleMit`)

**File(s):** `.github/ISSUE_TEMPLATE/config.yml:7` (`github.com/kylemit/splotch/...`),
`.github/workflows/pages.yml:3` (`kylemit.github.io/Splotch/`),
`.github/workflows/label-to-todo.yml:24` and `:26` (`KyleMit`) — pinned at SHA f934d43

#### Problem

The owner is written `kylemit` in the issue-template contact link and the Pages comment, but
`KyleMit` in `label-to-todo.yml` (both the comment URL and `PROJECT_OWNER: KyleMit`). GitHub
redirects are case-insensitive so nothing breaks, but the inconsistency is a papercut and, for
`PROJECT_OWNER`, the GraphQL `repositoryOwner(login:)` lookup is a value that should match the
canonical casing exactly to avoid a surprise if lookups ever tighten.

#### Proposed solution

Pick the canonical casing (the account displays as `KyleMit`) and normalize all `.github` references
to it, including the `config.yml` contact link and the `pages.yml` comment.

#### Verification

`grep -rin "kylemit" .github` shows one consistent casing; the `label-to-todo` GraphQL owner lookup
still resolves.

---

### [P5][maintainability] Issue templates use legacy Markdown format instead of validated Issue Forms

**File(s):** `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md`, `task.md` — pinned at SHA
f934d43

#### Problem

All three templates are the old Markdown-with-front-matter format. Their prompts (Steps to
Reproduce, Device Information, checkboxes) are free text a reporter can delete wholesale, so nothing
is enforced — combined with the P1 label mismatch, an issue can arrive with no structure and a wrong
label. GitHub Issue Forms (`.yml`) enforce required fields, dropdowns (e.g. device OS, target-user),
and reliably-applied labels.

#### Proposed solution

Convert to Issue Forms (`bug_report.yml`, `feature_request.yml`) with `required:` fields and
`labels:` set to the correct `type:*` taxonomy values. This solves the P1 label bug and the
structure gap together. Keep `task.md`/`blank` for free-form chores if desired.

#### Verification

Opening a bug via the form requires the key fields and applies `type:bug`; `config.yml`
`blank_issues_enabled` still allows an escape hatch.

---

## Summary

23 findings. The two P1s are correctness/security: issue templates apply labels outside the
declarative taxonomy (mislabeling every templated bug/feature and defeating `type:*` automation),
and four workflows run with an unscoped default token. The P2 cluster is the classic CI-hygiene set
— one duplicated checkout/setup/`npm ci` preamble to extract into a composite action, a hard-coded
Node `24` in five places (that disagrees with the docs), CI rebuilding the APK inline instead of
calling `npm run android:apk` (violating the ADR-0017 gradle-helper convention), a stray
`checkout@v4`, duplicated Maestro install/upload steps, and missing timeouts on the label jobs. The
tail covers supply-chain pinning (SHA pins + a missing `dependabot.yml`), brittle inline `node -p`
lockfile parsing, and assorted consistency papercuts.

## Source: Code audit — scrapbook · run-artifact code

### [P2][duplication] Hub `CATEGORIES` registry + per-category page counts duplicate the generator's source of truth with no drift guard

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:182-191`, `:220` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

The hub hardcodes the full category list and page counts:

```js
var CATEGORIES = [
  { id: 'farm', name: 'Farm', pages: 6 },
  { id: 'dinosaur', name: 'Dinosaurs', pages: 6 },
  ...{ id: 'vehicles', name: 'Vehicles', pages: 6 },
];
```

and renders `'Category ' + (i + 1) + ' of ' + CATEGORIES.length + ' · ' + cat.pages + ' pages'`
(line 220). Every value here is a copy of state that actually lives in the proof-sheet generator
(`tools/asset-gen/bin/gen-coloring-book-proof-sheet.mjs`) and in the sibling `*.html` sheets.
Nothing keeps them in lockstep:

* `npm run scrapbook:check` only verifies each *collection dir* resolves to one entry page
  (`collectionsMissingEntry`) and that the top-level `index.html` is fresh — it never looks inside
  the hub. Adding a new category sheet (e.g. a future `bugs.html`) leaves the hub silently omitting
  it; the sheet is reachable by URL but invisible in the tab strip.
* A page-count change (say `farm` drops from 6 to 5 pages) makes the "· 6 pages" label lie, with no
  test to catch it.

This is the single highest-drift spot in the whole section: it is the only committed page with a
hardcoded mirror of generator data and no automated reconciliation.

#### Proposed solution

Prefer eliminating the copy: have the proof-sheet generator (or a small `scrapbook:index`-adjacent
step) emit the `CATEGORIES` array — or the whole hub — from the same manifest it uses to build the
sheets, so id/name/pages have one source. If the hub must stay hand-authored, add a check (extend
`scrapbook:check`) that (a) every `coloring-book-proof-sheets/*.html` sheet except `index.html`
appears as a `CATEGORIES` entry and vice-versa, and (b) each `pages` value matches the sheet's
actual page count. At minimum, drop the `pages` field if it can't be verified — a wrong count is
worse than no count.

#### Verification

Add a ninth category sheet without editing the hub and confirm today it does not appear in the tabs
and no check fails; after the fix, either the tab appears automatically or `scrapbook:check` fails
with a clear message. For the count: edit a sheet's page count and confirm the guard flags the stale
`pages` value.

---

### [P3][correctness] Deep-linking via `hashchange` (or back/forward) leaves `document.title` stale

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:214-229`, `:240` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

`show(i, skipHash)` updates the tab title only inside the non-skip branch:

```js
if (!skipHash) {
  if (location.hash.replace(/^#/, '') !== cat.id) location.hash = cat.id;
  document.title = 'Splotch proof sheets — ' + cat.name; // only here
}
```

The `hashchange` listener calls `show(indexFromHash(), true)` (line 240) with `skipHash = true`, so
navigating by editing the URL hash, or using browser back/forward between categories, swaps the
iframe but never updates `document.title`. The visible page changes while the tab caption stays on
whatever category was last selected by click. The bug exists because the flag conflates two
unrelated concerns (see next finding).

#### Proposed solution

Move `document.title = …` out of the `if (!skipHash)` block so it runs on every category switch
regardless of how it was triggered. Keep only the `location.hash` write gated by the flag.

#### Verification

Load the hub, click "Farm", then edit the URL to `#space` (or press Back). Observe the tab title
stays "…Farm" before the fix; after moving the assignment out, the title tracks the shown category
on every path.

---

### [P4][readability] `skipHash` boolean is a control-flag that silently gates two behaviours

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:214-229` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The parameter is named for one job (skip writing the hash) but the `if (!skipHash)` block also owns
the `document.title` update. A reader reasonably assumes `skipHash` only suppresses the URL write,
which is exactly how the stale-title bug (previous finding) slipped in. Bundling "should I write the
hash?" and "should I update the title?" under one negated flag is a classic control-coupling smell.

#### Proposed solution

Split the concerns: always update the iframe, tab state, and title; take a separate,
positively-named argument (e.g. `writeHash = true`) that governs only the `location.hash`
assignment. The two callers that pass `true` today (`hashchange`) become `writeHash = false`.

#### Verification

Re-read `show()`: each side effect should be unconditional except the hash write. Confirm both
callers still behave (click writes hash; hashchange does not re-write it and loop).

---

### [P4][correctness] Initial load rewrites the URL to `#farm` and pushes a history entry

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:226`, `:242` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

On first load with no hash, `show(indexFromHash())` runs with `indexFromHash()` returning `0`, and
because `skipHash` is falsy it executes `location.hash = cat.id` (line 226) since `'' !== 'farm'`.
So opening the bare hub URL immediately mutates the address bar to `…/index.html#farm` and, because
assigning `location.hash` creates a new history entry, adds a spurious Back-button stop before the
page the user actually arrived from. The shareable/canonical URL a visitor copies also silently
gains a `#farm` they didn't choose.

#### Proposed solution

For the canonicalisation-on-load case use `history.replaceState(null, '', '#' + cat.id)` instead of
assigning `location.hash`, so the hash is normalised without a new history entry. (User-initiated
tab clicks can keep pushing entries if per-category back/forward is desired — that's a deliberate
choice to make explicitly.)

#### Verification

Open the hub from another page, then press Back: today it returns to `#farm`-less state (an extra
stop) rather than the previous page. After the fix, Back leaves the hub directly.

---

### [P3][maintainability] Hub palette renames the shared chrome tokens, defeating the "keep in sync by eye" note

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:8-43` (hand-authored hub) — pinned at
SHA f934d43

#### Problem

The hub opens with a comment promising the palette is "Kept in sync by eye with the shared scrapbook
chrome (scripts/lib/scrapbook-chrome.mjs)". But it then declares the tokens under *different names*
than the chrome uses — `--fg`/`--bg`/`--bar`/`--line`/`--tab-bg`/`--tab-fg` here vs
`--ink`/`--paper`/`--card-2`/`--hair` in the generated pages (e.g. `scrapbook/index.html:12-13`,
`crayon-brush-samples/index.html:11-13`). A maintainer trying to reconcile the two blocks after a
chrome change can't diff them line-for-line; they must first mentally map `--fg` ↔ `--ink`, `--bar`
↔ `--card-2`, etc. The renamed vocabulary makes the one sync mechanism the file relies on (human
eyeballing) maximally error-prone.

#### Proposed solution

Adopt the chrome's exact token names in the hub so the two `:root` blocks are copy-comparable (or a
future extraction can literally share them). Where the hub genuinely needs extra tokens (`--tab-bg`,
`--tab-fg`), keep those but layer them on top of the shared names rather than substituting the core
ones.

#### Verification

Diff the hub's `:root` light block against the shared chrome's after the rename — the shared subset
should match token-name-for-token-name, so a drift is a visible diff.

---

### [P4][duplication] Hub re-implements the masthead/crayon-strip/breadcrumb chrome by hand

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:150-173` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The `<header>` block hand-copies the crayon-strip brand, the `Splotch / Scrapbook` wordmark, and the
breadcrumb that `scripts/lib/scrapbook-chrome.mjs` generates for every other page. The README even
concedes it "carries the shared crayon masthead + breadcrumb by hand; keep it in sync". This is real
structural duplication (distinct from the token duplication above): a change to the generated chrome
(a new brand element, a different crumb separator) leaves this page visually diverged with no guard.

#### Proposed solution

Since the hub is intentionally hand-authored (an iframe switcher the generator doesn't produce), the
cleanest fix is to have `scrapbook-chrome.mjs` expose its masthead/breadcrumb fragment as a reusable
export and generate the hub's shell (injecting the hand-authored tab strip + iframe + script) rather
than hand-writing the chrome. If full generation is too much, at least factor the chrome HTML into a
shared string both the generator and a tiny hub-build step consume.

#### Verification

Change the generated masthead (e.g. crumb separator) and confirm the hub does not follow today;
after the fix the hub inherits the change (or a check flags the divergence).

---

### [P3][discoverability] README omits the `crayon-brush-samples` collection and how it's regenerated

**File(s):** `scrapbook/README.md` (whole file; cf. the icons paragraph at `:66-71`) — pinned at SHA
f934d43

#### Problem

The README's "Live URLs" section calls out how to regenerate the coloring-book proof sheets, the
icon gallery, and the model-eval report, but never mentions the `crayon-brush-samples/` collection —
even though it is a committed top-level collection with its own generators
(`tools/asset-gen/crayon-brush-samples/build-sheet.mjs` → `index.html`, `build-compare-sheet.mjs` →
`vs-current.html`). A newcomer who opens `scrapbook/crayon-brush-samples/` in the tree has, unlike
every other collection, no in-`scrapbook` pointer to what produced it or how to refresh it.

#### Proposed solution

Add a short paragraph alongside the icons/coloring entries: what `crayon-brush-samples/` is, its
live URL (`…/crayon-brush-samples/`), and that `index.html`/`vs-current.html` are built by the
`tools/asset-gen/crayon-brush-samples/` scripts (link to that dir's README). Keep it symmetric with
the existing collection blurbs.

#### Verification

Grep `scrapbook/README.md` for `crayon-brush-samples` — currently zero hits; after the fix the
collection is documented like the others.

---

### [P3][discoverability] README warns about masthead sync but not the hub's category-registry maintenance step

**File(s):** `scrapbook/README.md:61-65` — pinned at SHA f934d43

#### Problem

The README tells maintainers the coloring hub `index.html` is a keeper that must be kept "in sync"
with the chrome masthead/breadcrumb by hand. It does *not* mention the more consequential manual
step: adding or removing a proof-sheet category requires editing the hub's `CATEGORIES` array (and
its `pages` count) or the new sheet is invisible in the hub (see the P2 finding). The one piece of
the hub most likely to need editing is the one the docs are silent on.

#### Proposed solution

Extend the existing hub note to state that adding/renaming/removing a category means editing the
`CATEGORIES` array in `coloring-book-proof-sheets/index.html` (and its `pages` count), until/unless
that array is generated. Pair this with whatever guard the P2 finding lands on.

#### Verification

The README's coloring-hub paragraph should name `CATEGORIES` as a hand-maintained list; confirm a
reader adding a category is told to edit it.

---

### [P4][accessibility] Tab UI is built from bare `<button>`s with no tab ARIA semantics

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:168-177`, `:199-206` (hand-authored
hub) — pinned at SHA f934d43

#### Problem

The hub implements a genuine tablist — mutually-exclusive `.on` state, ←/→ arrow navigation, a
switched iframe — but with no assistive semantics: `<div class="tabs">` is not `role="tablist"`, the
generated buttons are not `role="tab"` and never set `aria-selected`, and the `<iframe id="sheet">`
is not `role="tabpanel"` associated to the active tab. Screen-reader users get eight unlabelled
toggle buttons and an untied frame instead of a coherent tab widget.

#### Proposed solution

Add `role="tablist"` to the `.tabs` container, `role="tab"` + `aria-selected` (toggled alongside the
`.on` class in `show()`) to each button, and wire the iframe as the panel (`role="tabpanel"` +
`aria-labelledby`). This is a reference/keeper page so the bar is low, but the tab pattern is
already there — the semantics are cheap to finish.

#### Verification

Run an a11y checker (axe) against the hub, or tab through with a screen reader: the tab strip should
announce as a tablist with a selected tab.

---

### [P4][naming] Inconsistent element-variable suffixing (`frame` vs `tabsEl`/`countEl`)

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:193-196` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

```js
var tabsEl = document.getElementById('tabs');
var frame = document.getElementById('sheet');
var countEl = document.getElementById('count');
```

Two of the three cached elements use the `…El` suffix convention; the middle one (`frame`, for the
element with `id="sheet"`) does not, and its variable name (`frame`) doesn't match its id (`sheet`)
either. Small, but it's the kind of inconsistency that makes a reader hunt.

#### Proposed solution

Pick one convention. Either `sheetEl`/`tabsEl`/`countEl` (matching ids + suffix) or drop the suffix
uniformly. Align the variable name with the element id.

#### Verification

Read lines 193-196: the three cached-element names should follow one visible rule.

---

### [P5][readability] Hub script uses ES5 `var` + function expressions despite a modern-only target

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:178-243` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The entire `<script>` is written in ES5 style — `var` bindings, `function () {}` callbacks
throughout. The scrapbook is self-contained modern HTML served to current browsers (the repo's
`docs/COMPATIBILITY.md` floor is well past ES5), and the rest of the codebase is `const`/`let` +
arrow functions. There is no build/transpile step here, so the dated style is a pure readability
drag with no compatibility upside, and it's inconsistent with how a contributor would expect Splotch
JS to read.

#### Proposed solution

Modernise in place: `const`/`let`, arrow callbacks, template literals for the count string.
Behaviour is unchanged; the diff is mechanical. Low priority — it works as-is.

#### Verification

Load the hub after the rewrite and exercise tabs, arrows, and hash deep-links; behaviour identical,
source reads in the house style.

## Source: Code audit — Root config (package.json, dprint, tsconfig, …)

### [P2][dead-config] dprint loads the TypeScript and JSON plugins but never runs them

**File(s):** `dprint.json:10-13,23-27` (formatting) — pinned at SHA f934d43

#### Problem

`dprint.json` loads three plugins and configures a TypeScript block:

```json
"typescript": { "quoteStyle": "preferSingle" },
"includes": ["**/*.md"],
...
"plugins": [
  "node_modules/@dprint/markdown/plugin.wasm",
  "node_modules/@dprint/typescript/plugin.wasm",
  "node_modules/@dprint/json/plugin.wasm"
],
```

`includes` matches only `**/*.md`. dprint only formats a file when it is in `includes` *and* a
plugin claims its extension — so with markdown the sole included glob, the `@dprint/typescript` and
`@dprint/json` plugins (and the `typescript.quoteStyle` config block) never execute. `format:md`
(`dprint fmt`) and `format:md:check` (`dprint check`) touch only markdown. The two extra WASM
plugins are dead weight: they are downloaded/cached, listed as `devDependencies` (`@dprint/json`,
`@dprint/typescript` at `package.json:252-254`), and mislead a reader into thinking dprint owns
`.ts`/`.json` formatting when Prettier owns `.ts` and *nothing* owns `.json`.

#### Proposed solution

Either (a) delete the `@dprint/typescript` + `@dprint/json` plugin lines, the `typescript` config
block, and their two `devDependencies`, to make dprint honestly markdown-only (matches ADR-0057); or
(b) if JSON formatting is actually wanted, add `**/*.json` to `includes` and wire `format:md` into
`format` accordingly — but that overlaps Prettier/`.prettierignore` and should be an explicit
decision, not latent config. Option (a) is the low-risk default.

#### Verification

`grep -c '\.ts' <(git ls-files '*.md')` — no TS files are markdown, confirming the plugin is
unreachable. After removing, run `npm run format:md:check` and confirm identical output. Confirm no
other tool references `@dprint/json`/`@dprint/typescript`: `git grep dprint/json dprint/typescript`.

---

### [P2][dead-config] No formatter owns JSON/YAML — config files drift unchecked

**File(s):** `.prettierignore:26-29`, `dprint.json:13` (formatting) — pinned at SHA f934d43

#### Problem

`.prettierignore` deliberately excludes the config formats:

```
# Deliberately out of Prettier scope for now — remove these to bring configs into the check
*.json
*.yml
*.yaml
*.webmanifest
```

and dprint's `includes` is `["**/*.md"]` only (see the previous finding), so *no* formatter and *no*
CI check owns `package.json`, `tsconfig`s, `.vscode/*.json`, `netlify.toml`-adjacent YAML, GitHub
workflow YAML, or the webmanifest. These files — including this very `package.json` with its 117
hand-maintained script rows — can drift in indentation/key style with zero enforcement, and the
loaded-but-unused `@dprint/json` plugin makes it look like coverage exists when it doesn't.

#### Proposed solution

Decide and wire one owner for JSON/YAML: simplest is to drop `*.json`/`*.yml`/`*.yaml`/
`*.webmanifest` from `.prettierignore` (Prettier already handles all four) and let `format:check`
cover them; or add `**/*.json` etc. to `dprint.json` `includes` and use the already-loaded JSON
plugin. Whichever is chosen, delete the other's dead config so there is a single, discoverable
owner.

#### Verification

`npx prettier --check '**/*.json'` (or `dprint check` after adding the glob) currently either errors
on the ignore or reports "0 files"; after the fix it should lint the real config tree. Add a
deliberately mis-indented key to a JSON file and confirm the chosen check now fails.

---

### [P2][dead-config] `.markdownlint.json` is orphaned and duplicates dprint's markdown style

**File(s):** `.markdownlint.json:1-11`, `dprint.json:4-9` (formatting) — pinned at SHA f934d43

#### Problem

`.markdownlint.json` configures a markdownlint ruleset (asterisk bullets, asterisk emphasis, fenced
code, `---` HR, etc.). But ADR-0057 made **dprint the sole markdown owner**, and nothing consumes
this file: `markdownlint` is not a dependency, not in any `scripts`/`scripts-info` entry, and not in
`.vscode/extensions.json` recommendations (`dprint.dprint`, `esbenp.prettier-vscode`,
`svelte.svelte-vscode`). The only repo reference to markdownlint is inside ADR-0057 itself. Worse,
its rules **restate** dprint's config with no cross-reference — `MD004 asterisk` ↔
`unorderedListKind: "asterisks"`, `MD049 asterisk` ↔ `emphasisKind: "asterisks"` — a second source
of truth for the same markdown style that a future edit to `dprint.json` will silently desync from.

#### Proposed solution

Delete `.markdownlint.json`. dprint already enforces the identical style via `format:md:check` in
CI. If interactive lint-in-editor is still wanted, add the markdownlint extension to
`.vscode/extensions.json` and keep the file — but then document the dprint/markdownlint style
coupling in one place. Deletion is the ADR-0057-consistent default.

#### Verification

`git grep -l markdownlint -- ':!package-lock.json' ':!.markdownlint.json'` returns only
`docs/adrs/0057-*.md` — proving no tool reads it. After deletion, `npm run format:md:check` still
passes.

---

### [P2][duplication] `--experimental-strip-types --disable-warning=ExperimentalWarning` repeated 10× and likely stale

**File(s):** `package.json:20,25,72,73,76,77,78,85,86,91` (scripts) — pinned at SHA f934d43

#### Problem

Ten scripts invoke Node with the identical verbose flag pair, e.g.:

```json
"build:cap": "CAPACITOR=true node scripts/web.mjs vite build && node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/strip-native-assets.mjs",
"gen:tokens": "node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/gen-tokens.mjs",
```

Two problems: (1) the 60-character flag string is copy-pasted verbatim ten times — any change (or a
typo in one) must be reconciled by hand; (2) it is likely **stale**. `engines.node` is `">=22.13"`
(`package.json:6`); Node stabilized type-stripping so that `--experimental-strip-types` became the
default (and the flag a deprecated no-op emitting its own warning) from 22.18 / 23.6 onward. On a
modern Node in the supported range the whole pair is redundant, and `--disable-warning` exists only
to silence a warning the flag itself triggers.

#### Proposed solution

Either drop both flags (verify on the project's Node floor that `node scripts/gen-tokens.mjs` strips
types without them), or, if the floor must keep them, factor a single helper — e.g.
`scripts/run-ts.mjs` that re-execs Node with the flags, or a package-level shell alias — so the flag
string lives in exactly one place. Update `engines.node` to the version where the decision holds.

#### Verification

On the CI Node version: `node scripts/gen-tokens.mjs --check` (no flags) — if it runs, the flags are
dead. `grep -c 'experimental-strip-types' package.json` should drop from 10 to 0 (or to 1 in a
shared helper).

---

### [P3][duplication] Browser-support floor is duplicated between `browserslist` and vite `build.target`

**File(s):** `package.json:304-310`, `web/vite.config.ts:77` (build config) — pinned at SHA f934d43

#### Problem

The root `package.json` declares:

```json
"browserslist": [ "chrome >= 111", "edge >= 111", "firefox >= 114", "safari >= 16.4", "ios_saf >= 16.4" ]
```

and `web/vite.config.ts:77` hard-codes the same floor as
`build: { target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'] }`, with a comment
"Keep in sync with `browserslist` in the root package.json". Two hand-synced sources of truth for
the same five-browser floor. It is also unclear what actually *consumes* the `browserslist` field:
vite compiles against `build.target`, not browserslist, so the array may be feeding only
`update:browserslist`/caniuse-lite and otherwise be inert — a reader can't tell whether editing it
changes any output.

#### Proposed solution

Make one the source of truth. Simplest: keep `browserslist` as the single declaration and have
`vite.config.ts` derive `build.target` from it (e.g. via `browserslist-to-esbuild`), or, if vite's
`build.target` is the real control, delete the `browserslist` field and the `update:browserslist`
script and document the floor once in `docs/COMPATIBILITY.md` + `vite.config.ts`. Either way, remove
the "keep in sync by hand" coupling.

#### Verification

Change one browser version in the chosen source and rebuild; confirm the emitted bundle's
syntax-lowering target moved (e.g. inspect for `??`/optional-chaining lowering). Confirm the other
file no longer needs a manual edit.

---

### [P3][duplication] Four ignore lists re-encode the same excluded paths with no shared source

**File(s):** `eslint.config.js:13-23`, `.prettierignore:1-14`, `dprint.json:14-22`, `.gitignore`
(config) — pinned at SHA f934d43

#### Problem

The generated/vendored dirs are enumerated independently in every config:

* `eslint.config.js:13-23`: `.svelte-kit`, `build`, `.netlify`, `node_modules`, `android/`, `ios/`,
  `scrapbook/`, `web/src/lib/components/icon-names.d.ts`, `web/src/lib/releases.json`
* `.prettierignore:1-14`: the same set plus `package-lock.json`, `tokens.css`, `*-snapshots/`, …
* `dprint.json:14-22`: `node_modules`, `.svelte-kit`, `.netlify`, `.gradle`, `web/build`,
  `android/**/build`, `ios/**/build`

Adding a new generated artifact (or renaming `icon-names.d.ts`/`releases.json`) requires editing
three or four files, and they already disagree in ways a newcomer can't distinguish from bugs
(`eslint` ignores all of `android/`, dprint ignores only `android/**/build` because it must still
format generated `android/**/*.md` — but nothing says so).

#### Proposed solution

Can't fully share across tools with different config languages, but reduce the surface: add a short
comment in each list pointing to the others ("generated-path ignores also live in `.prettierignore`
/ `dprint.json`"), and align the glob *style* (see the consistency finding). For the two
project-specific generated files (`icon-names.d.ts`, `releases.json`), consider co-locating them
under a single ignored dir so one glob covers both everywhere.

#### Verification

`git grep -n 'icon-names.d.ts'` shows it hard-coded in both `eslint.config.js` and `.prettierignore`
— renaming it today silently breaks one. After co-location, a single glob per tool should cover it.

---

### [P3][dead-config] `.gitignore` is padded with generic-template entries for tools this repo never uses

**File(s):** `.gitignore:42-137` (config) — pinned at SHA f934d43

#### Problem

Roughly 60 lines are boilerplate from the standard Node `.gitignore` for frameworks/tools absent
from this SvelteKit + Capacitor project: `.grunt` (42), `bower_components` (46), `.lock-wscript`
(49), `jspm_packages/` (56), `web_modules/` (59), `.next`/`out` (92-93), `.nuxt`/`dist` (95-97),
Gatsby `.cache/` (100), `.vuepress/dist` (106), `**/.vitepress/*` (116-119), `.docusaurus` (122),
`.serverless/` (125), `.fusebox/` (128), `.dynamodb/` (131), `.firebase/` (133), `.tern-port` (137),
`.vscode-test` (140), the entire `.yarn/*` block (143-149). None correspond to a tool in
`package.json`. The noise buries the ~30 lines that are actually project-specific and load-bearing
(the Playwright/perf/redteam/coloring-samples/maestro anchored ignores), hurting grepability.

#### Proposed solution

Prune the unused framework blocks, keeping only entries that match tools actually in use (Vite,
SvelteKit, Playwright, Netlify, Capacitor, dprint, the project's own scratch dirs). Keep the
generic-but-cheap safety nets (`*.log`, `.env*`, `.DS_Store`, `node_modules/`, `coverage`).

#### Verification

For each removed entry, `git grep` the tool name in `package.json` returns nothing (e.g. `grunt`,
`bower`, `nuxt`, `docusaurus`, `fusebox`). `git status` is unchanged after pruning (nothing that was
being ignored is now surfaced).

---

### [P3][duplication] `.cache` is ignored three times in `.gitignore`

**File(s):** `.gitignore:88,100,110` (config) — pinned at SHA f934d43

#### Problem

`.cache` / `.cache/` appears three times — line 88 (parcel-bundler block), line 100 (Gatsby block),
line 110 (vuepress-v2 block) — all ignoring the same path with different trailing-slash forms. Pure
redundancy that compounds the template-bloat problem above.

#### Proposed solution

Collapse to a single `.cache/` entry (folded into the prune of the previous finding).

#### Verification

`grep -n '^\.cache' .gitignore` currently prints three lines; after the fix, one.

---

### [P3][maintainability] Personal device identifiers are hard-coded into committed scripts

**File(s):** `package.json:106,113,114` (scripts) — pinned at SHA f934d43

#### Problem

Three scripts embed one developer's specific hardware:

```json
"android:run:device": "... ANDROID_SERIAL=R5CY128YMGF node scripts/gradle.mjs :app:installDebug",
"ios:run:emulator":   "... cap run ios --target C6012C49-AA93-4869-B3A6-E47C9EAAC567",
"ios:run:device":     "... cap run ios --target 00008103-0006202E3CF1001E",
```

and the `scripts-info` describes them as the physical "SM-S938U1" phone and "Kyle's iPad". These
serials/UDIDs are meaningless (and non-functional) for any other contributor or CI, yet they sit in
the shared `package.json`. They are effectively personal config committed to the repo.

#### Proposed solution

Read the target from an env var with the current value as a documented fallback, e.g.
`ANDROID_SERIAL=${ANDROID_SERIAL:-R5CY128YMGF}` is not portable inline — instead have the Node
helper (`scripts/gradle.mjs` / a wrapper) accept `--target`/`ANDROID_SERIAL` from the environment
and drop the literals from `package.json`, or move the device-specific variants into a gitignored
local overrides file. At minimum, document in `scripts-info` that these are placeholders to replace
with `adb:devices` / `xcrun simctl list` output (already partially noted for Android).

#### Verification

On a machine without those devices, `npm run ios:run:device` fails with "device not found" — proving
the literal is dead for everyone but one person. After the fix it should resolve from env or error
with a clear "set TARGET_DEVICE" message.

---

### [P3][duplication] AVD name `Pixel_7_Pro_API_33` is hard-coded across four scripts

**File(s):** `package.json:101,102,103,219` (scripts) — pinned at SHA f934d43

#### Problem

The emulator/AVD name is repeated verbatim in `android:boot` (`emulator -avd Pixel_7_Pro_API_33`),
`android:emulator` (`cap run android --target Pixel_7_Pro_API_33`), `android:live`
(`--target Pixel_7_Pro_API_33`), and described in `android:setup`'s `scripts-info` (line 219). The
matching "API 33" system image lives in `scripts/android-setup.mjs`. Renaming the AVD or bumping the
API level touches four+ places with no single constant.

#### Proposed solution

Define the AVD name once — an env default resolved in a Node helper
(`scripts/android-emulator-*.mjs` already exist) or a single constant those scripts read — and
reference it from the `android:*` scripts. Keep the human-readable form in `scripts-info` only.

#### Verification

`grep -c Pixel_7_Pro_API_33 package.json` returns 3 (plus prose); after centralizing it should be 0
in the executable commands.

---

### [P3][documentation] `overrides.tar` pin has no rationale, unlike every other config in the repo

**File(s):** `package.json:298-303` (dependencies) — pinned at SHA f934d43

#### Problem

```json
"overrides": {
  "@capacitor/assets": { "sharp": "$sharp" },
  "tar": "^7.5.19"
},
```

The `sharp: "$sharp"` override is self-explaining (dedupe @capacitor/assets onto the project's
sharp). The `"tar": "^7.5.19"` override has no comment — a reader can't tell whether it is a
security advisory pin, a compatibility workaround, or stale cruft, nor when it can be removed. This
is conspicuous next to `netlify.toml`, which comments nearly every directive. Un-annotated
transitive pins are exactly the config that rots (the advisory gets fixed upstream, the pin lingers
forever).

#### Proposed solution

Add a one-line comment (JSON5 not available in `package.json`, so use a sibling `overrides` note in
the CONTRIBUTING/ADR or a `// tar:` convention isn't possible in strict JSON — instead record the
reason in a short comment in `docs/` or the commit and reference the advisory ID / issue number in
`scripts-info`-adjacent docs). Practically: document the CVE/reason and a removal condition wherever
dependency decisions are tracked, and periodically re-check whether the transitive floor already
satisfies it so the override can be dropped.

#### Verification

`npm ls tar` shows what depends on it and at what version; if the depended-on range already resolves
to `>=7.5.19` without the override, the pin is removable — prove by deleting it and re-running
`npm ci && npm ls tar`.

---

### [P3][dependency-split] `@capacitor/filesystem` appears unused — no JS import anywhere

**File(s):** `package.json:279` (dependencies) — pinned at SHA f934d43

#### Problem

Every Capacitor plugin in `dependencies` is imported from `web/src` (verified) — except
`@capacitor/filesystem`, which has **zero** JS references. Its only repo mentions are the generated
native registrations (`android/capacitor.settings.gradle`, `ios/App/CapApp-SPM/Package.swift`) and
`package.json` itself. A Capacitor plugin that is installed but never called from JS ships in the
native binaries yet does nothing, and — under the inverted-split rule (ADR-0070: `dependencies` =
what the Netlify web build imports) — it doesn't belong in `dependencies` either, since the web
build never bundles it.

#### Proposed solution

Confirm no dynamic import or peer requirement (e.g. `@capacitor-community/media` needing it) then
remove `@capacitor/filesystem`, `cap sync`, and re-run the native smoke test. If a peer/native need
surfaces, document why it is present-but-unimported.

#### Verification

`git grep "@capacitor/filesystem" -- ':!package-lock.json' ':!*.md'` returns only native config +
`package.json` (confirmed). `npm ls @capacitor/filesystem` shows whether anything depends on it
transitively; if it's a leaf with no JS import, it is dead. Remove it and confirm
`npm run test:android:device` still passes.

---

### [P3][maintainability] Dev/preview port numbers are magic values scattered across scripts and configs

**File(s):** `package.json:16,47,103,115,121` (scripts) — pinned at SHA f934d43

#### Problem

The dev port `5173` is hard-coded in `dev:kill` (`kill-port 5173 8888`), `android:live`
(`--port 5173`), `ios:live` (`--port 5173`), `adb:reverse` (`tcp:5173 tcp:5173`); the netlify-dev
port `8888` in `dev:kill`; and the perf-preview port `4173` in `perf:serve`. There is no single
declaration — a contributor changing the vite dev port (set in `web/vite.config.ts`) must hunt down
and update several unrelated scripts, and `dev:kill` will silently kill the wrong port.

#### Proposed solution

Where the port is a vite concern, it already lives in `web/vite.config.ts`; have the port-dependent
Node helpers (`cloud-tunnel.mjs`, the smoke scripts) read it rather than restating literals in
`package.json`. For `dev:kill`, derive the port list from the same source. At minimum, add a comment
in `scripts-info` noting `5173`/`8888`/`4173` are the vite / netlify-dev / perf-preview ports so the
mapping is discoverable.

#### Verification

Change the vite dev port and run `npm run dev` + `npm run dev:kill`; today the kill misses the new
port. After centralizing, both track the config.

---

### [P4][consistency] No `.editorconfig`; indent width `2` and print width `100` are restated in three files

**File(s):** `.prettierrc.json:3,6`, `dprint.json:1-2`, `.vscode/settings.json:4` (config) — pinned
at SHA f934d43

#### Problem

The same two formatting constants live in three places with three vocabularies: `.prettierrc.json`
(`tabWidth: 2`, `printWidth: 100`), `dprint.json` (`indentWidth: 2`, `lineWidth: 100`),
`.vscode/settings.json` (`editor.tabSize: 2` for markdown). There is no `.editorconfig`, so any
editor without the Prettier/dprint extensions gets no indentation guidance, and the `100`/`2` magic
numbers must be kept in lockstep by hand across formatter configs.

#### Proposed solution

Add a root `.editorconfig` (`indent_size = 2`, `max_line_length = 100`, `charset = utf-8`,
`insert_final_newline = true`) as the editor-agnostic source, and reference it in a comment from the
formatter configs. This doesn't remove the per-tool settings (each formatter needs its own) but
gives one canonical statement and covers editors without extensions.

#### Verification

Open a source file in a bare editor (no plugins) and confirm 2-space indent is applied from
`.editorconfig`. Confirm `100`/`2` still agree across `.prettierrc.json` and `dprint.json`.

---

### [P4][consistency] No `.nvmrc` / `.node-version` despite an `engines.node` floor

**File(s):** `package.json:5-7` (config) — pinned at SHA f934d43

#### Problem

`engines.node` is `">=22.13"`, and several scripts depend on version-specific behavior (the
`--experimental-strip-types` flags). But there is no `.nvmrc` or `.node-version` at the root, so
`nvm use` / `fnm`/`asdf`/Volta pick nothing up and contributors + tooling can silently run a
different major than CI. Given the strip-types staleness risk (separate finding), pinning the Node
version a contributor should use is load-bearing here, not cosmetic.

#### Proposed solution

Add a `.nvmrc` (or `.node-version`) pinning the exact supported Node line (e.g. the CI version).
Keep `engines.node` as the enforced floor and the version file as the "use this" hint.

#### Verification

`nvm use` in a fresh clone currently errors ("No .nvmrc file found"); after adding the file it
selects the pinned version. Confirm it matches whatever Node the CI/GitHub-Actions setup uses.

---

### [P4][consistency] `info` uses `npx scripts-info` though `scripts-info` is a declared dependency

**File(s):** `package.json:9,16,122` (scripts) — pinned at SHA f934d43

#### Problem

`"info": "npx scripts-info"` calls the binary through `npx` even though `scripts-info` is a
`devDependency` (`package.json:266`) already installed in `node_modules/.bin`. The bare
`scripts-info` would resolve the local binary directly; the `npx` wrapper adds a lookup/prompt path
for no reason. Meanwhile `dev:kill` (`npx kill-port …`) and `update:browserslist`
(`npx update-browserslist-db@latest`) *correctly* use `npx` for packages that are **not**
dependencies. So the same `npx` prefix means two different things across the script block, and the
one case that doesn't need it is the one that has it.

#### Proposed solution

Change `info` to `"scripts-info"` (local binary). Leave the genuine on-demand `npx` calls
(`kill-port`, `update-browserslist-db@latest`) as-is, and consider a brief note that `npx` in this
file signals "not a declared dependency".

#### Verification

`npm run info` still prints the script table. `ls node_modules/.bin/scripts-info` confirms the local
binary exists, so `npx` is redundant.

---

### [P4][consistency] Ignore-glob style differs across eslint / dprint / prettier for the same paths

**File(s):** `eslint.config.js:14-20`, `dprint.json:18-21`, `.prettierignore:1-9` (config) — pinned
at SHA f934d43

#### Problem

The three tools spell equivalent excludes differently: eslint uses `**/build/` and blanket
`android/` + `ios/`; dprint uses `web/build`, `android/**/build`, `ios/**/build`; `.prettierignore`
uses `**/build/` and blanket `android/` + `ios/`. The dprint narrowing is *intentional* (it must
still format generated `android/**/*.md`), but nothing in the files says so, so the divergence reads
as an accident and invites a "fix" that would either over- or under-format. Style also varies
(`**/build/` vs `web/build`) for what is meant to be the same directory.

#### Proposed solution

Normalize the glob form where the intent is identical, and add a one-line comment in `dprint.json`
explaining why its `android`/`ios` excludes are build-only (to keep formatting generated markdown
under those trees). This turns an apparent inconsistency into documented intent.

#### Verification

`npm run lint`, `npm run format:check`, `npm run format:md:check` all pass unchanged after
normalization — proving the globs were equivalent where merged and deliberately different where
commented.

---

### [P4][consistency] `.vscode/settings.json` wires a formatter only for markdown, not for code

**File(s):** `.vscode/settings.json:1-7`, `.vscode/extensions.json:1-3` (editor config) — pinned at
SHA f934d43

#### Problem

`extensions.json` recommends `dprint.dprint`, `esbenp.prettier-vscode`, and `svelte.svelte-vscode`,
but `settings.json` sets `editor.defaultFormatter` only for `[markdown]` (→ dprint). It never sets
Prettier as the default formatter for `.ts`/`.js`/`.json`/`.svelte`, nor `editor.formatOnSave`. A
contributor who installs the recommended extensions still gets no Prettier-on-save for code and may
default to VS Code's built-in formatter, producing diffs `format:check` then rejects.

#### Proposed solution

Add `editor.defaultFormatter: "esbenp.prettier-vscode"` for `[typescript]`/`[javascript]`/`[json]`
and `svelte.svelte-vscode` for `[svelte]`, plus `editor.formatOnSave: true`, so the committed
workspace settings match the CI formatters end-to-end.

#### Verification

Open a `.ts` file in VS Code with the recommended extensions and save an intentionally mis-formatted
line; today nothing reformats it. After the change, save reformats to match `npm run format:check`.

---
